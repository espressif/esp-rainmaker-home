/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.util.Log
import chip.devicecontroller.*
import chip.devicecontroller.GetConnectedDeviceCallbackJni.GetConnectedDeviceCallback
import chip.devicecontroller.model.*
import chip.platform.*
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.bouncycastle.asn1.DERBitString
import org.bouncycastle.asn1.DERSequence
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.TimeoutException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/**
 * Handles Matter device communication and commissioning
 */
class ChipClient constructor(
    private val context: Context,
    private val groupId: String,
    private val fabricId: String,
    private val rootCa: String,
    private var userNoc: String,
    private val ipk: String,
    private val groupCatIdOperate: String
) {

    companion object {
        const val TAG = "ChipClient"
        private const val DEFAULT_TIMEOUT = 15000L
        private const val INVOKE_COMMAND_TIMEOUT = 15000
    }

    // Android KeyStore for certificate management
    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
    }

    // Current commissioning state
    private var currentDeviceId: Long? = null
    private var isCommissioning = false
    private var nocChainReceived = false
    private var nocChainInstalled = false
    private var confirmTaskTriggered = false

    var ipkEpochKey: ByteArray? = null
    lateinit var nocKey: ByteArray
    var requestId: String? = null
    var lastCommissionedDeviceName: String? = null
    var lastCommissionedNodeId: Long? = null
    var matterNodeId: String? = null
    var rmNodeId: String? = null
    var challenge: String? = null
    var tempDeviceId: Long? = null
    var success: String? = null

    private val confirmContinuations = mutableMapOf<String, CancellableContinuation<String>>()
    private var commissioningContinuation: CancellableContinuation<Unit>? = null

    // Lazily instantiate ChipDeviceController
    private val chipDeviceController: ChipDeviceController by lazy {
        Log.d(TAG, "========== INITIALIZING ESP RAINMAKER CHIP DEVICE CONTROLLER ==========")
        ChipDeviceController.loadJni()

        // Initialize Android platform components
        AndroidChipPlatform(
            AndroidBleManager(),
            AndroidNfcCommissioningManager(),
            PreferencesKeyValueStoreManager(context),
            PreferencesConfigurationManager(context),
            NsdManagerServiceResolver(context),
            NsdManagerServiceBrowser(context),
            ChipMdnsCallbackImpl(),
            DiagnosticDataProviderImpl(context)
        )

        try {
            val decodedHex: ByteArray = decodeHex(ipk)
            val encodedHexB64: ByteArray = Base64.encode(decodedHex, Base64.NO_WRAP)
            val ipkString = String(encodedHexB64)
            ipkEpochKey = Base64.decode(ipkString, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to process IPK: ${e.message}", e)
            throw e
        }

        // Create ChipDeviceController with operational key config
        ChipDeviceController(
            ControllerParams.newBuilder(operationalKeyConfig())
                .setUdpListenPort(0)
                .setControllerVendorId(AppConstants.ESP_VENDOR_ID)
                .build()
        ).also { chipDeviceController ->
            // Set ESP NOC Chain Issuer
            chipDeviceController.setNOCChainIssuer(EspNOCChainIssuer())
            Log.d(TAG, "ESP NOC Chain Issuer set successfully")
        }
    }

    /** Establish PASE connection with Matter device. */
    suspend fun awaitEstablishPaseConnection(
        deviceId: Long,
        ipAddress: String,
        port: Int,
        setupPinCode: Long
    ) = suspendCoroutine<Unit> { continuation ->

        try {
            chipDeviceController.setCompletionListener(
                object : BaseCompletionListener() {
                    override fun onConnectDeviceComplete() {
                        super.onConnectDeviceComplete()
                        continuation.resume(Unit)
                    }

                    // Note that an error in processing is not necessarily communicated via onError().
                    // onCommissioningComplete with a "code != 0" also denotes an error in processing.
                    override fun onPairingComplete(code: Long) {
                        super.onPairingComplete(code)
                        if (code != 0L) {
                            continuation.resumeWithException(
                                IllegalStateException("Pairing failed with error code [${code}]")
                            )
                        } else {
                            continuation.resume(Unit)
                        }
                    }

                    override fun onError(error: Throwable) {
                        super.onError(error)
                        continuation.resumeWithException(error)
                    }

                    override fun onReadCommissioningInfo(
                        vendorId: Int,
                        productId: Int,
                        wifiEndpointId: Int,
                        threadEndpointId: Int
                    ) {
                        super.onReadCommissioningInfo(
                            vendorId,
                            productId,
                            wifiEndpointId,
                            threadEndpointId
                        )
                        continuation.resume(Unit)
                    }

                    override fun onCommissioningStatusUpdate(
                        nodeId: Long,
                        stage: String?,
                        errorCode: Long
                    ) {
                        super.onCommissioningStatusUpdate(nodeId, stage, errorCode)
                        continuation.resume(Unit)
                    }

                    override fun onICDRegistrationInfoRequired() {
                        Log.d(TAG, "onICDRegistrationInfoRequired")
                    }

                    override fun onICDRegistrationComplete(
                        errorCode: Long,
                        icdDeviceInfo: ICDDeviceInfo?
                    ) {
                        Log.d(
                            TAG,
                            "onICDRegistrationComplete - errorCode: $errorCode, icdDeviceInfo : $icdDeviceInfo"
                        )
                    }
                })

            // Establish PASE connection
            chipDeviceController.establishPaseConnection(deviceId, ipAddress, port, setupPinCode)

        } catch (e: Exception) {
            continuation.resumeWithException(e)
        }
    }

    /** Commission Matter device into ESP RainMaker fabric. */
    suspend fun awaitCommissionDevice(
        deviceId: Long,
        networkCredentials: NetworkCredentials?
    ) = suspendCancellableCoroutine<Unit> { continuation ->

        Log.d(TAG, "Commissioning device")

        commissioningContinuation = continuation

        try {
            val callback = object : BaseCompletionListener() {
                // Note that an error in processing is not necessarily communicated via onError().
                // onCommissioningComplete with an "errorCode != 0" also denotes an error in processing.
                override fun onCommissioningComplete(nodeId: Long, errorCode: Long) {
                    if (errorCode == 0L) {
                        if (confirmTaskTriggered) {
                            Log.w(
                                TAG,
                                "onCommissioningComplete already processed, skipping duplicate execution"
                            )
                            return
                        }
                        confirmTaskTriggered = true

                        CoroutineScope(Dispatchers.IO).launch {
                            try {
                                Log.d(TAG, "Post-commissioning setup started")
                                delay(2000)

                                val devicePtr = try {
                                    awaitGetConnectedDevicePointer(nodeId)
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                    continuation.resume(Unit)
                                    return@launch
                                }
                                Log.d(
                                    TAG,
                                    "Got connected device pointer: $devicePtr for device setup"
                                )

                                val clustersHelper = ClustersHelper(this@ChipClient)

                                val deviceMatterInfo = try {
                                    delay(1000)
                                    clustersHelper.fetchDeviceMatterInfo(nodeId)
                                } catch (e: Exception) {
                                    emptyList<DeviceMatterInfo>()
                                }

                                var isRmClusterAvailable = false
                                var isControllerClusterAvailable = false
                                var rmNodeId: String? = null
                                var deviceName = ""
                                val metadataJson = JsonObject()
                                val body = JsonObject()
                                var endpointsArray = JsonArray()
                                var serversDataJson = JsonObject()
                                var clientsDataJson = JsonObject()

                                if (deviceMatterInfo.isNotEmpty()) {
                                    try {
                                        for (info in deviceMatterInfo) {

                                            if (info.types.isNotEmpty()) {
                                                val primaryDeviceType = info.types[0].toInt()
                                                metadataJson.addProperty(
                                                    AppConstants.KEY_DEVICE_TYPE,
                                                    primaryDeviceType
                                                )

                                                if (deviceName.isEmpty()) {
                                                    deviceName = NodeUtils.getDefaultNameForMatterDevice(primaryDeviceType)
                                                }

                                                for (deviceType in info.types) {
                                                    val defaultName = NodeUtils.getDefaultNameForMatterDevice(deviceType.toInt())
                                                    val category = NodeUtils.getDeviceCategory(deviceType.toInt())
                                                }
                                            } else {
                                                if (deviceName.isEmpty()) {
                                                    deviceName = AppConstants.DEFAULT_MATTER_DEVICE_NAME
                                                }
                                            }

                                            endpointsArray.add(info.endpoint)

                                            if (info.serverClusters.isNotEmpty()) {
                                                val serverClustersArr = JsonArray()
                                                for (serverCluster in info.serverClusters) {
                                                    serverClustersArr.add(
                                                        serverCluster.toString().toInt()
                                                    )
                                                }
                                                serversDataJson.add(
                                                    info.endpoint.toString(),
                                                    serverClustersArr
                                                )
                                            }

                                            if (info.clientClusters.isNotEmpty()) {
                                                val clientClustersArr = JsonArray()
                                                for (clientCluster in info.clientClusters) {
                                                    clientClustersArr.add(
                                                        clientCluster.toString().toInt()
                                                    )
                                                }
                                                clientsDataJson.add(
                                                    info.endpoint.toString(),
                                                    clientClustersArr
                                                )
                                            }

                                            if (info.endpoint == 0) {
                                                for (serverCluster in info.serverClusters) {
                                                    val clusterId: Long = serverCluster as Long

                                                    if (clusterId == AppConstants.RM_CLUSTER_ID) {
                                                        isRmClusterAvailable = true
                                                    }

                                                    if (clusterId == AppConstants.CONTROLLER_CLUSTER_ID) {
                                                        isControllerClusterAvailable = true
                                                        deviceName = AppConstants.MATTER_CONTROLLER_DEVICE_NAME
                                                    }
                                                }
                                            }
                                        }

                                        metadataJson.addProperty(
                                            AppConstants.KEY_IS_RAINMAKER_NODE,
                                            isRmClusterAvailable
                                        )
                                        metadataJson.addProperty(
                                            AppConstants.KEY_DEVICE_NAME,
                                            deviceName
                                        )
                                        metadataJson.addProperty(AppConstants.KEY_GROUP_ID, groupId)

                                        this@ChipClient.lastCommissionedDeviceName = deviceName
                                        metadataJson.add(
                                            AppConstants.KEY_ENDPOINTS_DATA,
                                            endpointsArray
                                        )

                                        if (serversDataJson.size() > 0) {
                                            metadataJson.add(
                                                AppConstants.KEY_SERVERS_DATA,
                                                serversDataJson
                                            )
                                        }
                                        if (clientsDataJson.size() > 0) {
                                            metadataJson.add(
                                                AppConstants.KEY_CLIENTS_DATA,
                                                clientsDataJson
                                            )
                                        }

                                    } catch (e: Exception) {
                                        Log.e(TAG, "Error building metadata: ${e.message}", e)
                                    }

                                    val primaryDeviceType =
                                        deviceMatterInfo.firstOrNull()?.types?.firstOrNull()
                                            ?.toInt()
                                    if (primaryDeviceType != null) {
                                        val defaultName = NodeUtils.getDefaultNameForMatterDevice(
                                            primaryDeviceType
                                        )
                                    }

                                } else {
                                    Log.w(TAG, "Could not fetch device Matter info")
                                }

                                if (isRmClusterAvailable) {

                                    // Read RainMaker Node ID
                                    val rmNodeIdAttributePath = ChipAttributePath.newInstance(
                                        AppConstants.ENDPOINT_0,
                                        AppConstants.RM_CLUSTER_ID_HEX,
                                        AppConstants.RM_ATTR_RAINMAKER_NODE_ID
                                    )

                                    val rmNodeIdData =
                                        readAttribute(devicePtr, rmNodeIdAttributePath)
                                    rmNodeId = rmNodeIdData?.value as String?

                                    if (matterNodeId != null) {
                                        try {
                                            clustersHelper.writeEspDeviceAttribute(
                                                nodeId = nodeId,
                                                endpointId = AppConstants.ENDPOINT_0,
                                                clusterId = AppConstants.RM_CLUSTER_ID_HEX,
                                                attributeId = AppConstants.RM_ATTR_MATTER_NODE_ID,
                                                matterNodeId = matterNodeId!!
                                            )
                                        } catch (e: Exception) {
                                            Log.e(
                                                TAG,
                                                "Failed to write Matter Node ID via ClustersHelper: ${e.message}",
                                                e
                                            )
                                        }
                                    } else {
                                        Log.w(TAG, "Matter Node ID is null - skipping write")
                                    }

                                    // Read challenge response from RM cluster
                                    val challengeAttributePath = ChipAttributePath.newInstance(
                                        AppConstants.ENDPOINT_0,
                                        AppConstants.RM_CLUSTER_ID_HEX,
                                        AppConstants.RM_ATTR_CHALLENGE
                                    )
                                    val challengeData: AttributeState? =
                                        readAttribute(devicePtr, challengeAttributePath)
                                    if (challengeData != null) {
                                        challenge = challengeData.value as String?
                                        Log.d(TAG, "Challenge read from device: $challenge")
                                    } else {
                                        Log.w(TAG, "Failed to read challenge attribute from device")
                                    }

                                    this@ChipClient.rmNodeId = rmNodeId
                                }

                                val matterMetadataJson = JsonObject()
                                matterMetadataJson.add(AppConstants.KEY_MATTER, metadataJson)

                                body.addProperty(AppConstants.KEY_REQ_ID, requestId)
                                body.addProperty(AppConstants.KEY_STATUS, "success")
                                body.add(AppConstants.KEY_METADATA, matterMetadataJson)

                                if (isRmClusterAvailable) {
                                    body.addProperty(AppConstants.KEY_RAINMAKER_NODE_ID, rmNodeId)
                                    body.addProperty(AppConstants.KEY_CHALLENGE, challenge)
                                    body.addProperty(AppConstants.KEY_CHALLENGE_RESPONSE, challenge ?: "")
                                }

                                Log.d(
                                    TAG,
                                    "Metadata fetched successfully, triggering confirm commission headless task"
                                )

                                if (isControllerClusterAvailable && isRmClusterAvailable) {
                                    val sharedPreferences = context.getSharedPreferences(
                                        AppConstants.ESP_PREFERENCES,
                                        Context.MODE_PRIVATE
                                    )
                                    val editor = sharedPreferences.edit()
                                    editor.putBoolean(rmNodeId, true)
                                    val key = "${AppConstants.PREF_CTRL_SETUP_PREFIX}$rmNodeId"
                                    editor.putBoolean(key, false)
                                    editor.apply()
                                }

                                if (groupCatIdOperate.isNotEmpty()) {

                                    val aclClusterHelper =
                                        AccessControlClusterHelper(this@ChipClient)

                                    val aclAttr: MutableList<ChipStructs.AccessControlClusterAccessControlEntryStruct>? =
                                        aclClusterHelper.readAclAttributeAsync(
                                            nodeId,
                                            AppConstants.ENDPOINT_0
                                        ).get()

                                    val entries: ArrayList<ChipStructs.AccessControlClusterAccessControlEntryStruct> =
                                        ArrayList<ChipStructs.AccessControlClusterAccessControlEntryStruct>()

                                    var fabricIndex = 0
                                    var authMode = 0
                                    val it = aclAttr?.listIterator()
                                    if (it != null) {
                                        for (entry in it) {
                                            entries.add(entry)
                                            if (entry.privilege == AppConstants.PRIVILEGE_ADMIN) {
                                                fabricIndex = entry.fabricIndex
                                                authMode = entry.authMode
                                            }
                                        }
                                    }

                                    val subjects: ArrayList<Long> = ArrayList<Long>()
                                    subjects.add(Utils.getCatId(groupCatIdOperate))

                                    val entry =
                                        ChipStructs.AccessControlClusterAccessControlEntryStruct(
                                            AppConstants.PRIVILEGE_OPERATE,
                                            authMode,
                                            subjects,
                                            null,
                                            fabricIndex
                                        )

                                    entries.add(entry)

                                    aclClusterHelper.writeAclAttributeAsync(
                                        nodeId,
                                        AppConstants.ENDPOINT_0,
                                        entries
                                    ).get()

                                } else {
                                    Log.w(TAG, "No group CAT ID provided skipping ACL setup")
                                }

                                lastCommissionedDeviceName = deviceName
                                lastCommissionedNodeId = nodeId

                                if (body != null) {
                                    triggerHeadlessConfirmCommissionTask(JSONObject(body.toString()))
                                } else {
                                    Log.e(
                                        TAG,
                                        "Failed to fetch metadata, cannot confirm commission"
                                    )
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Error in post-commissioning steps: ${e.message}", e)
                            }
                        }

                    } else {
                        val error =
                            RuntimeException("Device commissioning failed with error code: $errorCode")
                        Log.e(TAG, "Commissioning failed: ${error.message}")
                        continuation.resumeWithException(error)
                        commissioningContinuation = null
                    }
                }

                override fun onError(error: Throwable) {
                    super.onError(error)
                    Log.e(TAG, "Commissioning error: ${error.message}")
                    continuation.resumeWithException(error)
                    commissioningContinuation = null
                }

                override fun onICDRegistrationInfoRequired() {
                }

                override fun onICDRegistrationComplete(
                    errorCode: Long,
                    icdDeviceInfo: ICDDeviceInfo?
                ) {
                }
            }

            chipDeviceController.setCompletionListener(callback)
            chipDeviceController.commissionDevice(deviceId, networkCredentials)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to commission device: ${e.message}", e)
            continuation.resumeWithException(e)
            commissioningContinuation = null
        }
    }

    /** Called when commissioning is fully complete (after confirm API succeeds). */
    fun onCommissioningFullyComplete() {
        Log.d(TAG, "Commissioning fully complete")
        commissioningContinuation?.resume(Unit)
        commissioningContinuation = null

        // Reset commissioning state
        isCommissioning = false
    }

    /** Called when commissioning confirmation fails. */
    fun onCommissioningFailed(errorMessage: String) {
        Log.e(TAG, "Commissioning failed: $errorMessage")
        commissioningContinuation?.resumeWithException(
            RuntimeException("Commissioning confirmation failed: $errorMessage")
        )
        commissioningContinuation = null

        // Reset commissioning state
        isCommissioning = false
    }

    /** Initialize commissioning state and trigger HeadlessJS task to issue NOC. */
    private fun triggerNOCTask(csrBase64: String, deviceId: Long) {
        currentDeviceId = deviceId
        isCommissioning = true
        nocChainReceived = false
        nocChainInstalled = false
        confirmTaskTriggered = false
        triggerHeadlessNOCTask(csrBase64, deviceId)
    }

    /** Trigger HeadlessJS task to issue NOC certificate. */
    private fun triggerHeadlessNOCTask(csrBase64: String, deviceId: Long) {
        try {
            val currentRequestId = requestId ?: deviceId.toString()

            // Create Intent to start the headless task service
            val intent = Intent(context, MatterHeadlessTaskService::class.java).apply {
                putExtra(AppConstants.EXTRA_TASK_NAME, AppConstants.TASK_ISSUE_NOC)
                putExtra(AppConstants.EXTRA_NODE_ID, deviceId.toString())
                putExtra(AppConstants.KEY_CSR, csrBase64)
                putExtra(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
                putExtra(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                putExtra(AppConstants.KEY_REQUEST_ID_CAMEL, currentRequestId)
            }

            // Start the headless task service
            context.startService(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger NOC task: ${e.message}", e)
        }
    }

    /** Trigger HeadlessJS task to confirm commissioning. */
    private fun triggerHeadlessConfirmCommissionTask(metadata: JSONObject) {
        try {
            val currentRequestId = requestId ?: currentDeviceId.toString()
            val nodeId = currentDeviceId?.toString() ?: ""
            val challengeValue = metadata.optString(AppConstants.KEY_CHALLENGE, challenge ?: "")
            val challengeResponseValue = metadata.optString(AppConstants.KEY_CHALLENGE_RESPONSE, challenge ?: "")

            val intent = Intent(context, MatterHeadlessTaskService::class.java).apply {
                putExtra(AppConstants.EXTRA_TASK_NAME, AppConstants.TASK_CONFIRM_COMMISSION)
                putExtra(AppConstants.EXTRA_NODE_ID, nodeId)
                putExtra(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
                putExtra(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                putExtra(AppConstants.KEY_REQUEST_ID_CAMEL, currentRequestId)
                putExtra(AppConstants.KEY_METADATA, metadata.toString())
                putExtra(AppConstants.KEY_CHALLENGE_CAMEL, challengeValue)
                putExtra(AppConstants.KEY_CHALLENGE_RESPONSE_CAMEL, challengeResponseValue)
            }
            context.startService(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger Confirm Commission task: ${e.message}", e)
        }
    }

    /** Receive NOC chain from React Native and install it. */
    fun receiveNOCChain(
        requestId: String,
        rootCert: String,
        intermediateCert: String,
        operationalCert: String,
        ipkValue: String,
        adminVendorId: String,
        matterNodeId: String? = null
    ) {
        try {
            Log.d(TAG, "NOC chain received")

            if (!isCommissioning || currentDeviceId == null) {
                Log.w(TAG, "Received NOC chain but not currently commissioning")
                return
            }

            if (nocChainInstalled) {
                return
            }

            nocChainReceived = true

            try {
                this@ChipClient.requestId = requestId
                this@ChipClient.matterNodeId = matterNodeId

                if (this@ChipClient.matterNodeId.isNullOrEmpty()) {
                    Log.w(
                        TAG,
                        "Matter Node ID is null/empty from API response - this may cause issues"
                    )
                }

                var cleanOperationalCert = operationalCert
                    .replace(AppConstants.CERTIFICATE_BEGIN, "")
                    .replace(AppConstants.CERTIFICATE_END, "")
                    .replace("\n", "")
                    .trim()

                var cleanRootCert = rootCert
                    .replace(AppConstants.CERTIFICATE_BEGIN, "")
                    .replace(AppConstants.CERTIFICATE_END, "")
                    .replace("\n", "")
                    .trim()

                val chain = arrayOf(
                    decode(cleanOperationalCert),
                    decode(cleanRootCert)
                )

                val errorCode = chipDeviceController.onNOCChainGeneration(
                    ControllerParams.newBuilder()
                        .setRootCertificate(chain[1].encoded)
                        .setIntermediateCertificate(chain[1].encoded)
                        .setOperationalCertificate(chain[0].encoded)
                        .setIpk(ipkEpochKey)
                        .build()
                )

                if (errorCode == 0L) {
                    nocChainInstalled = true
                } else {
                    Log.e(TAG, "NOC chain installation failed with error code: $errorCode")
                }

            } catch (e: Exception) {
                Log.e(TAG, "Failed to install NOC chain: ${e.message}", e)
            }

        } catch (e: Exception) {
            Log.e(TAG, "Failed to receive NOC chain: ${e.message}", e)
        }
    }

    /** Get connected device pointer for cluster operations. */
    suspend fun awaitGetConnectedDevicePointer(deviceId: Long): Long =
        suspendCoroutine { continuation ->

            try {
                chipDeviceController.getConnectedDevicePointer(
                    deviceId,
                    object : GetConnectedDeviceCallback {
                        override fun onDeviceConnected(devicePointer: Long) {
                            Log.d(TAG, "Got connected device pointer: $devicePointer")
                            continuation.resume(devicePointer)
                        }

                        override fun onConnectionFailure(nodeId: Long, error: Exception?) {
                            Log.e(
                                TAG,
                                "Failed to get connected device pointer for node $nodeId: ${error?.message}"
                            )
                            continuation.resumeWithException(
                                error ?: Exception("Connection failure")
                            )
                        }
                    })
            } catch (e: Exception) {
                Log.e(TAG, "Exception getting connected device pointer: ${e.message}")
                continuation.resumeWithException(e)
            }
        }

    private suspend fun readAttribute(
        devicePtr: Long,
        attributePath: ChipAttributePath
    ): AttributeState? {

        return suspendCoroutine { continuation ->
            try {
                chipDeviceController.readAttributePath(
                    object : ReportCallback {
                        override fun onReport(nodeState: NodeState?) {
                            try {
                                if (nodeState != null) {

                                    val endpoint = attributePath.endpointId.id.toInt()
                                    val clusterId = attributePath.clusterId.id
                                    val attributeId = attributePath.attributeId.id

                                    val endpointState = nodeState.getEndpointState(endpoint)
                                    if (endpointState != null) {
                                        Log.d(TAG, "Endpoint state found")
                                        val clusterState = endpointState.getClusterState(clusterId)
                                        if (clusterState != null) {
                                            Log.d(TAG, "Cluster state found")
                                            val attributeState =
                                                clusterState.getAttributeState(attributeId)
                                            if (attributeState != null) {
                                                Log.d(
                                                    TAG,
                                                    "Attribute state found: ${attributeState.value}"
                                                )
                                                continuation.resume(attributeState)
                                                return
                                            } else {
                                                Log.w(
                                                    TAG,
                                                    "Attribute state not found for attribute 0x${
                                                        attributeId.toString(16)
                                                    }"
                                                )
                                            }
                                        } else {
                                            Log.w(
                                                TAG,
                                                "Cluster state not found for cluster 0x${
                                                    clusterId.toString(16)
                                                }"
                                            )
                                        }
                                    } else {
                                        Log.w(
                                            TAG,
                                            "Endpoint state not found for endpoint $endpoint"
                                        )
                                    }
                                } else {
                                    Log.w(TAG, "NodeState is null")
                                }

                                Log.w(TAG, "Attribute not found, returning null")
                                continuation.resume(null)
                            } catch (e: Exception) {
                                Log.e(TAG, "Error processing NodeState: ${e.message}", e)
                                continuation.resume(null)
                            }
                        }

                        override fun onError(
                            attributePath: ChipAttributePath?,
                            eventPath: ChipEventPath?,
                            ex: Exception
                        ) {
                            continuation.resume(null)
                        }
                    },
                    devicePtr,
                    listOf(attributePath),
                    DEFAULT_TIMEOUT.toInt()
                )
            } catch (e: Exception) {
                Log.e(TAG, "Exception reading attribute: ${e.message}")
                continuation.resumeWithException(e)
            }
        }
    }

    /**
     * Write attribute to device using ChipAttributePath and TLV data
     */
    suspend fun writeAttribute(
        devicePtr: Long,
        attributePath: ChipAttributePath,
        tlvData: ByteArray
    ): Boolean {

        return suspendCoroutine { continuation ->
            try {
                val writeRequest = AttributeWriteRequest.newInstance(
                    attributePath.endpointId,
                    attributePath.clusterId,
                    attributePath.attributeId,
                    tlvData
                )

                val callback = object : WriteAttributesCallback {
                    override fun onResponse(attributePath: ChipAttributePath?, status: Status?) {
                        continuation.resume(true)
                    }

                    override fun onError(attributePath: ChipAttributePath?, ex: Exception?) {
                        continuation.resume(false)
                    }
                }

                chipDeviceController.write(
                    callback,
                    devicePtr,
                    listOf(writeRequest),
                    0,
                    0
                )
            } catch (e: Exception) {
                Log.e(TAG, "Exception writing attribute: ${e.message}")
                continuation.resumeWithException(e)
            }
        }
    }

    /**
     * Write command to device using TLV data
     */
    private suspend fun writeCommand(
        devicePtr: Long,
        endpointId: Int,
        clusterId: Long,
        commandId: Long,
        tlvData: ByteArray
    ): Boolean {

        return suspendCoroutine { continuation ->
            try {
                val invokeElement =
                    InvokeElement.newInstance(endpointId, clusterId, commandId, tlvData, null)
                val callback = object : InvokeCallback {
                    override fun onResponse(invokeElement: InvokeElement?, successCode: Long) {
                        Log.d(TAG, "Command write success: code=$successCode")
                        continuation.resume(true)
                    }

                    override fun onError(ex: Exception?) {
                        Log.e(TAG, "Failed to write command: ${ex?.message}")
                        continuation.resume(false)
                    }
                }

                chipDeviceController.invoke(
                    callback,
                    devicePtr,
                    invokeElement,
                    0,
                    0
                )
            } catch (e: Exception) {
                Log.e(TAG, "Exception writing command: ${e.message}")
                continuation.resumeWithException(e)
            }
        }
    }

    private fun operationalKeyConfig(): OperationalKeyConfig {
        Log.d(TAG, "Creating OperationalKeyConfig")

        try {
            val chain = keyStore.getCertificateChain(fabricId)

            if (chain == null || chain.isEmpty()) {

                return OperationalKeyConfig(
                    EspKeypairDelegate(),
                    null,
                    null,
                    null,
                    ipkEpochKey
                )
            }

            val sequence = DERSequence.getInstance(chain[0].publicKey.encoded)
            val subjectPublicKey = sequence.getObjectAt(1) as DERBitString
            nocKey = subjectPublicKey.bytes

            return OperationalKeyConfig(
                EspKeypairDelegate(),
                chain[1].encoded,
                chain[1].encoded,
                chain[0].encoded,
                ipkEpochKey
            )

        } catch (e: Exception) {
            Log.e(TAG, "Failed to create operational key config: ${e.message}", e)

            return OperationalKeyConfig(
                EspKeypairDelegate(),
                null,
                null,
                null,
                ipkEpochKey
            )
        }
    }

    /**
     * ESP Keypair Delegate
     * Handles private key operations for Matter commissioning
     */
    inner class EspKeypairDelegate : KeypairDelegate {

        @Throws(KeypairDelegate.KeypairException::class)
        override fun generatePrivateKey() {}

        @Throws(KeypairDelegate.KeypairException::class)
        override fun createCertificateSigningRequest(): ByteArray? = null

        @Throws(KeypairDelegate.KeypairException::class)
        override fun getPublicKey(): ByteArray? = if (::nocKey.isInitialized) nocKey else null

        @Throws(KeypairDelegate.KeypairException::class)
        override fun ecdsaSignMessage(message: ByteArray?): ByteArray? {
            if (message == null) return null

            try {
                val privateKey = keyStore.getKey(fabricId, null) as? PrivateKey ?: return null
                val signature = Signature.getInstance(AppConstants.SIGNATURE_ALGORITHM)
                signature.initSign(privateKey)
                signature.update(message)
                return signature.sign()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sign message: ${e.message}", e)
                throw KeypairDelegate.KeypairException(e.message)
            }
        }
    }

    /** Handles NOC chain generation during commissioning. */
    inner class EspNOCChainIssuer : ChipDeviceController.NOCChainIssuer {
        override fun onNOCChainGenerationNeeded(
            csrInfo: CSRInfo?,
            attestationInfo: AttestationInfo?
        ) {
            Log.d(TAG, "NOC chain generation needed")

            if (csrInfo == null) {
                Log.e(TAG, "CSR Info is null cannot generate NOC chain")
                return
            }

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val tempCsr = Base64.encodeToString(csrInfo.csr, Base64.NO_WRAP)
                    val finalCSR =
                        AppConstants.CERT_BEGIN + "\n" + tempCsr + "\n" + AppConstants.CERT_END

                    triggerNOCTask(finalCSR, currentDeviceId ?: System.currentTimeMillis())

                } catch (e: Exception) {
                    Log.e(TAG, "Failed to process NOC chain generation: ${e.message}", e)
                }
            }
        }
    }

    /**
     * Decode X.509 certificate from Base64 string
     */
    private fun decode(cert: String?): X509Certificate {
        val encodedCert: ByteArray = Base64.decode(cert, Base64.NO_WRAP)
        val inputStream = ByteArrayInputStream(encodedCert)
        val certFactory = CertificateFactory.getInstance(AppConstants.CERTIFICATE_TYPE_X509)
        return certFactory.generateCertificate(inputStream) as X509Certificate
    }

    /**
     * Decode hex string to byte array
     */
    private fun decodeHex(hexString: String): ByteArray {
        val cleanHex = hexString.replace(" ", "").replace("\n", "")
        val len = cleanHex.length
        val data = ByteArray(len / 2)

        for (i in 0 until len step 2) {
            data[i / 2] = ((Character.digit(cleanHex[i], 16) shl 4) + Character.digit(
                cleanHex[i + 1],
                16
            )).toByte()
        }

        return data
    }

    suspend fun awaitOpenPairingWindowWithPIN(
        connectedDevicePointer: Long,
        duration: Int,
        iteration: Long,
        discriminator: Int,
        setupPinCode: Long
    ) {
        return suspendCoroutine { continuation ->
            Log.d(TAG, "Calling chipDeviceController.openPairingWindowWithPIN")
            val callback: OpenCommissioningCallback =
                object : OpenCommissioningCallback {
                    override fun onError(status: Int, deviceId: Long) {
                        Log.e(
                            TAG,
                            "awaitOpenPairingWindowWithPIN.onError: status [${status}] device [${deviceId}]"
                        )
                        continuation.resumeWithException(
                            IllegalStateException(
                                "Failed opening the pairing window with status [${status}]"
                            )
                        )
                    }

                    override fun onSuccess(
                        deviceId: Long,
                        manualPairingCode: String?,
                        qrCode: String?
                    ) {
                        Log.d(
                            TAG,
                            "awaitOpenPairingWindowWithPIN.onSuccess: deviceId [${deviceId}]"
                        )
                        continuation.resume(Unit)
                    }
                }
            chipDeviceController.openPairingWindowWithPINCallback(
                connectedDevicePointer,
                duration,
                iteration,
                discriminator,
                setupPinCode,
                callback
            )
        }
    }

    /**
     * PASE Verifier Computation
     */
    fun computePaseVerifier(
        devicePtr: Long,
        setupPincode: Long,
        iterations: Long,
        salt: ByteArray
    ): PaseVerifierParams {
        Log.d(
            TAG,
            "computePaseVerifier: devicePtr [${devicePtr}] pinCode [${setupPincode}] iterations [${iterations}] salt [${salt}]"
        )
        return chipDeviceController.computePaseVerifier(devicePtr, setupPincode, iterations, salt)
    }

    /**
     * Descriptor Cluster Methods
     */
    suspend fun readDescriptorClusterPartsListAttribute(
        devicePtr: Long,
        endpoint: Int
    ): List<Any>? {
        return suspendCoroutine { continuation ->
            getDescriptorClusterForDevice(devicePtr, endpoint)
                .readPartsListAttribute(
                    object : ChipClusters.DescriptorCluster.PartsListAttributeCallback {
                        override fun onSuccess(values: MutableList<Int>?) {
                            continuation.resume(values)
                        }

                        override fun onError(ex: Exception) {
                            continuation.resumeWithException(ex)
                        }
                    })
        }
    }

    private fun getDescriptorClusterForDevice(
        devicePtr: Long,
        endpoint: Int
    ): ChipClusters.DescriptorCluster {
        return ChipClusters.DescriptorCluster(devicePtr, endpoint)
    }

    /**
     * Enhanced Attribute Operations
     */
    suspend fun readAttributes(
        devicePtr: Long,
        attributePaths: List<ChipAttributePath>
    ): Map<ChipAttributePath, AttributeState> {
        return suspendCoroutine { continuation ->
            val callback: ReportCallback =
                object : ReportCallback {

                    override fun onError(
                        attributePath: ChipAttributePath?,
                        eventPath: ChipEventPath?,
                        e: Exception
                    ) {
                        continuation.resumeWithException(
                            IllegalStateException(
                                "readAttributes failed",
                                e
                            )
                        )
                    }

                    override fun onReport(nodeState: NodeState?) {
                        val states: HashMap<ChipAttributePath, AttributeState> = HashMap()

                        if (nodeState != null) {
                            Log.d(TAG, "Node state : ${nodeState.toString()}")
                            for (path in attributePaths) {
                                var endpoint: Int = path.endpointId.id.toInt()
                                Log.d(TAG, "endpoint : ${endpoint}")
                                states[path] =
                                    nodeState!!
                                        .getEndpointState(endpoint)!!
                                        .getClusterState(path.clusterId.id)!!
                                        .getAttributeState(path.attributeId.id)!!
                            }
                        }
                        continuation.resume(states)
                    }

                    override fun onDone() {
                        super.onDone()
                        Log.d(TAG, "Report callback onDone")
                    }
                }
            chipDeviceController.readAttributePath(
                callback, devicePtr, attributePaths, DEFAULT_TIMEOUT.toInt()
            )
        }
    }

    suspend fun writeAttributes(
        devicePtr: Long,
        attributes: Map<ChipAttributePath, ByteArray>,
        timedRequestTimeoutMs: Int = DEFAULT_TIMEOUT.toInt(),
        imTimeoutMs: Int = DEFAULT_TIMEOUT.toInt()
    ) {
        return suspendCoroutine { continuation ->
            val requests: List<AttributeWriteRequest> =
                attributes.toList().map {
                    AttributeWriteRequest.newInstance(
                        it.first.endpointId, it.first.clusterId, it.first.attributeId, it.second
                    )
                }
            val callback: WriteAttributesCallback =
                object : WriteAttributesCallback {
                    override fun onError(
                        attributePath: ChipAttributePath?,
                        e: Exception?
                    ) {
                        continuation.resume(Unit)
                    }

                    override fun onResponse(attributePath: ChipAttributePath?, status: Status?) {

                        if (attributePath!! ==
                            ChipAttributePath.newInstance(
                                requests.last().endpointId,
                                requests.last().clusterId,
                                requests.last().attributeId
                            )
                        ) {
                            continuation.resume(Unit)
                        }
                    }
                }

            chipDeviceController.write(
                callback,
                devicePtr,
                requests,
                timedRequestTimeoutMs,
                imTimeoutMs
            )
        }
    }

    suspend fun invoke(
        devicePtr: Long,
        invokeElement: InvokeElement,
        timedRequestTimeoutMs: Int = INVOKE_COMMAND_TIMEOUT,
        imTimeoutMs: Int = INVOKE_COMMAND_TIMEOUT
    ): Long {
        return suspendCoroutine { continuation ->
            val invokeCallback: InvokeCallback =
                object : InvokeCallback {
                    override fun onError(e: Exception?) {
                        e?.printStackTrace()
                        continuation.resumeWithException(
                            IllegalStateException("invoke failed", e)
                        )
                    }

                    override fun onResponse(invokeElement: InvokeElement?, successCode: Long) {
                        Log.d(TAG, "Invoke command success")
                        continuation.resume(successCode)
                    }
                }
            chipDeviceController.invoke(
                invokeCallback, devicePtr, invokeElement, timedRequestTimeoutMs, imTimeoutMs
            )
        }
    }

    /**
     * Clean up resources and close connections
     */
    fun close() {
        Log.d(TAG, "Closing ChipClient and cleaning up resources")
        try {
            currentDeviceId = null
            isCommissioning = false
            nocChainReceived = false
        } catch (e: Exception) {
            Log.e(TAG, "Error closing ChipClient: ${e.message}", e)
        }
    }
}
