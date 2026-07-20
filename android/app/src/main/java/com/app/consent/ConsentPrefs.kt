/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.consent

import android.content.Context

/**
 * Native persistence for the CN-region privacy consent.
 *
 * Stored in SharedPreferences (separate from the JS AsyncStorage flag) so that
 * MainActivity can decide at cold start — before any JS runs — whether to defer
 * the startup permission prompts until the user has accepted consent.
 */
object ConsentPrefs {

    private const val PREFS_NAME = "esp_consent_prefs"
    private const val KEY_CN_CONSENT_ACCEPTED = "cn_consent_accepted"

    /**
     * @param context Android context.
     * @return True if CN consent was previously accepted.
     */
    fun isAccepted(context: Context): Boolean =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_CN_CONSENT_ACCEPTED, false)

    /**
     * Persists the CN consent acceptance state.
     *
     * @param context Android context.
     * @param accepted Whether consent has been accepted.
     */
    fun setAccepted(context: Context, accepted: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_CN_CONSENT_ACCEPTED, accepted)
            .apply()
    }
}
