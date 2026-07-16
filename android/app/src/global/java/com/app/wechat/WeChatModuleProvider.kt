/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.wechat

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext

/**
 * Global-flavor provider: WeChat is CN-only, so this contributes nothing. The
 * real implementation lives in the `cn` source set. Keeping a matching no-op
 * here lets MainApplication (in `main`) reference the provider for both flavors.
 */
object WeChatModuleProvider {
    fun create(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()
}
