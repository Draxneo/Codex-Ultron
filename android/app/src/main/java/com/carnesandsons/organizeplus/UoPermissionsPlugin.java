/*
 * UoPermissionsPlugin.java
 *
 * SYSTEM CONNECTIONS: registered in MainActivity.onCreate(). Called from
 * src/hooks/useNativePermissionsBootstrap.ts (web layer) via Capacitor's
 * registerPlugin("UoPermissions") bridge.
 *
 * SITS ON: BridgeActivity (Capacitor 8). Android only.
 *
 * Why this plugin exists:
 *   The Capgo Twilio Voice plugin only requests RECORD_AUDIO at runtime — it
 *   never asks for BLUETOOTH_CONNECT. On Android 12+ (API 31+), the Twilio
 *   AudioSwitch needs BLUETOOTH_CONNECT granted at runtime to enumerate
 *   Bluetooth devices. Without it, paired headsets and car kits stay
 *   invisible to the SDK — Jonathan's Shokz headset and his truck both
 *   showed as not-an-option when trying to take a call. (2026-05-03)
 *
 *   Declaring the permission in AndroidManifest.xml is necessary but NOT
 *   sufficient — runtime permissions on API 31+ require an explicit
 *   ActivityCompat.requestPermissions() call from the foreground activity,
 *   which fires the system dialog the user must accept.
 *
 *   This tiny plugin exposes that flow to JS so the standard Capacitor
 *   permission dialog fires when a tech first opens the app.
 *
 * Public methods:
 *   - checkBluetoothPermission() -> { granted: boolean }
 *   - requestBluetoothPermission() -> { granted: boolean }
 *
 * Behavior on Android 11 and below:
 *   BLUETOOTH_CONNECT didn't exist before API 31. Both methods return
 *   { granted: true } as a no-op so JS doesn't have to special-case the
 *   API level — the legacy BLUETOOTH permission is auto-granted at install.
 */
package com.carnesandsons.organizeplus;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "UoPermissions",
    permissions = {
        @Permission(
            strings = { Manifest.permission.BLUETOOTH_CONNECT },
            alias = "bluetooth"
        )
    }
)
public class UoPermissionsPlugin extends Plugin {

    /**
     * Synchronous check — returns true if the BLUETOOTH_CONNECT permission is
     * already granted. On Android 11 and below the permission concept doesn't
     * exist; legacy BLUETOOTH is install-time auto-granted, so we report true.
     */
    @PluginMethod
    public void checkBluetoothPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", isBluetoothGranted());
        call.resolve(result);
    }

    /**
     * Triggers the system permission dialog for BLUETOOTH_CONNECT if not yet
     * granted. On older Android versions this is a no-op that resolves
     * granted=true. The dialog runs on the activity's UI thread; the
     * @PermissionCallback below is invoked once the user picks Allow/Deny.
     */
    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        // No runtime prompt needed below API 31 — the modern BLUETOOTH_CONNECT
        // permission was introduced with Android 12. Older OS versions had a
        // single install-time BLUETOOTH permission that's already granted.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (isBluetoothGranted()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        // Fire the system dialog — handleBluetoothCallback() resolves the call
        // on the user's choice.
        requestPermissionForAlias("bluetooth", call, "handleBluetoothCallback");
    }

    /**
     * Capacitor's @PermissionCallback runs when the user accepts/denies the
     * BLUETOOTH_CONNECT prompt. Resolves the original PluginCall with the
     * outcome so JS can branch on it.
     */
    @PermissionCallback
    private void handleBluetoothCallback(PluginCall call) {
        boolean granted = getPermissionState("bluetooth") == PermissionState.GRANTED;
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /**
     * Helper — checks the underlying ContextCompat-level grant state. Used by
     * both checkBluetoothPermission() (sync) and the early-out branch inside
     * requestBluetoothPermission().
     */
    private boolean isBluetoothGranted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.BLUETOOTH_CONNECT
        ) == PackageManager.PERMISSION_GRANTED;
    }
}
