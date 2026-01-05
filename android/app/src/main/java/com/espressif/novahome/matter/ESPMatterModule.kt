/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.content.Intent
import android.util.Log
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.bridge.Promise
import org.bouncycastle.operator.ContentSigner
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import org.bouncycastle.pkcs.jcajce.JcaPKCS10CertificationRequestBuilder
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.Base64
import javax.security.auth.x500.X500Principal
import com.facebook.react.modules.core.DeviceEventManagerModule

class ESPMatterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ReactPackage {

    companion object {
        private const val TAG = "ESPMatterModule"
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

    override fun getName() = "ESPMatterModule"

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
    }


    private fun sendNOCChainToChipClientInternal(
        deviceId: String,
        requestId: String,
        rootCert: String,
        intermediateCert: String,
        operationalCert: String,
        ipkValue: String,
        adminVendorId: String,
        matterNodeId: String
    ): WritableMap {

        val chipClient = FabricSessionManager.getCurrentChipClient()
        if (chipClient != null) {
            chipClient.receiveNOCChain(
                requestId = requestId,
                rootCert = rootCert,
                intermediateCert = intermediateCert,
                operationalCert = operationalCert,
                ipkValue = ipkValue,
                adminVendorId = adminVendorId,
                matterNodeId = matterNodeId
            )
        } else {
            throw Exception("No active ChipClient found")
        }

        return Arguments.createMap().apply {
            putString(AppConstants.KEY_STATUS, AppConstants.STATUS_SUCCESS)
            putString(AppConstants.KEY_MESSAGE_CAMEL, AppConstants.MESSAGE_NOC_CHAIN_RECEIVED)
            putString(AppConstants.KEY_DEVICE_ID_CAMEL, deviceId)
            putString(AppConstants.KEY_REQUEST_ID_CAMEL, requestId)
        }
    }

    private fun sendNocResponseInternal(responseData: ReadableMap): String {

        val requestId = responseData.optString(AppConstants.KEY_REQUEST_ID_CAMEL) ?: ""
        val matterNodeIdValue = responseData.optString(AppConstants.KEY_MATTER_NODE_ID_CAMEL) ?: ""
        val nodeNocValue = responseData.optString(AppConstants.KEY_NODE_NOC)
        val bundle = android.os.Bundle().apply {
            putString(AppConstants.KEY_NODE_NOC, nodeNocValue)
            putString(AppConstants.KEY_REQUEST_ID_CAMEL, requestId)
            putString(AppConstants.KEY_MATTER_NODE_ID_CAMEL, matterNodeIdValue)
        }

        return AppConstants.MESSAGE_NOC_RESPONSE_SENT
    }

    private fun sendConfirmResponseInternal(responseData: ReadableMap): String {

        val requestId = responseData.optString(AppConstants.KEY_REQUEST_ID_CAMEL)
        val statusValue =
            responseData.optString(AppConstants.KEY_STATUS) ?: AppConstants.STATUS_SUCCESS
        val descriptionValue = responseData.optString(AppConstants.KEY_DESCRIPTION) ?: ""
        val rainmakerNodeIdValue =
            responseData.optString(AppConstants.KEY_RAINMAKER_NODE_ID_CAMEL) ?: ""
        val isRainmakerNodeValue =
            responseData.optBoolean(AppConstants.KEY_IS_RAINMAKER_NODE_CAMEL, true)
        val matterNodeIdValue = responseData.optString(AppConstants.KEY_MATTER_NODE_ID_CAMEL) ?: ""
        val deviceIdValue = responseData.optString(AppConstants.KEY_DEVICE_ID_CAMEL) ?: ""
        val errorCodeValue = responseData.optString(AppConstants.KEY_ERROR_CODE_CAMEL)
        val errorMessageValue = responseData.optString(AppConstants.KEY_ERROR_MESSAGE_CAMEL) ?: ""
        val bundle = android.os.Bundle().apply {
            putString(AppConstants.KEY_STATUS, statusValue)
            putString(AppConstants.KEY_DESCRIPTION, descriptionValue)
            putBoolean(AppConstants.KEY_IS_RAINMAKER_NODE_CAMEL, isRainmakerNodeValue)
            putString(AppConstants.KEY_RAINMAKER_NODE_ID_CAMEL, rainmakerNodeIdValue)
            putString(AppConstants.KEY_MATTER_NODE_ID_CAMEL, matterNodeIdValue)
            putString(AppConstants.KEY_REQUEST_ID_CAMEL, requestId ?: "")
            putString(AppConstants.KEY_DEVICE_ID_CAMEL, deviceIdValue)
            errorCodeValue?.let { putString(AppConstants.KEY_ERROR_CODE_CAMEL, it) }
            putString(AppConstants.KEY_ERROR_MESSAGE_CAMEL, errorMessageValue)
        }

        return AppConstants.MESSAGE_CONFIRM_RESPONSE_SENT
    }
    
