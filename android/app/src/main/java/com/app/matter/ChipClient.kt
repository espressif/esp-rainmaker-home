/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.bluetooth.BluetoothGatt
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.util.Log
import chip.devicecontroller.*
import chip.devicecontroller.GetConnectedDeviceCallbackJni.GetConnectedDeviceCallback
import chip.devicecontroller.model.*
import chip.platform.*
import com.google.gson.GsonBuilder
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
import java.util.Optional
import java.util.concurrent.TimeoutException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/**
 * Handles Matter device communication and commissioning
 */
class ChipClient @JvmOverloads constructor(
    private val context: Context,
    private val groupId: String,
    private val fabricId: String,
    private val rootCa: String,
    private var userNoc: String,
    private val ipk: String,
    private val groupCatIdOperate: String,
    private val groupCatIdAdmin: String = ""
) {

    companion object {
        const val TAG = "ChipClient"
        private const val MATTER_DATA_MODEL_LOG_LABEL =
            "Complete Matter device data model (post-commissioning)"
        private const val DEFAULT_TIMEOUT = 15000L
        private const val INVOKE_COMMAND_TIMEOUT = 15000

        /**
         * Fail-safe timer (seconds) re-armed just before NOC issuance, via the
         * device attestation delegate.
         */
        private const val COMMISSIONING_FAILSAFE_EXPIRY_SECONDS = 90
        private const val BASIC_INFORMATION_CLUSTER_ID = 0x00000028L
        private const val DATA_MODEL_REVISION_ATTRIBUTE_ID = 0x00000000L
        private const val SOFTWARE_VERSION_ATTRIBUTE_ID = 0x00000009L
        private const val SOFTWARE_VERSION_STRING_ATTRIBUTE_ID = 0x0000000AL

        // ----------------------------------------------------------------------------------
        // Process-wide AndroidChipPlatform / AndroidBleManager.
        //
        // The native CHIP stack stores the BLE manager via a JniGlobalReference whose Init()
        // *silently rejects* any subsequent registration (returns CHIP_ERROR_INCORRECT_STATE).
        // That means only the FIRST AndroidBleManager ever passed to nativeSetBLEManager()
        // is wired into the native BLE layer for the lifetime of the process.
        //
        // Multiple ChipClient instances (one per fabric + one per commissioning attempt)
        // would otherwise spawn multiple AndroidBleManager instances of which only the first
        // is actually live. When the ChipTool commissioning flow then registers a
        // BluetoothGatt with a different (later) AndroidBleManager, the native code looks
        // up the original BleManager, does not see the connection, and fails the write with
        // "Unknown connId 1".
        //
        // Sharing a single platform/BleManager across all ChipClient instances avoids that
        // mismatch. Each ChipClient still owns its own ChipDeviceController so that
        // fabric-specific OperationalKeyConfig (root CA, IPK, NOC, ...) is honored.
        // ----------------------------------------------------------------------------------
        @Volatile
        private var sAndroidPlatform: AndroidChipPlatform? = null

        @Volatile
        private var sBleManager: AndroidBleManager? = null

        /**
         * Ensures the process-wide [AndroidChipPlatform] / [AndroidBleManager] are initialised
         * exactly once. Returns the cached instance on every subsequent call.
         */
        @JvmStatic
        @Synchronized
        fun ensureAndroidChipPlatform(context: Context): AndroidChipPlatform {
            sAndroidPlatform?.let { return it }
            ChipDeviceController.loadJni()
            val ble = AndroidBleManager()
            val platform = AndroidChipPlatform(
                ble,
                AndroidNfcCommissioningManager(),
                PreferencesKeyValueStoreManager(context),
                PreferencesConfigurationManager(context),
                NsdManagerServiceResolver(context),
                NsdManagerServiceBrowser(context),
                ChipMdnsCallbackImpl(),
                DiagnosticDataProviderImpl(context)
            )
            sBleManager = ble
            sAndroidPlatform = platform
            return platform
        }

        /**
         * Returns the process-wide [AndroidBleManager], initialising the platform on demand.
         */
        @JvmStatic
        @Synchronized
        fun ensureBleManager(context: Context): AndroidBleManager {
            ensureAndroidChipPlatform(context)
            return sBleManager!!
        }
    }

    /**
     * Returns the process-wide [AndroidBleManager]. ChipTool style commissioning uses this
     * to register the live [android.bluetooth.BluetoothGatt] with the same BLE manager that
     * the native CHIP stack queries.
     */
    fun getBleManager(): AndroidBleManager = ensureBleManager(context)

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

    // Lazily instantiate ChipDeviceController. Package-internal so
    // [ESPMatterControl] can reach the low-level CHIP IM primitives
    // (subscribe/shutdownSubscriptions) that aren't yet wrapped here.
    internal val chipDeviceController: ChipDeviceController by lazy {
        Log.d(TAG, "========== INITIALIZING ESP RAINMAKER CHIP DEVICE CONTROLLER ==========")
        // The native CHIP stack only honours the FIRST AndroidBleManager registered for
        // the process. Always go through ensureAndroidChipPlatform() so every ChipClient
        // shares the same one — required for the ChipTool BLE commissioning path.
        ensureAndroidChipPlatform(context)

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

            // Extend the commissioning fail-safe to handle slow cloud-signed NOC flows.
            // The default ~30s expires during RainMaker Next-Gen /verify NOC (~29s),
            // causing session eviction and commissioning failure (0x32).
            // Setting a DeviceAttestationDelegate re-arms the fail-safe before
            // GenerateNOCChain. Attestation is handled by PartialDACVerifier, so always
            // call continueCommissioning (ignoreAttestationFailure = true).
            chipDeviceController.setDeviceAttestationDelegate(
                COMMISSIONING_FAILSAFE_EXPIRY_SECONDS
            ) { devicePtr, _, errorCode ->
                // Do NOT call continueCommissioning synchronously here. This callback
                // runs on the CHIP event-loop thread with the stack lock held; calling
                // continueCommissioning inline re-enters the commissioner and deadlocks
                // that thread — observed on-device as the CHIP thread going silent right
                // after this point (no CSR sent, inbound packets unprocessed), the
                // device's fail-safe later expiring, and commissioning failing with 0x32.
                // Defer it so this callback unwinds and releases the lock first; the
                // resumed flow then proceeds to SendOpCertSigningRequest → NOC.
                Log.d(
                    TAG,
                    "onDeviceAttestationCompleted errorCode=$errorCode — scheduling continue " +
                        "(fail-safe extended to ${COMMISSIONING_FAILSAFE_EXPIRY_SECONDS}s)"
                )
                CoroutineScope(Dispatchers.Default).launch {
                    try {
                        chipDeviceController.continueCommissioning(devicePtr, true)
                    } catch (e: Exception) {
                        Log.e(TAG, "continueCommissioning failed: ${e.message}", e)
                    }
                }
            }
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
            chipDeviceController.setCompletionListener(buildCommissioningCompletionListener(continuation))

            chipDeviceController.commissionDevice(deviceId, networkCredentials)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to commission device: ${e.message}", e)
            continuation.resumeWithException(e)
            commissioningContinuation = null
        }
    }

    /**
     * ChipTool style commissioning: drives the full PASE + commissioning + network
     * provisioning flow over BLE in a single call. Reuses the exact same completion listener
     * as [awaitCommissionDevice], so the post-commissioning steps (RM cluster reads, ACL
     * setup, headless confirm-commission task) run identically regardless of which Matter
     * back-end started the flow.
     *
     * The [bleGatt] / [connId] must come from [ChipToolBluetoothManager], which has already
     * registered the connection with the process-wide [AndroidBleManager] owned by
     * [ensureAndroidChipPlatform].
     *
     * @param deviceId Operational Matter node id this ChipClient will use locally during
     *                 commissioning. The final node id assigned by RainMaker is independent
     *                 and is fetched via the NOC chain issuer.
     * @param bleGatt Live GATT connection to the commissionable device.
     * @param connId Connection id returned by `AndroidBleManager.addConnection(...)`.
     * @param setupPinCode Setup PIN parsed from the QR / manual pairing code.
     * @param networkCredentials Wi-Fi credentials the device should join post-commission.
     */
    suspend fun awaitPairDeviceOverBle(
        deviceId: Long,
        bleGatt: BluetoothGatt,
        connId: Int,
        setupPinCode: Long,
        networkCredentials: NetworkCredentials?
    ) = suspendCancellableCoroutine<Unit> { continuation ->
        Log.d(TAG, "Pairing device over BLE: deviceId=$deviceId connId=$connId")

        // Match the state reset that GPS flow performs in triggerNOCTask(). We need a clean
        // slate here because the NOCChainIssuer callback is invoked inside pairDevice(), so
        // confirmTaskTriggered must be false when the new commissioning starts.
        currentDeviceId = deviceId
        tempDeviceId = deviceId
        isCommissioning = true
        nocChainReceived = false
        nocChainInstalled = false
        confirmTaskTriggered = false
        commissioningContinuation = continuation

        try {
            chipDeviceController.setCompletionListener(buildCommissioningCompletionListener(continuation))

            chipDeviceController.pairDevice(
                bleGatt,
                connId,
                deviceId,
                setupPinCode,
                networkCredentials
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to pair device over BLE: ${e.message}", e)
            continuation.resumeWithException(e)
            commissioningContinuation = null
        }
    }

    /**
     * Builds the shared post-commissioning listener used by both the GPS-driven
     * [awaitCommissionDevice] and the in-app ChipTool [awaitPairDeviceOverBle] flow.
     * Completing the [continuation] is deferred to the headless confirm-commission task
     * (see [onCommissioningFullyComplete] / [onCommissioningFailed]); the listener only
     * resumes the continuation directly on synchronous error paths.
     */
    private fun buildCommissioningCompletionListener(
        continuation: CancellableContinuation<Unit>
    ): BaseCompletionListener {
        return object : BaseCompletionListener() {
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
                                val endpointsJson = JsonObject()
                                /**
                                 * Build cloud Matter metadata in the canonical nested shape used by
                                 * reference apps and the Matter SDK:
                                 *
                                 * {
                                 *   "Matter": {
                                 *     "deviceName": "...",
                                 *     "isRainmaker": <bool>,
                                 *     "group_id": "...",
                                 *     "endpoints": {
                                 *       "0x<EP>": {
                                 *         "deviceType": [<int>...],
                                 *         "clusters": {
                                 *           "servers": {
                                 *             "0x<CID>": {
                                 *               "attributes": ["0x<AID>"...] | null,
                                 *               "accepted_commands": ["0x<CMD>"...] | null
                                 *             }
                                 *           },
                                 *           "clients": { "0x<CID>": { "attributes": null } }
                                 *         }
                                 *       }
                                 *     }
                                 *   }
                                 * }
                                 */

                                if (deviceMatterInfo.isNotEmpty()) {
                                    try {
                                        for (info in deviceMatterInfo) {

                                            if (info.types.isNotEmpty()) {
                                                val primaryDeviceType = info.types[0].toInt()
                                                if (info.endpoint != 0 && deviceName.isEmpty()) {
                                                    deviceName =
                                                        NodeUtils.getDefaultNameForMatterDevice(
                                                            primaryDeviceType
                                                        )
                                                }
                                            }

                                            val endpointJson = JsonObject()
                                            val deviceTypesArr = JsonArray()
                                            for (type in info.types) {
                                                deviceTypesArr.add(type.toInt())
                                            }
                                            endpointJson.add(
                                                AppConstants.KEY_DEVICE_TYPE,
                                                deviceTypesArr
                                            )

                                            val clustersJson = JsonObject()

                                            val serversJson = JsonObject()
                                            for (serverCluster in info.serverClusters) {
                                                val clusterIdLong = serverCluster.toString().toLong()
                                                val clusterIdHex = "0x${clusterIdLong.toString(16)}"
                                                val clusterJson = JsonObject()

                                                val attributeIds =
                                                    info.clusterAttributes[serverCluster.toString()]
                                                if (attributeIds != null && attributeIds.isNotEmpty()) {
                                                    val attributesArr = JsonArray()
                                                    for (attributeId in attributeIds) {
                                                        attributesArr.add(
                                                            "0x${attributeId.toString(16)}"
                                                        )
                                                    }
                                                    clusterJson.add(
                                                        AppConstants.KEY_ATTRIBUTES,
                                                        attributesArr
                                                    )
                                                } else {
                                                    clusterJson.add(
                                                        AppConstants.KEY_ATTRIBUTES,
                                                        null
                                                    )
                                                }

                                                val commandIds =
                                                    info.clusterAcceptedCommands[serverCluster.toString()]
                                                if (commandIds != null && commandIds.isNotEmpty()) {
                                                    val commandsArr = JsonArray()
                                                    for (commandId in commandIds) {
                                                        commandsArr.add(
                                                            "0x${commandId.toString(16)}"
                                                        )
                                                    }
                                                    clusterJson.add(
                                                        AppConstants.KEY_ACCEPTED_COMMANDS,
                                                        commandsArr
                                                    )
                                                } else {
                                                    clusterJson.add(
                                                        AppConstants.KEY_ACCEPTED_COMMANDS,
                                                        null
                                                    )
                                                }
                                                serversJson.add(clusterIdHex, clusterJson)
                                            }

                                            val clientsJson = JsonObject()
                                            for (clientCluster in info.clientClusters) {
                                                val clusterIdLong = clientCluster.toString().toLong()
                                                val clusterIdHex = "0x${clusterIdLong.toString(16)}"
                                                val clusterJson = JsonObject()
                                                clusterJson.add(AppConstants.KEY_ATTRIBUTES, null)
                                                clientsJson.add(clusterIdHex, clusterJson)
                                            }

                                            if (serversJson.size() > 0) {
                                                clustersJson.add(AppConstants.KEY_SERVERS, serversJson)
                                            }
                                            if (clientsJson.size() > 0) {
                                                clustersJson.add(AppConstants.KEY_CLIENTS, clientsJson)
                                            }

                                            endpointJson.add(AppConstants.KEY_CLUSTERS, clustersJson)
                                            endpointsJson.add(
                                                "0x${info.endpoint.toString(16)}",
                                                endpointJson
                                            )

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

                                        if (deviceName.isEmpty()) {
                                            deviceName = AppConstants.DEFAULT_MATTER_DEVICE_NAME
                                        }

                                        metadataJson.addProperty(
                                            AppConstants.KEY_IS_RAINMAKER,
                                            isRmClusterAvailable
                                        )
                                        metadataJson.addProperty(
                                            AppConstants.KEY_DEVICE_NAME_CAMEL,
                                            deviceName
                                        )
                                        metadataJson.addProperty(AppConstants.KEY_GROUP_ID, groupId)
                                        metadataJson.add(AppConstants.KEY_ENDPOINTS, endpointsJson)

                                        // Basic Information (0x28) on EP0: capture SoftwareVersion (0x9,
                                        // numeric build id) + SoftwareVersionString (0xA, display) so
                                        // pure-Matter nodes (no cloud config) can surface a version. The
                                        // values ride along in metadataJson -> body.metadata.Matter and
                                        // are persisted by the confirm-commission task, same as
                                        // deviceName / rmNodeId. A missing/unsupported attribute must not
                                        // abort commissioning, so failures are swallowed.
                                        try {
                                            val softwareVersion = readAttribute(
                                                devicePtr,
                                                ChipAttributePath.newInstance(
                                                    AppConstants.ENDPOINT_0,
                                                    BASIC_INFORMATION_CLUSTER_ID,
                                                    SOFTWARE_VERSION_ATTRIBUTE_ID
                                                )
                                            )?.value
                                            val softwareVersionString = readAttribute(
                                                devicePtr,
                                                ChipAttributePath.newInstance(
                                                    AppConstants.ENDPOINT_0,
                                                    BASIC_INFORMATION_CLUSTER_ID,
                                                    SOFTWARE_VERSION_STRING_ATTRIBUTE_ID
                                                )
                                            )?.value
                                            if (softwareVersion != null) {
                                                metadataJson.addProperty(
                                                    AppConstants.KEY_SOFTWARE_VERSION,
                                                    softwareVersion.toString()
                                                )
                                            }
                                            if (softwareVersionString is String) {
                                                metadataJson.addProperty(
                                                    AppConstants.KEY_SOFTWARE_VERSION_STRING,
                                                    softwareVersionString
                                                )
                                            }
                                        } catch (e: Exception) {
                                            Log.w(
                                                TAG,
                                                "Failed to read Basic Information software version: ${e.message}"
                                            )
                                        }

                                        logMatterDeviceDataModel(metadataJson)

                                        this@ChipClient.lastCommissionedDeviceName = deviceName

                                    } catch (e: Exception) {
                                        Log.e(TAG, "Error building metadata: ${e.message}", e)
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
                                            Optional.empty(),
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

    /** Initialize state and trigger HeadlessJS task with attestation data for /verify flow. */
    private fun triggerNOCTaskWithAttestation(
        deviceId: Long,
        nocsrElements: String,
        attestationSignature: String,
        attestationChallenge: String?,
        csr: String = ""
    ) {
        currentDeviceId = deviceId
        isCommissioning = true
        nocChainReceived = false
        nocChainInstalled = false
        confirmTaskTriggered = false

        try {
            val currentRequestId = requestId ?: deviceId.toString()
            val fabric = FabricSessionManager.getCurrentFabric()

            Log.d(
                TAG,
                "[NONCE-TRACE] triggerNOCTaskWithAttestation: requestId=$currentRequestId, nocsrElements(first40)=${nocsrElements.take(40)}, len=${nocsrElements.length}"
            )

            val intent = Intent(context, MatterHeadlessTaskService::class.java).apply {
                putExtra(AppConstants.EXTRA_TASK_NAME, AppConstants.TASK_ISSUE_NOC)
                putExtra(AppConstants.EXTRA_NODE_ID, deviceId.toString())
                putExtra(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
                putExtra(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                putExtra(AppConstants.KEY_REQUEST_ID_CAMEL, currentRequestId)
                putExtra(AppConstants.KEY_NOCSR_ELEMENTS, nocsrElements)
                putExtra(AppConstants.KEY_ATTESTATION_SIGNATURE, attestationSignature)
                attestationChallenge?.let {
                    putExtra(AppConstants.KEY_ATTESTATION_CHALLENGE, it)
                }
                // The RainMaker NOC task issues the cert from the PEM CSR
                // (fabric.issueNodeNoC({csr})).
                if (csr.isNotEmpty()) {
                    putExtra(AppConstants.KEY_CSR, csr)
                }
                putExtra(AppConstants.KEY_SIGV4_ACCESS_KEY, fabric?.sigv4AccessKey ?: "")
                putExtra(AppConstants.KEY_SIGV4_SECRET_KEY, fabric?.sigv4SecretKey ?: "")
                putExtra(AppConstants.KEY_SIGV4_SESSION_TOKEN, fabric?.sigv4SessionToken ?: "")
                putExtra(AppConstants.KEY_SIGV4_EXPIRATION, fabric?.sigv4Expiration ?: "")
            }

            context.startService(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger NOC task with attestation: ${e.message}", e)
        }
    }

    /** Trigger HeadlessJS task to issue NOC certificate (legacy CSR-only fallback). */
    private fun triggerHeadlessNOCTask(csrBase64: String, deviceId: Long) {
        try {
            val currentRequestId = requestId ?: deviceId.toString()
            val fabric = FabricSessionManager.getCurrentFabric()

            val intent = Intent(context, MatterHeadlessTaskService::class.java).apply {
                putExtra(AppConstants.EXTRA_TASK_NAME, AppConstants.TASK_ISSUE_NOC)
                putExtra(AppConstants.EXTRA_NODE_ID, deviceId.toString())
                putExtra(AppConstants.KEY_CSR, csrBase64)
                putExtra(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
                putExtra(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                putExtra(AppConstants.KEY_REQUEST_ID_CAMEL, currentRequestId)
                putExtra(AppConstants.KEY_SIGV4_ACCESS_KEY, fabric?.sigv4AccessKey ?: "")
                putExtra(AppConstants.KEY_SIGV4_SECRET_KEY, fabric?.sigv4SecretKey ?: "")
                putExtra(AppConstants.KEY_SIGV4_SESSION_TOKEN, fabric?.sigv4SessionToken ?: "")
                putExtra(AppConstants.KEY_SIGV4_EXPIRATION, fabric?.sigv4Expiration ?: "")
            }

            context.startService(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger NOC task: ${e.message}", e)
        }
    }

    /** Trigger HeadlessJS task to confirm commissioning. */
    private fun triggerHeadlessConfirmCommissionTask(metadata: JSONObject) {
        try {
            val currentRequestId = requestId ?: currentDeviceId.toString()
            // Use the operational Matter node id (hex, e.g. 21A2A7FDD35FABF2) the cloud/sync key
            // nodes by - not currentDeviceId, which is the temporary commissioning id. The headless
            // confirm task keys persisted Matter metadata by this; a temp id would mismatch on read.
            val nodeId = matterNodeId ?: rmNodeId ?: currentDeviceId?.toString() ?: ""
            val challengeValue = metadata.optString(AppConstants.KEY_CHALLENGE, challenge ?: "")
            val challengeResponseValue = metadata.optString(AppConstants.KEY_CHALLENGE_RESPONSE, challenge ?: "")
            val fabric = FabricSessionManager.getCurrentFabric()

            val intent = Intent(context, MatterHeadlessTaskService::class.java).apply {
                putExtra(AppConstants.EXTRA_TASK_NAME, AppConstants.TASK_CONFIRM_COMMISSION)
                putExtra(AppConstants.EXTRA_NODE_ID, nodeId)
                putExtra(AppConstants.KEY_FABRIC_ID_CAMEL, fabricId)
                putExtra(AppConstants.KEY_GROUP_ID_CAMEL, groupId)
                putExtra(AppConstants.KEY_REQUEST_ID_CAMEL, currentRequestId)
                putExtra(AppConstants.KEY_METADATA, metadata.toString())
                putExtra(AppConstants.KEY_CHALLENGE_CAMEL, challengeValue)
                putExtra(AppConstants.KEY_CHALLENGE_RESPONSE_CAMEL, challengeResponseValue)
                putExtra(AppConstants.KEY_SIGV4_ACCESS_KEY, fabric?.sigv4AccessKey ?: "")
                putExtra(AppConstants.KEY_SIGV4_SECRET_KEY, fabric?.sigv4SecretKey ?: "")
                putExtra(AppConstants.KEY_SIGV4_SESSION_TOKEN, fabric?.sigv4SessionToken ?: "")
                putExtra(AppConstants.KEY_SIGV4_EXPIRATION, fabric?.sigv4Expiration ?: "")
            }
            context.startService(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger Confirm Commission task: ${e.message}", e)
        }
    }

    /**
     * Receive NOC from HeadlessJS task result using this client's stored fabric credentials.
     */
    fun receiveNOCFromTask(taskRequestId: String, operationalCert: String, taskMatterNodeId: String?) {
        receiveNOCChain(
            requestId = taskRequestId,
            rootCert = rootCa,
            // intermediateCert is intentionally empty: RainMaker uses a 2-tier PKI
            // (Root -> NOC, no ICA). receiveNOCChain() ignores this argument and always
            // installs an empty ICAC (see emptyIcac in receiveNOCChain). Passing rootCa
            // here was misleading dead code, not an actual intermediate certificate.
            intermediateCert = "",
            operationalCert = operationalCert,
            ipkValue = ipk,
            adminVendorId = AppConstants.ESP_VENDOR_ID.toString(),
            matterNodeId = taskMatterNodeId
        )
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

                // CHIPDeviceController-JNI.cpp::onNOCChainGeneration now performs hard
                // non-null checks on ControllerParams fields and rejects missing values
                // with CHIP_ERROR_BAD_REQUEST (0x92). RainMaker uses a 2-tier PKI
                // (Root -> NOC, no ICA), so pass an empty byte array for the intermediate
                // certificate; downstream this is interpreted as "no intermediate cert".
                // NOTE: the `intermediateCert` parameter of this function is intentionally
                // NOT consumed — the intermediate is always empty regardless of what the
                // caller passes. Do not be misled into "fixing" the caller's value.
                val emptyIcac = ByteArray(0)

                // admin subject is the CAT id for the admin group
                val adminSubject: Long = if (groupCatIdAdmin.isNotEmpty()) {
                    Utils.getCatId(groupCatIdAdmin)
                } else {
                    Log.e(TAG, "groupCatIdAdmin is EMPTY; commissioning may fail")
                    0L
                }
                Log.d(
                    TAG,
                    "Using admin CAT subject: 0x${java.lang.Long.toHexString(adminSubject)}"
                )

                // Intentionally do NOT call setAdminSubject(...) here. Matching the
                // Espressif RainMaker reference app, we let the SDK derive the
                // AddNOC.caseAdminSubject from the controller's own operational node
                // ID (the userNoc operational identity). Passing groupCatIdAdmin as
                // a CAT here installs an ACL admin entry on the device that is keyed
                // to the CAT, and the device then rejects CommissioningComplete with
                // status 0x7E (UnsupportedAccess) whenever the userNoc subject DN
                // doesn't carry that exact CAT (id+version) — which is the scenario
                // we hit on pure-Matter fabrics. Operate-level CATs are still applied
                // post-commissioning via AccessControlClusterHelper.writeAclAttribute.
                val errorCode = chipDeviceController.onNOCChainGeneration(
                    ControllerParams.newBuilder()
                        .setRootCertificate(chain[1].encoded)
                        .setIntermediateCertificate(emptyIcac)
                        .setOperationalCertificate(chain[0].encoded)
                        .setIpk(ipkEpochKey)
                        .setAdminSubject(adminSubject)
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
     * Returns the operational IP address CHIP resolved for a connected node, if available.
     *
     * @param nodeId Matter operational node id (64-bit).
     * @returns Host/IP string or `null` when the node is not connected.
     */
    fun getIpAddressForNode(nodeId: Long): String? {
        return try {
            chipDeviceController.getIpAddress(nodeId)
        } catch (e: Exception) {
            Log.w(TAG, "getIpAddressForNode failed for $nodeId: ${e.message}")
            null
        }
    }

    /**
     * Returns host/port CHIP resolved for a connected node, if available.
     *
     * @param nodeId Matter operational node id (64-bit).
     * @returns [NetworkLocation] or `null` when the node is not connected.
     */
    fun getNetworkLocationForNode(nodeId: Long): NetworkLocation? {
        return try {
            chipDeviceController.getNetworkLocation(nodeId)
        } catch (e: Exception) {
            Log.w(TAG, "getNetworkLocationForNode failed for $nodeId: ${e.message}")
            null
        }
    }

    /** Get connected device pointer for cluster operations. */
    // Cancellable so a caller's withTimeout(...) can actually cut this off. With a
    // plain suspendCoroutine the coroutine is non-cancellable, so CHIP's ~40s
    // AddressResolve default runs to completion regardless of any wrapping timeout.
    suspend fun awaitGetConnectedDevicePointer(deviceId: Long): Long =
        suspendCancellableCoroutine { continuation ->

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

    /**
     * Confirms a node is still reachable by reading Basic Information `DataModelRevision`.
     * Cached CASE sessions can make [awaitGetConnectedDevicePointer] succeed without LAN I/O.
     *
     * @param devicePointer Connected device pointer from CHIP.
     * @param timeoutMs Interaction-model timeout for the read.
     * @returns True when the device responds; false on error or timeout.
     */
    suspend fun awaitVerifyOperationalReachability(
        devicePointer: Long,
        timeoutMs: Int = AppConstants.MATTER_DISCOVERY_LIVENESS_TIMEOUT_MS.toInt(),
    ): Boolean {
        val attributePath = ChipAttributePath.newInstance(
            0,
            BASIC_INFORMATION_CLUSTER_ID,
            DATA_MODEL_REVISION_ATTRIBUTE_ID,
        )

        return suspendCoroutine { continuation ->
            var finished = false
            fun finish(reachable: Boolean) {
                if (finished) {
                    return
                }
                finished = true
                continuation.resume(reachable)
            }

            try {
                chipDeviceController.readAttributePath(
                    object : ReportCallback {
                        override fun onReport(nodeState: NodeState?) {
                            if (nodeState == null) {
                                Log.d(TAG, "verifyOperationalReachability: empty NodeState")
                                finish(false)
                                return
                            }
                            val attributeState =
                                nodeState
                                    .getEndpointState(0)
                                    ?.getClusterState(BASIC_INFORMATION_CLUSTER_ID)
                                    ?.getAttributeState(DATA_MODEL_REVISION_ATTRIBUTE_ID)
                            if (attributeState != null) {
                                Log.d(TAG, "verifyOperationalReachability: ok")
                                finish(true)
                            } else {
                                Log.d(TAG, "verifyOperationalReachability: attribute missing")
                                finish(false)
                            }
                        }

                        override fun onError(
                            attributePath: ChipAttributePath?,
                            eventPath: ChipEventPath?,
                            ex: Exception,
                        ) {
                            Log.d(
                                TAG,
                                "verifyOperationalReachability onError: ${ex.message}",
                            )
                            finish(false)
                        }
                    },
                    devicePointer,
                    listOf(attributePath),
                    timeoutMs,
                )
            } catch (e: Exception) {
                Log.w(TAG, "verifyOperationalReachability failed: ${e.message}")
                finish(false)
            }
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
                null,
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
                    val deviceId = currentDeviceId ?: System.currentTimeMillis()

                    val attestationChallengeHex: String? = attestationInfo?.challenge?.toHexString()
                    val elementsSignatureHex: String? = csrInfo.elementsSignature?.toHexString()
                    val csrElementsTLVBytes: ByteArray? = csrInfo.elements

                    Log.d(
                        TAG,
                        "CSRInfo fields — elements: ${csrElementsTLVBytes?.size} bytes, " +
                            "elementsSignature: ${csrInfo.elementsSignature?.size} bytes"
                    )
                    Log.d(TAG, "AttestationInfo challenge: ${attestationInfo?.challenge?.size} bytes")

                    val csrElementsTLVHex = csrElementsTLVBytes?.toHexString()

                    if (elementsSignatureHex != null && csrElementsTLVHex != null) {
                        Log.d(TAG, "Attestation data extracted — using /verify flow")
                        // Build the PEM CSR for the RainMaker NOC task
                        // (fabric.issueNodeNoC({csr})).
                        val csrPem = AppConstants.CERT_BEGIN + "\n" +
                            Base64.encodeToString(csrInfo.csr, Base64.NO_WRAP) + "\n" +
                            AppConstants.CERT_END
                        triggerNOCTaskWithAttestation(
                            deviceId,
                            csrElementsTLVHex,
                            elementsSignatureHex,
                            attestationChallengeHex,
                            csrPem
                        )
                    } else {
                        Log.w(
                            TAG,
                            "Attestation data missing (elements=${csrElementsTLVBytes?.size}, sig=${csrInfo.elementsSignature?.size}) — falling back to /matter-noc flow"
                        )
                        val tempCsr = Base64.encodeToString(csrInfo.csr, Base64.NO_WRAP)
                        val finalCSR =
                            AppConstants.CERT_BEGIN + "\n" + tempCsr + "\n" + AppConstants.CERT_END
                        triggerNOCTask(finalCSR, deviceId)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to process NOC chain generation: ${e.message}", e)
                }
            }
        }
    }

    private fun ByteArray.toHexString(): String =
        joinToString("") { "%02x".format(it) }

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

    /**
     * Pretty-prints the complete Matter device data model after successful commissioning.
     */
    private fun logMatterDeviceDataModel(metadata: JsonObject) {
        try {
            val prettyJson = GsonBuilder().setPrettyPrinting().create().toJson(metadata)
            Log.i(TAG, "$MATTER_DATA_MODEL_LOG_LABEL:\n$prettyJson")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to log Matter device data model: ${e.message}", e)
        }
    }
}
