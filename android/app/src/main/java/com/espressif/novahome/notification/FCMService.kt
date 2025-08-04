/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.notification

import android.Manifest
import android.util.Log
import androidx.annotation.RequiresPermission
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/**
 * Firebase Cloud Messaging service for ESP RainMaker notifications.
 * 
 * This service handles incoming FCM messages and processes them for:
 * - Forwarding to React Native via ESPNotificationQueue
 * - Displaying system notifications for device events
 * - Managing FCM token updates
 * 
 * Supported event types:
 * - rmaker.event.user_node_added -> Device Added
 * - rmaker.event.user_node_removed -> Device Removed  
 * - rmaker.event.node_connected -> Device Online
 * - rmaker.event.node_disconnected -> Device Offline
 */
class FCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCMService"
        
        // FCM payload keys
        private const val KEY_EVENT_DATA_PAYLOAD = "event_data_payload"
        private const val KEY_TITLE = "title"
        private const val KEY_BODY = "body"
        private const val KEY_EVENT_TYPE = "event_type"
        
        // Default notification content
        private const val DEFAULT_TITLE = "ESP RainMaker"
        private const val DEFAULT_BODY = "New notification"
    }

    /**
     * Processes incoming FCM messages.
     * 
     * This method:
     * 1. Forwards all notification data to React Native
     * 2. Parses event payload for system notifications
     * 3. Shows appropriate system notifications for device events
     *
     * @param remoteMessage The FCM message containing notification data and payload
     */
    @RequiresPermission(Manifest.permission.POST_NOTIFICATIONS)
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        try {
            val notificationData = remoteMessage.data.toMutableMap()
            ESPNotificationQueue.addNotification(notificationData)

            processSystemNotification(remoteMessage.data)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error processing FCM message", e)
        }
    }

    /**
     * Processes and displays system notifications for ESP RainMaker events.
     */
    @RequiresPermission(Manifest.permission.POST_NOTIFICATIONS)
    private fun processSystemNotification(data: Map<String, String>) {
        try {
            val eventPayload = data[KEY_EVENT_DATA_PAYLOAD]
            val title = data[KEY_TITLE] ?: DEFAULT_TITLE
            val body = data[KEY_BODY] ?: DEFAULT_BODY

            if (eventPayload.isNullOrEmpty()) {
                Log.d(TAG, "No event payload found, skipping system notification")
                return
            }

            val eventJson = JSONObject(eventPayload)
            val rawEventType = eventJson.optString(KEY_EVENT_TYPE)
            val mappedEventType = mapEventTypeToNotificationChannel(rawEventType)

            if (mappedEventType != null) {
                ESPNotificationHelper.showEventNotification(this, mappedEventType, title, body)
            } else {
                Log.d(TAG, "Event type '$rawEventType' not supported for system notifications")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error processing system notification", e)
        }
    }

    /**
     * Maps ESP RainMaker event types to notification channel identifiers.
     */
    private fun mapEventTypeToNotificationChannel(eventType: String): String? {
        return when (eventType) {
            "rmaker.event.user_node_added" -> "node_added"
            "rmaker.event.user_node_removed" -> "node_removed"
            "rmaker.event.node_connected" -> "node_online"
            "rmaker.event.node_disconnected" -> "node_offline"
            else -> null
        }
    }

    /**
     * Handles FCM token refresh events.
     * 
     * This is called when:
     * - The app is first installed
     * - The app data is cleared
     * - The app is updated
     * - Firebase SDK is updated
     * - The token is refreshed for security reasons
     *
     * @param token The new FCM registration token
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "FCM token refreshed")
        
        // Note: The React Native layer will retrieve the new token when needed
        // via ESPNotificationModule.getDeviceToken()
    }
}
