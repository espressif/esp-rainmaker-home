/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.content.Context
import android.content.Intent
import android.util.Base64
import android.util.Log
import android.os.Bundle
import chip.devicecontroller.*
import chip.devicecontroller.model.*
import chip.devicecontroller.GetConnectedDeviceCallbackJni.GetConnectedDeviceCallback
import chip.platform.*
import com.google.gson.JsonArray
import com.google.gson.JsonObject
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.CancellableContinuation
import org.bouncycastle.asn1.DERBitString
import org.bouncycastle.asn1.DERSequence
import org.json.JSONObject
import org.greenrobot.eventbus.EventBus
import org.greenrobot.eventbus.Subscribe
import org.greenrobot.eventbus.ThreadMode

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

    init {
        // Register for EventBus to receive NOC responses from React Native
        EventBus.getDefault().register(this)
        Log.d(TAG, "ChipClient : EventBus registered successfully")
    }
    
    /**
     * EventBus subscriber to handle confirm node responses from React Native
     */
    @Subscribe(threadMode = ThreadMode.MAIN)
    fun onConfirmNodeResponse(event: MatterEvent) {
        if (event.eventType == AppConstants.EVENT_MATTER_CONFIRM_RESPONSE) {
            
            val data = event.data
            if (data != null) {
                val requestId = data.getString(AppConstants.KEY_REQUEST_ID_CAMEL)
                val status = data.getString(AppConstants.KEY_STATUS)
                val description = data.getString(AppConstants.KEY_DESCRIPTION)
                val isRainmakerNode = data.getBoolean(AppConstants.KEY_IS_RAINMAKER_NODE_CAMEL)
                val rainmakerNodeId = data.getString(AppConstants.KEY_RAINMAKER_NODE_ID_CAMEL)
                val matterNodeId = data.getString(AppConstants.KEY_MATTER_NODE_ID_CAMEL)
                
                if (requestId != null) {
                    val continuation = confirmContinuations.remove(requestId)
                    if (continuation != null) {
                        // Create response JSON string
                        val responseJson = JSONObject().apply {
                            put(AppConstants.KEY_STATUS, status ?: AppConstants.STATUS_ERROR)
                            put(AppConstants.KEY_DESCRIPTION, description ?: AppConstants.MESSAGE_CONFIRM_RESPONSE_SENT)
                            put(AppConstants.KEY_IS_RAINMAKER_NODE, isRainmakerNode)
                            put(AppConstants.KEY_RAINMAKER_NODE_ID, rainmakerNodeId ?: "")
                            put(AppConstants.KEY_MATTER_NODE_ID, matterNodeId ?: "")
                        }
                        
                        continuation.resume(responseJson.toString())
                    }
                }
            }
        }
    }

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

    /**
     * Establish PASE (Password Authenticated Session Establishment) connection with Matter device
     */
    suspend fun awaitEstablishPaseConnection(
        deviceId: Long,
        ipAddress: String,
        port: Int,
        setupPinCode: Long
    ) = suspendCoroutine<Unit> { continuation ->

        try {
            val callback = object : ChipDeviceController.CompletionListener {
                override fun onConnectDeviceComplete() {
                    continuation.resume(Unit)
                }

                override fun onStatusUpdate(status: Int) {
                }

                override fun onPairingComplete(errorCode: Long) {
                    if (errorCode == 0L) {
                        continuation.resume(Unit)
                    } else {
                        continuation.resumeWithException(RuntimeException("PASE pairing failed with error code: $errorCode"))
                    }
                }

                override fun onPairingDeleted(errorCode: Long) {
                }

                override fun onCommissioningComplete(nodeId: Long, errorCode: Long) {
                }


                override fun onICDRegistrationInfoRequired() {
                }

                override fun onCommissioningStatusUpdate(
                    nodeId: Long,
                    stage: String,
                    errorCode: Long
                ) {
                }

                override fun onICDRegistrationComplete(
                    errorCode: Long,
                    icdDeviceInfo: ICDDeviceInfo?
                ) {
                }

                override fun onError(error: Throwable) {
                    continuation.resumeWithException(error)
                }

                override fun onOpCSRGenerationComplete(csr: ByteArray) {
                    Log.d(TAG, "========== OpCSR GENERATION COMPLETE ==========")
                    val csrBase64 = Base64.encodeToString(csr, Base64.NO_WRAP)
                    
                    // Send CSR to React Native
                    sendCSRToReactNative(csrBase64, deviceId)
                }

                override fun onReadCommissioningInfo(
                    vendorId: Int,
                    productId: Int,
                    wifiEndpointId: Int,
                    threadEndpointId: Int
                ) {
                }

                override fun onNotifyChipConnectionClosed() {
                }

                override fun onCloseBleComplete() {
                }
            }

            // Establish PASE connection
            chipDeviceController.setCompletionListener(callback)
            chipDeviceController.establishPaseConnection(deviceId, ipAddress, port, setupPinCode)
            
        } catch (e: Exception) {
            continuation.resumeWithException(e)
        }
    }

    /**
     * Commission the Matter device into ESP RainMaker fabric
     */
    suspend fun awaitCommissionDevice(
        deviceId: Long,
        networkCredentials: NetworkCredentials?
    ) = suspendCoroutine<Unit> { continuation ->
        
        Log.d(TAG, "========== COMMISSIONING DEVICE ==========")

        try {
            val callback = object : ChipDeviceController.CompletionListener {
                override fun onConnectDeviceComplete() {
                }

                override fun onStatusUpdate(status: Int) {
                }

                override fun onPairingComplete(errorCode: Long) {
                }

                override fun onPairingDeleted(errorCode: Long) {
                }

                override fun onICDRegistrationInfoRequired() {
                }

                override fun onCommissioningStatusUpdate(
                    nodeId: Long,
                    stage: String,
                    errorCode: Long
                ) {
                }

                override fun onICDRegistrationComplete(
                    errorCode: Long,
                    icdDeviceInfo: ICDDeviceInfo?
                ) {
                }

                override fun onCommissioningComplete(nodeId: Long, errorCode: Long) {
                    if (errorCode == 0L) {
                        
                        CoroutineScope(Dispatchers.IO).launch {
                            try {
                                Log.d(TAG, "========== POST-COMMISSIONING DEVICE SETUP ==========")
                                
                                delay(2000)
                                
                                val devicePtr = try {
                                    awaitGetConnectedDevicePointer(nodeId)
                                } catch (e: Exception) {
                                    continuation.resume(Unit)
                                    return@launch
                                }
                                Log.d(TAG, "Got connected device pointer: $devicePtr for device setup")
                                
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
                                                    val defaultName =
                                                        NodeUtils.getDefaultNameForMatterDevice(deviceType.toInt())
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
                                        
                                        metadataJson.addProperty(AppConstants.KEY_IS_RAINMAKER_NODE, isRmClusterAvailable)
                                        metadataJson.addProperty(AppConstants.KEY_DEVICE_NAME, deviceName)
                                        metadataJson.addProperty(AppConstants.KEY_GROUP_ID, groupId)
                                        
                                        this@ChipClient.lastCommissionedDeviceName = deviceName
                                        metadataJson.add(AppConstants.KEY_ENDPOINTS_DATA, endpointsArray)
                                        
                                        if (serversDataJson.size() > 0) {
                                            metadataJson.add(AppConstants.KEY_SERVERS_DATA, serversDataJson)
                                        }
                                        if (clientsDataJson.size() > 0) {
                                            metadataJson.add(AppConstants.KEY_CLIENTS_DATA, clientsDataJson)
                                        }
                                        
                                    } catch (e: Exception) {
                                        Log.e(TAG, "Error building metadata: ${e.message}", e)
                                    }

                                    val primaryDeviceType =
                                        deviceMatterInfo.firstOrNull()?.types?.firstOrNull()
                                            ?.toInt()
                                    if (primaryDeviceType != null) {
                                        val defaultName = NodeUtils.getDefaultNameForMatterDevice(primaryDeviceType)
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

                                    val rmNodeIdData = readAttribute(devicePtr, rmNodeIdAttributePath)
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
                                            Log.e(TAG, "Failed to write Matter Node ID via ClustersHelper: ${e.message}", e)
                                        }
                                    } else {
                                        Log.w(TAG, "Matter Node ID is null - skipping write")
                                    }

                                    // Read challenge response
                                    val challengeAttributePath = ChipAttributePath.newInstance(
                                        AppConstants.ENDPOINT_0,
                                        AppConstants.RM_CLUSTER_ID_HEX,
                                        AppConstants.RM_ATTR_CHALLENGE
                                    )
                                    val challengeData: AttributeState? = readAttribute(devicePtr, challengeAttributePath)
                                    var challenge: String? = null
                                    if (challengeData != null) {
                                        challenge = challengeData.value as String?
                                    }

                                    this@ChipClient.rmNodeId = rmNodeId
                                    this@ChipClient.challenge = challenge
                                    
                                }

                                val matterMetadataJson = JsonObject()
                                matterMetadataJson.add(AppConstants.KEY_MATTER, metadataJson)
                                
                                body.addProperty(AppConstants.KEY_REQ_ID, requestId)
                                body.addProperty(AppConstants.KEY_STATUS, success)
                                body.add(AppConstants.KEY_METADATA, matterMetadataJson)
                                
                                if (isRmClusterAvailable) {
                                    body.addProperty(AppConstants.KEY_RAINMAKER_NODE_ID, rmNodeId)
                                    body.addProperty(AppConstants.KEY_CHALLENGE, challenge)
                                }
                                
                                var isRainMaker: Boolean = isRmClusterAvailable
                                
                                try {
                                    val confirmResponseString =
                                        suspendCancellableCoroutine<String> { continuation ->
                                            val originalRequestId = requestId
                                                ?: throw IllegalStateException("Request ID is null")
                                        confirmContinuations[originalRequestId] = continuation
                                        
                                        val requestBundle = Bundle().apply {
                                                putString(AppConstants.KEY_REQUEST_BODY, body.toString())
                                                putString(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                                                putString(AppConstants.KEY_REQUEST_ID_CAMEL, originalRequestId)
                                                putString(AppConstants.KEY_MATTER_NODE_ID_CAMEL, matterNodeId ?: "")
                                                putString(AppConstants.KEY_CHALLENGE_CAMEL, challenge ?: "")
                                                putString(AppConstants.KEY_CHALLENGE_RESPONSE_CAMEL, challenge ?: "")
                                            }
                                            val confirmCommissioningEvent = MatterEvent(
                                                AppConstants.EVENT_COMMISSIONING_CONFIRM_REQUEST,
                                                requestBundle
                                            )
                                            EventBus.getDefault().post(confirmCommissioningEvent)

                                        CoroutineScope(Dispatchers.Main).launch {
                                            delay(30000) // 30 second timeout
                                            val storedContinuation = confirmContinuations.remove(originalRequestId)
                                            if (storedContinuation != null && storedContinuation.isActive) {

                                                    storedContinuation.resumeWithException(
                                                        TimeoutException("Confirm request timed out")
                                                    )
                                            } else {
                                            }
                                        }
                                    }
                                    
                                    val responseJson = JSONObject(confirmResponseString)
                                    val status = responseJson.getString("status")
                                    val description = responseJson.getString("description")
                                    val isRainmakerNode = responseJson.getBoolean("is_rainmaker_node")
                                    val rainmakerNodeId = responseJson.getString("rainmaker_node_id")
                                    val matterNodeId = responseJson.getString("matter_node_id")
                                    
                                    isRainMaker = isRainmakerNode
                                } catch (e: Exception) {
                                    Log.e(TAG, "Error calling confirmMatterNode API", e)
                                    isRainMaker = isRmClusterAvailable
                                }

                                if (isControllerClusterAvailable && isRainMaker) {
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
                                    
                                    val aclClusterHelper = AccessControlClusterHelper(this@ChipClient)
                                    
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
                                
                                continuation.resume(Unit)
                                
                            } catch (e: Exception) {
                                continuation.resume(Unit)
                            }
                        }
                        
                    } else {
                        continuation.resumeWithException(
                            RuntimeException("Device commissioning failed with error code: $errorCode")
                        )
                    }
                }

                override fun onError(error: Throwable) {
                    continuation.resumeWithException(error)
                }

                override fun onOpCSRGenerationComplete(csr: ByteArray) {
                    Log.d(TAG, "========== OpCSR GENERATION DURING COMMISSIONING ==========")
                    val csrBase64 = Base64.encodeToString(csr, Base64.NO_WRAP)
                    sendCSRToReactNative(csrBase64, deviceId)
                }

                override fun onReadCommissioningInfo(
                    vendorId: Int,
                    productId: Int,
                    wifiEndpointId: Int,
                    threadEndpointId: Int
                ) {
                    Log.d(TAG, "Commissioning info: vendorId=$vendorId, productId=$productId")
                }

                override fun onNotifyChipConnectionClosed() {
                }

                override fun onCloseBleComplete() {
                }
            }

            chipDeviceController.setCompletionListener(callback)
            
            chipDeviceController.commissionDevice(deviceId, networkCredentials)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to commission device: ${e.message}", e)
            continuation.resumeWithException(e)
        }
    }

    private fun sendCSRToReactNative(csrBase64: String, deviceId: Long) {
        try {
            
            currentDeviceId = deviceId
            isCommissioning = true
            nocChainReceived = false
            nocChainInstalled = false
            nocChainInstalled = false

            val requestBody = JSONObject().apply {
                put(AppConstants.KEY_CSR, csrBase64)
                put(AppConstants.KEY_DEVICE_ID_CAMEL, deviceId.toString())
                put(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                put(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
            }

            val out = Bundle().apply {
                putString(AppConstants.KEY_REQUEST_BODY, requestBody.toString())
                putString(AppConstants.KEY_DEVICE_ID_CAMEL, deviceId.toString())
                putString(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                putString(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
            }

            EventBus.getDefault().post(MatterEvent(AppConstants.EVENT_MATTER_NOC_REQUEST, out))

            val intent = Intent(context, com.espressif.novahome.MainActivity::class.java)
                .apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("NOC_GENERATION_STEP", true)
                putExtra("requestId", deviceId.toString())
            }
            context.startActivity(intent)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send CSR to React Native: ${e.message}", e)
        }
    }


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
            Log.d(TAG, "========== NOC CHAIN RECEIVED FROM REACT NATIVE ==========")
            
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
                    Log.w(TAG, "Matter Node ID is null/empty from API response - this may cause issues")
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

    /**
     * Get connected device pointer for cluster operations
     * This is required for post-commissioning device interactions
     */
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
                            Log.e(TAG, "Failed to get connected device pointer for node $nodeId: ${error?.message}")
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

    /**
     * Get connected device pointer synchronously (non-suspend version)
     * Used by helper classes that need device pointer
     */
    fun getConnectedDevicePointer(deviceId: Long): Long {
        
        return try {
            runBlocking {
                awaitGetConnectedDevicePointer(deviceId)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get connected device pointer: ${e.message}")
            throw IllegalStateException("Cannot get connected device pointer for device $deviceId", e)
        }
    }

    /**
     * Read attribute from device using ChipAttributePath
     */
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
                                                Log.d(TAG, "Attribute state found: ${attributeState.value}")
                                                continuation.resume(attributeState)
                                                return
                                            } else {
                                                Log.w(TAG, "Attribute state not found for attribute 0x${attributeId.toString(16)}")
                                            }
                                        } else {
                                            Log.w(TAG, "Cluster state not found for cluster 0x${clusterId.toString(16)}")
                                        }
                                    } else {
                                        Log.w(TAG, "Endpoint state not found for endpoint $endpoint")
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
                val invokeElement = InvokeElement.newInstance(endpointId, clusterId, commandId, tlvData, null)
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
        override fun generatePrivateKey() {
            Log.d(TAG, "generatePrivateKey called")
        }

        @Throws(KeypairDelegate.KeypairException::class)
        override fun createCertificateSigningRequest(): ByteArray? {
            Log.d(TAG, "EspKeypairDelegate createCertificateSigningRequest called")
            return null
        }

        @Throws(KeypairDelegate.KeypairException::class)
        override fun getPublicKey(): ByteArray? {
            return if (::nocKey.isInitialized) nocKey else null
        }

        @Throws(KeypairDelegate.KeypairException::class)
        override fun ecdsaSignMessage(message: ByteArray?): ByteArray? {
            
            if (message == null) {
                Log.w(TAG, "Sign called with null message")
                return null
            }
            
            try {
                // Get private key from Android KeyStore
                val privateKey = keyStore.getKey(fabricId, null) as? PrivateKey
                if (privateKey == null) {
                    Log.w(TAG, "No private key found for fabric: $fabricId")
                    return null
                }
                
                // Sign the message using ECDSA
                val signature = Signature.getInstance(AppConstants.SIGNATURE_ALGORITHM)
                signature.initSign(privateKey)
                signature.update(message)
                val signedMessage = signature.sign()
                
                return signedMessage
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sign message: ${e.message}", e)
                throw KeypairDelegate.KeypairException(e.message)
            }
        }
    }

    /**
     * ESP NOC Chain Issuer
     * Handles NOC chain generation during commissioning
     */
    inner class EspNOCChainIssuer : ChipDeviceController.NOCChainIssuer {
        override fun onNOCChainGenerationNeeded(
            csrInfo: CSRInfo?,
            attestationInfo: AttestationInfo?
        ) {
            Log.d(TAG, "========== NOC CHAIN GENERATION NEEDED ==========")

            if (csrInfo == null) {
                Log.e(TAG, "CSR Info is null cannot generate NOC chain")
                return
            }

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val tempCsr = Base64.encodeToString(csrInfo.csr, Base64.NO_WRAP)
                    val finalCSR = AppConstants.CERT_BEGIN + "\n" + tempCsr + "\n" + AppConstants.CERT_END
                    
                    sendCSRToReactNative(finalCSR, currentDeviceId ?: System.currentTimeMillis())
                    
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
                        Log.e(TAG, "awaitOpenPairingWindowWithPIN.onError: status [${status}] device [${deviceId}]")
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
                        Log.d(TAG, "awaitOpenPairingWindowWithPIN.onSuccess: deviceId [${deviceId}]")
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
        Log.d(TAG, "computePaseVerifier: devicePtr [${devicePtr}] pinCode [${setupPincode}] iterations [${iterations}] salt [${salt}]")
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
            // Reset commissioning state
            currentDeviceId = null
            isCommissioning = false
            nocChainReceived = false
            
            Log.d(TAG, "ChipClient closed successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing ChipClient: ${e.message}", e)
        }
    }
}
