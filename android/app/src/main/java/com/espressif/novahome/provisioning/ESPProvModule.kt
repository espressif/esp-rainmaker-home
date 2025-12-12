/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

 package com.espressif.novahome.provisioning

 import android.Manifest
 import android.annotation.SuppressLint
 import android.bluetooth.BluetoothAdapter
 import android.bluetooth.BluetoothDevice
 import android.bluetooth.le.ScanResult
 import android.content.Context
 import android.content.Intent
 import android.content.IntentFilter
 import android.provider.Settings
 import android.net.wifi.WifiManager
 import android.os.Build
 import android.os.Handler
 import android.text.TextUtils
 import android.util.Log
 import android.view.View
 import androidx.annotation.RequiresApi
 import androidx.annotation.RequiresPermission
 import androidx.appcompat.app.AlertDialog
 import com.espressif.provisioning.DeviceConnectionEvent
 import com.espressif.provisioning.ESPConstants
 import com.espressif.provisioning.ESPDevice
 import com.espressif.provisioning.ESPProvisionManager
 import com.espressif.provisioning.WiFiAccessPoint
 import com.espressif.provisioning.listeners.BleScanListener
 import com.espressif.provisioning.listeners.ProvisionListener
 import com.espressif.provisioning.listeners.ResponseListener
 import com.espressif.provisioning.listeners.WiFiScanListener
 import com.facebook.react.ReactPackage
 import com.facebook.react.bridge.Arguments
 import com.facebook.react.bridge.NativeModule
 import com.facebook.react.bridge.Promise
 import com.facebook.react.bridge.ReactApplicationContext
 import com.facebook.react.bridge.ReactContextBaseJavaModule
 import com.facebook.react.bridge.ReactMethod
 import com.facebook.react.bridge.WritableMap
 import com.espressif.novahome.utils.ESPAppUtilityModule
 import com.facebook.react.uimanager.ReactShadowNode
 import com.facebook.react.uimanager.ViewManager
 import org.greenrobot.eventbus.EventBus
 import org.greenrobot.eventbus.Subscribe
 import org.greenrobot.eventbus.ThreadMode
 import org.json.JSONException
 import org.json.JSONObject
 import java.util.Base64
 
 /**
  * `ESPProvModule` provides functionality to interact with ESP devices for provisioning and communication.
  * It integrates Bluetooth (BLE) and Wi-Fi transport mechanisms, allowing developers to:
  * - Discover ESP devices.
  * - Establish secure connections.
  * - Configure and provision devices over BLE and SoftAP.
  * - Manage sessions and data exchange.
  *
  * This module is designed for use with React Native applications.
  */
 
 class ESPProvModule(reactContext: ReactApplicationContext) :
     ReactContextBaseJavaModule(reactContext), ReactPackage {
 
     companion object {
         private const val TAG = "ESPProvModule"
         private const val DEVICE_CONNECT_TIMEOUT = 20000L // Connection timeout duration
         const val KEY_SEC_VER = "sec_ver"
         const val SEC_TYPE_0 = 0
         const val SEC_TYPE_1 = 1
         const val SEC_TYPE_2 = 2
         const val ESP_PREFERENCES = "Esp_Preferences"
         const val CAPABILITY_THREAD_SCAN = "thread_scan"
         const val CAPABILITY_THREAD_PROV = "thread_prov"
         const val KEY_USER_NAME_THREAD = "sec2_username_thread"
         const val DEFAULT_SEC2_USER_NAME_THREAD = "threadprov"
         const val CAPABILITY_WIFI_SCAN = "wifi_scan"
         const val CAPABILITY_WIFI_PROV = "wifi_prov"
         const val KEY_USER_NAME_WIFI = "sec2_username_wifi"
         const val DEFAULT_SEC2_USER_NAME_WIFI = "wifiprov"
     }
 
     private val context: Context = reactContext
     override fun getName() = "ESPProvModule" // Name for React Native integration
 
     private val handler = Handler(context.mainLooper) // For connection timeout
     private val appUtilityModule = ESPAppUtilityModule(reactContext) // For permission checks
 
     private val bluetooothDevices =
         HashMap<String, String>() // Key: Device Address, Value: Service UUID
 
     // BLE and SoftAP device management
     private val bluetoothDevices = HashMap<BluetoothDevice, String>()
     private val deviceList = ArrayList<BleDevice>() // List of discovered BLE devices
     private val bleDevices = HashMap<String, ESPDevice>() // Map of BLE devices by name
     private val softAPDevices = HashMap<String, ESPDevice>() // Map of SoftAP devices by name
     private var isDeviceConnected = false // Tracks the connection state of the current device
     private var currentESPDevice: ESPDevice? = null // Currently connected ESPDevice instance
 
     // Provisioning and Wi-Fi utilities
     private var espProvisionManager: ESPProvisionManager? = null // ESPProvisionManager instance
     private val wifiManager: WifiManager =
         context.getSystemService(Context.WIFI_SERVICE) as WifiManager // Wi-Fi manager
 
     // Variables for connection and session handling
     private var securityType: Int? = null // Security type used for provisioning
     private var connectionPromise: Promise? =
         null // Promise to resolve/reject connection operations
     private var isConnecting = false // Tracks whether a connection is in progress
 
     init {
         EventBus.getDefault().register(this)
         val intentFilter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
     }
 
     /**
      * Registers the React Native module as a package, enabling it to provide view managers and native modules.
      */
     override fun createViewManagers(
         reactContext: ReactApplicationContext
     ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()
 
     override fun createNativeModules(
         reactContext: ReactApplicationContext
     ): MutableList<NativeModule> = listOf(this).toMutableList()
 
     /**
      * Helper method to check BLE permissions using ESPAppUtilityModule
      * Calls the actual ESPAppUtilityModule.isBlePermissionGrantedSync() method
      */
     private fun checkBlePermissions(): Boolean {
         return appUtilityModule.isBlePermissionGrantedSync()
     }
 
     /**
      * Helper method to check location permissions using ESPAppUtilityModule
      * Calls the actual ESPAppUtilityModule.isLocationPermissionGrantedSync() method
      */
     private fun checkLocationPermissions(): Boolean {
         return appUtilityModule.isLocationPermissionGrantedSync()
     }
 
     /**
      * Check if Bluetooth is enabled at system level and show dialog if not
      * Assumes permissions are already granted
      */
     private fun checkBluetoothEnabled(promise: Promise?): Boolean {
         val bluetoothEnabled = try {
             val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
             bluetoothAdapter?.isEnabled == true
         } catch (t: Throwable) {
             false
         }
 
         if (!bluetoothEnabled) {
             showBluetoothDisabledDialog(promise)
             return false
         }
 
         return true
     }
 
     /**
      * Check if Location services are enabled at system level and show dialog if not
      * Assumes permissions are already granted
      */
     private fun checkLocationEnabled(promise: Promise?): Boolean {
         val locationEnabled = appUtilityModule.isLocationServicesEnabledSync()
 
         if (!locationEnabled) {
             showLocationDisabledDialog(promise)
             return false
         }
 
         return true
     }
 
     /**
      * Show dialog when Bluetooth is disabled, with option to enable
      */
     @SuppressLint("MissingPermission")
     private fun showBluetoothDisabledDialog(promise: Promise?) {
         val activity = reactApplicationContext.currentActivity ?: return
 
         AlertDialog.Builder(activity)
             .setTitle("Bluetooth Required")
             .setMessage("Bluetooth is required for device scanning. Please enable Bluetooth to continue.")
             .setPositiveButton("Enable Bluetooth") { _, _ ->
                 try {
                     val enableBtIntent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
                     activity.startActivity(enableBtIntent)
                 } catch (e: Exception) {
                     Log.e(TAG, "Failed to start Bluetooth enable intent: ${e.message}")
                 }
                 promise?.reject("BLUETOOTH_DISABLED", "User needs to enable Bluetooth manually.")
             }
             .setNegativeButton("Cancel") { _, _ ->
                 promise?.reject("BLUETOOTH_DISABLED", "Bluetooth is required for device scanning.")
             }
             .setCancelable(false)
             .show()
     }
 
     /**
      * Show dialog when Location services are disabled, with option to enable
      */
     private fun showLocationDisabledDialog(promise: Promise?) {
         val activity = reactApplicationContext.currentActivity ?: return
 
         AlertDialog.Builder(activity)
             .setTitle("Location Services Required")
             .setMessage("Location services are required for device scanning. Please enable Location services to continue.")
             .setPositiveButton("Enable Location") { _, _ ->
                 try {
                     val enableLocationIntent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                     activity.startActivity(enableLocationIntent)
                 } catch (e: Exception) {
                     Log.e(TAG, "Failed to start Location settings intent: ${e.message}")
                 }
                 promise?.reject(
                     "LOCATION_DISABLED",
                     "User needs to enable Location services manually."
                 )
             }
             .setNegativeButton("Cancel") { _, _ ->
                 promise?.reject(
                     "LOCATION_DISABLED",
                     "Location services are required for device scanning."
                 )
             }
             .setCancelable(false)
             .show()
     }
 
     /**
      * Initializes the ESPProvisionManager instance if not already initialized.
      */
     @ReactMethod
     fun initializeESPProvisionManager() {
         if (espProvisionManager == null) {
             espProvisionManager = ESPProvisionManager.getInstance(context)
         }
     }
 
     /**
      * Searches for ESP devices using the specified transport type (BLE or SoftAP).
      * The results are filtered by the given device prefix.
      *
      * @param devicePrefix Prefix used to filter discovered devices.
      * @param transport Transport type: "ble" or "softap".
      * @param promise Promise to resolve with the list of discovered devices.
      */
     @SuppressLint("MissingPermission")
     @ReactMethod
     fun searchESPDevices(devicePrefix: String, transport: String, promise: Promise?) {
 
         initializeESPProvisionManager()
 
         // Determine the transport type
         val transportEnum =
             when (transport) {
                 "softap" -> ESPConstants.TransportType.TRANSPORT_SOFTAP
                 "ble" -> ESPConstants.TransportType.TRANSPORT_BLE
                 else -> ESPConstants.TransportType.TRANSPORT_BLE
             }
 
         // Clear previously discovered devices
         bleDevices.clear()
         softAPDevices.clear()
 
         if (transportEnum == ESPConstants.TransportType.TRANSPORT_BLE) {
             searchBLEDevices(devicePrefix, promise)
         } else if (transportEnum == ESPConstants.TransportType.TRANSPORT_SOFTAP) {
             searchWiFiDevices(devicePrefix, promise)
         }
 
     }
 
     /**
      * Searches for BLE devices with the specified prefix.
      *
      * @param devicePrefix Prefix used to filter discovered devices.
      * @param promise Promise to resolve with the list of discovered BLE devices.
      */
     @SuppressLint("MissingPermission")
     @RequiresPermission(
         allOf = [
             Manifest.permission.BLUETOOTH_SCAN,
             Manifest.permission.ACCESS_FINE_LOCATION
         ]
     )
     private fun searchBLEDevices(devicePrefix: String, promise: Promise?) {
 
         // Check if Bluetooth is enabled at system level (assumes permissions are granted)
         if (!checkBluetoothEnabled(promise)) {
             return
         }
 
         espProvisionManager?.searchBleEspDevices(devicePrefix, object : BleScanListener {
 
             override fun scanStartFailed() {
                 promise?.reject(Error("Scan could not be started."))
             }
 
             override fun onPeripheralFound(
                 device: BluetoothDevice?,
                 scanResult: ScanResult?
             ) {
                 if (device == null) return
 
                 val deviceName = scanResult?.scanRecord?.deviceName ?: "Unknown"
                 val serviceUuid =
                     scanResult?.scanRecord?.serviceUuids?.firstOrNull()?.toString() ?: ""
 
                 if (!deviceList.any { it.bluetoothDevice == device }) {
                     deviceList.add(BleDevice(deviceName, device, scanResult))
                 }
 
                 if (serviceUuid.isNotEmpty()) {
                     bluetoothDevices[device] = serviceUuid
                 }
 
                 if (serviceUuid.isNotEmpty() && !bleDevices.containsKey(deviceName)) {
                     val espDevice = ESPDevice(
                         reactApplicationContext,
                         ESPConstants.TransportType.TRANSPORT_BLE,
                         ESPConstants.SecurityType.SECURITY_2
                     )
                     espDevice.bluetoothDevice = device
                     espDevice.deviceName = deviceName
                     espDevice.primaryServiceUuid = serviceUuid
                     bleDevices[deviceName] = espDevice
                 }
             }
 
             @RequiresApi(Build.VERSION_CODES.TIRAMISU)
             override fun scanCompleted() {
                 if (bleDevices.size == 0) {
                     promise?.reject(Error("No bluetooth device found with given prefix"))
                     return
                 }
 
                 val resultArray = Arguments.createArray()
 
                 bleDevices.values.forEach { espDevice ->
                     // Check if device has manufacturer data before including it in results
                     val bluetoothDevice = espDevice.bluetoothDevice
 
                     if (bluetoothDevice != null) {
                         // Find the corresponding ScanResult for this device
                         deviceList.find { it.bluetoothDevice.address == bluetoothDevice.address }
                             ?.let { bleDevice ->
                                 bleDevice.scanResult?.scanRecord?.let { scanRecord ->
                                     Log.d(
                                         TAG,
                                         "Processing advertisement data for device: ${espDevice.deviceName}"
                                     )
 
                                     // Check for manufacturer data specifically (like iOS kCBAdvDataManufacturerData)
                                     val manufacturerDataMap = scanRecord.manufacturerSpecificData
 
                                     if (manufacturerDataMap != null && manufacturerDataMap.size() > 0) {
                                         val manufacturerData = manufacturerDataMap.valueAt(0)
                                         if (manufacturerData != null && manufacturerData.isNotEmpty()) {
                                             // Device has manufacturer data, include it in results
 
                                             val resultMap = Arguments.createMap()
                                             resultMap.putString("name", espDevice.deviceName)
                                             resultMap.putString(
                                                 "transport",
                                                 espDevice.transportType.toString()
                                             )
                                             resultMap.putInt(
                                                 "security",
                                                 espDevice.securityType.ordinal
                                             )
 
                                             val advertisementData = Arguments.createMap()
                                             val manufacturerDataArray = Arguments.createArray()
 
                                             // Convert byte array to array of integers (similar to iOS Array(manufacturerData))
                                             val dataBytes = mutableListOf<Int>()
                                             manufacturerData.forEach { byte ->
                                                 val intValue = byte.toInt() and 0xFF
                                                 manufacturerDataArray.pushInt(intValue)
                                                 dataBytes.add(intValue)
                                             }
 
                                             advertisementData.putArray(
                                                 "kCBAdvDataManufacturerData",
                                                 manufacturerDataArray
                                             )
 
                                             // Try to get other advertising data if available (API level dependent)
                                             try {
                                                 if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                                     // Use getAdvertisingDataMap() for Android 13+ (API 33+)
                                                     val advertisingDataMap =
                                                         scanRecord.advertisingDataMap
 
                                                     advertisingDataMap.forEach { (key, value) ->
                                                         // Convert other data types to appropriate format
                                                         if (value is ByteArray && value.isNotEmpty()) {
                                                             val dataArray = Arguments.createArray()
                                                             val otherDataBytes =
                                                                 mutableListOf<Int>()
                                                             value.forEach { byte ->
                                                                 val intValue = byte.toInt() and 0xFF
                                                                 dataArray.pushInt(intValue)
                                                                 otherDataBytes.add(intValue)
                                                             }
                                                             advertisementData.putArray(
                                                                 "key_$key",
                                                                 dataArray
                                                             )
                                                         }
                                                     }
                                                 }
                                             } catch (e: Exception) {
                                                 Log.w(
                                                     TAG,
                                                     "Error accessing advertisingDataMap: ${e.message}"
                                                 )
                                             }
 
                                             resultMap.putMap("advertisementData", advertisementData)
                                             resultArray.pushMap(resultMap)
                                         }
                                     }
                                 }
                             }
                     }
                 }
 
                 promise?.resolve(resultArray)
             }
 
             override fun onFailure(e: Exception?) {
                 if (e != null) {
                     promise?.reject(e)
                 }
             }
         }
         )
     }
 
     /**
      * Searches for Wi-Fi devices (SoftAP) with the specified prefix.
      *
      * @param devicePrefix Prefix used to filter discovered devices.
      * @param promise Promise to resolve with the list of discovered Wi-Fi devices.
      */
     @RequiresPermission(Manifest.permission.ACCESS_FINE_LOCATION)
     private fun searchWiFiDevices(devicePrefix: String, promise: Promise?) {
 
         // Check if Location services are enabled at system level (assumes permissions are granted)
         if (!checkLocationEnabled(promise)) {
             return
         }
 
         espProvisionManager?.searchWiFiEspDevices(devicePrefix, object : WiFiScanListener {
             override fun onWifiListReceived(wifiList: ArrayList<WiFiAccessPoint>?) {
 
                 if (wifiList?.size == 0) {
                     promise?.reject(Error("No wifi device found with given prefix"))
                     return
                 }
 
                 val resultArray = Arguments.createArray()
 
                 wifiList?.forEach { wiFiAccessPoint ->
 
                     val espDevice = ESPDevice(
                         reactApplicationContext,
                         ESPConstants.TransportType.TRANSPORT_SOFTAP,
                         ESPConstants.SecurityType.SECURITY_2
                     )
 
 
 
                     espDevice.wifiDevice = wiFiAccessPoint
                     espDevice.deviceName = wiFiAccessPoint.wifiName
                     espDevice.wifiDevice.wifiName = wiFiAccessPoint.wifiName
                     espDevice.wifiDevice.password = ""
                     softAPDevices[wiFiAccessPoint.wifiName] = espDevice
 
                     val resultMap = Arguments.createMap()
 
                     resultMap.putString("name", espDevice.deviceName)
                     resultMap.putString("transport", espDevice.transportType.toString())
                     resultMap.putInt("security", espDevice.securityType.ordinal)
 
                     resultArray.pushMap(resultMap)
                 }
 
                 promise?.resolve(resultArray)
             }
 
             override fun onWiFiScanFailed(e: Exception?) {
                 if (e != null) {
                     promise?.reject(e)
                 }
             }
         })
     }
 
     /**
      * Connects to the specified device by name.
      * Supports both BLE and SoftAP connection types.
      *
      * @param deviceName The name of the device to connect to.
      * @param promise Promise to resolve with the connection result.
      */
     @SuppressLint("MissingPermission")
     @ReactMethod
     fun connect(deviceName: String, promise: Promise) {
 
         if (bleDevices.containsKey(deviceName) || deviceList.isNotEmpty()) {
             connectBLEDevice(deviceName, promise)
         } else if (softAPDevices.containsKey(deviceName) || softAPDevices.isNotEmpty()) {
 
             connectSoftAPDevice(deviceName, promise)
         } else {
             promise.reject("NO_DEVICES_FOUND", "No devices found in BLE or SoftAP lists")
         }
     }
 
     /**
      * Handles connection to a BLE device.
      *
      * @param deviceName The name of the BLE device.
      * @param promise Promise to resolve with the connection result.
      */
     @RequiresPermission(
         allOf = [
             Manifest.permission.BLUETOOTH_SCAN,
             Manifest.permission.BLUETOOTH_CONNECT,
             Manifest.permission.ACCESS_FINE_LOCATION
         ]
     )
     private fun connectBLEDevice(deviceName: String, promise: Promise) {
         if (!checkBluetoothEnabled(promise)) {
             return
         }
 
         val bleDevice = deviceList.find { it.deviceName == deviceName }
         if (bleDevice == null) {
             promise.reject("BLE_DEVICE_NOT_FOUND", "No matching BLE device found")
             return
         }
 
         val uuid = bluetoothDevices[bleDevice.bluetoothDevice]
         if (uuid.isNullOrEmpty()) {
             promise.reject("UUID_NOT_FOUND", "Service UUID not found")
             return
         }
 
         espProvisionManager?.let { provisionManager ->
             val espDevice = provisionManager.createESPDevice(
                 ESPConstants.TransportType.TRANSPORT_BLE,
                 ESPConstants.SecurityType.SECURITY_2
             )
 
             if (espDevice != null) {
                 espDevice.connectBLEDevice(bleDevice.bluetoothDevice, uuid)
 
                 handler.postDelayed({
                     if (!isDeviceConnected) {
                         Log.e(TAG, "Connection timeout for device: ${bleDevice.deviceName}")
                         promise.resolve(1) // Timeout
                     }
                 }, DEVICE_CONNECT_TIMEOUT)
 
                 connectionPromise = promise
 
                 try {
                     EventBus.getDefault().unregister(this)
                 } catch (e: Exception) {
                     // Ignore if not registered
                 }
                 EventBus.getDefault().register(this)
             } else {
                 Log.e(TAG, "Failed to create ESPDevice instance")
                 promise.resolve(2)
             }
         } ?: run {
             Log.e(TAG, "ESPProvisionManager not initialized")
             promise.resolve(2)
         }
     }
 
     /**
      * Handles connection to a SoftAP device.
      *
      * @param deviceName The name of the SoftAP device.
      * @param promise Promise to resolve with the connection result.
      */
     @RequiresPermission(
         allOf = [
             Manifest.permission.CHANGE_WIFI_STATE,
             Manifest.permission.ACCESS_WIFI_STATE,
             Manifest.permission.ACCESS_NETWORK_STATE,
             Manifest.permission.ACCESS_FINE_LOCATION
         ]
     )
     private fun connectSoftAPDevice(deviceName: String, promise: Promise) {
         if (!checkLocationEnabled(promise)) {
             return
         }
 
         val espDevice = softAPDevices[deviceName]
         if (espDevice == null) {
             promise.reject("SOFTAP_DEVICE_NOT_FOUND", "SoftAP device not found: $deviceName")
             return
         }
 
         handler.postDelayed({
             if (!isDeviceConnected) {
                 Log.e(TAG, "SoftAP connection timeout: ${espDevice.deviceName}")
                 promise.resolve(1) // Timeout
                 try {
                     EventBus.getDefault().unregister(this)
                 } catch (e: Exception) {
                     // Ignore if not registered
                 }
             }
         }, DEVICE_CONNECT_TIMEOUT)
 
         connectionPromise = promise
 
         try {
             EventBus.getDefault().unregister(this)
         } catch (e: Exception) {
             // Ignore if not registered
         }
         EventBus.getDefault().register(this)
 
         espDevice.connectToDevice()
     }
 
     /**
      * Listens for device connection events via EventBus.
      * Resolves or rejects the connection promise based on the event type.
      */
     @Subscribe(threadMode = ThreadMode.MAIN)
     fun onEvent(event: DeviceConnectionEvent) {
         when (event.eventType) {
             ESPConstants.EVENT_DEVICE_CONNECTED -> {
                 isDeviceConnected = true
                 isConnecting = false
                 setSecurityTypeFromVersionInfo(reactApplicationContext)
                 securityType = espProvisionManager?.getEspDevice()?.getSecurityType()?.ordinal ?: 1
                 connectionPromise?.resolve(0)
                 connectionPromise = null
             }
 
             ESPConstants.EVENT_DEVICE_DISCONNECTED -> {
                 isDeviceConnected = false
                 isConnecting = false
                 connectionPromise?.resolve(1)
                 connectionPromise = null
             }
 
             ESPConstants.EVENT_DEVICE_CONNECTION_FAILED -> {
                 isDeviceConnected = false
                 isConnecting = false
                 connectionPromise?.resolve(2)
                 connectionPromise = null
             }
         }
     }
 
     private fun setSecurityTypeFromVersionInfo(appContext: Context) {
         val espDevice = when {
             bleDevices.isNotEmpty() || deviceList.isNotEmpty() -> {
                 espProvisionManager?.espDevice
             }
 
             softAPDevices.isNotEmpty() -> {
                 espProvisionManager?.espDevice
             }
 
             else -> null
         }
 
         val protoVerStr = espDevice?.versionInfo
         if (protoVerStr == null) {
             Log.e(TAG, "Version Info is null")
             return
         }
 
         try {
             val jsonObject = JSONObject(protoVerStr)
             val provInfo = jsonObject.optJSONObject("prov")
 
             if (provInfo != null) {
                 if (provInfo.has(KEY_SEC_VER)) {
                     val secVer = provInfo.optInt(KEY_SEC_VER)
 
                     when (secVer) {
                         SEC_TYPE_0 -> espProvisionManager?.espDevice?.securityType =
                             ESPConstants.SecurityType.SECURITY_0
 
                         SEC_TYPE_1 -> espProvisionManager?.espDevice?.securityType =
                             ESPConstants.SecurityType.SECURITY_1
 
                         SEC_TYPE_2 -> {
 
                             espDevice.securityType = ESPConstants.SecurityType.SECURITY_2
 
                             var userName = espDevice.userName
                             val appPreferences = appContext.getSharedPreferences(
                                 ESP_PREFERENCES,
                                 Context.MODE_PRIVATE
                             )
 
                             val deviceCaps = espDevice.deviceCapabilities
 
                             if (TextUtils.isEmpty(userName)) {
                                 if (deviceCaps != null && deviceCaps.isNotEmpty()) {
                                     userName = if (deviceCaps.contains(CAPABILITY_THREAD_SCAN) ||
                                         deviceCaps.contains(CAPABILITY_THREAD_PROV)
                                     ) {
                                         appPreferences.getString(
                                             KEY_USER_NAME_THREAD,
                                             DEFAULT_SEC2_USER_NAME_THREAD
                                         )
                                     } else if (deviceCaps.contains(CAPABILITY_WIFI_SCAN) || deviceCaps.contains(
                                             CAPABILITY_WIFI_PROV
                                         )
                                     ) {
                                         appPreferences.getString(
                                             KEY_USER_NAME_WIFI,
                                             DEFAULT_SEC2_USER_NAME_WIFI
                                         ) ?: "wifiprov"
                                     } else {
                                         DEFAULT_SEC2_USER_NAME_WIFI
                                     }
                                 }
                             }
                             espDevice.userName = userName
                         }
 
                         else -> {
                             espDevice.securityType = ESPConstants.SecurityType.SECURITY_2
 
                             var userName = espDevice.userName
                             val appPreferences = appContext.getSharedPreferences(
                                 ESP_PREFERENCES,
                                 Context.MODE_PRIVATE
                             )
 
                             val deviceCaps = espDevice.deviceCapabilities
 
                             if (TextUtils.isEmpty(userName)) {
                                 if (deviceCaps != null && deviceCaps.isNotEmpty()) {
                                     userName =
                                         if (deviceCaps.contains(CAPABILITY_THREAD_SCAN) || deviceCaps.contains(
                                                 CAPABILITY_THREAD_PROV
                                             )
                                         ) {
                                             appPreferences.getString(
                                                 KEY_USER_NAME_THREAD,
                                                 DEFAULT_SEC2_USER_NAME_THREAD
                                             )
                                         } else if (deviceCaps.contains(CAPABILITY_WIFI_SCAN) || deviceCaps.contains(
                                                 CAPABILITY_WIFI_PROV
                                             )
                                         ) {
                                             appPreferences.getString(
                                                 KEY_USER_NAME_WIFI,
                                                 DEFAULT_SEC2_USER_NAME_WIFI
                                             ) ?: "wifiprov"
                                         } else {
                                             DEFAULT_SEC2_USER_NAME_WIFI
                                         }
                                 }
                             }
                             espDevice.userName = userName
                         }
                     }
                 } else {
                     if (espDevice.securityType == ESPConstants.SecurityType.SECURITY_2) {
                         espDevice.securityType = ESPConstants.SecurityType.SECURITY_1
                     }
                 }
             } else {
                 Log.e(TAG, "proto-ver info is not available")
             }
         } catch (e: JSONException) {
             Log.e(TAG, "Capabilities JSON not available: ${e.message}")
         }
     }
 
     @ReactMethod
     fun getDeviceCapabilities(deviceName: String, promise: Promise) {
         val espDevice = when {
             bleDevices.containsKey(deviceName) || deviceList.isNotEmpty() -> {
                 espProvisionManager?.espDevice
             }
 
             softAPDevices.containsKey(deviceName) -> {
                 softAPDevices[deviceName]
             }
 
             else -> null
         }
 
         if (espDevice == null || espDevice.deviceName != deviceName) {
             promise.reject("DEVICE_NOT_FOUND", "Device not found or not connected")
             return
         }
 
         try {
             val deviceCapabilities = espDevice.deviceCapabilities ?: emptyList<String>()
             promise.resolve(Arguments.fromArray(deviceCapabilities.toTypedArray()))
         } catch (e: Exception) {
             promise.reject(
                 "CAPABILITIES_FETCH_FAILED",
                 "Failed to fetch device capabilities: ${e.message}"
             )
         }
     }
 
     /**
      * Sets the proof of possession (PoP) for the specified device.
      *
      * @param deviceName The name of the device.
      * @param pop The proof of possession.
      * @param promise Promise to resolve with the operation result.
      */
     @ReactMethod
     fun setProofOfPossession(deviceName: String, pop: String, promise: Promise) {
         val espDevice = when {
             bleDevices.containsKey(deviceName) || deviceList.isNotEmpty() -> {
                 espProvisionManager?.espDevice
             }
 
             softAPDevices.containsKey(deviceName) -> {
                 softAPDevices[deviceName]
             }
 
             else -> null
         }
 
         if (espDevice == null) {
             promise.reject("DEVICE_NOT_FOUND", "ESP Device is null")
             return
         }
 
         if (espDevice.deviceName != deviceName) {
             promise.reject("DEVICE_NOT_FOUND", "Device name mismatch")
             return
         }
 
         try {
             espDevice.setProofOfPossession(pop)
             promise.resolve(true)
         } catch (e: Exception) {
             Log.e(TAG, "Failed to set PoP: ${e.message}")
             promise.reject("SET_POP_FAILED", e.message ?: "Failed to set PoP")
         }
     }
 
     /**
      * Initializes a secure session with the specified device.
      *
      * @param deviceName The name of the device.
      * @param promise Promise to resolve with the session initialization result.
      */
     @ReactMethod
     fun initializeSession(deviceName: String, promise: Promise) {
         val espDevice = when {
             bleDevices.containsKey(deviceName) || deviceList.isNotEmpty() -> {
                 espProvisionManager?.espDevice
             }
 
             softAPDevices.containsKey(deviceName) -> {
                 softAPDevices[deviceName]
             }
 
             else -> null
         }
 
         if (espDevice == null || espDevice.deviceName != deviceName) {
             promise.reject("DEVICE_NOT_FOUND", "Device not found or mismatched")
             return
         }
 
         espDevice.initSession(object : ResponseListener {
             override fun onSuccess(returnData: ByteArray?) {
                 promise.resolve(true)
             }
 
             override fun onFailure(e: Exception?) {
                 Log.e(TAG, "Session initialization failed: ${e?.message}")
                 promise.reject("SESSION_INIT_FAILED", e?.message ?: "Failed to initialize session")
             }
         })
     }
 
     @ReactMethod
     @RequiresPermission(
         allOf = [
             Manifest.permission.ACCESS_WIFI_STATE,
             Manifest.permission.ACCESS_FINE_LOCATION
         ]
     )
     fun scanWifiList(deviceName: String, promise: Promise) {
         val espDevice = when {
             bleDevices.containsKey(deviceName) || deviceList.isNotEmpty() -> {
                 espProvisionManager?.espDevice
             }
 
             softAPDevices.containsKey(deviceName) -> {
                 softAPDevices[deviceName]
             }
 
             else -> {
                 promise.reject("DEVICE_NOT_FOUND", "Device not found: $deviceName")
                 return
             }
         }
 
         if (espDevice == null) {
             promise.reject("DEVICE_NULL", "ESP Device is null")
             return
         }
 
         try {
             val capabilities = espDevice.deviceCapabilities
 
             // Use ESP device's built-in WiFi scanning
             espDevice.scanNetworks(object : WiFiScanListener {
                 override fun onWifiListReceived(wifiList: ArrayList<WiFiAccessPoint>?) {
                     val resultArray = Arguments.createArray()
 
                     wifiList?.forEach { wifiAP ->
                         val resultMap = Arguments.createMap()
                         resultMap.putString("ssid", wifiAP.wifiName)
                         resultMap.putInt("rssi", wifiAP.rssi)
                         resultMap.putBoolean("secure", wifiAP.security > 0)
                         resultArray.pushMap(resultMap)
                     }
 
                     promise.resolve(resultArray)
                 }
 
                 override fun onWiFiScanFailed(e: Exception?) {
                     Log.e(TAG, "WiFi scan failed: ${e?.message}")
                     promise.reject("ESP_SCAN_FAILED", "WiFi scan failed: ${e?.message}")
                 }
             })
         } catch (e: Exception) {
             Log.e(TAG, "WiFi scan exception: ${e.message}")
             promise.reject("ESP_SCAN_EXCEPTION", "WiFi scan exception: ${e.message}")
         }
     }
 
 
     @ReactMethod
     @RequiresApi(Build.VERSION_CODES.O)
     fun sendData(deviceName: String, endPoint: String, data: String, promise: Promise) {
         val espDevice = when {
             bleDevices.containsKey(deviceName) || deviceList.isNotEmpty() -> {
                 espProvisionManager?.espDevice
             }
 
             softAPDevices.containsKey(deviceName) -> {
                 softAPDevices[deviceName]
             }
 
             else -> null
         }
 
         if (espDevice == null || espDevice.deviceName != deviceName) {
             promise.reject("DEVICE_NOT_FOUND", "Device not found or not connected")
             return
         }
 
         val decodedData: ByteArray = try {
             Base64.getDecoder().decode(data)
         } catch (e: IllegalArgumentException) {
             Log.e(TAG, "Invalid Base64 data: ${e.message}")
             promise.reject("INVALID_DATA", "Data is not Base64 encoded or invalid")
             return
         }
 
         espDevice.sendDataToCustomEndPoint(endPoint, decodedData, object : ResponseListener {
             override fun onSuccess(returnData: ByteArray?) {
                 val encodedResponse =
                     returnData?.let { Base64.getEncoder().encodeToString(it) } ?: ""
                 promise.resolve(encodedResponse)
             }
 
             override fun onFailure(e: Exception?) {
                 Log.e(TAG, "Failed to send data to $endPoint: ${e?.message}")
                 promise.reject("SEND_DATA_FAILED", e?.message ?: "Failed to send data")
             }
         })
     }
 
     @ReactMethod
     fun provision(deviceName: String, ssid: String, passphrase: String, promise: Promise) {
         val espDevice = when {
             bleDevices.containsKey(deviceName) || deviceList.isNotEmpty() -> {
                 espProvisionManager?.espDevice
             }
 
             softAPDevices.containsKey(deviceName) -> {
                 softAPDevices[deviceName]
             }
 
             else -> null
         }
 
         if (espDevice == null || espDevice.deviceName != deviceName) {
             promise.reject("DEVICE_NOT_FOUND", "Device not found or not connected")
             return
         }
 
         espDevice.provision(ssid, passphrase, object : ProvisionListener {
             override fun createSessionFailed(e: Exception) {
                 Log.e(TAG, "Session creation failed: ${e.message}")
                 promise.reject("SESSION_CREATION_FAILED", e.message)
             }
 
             override fun wifiConfigSent() {
                 // Config sent successfully
             }
 
             override fun wifiConfigFailed(e: Exception) {
                 Log.e(TAG, "WiFi config failed: ${e.message}")
                 promise.reject("WIFI_CONFIG_FAILED", e.message)
             }
 
             override fun wifiConfigApplied() {
                 // Config applied successfully
             }
 
             override fun wifiConfigApplyFailed(e: Exception) {
                 Log.e(TAG, "Failed to apply WiFi config: ${e.message}")
                 promise.reject("WIFI_APPLY_FAILED", e.message)
             }
 
             override fun provisioningFailedFromDevice(failureReason: ESPConstants.ProvisionFailureReason) {
                 Log.e(TAG, "Provisioning failed: $failureReason")
                 promise.reject("PROVISIONING_FAILED", failureReason.toString())
             }
 
             override fun deviceProvisioningSuccess() {
                 promise.resolve(0)
             }
 
             override fun onProvisioningFailed(e: Exception) {
                 Log.e(TAG, "Provisioning failed: ${e.message}")
                 promise.reject("PROVISION_FAILED", e.message)
             }
         })
     }
 
     @SuppressLint("MissingPermission")
     @ReactMethod
     fun createESPDevice(
         deviceName: String,
         transport: String,
         security: Int,
         proofOfPossession: String?,
         softAPPassword: String?,
         username: String?,
         promise: Promise
     ) {
         try {
             initializeESPProvisionManager()
 
             var securityType = when (security) {
                 0 -> ESPConstants.SecurityType.SECURITY_0
                 1 -> ESPConstants.SecurityType.SECURITY_1
                 else -> ESPConstants.SecurityType.SECURITY_2
             }
 
             val transportEnum = when (transport.trim().lowercase()) {
                 "softap" -> ESPConstants.TransportType.TRANSPORT_SOFTAP
                 "ble" -> ESPConstants.TransportType.TRANSPORT_BLE
                 else -> {
                     Log.e(TAG, "Invalid transport value: $transport")
                     promise.reject("INVALID_TRANSPORT", "Transport type not supported: $transport")
                     return
                 }
             }
 
             if (transportEnum == ESPConstants.TransportType.TRANSPORT_BLE) {
 
                 Log.d(TAG, "Entering BLE Transport Logic")
 
                 espProvisionManager?.searchBleEspDevices("PROV_", object : BleScanListener {
                     override fun scanStartFailed() {
                         promise.reject("SCAN_FAILED", "BLE scan could not be started.")
                     }
 
                     override fun onPeripheralFound(
                         device: BluetoothDevice?,
                         scanResult: ScanResult?
                     ) {
                         if (device == null || scanResult == null) return
 
                         val scannedDeviceName = scanResult.scanRecord?.deviceName ?: "Unknown"
                         val serviceUuid =
                             scanResult.scanRecord?.serviceUuids?.firstOrNull()?.toString() ?: ""
 
                         if (serviceUuid.isNotEmpty()) {
                             bluetoothDevices[device] = serviceUuid
                             Log.d(
                                 TAG,
                                 "Added to bluetoothDevices: ${device.address} -> $serviceUuid"
                             )
                         }
 
                         if (scannedDeviceName == deviceName) {
                             espProvisionManager?.stopBleScan()
                             deviceList.add(BleDevice(scannedDeviceName, device, null))
 
                             val uuid = bluetoothDevices[device]
                             if (uuid.isNullOrEmpty()) {
                                 promise.reject("UUID_NOT_FOUND", "Service UUID not found")
                                 return
                             }
 
                             val espDevice = ESPDevice(
                                 reactApplicationContext,
                                 ESPConstants.TransportType.TRANSPORT_BLE,
                                 securityType
                             )
                             espDevice.bluetoothDevice = device
                             espDevice.deviceName = deviceName
                             espDevice.primaryServiceUuid = uuid
                             currentESPDevice = espDevice
 
                             val bleDevice =
                                 deviceList.find { it.deviceName == espDevice.deviceName }
 
                             if (bleDevice == null) {
                                 promise.reject(
                                     "DEVICE_NOT_FOUND",
                                     "Device not found in scanned list"
                                 )
                                 return
                             }
 
                             if (uuid.isNullOrEmpty()) {
                                 promise.resolve(1)
                                 return
                             }
 
                             // Create ESP device without connection
                             espProvisionManager?.let { provisionManager ->
                                 val espDevice = provisionManager.createESPDevice(
                                     ESPConstants.TransportType.TRANSPORT_BLE,
                                     ESPConstants.SecurityType.SECURITY_2
                                 )
 
                                 cleanup()
 
                                 if (espDevice != null) {
                                     espDevice.bluetoothDevice = bleDevice.bluetoothDevice
                                     espDevice.deviceName = deviceName
                                     espDevice.primaryServiceUuid = uuid
                                     promise.resolve(createDeviceMap(espDevice))
                                 } else {
                                     Log.e(TAG, "Failed to create ESPDevice instance for BLE")
                                     promise.reject(
                                         "DEVICE_CREATION_FAILED",
                                         "Failed to create ESPDevice"
                                     )
                                 }
                             }
                         }
                     }
 
                     override fun scanCompleted() {
                         // BLE scan completed
                     }
 
                     override fun onFailure(e: Exception?) {
                         promise.reject("SCAN_ERROR", e?.message ?: "Error during BLE scan.")
                     }
                 })
             } else if (transportEnum == ESPConstants.TransportType.TRANSPORT_SOFTAP) {
                 espProvisionManager?.searchWiFiEspDevices("PROV_", object : WiFiScanListener {
                     override fun onWifiListReceived(wifiList: ArrayList<WiFiAccessPoint>?) {
                         if (wifiList.isNullOrEmpty()) {
                             promise.reject(
                                 "DEVICE_NOT_FOUND",
                                 "No WiFi devices found with the given name"
                             )
                             return
                         }
 
                         val targetDevice = wifiList.firstOrNull { it.wifiName == deviceName }
                         if (targetDevice == null) {
                             promise.reject("DEVICE_NOT_FOUND", "No matching device found")
                             return
                         }
 
                         val espDevice =
                             espProvisionManager?.createESPDevice(transportEnum, securityType)
                         if (espDevice == null) {
                             Log.e(TAG, "Failed to create ESPDevice instance for SoftAP")
                             promise.reject("DEVICE_CREATION_FAILED", "Failed to create ESPDevice")
                             return
                         }
 
                         cleanup()
 
                         espDevice.wifiDevice = targetDevice
                         espDevice.deviceName = targetDevice.wifiName
                         espDevice.wifiDevice.wifiName = targetDevice.wifiName
                         espDevice.wifiDevice.password = ""
 
                         softAPDevices[targetDevice.wifiName] = espDevice
                         currentESPDevice = espDevice
 
                         promise.resolve(createDeviceMap(espDevice))
                     }
 
                     override fun onWiFiScanFailed(e: Exception?) {
                         Log.e(TAG, "WiFi scan failed: ${e?.message}")
                         promise.reject("SCAN_FAILED", e?.message ?: "WiFi scan failed")
                     }
                 })
             } else {
                 Log.e(TAG, "Unsupported transport type: $transportEnum")
                 promise.reject("INVALID_TRANSPORT", "Transport type not supported")
             }
 
         } catch (e: Exception) {
             Log.e(TAG, "Error during scan: ${e.message}")
             promise.reject("SCAN_ERROR", e.message ?: "Error during scan")
         }
     }
 
 
     /**
      * Utility method to create a device map for sending to React Native.
      *
      * @param device The ESPDevice instance.
      * @return WritableMap containing the device details.
      */
     private fun createDeviceMap(device: ESPDevice): WritableMap {
         return Arguments.createMap().apply {
             putString("name", device.deviceName)
             putString("transport", device.transportType.name)
             putInt("security", device.securityType.ordinal)
         }
     }
 
     data class BleDevice(
         val deviceName: String,
         val bluetoothDevice: BluetoothDevice,
         val scanResult: ScanResult?
     )
 
     /**
      * Cleans up resources and unregisters event listeners.
      */
     fun cleanup() {
         EventBus.getDefault().unregister(this)
     }
 }