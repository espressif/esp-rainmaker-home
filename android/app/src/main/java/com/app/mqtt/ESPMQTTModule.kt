package com.app.mqtt

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.amazonaws.auth.*
import com.amazonaws.mobileconnectors.iot.*
import com.amazonaws.regions.Region
import com.amazonaws.regions.Regions
import com.amazonaws.util.StringUtils
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * React Native bridge module for AWS IoT MQTT using temporary session credentials.
 * Exposes connect, publish, subscribe, and emits `mqttMessageReceived` plus
 * `mqttConnectionStatus` (`{ connected: boolean }`) to JavaScript.
 */
class ESPMQTTModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val tag = "ESPMQTTModule"

    /** Writes a debug log line tagged for this module. */
    private fun log(msg: String) {
        Log.d(tag, "[MQTT] $msg")
    }

    /** Writes an error log line; optionally includes a stack trace. */
    private fun logE(msg: String, e: Throwable? = null) {
        Log.e(tag, "[MQTT] $msg", e)
    }

    /** Guards the fields below: React calls, AWS callbacks and timers run on different threads. */
    private val lock = Any()
    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * A few shared threads for closing clients, whose disconnect can block on a dead
     * socket: one stuck close never holds up the others. Idle threads end after 30 s.
     */
    private val closeExecutor = ThreadPoolExecutor(
        CLOSE_THREADS,
        CLOSE_THREADS,
        30L,
        TimeUnit.SECONDS,
        LinkedBlockingQueue()
    ) { task ->
        Thread(task, "ESPMQTT-close").apply { isDaemon = true }
    }.apply { allowCoreThreadTimeOut(true) }

    /** The client in use. Callbacks from a client that was replaced or closed are ignored. */
    private var mqttManager: AWSIotMqttManager? = null

    /** Lifecycle of the MQTT client from the module's perspective. */
    private enum class State {
        DISCONNECTED,
        CONNECTING,
        CONNECTED
    }

    private var state = State.DISCONNECTED

    /** The connect() call still waiting for its outcome, if any. */
    private var pendingConnect: ConnectAttempt? = null

    /** Last `connected` value emitted on `mqttConnectionStatus` (dedupe). */
    private var lastEmittedConnected: Boolean? = null

    /**
     * One connect() call plus any callers that joined it. Its promises are answered
     * exactly once, by the first outcome: connected, failed, timed out or cancelled.
     */
    private class ConnectAttempt(firstCaller: Promise) {
        private val callers = mutableListOf(firstCaller)
        private var answered = false

        /** Gives up on the attempt if it has not answered by then. */
        var timeout: Runnable? = null

        /** Adds a caller; false when the attempt has already answered. */
        @Synchronized
        fun join(promise: Promise): Boolean {
            if (answered) return false
            callers.add(promise)
            return true
        }

        /** Returns the callers the first time only; later calls get none. */
        @Synchronized
        private fun takeCallers(): List<Promise> {
            if (answered) return emptyList()
            answered = true
            return callers.toList().also { callers.clear() }
        }

        fun succeed() = takeCallers().forEach { it.resolve(null) }

        fun fail(code: String, message: String, cause: Throwable?) =
            takeCallers().forEach { it.reject(code, message, cause) }
    }

    /** Module name exposed to React Native (`NativeModules.ESPMQTTModule`). */
    override fun getName(): String = "ESPMQTTModule"

    /**
     * No-op required by [NativeEventEmitter] on RN 0.65+.
     *
     * @param eventName Subscribed event name from JS (unused).
     */
    @ReactMethod
    fun addListener(eventName: String) {}

    /**
     * No-op required by [NativeEventEmitter] on RN 0.65+ when listeners are removed.
     *
     * @param count Number of listeners removed (unused).
     */
    @ReactMethod
    fun removeListeners(count: Int) {}

    /**
     * Connects to AWS IoT Core MQTT using keys from [config].
     *
     * Expected keys: `accessKeyId`, `secretAccessKey`, `sessionToken`, `endpoint`;
     * optional `clientId` (defaults to a random `android-` prefix);
     * optional `region` (e.g. `us-east-1`) if the endpoint host does not follow `*.iot.<region>.*`.
     * Resolves at once if already connected; if a connect is already running, waits for that one.
     * Otherwise answers exactly once: resolves when connected, rejects when the attempt fails,
     * gives no answer within [CONNECT_TIMEOUT_MS], or is cancelled by [disconnect].
     *
     * @param config Credential and endpoint map from JavaScript.
     * @param promise Resolved with null on success, or rejected with `invalid_args` /
     * `connection_failed` / `connection_timeout` / `disconnected`.
     */
    @ReactMethod
    fun connect(config: ReadableMap, promise: Promise) {

        synchronized(lock) {
            if (state == State.CONNECTED) {
                promise.resolve(null)
                return
            }
            if (pendingConnect?.join(promise) == true) {
                log("Connect already in progress; waiting for it")
                return
            }
        }

        val accessKeyId = config.getString("accessKeyId")
        val secretAccessKey = config.getString("secretAccessKey")
        val sessionToken = config.getString("sessionToken")
        val endpointRaw = config.getString("endpoint")

        if (accessKeyId.isNullOrEmpty() ||
            secretAccessKey.isNullOrEmpty() ||
            sessionToken.isNullOrEmpty() ||
            endpointRaw.isNullOrEmpty()
        ) {
            logE("Missing credentials")
            promise.reject("invalid_args", "Missing credentials")
            return
        }

        val rawEndpoint = endpointRaw
        val normalizedEndpoint = rawEndpoint.trim()
            .replace(Regex("^https?://"), "")
            .replace(Regex("^wss?://"), "")
            .replace(Regex("/mqtt/?$"), "")

        val endpointHost = normalizedEndpoint.split("/").first().trim()
        log("Endpoint: $endpointHost")

        val regionOverride = config.getString("region")?.trim()?.takeIf { it.isNotEmpty() }
        val regionId = regionOverride ?: parseRegionIdFromIotHost(endpointHost)
        if (regionId.isNullOrEmpty()) {
            logE("Could not resolve AWS region from endpoint or config.region")
            promise.reject(
                "invalid_args",
                "Could not determine AWS region: pass config.region (e.g. us-east-1) or use a standard IoT endpoint host (*.iot.<region>.amazonaws.com)."
            )
            return
        }
        try {
            Regions.fromName(regionId)
        } catch (e: IllegalArgumentException) {
            logE("Unknown AWS region: $regionId", e)
            promise.reject(
                "invalid_args",
                "Unknown AWS region '$regionId'. Pass a supported region in config.region, or update aws-android-sdk-iot.",
                e
            )
            return
        }
        log("Resolved AWS region for MQTT: $regionId")

        val clientId = config.getString("clientId")?.takeIf { it.isNotEmpty() }
            ?: "android-" + UUID.randomUUID()

        val attempt = ConnectAttempt(promise)
        synchronized(lock) {
            pendingConnect = attempt
            state = State.CONNECTING
        }
        val timeout = Runnable { onConnectTimedOut(attempt) }
        attempt.timeout = timeout
        mainHandler.postDelayed(timeout, CONNECT_TIMEOUT_MS)

        releaseAndReconnect {
            startConnect(
                endpointHost,
                clientId,
                accessKeyId,
                secretAccessKey,
                sessionToken,
                regionId,
                attempt
            )
        }
    }

    companion object {
        /**
         * Longest a connect() may take before it is given up and rejected. A working
         * connect takes 1-3 s; without this cap a connect the AWS SDK never answers
         * would leave the JS promise waiting forever.
         */
        private const val CONNECT_TIMEOUT_MS = 15_000L

        /** Threads for closing old clients; see closeExecutor. */
        private const val CLOSE_THREADS = 4

        /** A close slower than this is logged: its disconnect was stuck on a dead socket. */
        private const val SLOW_CLOSE_MS = 5_000L

        /** Region segment from IoT Core-style hostnames (no hardcoded region list). */
        private fun parseRegionIdFromIotHost(host: String): String? {
            val parts = host.split('.')
            for (i in parts.indices) {
                when {
                    parts[i] == "iot" && i + 1 < parts.size -> return parts[i + 1]
                    parts[i].startsWith("iot-") && parts[i] != "iot" && i + 1 < parts.size ->
                        return parts[i + 1]
                }
            }
            return null
        }
    }

    /**
     * Closes any existing client, waits a short moment, then runs [onDone].
     * Used before starting a new connection so the previous manager is fully torn down.
     */
    private fun releaseAndReconnect(onDone: () -> Unit) {
        val existing = synchronized(lock) {
            val current = mqttManager
            mqttManager = null
            lastEmittedConnected = false
            current
        }

        if (existing == null) {
            onDone()
            return
        }

        closeClient(existing)
        mainHandler.postDelayed({ onDone() }, 1000)
    }

    /**
     * Closes [manager] off the React thread, because its disconnect can block on a dead
     * socket. It is already detached, so its own status callbacks are ignored.
     */
    private fun closeClient(manager: AWSIotMqttManager) {
        closeExecutor.execute {
            val startedAt = System.currentTimeMillis()
            try {
                manager.disconnect()
            } catch (e: Exception) {
                logE("Disconnect error", e)
            }
            val tookMs = System.currentTimeMillis() - startedAt
            if (tookMs > SLOW_CLOSE_MS) logE("Closing an old client took $tookMs ms")
        }
    }

    /** True when [manager] is the client in use, not one that was replaced or closed. */
    private fun isCurrentClient(manager: AWSIotMqttManager): Boolean =
        synchronized(lock) { mqttManager === manager }

    /** Answers [attempt] with success and stops its timer. */
    private fun answerConnected(attempt: ConnectAttempt) {
        synchronized(lock) {
            if (pendingConnect === attempt) pendingConnect = null
        }
        attempt.timeout?.let { mainHandler.removeCallbacks(it) }
        attempt.succeed()
    }

    /** Answers [attempt] with a failure and stops its timer. A no-op once it has answered. */
    private fun answerFailed(
        attempt: ConnectAttempt,
        code: String,
        message: String,
        cause: Throwable?
    ) {
        synchronized(lock) {
            if (pendingConnect === attempt) pendingConnect = null
        }
        attempt.timeout?.let { mainHandler.removeCallbacks(it) }
        attempt.fail(code, message, cause)
    }

    /** Gives up on [attempt] when the AWS SDK never reported an outcome for it. */
    private fun onConnectTimedOut(attempt: ConnectAttempt) {
        val stuckClient = synchronized(lock) {
            if (pendingConnect !== attempt) return
            pendingConnect = null
            state = State.DISCONNECTED
            val current = mqttManager
            mqttManager = null
            current
        }
        logE("Connect gave no answer within ${CONNECT_TIMEOUT_MS / 1000} s; giving up on it")
        stuckClient?.let { closeClient(it) }
        attempt.fail(
            "connection_timeout",
            "MQTT connect gave no answer within ${CONNECT_TIMEOUT_MS / 1000} s",
            null
        )
    }

    /**
     * Emits `mqttConnectionStatus` to JS when [connected] differs from the
     * last emitted value.
     */
    private fun emitConnectionStatus(connected: Boolean) {
        synchronized(lock) {
            if (lastEmittedConnected == connected) {
                return
            }
            lastEmittedConnected = connected
        }
        val payload = Arguments.createMap()
        payload.putBoolean("connected", connected)
        emitEvent("mqttConnectionStatus", payload)
    }

    /**
     * Creates [AWSIotMqttManager] via the region-aware factory (required for custom Neo
     * hosts that do not embed `*.iot.<region>.*`), connects with static session credentials,
     * and answers [attempt] from the AWS status callback: Connected resolves it, a
     * ConnectionLost before Connected (how the SDK reports a failed connect) rejects it.
     *
     * @param endpoint MQTT broker host (no scheme / `/mqtt` suffix).
     * @param clientId AWS IoT MQTT client id.
     * @param accessKey Temporary access key id.
     * @param secretKey Temporary secret access key.
     * @param sessionToken Temporary session token.
     * @param regionId AWS region id (e.g. `us-east-1`) used for SigV4 on custom domains.
     * @param attempt The connect() call this answers.
     */
    private fun startConnect(
        endpoint: String,
        clientId: String,
        accessKey: String,
        secretKey: String,
        sessionToken: String,
        regionId: String,
        attempt: ConnectAttempt
    ) {
        synchronized(lock) {
            if (pendingConnect !== attempt) {
                log("Connect was cancelled before it started")
                return
            }
        }

        val manager: AWSIotMqttManager
        try {
            // Custom domains (e.g. mqtt.neo.rainmaker.espressif.com) have no region in the
            // hostname; AWSIotMqttManager(clientId, endpoint) would throw
            // "Cannot find AWS Region code within endpoint".
            manager = AWSIotMqttManager.from(
                Region.getRegion(Regions.fromName(regionId)),
                AWSIotMqttManager.ClientId.fromString(clientId),
                AWSIotMqttManager.Endpoint.fromString(endpoint)
            )
        } catch (e: Exception) {
            logE("Failed to create AWSIotMqttManager for endpoint=$endpoint region=$regionId", e)
            synchronized(lock) {
                if (pendingConnect === attempt) state = State.DISCONNECTED
            }
            answerFailed(attempt, "connection_failed", e.message ?: "MQTT client setup failed", e)
            return
        }

        // Auto-reconnect is disabled on purpose: this manager's credentials
        // provider below is a fixed, non-refreshable session token
        // (`refresh()` is a no-op), so once that token expires the SDK's
        // internal auto-reconnect loop can never actually succeed - it just
        // cycles Reconnecting/ConnectionLost forever with the same stale
        // creds, and a JS `connect()` with *fresh* credentials arriving
        // during that loop would only join it. Reconnection is instead
        // driven entirely from JS, which re-fetches valid credentials
        // before calling `connect()` again.
        // With auto-reconnect off the SDK reports a failed connect as
        // ConnectionLost (never a separate error status), so that is what
        // rejects the connect() promise in onStatusChanged.
        manager.setAutoReconnect(false)
        manager.keepAlive = 40

        synchronized(lock) {
            if (pendingConnect !== attempt) {
                log("Connect was cancelled before it started")
                return
            }
            mqttManager = manager
        }

        val credentialsProvider = object : AWSCredentialsProvider {
            override fun getCredentials(): AWSCredentials {
                return BasicSessionCredentials(accessKey, secretKey, sessionToken)
            }

            override fun refresh() {}
        }

        try {
            manager.connect(credentialsProvider) { status, throwable ->
                onStatusChanged(manager, attempt, status, throwable)
            }
        } catch (e: Exception) {
            logE("connect() threw", e)
            synchronized(lock) {
                if (mqttManager === manager) state = State.DISCONNECTED
            }
            answerFailed(attempt, "connection_failed", e.message ?: "MQTT connect failed", e)
        }
    }

    /**
     * Handles one AWS status callback for [manager]. Callbacks from a client that
     * was replaced or closed are ignored; a replaced client that still connects late
     * is closed again so it does not linger.
     */
    private fun onStatusChanged(
        manager: AWSIotMqttManager,
        attempt: ConnectAttempt,
        status: AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus,
        throwable: Throwable?
    ) {
        when (status) {

            AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus.Connected -> {
                // Same locked step as CONNECTED, so the connect timeout cannot fire in between.
                val isCurrent = synchronized(lock) {
                    val current = mqttManager === manager
                    if (current) {
                        state = State.CONNECTED
                        if (pendingConnect === attempt) pendingConnect = null
                    }
                    current
                }
                if (!isCurrent) {
                    log("A replaced client connected late; closing it")
                    closeClient(manager)
                    return
                }
                log("Connected")
                answerConnected(attempt)
                emitConnectionStatus(true)
            }

            AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus.Connecting,
            AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus.Reconnecting -> {
                synchronized(lock) {
                    if (mqttManager === manager) state = State.CONNECTING
                }
            }

            AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus.ConnectionLost -> {
                val isCurrent = synchronized(lock) {
                    val current = mqttManager === manager
                    if (current) {
                        state = State.DISCONNECTED
                        if (pendingConnect === attempt) pendingConnect = null
                    }
                    current
                }
                if (!isCurrent) {
                    return
                }
                log("Disconnected")
                if (throwable != null) logE("Connection lost", throwable)
                emitConnectionStatus(false)
                // Lost before it was ever up = this connect failed. After Connected
                // the attempt has already answered, so this does nothing.
                answerFailed(
                    attempt,
                    "connection_failed",
                    throwable?.message ?: "MQTT connection closed before it was up",
                    throwable
                )
            }

            else -> {
                if (isCurrentClient(manager)) logE("Unknown status: $status", throwable)
            }
        }
    }

    /**
     * Disconnects the MQTT client and clears local state. A connect() still waiting
     * is rejected with `disconnected`, so its caller never waits forever.
     *
     * @param promise Resolved with null.
     */
    @ReactMethod
    fun disconnect(promise: Promise) {
        val (manager, attempt) = synchronized(lock) {
            val current = mqttManager to pendingConnect
            mqttManager = null
            pendingConnect = null
            state = State.DISCONNECTED
            lastEmittedConnected = false
            current
        }

        if (attempt != null) {
            attempt.timeout?.let { mainHandler.removeCallbacks(it) }
            attempt.fail("disconnected", "MQTT disconnect() was called before the connection was up", null)
        }
        manager?.let { closeClient(it) }

        log("Disconnected")
        promise.resolve(null)
    }

    /** The client, only while it is connected. */
    private fun connectedClient(): AWSIotMqttManager? =
        synchronized(lock) { mqttManager.takeIf { state == State.CONNECTED } }

    /**
     * Returns whether the module considers the client connected ([State.CONNECTED]).
     *
     * @param promise Resolved with a boolean.
     */
    @ReactMethod
    fun isConnected(promise: Promise) {
        promise.resolve(connectedClient() != null)
    }

    /**
     * Publishes a UTF-8 string payload to [topic] at QoS 0.
     *
     * @param topic MQTT topic.
     * @param payload Message body as string (encoded UTF-8).
     * @param promise Resolved with null on success; rejected with `not_connected` or `error`.
     */
    @ReactMethod
    fun publish(topic: String, payload: String, promise: Promise) {
        val manager = connectedClient()

        if (manager == null) {
            promise.reject("not_connected", "MQTT not connected")
            return
        }

        try {
            manager.publishData(
                payload.toByteArray(StringUtils.UTF8),
                topic,
                AWSIotMqttQos.QOS0
            )
            promise.resolve(null)
        } catch (e: Exception) {
            logE("publish failed for topic: $topic", e)
            promise.reject("error", e.message)
        }
    }

    /**
     * Subscribes to [topic] at QoS 0. Incoming messages are sent to JS as `mqttMessageReceived`
     * with `topic`, `message`, and `timestamp`.
     *
     * [promise] must resolve only once the SDK confirms the subscription is active (hence the
     * [AWSIotMqttSubscriptionStatusCallback] overload), not when the call is merely queued: JS
     * callers publish their request as soon as `subscribe()` resolves, and a QoS 0 response that
     * arrives before the broker has registered us is dropped and never redelivered.
     *
     * @param topic MQTT topic filter.
     * @param promise Resolved with null once the subscription is confirmed; rejected with
     * `not_connected` or `error`.
     */
    @ReactMethod
    fun subscribe(topic: String, promise: Promise) {
        val manager = connectedClient()

        if (manager == null) {
            promise.reject("not_connected", "MQTT not connected")
            return
        }

        try {
            manager.subscribeToTopic(
                topic,
                AWSIotMqttQos.QOS0,
                object : AWSIotMqttSubscriptionStatusCallback {
                    override fun onSuccess() {
                        promise.resolve(null)
                    }

                    override fun onFailure(e: Throwable) {
                        logE("subscribe failed for topic: $topic", e)
                        promise.reject("error", e.message)
                    }
                }
            ) { receivedTopic, data ->

                log("Message received topic=$receivedTopic payload=${String(data)}")

                val event = Arguments.createMap().apply {
                    putString("topic", receivedTopic)
                    putString("message", String(data))
                    putDouble("timestamp", System.currentTimeMillis().toDouble())
                }

                emitEvent("mqttMessageReceived", event)
            }

        } catch (e: Exception) {
            logE("subscribe failed for topic: $topic", e)
            promise.reject("error", e.message)
        }
    }

    /**
     * Unsubscribes from [topic] on the active client.
     *
     * @param topic MQTT topic to unsubscribe.
     * @param promise Resolved with null on success; rejected with `not_connected` or `error`.
     */
    @ReactMethod
    fun unsubscribe(topic: String, promise: Promise) {
        val manager = connectedClient()

        if (manager == null) {
            promise.reject("not_connected", "MQTT not connected")
            return
        }

        try {
            manager.unsubscribeTopic(topic)
            promise.resolve(null)
        } catch (e: Exception) {
            logE("unsubscribe failed for topic: $topic", e)
            promise.reject("error", e.message)
        }
    }

    /**
     * Emits a device event to the React Native JS runtime.
     *
     * @param name Event name listened to from JS.
     * @param data Payload map.
     */
    private fun emitEvent(name: String, data: WritableMap) {
        // Called from AWS SDK threads; a JS reload in between must not crash the app.
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, data)
        } catch (e: Exception) {
            logE("Could not send $name to JS", e)
        }
    }
}