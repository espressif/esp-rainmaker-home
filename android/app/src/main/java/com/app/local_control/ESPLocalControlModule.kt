/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.local_control

import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import com.espressif.provisioning.listeners.ResponseListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import java.util.Base64
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.espressif.provisioning.security.Security
import com.espressif.provisioning.security.Security0
import com.espressif.provisioning.security.Security1
import com.espressif.provisioning.security.Security2
import com.facebook.react.bridge.WritableNativeMap
import java.net.CookieManager
import java.net.HttpCookie
import java.net.HttpURLConnection
import com.espressif.provisioning.transport.Transport
import java.util.concurrent.Executors
import java.net.URL
import android.text.TextUtils
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * `ESPLocalControlModule` enables local control of ESP devices within the local network.
 * This module provides:
 * - Session establishment with devices using different security levels.
 * - Data exchange with devices over a secure channel.
 * - React Native integration for triggering actions and handling responses.
 */
class ESPLocalControlModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ReactPackage {

    companion object {
        private const val TAG = "ESPLocalControlModule"

        /** Legacy `esp_local_ctrl` protocol (RainMaker classic firmware). */
        const val LOCAL_SESSION_ENDPOINT: String = "esp_local_ctrl/session"
        const val LOCAL_VERSION_ENDPOINT: String = "esp_local_ctrl/version"
        const val LOCAL_VERSION_KEY: String = "local_ctrl"

        // Keys of the optional `options` map JS passes to connect(), letting the
        // caller select the protocol's protocomm endpoints. Absent options keep
        // the legacy defaults above, so older JS bundles are unaffected.
        private const val OPTION_SESSION_PATH = "sessionPath"
        private const val OPTION_VERSION_PATH = "versionPath"
        private const val OPTION_VERSION_KEY = "versionKey"
    }

    // All connection state (credentials, endpoints, session) lives on the per-node
    // EspLocalDevice entries in this map. There is deliberately NO module-wide
    // session/baseUrl: a shared session meant sendData(nodeA) could ride whichever
    // node connected last, delivering params to the wrong device.
    private val localDeviceMap: HashMap<String, EspLocalDevice> = HashMap()

