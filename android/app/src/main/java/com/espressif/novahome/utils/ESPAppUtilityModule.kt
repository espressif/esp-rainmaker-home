/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */
package com.espressif.novahome.utils

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.pm.PackageManager
import android.os.Build
import android.view.View
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class ESPAppUtilityModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx), ReactPackage {

    override fun getName(): String = "ESPAppUtilityModule"

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = listOf(this).toMutableList()

    private fun has(permission: String): Boolean =
        ContextCompat.checkSelfPermission(reactCtx, permission) == PackageManager.PERMISSION_GRANTED

    /**
     * Promise<boolean> — true if app has the runtime perms required to do BLE ops.
     * API 31+: BLUETOOTH_SCAN + BLUETOOTH_CONNECT
     * API 30- : FINE or COARSE location
     */
    @ReactMethod
    fun isBlePermissionGranted(promise: Promise) {
        try {
            val granted = ESPPermissionUtils.isBlePermissionGranted(reactCtx)
            promise.resolve(granted)
        } catch (t: Throwable) {
            promise.reject("ERR_BLE_PERMISSION_CHECK", t)
        }
    }

    /**
     * Synchronous version for internal use by other native modules
     */
    fun isBlePermissionGrantedSync(): Boolean {
        return ESPPermissionUtils.isBlePermissionGranted(reactCtx)
    }

    /**
     * Promise<boolean> — true if Location runtime permission is granted.
     */
    @ReactMethod
    fun isLocationPermissionGranted(promise: Promise) {
        try {
            val granted = ESPPermissionUtils.isLocationPermissionGranted(reactCtx)
            promise.resolve(granted)
        } catch (t: Throwable) {
            promise.reject("ERR_LOCATION_PERMISSION_CHECK", t)
        }
    }

    /**
     * Synchronous version for internal use by other native modules
     */
    fun isLocationPermissionGrantedSync(): Boolean {
        return ESPPermissionUtils.isLocationPermissionGranted(reactCtx)
    }

    /**
     * (Optional) Promise<boolean> — true if Location services are ON.
     * Useful on Android 11 and below for BLE scanning behaviors.
     */
    @ReactMethod
    fun isLocationServicesEnabled(promise: Promise) {
        try {
            val enabled = ESPPermissionUtils.isLocationServicesEnabled(reactCtx)
            promise.resolve(enabled)
        } catch (t: Throwable) {
            promise.resolve(false)
        }
    }

    /**
     * Synchronous version for internal use by other native modules
     */
    fun isLocationServicesEnabledSync(): Boolean {
        return ESPPermissionUtils.isLocationServicesEnabled(reactCtx)
    }


    /**
     * Promise<boolean> — true if Bluetooth is enabled at the system level.
     */
    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        try {
            val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
            val enabled = bluetoothAdapter?.isEnabled == true
            promise.resolve(enabled)
        } catch (t: Throwable) {
            promise.resolve(false)
        }
    }

    /**
     * (Optional) Mirrors iOS’s requestAllPermissions().
     * Triggers OS dialogs for the minimal set required on this API level.
     */
    @ReactMethod
    fun requestAllPermissions() {
        val activity = currentActivity as? PermissionAwareActivity ?: return
        
        val toRequest = mutableListOf<String>().apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (!has(Manifest.permission.BLUETOOTH_SCAN)) add(Manifest.permission.BLUETOOTH_SCAN)
                if (!has(Manifest.permission.BLUETOOTH_CONNECT)) add(Manifest.permission.BLUETOOTH_CONNECT)
            } else {
                if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }
        
        if (toRequest.isNotEmpty()) {
            activity.requestPermissions(
                toRequest.toTypedArray(),
                64001,
                PermissionListener { _, _, _ -> true }
            )
        }
    }
}
