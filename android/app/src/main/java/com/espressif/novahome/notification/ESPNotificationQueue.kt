/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.notification

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.util.Collections

/**
 * Manages the queuing and dispatching of ESP RainMaker notifications to React Native.
 * 
 * This object provides a bridge between Firebase Cloud Messaging and the React Native
 * JavaScript layer. It handles:
 * - Queuing notifications when React Native is not ready
 * - Converting notification data to React Native compatible format
 * - Parsing JSON payloads from FCM messages
 * - Thread-safe notification dispatch
 */
object ESPNotificationQueue {

    private const val TAG = "ESPNotificationQueue"

    @Volatile
    private var reactContext: ReactApplicationContext? = null

    private val pendingNotifications: MutableList<Map<String, String>> = 
        Collections.synchronizedList(mutableListOf())

    /**
     * Sets the React Native context and processes any pending notifications.
     *
     * @param context The React Native context to interact with the JavaScript layer.
     */
    fun setReactContext(context: ReactApplicationContext) {
        reactContext = context
        flushPendingNotifications()
    }

    /**
     * Adds a notification to be sent to React Native.
     * If the listener is active, it sends the notification immediately; otherwise, it queues it.
     *
     * @param data A map representing the notification data.
     */
    fun addNotification(data: Map<String, String>) {
        if (isNotificationListenerActive()) {
            sendToJS(data)
        } else {
            Log.d(TAG, "Notification listener is inactive. Adding notification to queue.")
            pendingNotifications.add(data)
        }
    }

    /**
     * Checks if the notification listener is active.
     *
     * @return True if the listener is active, false otherwise.
     */
    private fun isNotificationListenerActive(): Boolean {
        return ESPNotificationModule.isNotificationListenerActive
    }

    /**
     * Sends a notification directly to the React Native JavaScript layer.
     *
     * @param data A map representing the notification data.
     */
    private fun sendToJS(data: Map<String, String>) {
        try {
            val updatedData = mutableMapOf<String, Any>()

            for ((key, value) in data) {
                if (key == "event_data_payload") {
                    try {
                        val jsonObject = JSONObject(value)
                        val nestedMap = mapFromJson(jsonObject)
                        updatedData[key] = nestedMap
                    } catch (e: Exception) {
                        updatedData[key] = value
                    }
                } else {
                    updatedData[key] = value
                }
            }

            val result: WritableMap = Arguments.makeNativeMap(updatedData)

            reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("ESPNotificationModule", result)

            Log.d(TAG, "Notification sent to React Native: $updatedData")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send notification to React Native: ${e.message}")
        }
    }

    /**
     * Converts a JSON object to a map for easy handling.
     *
     * @param jsonObject The JSON object to be converted.
     * @return A map representing the JSON object's key-value pairs.
     */
    private fun mapFromJson(jsonObject: JSONObject): Map<String, Any> {
        val map = mutableMapOf<String, Any>()
        val keys = jsonObject.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = jsonObject.get(key)
            map[key] = when (value) {
                is JSONObject -> mapFromJson(value)
                is JSONArray -> value.toList()
                else -> value
            }
        }
        return map
    }

    /**
     * Converts a JSON array to a list for easy handling.
     *
     * @return A list representing the JSON array's elements.
     */
    private fun JSONArray.toList(): List<Any> {
        val list = mutableListOf<Any>()
        for (i in 0 until this.length()) {
            val value = this.get(i)
            list.add(
                when (value) {
                    is JSONObject -> mapFromJson(value)
                    is JSONArray -> value.toList()
                    else -> value
                }
            )
        }
        return list
    }

    /**
     * Sends all pending notifications to the React Native JavaScript layer.
     */
    fun flushPendingNotifications() {
        while (pendingNotifications.isNotEmpty()) {
            val data = pendingNotifications.removeAt(0)
            sendToJS(data)
        }
    }
}
