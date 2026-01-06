/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.os.Bundle

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
    const val KEY_DEVICE_NAME = "device_name"
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

    // Vendor identifiers
    const val ESP_VENDOR_ID = 0x131B

    const val PRIVILEGE_ADMIN = 5
    const val PRIVILEGE_OPERATE = 3
    const val ENDPOINT_0 = 0

    const val ESP_PREFERENCES = "Esp_Preferences"

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
    const val KEY_IS_RAINMAKER_NODE = "is_rainmaker_node"
    const val KEY_IS_RAINMAKER_NODE_CAMEL = "isRainmakerNode"
    const val KEY_MATTER = "Matter"
    const val KEY_DEVICE_TYPE = "deviceType"
    const val KEY_ENDPOINTS_DATA = "endpointsData"
    const val KEY_SERVERS_DATA = "serversData"
    const val KEY_CLIENTS_DATA = "clientsData"

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
}

data class MatterEvent(
    val eventType: String,
    val data: Bundle? = null
)
