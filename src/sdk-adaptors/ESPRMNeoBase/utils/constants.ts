/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// LOGGER
export const ESPRMNEO_LOGGER_DEFAULT_PREFIX = "[ESPRMNeoBaseSDKAdaptor]";
export const ESPRMNEO_LOG_LEVEL = {
  LOG: "log",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
} as const;
export type ESPRMNeoLogLevel =
  (typeof ESPRMNEO_LOG_LEVEL)[keyof typeof ESPRMNEO_LOG_LEVEL];

// SUPPORTED PARAM TYPES
export const ESPRMNEO_NAME_PARAM_TYPE = "esp.param.name";

// TRANSFORM — safeTransform context paths, fallback labels, warn messages
/** `safeTransform` context label for device param arrays. */
export const ESPRMNEO_TRANSFORM_CONTEXT_DEVICE_PARAMS = "device.params";
/** `safeTransform` context label for `ESPRMNeoNode.devices`. */
export const ESPRMNEO_TRANSFORM_CONTEXT_NODE_DEVICES = "node.devices";
/** `safeTransform` context label for `ESPRMNeoNode.services`. */
export const ESPRMNEO_TRANSFORM_CONTEXT_NODE_SERVICES = "node.services";
/** `safeTransform` context label for service param arrays. */
export const ESPRMNEO_TRANSFORM_CONTEXT_SERVICE_PARAMS = "service.params";
/** Log label when device has neither `name` nor `type`. */
export const ESPRMNEO_TRANSFORM_UNKNOWN_DEVICE_LABEL = "unknown-device";
/** Log label when service has neither `name` nor `type`. */
export const ESPRMNEO_TRANSFORM_UNKNOWN_SERVICE_LABEL = "unknown-service";
/** Warn message when an individual device param fails to map. */
export const ESPRMNEO_TRANSFORM_LOG_DEVICE_PARAM_SKIPPED =
  "Device param transform skipped";
/** Warn message when an individual service param fails to map. */
export const ESPRMNEO_TRANSFORM_LOG_SERVICE_PARAM_SKIPPED =
  "Service param transform skipped";
/** Warn message when a node device fails to map. */
export const ESPRMNEO_TRANSFORM_LOG_NODE_DEVICE_SKIPPED =
  "Node device transform skipped";
/** Warn message when a node service fails to map. */
export const ESPRMNEO_TRANSFORM_LOG_NODE_SERVICE_SKIPPED =
  "Node service transform skipped";
/** Warn message when a batch node transform has partial failures. */
export const ESPRMNEO_TRANSFORM_LOG_NODE_PARTIAL_FAILURES =
  "Node transform partial failures";
/** Warn when CDF store sink cannot subscribe via subscriptionManager. */
export const ESPRMNEO_TRANSFORM_LOG_SUBSCRIBE_NODE_FAILED =
  "subscriptionManager.subscribeToNode failed";
/** Warn when subscriptionManager is missing / throws on access. */
export const ESPRMNEO_TRANSFORM_LOG_SUBSCRIPTION_MANAGER_UNAVAILABLE =
  "subscriptionManager unavailable";
/** Warn when app-side CDF ncfg rebuild after shadow update fails. */
export const ESPRMNEO_TRANSFORM_LOG_NCFG_REFRESH_FAILED =
  "refreshRmneoCdfIfNcfgAheadOfStore failed";

// NODE TRANSFORM — CDF entity type + Time service wire keys
/** CDF `ESPCDFNode.type` for RMNeo-backed nodes. */
export const ESPRMNEO_CDF_NODE_TYPE = "rmneo node";
/** RainMaker Time service id used in `setParams` payloads. */
export const ESPRMNEO_TIME_SERVICE_NAME = "Time";
/** IANA timezone param on the Time service. */
export const ESPRMNEO_TIME_PARAM_TZ = "TZ";
/** POSIX timezone companion param (`Time.TZ-POSIX`). */
export const ESPRMNEO_TIME_PARAM_TZ_POSIX = "TZ-POSIX";

