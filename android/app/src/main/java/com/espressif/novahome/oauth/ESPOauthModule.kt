/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.oauth

import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import androidx.core.net.toUri

/**
 * ESPOauthModule provides OAuth functionality for React Native applications.
 * This module opens OAuth authorization URLs using Chrome Custom Tabs for a seamless in-app experience
 * and handles deep link redirects directly on the Android side to extract authorization codes.
 *
 * Features:
 * - Chrome Custom Tabs for in-app OAuth browsing
 * - Fallback to default browser if Custom Tabs unavailable
 * - Styled to match app theme
 * - Smooth animations and transitions
 */
class ESPOauthModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ESPOauthModule"
        private const val OAUTH_SCHEME = "rainmaker://com.espressif.novahome"

        // Error codes
        private const val ERROR_OAUTH_START = "OAUTH_START_ERROR"
        private const val ERROR_NO_BROWSER = "NO_BROWSER_FOUND"
        private const val ERROR_OAUTH_ERROR = "OAUTH_ERROR"
        private const val ERROR_PARSE_ERROR = "OAUTH_PARSE_ERROR"
        private const val ERROR_PROCESS_ERROR = "OAUTH_PROCESS_ERROR"
        private const val ERROR_MODULE_DESTROYED = "MODULE_DESTROYED"

        @Volatile
        private var instance: ESPOauthModule? = null

        fun getInstance(): ESPOauthModule? = instance

        /**
         * Called by OAuthRedirectActivity when an OAuth redirect is received.
         *
         * @param intent The intent containing the OAuth redirect data
         */
        fun handleOAuthRedirect(intent: Intent) {
            getInstance()?.processOAuthRedirect(intent)
        }
    }

    @Volatile
    private var pendingOAuthRequest: Promise? = null

    init {
        instance = this
    }

    override fun getName() = "ESPOauthModule"

    /**
     * Starts the OAuth flow by opening the authorization URL and waiting for redirect.
     * This method replaces the previous separate openUrl and listening approach.
     *
     * @param url The OAuth authorization URL to open
     * @param promise Promise to resolve with the authorization code or reject with error
     */
    @ReactMethod
    fun getOauthCode(url: String, promise: Promise) {
        try {
            pendingOAuthRequest = promise

            try {
                openWithCustomTabs(url)
            } catch (e: Exception) {
                openWithDefaultBrowser(url, promise)
            }

        } catch (e: Exception) {
            promise.reject(ERROR_OAUTH_START, "Failed to start OAuth flow: ${e.message}")
        }
    }

    /**
     * Opens the OAuth URL using Chrome Custom Tabs for a better in-app browsing experience.
     *
     * @param url The OAuth authorization URL to open
     * @throws Exception if Custom Tabs cannot be launched
     */
    private fun openWithCustomTabs(url: String) {
        val uri = url.toUri()

        val currentActivity = reactApplicationContext.currentActivity
            ?: throw Exception("No current activity available for Custom Tabs")

        val customTabsIntent = CustomTabsIntent.Builder().apply {
            setToolbarColor(
                ContextCompat.getColor(
                    reactApplicationContext,
                    com.espressif.novahome.R.color.colorPrimary
                )
            )
            setShowTitle(true)
            setUrlBarHidingEnabled(true)
            setStartAnimations(
                reactApplicationContext,
                android.R.anim.slide_in_left,
                android.R.anim.slide_out_right
            )
            setExitAnimations(
                reactApplicationContext,
                android.R.anim.slide_in_left,
                android.R.anim.slide_out_right
            )
        }.build()

        customTabsIntent.launchUrl(currentActivity, uri)
    }

    /**
     * Fallback method to open OAuth URL using the default browser.
     *
     * @param url The OAuth authorization URL to open
     * @param promise The promise to reject if browser cannot be opened
     */
    private fun openWithDefaultBrowser(url: String, promise: Promise) {
        val currentActivity = reactApplicationContext.currentActivity
        if (currentActivity != null) {
            val intent = Intent(Intent.ACTION_VIEW, url.toUri())
            currentActivity.startActivity(intent)
        } else {
            val intent = Intent(Intent.ACTION_VIEW, url.toUri()).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            val packageManager = reactApplicationContext.packageManager
            if (intent.resolveActivity(packageManager) != null) {
                reactApplicationContext.startActivity(intent)
            } else {
                pendingOAuthRequest = null
                promise.reject(
                    ERROR_NO_BROWSER,
                    "No application found to handle the OAuth URL"
                )
            }
        }
    }

    /**
     * Processes OAuth redirect received by OAuthRedirectActivity
     */
    private fun processOAuthRedirect(intent: Intent) {
        try {
            val data = intent.data ?: return

            val url = data.toString()
            if (url.startsWith(OAUTH_SCHEME)) {
                val authCode = extractAuthCodeFromUrl(data)
                val error = extractErrorFromUrl(data)

                val promise = pendingOAuthRequest
                if (promise != null) {
                    pendingOAuthRequest = null

                    when {
                        authCode != null -> {
                            promise.resolve(authCode)
                        }

                        error != null -> {
                            promise.reject(ERROR_OAUTH_ERROR, "OAuth error: $error")
                        }

                        else -> {
                            promise.reject(
                                ERROR_PARSE_ERROR,
                                "No authorization code found in redirect URL"
                            )
                        }
                    }
                }
            }

        } catch (e: Exception) {
            val promise = pendingOAuthRequest
            if (promise != null) {
                pendingOAuthRequest = null
                promise.reject(
                    ERROR_PROCESS_ERROR,
                    "Failed to process OAuth redirect: ${e.message}"
                )
            }
        }
    }

    /**
     * Extracts the authorization code from the OAuth redirect URI
     */
    private fun extractAuthCodeFromUrl(uri: Uri): String? {
        return uri.getQueryParameter("code")
    }

    /**
     * Extracts error information from the OAuth redirect URI
     */
    private fun extractErrorFromUrl(uri: Uri): String? {
        val error = uri.getQueryParameter("error")
        val errorDescription = uri.getQueryParameter("error_description")

        return when {
            error != null && errorDescription != null -> "$error: $errorDescription"
            error != null -> error
            else -> null
        }
    }

    /**
     * Clean up when module is destroyed
     */
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()

        pendingOAuthRequest?.reject(ERROR_MODULE_DESTROYED, "OAuth module was destroyed")
        pendingOAuthRequest = null
        instance = null
    }
} 