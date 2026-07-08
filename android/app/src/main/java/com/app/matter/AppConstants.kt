/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.os.Bundle
import com.app.BuildConfig

/**
 * Constants for Matter operations
 */
object AppConstants {

    const val KEY_OPERATION = "operation"
    const val KEY_OPERATION_ADD = "add"
    const val KEY_CSR_TYPE = "csr_type"
    const val KEY_GROUP_ID = "group_id"
    const val KEY_GROUP_ID_CAMEL = "groupId"
    const val KEY_CSR = "csr"
    const val KEY_CSR_REQUESTS = "csr_requests"
    const val KEY_REQUEST_BODY = "request_body"
    const val KEY_REQUEST_BODY_CAMEL = "requestBody"
    const val KEY_REQUEST_DATA = "requestData"
    const val KEY_EVENT_TYPE = "eventType"
    const val KEY_TYPE = "type"
    const val KEY_DATA = "data"
    const val KEY_REQUEST_ID_CAMEL = "requestId"
    const val KEY_REQUEST_ID = "request_id"
    const val KEY_DEVICE_ID_CAMEL = "deviceId"
    const val KEY_MATTER_NODE_ID_CAMEL = "matterNodeId"
    const val KEY_MATTER_NODE_ID = "matter_node_id"
    const val KEY_DEVICE_ID = "device_id"
    const val KEY_FABRIC_ID = "fabric_id"
    const val KEY_FABRIC_ID_CAMEL = "fabricId"
    const val KEY_NAME = "name"
    const val KEY_USER_NOC = "userNoc"
    const val KEY_MATTER_USER_ID = "matterUserId"
    const val KEY_ROOT_CA_CAMEL = "rootCa"
    const val KEY_IPK_CAMEL = "ipk"
    const val KEY_GROUP_CAT_ID_OPERATE = "groupCatIdOperate"
    const val KEY_GROUP_CAT_ID_ADMIN = "groupCatIdAdmin"
    const val KEY_USER_CAT_ID = "userCatId"
    const val KEY_STATUS = "status"
    const val KEY_FABRIC_NAME = "fabric_name"
    const val KEY_MESSAGE = "message"
    const val KEY_MESSAGE_CAMEL = "message"
    const val KEY_DESCRIPTION = "description"
    const val KEY_NODE_NOC = "nodeNoc"
    const val KEY_NODE_NOC_SNAKE = "node_noc"
    const val KEY_ROOT_CERT = "root_cert"
    const val KEY_ROOT_CERT_CAMEL = "rootCert"
    const val KEY_OPERATIONAL_CERT = "operational_cert"
    const val KEY_OPERATIONAL_CERT_CAMEL = "operationalCert"
    const val KEY_INTERMEDIATE_CERT = "intermediate_cert"
    const val KEY_INTERMEDIATE_CERT_CAMEL = "intermediateCert"
    const val KEY_IPK_VALUE = "ipk_value"
    const val KEY_IPK = "ipk"
    const val KEY_VENDOR_ID = "vendor_id"
    const val KEY_VENDOR_ID_CAMEL = "vendorId"
    const val KEY_ADMIN_VENDOR_ID = "admin_vendor_id"
    const val KEY_ERROR_CODE = "error_code"
    const val KEY_ERROR_CODE_CAMEL = "errorCode"
    const val KEY_ERROR_MESSAGE = "error_message"
    const val KEY_ERROR_MESSAGE_CAMEL = "errorMessage"
    const val KEY_SOURCE = "source"
    const val KEY_SOURCE_CAMEL = "source"
    const val KEY_DEVICE_NAME_CAMEL = "deviceName"
    const val KEY_FABRIC_NAME_CAMEL = "fabricName"
    const val KEY_SUCCESS = "success"

    const val CERT_BEGIN = "-----BEGIN CERTIFICATE REQUEST-----"
    const val CERT_END = "-----END CERTIFICATE REQUEST-----"
    const val CERTIFICATE_BEGIN = "-----BEGIN CERTIFICATE-----"
    const val CERTIFICATE_END = "-----END CERTIFICATE-----"
    const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
    const val CERTIFICATE_TYPE_X509 = "X.509"

    // Matter Vendor ID from gradle.properties
    val ESP_VENDOR_ID: Int
        get() = BuildConfig.MATTER_VENDOR_ID

    const val PRIVILEGE_ADMIN = 5
    const val PRIVILEGE_OPERATE = 3
    const val ENDPOINT_0 = 0