/**
 * CDF `onPropertyChange` discriminants handled when mirroring onto `_raw`.
 * Values must match `@store` `ESPCDFPropertyChangeEvent.type`.
 */
export const ESPRMNEO_CDF_PROP_CHANGE = {
  DEVICE_PARAM: "deviceParamChanged",
  METADATA: "metadataChanged",
  AVAILABLE_TRANSPORTS: "availableTransportsChanged",
} as const;

// NODE TRANSFORM — success descriptions / unsupported ops
export const ESPRMNEO_NODE_DESC_PARAMS_UPDATED =
  "Parameters updated successfully";
export const ESPRMNEO_NODE_DESC_DELETED = "Node deleted successfully";
export const ESPRMNEO_NODE_DESC_TIMEZONE_UPDATED =
  "Time zone updated successfully";
export const ESPRMNEO_NODE_ERR_UPDATE_METADATA_UNSUPPORTED =
  "RMNeoBase SDK does not support node updateMetadata";
export const ESPRMNEO_NODE_ERR_CHECK_OTA_UNSUPPORTED =
  "RMNeoBase SDK does not support node checkOTAUpdate";
export const ESPRMNEO_NODE_ERR_PUSH_OTA_UNSUPPORTED =
  "RMNeoBase SDK does not support node pushOTAUpdate";
export const ESPRMNEO_NODE_ERR_GET_OTA_STATUS_UNSUPPORTED =
  "RMNeoBase SDK does not support node getOTAUpdateStatus";

// Matter metadata (node-level; device name for Matter-commissioned nodes)
export const MATTER_METADATA_KEY = "Matter";
export const MATTER_METADATA_DEVICE_NAME_KEY = "deviceName";

// RMNeo GET /v1/groups/{groupId}/users — `access_type` on each listed member
export const ESPRMNEO_GROUP_USER_ACCESS_PRIMARY = "primary";
export const ESPRMNEO_GROUP_USER_ACCESS_SECONDARY = "secondary";
export const ESPRMNEO_GROUP_USER_ACCESS_SUBGROUP = "subgroup";

// Error-message fragment thrown by rainmaker-neo-base-sdk <= 1.5.0 when getSharingInfo is
// called on a child group; used to detect the old SDK and fall back to parent listing.
export const ESPRMNEO_SDK_SHARING_INFO_ROOT_ONLY_ERROR_FRAGMENT =
  "only supported for root groups";

// Parent home group: secondary users are `access_type` secondary.
export const ESPRMNEO_GROUP_SHARING_SCOPE_PARENT = "parent_group";
// Nested room group: secondary users are subgroup-scoped members from parent list.
export const ESPRMNEO_GROUP_SHARING_SCOPE_SUBGROUP_ROOM = "subgroup_room";

// Automation status type
export const ESPRMNEO_AUTOMATION_STATUS = {
  ENABLED: "enabled",
  DISABLED: "disabled",
} as const;

// AUTOMATION — trigger ID / path wire format
/** Separates nodeId, automationId, and random part in composed trigger IDs. */
export const ESPRMNEO_TRIGGER_ID_SEP = "~";
/** Separates deviceId and paramId in action/trigger path strings. */
export const ESPRMNEO_TRIGGER_PATH_SEP = ".";
/** RMNeo TriggerItem.type for device-param conditions. */
export const ESPRMNEO_TRIGGER_TYPE_PARAM = "param";

// AUTOMATION — RainMaker API comparison keywords (two-letter wire values)
export const ESPRMNEO_API_OPERATOR = {
  EQ: "eq",
  NE: "ne",
  LT: "lt",
  LE: "le",
  GT: "gt",
  GE: "ge",
} as const;

// AUTOMATION — RMNeo TriggerOperator symbols
export const ESPRMNEO_TRIGGER_OPERATOR = {
  EQ: "==",
  NE: "!=",
  LT: "<",
  LE: "<=",
  GT: ">",
  GE: ">=",
} as const;