    /**
     * Helper function to convert Bundle to HashMap for JSON serialization
     */
    private fun bundleToHashMap(bundle: android.os.Bundle?): HashMap<String, Any?> {
        val map = HashMap<String, Any?>()
        bundle?.keySet()?.forEach { key ->
            map[key] = bundle.get(key)
        }
        return map
    }

    @ReactMethod
    fun startEcosystemCommissioning(
        onboardingPayload: String,
        fabricDetails: ReadableMap,
        promise: Promise
    ) {
        Log.d(TAG, "Onboarding Payload: $onboardingPayload")

        try {
            storeFabricDetails(fabricDetails)

            // Start Google Play Services Matter commissioning
            startGooglePlayServicesCommissioning(onboardingPayload, promise)

        } catch (error: Exception) {
            Log.e(TAG, "Matter commissioning failed: ${error.message}", error)
            promise.reject(
                "COMMISSIONING_ERROR",
                "Failed to start Matter commissioning: ${error.message}",
                error
            )
        }
    }

    private fun storeFabricDetails(fabricDetails: ReadableMap) {

        val allKeys = fabricDetails.toHashMap().keys

        val groupId = fabricDetails.optString("groupId") ?: fabricDetails.optString("id")
        val fabricId = fabricDetails.optString("fabricId")
        val name = fabricDetails.optString("name")

        val nestedFabricDetails = fabricDetails.optMap("fabricDetails")
        val detailsSource = nestedFabricDetails ?: fabricDetails

        val rootCa = detailsSource.optString("rootCa") ?: detailsSource.optString("root_ca")
        val ipk = detailsSource.optString("ipk")
        val userNoc = detailsSource.optString("userNoc") ?: detailsSource.optString("user_noc")
        val groupCatIdOperate = detailsSource.optString("groupCatIdOperate")
            ?: detailsSource.optString("group_cat_id_operate")
        val groupCatIdAdmin = detailsSource.optString("groupCatIdAdmin") ?: detailsSource.optString(
            "group_cat_id_admin"
        )
        val matterUserId =
            detailsSource.optString("matterUserId") ?: detailsSource.optString("matter_user_id")
        val userCatId =
            detailsSource.optString("userCatId") ?: detailsSource.optString("user_cat_id")

        val currentFabric = FabricSessionManager.getCurrentFabric()

        val preservedUserNoc =
            if (userNoc.isNullOrEmpty() && currentFabric?.userNoc?.isNotEmpty() == true) {
                currentFabric.userNoc
            } else {
                userNoc
            }

        val preservedMatterUserId =
            if (matterUserId.isNullOrEmpty() && currentFabric?.matterUserId?.isNotEmpty() == true) {
                currentFabric.matterUserId
            } else {
                matterUserId
            }
        val fabricInfo = FabricInfo(
            groupId = groupId,
            fabricId = fabricId,
            name = name,
            rootCa = rootCa,
            ipk = ipk,
            userNoc = preservedUserNoc,
            groupCatIdOperate = groupCatIdOperate,
            groupCatIdAdmin = groupCatIdAdmin,
            matterUserId = preservedMatterUserId,
            userCatId = userCatId
        )

        FabricSessionManager.setCurrentFabric(fabricInfo)
    }

