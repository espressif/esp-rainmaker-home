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

    private var mqttManager: AWSIotMqttManager? = null

    /** Lifecycle of the MQTT client from the module's perspective. */
    private enum class State {
        DISCONNECTED,
        CONNECTING,
        CONNECTED
    }

    private var state = State.DISCONNECTED

    /**
     * When true, status callbacks from intentional teardown (`disconnect` /
     * `releaseAndReconnect`) are not emitted to JS — only unexpected drops
     * and successful connects should notify the app.
     */
    private var suppressConnectionStatusEvents = false

    /** Last `connected` value emitted on `mqttConnectionStatus` (dedupe). */
    private var lastEmittedConnected: Boolean? = null

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
     * Resolves immediately if already connecting or connected; otherwise resolves on first
     * successful connection or rejects on invalid args / connection failure.
     *
     * @param config Credential and endpoint map from JavaScript.
     * @param promise Resolved with null on success, or rejected with `invalid_args` / `connection_failed`.
     */
    @ReactMethod
    fun connect(config: ReadableMap, promise: Promise) {

        if (state == State.CONNECTING || state == State.CONNECTED) {
            promise.resolve(null)
            return
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

        state = State.CONNECTING

        releaseAndReconnect {
            startConnect(
                endpointHost,
                clientId,
                accessKeyId,
                secretAccessKey,
                sessionToken,
                regionId,
                promise
            )
        }
    }

    companion object {
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
     * Disconnects any existing client, clears state after a short delay, then runs [onDone].
     * Used before starting a new connection so the previous manager is fully torn down.
     */
    private fun releaseAndReconnect(onDone: () -> Unit) {
        val existing = mqttManager

        if (existing == null) {
            onDone()
            return
        }

        suppressConnectionStatusEvents = true
        try {
            existing.disconnect()
        } catch (e: Exception) {
            logE("Disconnect error", e)
        }

        Handler(Looper.getMainLooper()).postDelayed({

            mqttManager = null
            state = State.DISCONNECTED
            lastEmittedConnected = false
            suppressConnectionStatusEvents = false

            onDone()
        }, 1000)
    }

    /**
     * Emits `mqttConnectionStatus` to JS when [connected] differs from the
     * last emitted value and intentional teardown is not in progress.
     */
    private fun emitConnectionStatus(connected: Boolean) {
        if (suppressConnectionStatusEvents) {
            return
        }
        if (lastEmittedConnected == connected) {
            return
        }
        lastEmittedConnected = connected
        val payload = Arguments.createMap()
        payload.putBoolean("connected", connected)
        emitEvent("mqttConnectionStatus", payload)
    }

    /**
     * Creates [AWSIotMqttManager] via the region-aware factory (required for custom Neo
     * hosts that do not embed `*.iot.<region>.*`), connects with static session credentials,
     * and drives [promise] from the AWS status callback (resolve on first Connected; reject
     * on invalid args / fatal error with throwable).
     *
     * @param endpoint MQTT broker host (no scheme / `/mqtt` suffix).
     * @param clientId AWS IoT MQTT client id.
     * @param accessKey Temporary access key id.
     * @param secretKey Temporary secret access key.
     * @param sessionToken Temporary session token.
     * @param regionId AWS region id (e.g. `us-east-1`) used for SigV4 on custom domains.
     * @param promise Resolved with null on success, or rejected with `connection_failed`.
     */
    private fun startConnect(
        endpoint: String,
        clientId: String,
        accessKey: String,
        secretKey: String,
        sessionToken: String,
        regionId: String,
        promise: Promise
    ) {
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
            state = State.DISCONNECTED
            promise.reject("connection_failed", e)
            return
        }

        // Auto-reconnect is disabled on purpose: this manager's credentials
        // provider below is a fixed, non-refreshable session token
        // (`refresh()` is a no-op), so once that token expires the SDK's
        // internal auto-reconnect loop can never actually succeed - it just
        // cycles Reconnecting/ConnectionLost forever with the same stale
        // creds. Worse, those status transitions write to the shared `state`
        // field below, racing with an explicit `connect()` call made from JS
        // with *fresh* credentials (see `ensureRmneoMqttConnected` on the JS
        // side): if that call lands while this loop's status happens to be
        // `Reconnecting`, the `state == CONNECTING` guard above short-circuits
        // it, silently discarding the new credentials. Reconnection is
        // instead driven entirely from JS, which re-fetches valid credentials
        // before calling `connect()` again.
        manager.setAutoReconnect(false)
        manager.keepAlive = 40

        mqttManager = manager

        var isPromiseHandled = false

        val credentialsProvider = object : AWSCredentialsProvider {
            override fun getCredentials(): AWSCredentials {
                return BasicSessionCredentials(accessKey, secretKey, sessionToken)
            }

            override fun refresh() {}
        }

        suppressConnectionStatusEvents = false

        manager.connect(credentialsProvider) { status, throwable ->

            when (status) {

                AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus.Connected -> {
                    state = State.CONNECTED
                    log("Connected")
                    emitConnectionStatus(true)

                    if (!isPromiseHandled) {
                        isPromiseHandled = true
                        promise.resolve(null)
                    }
                }

                AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus.Connecting -> {
                    state = State.CONNECTING
                }

                AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus.Reconnecting -> {
                    state = State.CONNECTING
                }

                AWSIotMqttClientStatusCallback.AWSIotMqttClientStatus.ConnectionLost -> {
                    state = State.DISCONNECTED
                    log("Disconnected")
                    if (throwable != null) logE("Connection lost", throwable)
                    emitConnectionStatus(false)
                }

                else -> {
                    logE("Unknown status: $status", throwable)

                    if (!isPromiseHandled && throwable != null) {
                        isPromiseHandled = true
                        state = State.DISCONNECTED
                        promise.reject("connection_failed", throwable)
                    }
                }
            }
        }
    }

    /**
     * Disconnects the MQTT client and clears local state.
     *
     * @param promise Resolved with null on success, or rejected with `error` if disconnect throws.
     */
    @ReactMethod
    fun disconnect(promise: Promise) {

        try {
            suppressConnectionStatusEvents = true
            mqttManager?.disconnect()
            mqttManager = null
            state = State.DISCONNECTED
            lastEmittedConnected = false

            log("Disconnected")

            promise.resolve(null)
        } catch (e: Exception) {
            logE("disconnect() failed", e)
            promise.reject("error", e.message)
        } finally {
            suppressConnectionStatusEvents = false
        }
    }

    /**
     * Returns whether the module considers the client connected ([State.CONNECTED]).
     *
     * @param promise Resolved with a boolean.
     */
    @ReactMethod
    fun isConnected(promise: Promise) {
        promise.resolve(state == State.CONNECTED)
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
        val manager = mqttManager

        if (state != State.CONNECTED || manager == null) {
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
        val manager = mqttManager

        if (state != State.CONNECTED || manager == null) {
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
        val manager = mqttManager

        if (state != State.CONNECTED || manager == null) {
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
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, data)
    }
}