// CUSTOM DATA KEYS
export const ESPRMNEO_CUSTOM_DATA_KEY_LAST_SELECTED_HOME_ID =
  "lastSelectedHomeId";

// PUSH INTEGRATION — GET /v1/integrations `integration_type` values
export const ESPRMNEO_INTEGRATION_TYPE_APNS = "apns";
export const ESPRMNEO_INTEGRATION_TYPE_APNS_SANDBOX = "apns_sandbox";
export const ESPRMNEO_INTEGRATION_TYPE_GCM = "gcm";

/**
 * AsyncStorage key prefix for persisted push endpoints (historical `rmng.` prefix
 * must not change — installed users store endpoint IDs under this exact key).
 */
export const ESPRMNEO_PUSH_ENDPOINT_KEY_PREFIX = "rmng.cdf.v1.pushEndpoint";

/** App push identity platform when neither iOS nor Android. */
export const ESPRMNEO_PUSH_PLATFORM_OTHER = "other";

/** Expo `extra` key holding push identity overrides. */
export const ESPRMNEO_EXPO_EXTRA_PUSH_KEY = "push";

/** Expo `extra.push` Android Firebase project id field. */
export const ESPRMNEO_EXPO_PUSH_ANDROID_FCM_PROJECT_ID_KEY =
  "androidFcmProjectId";

/** Expo `extra.push` iOS bundle id field. */
export const ESPRMNEO_EXPO_PUSH_IOS_BUNDLE_ID_KEY = "iosBundleId";

// USER TRANSFORM — Cognito / profile attribute keys
/** Standard Cognito phone attribute on `userAttributes`. */
export const ESPRMNEO_USER_ATTR_PHONE_NUMBER = "phone_number";
/** Custom Cognito phone attribute fallback. */
export const ESPRMNEO_USER_ATTR_CUSTOM_PHONE = "custom:phone";

// USER TRANSFORM — node-update debug transport labels
/** Debug-log transport label when `ESPNodeUpdateData.source` is Matter. */
export const ESPRMNEO_NODE_UPDATE_TRANSPORT_MATTER = "matter";
/** Debug-log transport label for non-Matter (MQTT) node updates. */
export const ESPRMNEO_NODE_UPDATE_TRANSPORT_MQTT = "mqtt";
/** `ESPNodeUpdateData.source` value that maps to the Matter debug transport. */
export const ESPRMNEO_NODE_UPDATE_SOURCE_MATTER = "matter";

// USER TRANSFORM — success descriptions
export const ESPRMNEO_USER_DESC_INFO_FETCHED =
  "User info fetched successfully";
export const ESPRMNEO_USER_DESC_PASSWORD_CHANGED =
  "Password changed successfully";
export const ESPRMNEO_USER_DESC_ISSUED_SHARING_FETCHED =
  "Issued group sharing requests fetched successfully";
export const ESPRMNEO_USER_DESC_RECEIVED_SHARING_FETCHED =
  "Received group sharing requests fetched successfully";
export const ESPRMNEO_USER_DESC_TIMEZONE_UPDATED =
  "Time zone updated successfully";
export const ESPRMNEO_USER_DESC_PUSH_SKIPPED_NO_TOKEN =
  "No device token; push endpoint registration skipped";
export const ESPRMNEO_USER_DESC_PUSH_SKIPPED_NO_INTEGRATION =
  "No matching push integration for this build; endpoint registration skipped";
export const ESPRMNEO_USER_DESC_PUSH_REGISTERED =
  "Notification endpoint registered successfully";
export const ESPRMNEO_USER_DESC_PUSH_REGISTER_FAILED =
  "Notification endpoint registration failed (non-blocking)";
export const ESPRMNEO_USER_DESC_PUSH_UNREGISTERED =
  "Notification endpoint unregistered successfully";

// USER TRANSFORM — error / warn messages
export const ESPRMNEO_USER_ERR_REQUIRED =
  "ESPRMNeoUser is required for transformation";
