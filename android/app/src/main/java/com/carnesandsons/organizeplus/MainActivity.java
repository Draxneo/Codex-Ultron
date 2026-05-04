package com.carnesandsons.organizeplus;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — Capacitor BridgeActivity entry point for the Android shell.
 *
 * Custom plugins registered here:
 *   - UoPermissionsPlugin: bridges Android-12+ runtime permissions (currently
 *     just BLUETOOTH_CONNECT) to JS so the system dialog fires from
 *     useNativePermissionsBootstrap.ts. The Capgo Twilio Voice plugin only
 *     requests RECORD_AUDIO; without this bridge, the AudioSwitch in the
 *     Twilio SDK can't enumerate paired Bluetooth devices and headsets/car
 *     kits never appear as routable audio targets.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom plugins BEFORE super.onCreate(). Capacitor's bridge
        // initializes during super.onCreate() and reads the registered list.
        registerPlugin(UoPermissionsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