    // Matter CASE Authenticated Tag (CAT) NodeId prefix. Per Matter spec, ACL subjects
    // and NOC subjects of type CAT live in the NodeId range
    // 0xFFFFFFFD_00000000 - 0xFFFFFFFD_FFFFFFFF, where the lower 32 bits split into
    // 16-bit identifier + 16-bit version. Raw RainMaker CAT id hex strings must be
    // prefixed with this value before being passed to AddNOC / writeAcl, otherwise the
    // device treats them as plain operational node ids and access control fails.
    const val CAT_ID_PREFIX = "FFFFFFFD"

    const val ESP_PREFERENCES = "Esp_Preferences"

    // Cluster IDs from BuildConfig
    const val RM_CLUSTER_ID_HEX = 0x131bfc00L
    const val CONTROLLER_CLUSTER_ID_HEX = 0x131BFC01L
    const val RM_CLUSTER_ID = 320601088L
    const val CONTROLLER_CLUSTER_ID = 320601089L

    const val RM_ATTR_RAINMAKER_NODE_ID = 0x1L
    const val RM_ATTR_CHALLENGE = 0x2L
    const val RM_ATTR_MATTER_NODE_ID = 0x3L

    const val RM_CMD_SEND_MATTER_NODE_ID = 0x1L

    const val KEY_RAINMAKER_NODE_ID = "rainmaker_node_id"
    const val KEY_RAINMAKER_NODE_ID_CAMEL = "rainmakerNodeId"
    const val KEY_CHALLENGE = "challenge"
    const val KEY_CHALLENGE_CAMEL = "challenge"
    const val KEY_CHALLENGE_RESPONSE = "challenge_response"
    const val KEY_CHALLENGE_RESPONSE_CAMEL = "challengeResponse"
    const val KEY_REQ_ID = "req_id"
    const val KEY_METADATA = "metadata"
    const val KEY_NOCSR_ELEMENTS = "nocsrElements"
    const val KEY_ATTESTATION_SIGNATURE = "attestationSignature"
    const val KEY_ATTESTATION_CHALLENGE = "attestationChallenge"
    const val KEY_SIGV4_ACCESS_KEY = "sigv4AccessKey"
    const val KEY_SIGV4_SECRET_KEY = "sigv4SecretKey"
    const val KEY_SIGV4_SESSION_TOKEN = "sigv4SessionToken"
    const val KEY_SIGV4_EXPIRATION = "sigv4Expiration"
    /** Native to React Native event payload key for the RainMaker flag. */
    const val KEY_IS_RAINMAKER_NODE_CAMEL = "isRainmakerNode"
    /** Cloud Matter metadata flag key, aligned with reference Android/iOS apps. */
    const val KEY_IS_RAINMAKER = "isRainmaker"
    const val KEY_MATTER = "Matter"
    const val KEY_DEVICE_TYPE = "deviceType"
    /** Cloud Matter metadata: nested endpoints.{0xEP}.clusters.{servers|clients}.{0xCID}.attributes */
    const val KEY_ENDPOINTS = "endpoints"
    const val KEY_CLUSTERS = "clusters"
    const val KEY_SERVERS = "servers"
    const val KEY_CLIENTS = "clients"
    const val KEY_ATTRIBUTES = "attributes"

    const val DEFAULT_MATTER_DEVICE_NAME = "Matter Device"
    const val MATTER_CONTROLLER_DEVICE_NAME = "Matter Controller"

    const val PREF_CTRL_SETUP_PREFIX = "ctrl_setup_"

    const val EVENT_COMMISSIONING_CONFIRM_REQUEST = "COMMISSIONING_CONFIRMATION_REQUEST"
    const val EVENT_MATTER_NOC_REQUEST = "NODE_NOC_REQUEST"
    const val EVENT_MATTER_CONFIRM_REQUEST = "CONFIRM_NODE_REQUEST"
    const val EVENT_MATTER_NOC_RESPONSE = "NOC_RESPONSE"
    const val EVENT_MATTER_CONFIRM_RESPONSE = "CONFIRM_NODE_RESPONSE"
    const val EVENT_REACT_CONFIRM_RESPONSE = "COMMISSIONING_CONFIRMATION_RESPONSE"
    const val EVENT_ISSUE_NODE_NOC_RESPONSE = "ISSUE_NODE_NOC_RESPONSE"
    const val EVENT_CSR_GENERATION_RESPONSE = "CSR_GENERATION_RESPONSE"
    const val EVENT_FABRIC_CREATION_RESPONSE = "FABRIC_CREATION_RESPONSE"
    const val EVENT_START_COMMISSIONING_RESPONSE = "START_COMMISSIONING_RESPONSE"
    const val EVENT_COMMISSIONING_COMPLETE = "COMMISSIONING_COMPLETE"
    const val EVENT_COMMISSIONING_ERROR = "COMMISSIONING_ERROR"
    const val EVENT_MATTER_COMMISSIONING = "MatterCommissioningEvent"
    const val EVENT_NOC_STORED = "NOC_STORED"
    const val COMMISSIONING_TOKEN_PREFIX = "esp_commissioning_"
    const val GPS_COMMISSIONING_SOURCE = "GPS_SERVICE"
    const val GPS_COMMISSIONING_SUCCESS = "GPS commissioning completed successfully"

