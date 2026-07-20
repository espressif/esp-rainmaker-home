/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.notification

import android.content.Context

/**
 * CN-flavor push bootstrap — intentionally a no-op.
 *
 * The CN build ships without Firebase / Google Play services, so there is no
 * FCM to initialize. Mirrors the Global flavor's [PushBootstrap] signature so
 * shared code (MainActivity) compiles for both flavors.
 */
object PushBootstrap {

    /**
     * No-op for CN builds (push notifications are disabled; no Firebase).
     *
     * @param context Unused; kept for API parity with the Global flavor.
     */
    @Suppress("UNUSED_PARAMETER")
    fun initialize(context: Context) {
        // No Firebase/FCM in the CN build.
    }
}
