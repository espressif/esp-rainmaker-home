/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.googlesignin

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext

/**
 * Global-flavor provider: contributes the Google sign-in native module.
 *
 * A parallel no-op implementation lives in the `cn` source set so
 * MainApplication (in `main`) can register Google unconditionally while the
 * Credential Manager / Play services dependent module ships only in the global
 * build.
 */
object GoogleSignInModuleProvider {
    fun create(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(ESPGoogleSignInModule(reactContext))
}
