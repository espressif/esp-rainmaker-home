/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.wechat

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext

/**
 * CN-flavor provider: contributes the WeChat native module.
 *
 * A parallel no-op implementation lives in the `global` source set so
 * MainApplication (in `main`) can register WeChat unconditionally while the
 * WeChat SDK-dependent module ships only in the CN build.
 */
object WeChatModuleProvider {
    fun create(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(ESPWeChatModule(reactContext))
}