export const ESPRMNEO_USER_ERR_UPDATE_USER_INFO =
  "RMNeoBase SDK does not support updateUserInfo";
export const ESPRMNEO_USER_ERR_UPDATE_NAME =
  "RMNeoBase SDK does not support updateName";
export const ESPRMNEO_USER_ERR_REQUEST_ACCOUNT_DELETION =
  "RMNeoBase SDK does not support requestAccountDeletion";
export const ESPRMNEO_USER_ERR_CONFIRM_ACCOUNT_DELETION =
  "RMNeoBase SDK does not support confirmAccountDeletion";
export const ESPRMNEO_USER_ERR_GET_GROUP_BY_ID =
  "RMNeoBase SDK does not support getGroupById";
export const ESPRMNEO_USER_ERR_SET_MULTIPLE_NODES_PARAMS =
  "RMNeoBase SDK does not support setMultipleNodesParams";
export const ESPRMNEO_USER_ERR_ASSUME_ROLE =
  "ESPRMNeoBase SDK assume role has different implementation which not assume role for particluar nodeId's or groupId's";
export const ESPRMNEO_USER_ERR_CUSTOM_DATA_NO_USER_ID =
  "RMNeo adaptor: cannot persist custom data without a resolvable user id";
export const ESPRMNEO_USER_ERR_PROVISION_ADAPTER_MISSING =
  "RMNeo ESPProvisionAdapter is not configured";
export const ESPRMNEO_USER_LOG_MISSING_BACKEND_USER_ID =
  "getUserInfo returned no user_id; CDF userInfo.id will be empty";
export const ESPRMNEO_USER_LOG_CUSTOM_DATA_NO_USER_ID =
  "getCustomData: missing user id for storage key";
export const ESPRMNEO_USER_LOG_CHANGE_PASSWORD_ERROR = "changePassword error:";
export const ESPRMNEO_USER_LOG_UPDATE_NAME_UNSUPPORTED =
  "updateName is not supported by RMNeoBase SDK";
export const ESPRMNEO_USER_LOG_REQUEST_ACCOUNT_DELETION_UNSUPPORTED =
  "requestAccountDeletion is not supported by RMNeoBase SDK";
export const ESPRMNEO_USER_LOG_CONFIRM_ACCOUNT_DELETION_UNSUPPORTED =
  "confirmAccountDeletion is not supported by RMNeoBase SDK";
export const ESPRMNEO_USER_LOG_PUSH_NO_INTEGRATION =
  "registerForNotification: no matching push integration";
export const ESPRMNEO_USER_LOG_PUSH_REGISTER_FAILED =
  "registerForNotification: push endpoint registration failed:";
export const ESPRMNEO_USER_LOG_PUSH_UNREGISTER_FAILED =
  "unregisterForNotification: push endpoint unregistration failed:";
export const ESPRMNEO_USER_LOG_SUBSCRIBE_ALL_NODES_FAILED =
  "subscribeToAllNodes failed:";
export const ESPRMNEO_USER_LOG_INITIAL_USER_INFO_FAILED =
  "Failed to fetch initial user info:";

/**
 * Builds the error when `subscribeToEvent` is called for an unsupported event.
 * @param event - Event name that was requested
 * @returns Human-readable unsupported-event message
 */
export function formatRmneoSubscribeToEventUnsupported(event: string): string {
  return `RMNeo SDK does not support subscribeToEvent for event: ${event}`;
}

/**
 * Builds the error when a node id cannot be resolved in any SDK group.
 * @param nodeId - Node that was looked up
 * @returns Human-readable not-found message
 */
export function formatRmneoNodeNotFoundInGroups(nodeId: string): string {
  return `Node ${nodeId} not found in any group`;
}

// GROUP SHARING REQUEST — CDF response / unsupported-op messages
/** Fallback description when accept/decline succeeds without an SDK message. */
export const ESPRMNEO_SHARING_DESC_REQUEST_PROCESSED =
  "Group sharing request processed successfully";