    private fun startGooglePlayServicesCommissioning(onboardingPayload: String, promise: Promise) {

        try {
            val intent =
                Intent(reactApplicationContext, MatterCommissioningActivity::class.java).apply {
                    putExtra(MatterCommissioningActivity.KEY_ON_BOARD_PAYLOAD, onboardingPayload)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
                }
            reactApplicationContext.startActivity(intent)

            promise.resolve("Ecosystem commissioning activity started")

        } catch (error: Exception) {
            promise.reject(
                "ACTIVITY_START_ERROR",
                "Failed to start ecosystem commissioning activity: ${error.message}",
                error
            )
        }
    }

    @ReactMethod
    fun generateCSR(fabricParams: ReadableMap, promise: Promise) {
        Log.d(TAG, "========== GENERATING CSR ==========")

        try {
            val groupId = fabricParams.optString("groupId")
            val fabricId = fabricParams.optString("fabricId")
            val name = fabricParams.optString("name")

            if (groupId.isNullOrEmpty() || fabricId.isNullOrEmpty()) {
                promise.reject("INVALID_PARAMS", "Group ID and Fabric ID are required")
                return
            }

            generateCSRInternal(groupId ?: "", fabricId ?: "", name ?: "", promise)

        } catch (error: Exception) {
            promise.reject(
                "CSR_GENERATION_ERROR", "Failed to generate CSR: ${error.message}", error
            )
        }
    }

    /**
     * Helper function to safely get string from ReadableMap
     */
    private fun ReadableMap.optString(key: String): String? =
        if (hasKey(key) && !isNull(key)) getString(key) else null

    /**
     * Helper function to safely get ReadableMap from ReadableMap
     */
    private fun ReadableMap.optMap(key: String): ReadableMap? =
        if (hasKey(key) && !isNull(key)) getMap(key) else null

    private fun ReadableMap.optBoolean(key: String, defaultValue: Boolean = false): Boolean =
        if (hasKey(key) && !isNull(key)) getBoolean(key) else defaultValue

