/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.discovery

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
                override fun deviceFound(baseUrls: HashMap<String, String>) {
                    for ((nodeId, url) in baseUrls) {
                        nodeBaseUrlMap[nodeId] = url
                        sendDeviceEvent(nodeId, url)
                    }
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
        val serviceType = config.getString("serviceType")
        val domain = config.getString("domain")

        if (serviceType.isNullOrEmpty()) {
            Log.e(TAG, "Service type is required for discovery")
            return
        }

        mdnsManager?.discoverServices(serviceType, domain)
    }

    /**
     * Stops the mDNS service discovery.
     */
    @ReactMethod
    fun stopDiscovery() {
        mdnsManager?.stopDiscovery()
    }

    /**
     * Sends an event to the React Native layer with the discovered device details.
     *
     * @param nodeId The unique identifier for the discovered node.
     * @param baseUrl The base URL of the discovered node.
     */
    private fun sendDeviceEvent(nodeId: String, baseUrl: String) {
        val eventData = WritableNativeMap().apply {
            putString("nodeId", nodeId)
            putString("baseUrl", baseUrl)
        }
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("DiscoveryUpdate", eventData)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit discovery event: ${e.message}")
        }
    }

}
