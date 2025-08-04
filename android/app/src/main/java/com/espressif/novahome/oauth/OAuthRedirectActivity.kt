/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.oauth

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.espressif.novahome.MainActivity

/**
 * OAuthRedirectActivity handles OAuth redirects exclusively without interfering
 * with React Native's routing system or Expo Router.
 *
 * Features:
 * - Single top launch mode (reuses existing instance)
 * - Immediately processes OAuth redirect and closes
 * - Brings main app to foreground after processing
 */
class OAuthRedirectActivity : Activity() {

    companion object {
        private const val TAG = "OAuthRedirectActivity"
        private const val OAUTH_SCHEME = "rainmaker://"
        private const val FOREGROUND_DELAY_MS = 100L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        processIntentAndFinish(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let { processIntentAndFinish(it) }
    }

    /**
     * Processes the OAuth redirect intent and finishes the activity.
     *
     * @param intent The intent containing the OAuth redirect data
     */
    private fun processIntentAndFinish(intent: Intent) {
        handleOAuthRedirect(intent)
        bringMainAppToForeground()
        finish()
    }

    /**
     * Handles the OAuth redirect by delegating to ESPOauthModule.
     * Only processes intents with valid OAuth scheme.
     *
     * @param intent The intent containing the OAuth redirect data
     */
    private fun handleOAuthRedirect(intent: Intent) {
        if (intent.action == Intent.ACTION_VIEW && intent.data != null) {
            val url = intent.data.toString()
            if (url.startsWith(OAUTH_SCHEME)) {
                ESPOauthModule.handleOAuthRedirect(intent)
            }
        }
    }

    /**
     * Brings the main app to the foreground with a small delay to ensure
     * proper transition from Custom Tab back to the app.
     */
    private fun bringMainAppToForeground() {
        try {
            val mainIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }

            Handler(Looper.getMainLooper()).postDelayed({
                startActivity(mainIntent)
            }, FOREGROUND_DELAY_MS)
        } catch (e: Exception) {
            // Silently handle error - app will remain in current state
        }
    }
}
