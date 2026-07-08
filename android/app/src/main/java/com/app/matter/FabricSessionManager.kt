/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.content.Context
import android.util.Log

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
    val userCatId: String?,
    val sigv4AccessKey: String? = null,
    val sigv4SecretKey: String? = null,
    val sigv4SessionToken: String? = null,
    val sigv4Expiration: String? = null,
    val requestId: String? = null,
    val csrNonce: String? = null
)

object FabricSessionManager {
    private const val TAG = "FabricSessionManager"

    private var currentFabric: FabricInfo? = null
    private var currentChipClient: ChipClient? = null

    fun setCurrentFabric(fabricInfo: FabricInfo) {
        val previousFabricId = currentFabric?.fabricId
        if (previousFabricId != null && previousFabricId != fabricInfo.fabricId) {
            Log.i(
                TAG,
                "[MatterDiscovery] setCurrentFabric: fabric changed $previousFabricId → ${fabricInfo.fabricId}, clearing ChipClient",
            )
            clearCurrentChipClient()
        }
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

    /**
     * Pushes RMNG commissioning credentials from the in-memory fabric session onto the
     * active [ChipClient]. Required because [ESPMatterCommissioningService.onCreate] can run
     * before JS calls `initiateNodeAssociation` / [ESPMatterModule.storeFabricDetails], leaving
     * a stale null csrNonce on the client until GPS reaches `commissionDevice`.
     */
    fun syncCommissioningCredentialsToChipClient() {
        val fabric = currentFabric ?: return
        val client = currentChipClient ?: return
        fabric.requestId?.let { client.requestId = it }
        fabric.csrNonce?.let { client.csrNonce = it }
        Log.d(
            TAG,
            "[NONCE-TRACE] syncCommissioningCredentials: csrNonce=${fabric.csrNonce?.take(16)}..." +
                " (len=${fabric.csrNonce?.length}), requestId=${fabric.requestId}",
        )
    }

    /**
     * Returns an active [ChipClient] for the current fabric, creating one when fabric
     * credentials are in the session but no client has been instantiated yet (e.g. after
     * `storePrecommissionInfo` and before commissioning).
     *
     * @param context Application context used to construct a new client when needed.
     * @return Chip client bound to the current fabric, or `null` when fabric data is missing.
     */
    fun resolveChipClient(context: Context): ChipClient? {
        currentChipClient?.let {
            Log.v(TAG, "[MatterDiscovery] resolveChipClient: reusing cached ChipClient")
            syncCommissioningCredentialsToChipClient()
            return it
        }

        val fabric = currentFabric
        if (fabric == null) {
            Log.w(TAG, "[MatterDiscovery] resolveChipClient: no fabric in session")
            return null
        }

        val groupId = fabric.groupId
        val fabricId = fabric.fabricId
        val rootCa = fabric.rootCa
        val userNoc = fabric.userNoc
        val ipk = fabric.ipk

        if (groupId.isNullOrEmpty() || fabricId.isNullOrEmpty() ||
            rootCa.isNullOrEmpty() || ipk.isNullOrEmpty()
        ) {
            Log.w(
                TAG,
                "[MatterDiscovery] resolveChipClient: fabric incomplete — " +
                    "groupId=${!groupId.isNullOrEmpty()} fabricId=${!fabricId.isNullOrEmpty()} " +
                    "rootCa=${!rootCa.isNullOrEmpty()} ipk=${!ipk.isNullOrEmpty()}",
            )
            return null
        }

        if (userNoc.isNullOrEmpty() && !hasKeyStoreOperationalChain(fabricId)) {
            Log.w(
                TAG,
                "[MatterDiscovery] resolveChipClient: userNoc missing and KeyStore chain unavailable for fabricId=$fabricId",
            )
            return null
        }

        Log.i(
            TAG,
            "[MatterProbe][fabric] resolveChipClient: creating ChipClient fabricId=$fabricId groupId=$groupId " +
                "userNocPresent=${!userNoc.isNullOrEmpty()} matterUserIdPresent=${!fabric.matterUserId.isNullOrEmpty()} " +
                "(operational identity = userNoc/KeyStore chain; matterUserId is NOT required to build ChipClient)",
        )

        return ChipClient(
            context.applicationContext,
            groupId,
            fabricId,
            rootCa,
            userNoc ?: "",
            ipk,
            fabric.groupCatIdOperate ?: "",
            fabric.groupCatIdAdmin ?: "",
        ).also { client ->
            fabric.requestId?.let { client.requestId = it }
            fabric.csrNonce?.let { client.csrNonce = it }
            currentChipClient = client
            Log.d(TAG, "[MatterDiscovery] resolveChipClient: ChipClient cached for fabricId=$fabricId")
        }
    }

    /**
     * Returns true when Android KeyStore holds an operational cert chain for the fabric.
     *
     * @param fabricId KeyStore alias / RainMaker fabric id.
     */
    private fun hasKeyStoreOperationalChain(fabricId: String): Boolean {
        return try {
            val keyStore = java.security.KeyStore.getInstance(AppConstants.KEYSTORE_ANDROID)
            keyStore.load(null)
            (keyStore.getCertificateChain(fabricId)?.size ?: 0) >= 2
        } catch (e: Exception) {
            Log.w(TAG, "[MatterDiscovery] hasKeyStoreOperationalChain failed: ${e.message}")
            false
        }
    }
}
