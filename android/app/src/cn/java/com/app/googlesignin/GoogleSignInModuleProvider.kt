/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.googlesignin

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext

/**
 * CN-flavor provider: Google login is not offered in the CN region — the APK
 * ships without Google Play services and the CN cloud has no federated auth
 * endpoint — so this contributes nothing. The real implementation lives in the
 * `global` source set. Keeping a matching no-op here lets MainApplication (in
 * `main`) reference the provider for both flavors.
 */
object GoogleSignInModuleProvider {
    fun create(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()
}
