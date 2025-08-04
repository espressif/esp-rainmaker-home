/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.notification

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresPermission
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.graphics.toColorInt
import com.espressif.novahome.MainActivity
import com.espressif.novahome.R

/**
 * Helper object for managing ESP RainMaker notifications.
 * Provides functionality to create notification channels and display event notifications.
 */
object ESPNotificationHelper {

    // Notification channel IDs
    private const val CHANNEL_NODE_ONLINE = "node_online"
    private const val CHANNEL_NODE_OFFLINE = "node_offline"
    private const val CHANNEL_NODE_ADDED = "node_added"
    private const val CHANNEL_NODE_REMOVED = "node_removed"

    private const val NOTIFICATION_COLOR = "#CA1627"

    /**
     * Creates notification channels for different types of ESP RainMaker events.
     * This method should be called during app initialization.
     *
     * @param context The application context
     */
    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            val channels = listOf(
                createNotificationChannel(
                    CHANNEL_NODE_ONLINE,
                    "Device Online",
                    "Notifications when devices come online",
                    defaultSoundUri,
                    audioAttributes
                ),
                createNotificationChannel(
                    CHANNEL_NODE_OFFLINE,
                    "Device Offline",
                    "Notifications when devices go offline",
                    defaultSoundUri,
                    audioAttributes
                ),
                createNotificationChannel(
                    CHANNEL_NODE_ADDED,
                    "Device Added",
                    "Notifications when new devices are added",
                    defaultSoundUri,
                    audioAttributes
                ),
                createNotificationChannel(
                    CHANNEL_NODE_REMOVED,
                    "Device Removed",
                    "Notifications when devices are removed",
                    defaultSoundUri,
                    audioAttributes
                )
            )

            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            channels.forEach { notificationManager.createNotificationChannel(it) }
        }
    }

    /**
     * Creates a notification channel with the specified parameters.
     */
    private fun createNotificationChannel(
        channelId: String,
        name: String,
        description: String,
        soundUri: android.net.Uri,
        audioAttributes: AudioAttributes
    ): NotificationChannel {
        return NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH).apply {
            this.description = description
            setSound(soundUri, audioAttributes)
        }
    }

    /**
     * Displays a notification for ESP RainMaker device events.
     *
     * @param context The application context
     * @param eventType The type of event (node_added, node_removed, node_online, node_offline)
     * @param title The notification title
     * @param body The notification body text
     */
    @RequiresPermission(Manifest.permission.POST_NOTIFICATIONS)
    fun showEventNotification(context: Context, eventType: String, title: String, body: String) {
        val channelId = getChannelIdForEventType(eventType) ?: return

        try {
            val pendingIntent = createMainActivityPendingIntent(context)
            val notification = buildNotification(context, channelId, title, body, pendingIntent)

            val notificationId = System.currentTimeMillis().toInt()
            NotificationManagerCompat.from(context).notify(notificationId, notification)
        } catch (e: Exception) {
            // Log error but don't crash the app
            Log.e("ESPNotificationHelper", "Failed to show notification", e)
        }
    }

    /**
     * Maps event types to their corresponding notification channel IDs.
     */
    private fun getChannelIdForEventType(eventType: String): String? {
        return when (eventType) {
            "node_added" -> CHANNEL_NODE_ADDED
            "node_removed" -> CHANNEL_NODE_REMOVED
            "node_online" -> CHANNEL_NODE_ONLINE
            "node_offline" -> CHANNEL_NODE_OFFLINE
            else -> null
        }
    }

    /**
     * Creates a PendingIntent that opens the main activity.
     */
    private fun createMainActivityPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        return PendingIntent.getActivity(context, 0, intent, flags)
    }

    /**
     * Builds a notification with the specified parameters.
     */
    private fun buildNotification(
        context: Context,
        channelId: String,
        title: String,
        body: String,
        pendingIntent: PendingIntent
    ): android.app.Notification {
        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        return NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_esp_notification_icon)
            .setColor(NOTIFICATION_COLOR.toColorInt())
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setContentIntent(pendingIntent)
            .build()
    }

}
