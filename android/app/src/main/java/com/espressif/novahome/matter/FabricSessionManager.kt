/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

data class FabricInfo(
    val groupId: String?,
    val fabricId: String?,
    val name: String?,
    val rootCa: String?,
    val ipk: String?,
    val userNoc: String?,
    val groupCatIdOperate: String?,
    val groupCatIdAdmin: String?,
    val matterUserId: String?,
    val userCatId: String?
)

object FabricSessionManager {
    private var currentFabric: FabricInfo? = null
    private var currentChipClient: ChipClient? = null

    fun setCurrentFabric(fabricInfo: FabricInfo) {
        currentFabric = fabricInfo
    }

    fun getCurrentFabric(): FabricInfo? = currentFabric

    fun clearCurrentFabric() {
        currentFabric = null
        currentChipClient = null
    }

    fun hasFabric(): Boolean = currentFabric != null

    fun setCurrentChipClient(chipClient: ChipClient) {
        currentChipClient = chipClient
    }

    fun getCurrentChipClient(): ChipClient? {
        return currentChipClient
    }

    fun clearCurrentChipClient() {
        currentChipClient = null
    }
}
