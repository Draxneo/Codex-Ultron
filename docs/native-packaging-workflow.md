# Native Packaging Workflow

UltraOffice ships from one React/Vite codebase into three shells:

- Web: deployed to Render from `main`.
- Electron: desktop shell for office/dispatch softphone use.
- Capacitor Android: technician mobile shell for truck/field use.

## What Runs On Every Push

The GitHub Actions workflow at `.github/workflows/client-release.yml` runs when `main` changes.

It does four things:

1. Installs dependencies with `npm ci`.
2. Runs `npx tsc --noEmit`, `npm test`, and `npm run build`.
3. Packages a Windows Electron build and uploads it as a workflow artifact.
4. Builds a Capacitor Android debug APK and uploads it as a workflow artifact.

If the GitHub secret `RENDER_DEPLOY_HOOK_URL` is configured, the workflow also triggers the live Render deploy after the web build passes.

## Local Commands

```bash
npm run build
npm run electron:pack
npm run cap:sync
npm run cap:android:debug
npm run release:clients
```

`release:clients` builds the web bundle once, packages Electron, and builds/syncs Android.

## Auto-Update Strategy

### Web

Render remains the fastest update lane. Push to `main`, the web app updates, and Capacitor currently points at the live URL in `capacitor.config.ts`.

### Capacitor

The current Capacitor config loads the live UltraOffice URL, so most UI/business-logic updates land immediately without rebuilding the APK.

Use a new APK when native permissions, plugins, Android Auto companion code, package IDs, icons, or store metadata change.

For a proper app-store-safe live update channel later, use a Capacitor live update provider such as Ionic Appflow or another signed live-update service. That lets us control channels and rollback without changing the native binary every time.

### Electron

The current workflow produces a packaged desktop app. True background auto-update for Electron needs a signed installer and update feed. Windows and macOS updates should be handled with a signed build pipeline before office-wide rollout.

Until signing is configured, treat the uploaded Electron artifact as the install/update package.

## Android Auto Reality Check

There are two different goals:

1. **Truck audio/microphone**: the Capacitor app can use Bluetooth audio like a normal phone app. This is the fastest way for techs to talk to Jarvis from the truck.
2. **Android Auto screen integration**: this must be a native Android Auto companion surface using Google's Android for Cars templates. A normal web dashboard cannot simply run on the Android Auto screen.

For Monday readiness, prioritize truck Bluetooth audio and the mobile Jarvis push-to-talk flow.

For Android Auto later, build a small native companion that only exposes driving-safe actions:

- Start or stop Jarvis voice memo.
- Read the next job summary aloud.
- Navigate to the current job.
- Call or text the assigned customer through approved car-safe flows.
- Avoid showing the full app, cart, CRM, or dashboards on the car screen.
