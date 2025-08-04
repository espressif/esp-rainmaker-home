/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.notification

import android.util.Log
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager
import com.google.firebase.messaging.FirebaseMessaging

/**
 * React Native module for managing ESP RainMaker notifications.
 * 
 * This module provides the bridge between Android's Firebase Cloud Messaging (FCM)
 * and the React Native JavaScript layer. It handles:
 * - FCM token retrieval
 * - Platform identification
 * - Notification listener state management
 * 
 * @param reactContext The React Native application context
 */
class ESPNotificationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ReactPackage {

    companion object {
        private const val TAG = "ESPNotificationModule"

        private const val PLATFORM_IDENTIFIER = "GCM_NOVA"

        var isNotificationListenerActive = true
    }

    init {
        ESPNotificationQueue.setReactContext(reactContext)
    }

    /**
     * Provides the name of this module for React Native integration.
     *
     * @return The name of the module.
     */
    override fun getName(): String {
        return "ESPNotificationModule"
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = listOf(this).toMutableList()

    /**
     * Retrieves the Firebase Cloud Messaging (FCM) device token.
     * 
     * This token is used to identify the device for push notifications.
     * The token may change when:
     * - The app is restored on a new device
     * - The app data is restored
     * - The app is updated
     * - When Firebase SDK is updated
     *
     * @param promise Promise that resolves with the FCM token or rejects with an error
     */
    @ReactMethod
    fun getDeviceToken(promise: Promise) {
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    val errorMessage = task.exception?.message ?: "Unknown FCM error"
                    promise.reject("FCM_TOKEN_ERROR", errorMessage)
                    return@addOnCompleteListener
                }

                val token = task.result
                promise.resolve(token)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception while getting FCM token", e)
            promise.reject("FCM_TOKEN_EXCEPTION", e.message ?: "Unknown exception")
        }
    }

    /**
     * Retrieves the platform identifier for ESP RainMaker notifications.
     * 
     * This identifier is used by the ESP RainMaker backend to determine
     * the notification platform and routing.
     *
     * @param promise Promise that resolves with the platform identifier
     */
    @ReactMethod
    fun getNotificationPlatform(promise: Promise) {
        try {
            promise.resolve(PLATFORM_IDENTIFIER)
        } catch (e: Exception) {
            promise.reject("PLATFORM_ERROR", "Failed to get notification platform: ${e.message}")
        }
    }

    /**
     * Controls the notification listener state.
     * 
     * When enabled:
     * - New notifications are immediately forwarded to React Native
     * - Any queued notifications are flushed and sent
     * 
     * When disabled:
     * - Notifications are queued but not sent to React Native
     * - Useful for preventing notifications during app initialization
     *
     * @param enable True to enable forwarding notifications to React Native, false to queue them
     */
    @ReactMethod
    fun toggleNotificationListener(enable: Boolean) {
        synchronized(this) {
            isNotificationListenerActive = enable
        }

        if (enable) {
            ESPNotificationQueue.flushPendingNotifications()
            Log.d(TAG, "Pending notifications flushed to React Native")
        } else {
            Log.d(TAG, "New notifications will be queued until listener is enabled")
        }
    }
}