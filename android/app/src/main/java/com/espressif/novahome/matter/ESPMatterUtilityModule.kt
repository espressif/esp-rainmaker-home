/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.util.Log
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager
import java.security.KeyStore
import java.security.cert.Certificate

private fun ReadableMap.getStringOrNull(key: String): String? =
    if (hasKey(key) && !isNull(key)) getString(key) else null

class ESPMatterUtilityModule (reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ReactPackage {

    companion object {
        private const val TAG = "ESPMatterUtilityModule"
    }

    /**
     * Registers the React Native module as a package, enabling it to provide view managers and native modules.
     */
    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = listOf(this).toMutableList()

    override fun getName() = "ESPMatterUtilityModule"

    @ReactMethod
    fun isUserNocAvailableForFabric(fabricId: String, promise: Promise) {
        try {
            if (fabricId.isEmpty()) {
                promise.reject("invalid_params", "fabricId is required")
                return
            }

            val keyStore = KeyStore.getInstance(AppConstants.KEYSTORE_ANDROID)
            keyStore.load(null)

            val chain = keyStore.getCertificateChain(fabricId)
            val count = chain?.size ?: 0

            val result =  count >= 2
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check KeyStore for NOC: ${e.message}", e)
            promise.reject("keystore_error", e)
        }
    }

    @ReactMethod
    fun storePrecommissionInfo(params: ReadableMap, promise: Promise) {
        Log.d(TAG, "========== STORING PRE-COMMISSION INFO ==========")

        val groupId = params.getStringOrNull(AppConstants.KEY_GROUP_ID_CAMEL)
        val fabricId = params.getStringOrNull(AppConstants.KEY_FABRIC_ID_CAMEL)
        val name = params.getStringOrNull(AppConstants.KEY_NAME)
        val userNoc = params.getStringOrNull(AppConstants.KEY_USER_NOC)
        val matterUserId = params.getStringOrNull(AppConstants.KEY_MATTER_USER_ID)
        val rootCa = params.getStringOrNull(AppConstants.KEY_ROOT_CA_CAMEL)
        val ipk = params.getStringOrNull(AppConstants.KEY_IPK_CAMEL)
        val groupCatIdOperate = params.getStringOrNull(AppConstants.KEY_GROUP_CAT_ID_OPERATE)
        val groupCatIdAdmin = params.getStringOrNull(AppConstants.KEY_GROUP_CAT_ID_ADMIN)
        val userCatId = params.getStringOrNull(AppConstants.KEY_USER_CAT_ID)

        try {
            if (groupId.isNullOrEmpty() || fabricId.isNullOrEmpty() || userNoc.isNullOrEmpty() || rootCa.isNullOrEmpty() || matterUserId.isNullOrEmpty()) {
                Log.e(TAG, "Missing required parameters:")
                promise.reject("INVALID_PARAMS", "Group ID, Fabric ID, User NOC, Root CA, and Matter User ID are required")
                return
            }

            val keyStore = KeyStore.getInstance(AppConstants.KEYSTORE_ANDROID)
            keyStore.load(null)
            Log.d(TAG, "Android KeyStore initialized successfully")

            val privateKey = keyStore.getKey(fabricId, null)
            if (privateKey == null) {
                Log.e(TAG, "KEY_NOT_FOUND")
                promise.reject("KEY_NOT_FOUND", "Private key not found for fabric: $fabricId")
                return
            }

            val certificates = arrayOfNulls<Certificate>(2)

            try {
                certificates[0] = MatterFabricUtils.decode(userNoc)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to decode User NOC: ${e.message}")
                throw e
            }

            try {
                certificates[1] = MatterFabricUtils.decode(rootCa)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to decode Root CA: ${e.message}")
                throw e
            }

            keyStore.setKeyEntry(fabricId, privateKey, null, certificates)

            try {
                val readBackChain = keyStore.getCertificateChain(fabricId)
            } catch (rb: Exception) {
                Log.w(TAG, "KeyStore read-back failed: ${rb.message}")
            }

            val fabricInfo = FabricInfo(
                groupId = groupId,
                fabricId = fabricId,
                name = name,
                rootCa = rootCa,
                ipk = ipk,
                userNoc = userNoc,
                groupCatIdOperate = groupCatIdOperate,
                groupCatIdAdmin = groupCatIdAdmin,
                matterUserId = matterUserId,
                userCatId = userCatId
            )
            FabricSessionManager.setCurrentFabric(fabricInfo)

            val storeResult = Arguments.createMap().apply {
                putBoolean(AppConstants.KEY_SUCCESS, true)
                putString(AppConstants.KEY_MESSAGE, AppConstants.MESSAGE_PRECOMMISSION_STORED)
                putString(AppConstants.KEY_GROUP_ID, groupId)
                putString(AppConstants.KEY_FABRIC_ID, fabricId)
                putString(AppConstants.KEY_NAME, name)
                putString(AppConstants.KEY_MATTER_USER_ID, matterUserId)
            }

            promise.resolve(storeResult)

            try {
                val evt = Arguments.createMap().apply {
                    putString(AppConstants.KEY_EVENT_TYPE, AppConstants.EVENT_NOC_STORED)
                    putString(AppConstants.KEY_FABRIC_ID, fabricId)
                    putString(AppConstants.KEY_GROUP_ID, groupId)
                    putString(AppConstants.KEY_NAME, name)
                }
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(AppConstants.EVENT_MATTER_COMMISSIONING, evt)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to emit NOC_STORED event: ${e.message}")
            }

        } catch (error: Exception) {
            Log.e(TAG, "Failed to store pre-commission info")
            promise.reject("STORE_PRECOMMISSION_ERROR", "Failed to store pre-commission info: ${error.message}", error)
        }
    }

}