/** Thrown by `remove` — RMNeo has no cancel-sent-request API. */
export const ESPRMNEO_SHARING_ERR_REMOVE_UNSUPPORTED =
  "RMNeoBase SDK does not support cancelling sent sharing requests";

// AUTOMATION TRANSFORM — validation / dependency error messages
/** Thrown when event updates cannot resolve their owning node id. */
export const ESPRMNEO_AUTOMATION_ERR_NODE_ID_REQUIRED =
  "nodeId is required to update automation events";
/** Thrown when trigger synchronization has no node resolver. */
export const ESPRMNEO_AUTOMATION_ERR_GET_NODE_REQUIRED =
  "transformToESPCDFAutomation: getNode option is required to sync automation triggers";

// GROUP TRANSFORM — unsupported-op / validation error messages
export const ESPRMNEO_GROUP_ERR_CREATE_SUBGROUP_ON_SUBGROUP =
  "RMNeoBase SDK does not support createSubGroup for subgroup";
export const ESPRMNEO_GROUP_ERR_UPDATE_METADATA_UNSUPPORTED =
  "RMNeoBase SDK does not support updateMetadata";
export const ESPRMNEO_GROUP_ERR_ADD_NODES_ON_HOME =
  "RMNeoBase SDK does not support addNodes for group";
export const ESPRMNEO_GROUP_ERR_REMOVE_NODES_ON_HOME =
  "RMNeoBase SDK does not support removeNodes for group";
export const ESPRMNEO_GROUP_ERR_CREATE_SCENE_UNSUPPORTED =
  "RMNeoBase SDK does not support createScene";
export const ESPRMNEO_GROUP_ERR_GET_SCENES_UNSUPPORTED =
  "RMNeoBase SDK does not support getScenes";
export const ESPRMNEO_GROUP_ERR_CREATE_SCHEDULE_ON_SUBGROUP =
  "RMNeoBase SDK does not support createSchedule for subgroup";
export const ESPRMNEO_GROUP_ERR_GET_SCHEDULES_ON_SUBGROUP =
  "Subgroup does not support getSchedules";
export const ESPRMNEO_GROUP_ERR_CREATE_AUTOMATION_ON_SUBGROUP =
  "RMNeoBase SDK does not support createAutomation for subgroup";
export const ESPRMNEO_GROUP_ERR_GET_AUTOMATIONS_ON_SUBGROUP =
  "RMNeoBase SDK does not support getAutomations for subgroup";
export const ESPRMNEO_GROUP_ERR_AUTOMATION_NODE_ID_REQUIRED =
  "nodeId is required to create automation";
export const ESPRMNEO_GROUP_ERR_DELETE_FAILED = "Failed to delete group";
export const ESPRMNEO_GROUP_ERR_REMOVE_SHARING_FAILED =
  "Failed to remove sharing";
export const ESPRMNEO_GROUP_ERR_SUBGROUP_MISSING_PARENT_ID =
  "RMNeo subgroup missing parentId for sharing info";

// SCHEDULE TRANSFORM — error messages / id prefix
/** Thrown when schedule mutations run without a `getNode` resolver. */
export const ESPRMNEO_SCHEDULE_ERR_GET_NODE_REQUIRED =
  "transformToESPCDFSchedule: getNode option is required for schedule mutations";
/** Prefix for locally generated schedule ids when CDF omits `id`. */
export const ESPRMNEO_SCHEDULE_ID_PREFIX = "schedule_";

/**
 * Builds the error when a schedule id is missing from a node's schedule list.
 * @param scheduleId - Schedule id that was looked up
 * @param nodeId - Node that was searched
 * @returns Human-readable not-found message
 */
export function formatRmneoScheduleNotFound(
  scheduleId: string,
  nodeId: string,
): string {
  return `Schedule ${scheduleId} not found on node ${nodeId}`;
}

/**
 * Builds a fallback schedule id when CDF input has none.
 * @param timestamp - Milliseconds used as the unique suffix (defaults to now)
 * @returns Id in the form `schedule_<timestamp>`
 */
