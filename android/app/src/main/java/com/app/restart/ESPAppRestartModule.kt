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
 * Restarts the app by relaunching it as a brand-new OS process.
 *
 * An in-place JS runtime reload (`ReactHost.reload()`, what
 * expo-react-native-restart performs) keeps the native process alive, so JSI
 * state bound to the destroyed Hermes runtime outlives it. react-native-skia
 * caches `PropNameID`s inside its `JsiHostObject`s; after a reload those
 * dangle and the next Skia property read segfaults the JS thread. Killing and
 * relaunching the process is the only way to guarantee that no stale
 * JSI/native state carries over.
 */
class ESPAppRestartModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx) {

    override fun getName(): String = NAME

    /**
     * Starts the launcher activity in a fresh task, then exits so Android
     * recreates the process from scratch.
     *
     * On success the promise never settles — the process is gone first. Every
     * failure path rejects instead, which is what lets `ESPAppRestartAdapter`
     * fall back to an in-place runtime reload.
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
                // Must reject rather than let this escape: an uncaught throw on
                // the UI thread would crash the app and leave the promise
                // unsettled, so the JS-side fallback would never run.
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