    const val STATUS_SUCCESS = "success"
    const val STATUS_ERROR = "error"

    // Headless JS Task identifiers
    const val TASK_ISSUE_NOC = "MatterIssueNocTask"
    const val TASK_CONFIRM_COMMISSION = "MatterConfirmCommissionTask"

    // Headless JS Task extra keys
    const val EXTRA_TASK_NAME = "taskName"
    const val EXTRA_TASK_DATA = "taskData"
    const val EXTRA_NODE_ID = "nodeId"

    const val MESSAGE_NOC_CHAIN_RECEIVED = "NOC chain received successfully"
    const val MESSAGE_NOC_RESPONSE_SENT = "NOC response sent successfully"
    const val MESSAGE_CONFIRM_RESPONSE_SENT = "Confirm response sent successfully"
    const val MESSAGE_NOC_CHAIN_RESPONSE_SENT = "NOC chain response sent via EventBus"
    const val MESSAGE_NOC_ALREADY_STORED = "NOC already stored; no API call needed"
    const val MESSAGE_CSR_GENERATED = "CSR generated successfully, ready for API call"
    const val MESSAGE_PRECOMMISSION_STORED = "Pre-commission info stored successfully"
    const val ERROR_INVALID_PAYLOAD = "INVALID_PAYLOAD"
    const val MESSAGE_POST_MESSAGE_INVALID_TYPE = "postMessage requires a valid type"
    const val ERROR_UNSUPPORTED_POST_MESSAGE = "UNSUPPORTED_POST_MESSAGE"
    const val MESSAGE_UNSUPPORTED_POST_MESSAGE_TYPE = "Unsupported postMessage event type"
    const val ERROR_POST_MESSAGE = "POST_MESSAGE_ERROR"
    const val MESSAGE_FAILED_TO_PROCESS_POST_MESSAGE = "Failed to process postMessage"

    const val KEYSTORE_ANDROID = "AndroidKeyStore"
    const val EC_CURVE_SECP256R1 = "secp256r1"

    /** Operational Matter mDNS / discovery service type (CHIP operational browse). */
    const val MATTER_OPERATIONAL_SERVICE_TYPE = "_matter._tcp."
    /** React Native discovery config key for target Matter node ids (hex strings). */
    const val KEY_MATTER_NODE_IDS = "matterNodeIds"
    /** Interval between CHIP operational reachability probes while discovery is active. */
    const val MATTER_DISCOVERY_POLL_INTERVAL_MS = 8_000L
    /** IM read timeout when verifying an already-connected node is still on the LAN. */
    const val MATTER_DISCOVERY_LIVENESS_TIMEOUT_MS = 3_000L
    /**
     * `getConnectedDevicePointer` below this elapsed time reuses a cached CASE session
     * without network I/O — follow with a liveness read before reporting reachable.
     */
    const val MATTER_DISCOVERY_CACHED_SESSION_ELAPSED_MS = 200L
    /**
     * Per-node cap on CHIP `getConnectedDevicePointer` (operational resolve + CASE).
     * CHIP's internal AddressResolve default is ~40s; an unreachable node must fail
     * fast so it never delays reachable nodes or the poll cadence.
     */
    const val MATTER_DISCOVERY_CONNECT_TIMEOUT_MS = 10_000L
    /** Max concurrent per-node probes per cycle (bounds in-flight CASE sessions). */
    const val MATTER_DISCOVERY_MAX_CONCURRENT_PROBES = 5
    // Matter commissioning back-end identifiers (must match values accepted by
    // build.gradle's MATTER_COMMISSIONING_METHOD validation).
    const val COMMISSIONING_METHOD_GOOGLE_PLAY_SERVICES = "GooglePlayServices"
    const val COMMISSIONING_METHOD_CHIP_TOOL = "ChipTool"

    // Source identifiers attached to MatterEvent payloads so React Native callers can
    // tell which Android back-end performed the commissioning.
    const val CHIP_TOOL_COMMISSIONING_SOURCE = "CHIP_TOOL"

    // Intent extras consumed by ChipToolCommissioningActivity.
    const val EXTRA_ONBOARDING_PAYLOAD = "on_board_payload"
}

data class MatterEvent(
    val eventType: String,
    val data: Bundle? = null
)
