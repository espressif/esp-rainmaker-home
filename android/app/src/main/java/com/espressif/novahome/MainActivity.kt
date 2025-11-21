/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import com.espressif.novahome.notification.ESPNotificationQueue
import com.espressif.novahome.utils.ESPAppUtilityModule
import com.espressif.novahome.utils.ESPPermissionUtils
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import expo.modules.ReactActivityDelegateWrapper
import expo.modules.splashscreen.SplashScreenManager
import com.espressif.novahome.notification.ESPNotificationHelper

class MainActivity : ReactActivity() {

    private val NOTIFICATION_PERMISSION_CODE = 123
    private val REQUEST_ACCESS_FINE_LOCATION = 2
    private val REQUEST_ENABLE_BLUETOOTH = 100
    private var appUtilityModule: ESPAppUtilityModule? = null

    override fun onCreate(savedInstanceState: Bundle?) {

        WindowCompat.setDecorFitsSystemWindows(window, false)

        SplashScreenManager.registerOnActivity(this)
        super.onCreate(null)
        ESPNotificationHelper.createNotificationChannels(this)

        initializeESPAppUtilityModule()

        FirebaseApp.initializeApp(this)
        FirebaseMessaging.getInstance().isAutoInitEnabled = false

        checkPermissions()
        enableBluetoothIfNeeded()
        checkLocationServicesEnabled()

//        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        if (appUtilityModule == null) {
            initializeESPAppUtilityModule()
        }
    }

    /**
     * Initialize ESPAppUtilityModule when React Native context becomes available
     * This method can be called multiple times safely and works with both old and new React Native architectures
     */
    private fun initializeESPAppUtilityModule() {
        if (appUtilityModule != null) {
            return
        }

        try {
            val reactApplication = application as? ReactApplication
            if (reactApplication != null) {
                val reactNativeHost = reactApplication.reactNativeHost

                try {
                    val reactInstanceManager = reactNativeHost.reactInstanceManager
                    val reactContext = reactInstanceManager.currentReactContext
                    if (reactContext != null) {
                        val appContext = reactContext as ReactApplicationContext
                        ESPNotificationQueue.setReactContext(appContext)
                        appUtilityModule = ESPAppUtilityModule(appContext)

                        runOnUiThread {
                            checkPermissions()
                            checkLocationServicesEnabled()
                        }
                        return
                    }
                } catch (e: Exception) {
                    // React Native context not ready, will retry later
                }
            }
        } catch (e: Exception) {
            // Silent fail - app will use fallback permission checks
        }
    }

    /**
     * Helper method to check permissions using the actual ESPAppUtilityModule
     */
    private fun checkPermissionsWithUtilityModule(onComplete: (bleGranted: Boolean, locationGranted: Boolean) -> Unit) {
        val bleGranted = if (appUtilityModule != null) {
            appUtilityModule!!.isBlePermissionGrantedSync()
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                ContextCompat.checkSelfPermission(
                    this, Manifest.permission.BLUETOOTH_SCAN
                ) == PackageManager.PERMISSION_GRANTED && ContextCompat.checkSelfPermission(
                    this, Manifest.permission.BLUETOOTH_CONNECT
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                ContextCompat.checkSelfPermission(
                    this, Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(
                    this, Manifest.permission.ACCESS_COARSE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
            }
        }

        val locationGranted = if (appUtilityModule != null) {
            appUtilityModule!!.isLocationPermissionGrantedSync()
        } else {
            ContextCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }

        onComplete(bleGranted, locationGranted)
    }

//    override fun onNewIntent(intent: Intent?) {
//        super.onNewIntent(intent)
//        intent?.let { handleIntent(it) }
//    }
//
//    private fun handleIntent(intent: Intent) {
//
//        handleNocGenerationStep(intent)
//
//        if (intent.action == Intent.ACTION_VIEW && intent.data != null) {
//            val url = intent.data.toString()
//        }
//    }
//
//    // NOC generation step handler
//    private fun handleNocGenerationStep(intent: Intent) {
//        val nocGenerationStep = intent.getBooleanExtra("NOC_GENERATION_STEP", false)
//    }

    private fun checkPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        // Check notification permissions directly
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        // Use utility module for BLE and location permission checks
        checkPermissionsWithUtilityModule { bleGranted, locationGranted ->
            if (!locationGranted) {
                permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
            }

            if (!bleGranted) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    permissionsToRequest.add(Manifest.permission.BLUETOOTH_SCAN)
                    permissionsToRequest.add(Manifest.permission.BLUETOOTH_CONNECT)
                } else {
                    // For older Android versions, BLE requires location permission
                    if (!permissionsToRequest.contains(Manifest.permission.ACCESS_FINE_LOCATION)) {
                        permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
                    }
                }
            }

            if (permissionsToRequest.isNotEmpty()) {
                ActivityCompat.requestPermissions(
                    this, permissionsToRequest.toTypedArray(), REQUEST_ACCESS_FINE_LOCATION
                )
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun enableBluetoothIfNeeded() {
        // First check if we have the required permissions
        val hasBluetoothPermissions = if (appUtilityModule != null) {
            appUtilityModule!!.isBlePermissionGrantedSync()
        } else {
            ESPPermissionUtils.isBlePermissionGranted(this)
        }

        if (!hasBluetoothPermissions) {
            return
        }

        val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
        if (bluetoothAdapter != null && !bluetoothAdapter.isEnabled) {
            val enableBtIntent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
            startActivityForResult(enableBtIntent, REQUEST_ENABLE_BLUETOOTH)
        }
    }

    private fun checkLocationServicesEnabled() {
        val isEnabled = if (appUtilityModule != null) {
            appUtilityModule!!.isLocationServicesEnabledSync()
        } else {
            try {
                val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
                locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) || locationManager.isProviderEnabled(
                    LocationManager.NETWORK_PROVIDER
                )
            } catch (_: Throwable) {
                false
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == REQUEST_ACCESS_FINE_LOCATION) {
            val deniedPermissions = permissions.zip(grantResults.toTypedArray())
                .filter { it.second != PackageManager.PERMISSION_GRANTED }.map { it.first }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == REQUEST_ENABLE_BLUETOOTH) {
            if (resultCode == RESULT_OK) {
                Log.d("Bluetooth", "Bluetooth enabled successfully.")
            } else {
                Log.d("Bluetooth", "Bluetooth enable request denied.")
            }
        }
    }

    override fun getMainComponentName(): String = "main"

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return ReactActivityDelegateWrapper(
            this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, object : DefaultReactActivityDelegate(
                this, mainComponentName, fabricEnabled
            ) {})
    }

    override fun invokeDefaultOnBackPressed() {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
            if (!moveTaskToBack(false)) {
                super.invokeDefaultOnBackPressed()
            }
            return
        }
        super.invokeDefaultOnBackPressed()
    }

}
