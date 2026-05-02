const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, powerSaveBlocker, powerMonitor, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let phoneWindow = null;
let csrWindow = null;
let tray = null;
let pendingPhoneMessages = [];
let pendingCsrMessages = [];
// Last known CSR context — used so a freshly-opened CSR window can be
// rehydrated even if the phone window only sends partial updates later.
let lastCsrContext = { phone: '', callerName: '', callSid: '' };
let isQuitting = false;
let powerSaveBlockerId = null;
let appSuspensionBlockerId = null;
let telephonyDesktopPolicy = {
  isHandoff: false,
  softphoneEnabled: false,
  callTargets: null,
};

/** Returns the secondary display if available, otherwise primary. */
function getSecondaryDisplay() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find(d => d.id !== primary.id);
  return secondary || primary;
}

const DEV_SERVER_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:8080';
const LIVE_APP_URL = process.env.ELECTRON_APP_URL || 'https://codex-ultron.onrender.com';
const IS_DEV = !require('fs').existsSync(path.join(__dirname, '..', 'dist', 'index.html'))
  || process.env.ELECTRON_DEV === '1';
const DEFAULT_ULTRAPHONE_URL = 'https://codex-ultron.onrender.com';

function getDefaultCallTargets() {
  return {
    webUrl: `${DEFAULT_ULTRAPHONE_URL}/calls`,
    appUrl: 'ultraphone://calls',
  };
}

function syncTelephonyDesktopPolicy(payload = {}) {
  telephonyDesktopPolicy = {
    isHandoff: Boolean(payload.isHandoff),
    softphoneEnabled: Boolean(payload.softphoneEnabled),
    callTargets: {
      ...getDefaultCallTargets(),
      ...(payload.callTargets || {}),
    },
  };

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }

  syncAppSuspensionBlocker();
  createTray();
}

function syncAppSuspensionBlocker() {
  try {
    const shouldBlock = Boolean(telephonyDesktopPolicy.softphoneEnabled) && !telephonyDesktopPolicy.isHandoff;

    if (shouldBlock) {
      if (appSuspensionBlockerId === null || !powerSaveBlocker.isStarted(appSuspensionBlockerId)) {
        appSuspensionBlockerId = powerSaveBlocker.start('prevent-app-suspension');
        console.log('[Power] prevent-app-suspension started, id=', appSuspensionBlockerId);
      }
      return;
    }

    if (appSuspensionBlockerId !== null && powerSaveBlocker.isStarted(appSuspensionBlockerId)) {
      powerSaveBlocker.stop(appSuspensionBlockerId);
      console.log('[Power] prevent-app-suspension stopped, id=', appSuspensionBlockerId);
    }
    appSuspensionBlockerId = null;
  } catch (e) {
    console.warn('[Power] Failed to sync app-suspension blocker:', e);
  }
}

function syncCallPowerBlocker(status) {
  try {
    const shouldBlock = status === 'ringing' || status === 'connecting' || status === 'on-call';

    if (shouldBlock) {
      if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
        console.log('[Power] prevent-display-sleep started for active call, id=', powerSaveBlockerId);
      }
      return;
    }

    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
      console.log('[Power] prevent-display-sleep stopped after call, id=', powerSaveBlockerId);
    }
    powerSaveBlockerId = null;
  } catch (e) {
    console.warn('[Power] Failed to sync call power blocker:', e);
  }
}

function openPrimaryTelephonySurface() {
  if (telephonyDesktopPolicy.isHandoff) {
    launchUltraphone(telephonyDesktopPolicy.callTargets || getDefaultCallTargets());
    return;
  }

  ensurePhoneWindow();
}

function getAppUrl(search = '') {
  if (IS_DEV) {
    return `${DEV_SERVER_URL}${search ? '/' + search.replace(/^\?/, '?') : ''}`;
  }
  return `${LIVE_APP_URL.replace(/\/$/, '')}${search ? '/' + search.replace(/^\?/, '?') : ''}`;
}

function getPhoneWindowUrl({ cacheBust = false } = {}) {
  const params = new URLSearchParams({ view: 'softphone', desktop: '1' });
  if (cacheBust) params.set('shellts', String(Date.now()));
  return getAppUrl(`?${params.toString()}`);
}

function phoneWindowNeedsRefresh(win) {
  if (!win || win.isDestroyed()) return true;

  try {
    const currentUrl = win.webContents?.getURL?.() || '';
    if (!currentUrl) return true;

    const parsed = new URL(currentUrl);
    const expectedOrigin = new URL(IS_DEV ? DEV_SERVER_URL : LIVE_APP_URL).origin;

    return parsed.origin !== expectedOrigin || parsed.searchParams.get('view') !== 'softphone';
  } catch {
    return true;
  }
}

