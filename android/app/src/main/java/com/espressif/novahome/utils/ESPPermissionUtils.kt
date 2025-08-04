/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */
package com.espressif.novahome.utils

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * Utility class for centralized permission checking
 * This contains the exact same logic as ESPAppUtilityModule but can be called synchronously
 */
object ESPPermissionUtils {

    /**
     * Check if app has the runtime permissions required to do BLE operations.
     * API 31+: BLUETOOTH_SCAN + BLUETOOTH_CONNECT
     * API 30- : FINE or COARSE location
     */
    fun isBlePermissionGranted(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            has(context, Manifest.permission.BLUETOOTH_SCAN) && has(context, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            has(context, Manifest.permission.ACCESS_FINE_LOCATION) || has(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        }
    }

    /**
     * Check if Location runtime permission is granted.
     */
    fun isLocationPermissionGranted(context: Context): Boolean {
        return has(context, Manifest.permission.ACCESS_FINE_LOCATION) || has(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    }

    /**
     * Check if Location services are enabled.
     * Useful on Android 11 and below for BLE scanning behaviors.
     */
    fun isLocationServicesEnabled(context: Context): Boolean {
        return try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        } catch (_: Throwable) {
            false
        }
    }

    /**
     * Helper function to check if a permission is granted
     */
    private fun has(context: Context, permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }
}