export function formatRmneoFallbackScheduleId(
  timestamp: number = Date.now(),
): string {
  return `${ESPRMNEO_SCHEDULE_ID_PREFIX}${timestamp}`;
}

/** i18n keys for localized “group/room not empty” delete errors. */
export const ESPRMNEO_GROUP_I18N_ROOM_NOT_EMPTY = "group.errors.roomNotEmpty";
export const ESPRMNEO_GROUP_I18N_HOME_NOT_EMPTY = "group.errors.homeNotEmpty";

/** CDF automation event object key used when narrowing createAutomation input. */
export const ESPRMNEO_AUTOMATION_EVENT_DEVICE_NAME_KEY = "deviceName";

// GROUP TRANSFORM — success descriptions
export const ESPRMNEO_GROUP_DESC_DELETED = "Group deleted successfully";
export const ESPRMNEO_GROUP_DESC_NAME_UPDATED =
  "Group name updated successfully";
export const ESPRMNEO_GROUP_DESC_NODES_ADDED = "Nodes added to subgroup";
export const ESPRMNEO_GROUP_DESC_NODES_REMOVED = "Nodes removed from subgroup";
export const ESPRMNEO_GROUP_DESC_LEFT = "Left group successfully";
export const ESPRMNEO_GROUP_DESC_AUTOMATIONS_FETCHED =
  "Automations fetched successfully";

/**
 * Builds the error when a sharing member cannot be resolved from cached info.
 * @param username - Email, phone, or user id that was looked up
 * @returns Human-readable not-found message
 */
export function formatRmneoSharingUserNotFound(username: string): string {
  return `User ${username} not found in sharing info`;
}

/**
 * Builds the success description after removing a shared member.
 * @param username - Member that was removed
 * @returns Human-readable sharing-removed description
 */
export function formatRmneoSharingRemovedDescription(username: string): string {
  return `Sharing removed for user ${username}`;
}

/** CDF `metadata` keys retained from the RMNeo sharing request. */
export const ESPRMNEO_SHARING_META_ACCESS_TYPE = "accessType";
export const ESPRMNEO_SHARING_META_GROUP_ID = "groupId";
export const ESPRMNEO_SHARING_META_SUBGROUP_ID = "subgroupId";

// AUTH LOG MESSAGES
export const ESPRMNEO_AUTH_LOG_LOGIN_RAW_SDK_ERROR = "login RAW SDK error:";
export const ESPRMNEO_AUTH_LOG_GET_CURRENT_USER_RAW_SDK_ERROR =
  "getCurrentLoggedInUser RAW SDK error:";

// AUTH SUCCESS DESCRIPTIONS
export const ESPRMNEO_AUTH_DESC_SDK_INITIALIZED =
  "SDK initialized successfully";
export const ESPRMNEO_AUTH_DESC_LOGIN_SUCCESS = "Login successful";
export const ESPRMNEO_AUTH_DESC_CURRENT_USER_FETCHED =
  "Current logged in user fetched successfully";
export const ESPRMNEO_AUTH_DESC_SIGNUP_CODE_SENT =
  "Signup code sent successfully";
export const ESPRMNEO_AUTH_DESC_SIGNUP_CONFIRMATION_SUCCESS =
  "Signup confirmation successful";
export const ESPRMNEO_AUTH_DESC_NEW_PASSWORD_SET =
  "New password set successfully";
export const ESPRMNEO_AUTH_DESC_VERIFICATION_CODE_SENT_FALLBACK_RECIPIENT =
  "your email";

// AUTH ERROR MESSAGES
export const ESPRMNEO_AUTH_ERR_LOGIN_WITH_OAUTH_UNSUPPORTED =
  "RMNeoBase SDK does not support loginWithOauth";
export const ESPRMNEO_AUTH_ERR_LOGIN_WITH_CODE_UNSUPPORTED =
  "RMNeoBase SDK does not support loginWithCode";