function launchUltraphone(payload = {}) {
  const webUrl = payload.webUrl || `${DEFAULT_ULTRAPHONE_URL}/calls`;
  const appUrl = payload.appUrl || 'ultraphone://calls';

  try {
    shell.openExternal(appUrl).catch(() => shell.openExternal(webUrl));
  } catch (e) {
    console.warn('[Ultraphone] Deep link launch failed:', e);
    try {
      shell.openExternal(webUrl);
    } catch (webErr) {
      console.warn('[Ultraphone] Web fallback launch failed:', webErr);
    }
  }
}

function flushPhoneMessages() {
  if (!phoneWindow || phoneWindow.isDestroyed() || !phoneWindow.webContents) return;
  for (const message of pendingPhoneMessages) {
    phoneWindow.webContents.send(message.channel, ...message.args);
  }
  pendingPhoneMessages = [];
}

function sendToPhoneWindow(channel, ...args) {
  if (!phoneWindow || phoneWindow.isDestroyed()) return;

  const isLoaded = phoneWindow.webContents && !phoneWindow.webContents.isLoading();
  if (isLoaded) {
    phoneWindow.webContents.send(channel, ...args);
  } else {
    pendingPhoneMessages.push({ channel, args });
  }
}

/**
 * Force a window to the foreground on Windows.
 *
 * Windows blocks `BrowserWindow.focus()` from stealing focus from another
 * foreground app — it just flashes the taskbar icon. The standard workaround
 * is to briefly toggle `alwaysOnTop`, which the OS treats as a legitimate
 * activation request, then drop it back. We also flash the frame as a
 * fallback in case the user is in a fullscreen app.
 */
function forceForegroundWindow(win) {
  if (!win || win.isDestroyed()) return;
  try {
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    win.setSkipTaskbar(false);
    // The toggle trick — works on Windows and macOS.
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
    win.focus();
    // Drop alwaysOnTop after the OS has actually raised it so the user can
    // still cover it with other windows once they've acknowledged the call.
    setTimeout(() => {
      if (!win.isDestroyed()) win.setAlwaysOnTop(false);
    }, 600);
    // Flash taskbar as a backup attention cue.
    if (typeof win.flashFrame === 'function') {
      win.flashFrame(true);
      setTimeout(() => {
        if (!win.isDestroyed()) win.flashFrame(false);
      }, 4000);
    }
  } catch (e) {
    console.warn('[forceForegroundWindow] failed:', e);
  }
}

/** Ensure the phone window exists, is visible, and focused. Returns the window. */
function ensurePhoneWindow() {
  if (phoneWindow && !phoneWindow.isDestroyed()) {
    const wasHidden = !phoneWindow.isVisible();
    if (phoneWindowNeedsRefresh(phoneWindow)) {
      phoneWindow.loadURL(getPhoneWindowUrl({ cacheBust: true }));
    }
    forceForegroundWindow(phoneWindow);
    // If we just un-hid it, ask the renderer to run a non-destructive
    // health check so a stale Twilio Device gets re-registered without
    // a manual page refresh.
    if (wasHidden) {
      sendToPhoneWindow('phone-window-shown', { reason: 'show' });
    }
    return phoneWindow;
  }
  return createPhoneWindow();
}

