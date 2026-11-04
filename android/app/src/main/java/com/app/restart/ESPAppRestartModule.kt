/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */
package com.app.restart

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Relaunches the app as a new OS process. JS calls this only when reloading
 * the JS runtime in place fails.
 */
class ESPAppRestartModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx) {

    override fun getName(): String = NAME

    /**
     * Starts the launcher activity in a fresh task, then exits so Android
     * recreates the process from scratch.
     *
     * On success the promise never settles — the process is gone first. Every
     * failure path rejects instead, so the JS caller gets the error.
     */
    @ReactMethod
    fun restartApp(promise: Promise) {
        val appCtx = reactCtx.applicationContext
        val component = try {
            appCtx.packageManager
                .getLaunchIntentForPackage(appCtx.packageName)
                ?.component
        } catch (t: Throwable) {
            promise.reject(ERR_RESTART_FAILED, t)
            return
        }

        if (component == null) {
            promise.reject(
                ERR_NO_LAUNCH_INTENT,
                "No launcher activity found for ${appCtx.packageName}"
            )
            return
        }

        UiThreadUtil.runOnUiThread {
            try {
                // makeRestartActivityTask sets NEW_TASK | CLEAR_TASK, so the app
                // comes back up on a clean back stack.
                appCtx.startActivity(Intent.makeRestartActivityTask(component))
                Runtime.getRuntime().exit(0)
            } catch (t: Throwable) {
                // Rejects instead of throwing: an uncaught throw on the UI thread
                // would crash the app and the JS caller would never get the error.
                promise.reject(ERR_RESTART_FAILED, t)
            }
        }
    }

    private companion object {
        const val NAME = "ESPAppRestartModule"
        const val ERR_NO_LAUNCH_INTENT = "ERR_NO_LAUNCH_INTENT"
        const val ERR_RESTART_FAILED = "ERR_RESTART_FAILED"
    }
}
