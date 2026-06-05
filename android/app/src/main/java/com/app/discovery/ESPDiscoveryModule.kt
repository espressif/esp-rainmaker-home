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
 * `ESPDiscoveryModule` provides mDNS discovery for RainMaker local control and
 * on-network provisioning services.
 *
 * Matter operational discovery is handled separately by [com.app.matter.MatterDiscoveryModule]
 * via the CHIP stack.
 */
class ESPDiscoveryModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ReactPackage {

    companion object {
        private const val TAG = "ESPDiscoveryModule"
        /** Same as RainMaker Android `AppConstants.MDNS_SERVICE_TYPE` / base-sdk default. */
        private const val DEFAULT_MDNS_SERVICE_TYPE = "_esp_local_ctrl._tcp."
        private const val DEFAULT_MDNS_DOMAIN_LOCAL = "local."
    }

    private val mdnsManager: mDNSManager =
        mDNSManager.getInstance(
            reactContext.applicationContext,
            object : mDNSManager.mDNSEvenListener {
                override fun deviceFound(service: DiscoveredService) {
                    sendDeviceEvent(service)
                }

                override fun deviceLost(serviceType: String, nodeId: String, serviceName: String) {
                    sendDiscoveryLostEvent(serviceType, nodeId, serviceName)
                }
            },
        )

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
     * Starts an mDNS browse session for the given service type. Idempotent — calling it
     * again with the same `serviceType` while a session is running is a no-op, so RM and
     * Matter consumers can each call it independently.
     */
    @ReactMethod
    fun startDiscovery(config: ReadableMap) {
        val rawServiceType = if (config.hasKey("serviceType")) config.getString("serviceType")?.trim() else null
        val rawDomain = if (config.hasKey("domain")) config.getString("domain")?.trim() else null

        val serviceType = if (rawServiceType.isNullOrEmpty()) DEFAULT_MDNS_SERVICE_TYPE else rawServiceType
        val domain = when {
            rawDomain.isNullOrEmpty() -> DEFAULT_MDNS_DOMAIN_LOCAL
            rawDomain == "local" -> DEFAULT_MDNS_DOMAIN_LOCAL
            else -> rawDomain
        }

        Log.d(TAG, "startDiscovery: serviceType=$serviceType, domain=$domain")
        mdnsManager.discoverServices(serviceType, domain)
    }

    /**
     * Stops all active mDNS browse sessions. Existing JS callers (notably the
     * `useOnNetworkDiscovery` stop/restart dance) rely on this stopping every browse,
     * so the semantics are preserved.
     */
    @ReactMethod
    fun stopDiscovery() {
        Log.d(TAG, "stopDiscovery: stopping all sessions")
        mdnsManager.stopAllDiscovery()
    }

    /** Stops a single browse session (use this from JS to stop e.g. just the Matter browse). */
    @ReactMethod
    fun stopDiscoveryForType(serviceType: String) {
        Log.d(TAG, "stopDiscoveryForType: $serviceType")
        mdnsManager.stopDiscovery(serviceType)
    }

    /**
     * Emits a `DiscoveryUpdate` event with RainMaker local-control / provisioning fields.
     */
    private fun sendDeviceEvent(service: DiscoveredService) {
        val txtMap = WritableNativeMap().apply {
            for ((key, value) in service.txt) {
                putString(key, value)
            }
        }
        val eventData = WritableNativeMap().apply {
            putString("serviceType", service.serviceType)
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

    private fun sendDiscoveryLostEvent(serviceType: String, nodeId: String, serviceName: String) {
        val eventData = WritableNativeMap().apply {
            putString("serviceType", serviceType)
            putString("nodeId", nodeId)
            putString("serviceName", serviceName)
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
