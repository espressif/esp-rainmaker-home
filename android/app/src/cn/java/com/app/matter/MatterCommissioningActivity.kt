/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.app.Activity
import android.os.Bundle
import android.util.Log

/**
 * CN-flavor stub for MatterCommissioningActivity.
 *
 * The CN build uses in-app ChipTool commissioning and ships without Google
 * Play services, so the Google-Home-based commissioning activity does not exist.
 * This stub keeps the class (and its [KEY_ON_BOARD_PAYLOAD] key) available so
 * shared code in [ESPMatterModule] compiles. It is never launched in CN —
 * ESPMatterModule routes to ChipTool — and is intentionally not declared in the
 * CN manifest.
 */
class MatterCommissioningActivity : Activity() {

    companion object {
        private const val TAG = "MatterCommissioningActivity"
        const val KEY_ON_BOARD_PAYLOAD = "on_board_payload"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.w(TAG, "Google Play services Matter commissioning is unavailable in the CN build.")
        finish()
    }
}