export const ESPRMNEO_AUTH_ERR_LOGIN_NO_USER = "Login failed: No user returned";
export const ESPRMNEO_AUTH_ERR_LOGIN_FAILED = "Login failed";
export const ESPRMNEO_AUTH_ERR_NO_LOGGED_IN_USER = "No logged in user found";
export const ESPRMNEO_AUTH_ERR_GET_CURRENT_USER =
  "Failed to get current user";
export const ESPRMNEO_AUTH_ERR_SEND_SIGNUP_CODE =
  "Failed to send signup code";
export const ESPRMNEO_AUTH_ERR_SIGNUP_CONFIRMATION =
  "Signup confirmation failed";
export const ESPRMNEO_AUTH_ERR_SEND_PASSWORD_RECOVERY_CODE =
  "Failed to send password recovery code";
export const ESPRMNEO_AUTH_ERR_RESET_PASSWORD = "Failed to reset password";

/**
 * Builds the fallback description when forgot-password succeeds without an API message.
 * @param username - Account username; when empty, uses the email fallback recipient.
 * @returns Human-readable verification-code-sent description.
 */
export function formatVerificationCodeSentDescription(
  username?: string
): string {
  return `Verification code sent to ${
    username || ESPRMNEO_AUTH_DESC_VERIFICATION_CODE_SENT_FALLBACK_RECIPIENT
  }`;
}

// PROVISIONING DEVICE — version-info / capability wire keys
/** Device version-info key holding RainMaker extra capabilities. */
export const ESPRMNEO_VERSION_INFO_RMAKER_EXTRA_KEY = "rmaker_extra";
/** Nested key under `rmaker_extra` for the capability string list. */
export const ESPRMNEO_RMAKER_EXTRA_CAP_KEY = "cap";

// PROVISIONING DEVICE — CDF defaults when SDK fields are absent
/** Default BLE transport label for adapter-created provision devices. */
export const ESPRMNEO_PROVISION_TRANSPORT_BLE = "ble";
/** Default security scheme when the SDK device omits `security`. */
export const ESPRMNEO_PROVISION_DEFAULT_SECURITY = 2;
/** SDK `connect()` return code that means success. */
export const ESPRMNEO_PROVISION_CONNECT_SUCCESS_CODE = 0;

// PROVISIONING DEVICE — unsupported-op error messages
export const ESPRMNEO_PROVISION_ERR_INITIATE_USER_NODE_MAPPING =
  "RMNeo adapter-created device does not support initiateUserNodeMapping; use group.initiateNodeAssociation for claiming.";
export const ESPRMNEO_PROVISION_ERR_VERIFY_USER_NODE_MAPPING =
  "RMNeo adapter-created device does not support verifyUserNodeMapping; use group.verifyNodeAssociation for claiming.";
export const ESPRMNEO_PROVISION_ERR_SET_NETWORK_CREDENTIALS =
  "RMNeo adapter-created device does not support setNetworkCredentials.";

// PROVISIONING DEVICE — log messages
export const ESPRMNEO_PROVISION_LOG_VERSION_INFO_SKIP =
  "Could not fetch versionInfo, skipping ch_resp";
export const ESPRMNEO_PROVISION_LOG_CHAL_RESP_FLOW =
  "Running challenge-response flow";
export const ESPRMNEO_PROVISION_LOG_WIFI_OK = "WiFi provision OK";
export const ESPRMNEO_PROVISION_LOG_WIFI_RESET =
  "Wi-Fi reset requested on provisioning session";
export const ESPRMNEO_PROVISION_LOG_WIFI_RETRY =
  "Re-sending Wi-Fi credentials after reset";
export const ESPRMNEO_PROVISION_LOG_CONNECT = "Provisioning device connect";
export const ESPRMNEO_PROVISION_LOG_DISCONNECT =
  "Provisioning device disconnect";
export const ESPRMNEO_PROVISION_LOG_CHAL_RESP_SUPPORT =
  "Challenge-response support check";
