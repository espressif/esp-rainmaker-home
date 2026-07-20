/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.wechat

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.app.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.tencent.mm.opensdk.modelmsg.SendAuth
import com.tencent.mm.opensdk.openapi.IWXAPI
import com.tencent.mm.opensdk.openapi.WXAPIFactory

/**
 * ESPWeChatModule — bridge between the React Native JS layer and the native
 * WeChat SDK. CN-flavor only (the WeChat SDK ships solely in the CN build).
 *
 * Flow:
 *   init():                register the app with WeChat (once, on module load)
 *   initiateWeChatLogin(): send the auth request when the user taps the button
 *   WXEntryActivity:       receive the auth code and resolve the pending JS
 *                          promise via this module; the RainMaker Base SDK then
 *                          exchanges the code for tokens on the JS side
 *
 * The App ID comes from `BuildConfig.WECHAT_APP_ID` (synced from `WECHAT_APP_ID`
 * in .env).
 *
 * NOTE: registerApp and sendReq must not run in the same frame — the SDK commits
 * registration to an IPC store that sendReq reads, so we register early (init)
 * and only sendReq on tap.
 */
class ESPWeChatModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ESPWeChatModule"

        /** WeChat App ID for this build (empty when unconfigured). */
        @JvmField
        val WECHAT_APP_ID: String = BuildConfig.WECHAT_APP_ID

        @JvmField
        @Volatile
        var instance: ESPWeChatModule? = null
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var pendingLoginPromise: Promise? = null

    @Volatile
    var currentWxApi: IWXAPI? = null

    init {
        instance = this
        // Register with WeChat immediately so the SDK has committed registration
        // to its IPC store well before sendReq runs (on button tap).
        val appId = WECHAT_APP_ID
        if (appId.isNotBlank()) {
            mainHandler.post {
                try {
                    val api = WXAPIFactory.createWXAPI(reactContext, appId, true)
                    api.registerApp(appId)
                    currentWxApi = api
                    Log.d(TAG, "init: registered appId=$appId, isInstalled=${api.isWXAppInstalled}")
                } catch (e: Exception) {
                    Log.e(TAG, "init: registerApp failed: ${e.message}", e)
                }
            }
        } else {
            Log.w(TAG, "init: WECHAT_APP_ID is blank in BuildConfig, skipping registration")
        }
    }

    override fun getName() = "ESPWeChatModule"

    /**
     * WeChat login entry point from JS. Resolves with `{ code }` — the raw
     * WeChat authorization code; the RainMaker Base SDK performs the token
     * exchange on the JS side. The `tokenUrl` / `clientId` / `redirectUri`
     * parameters are unused but kept so the bridge method signature stays
     * stable across platforms.
     */
    @Suppress("UNUSED_PARAMETER")
    @ReactMethod
    fun initiateWeChatLogin(
        tokenUrl: String,
        clientId: String,
        redirectUri: String,
        promise: Promise
    ) {
        val appId = WECHAT_APP_ID
        if (appId.isBlank()) {
            promise.reject("WECHAT_CONFIG_ERROR", "WeChat App ID is not configured in this build")
            return
        }

        pendingLoginPromise = promise

        mainHandler.post {
            try {
                var api = currentWxApi
                if (api == null) {
                    val ctx = reactApplicationContext.currentActivity ?: reactApplicationContext
                    api = WXAPIFactory.createWXAPI(ctx, appId, true)
                    api.registerApp(appId)
                    currentWxApi = api
                    // Defer sendReq one frame so registration commits first.
                    mainHandler.post { sendAuthRequest(api) }
                    return@post
                }

                if (!api.isWXAppInstalled) {
                    rejectLogin("WECHAT_NOT_INSTALLED: WeChat is not installed")
                    return@post
                }

                sendAuthRequest(api)
            } catch (e: Exception) {
                Log.e(TAG, "initiateWeChatLogin error: ${e.message}", e)
                rejectLogin("WECHAT_AUTH_FAILED: ${e.message}")
            }
        }
    }

    private fun sendAuthRequest(api: IWXAPI) {
        val req = SendAuth.Req()
        req.scope = "snsapi_userinfo"
        req.state = "esp_rainmaker_wechat_login"
        val success = api.sendReq(req)
        Log.d(TAG, "sendAuthReq dispatched: $success")
        if (!success) {
            rejectLogin("WECHAT_AUTH_FAILED: sendReq returned false")
        }
    }

    /**
     * Called by WXEntryActivity with the raw WeChat auth code. JS then hands the
     * code to the Base SDK, which performs the token exchange. This is the
     * current path — token exchange lives in the SDK, not the app.
     */
    fun resolveWithCode(code: String) {
        val map = Arguments.createMap().apply {
            putString("code", code)
        }
        pendingLoginPromise?.resolve(map)
        pendingLoginPromise = null
    }

    /** Called by WXEntryActivity (or internally) when the attempt fails/cancels. */
    fun rejectLogin(error: String) {
        Log.e(TAG, "rejectLogin: $error")
        pendingLoginPromise?.reject("WECHAT_AUTH_FAILED", error)
        pendingLoginPromise = null
    }

    @Suppress("DEPRECATION")
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        pendingLoginPromise?.reject("WECHAT_AUTH_FAILED", "Module destroyed")
        pendingLoginPromise = null
        currentWxApi = null
        instance = null
    }
}
