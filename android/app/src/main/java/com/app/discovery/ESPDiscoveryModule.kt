/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.discovery

import android.util.Log
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager
import com.app.discovery.mDNSManager.DiscoveredService

/**
 * `ESPDiscoveryModule` provides functionality for discovering ESP devices over mDNS.
 * It allows React Native applications to:
 * - Start and stop device discovery.
 * - Emit discovered device information to the React Native layer.
 *
 * This module interacts with the mDNSManager for handling mDNS-based device discovery.
 * It discovers devices based on the service type sent from the react native layer - SDK.
 */
class ESPDiscoveryModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ReactPackage {

    companion object {
        private const val TAG = "ESPDiscoveryModule"
        /** Same as RainMaker Android `AppConstants.MDNS_SERVICE_TYPE` / base-sdk default. */
        private const val DEFAULT_MDNS_SERVICE_TYPE = "_esp_local_ctrl._tcp."
        private const val DEFAULT_MDNS_DOMAIN_LOCAL = "local."
    }

    private var mdnsManager: mDNSManager? = null
    private val nodeBaseUrlMap: HashMap<String, String> = HashMap()
    private var serviceType: String = ""

    /**
     * Initialize the mDNSManager and set up a listener for discovered devices.
     */
    init {
        mdnsManager = mDNSManager.getInstance(
            reactContext.applicationContext,
            serviceType, // Service type set in startDiscovery method
            object : mDNSManager.mDNSEvenListener {
                override fun deviceFound(service: DiscoveredService) {
                    nodeBaseUrlMap[service.nodeId] = service.baseUrl
                    sendDeviceEvent(service)
                }

                override fun deviceLost(nodeId: String) {
                    nodeBaseUrlMap.remove(nodeId)
                    sendDiscoveryLostEvent(nodeId)
                }
            }
        )
        mdnsManager?.initializeNsd()
    }

    /**
     * Returns the name of the module to be used in React Native.
     */
    override fun getName(): String {
        return "ESPDiscoveryModule"
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = listOf(this).toMutableList()

    /**
     * Starts mDNS service discovery for a specified service type and domain.
     *
     * @param config ReadableMap containing the serviceType and domain.
     */
    @ReactMethod
    fun startDiscovery(config: ReadableMap) {
        var serviceType = config.getString("serviceType")?.trim()
        var domain = config.getString("domain")?.trim()

        if (serviceType.isNullOrEmpty()) {
            serviceType = DEFAULT_MDNS_SERVICE_TYPE
        }
        if (domain.isNullOrEmpty()) {
            domain = DEFAULT_MDNS_DOMAIN_LOCAL
        } else if (domain == "local") {
            domain = DEFAULT_MDNS_DOMAIN_LOCAL
        }

        Log.d(TAG, "startDiscovery called: serviceType=$serviceType, domain=$domain, mdnsManager=${mdnsManager != null}")
        mdnsManager?.discoverServices(serviceType, domain)
    }

    /**
     * Stops the mDNS service discovery.
     */
    @ReactMethod
    fun stopDiscovery() {
        Log.d(TAG, "stopDiscovery called, mdnsManager=${mdnsManager != null}")
        mdnsManager?.stopDiscovery()
    }

    /**
     * Sends a `DiscoveryUpdate` event to React Native with the resolved service.
     *
     * Backwards-compatible payload: existing consumers continue to read
     * `nodeId`/`baseUrl`. Additional fields (`host`, `port`, `txt`) let JS-side
     * features drive direct LAN HTTP flows (e.g. on-network challenge-response
     * provisioning) without further native round-trips.
     */
    private fun sendDeviceEvent(service: DiscoveredService) {
        val txtMap = WritableNativeMap().apply {
            for ((key, value) in service.txt) {
                putString(key, value)
            }
        }
        val eventData = WritableNativeMap().apply {
            putString("nodeId", service.nodeId)
            putString("serviceName", service.serviceName)
            putString("baseUrl", service.baseUrl)
            putString("host", service.host)
            putInt("port", service.port)
            putMap("txt", txtMap)
        }
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("DiscoveryUpdate", eventData)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit discovery event: ${e.message}")
        }
    }

    private fun sendDiscoveryLostEvent(nodeId: String) {
        val eventData = WritableNativeMap().apply {
            putString("nodeId", nodeId)
        }
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("DiscoveryLost", eventData)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit discovery lost: ${e.message}")
        }
    }

}