    private fun generateCSRInternal(
        groupId: String, fabricId: String, name: String, promise: Promise?
    ) {
        Log.d(TAG, "========== GENERATING CSR FOR FABRIC: $name ==========")

        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore")
            keyStore.load(null)

            try {
                val existingChain = keyStore.getCertificateChain(fabricId)
                val existingSize = existingChain?.size ?: 0
                if (existingChain != null && existingChain.size >= 2) {

                    val result = Arguments.createMap().apply {
                        putBoolean(AppConstants.KEY_SUCCESS, true)
                        putString(
                            AppConstants.KEY_MESSAGE_CAMEL,
                            AppConstants.MESSAGE_NOC_ALREADY_STORED
                        )
                        putString(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                        putString(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
                        putString(AppConstants.KEY_NAME, name)
                    }
                    promise?.resolve(result)
                    return
                }
            } catch (e: Exception) {
                Log.w(TAG, "KeyStore pre-check failed for fabricId=$fabricId: ${e.message}")
            }

            val keyPair = MatterFabricUtils.generateKeypair(fabricId)

            val p10Builder = JcaPKCS10CertificationRequestBuilder(X500Principal(""), keyPair.public)
            val csBuilder = JcaContentSignerBuilder(AppConstants.SIGNATURE_ALGORITHM)
            val signer: ContentSigner = csBuilder.build(keyPair.private)
            val csr = p10Builder.build(signer)

            val csrContent = Base64.getEncoder().encodeToString(csr.encoded)
            val finalCsr = "${AppConstants.CERT_BEGIN}\n$csrContent\n${AppConstants.CERT_END}"

            val csrJson = JSONObject().apply {
                put(AppConstants.KEY_GROUP_ID, groupId)
                put(AppConstants.KEY_CSR, finalCsr)
            }

            val csrArray = JSONArray().apply { put(csrJson) }

            val requestBody = JSONObject().apply {
                put(AppConstants.KEY_OPERATION, AppConstants.KEY_OPERATION_ADD)
                put(AppConstants.KEY_CSR_TYPE, "user")
                put(AppConstants.KEY_CSR_REQUESTS, csrArray)
            }

            val result = Arguments.createMap().apply {
                putBoolean(AppConstants.KEY_SUCCESS, true)
                putString(AppConstants.KEY_MESSAGE_CAMEL, AppConstants.MESSAGE_CSR_GENERATED)
                putString(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                putString(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
                putString(AppConstants.KEY_NAME, name)
                putString(AppConstants.KEY_CSR, finalCsr)
                putString(AppConstants.KEY_REQUEST_BODY_CAMEL, requestBody.toString())
            }

            promise?.resolve(result)

        } catch (e: Exception) {

            if (promise != null) {
                promise.reject(
                    "NOC_GENERATION_ERROR",
                    "Failed to generate user NOC: ${e.message}",
                    e
                )
            } else {
                throw e
            }
        }
    }

    /**
     * Receive NOC chain from React Native and pass to ChipClient
     * Called after issueNodeNoC API completes successfully
     */
    @ReactMethod
    fun sendNOCChainToChipClient(
        deviceId: String,
        requestId: String,
        rootCert: String,
        intermediateCert: String,
        operationalCert: String,
        ipkValue: String,
        adminVendorId: String,
        matterNodeId: String,
        promise: Promise
    ) {
        try {
            val result = sendNOCChainToChipClientInternal(
                deviceId = deviceId,
                requestId = requestId,
                rootCert = rootCert,
                intermediateCert = intermediateCert,
                operationalCert = operationalCert,
                ipkValue = ipkValue,
                adminVendorId = adminVendorId,
                matterNodeId = matterNodeId
            )
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject(
                "NOC_CHAIN_ERROR",
                "Failed to send NOC chain to ChipClient: ${error.message}",
                error
            )
        }
    }

    @ReactMethod
    fun postMessage(payload: ReadableMap, promise: Promise) {
        try {
            val type = payload.optString(AppConstants.KEY_TYPE)
            if (type.isNullOrEmpty()) {
                promise.reject(
                    AppConstants.ERROR_INVALID_PAYLOAD,
                    AppConstants.MESSAGE_POST_MESSAGE_INVALID_TYPE
                )
                return
            }

            val data = payload.optMap(AppConstants.KEY_DATA) ?: Arguments.createMap()

            when (type) {
                AppConstants.EVENT_ISSUE_NODE_NOC_RESPONSE -> {
                    val result = sendNOCChainToChipClientInternal(
                        deviceId = data.optString(AppConstants.KEY_DEVICE_ID_CAMEL) ?: "",
                        requestId = data.optString(AppConstants.KEY_REQUEST_ID_CAMEL) ?: "",
                        rootCert = data.optString(AppConstants.KEY_ROOT_CERT_CAMEL) ?: "",
                        intermediateCert = data.optString(AppConstants.KEY_INTERMEDIATE_CERT_CAMEL)
                            ?: "",
                        operationalCert = data.optString(AppConstants.KEY_OPERATIONAL_CERT_CAMEL)
                            ?: "",
                        ipkValue = data.optString(AppConstants.KEY_IPK_CAMEL) ?: "",
                        adminVendorId = data.optString(AppConstants.KEY_VENDOR_ID_CAMEL) ?: "",
                        matterNodeId = data.optString(AppConstants.KEY_MATTER_NODE_ID_CAMEL) ?: ""
                    )
                    promise.resolve(result)
                }

                AppConstants.EVENT_REACT_CONFIRM_RESPONSE -> {
                    val message = sendConfirmResponseInternal(data)
                    promise.resolve(message)
                }

                AppConstants.EVENT_CSR_GENERATION_RESPONSE,
                AppConstants.EVENT_FABRIC_CREATION_RESPONSE,
                AppConstants.EVENT_START_COMMISSIONING_RESPONSE -> {
                    val message = sendNocResponseInternal(data)
                    promise.resolve(message)
                }

                else -> {
                    promise.reject(
                        AppConstants.ERROR_UNSUPPORTED_POST_MESSAGE,
                        "${AppConstants.MESSAGE_UNSUPPORTED_POST_MESSAGE_TYPE}: $type"
                    )
                }
            }
        } catch (error: Exception) {
            Log.e(TAG, "[Bridge] postMessage failed: ${error.message}", error)
            promise.reject(
                AppConstants.ERROR_POST_MESSAGE,
                "${AppConstants.MESSAGE_FAILED_TO_PROCESS_POST_MESSAGE}: ${error.message}",
                error
            )
        }
    }

    /**
     * Handles results from Headless JS tasks (ISSUE_NOC or CONFIRM_COMMISSION).
     */
    @ReactMethod
    fun handleHeadlessTaskResult(taskType: String, resultJson: String) {
        try {
            val resultData = JSONObject(resultJson)
            val success = resultData.optBoolean("success", false)

            when (taskType) {
                // ISSUE_NOC: Only error cases reach here. Success path uses postMessage flow.
                "ISSUE_NOC" -> {
                    if (!success) {
                        val error = resultData.optString("error", "Unknown error")
                        Log.e(TAG, "NOC issuance failed: $error, commissioning may timeout")
                    }
                }

                "CONFIRM_COMMISSION" -> {
                    if (success) {
                        val requestId = resultData.optString("requestId", "")
                        val nodeId = resultData.optString("nodeId", "")
                        val responseObj = resultData.optJSONObject("response")
                        val isRainmakerNode = responseObj?.optBoolean("isRainmakerNode", false) ?: false
                        val rainmakerNodeId = responseObj?.optString("rainmakerNodeId", "") ?: ""
                        val matterNodeId = responseObj?.optString("matterNodeId", "") ?: ""

                        val chipClient = FabricSessionManager.getCurrentChipClient()
                        val deviceName = chipClient?.lastCommissionedDeviceName
                            ?: AppConstants.DEFAULT_MATTER_DEVICE_NAME

                        val params = Arguments.createMap().apply {
                            putString(AppConstants.KEY_EVENT_TYPE, AppConstants.EVENT_COMMISSIONING_COMPLETE)
                            putString(AppConstants.KEY_STATUS, responseObj?.optString("status", "success") ?: "success")
                            putString(AppConstants.KEY_DESCRIPTION, responseObj?.optString("description", "") ?: "")
                            putString(AppConstants.KEY_REQUEST_ID_CAMEL, requestId)
                            putString("nodeId", nodeId)
                            putString(AppConstants.KEY_MATTER_NODE_ID_CAMEL, matterNodeId)
                            putString(AppConstants.KEY_RAINMAKER_NODE_ID_CAMEL, rainmakerNodeId)
                            putBoolean(AppConstants.KEY_IS_RAINMAKER_NODE_CAMEL, isRainmakerNode)
                            putString(AppConstants.KEY_DEVICE_NAME_CAMEL, deviceName)
                            putBoolean(AppConstants.KEY_SUCCESS, true)
                            putString(AppConstants.KEY_SOURCE_CAMEL, "HEADLESS_JS")
                        }

                        reactApplicationContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit(AppConstants.EVENT_MATTER_COMMISSIONING, params)

                        chipClient?.onCommissioningFullyComplete()
                    } else {
                        val error = resultData.optString("error", "Unknown error")
                        Log.e(TAG, "CONFIRM_COMMISSION failed: $error")

                        val params = Arguments.createMap().apply {
                            putString(AppConstants.KEY_EVENT_TYPE, AppConstants.EVENT_COMMISSIONING_ERROR)
                            putString(AppConstants.KEY_ERROR_MESSAGE_CAMEL, error)
                            putBoolean(AppConstants.KEY_SUCCESS, false)
                            putString(AppConstants.KEY_SOURCE_CAMEL, "HEADLESS_JS")
                        }

                        reactApplicationContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit(AppConstants.EVENT_MATTER_COMMISSIONING, params)

                        FabricSessionManager.getCurrentChipClient()?.onCommissioningFailed(error)
                    }
                }

                else -> Log.w(TAG, "Unknown task type: $taskType")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling task result: ${e.message}", e)
        }
    }

}
