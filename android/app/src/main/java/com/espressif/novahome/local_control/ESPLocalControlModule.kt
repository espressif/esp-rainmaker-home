/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.local_control

import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import com.espressif.provisioning.listeners.ResponseListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import java.util.Base64
import com.facebook.react.bridge.ReactMethod
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
        const val LOCAL_SESSION_ENDPOINT: String = "esp_local_ctrl/session"
    }

    private val localDeviceMap: HashMap<String, EspLocalDevice> = HashMap()
    private var sessionState: SessionState = SessionState.NOT_CREATED
    private var session: EspLocalSession? = null
    private var securityType: Int = 0 // Default security, which will be set during connect
    private var baseUrl: String = "" // Base URL will be set during connect

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
     * Enum representing the states of a session.
     */
    enum class SessionState {
        NOT_CREATED, // Session not created
        CREATING, // Session is being created
        CREATED, // Session successfully created
        FAILED // Session creation failed
    }

    /**
     * Interface for session events.
     */
    interface SessionListener {
        fun onSessionEstablished()
        fun onSessionEstablishFailed(e: Exception)
    }

    /**
     * Class representing a local ESP device.
     *
     * @property nodeId Unique identifier of the device.
     * @property ipAddr IP address of the device.
     * @property port Port number of the device.
     */
    inner class EspLocalDevice(val nodeId: String, val ipAddr: String, val port: Int)

    /**
     * Class managing session logic for secure communication with devices.
     *
     * @property transport Transport mechanism used for communication.
     * @property security Security layer for encrypting/decrypting data.
     */
    inner class EspLocalSession(private val transport: EspLocalTransport, private val security: Security) {

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
                        LOCAL_SESSION_ENDPOINT,
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
            val encryptedData = security.encrypt(data)
            if (isSessionEstablished) {
                transport.sendConfigData(path, encryptedData, object : ResponseListener {
                    override fun onSuccess(returnData: ByteArray?) {
                        val decryptedData = security.decrypt(returnData)
                        listener.onSuccess(decryptedData)
                    }

                    override fun onFailure(e: Exception) {
                        isSessionEstablished = false
                        listener.onFailure(e)
                    }
                })
            } else {
                init(null, object : SessionListener {
                    override fun onSessionEstablished() {
                        transport.sendConfigData(path, encryptedData, object : ResponseListener {
                            override fun onSuccess(returnData: ByteArray?) {
                                listener.onSuccess(returnData)
                            }

                            override fun onFailure(e: Exception) {
                                isSessionEstablished = false
                                listener.onFailure(e)
                            }
                        })
                    }

                    override fun onSessionEstablishFailed(e: Exception) {
                        listener.onFailure(e)
                    }
                })
            }
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
     * @param nodeId The unique identifier of the device.
     * @param promise Promise to resolve with the connection status.
     */
    @ReactMethod
    fun isConnected(nodeId: String, promise: Promise) {
        val isConnected = localDeviceMap.containsKey(nodeId)
        promise.resolve(isConnected)
    }

    /**
     * Connects to an ESP device using the given parameters.
     *
     * @param nodeId Unique identifier of the device.
     * @param baseUrl Base URL of the device.
     * @param securityType Type of security (0, 1, or 2).
     * @param pop Proof of possession for security levels that require it.
     * @param username Optional username for Security 2.
     * @param promise Promise to resolve with connection status or reject on failure.
     */
    @ReactMethod
    fun connect(
        nodeId: String,
        baseUrl: String,
        securityType: Int,
        pop: String?,
        username: String?,
        promise: Promise
    ) {

        this.securityType = securityType
        this.baseUrl = baseUrl

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

        val device = EspLocalDevice(nodeId, address, port)

        // Initialize session
        initSession(device, baseUrl, securityType, pop, username, object : ResponseListener {
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
     * Initializes a secure session with the specified ESP local device.
     * This method creates and establishes a session using the provided security configuration,
     * ensuring encrypted communication between the app and the device.
     *
     * @param device The ESP local device to connect to.
     * @param baseUrl The base URL of the device, including the IP address and port.
     * @param securityType The security type to use for the session (0: None, 1: Security1, 2: Security2).
     * @param pop Proof of possession for establishing secure connections (used in Security1 and Security2).
     * @param username The username for authentication (required for Security2).
     * @param listener Callback to notify success or failure of the session initialization.
     *
     * Flow:
     * 1. Depending on the security type, initializes the corresponding `Security` implementation.
     * 2. Creates a transport instance for communicating with the device.
     * 3. Starts the session establishment process via the `EspLocalSession` class.
     * 4. Notifies the result of session establishment using the provided listener.
     *
     * Notes:
     * - If a session is already being created, the method exits without reinitializing.
     * - This is a critical step for enabling further communication with the device.
     */

    private fun initSession(
        device: EspLocalDevice,
        baseUrl: String,
        securityType: Int,
        pop: String?,
        username: String?,
        listener: ResponseListener
    ) {
        if (sessionState != SessionState.CREATING) {
            sessionState = SessionState.CREATING

            val security: Security = when (securityType) {
                2 -> Security2(username, pop).also {
                    Log.d(TAG, "Created security 2 with pop: $pop")
                }

                1 -> Security1(pop).also {
                    Log.d(TAG, "Created security 1 with pop: $pop")
                }

                0 -> Security0()
                else -> {
                    Log.e(TAG, "Invalid security type: $securityType. Defaulting to Security0.")
                    Security0()
                }
            }

            val transport = EspLocalTransport(baseUrl)
            session = EspLocalSession(transport, security)

            session?.init(null, object : SessionListener {
                override fun onSessionEstablished() {
                    sessionState = SessionState.CREATED
                    listener.onSuccess(null)
                }

                override fun onSessionEstablishFailed(e: Exception) {
                    sessionState = SessionState.FAILED
                    listener.onFailure(e)
                }
            })
        }
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

        Log.d(TAG, "Base URL: $baseUrl")
        val normalizedEndPoint = endPoint.removePrefix("/")
        val finalUrl = "$baseUrl/$normalizedEndPoint"

        Log.d(TAG, "Final URL for sending data: $finalUrl")

        val decodedData: ByteArray = try {
            Base64.getDecoder().decode(data)
        } catch (e: IllegalArgumentException) {
            promise.reject("INVALID_DATA", "Data is not Base64 encoded or invalid")
            return
        }

        if (session == null || !session!!.isEstablished()) {
            val capturedSecurityType = this.securityType
            initSession(device, baseUrl, capturedSecurityType, "", "wifiprov", object : ResponseListener {
                override fun onSuccess(returnData: ByteArray?) {
                    sendDataToDevice(finalUrl, decodedData, promise)
                }

                override fun onFailure(e: Exception) {
                    promise.reject("SESSION_NOT_INITIALIZED", "Failed to initialize session. Error: ${e.message}")
                }
            })
        } else {
            sendDataToDevice(finalUrl, decodedData, promise)
        }
    }

    /**
     * Sends data to the device via the established session.
     *
     * @param finalUrl Fully constructed URL for the endpoint.
     * @param data Data to send.
     * @param promise Promise to resolve with the device's response.
     */
    private fun sendDataToDevice(finalUrl: String, data: ByteArray, promise: Promise) {
        session?.sendDataToDevice(finalUrl, data, object : ResponseListener {
            @RequiresApi(Build.VERSION_CODES.O)
            override fun onSuccess(returnData: ByteArray?) {
                val encodedResponse = returnData?.let { Base64.getEncoder().encodeToString(it) } ?: ""
                promise.resolve(encodedResponse)
            }

            override fun onFailure(e: Exception?) {
                promise.reject("SEND_DATA_FAILED", e?.message ?: "Failed to send data")
            }
        })
    }

}