function createMainWindow() {
  const display = getSecondaryDisplay();
  const { x, y, width: dw, height: dh } = display.workArea;

  mainWindow = new BrowserWindow({
    x: x + Math.round((dw - 1536) / 2),
    y: y + Math.round((dh - 864) / 2),
    width: 1536,
    height: 864,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0b0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      // Allow JARVIS announcer TTS / ringtones to play without first user gesture
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  mainWindow.loadURL(getAppUrl());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createPhoneWindow() {
  if (phoneWindow && !phoneWindow.isDestroyed()) {
    forceForegroundWindow(phoneWindow);
    return phoneWindow;
  }

  pendingPhoneMessages = [];

  const display = getSecondaryDisplay();
  const { x, y, width: dw, height: dh } = display.workArea;

  phoneWindow = new BrowserWindow({
    x: x + dw - 540,
    y: y + Math.round((dh - 880) / 2),
    width: 520,
    height: 880,
    minWidth: 420,
    minHeight: 700,
    resizable: true,
    show: false,
    alwaysOnTop: false,
    title: 'Deluxe Phone',
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  phoneWindow.loadURL(getPhoneWindowUrl({ cacheBust: true }));

  phoneWindow.webContents.on('did-finish-load', () => {
    flushPhoneMessages();
  });

  phoneWindow.once('ready-to-show', () => {
    phoneWindow?.show();
    phoneWindow?.focus();
    mainWindow?.webContents.send('phone-popped-out');
  });

  phoneWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      phoneWindow.hide();
      mainWindow?.webContents.send('phone-popped-in');
      return;
    }
    phoneWindow = null;
    pendingPhoneMessages = [];
  });

  // Fire a recovery event whenever the window is shown or focused after
  // being hidden/blurred. The renderer uses this to non-destructively
  // re-register Twilio if the Device went stale.
  phoneWindow.on('show', () => {
    sendToPhoneWindow('phone-window-shown', { reason: 'show' });
  });
  phoneWindow.on('focus', () => {
    sendToPhoneWindow('phone-window-shown', { reason: 'focus' });
  });

  return phoneWindow;
}

// ── CSR Intake (Post-Call Actions) Window ─────────────────────────────
function flushCsrMessages() {
  if (!csrWindow || csrWindow.isDestroyed() || !csrWindow.webContents) return;
  for (const message of pendingCsrMessages) {
    csrWindow.webContents.send(message.channel, ...message.args);
  }
  pendingCsrMessages = [];
}

function sendToCsrWindow(channel, ...args) {
  if (!csrWindow || csrWindow.isDestroyed()) return;
  const isLoaded = csrWindow.webContents && !csrWindow.webContents.isLoading();
  if (isLoaded) {
    csrWindow.webContents.send(channel, ...args);
  } else {
    pendingCsrMessages.push({ channel, args });
  }
}

/**
 * Ensure the CSR Intake popup exists. Always merges new context into the
 * lastCsrContext so the popup always has the freshest phone/name/sid.
 */
function ensureCsrWindow(phone, callerName, callSid) {
  // Merge — only overwrite fields that have a value.
  lastCsrContext = {
    phone: phone || lastCsrContext.phone || '',
    callerName: callerName || lastCsrContext.callerName || '',
    callSid: callSid || lastCsrContext.callSid || '',
  };

  if (csrWindow && !csrWindow.isDestroyed()) {
    csrWindow.show();
    if (csrWindow.isMinimized()) csrWindow.restore();
    csrWindow.focus();
    // Push the freshest SID/name in case the window opened before Twilio
    // assigned a CallSid.
    sendToCsrWindow('csr-update', { ...lastCsrContext });
    return csrWindow;
  }

  pendingCsrMessages = [];

  const display = getSecondaryDisplay();
  const { x, y, width: dw, height: dh } = display.workArea;

  const params = new URLSearchParams();
  if (lastCsrContext.phone) params.set('phone', lastCsrContext.phone);
  if (lastCsrContext.callerName) params.set('name', lastCsrContext.callerName);
  if (lastCsrContext.callSid) params.set('sid', lastCsrContext.callSid);
  const search = `?view=csr-intake${params.toString() ? '&' + params.toString() : ''}`;

  csrWindow = new BrowserWindow({
    x: x + dw - 440 - 500, // Sit to the LEFT of the phone window
    y: y + Math.round((dh - 800) / 2),
    width: 480,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    resizable: true,
    show: false,
    title: 'Call Actions',
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  csrWindow.loadURL(getAppUrl(search));

  csrWindow.webContents.once('did-finish-load', () => {
    flushCsrMessages();
    // Re-emit context immediately on load so the renderer has it even if
    // the URL params got dropped.
    sendToCsrWindow('csr-update', { ...lastCsrContext });
  });

  csrWindow.once('ready-to-show', () => {
    csrWindow?.showInactive(); // Don't steal focus from phone window
  });

  csrWindow.on('closed', () => {
    csrWindow = null;
    pendingCsrMessages = [];
  });

  return csrWindow;
}

// ── Custom Toast Notification System ──────────────────────────────────
const TOAST_WIDTH = 380;
const TOAST_HEIGHT = 110;
const TOAST_GAP = 12;
const TOAST_DURATION = 6000;
let activeToasts = []; // { win, timer, slot }

function getToastHtml({ title, body, icon, variant }) {
  const accentColor = variant === 'destructive' ? '#ef4444'
    : variant === 'call' ? '#22c55e'
    : '#6366f1';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  overflow:hidden;-webkit-app-region:no-drag;user-select:none;cursor:default;
}
.toast{
  width:${TOAST_WIDTH - 16}px;margin:8px;
  background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);
  border:1px solid rgba(255,255,255,.08);
  border-left:3px solid ${accentColor};
  border-radius:12px;padding:14px 16px;
  box-shadow:0 8px 32px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04);
  display:flex;align-items:flex-start;gap:12px;
  animation:slideIn .3s cubic-bezier(.16,1,.3,1);
  backdrop-filter:blur(20px);
}
@keyframes slideIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
.icon{
  width:36px;height:36px;border-radius:10px;
  background:${accentColor}22;color:${accentColor};
  display:flex;align-items:center;justify-content:center;
  font-size:18px;flex-shrink:0;
}
.text{flex:1;min-width:0}
.title{color:#f1f5f9;font-size:13px;font-weight:600;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.body{color:#94a3b8;font-size:12px;line-height:1.4;margin-top:3px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.close{
  width:20px;height:20px;border-radius:6px;border:none;
  background:transparent;color:#64748b;font-size:14px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.close:hover{background:rgba(255,255,255,.08);color:#e2e8f0}
.progress{
  position:absolute;bottom:0;left:12px;right:12px;height:2px;
  border-radius:1px;background:rgba(255,255,255,.06);overflow:hidden;
}
.progress-bar{
  height:100%;background:${accentColor};border-radius:1px;
  animation:countdown ${TOAST_DURATION}ms linear forwards;
}
@keyframes countdown{from{width:100%}to{width:0%}}
</style></head><body>
<div class="toast" onclick="window.close()">
  <div class="icon">${icon || '🔔'}</div>
  <div class="text">
    <div class="title">${escapeHtml(title || '')}</div>
    <div class="body">${escapeHtml(body || '')}</div>
  </div>
  <button class="close" onclick="event.stopPropagation();window.close()">✕</button>
  <div class="progress"><div class="progress-bar"></div></div>
</div>
</body></html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function findFreeSlot() {
  const usedSlots = activeToasts.map(t => t.slot);
  for (let i = 0; i < 8; i++) {
    if (!usedSlots.includes(i)) return i;
  }
  return 0;
}

function showToast({ title, body, icon, variant }) {
  const display = getSecondaryDisplay();
  const { x, y, width: dw, height: dh } = display.workArea;
  const slot = findFreeSlot();
  const toastX = x + dw - TOAST_WIDTH - 12;
  const toastY = y + dh - (TOAST_HEIGHT + TOAST_GAP) * (slot + 1);

  const win = new BrowserWindow({
    x: toastX,
    y: toastY,
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const html = getToastHtml({ title, body, icon, variant });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  win.once('ready-to-show', () => {
    win.showInactive();
  });

  const entry = { win, slot, timer: null };
  activeToasts.push(entry);

  entry.timer = setTimeout(() => {
    dismissToast(entry);
  }, TOAST_DURATION);

  win.on('closed', () => {
    if (entry.timer) clearTimeout(entry.timer);
    activeToasts = activeToasts.filter(t => t !== entry);
  });
}

function createTray() {
  if (tray && !tray.isDestroyed()) return tray;
  // Create a 16x16 phone icon programmatically
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2ElEQVQ4T6WTwQ3CMAyGf1dwBEZgBEZgBDgCR2AERmAERoCb1aoOcZy0lXqK4/j77DgCM8fKfH4YQNIFwB3Ah5lf0+aSdANwAvBi5iffs0h6ADgCeDLzLRXFBpLOAK4APsz8Lgskab4n6bR0RNIi2QF4A3iZ+bNJIOlYq5j5lBRI2oexmHmbBAndMBYzH3oCSduYxcy7hUDSJvSI+cPMSUDSegxm3vVdkvYA7r0jqvKSEfkm08rSAEmrpP0/jmkek5VEUk5+C2kfKkn70E9m0+0y/ov8AH1OXBGR6ii0AAAAAElFTkSuQmCC'
  );

  tray = new Tray(icon);
  tray.setToolTip('Deluxe Phone — Active');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: telephonyDesktopPolicy.isHandoff ? 'Open Ultraphone' : 'Open Phone',
      click: () => openPrimaryTelephonySurface(),
    },
    {
      label: 'Show Main Window',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click tray icon → open the current primary telephony surface
  tray.on('click', () => {
    openPrimaryTelephonySurface();
  });

  return tray;
}

function dismissToast(entry) {
  if (entry.timer) clearTimeout(entry.timer);
  if (entry.win && !entry.win.isDestroyed()) {
    entry.win.close();
  }
  activeToasts = activeToasts.filter(t => t !== entry);
}

app.whenReady().then(() => {
  // Power management is enabled only when the logged-in user has desk calls on.
  // That keeps the phone reachable without forcing the monitor to stay awake.
  syncAppSuspensionBlocker();

  // On resume / unlock, tell the renderer to re-warm audio + re-register Twilio
  try {
    powerMonitor.on('resume', () => {
      console.log('[Power] System resumed — notifying renderers');
      mainWindow?.webContents.send('power-resume');
      phoneWindow?.webContents.send('power-resume');
    });
    powerMonitor.on('unlock-screen', () => {
      console.log('[Power] Screen unlocked — notifying renderers');
      mainWindow?.webContents.send('power-resume');
      phoneWindow?.webContents.send('power-resume');
    });
  } catch (e) {
    console.warn('[Power] powerMonitor unavailable:', e);
  }

  createMainWindow();

  // Auto-launch the phone window on startup so the Twilio Device is always ready
  createPhoneWindow();

  // Create system tray icon
  createTray();

  // ── Toast IPC ──
  ipcMain.on('show-toast', (_event, payload) => {
    showToast(payload || {});
  });

  // ── OS-level audible beep fallback (bypasses any renderer audio gating) ──
  ipcMain.on('play-system-beep', () => {
    try {
      shell.beep();
    } catch (e) {
      console.warn('[Beep] shell.beep failed:', e);
    }
  });

  // ── Wake the screen / pop the phone window for an incoming call ──
  ipcMain.on('incoming-call-wake', (_event, payload) => {
    try {
      shell.beep();

      if (payload?.shouldLaunchUltraphone) {
        launchUltraphone(payload || {});
      } else if (phoneWindow && !phoneWindow.isDestroyed()) {
        // Phone is popped out — bring that window forward
        forceForegroundWindow(phoneWindow);
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        // Phone strip is embedded in the main window — bring it forward
        forceForegroundWindow(mainWindow);
      } else {
        ensurePhoneWindow();
      }
    } catch (e) {
      console.warn('[Wake] incoming-call-wake failed:', e);
    }
  });

  // Legacy pop-out button — just ensure the window is open
  ipcMain.on('pop-out-phone', () => {
    ensurePhoneWindow();
  });

  // Main window requests the phone window be open/visible (e.g. before dialing)
  ipcMain.on('ensure-phone-window', () => {
    ensurePhoneWindow();
  });

  ipcMain.on('launch-ultraphone', (_event, payload) => {
    launchUltraphone(payload || {});
  });

  ipcMain.on('telephony-policy-updated', (_event, payload) => {
    syncTelephonyDesktopPolicy(payload || {});
  });

  ipcMain.on('call-status-change', (_event, status) => {
    syncCallPowerBlocker(status);
  });

  // Relay a dial request from the main window to the phone window
  ipcMain.on('dial-number', (_event, payload) => {
    const target = ensurePhoneWindow();
    if (target && !target.isDestroyed()) {
      sendToPhoneWindow('dial-number', payload);
    }
  });

  ipcMain.on('screen-pop', (_event, payload) => {
    if (payload?.shouldLaunchUltraphone) {
      launchUltraphone(payload || {});
    } else {
      const target = ensurePhoneWindow();
      if (target && !target.isDestroyed()) {
        sendToPhoneWindow('screen-pop', payload);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    }
  });

  ipcMain.on('switch-tab', (_event, payload) => {
    const { tab, phone } = payload || {};
    const target = ensurePhoneWindow();
    if (target && !target.isDestroyed()) {
      sendToPhoneWindow('switch-tab', tab, phone);
    }
  });

  // ── CSR Intake / Post-Call Actions popup ──────────────────────────────
  ipcMain.on('open-csr-intake', (_event, payload) => {
    const { phone = '', callerName = '', callSid = '' } = payload || {};
    ensureCsrWindow(phone, callerName, callSid);
  });

  ipcMain.on('csr-call-ended', (_event, payload) => {
    const { callSid = '' } = payload || {};
    sendToCsrWindow('csr-call-ended', { callSid });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  try {
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
    if (appSuspensionBlockerId !== null && powerSaveBlocker.isStarted(appSuspensionBlockerId)) {
      powerSaveBlocker.stop(appSuspensionBlockerId);
    }
  } catch {}
});

app.on('window-all-closed', () => {
  // Don't quit — tray keeps the process alive
  // Only quit on non-mac if tray is gone (shouldn't happen)
  if (!tray) {
    if (process.platform !== 'darwin') app.quit();
  }
});
