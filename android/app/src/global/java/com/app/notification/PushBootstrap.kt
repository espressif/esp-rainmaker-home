/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.notification

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Global-flavor push bootstrap.
 *
 * Initializes Firebase and disables FCM auto-init (token retrieval is driven
 * explicitly from React Native via [ESPNotificationModule.getDeviceToken]).
 * The CN flavor provides a no-op implementation with the same signature so
 * the CN build ships without any Firebase dependency.
 */
object PushBootstrap {

    /**
     * Initializes Firebase Cloud Messaging for the Global build.
     *
     * @param context Android context used to initialize Firebase.
     */
    fun initialize(context: Context) {
        FirebaseApp.initializeApp(context)
        FirebaseMessaging.getInstance().isAutoInitEnabled = false
    }
}