    /**
     * Returns the name of the module for React Native integration.
     */
    override fun getName(): String {
        return "ESPLocalControlModule"
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = listOf(this).toMutableList()

    /**
     * Interface for session events.
     */
    interface SessionListener {
        fun onSessionEstablished()
        fun onSessionEstablishFailed(e: Exception)
    }

    /**
     * Protocomm endpoints of the local-control protocol a node speaks. Defaults
     * to the legacy `esp_local_ctrl` paths; RainMaker Neo nodes are connected
     * with the `rmaker_local_ctrl` paths supplied by the JS transport.
     *
     * @property sessionPath Session-security endpoint.
     * @property versionPath Version/service-info endpoint.
     * @property versionKey Root key holding `sec_patch_ver` in the version JSON.
     */
    data class LocalCtrlEndpoints(
        val sessionPath: String = LOCAL_SESSION_ENDPOINT,
        val versionPath: String = LOCAL_VERSION_ENDPOINT,
        val versionKey: String = LOCAL_VERSION_KEY
    )

    /**
     * Per-node connection state captured at connect() time. Re-used by sendData()
     * to re-handshake with the original credentials if the session is torn down.
     *
     * @property session The node's own secure session (bound to a transport built
     *   from [baseUrl]). Every send for this nodeId goes through this session and
     *   no other, so commands can never ride another node's connection.
     */
    inner class EspLocalDevice(
        val nodeId: String,
        val ipAddr: String,
        val port: Int,
        val baseUrl: String,
        val securityType: Int,
        val pop: String?,
        val username: String?,
        val endpoints: LocalCtrlEndpoints
    ) {
        @Volatile
        var session: EspLocalSession? = null
    }

    /**
     * Class managing session logic for secure communication with devices.
     *
     * @property transport Transport mechanism used for communication.
     * @property security Security layer for encrypting/decrypting data.
     */
    inner class EspLocalSession(
        private val transport: EspLocalTransport,
        private val security: Security,
        private val sessionPath: String = LOCAL_SESSION_ENDPOINT
    ) {

        private var isSessionEstablished = false

        /**
         * Checks if the session is established.
         *
         * @return True if the session is established, otherwise false.
         */
        fun isEstablished(): Boolean = isSessionEstablished

        /**
         * Initializes the session with the device.
         *
         * @param response Initial response data, if any.
         * @param sessionListener Listener to handle session events.
         */
        fun init(response: ByteArray?, sessionListener: SessionListener) {
            try {
                val request = security.getNextRequestInSession(response)
                if (request == null) {
                    isSessionEstablished = true
                    sessionListener.onSessionEstablished()
                } else {
                    transport.sendConfigData(
                        sessionPath,
                        request,
                        object : ResponseListener {
                            override fun onSuccess(returnData: ByteArray?) {
                                if (returnData == null) {
                                    sessionListener.onSessionEstablishFailed(
                                        RuntimeException("Session could not be established")
                                    )
                                } else {
                                    init(returnData, sessionListener)
                                }
                            }

                            override fun onFailure(e: Exception) {
                                sessionListener.onSessionEstablishFailed(e)
                            }
                        })
                }
            } catch (e: RuntimeException) {
                sessionListener.onSessionEstablishFailed(e)
            }
        }

        /**
         * Sends encrypted data to the device.
         *
         * @param path Endpoint path to send the data.
         * @param data Data to be sent.
         * @param listener Listener to handle the response.
         */
        fun sendDataToDevice(path: String, data: ByteArray, listener: ResponseListener) {
            if (isSessionEstablished) {
                sendEncrypted(path, data, listener)
            } else {
                init(null, object : SessionListener {
                    override fun onSessionEstablished() {
                        sendEncrypted(path, data, listener)
                    }

                    override fun onSessionEstablishFailed(e: Exception) {
                        listener.onFailure(e)
                    }
                })
            }
        }

        /**
         * Encrypts and sends [data], decrypting the response. Encryption must
         * happen only once the session is established — the security object's
         * cipher state is derived from the handshake, so bytes encrypted before a
         * re-handshake would be garbage to the device (and vice versa).
         */
        private fun sendEncrypted(path: String, data: ByteArray, listener: ResponseListener) {
            val encryptedData = security.encrypt(data)
            transport.sendConfigData(path, encryptedData, object : ResponseListener {
                override fun onSuccess(returnData: ByteArray?) {
                    try {
                        val decryptedData = security.decrypt(returnData)
                        listener.onSuccess(decryptedData)
                    } catch (e: Exception) {
                        // Decrypt failure means this session is unusable; force a
                        // fresh handshake on the next sendData call.
                        isSessionEstablished = false
                        listener.onFailure(e)
                    }
                }

                override fun onFailure(e: Exception) {
                    isSessionEstablished = false
                    listener.onFailure(e)
                }
            })
        }

    }

    /**
     * Class handling transport logic for communication with devices.
     *
     * @property baseUrl Base URL of the device.
     */
    inner class EspLocalTransport(private val baseUrl: String) : Transport {

        private val workerThreadPool = Executors.newSingleThreadExecutor()
        private val cookieManager = CookieManager()

        /**
         * Sends configuration data to the device.
         *
         * @param path Endpoint path.
         * @param data Data to send.
         * @param listener Listener to handle the response.
         */
        override fun sendConfigData(path: String, data: ByteArray, listener: ResponseListener) {
            workerThreadPool.submit {
                try {
                    val returnData = sendPostRequest(path, data)
                    if (returnData == null) {
                        listener.onFailure(RuntimeException("Response not received."))
                    } else {
                        listener.onSuccess(returnData)
                    }
                } catch (e: Exception) {
                    listener.onFailure(e)
                }
            }
        }

        /**
         * Sends an HTTP POST request to the device.
         *
         * @param path Endpoint path.
         * @param data Data to send.
         * @return Response from the device.
         */
        private fun sendPostRequest(path: String, data: ByteArray): ByteArray? {
            val normalizedPath = if (path.startsWith("http")) URL(path).path else path
            val url = URL("$baseUrl/${normalizedPath.removePrefix("/")}")

            val urlConnection = url.openConnection() as HttpURLConnection
            urlConnection.doOutput = true
            urlConnection.requestMethod = "POST"
            urlConnection.setRequestProperty("Accept", "text/plain")
            urlConnection.setRequestProperty("Content-type", "application/x-www-form-urlencoded")
            urlConnection.connectTimeout = 5000
            urlConnection.readTimeout = 5000

            if (cookieManager.cookieStore.cookies.isNotEmpty()) {
                urlConnection.setRequestProperty(
                    "Cookie",
                    TextUtils.join(";", cookieManager.cookieStore.cookies)
                )
            }

            urlConnection.outputStream.use {
                it.write(data)
            }

            val responseCode = urlConnection.responseCode
            val cookiesHeader = urlConnection.headerFields["Set-Cookie"]

            cookiesHeader?.forEach { cookie ->
                val httpCookie = HttpCookie.parse(cookie)[0]
                httpCookie.version = 0
                cookieManager.cookieStore.add(null, httpCookie)
            }

            return if (responseCode == HttpURLConnection.HTTP_OK) {
                urlConnection.inputStream.use { it.readBytes() }
            } else {
                null
            }
        }
    }

    /**
     * Checks if a device with the given `nodeId` is connected.
     *
     * "Connected" means THIS node's own session is established — not merely that
     * the node connected at some point in the past. Answering from map membership
     * alone made the JS layer skip connect() while the actual session belonged to
     * a different node, sending commands to the wrong device.
     *
     * @param nodeId The unique identifier of the device.
     * @param promise Promise to resolve with the connection status.
     */
    @ReactMethod
    fun isConnected(nodeId: String, promise: Promise) {
        val isConnected = localDeviceMap[nodeId]?.session?.isEstablished() == true
        promise.resolve(isConnected)
    }

    /**
     * Drops the cached per-node connection state (credentials AND session) so the
     * next `connect()` / `sendData()` performs a fresh handshake with current
     * credentials.
     *
     * Call this when the node's local-control details may have changed — e.g.
     * after a factory-reset + re-provision (new PoP), a new DHCP IP, or when the
     * node drops off mDNS. The node's session lives on its map entry, so evicting
     * it never affects any other node's active session.
     */
    @ReactMethod
    fun disconnect(nodeId: String) {
        Log.d(TAG, "disconnect: evicting cached local-control state for $nodeId")
        localDeviceMap.remove(nodeId)
    }

    /**
     * Reads the protocomm endpoints from the optional `options` map JS passes to
     * [connect]. A missing map (or missing keys) keeps the legacy
     * `esp_local_ctrl` paths, so callers that predate multi-protocol support
     * behave exactly as before.
     */
    private fun endpointsFrom(options: ReadableMap?): LocalCtrlEndpoints {
        if (options == null) return LocalCtrlEndpoints()
        fun read(key: String, fallback: String): String {
            val value = if (options.hasKey(key)) options.getString(key) else null
            return if (value.isNullOrBlank()) fallback else value
        }
        return LocalCtrlEndpoints(
            sessionPath = read(OPTION_SESSION_PATH, LOCAL_SESSION_ENDPOINT),
            versionPath = read(OPTION_VERSION_PATH, LOCAL_VERSION_ENDPOINT),
            versionKey = read(OPTION_VERSION_KEY, LOCAL_VERSION_KEY)
        )
    }

    /**
     * Connects to an ESP device using the given parameters.
     *
     * @param nodeId Unique identifier of the device.
     * @param baseUrl Base URL of the device.
     * @param securityType Type of security (0, 1, or 2).
     * @param pop Proof of possession for security levels that require it.
     * @param username Optional username for Security 2.
     * @param options Optional protocomm endpoints (`sessionPath`, `versionPath`,
     *   `versionKey`) selecting the local-control protocol. Defaults to the
     *   legacy `esp_local_ctrl` endpoints when omitted.
     * @param promise Promise to resolve with connection status or reject on failure.
     */
    @ReactMethod
    fun connect(
        nodeId: String,
        baseUrl: String,
        securityType: Int,
        pop: String?,
        username: String?,
        options: ReadableMap?,
        promise: Promise
    ) {

        val endpoints = endpointsFrom(options)

        val address: String
        val port: Int
        try {
            val url = baseUrl.removePrefix("http://")
            val urlParts = url.split(":")
            address = urlParts[0]
            port = urlParts[1].toInt()
        } catch (e: Exception) {
            promise.reject("INVALID_BASE_URL", "Failed to parse base URL: $baseUrl. Error: ${e.message}")
            return
        }

        val device =
            EspLocalDevice(nodeId, address, port, baseUrl, securityType, pop, username, endpoints)

        initSession(device, object : ResponseListener {
            override fun onSuccess(returnData: ByteArray?) {
                localDeviceMap[nodeId] = device
                val result = WritableNativeMap().apply {
                    putString("status", "success")
                }
                promise.resolve(result)
            }

            override fun onFailure(e: Exception) {
                promise.reject("SESSION_ESTABLISHMENT_FAILED", "Failed to establish session for nodeId: $nodeId. Error: ${e.message}")
            }
        })
    }

    /**
     * Initializes a secure session with [device], using the credentials and base
     * URL captured on it. For Security2, first probes the device's version
     * endpoint so the right `sec_patch_ver` is fed into the Security2 constructor
     * (required against ESP-IDF v5.4+ firmware).
     */
    private fun initSession(
        device: EspLocalDevice,
        listener: ResponseListener
    ) {
        if (device.securityType == 2) {
            fetchSecPatchVersion(device.baseUrl, device.endpoints) { secPatchVersion ->
                establishSession(device, secPatchVersion, listener)
            }
        } else {
            establishSession(device, 0, listener)
        }
    }

    private fun fetchSecPatchVersion(
        baseUrl: String,
        endpoints: LocalCtrlEndpoints,
        onResult: (Int) -> Unit
    ) {
        val versionTransport = EspLocalTransport(baseUrl)
        versionTransport.sendConfigData(
            endpoints.versionPath,
            "---".toByteArray(),
            object : ResponseListener {
                override fun onSuccess(returnData: ByteArray?) {
                    val version = parseSecPatchVersion(returnData, endpoints.versionKey)
                    Log.d(TAG, "Device at $baseUrl advertises sec_patch_ver=$version")
                    onResult(version)
                }

                override fun onFailure(e: Exception) {
                    Log.w(TAG, "Version endpoint unavailable at $baseUrl, using sec_patch_ver=0: ${e.message}")
                    onResult(0)
                }
            }
        )
    }

    private fun parseSecPatchVersion(returnData: ByteArray?, versionKey: String): Int {
        if (returnData == null) return 0
        return try {
            val root = org.json.JSONObject(String(returnData))
            val localCtrl = root.optJSONObject(versionKey)
            localCtrl?.optInt("sec_patch_ver", 0) ?: 0
        } catch (e: Exception) {
            Log.w(TAG, "Could not parse version JSON, using sec_patch_ver=0: ${e.message}")
            0
        }
    }

    private fun establishSession(
        device: EspLocalDevice,
        secPatchVersion: Int,
        listener: ResponseListener
    ) {
        val security: Security = when (device.securityType) {
            2 -> Security2(device.username, device.pop, secPatchVersion).also {
                Log.d(
                    TAG,
                    "Created security 2 for ${device.nodeId} with username: ${device.username}, patchVersion: $secPatchVersion"
                )
            }

            1 -> Security1(device.pop).also {
                Log.d(TAG, "Created security 1 for ${device.nodeId}")
            }

            0 -> Security0()
            else -> {
                Log.e(TAG, "Invalid security type: ${device.securityType}. Defaulting to Security0.")
                Security0()
            }
        }

        // The session is bound to this node's own transport and stored on the
        // node's entry — never on the module — so it cannot be reused for a
        // different nodeId.
        val transport = EspLocalTransport(device.baseUrl)
        val session = EspLocalSession(transport, security, device.endpoints.sessionPath)
        device.session = session

        session.init(null, object : SessionListener {
            override fun onSessionEstablished() {
                listener.onSuccess(null)
            }

            override fun onSessionEstablishFailed(e: Exception) {
                listener.onFailure(e)
            }
        })
    }

    /**
     * Sends data to a specific endpoint on the connected device.
     *
     * @param nodeId Unique identifier of the device.
     * @param endPoint API endpoint path to send the data.
     * @param data Base64-encoded data to send.
     * @param promise Promise to resolve with the response or reject on failure.
     */
    @ReactMethod
    @RequiresApi(Build.VERSION_CODES.O)
    fun sendData(nodeId: String, endPoint: String, data: String, promise: Promise) {
        val device = localDeviceMap[nodeId]

        if (device == null) {
            promise.reject("DEVICE_NOT_FOUND", "Device with nodeId $nodeId not found")
            return
        }

        // Pass only the endpoint path: the destination host always comes from the
        // session's own transport (built from device.baseUrl), so the log below
        // reports the host the data is actually sent to.
        val path = endPoint.removePrefix("/")
        Log.d(TAG, "sendData: nodeId=$nodeId target=${device.baseUrl}/$path")

        val decodedData: ByteArray = try {
            Base64.getDecoder().decode(data)
        } catch (e: IllegalArgumentException) {
            promise.reject("INVALID_DATA", "Data is not Base64 encoded or invalid")
            return
        }

        val session = device.session
        if (session == null || !session.isEstablished()) {
            // Re-handshake with the per-node credentials captured at connect().
            Log.d(TAG, "sendData: no established session for $nodeId, re-handshaking with ${device.baseUrl}")
            initSession(
                device,
                object : ResponseListener {
                    override fun onSuccess(returnData: ByteArray?) {
                        sendDataToDevice(device, path, decodedData, promise)
                    }

                    override fun onFailure(e: Exception) {
                        // Re-handshake failed (e.g. stale PoP/IP after re-provision):
                        // evict the cached entry so the next sendData() re-runs
                        // connect() with current credentials instead of looping on
                        // the stale ones. The param write still falls back to MQTT.
                        localDeviceMap.remove(nodeId)
                        promise.reject(
                            "SESSION_NOT_INITIALIZED",
                            "Failed to initialize session. Error: ${e.message}"
                        )
                    }
                }
            )
        } else {
            sendDataToDevice(device, path, decodedData, promise)
        }
    }

    /**
     * Sends data to the device via its own established session.
     *
     * @param device Per-node connection state whose session and transport are used
     *   (the entry is evicted from [localDeviceMap] on failure).
     * @param path Endpoint path; the session's transport prepends the node's base URL.
     * @param data Data to send.
     * @param promise Promise to resolve with the device's response.
     */
    private fun sendDataToDevice(device: EspLocalDevice, path: String, data: ByteArray, promise: Promise) {
        val session = device.session
        if (session == null) {
            promise.reject("SESSION_NOT_INITIALIZED", "No session for nodeId ${device.nodeId}")
            return
        }
        session.sendDataToDevice(path, data, object : ResponseListener {
            @RequiresApi(Build.VERSION_CODES.O)
            override fun onSuccess(returnData: ByteArray?) {
                val encodedResponse = returnData?.let { Base64.getEncoder().encodeToString(it) } ?: ""
                promise.resolve(encodedResponse)
            }

            override fun onFailure(e: Exception?) {
                // Send failed on a previously-good session (socket died / device
                // rebooted): evict so the next call forces a fresh connect().
                Log.w(TAG, "sendData failed for ${device.nodeId} (${device.baseUrl}): ${e?.message}")
                localDeviceMap.remove(device.nodeId)
                promise.reject("SEND_DATA_FAILED", e?.message ?: "Failed to send data")
            }
        })
    }

}