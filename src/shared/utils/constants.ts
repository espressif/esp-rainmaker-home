/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRegionConfig } from "@config/region.config";
import {
  MATTER_DEVICE_TYPE_DOOR_LOCK,
  MATTER_DEVICE_TYPE_HUMIDITY_SENSOR,
  MATTER_DEVICE_TYPE_ILLUMINANCE_SENSOR,
  MATTER_DEVICE_TYPE_OCCUPANCY_SENSOR,
  MATTER_DEVICE_TYPE_RVC,
  MATTER_DEVICE_TYPE_TEMPERATURE_SENSOR,
} from "@config/matter.constants";

/**
 * `extractDeviceType` values with no meaningful power param for card UI: DeviceCard uses node
 * connectivity (`isConnected`) for `getDeviceImage` instead of `ESPRM_POWER_PARAM_TYPE`.
 */
export {
  MATTER_DEVICE_TYPE_DOOR_LOCK,
  MATTER_DEVICE_TYPE_HUMIDITY_SENSOR,
  MATTER_DEVICE_TYPE_ILLUMINANCE_SENSOR,
  MATTER_DEVICE_TYPE_OCCUPANCY_SENSOR,
  MATTER_DEVICE_TYPE_RVC,
  MATTER_DEVICE_TYPE_TEMPERATURE_SENSOR,
};

// CONSTANTS
export const TOAST_ANIMATION_DURATION = "200ms";
export const REJECTED_STATUS = "rejected";
export const FULFILLED_STATUS = "fulfilled";

// PLATFORMS
export const PLATFORM_IOS = "ios";
export const PLATFORM_ANDROID = "android";
export const DEFAULT_HOME_GROUP_NAME = "Home";
export const HOME_NAME_MAX_LENGTH = 32;

// LINKS — region-scoped values come from the committed region env files
// (.env.global.example / .env.cn.example → extra.regionConfigs.<region>.websiteLinks); the
// hard-coded default below is the last-resort fallback for a blank value.
const DEFAULT_WEBSITE_LINK = "https://rainmaker.espressif.com";

// Legal-page links live in `./legalLinks`: they also read the active deployment,
// which cannot be imported here without closing a require cycle.

// Resolved once at module load; the active region is session-stable
// (region.config.ts caches it), so this agrees with every call-time reader.
export const WEBSITE_LINK =
  getRegionConfig().websiteLinks.website?.trim() || DEFAULT_WEBSITE_LINK;

// STORAGE KEYS
// Persisted flag recording that the user accepted the CN-region privacy
// consent shown at first launch. Stored via the AsyncStorage adapter.
export const CN_CONSENT_ACCEPTED_KEY = "@esp_cn_consent_accepted";
export const CONSENT_ACCEPTED_VALUE = "true";

// SKELETON LOADERS
/** `react-native-reanimated-skeleton` pulse animation (no linear-gradient bones). */
export const SKELETON_ANIMATION_PULSE = "pulse" as const;

/** Skeleton reveal: still showing bones while data loads. */
export const SKELETON_REVEAL_PHASE_LOADING = "loading" as const;
/** Skeleton reveal: collapsing skeleton height after load finishes. */
export const SKELETON_REVEAL_PHASE_EXITING = "exiting" as const;
/** Skeleton reveal: real content visible after exit. */
export const SKELETON_REVEAL_PHASE_READY = "ready" as const;

/** Shared duration for synced skeleton collapse + content slide-up (ms). */
export const SKELETON_REVEAL_SHRINK_MS = 160;
/** Mild content translateY at exit start (dp); eases to 0 with the skeleton. */
export const SKELETON_REVEAL_SLIDE_OFFSET = 8;

// TOAST TYPES
export const SUCESS = "success";
export const ERROR = 1;
export const WARNING = 2;
export const INFO = 3;
export const UNKNOWN = 4;
export const UNAUTHORIZED = 5;
export const FORBIDDEN = 6;

// SDK ERRORS
export const ESP_TOKEN_ERROR = "ESPTokenError";
export const OAUTH_CANCELLED_ERROR_TAG = "OAUTH_CANCELLED";
export const OAUTH_NO_BROWSER_FOUND_ERROR_TAG = "NO_BROWSER_FOUND";

// APP LIFECYCLE
export const APP_STATE_ACTIVE = "active";
export const APP_STATE_INACTIVE = "inactive";
export const APP_STATE_BACKGROUND = "background";
export const OAUTH_APP_RESUME_CHECK_DELAY_MS = 1000;
export const OAUTH_APP_RESUME_CANCEL_GRACE_PERIOD_MS = 4000;

// KEYBOARD EVENTS
export const KEYBOARD_DID_SHOW = "keyboardDidShow";
export const KEYBOARD_DID_HIDE = "keyboardDidHide";

// DATA TYPES
export const DATA_TYPE_ALL = "all";
export const DATA_TYPE_BOOL = "bool";
export const DATA_TYPE_INT = "int";
export const DATA_TYPE_FLOAT = "float";
export const DATA_TYPE_STRING = "string";
export const DATA_TYPE_ARRAY = "array";
export const DATA_TYPE_OBJECT = "object";

// SUPPORTED PARAMS TYPES
export const ESPRM_NAME_PARAM_TYPE = "esp.param.name";
export const ESPRM_POWER_PARAM_TYPE = "esp.param.power";
export const ESPRM_BRIGHTNESS_PARAM_TYPE = "esp.param.brightness";
export const ESPRM_CCT_PARAM_TYPE = "esp.param.cct";
export const ESPRM_HUE_PARAM_TYPE = "esp.param.hue";
export const ESPRM_SATURATION_PARAM_TYPE = "esp.param.saturation";
export const ESPRM_TEMPERATURE_PARAM_TYPE = "esp.param.temperature";
export const ESPRM_ENERGY_PARAM_TYPE = "esp.param.energy";
export const ESPRM_LIGHT_MODE_PARAM_TYPE = "esp.param.light-mode";

/** CCT / color-temperature slider defaults (Kelvin). UI floors `min` at `CCT_KELVIN_MIN`. */
export const CCT_KELVIN_MIN = 2700;
export const CCT_KELVIN_MAX = 6500;
export const CCT_KELVIN_STEP = 100;
export const ESPRM_FACTORY_RESET_PARAM_TYPE = "esp.param.factory-reset";
export const ESPRM_REBOOT_PARAM_TYPE = "esp.param.reboot";
export const ESPRM_WIFI_RESET_PARAM_TYPE = "esp.param.wifi-reset";
export const ESPRM_SPEED_PARAM_TYPE = "esp.param.speed";
export const ESPRM_DIRECTION_PARAM_TYPE = "esp.param.direction";
export const ESPRM_REFRESH_TOKEN_PARAM_TYPE = "esp.param.refresh-token";
export const ESPRM_USER_TOKEN_PARAM_TYPE = "esp.param.user-token";
export const ESPRM_BASE_URL_PARAM_TYPE = "esp.param.base-url";
export const ESPRM_CHANNEL_PARAM_TYPE = "esp.param.channel";
export const ESPRM_LOCAL_CONTROL_TYPE_PARAM_TYPE = "esp.param.local_control_type";
export const ESPRM_LOCAL_CONTROL_POP_PARAM_TYPE = "esp.param.local_control_pop";

/** Param `name` values shown as live readings on the home device card. */
export const DEVICE_CARD_SENSOR_PARAM_NAME_BATTERY = "Battery";
export const DEVICE_CARD_SENSOR_PARAM_NAME_HUMIDITY = "Humidity";
export const DEVICE_CARD_SENSOR_PARAM_NAME_ILLUMINANCE = "Illuminance";
export const DEVICE_CARD_SENSOR_PARAM_NAME_OCCUPANCY = "Occupancy";
export const DEVICE_CARD_SENSOR_PARAM_NAME_TEMPERATURE = "Temperature";

export const POWER_PARAM_UNSUPPORTED_DEVICE_TYPES = new Set<string>([
  "temperature-sensor",
  "ai assistant",
  "camera",
  MATTER_DEVICE_TYPE_RVC,
  MATTER_DEVICE_TYPE_TEMPERATURE_SENSOR,
  MATTER_DEVICE_TYPE_HUMIDITY_SENSOR,
  MATTER_DEVICE_TYPE_OCCUPANCY_SENSOR,
  MATTER_DEVICE_TYPE_ILLUMINANCE_SENSOR,
  MATTER_DEVICE_TYPE_DOOR_LOCK,
]);

// PARAM NAMES
export const VOLUME_PARAM_NAME = "Volume";

/** Min ms between throttled `setValue` (burst coalesce, post-write queue). */
export const PARAM_CONTROL_THROTTLE_MS = 400;

/** Delay before adopting incoming MQTT/store `param.value` into local UI after user writes. */
export const PARAM_INCOMING_UPDATE_DEBOUNCE_MS = 3000;

/**
 * Leading-edge window for duplicate `router.push` to the same destination.
 * Prevents rapid taps from stacking the same screen.
 */
export const NAVIGATION_THROTTLE_MS = 700;

// DURATION / LAST-SEEN (connectivity offline banner)
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
/** Epoch values below this are treated as seconds rather than milliseconds. */
export const EPOCH_SECONDS_MAX = 1_000_000_000_000;
export const LAST_SEEN_UNIT_SECONDS = "seconds";
export const LAST_SEEN_UNIT_MINUTES = "minutes";
export const LAST_SEEN_UNIT_HOURS = "hours";
export const LAST_SEEN_UNIT_DAYS = "days";

// SUPPORTED PARAM UI TYPES
export const ESPRM_UI_TEXT_PARAM_TYPE = "esp.ui.text";
export const ESPRM_UI_STATUS_PARAM_TYPE = "esp.ui.status";
export const ESPRM_UI_ACTION_BUTTON_PARAM_TYPE = "esp.ui.action-button";
export const ESPRM_UI_CONTROL_BOARD_PARAM_TYPE = "esp.ui.control-board";
export const ESPRM_UI_LOCK_CONTROL_PARAM_TYPE = "esp.ui.lock-control";
/** UI slug for an unlocked lock-control state (icon + engaged styling). */
export const LOCK_CONTROL_UNLOCKED_STATE = "unlocked";
export const ESPRM_UI_TOGGLE_PARAM_TYPE = "esp.ui.toggle";
export const ESPRM_UI_SLIDER_PARAM_TYPE = "esp.ui.slider";
export const ESPRM_UI_HUE_SLIDER_PARAM_TYPE = "esp.ui.hue-slider";
export const ESPRM_UI_HUE_CIRCLE_PARAM_TYPE = "esp.ui.hue-circle";
export const ESPRM_UI_CCT_SLIDER_PARAM_TYPE = "esp.ui.cct-slider";
export const ESPRM_UI_PUSH_BUTTON_PARAM_TYPE = "esp.ui.push-btn-big";
export const ESPRM_UI_DROPDOWN_PARAM_TYPE = "esp.ui.dropdown";
export const ESPRM_UI_HIDDEN_PARAM_TYPE = "esp.ui.hidden";
export const ESPRM_UI_TRIGGER_PARAM_TYPE = "esp.ui.trigger";

// SUPPORTED PARAM PROPERTIES
export const WRITE_PERMISSION = "write";
export const READ_PERMISSION = "read";
export const USER_PERMISSION = "user";

// SUPPORTED SERVICES
export const ESPRM_SYSTEM_SERVICE = "esp.service.system";
export const ESPRM_SCENES_SERVICE = "esp.service.scenes";
export const ESPRM_SCHEDULES_SERVICE = "esp.service.schedule";
export const ESPRM_LOCAL_CONTROL_SERVICE = "esp.service.local_control";
export const ESPRM_AGENT_AUTH_SERVICE = "esp.service.agent-auth";
export const ESPRM_RMAKER_USER_AUTH_SERVICE = "esp.service.rmaker-user-auth";
export const ESPRM_MATTER_CONTROLLER_SERVICE = "esp.service.matter-controller";
export const ESPRM_MATTER_CONTROLLER_SETUP_SERVICE =
  "esp.service.matter-controller-setup";

// MATTER CONTROLLER — cloud device-list update (MTCtlCMD param)
export const MATTER_CTL_CMD_PARAM_NAME = "MTCtlCMD";
export const MATTER_CTL_CMD_UPDATE_DEVICE_LIST = 2;

// AUTH STORAGE KEYS
export const ESPRM_REFRESH_TOKEN_STORAGE_KEY = "com.esprmbase.refreshToken";

// TEXT INPUT AUTOFILL (iOS textContentType / Android autoComplete)
export const TEXT_CONTENT_TYPE_USERNAME = "username";
export const TEXT_CONTENT_TYPE_EMAIL_ADDRESS = "emailAddress";
export const TEXT_CONTENT_TYPE_PASSWORD = "password";
export const TEXT_CONTENT_TYPE_NEW_PASSWORD = "newPassword";
export const TEXT_CONTENT_TYPE_ONE_TIME_CODE = "oneTimeCode";
export const AUTO_COMPLETE_USERNAME = "username";
export const AUTO_COMPLETE_EMAIL = "email";
export const AUTO_COMPLETE_PASSWORD = "password";
export const AUTO_COMPLETE_NEW_PASSWORD = "new-password";
export const AUTO_COMPLETE_SMS_OTP = "sms-otp";
export const IMPORTANT_FOR_AUTOFILL_YES = "yes";

// RMAKER USER AUTH — update outcomes (UI + provisioning callers)
export const RMAKER_USER_AUTH_UPDATE_RESULT_UPDATED = "updated";
export const RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_SERVICE =
  "skipped_no_service";
export const RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_TOKEN_PARAM =
  "skipped_no_token_param";
export const RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_REFRESH_TOKEN =
  "skipped_no_refresh_token";

/** Local-control service announced by RainMaker (classic) firmware. */
export const MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL = "_esp_local_ctrl._tcp.";
/**
 * Local-control service announced by RainMaker Neo firmware. One instance serves
 * the `rmaker_local_ctrl` endpoints; its `cap` TXT record lists which endpoint
 * sets are active (`local_ctrl` and/or `ch_resp`).
 */
export const MDNS_SERVICE_TYPE_ESP_RMAKER_LOCAL_CTRL = "_esp_rmaker_ctrl._tcp.";
/** RainMaker local-control service types, across firmware generations. */
export const MDNS_SERVICE_TYPES_RAINMAKER_LOCAL_CTRL = [
  MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
  MDNS_SERVICE_TYPE_ESP_RMAKER_LOCAL_CTRL,
] as const;
/** Service announced by unprovisioned RainMaker firmware running the on-network challenge-response flow. */
export const MDNS_SERVICE_TYPE_ESP_RMAKER_CHAL_RESP = "_esp_rmaker_chal_resp._tcp.";
/** Operational Matter service (Matter spec, "Operational Discovery"). Instance names are `<CompressedFabricId16Hex>-<MatterNodeId16Hex>`. */
export const MDNS_SERVICE_TYPE_MATTER_OPERATIONAL = "_matter._tcp.";
export const MDNS_DOMAIN_LOCAL = "local.";

// DISCOVERY EVENTS
export const DISCOVERY_UPDATE_EVENT = "DiscoveryUpdate";
export const DISCOVERY_LOST_EVENT = "DiscoveryLost";
export const MATTER_LOCAL_DISCOVERY_EVENT =
  "com.espressif.event.matterLocalDiscovery";
export const MATTER_LOCAL_DISCOVERY_LOST_EVENT =
  "com.espressif.event.matterLocalDiscoveryLost";
export const MATTER_CONTROLLER_FOUND_EVENT =
  "com.espressif.event.matterControllerFound";
export const MATTER_CONTROLLER_LOST_EVENT =
  "com.espressif.event.matterControllerLost";
export const RMAKER_EVENT_NODE_CONNECTED = "rmaker.event.node_connected";
export const RMAKER_EVENT_NODE_DISCONNECTED = "rmaker.event.node_disconnected";
export const RMAKER_EVENT_NODE_PARAMS_CHANGED =
  "rmaker.event.node_params_changed";

/** React Native config key for target Matter node ids passed to CHIP discovery. */
export const MATTER_DISCOVERY_CONFIG_KEY_NODE_IDS = "matterNodeIds";

// MDNS TXT RECORD KEYS (emitted by native discovery modules for chal-resp services)
export const MDNS_TXT_KEY_NODE_ID = "node_id";
export const MDNS_TXT_KEY_SEC_VERSION = "sec_version";
export const MDNS_TXT_KEY_POP_REQUIRED = "pop_required";
export const MDNS_TXT_KEY_CH_RESP = "ch_resp";
/** Comma-separated capability list on `_esp_rmaker_ctrl._tcp` (RMNeo). */
export const MDNS_TXT_KEY_CAP = "cap";
/** `cap` token meaning the node serves the params/config control endpoints. */
export const MDNS_TXT_CAP_LOCAL_CTRL = "local_ctrl";
/**
 * `cap` token meaning the node serves the challenge-response endpoint, i.e. it
 * is available for on-network user-node association.
 */
export const MDNS_TXT_CAP_CH_RESP = "ch_resp";

// RMAKER_LOCAL_CTRL PROTOCOL ENDPOINTS
//
// Mirrors `RMakerLocalCtrlEndpoint` in @espressif/rmneo-base-sdk. Duplicated
// here because the product layer (features/shared) may not import `@espressif/*`
// packages — see the `no-espressif-outside-sdk-layer` rule in
// .dependency-cruiser.cjs. SDK-layer code should prefer the SDK's own constants.
/** Protocomm session-security endpoint of the RMNeo shared local-control instance. */
export const RMAKER_LOCAL_CTRL_SESSION_ENDPOINT = "rmaker_local_ctrl/session";
/** Service-info endpoint; POST any payload to read `sec_ver` / `sec_patch_ver` / `cap`. */
export const RMAKER_LOCAL_CTRL_VERSION_ENDPOINT = "rmaker_local_ctrl/version";
/** Root key of the version response JSON. */
export const RMAKER_LOCAL_CTRL_VERSION_KEY = "rmaker_local_ctrl";
/**
 * `cap` token in the *version* response meaning security 1 is registered
 * without a PoP (network-provisioning capability convention).
 */
export const RMAKER_LOCAL_CTRL_CAP_NO_POP = "no_pop";

// ON-NETWORK DISCOVERY DEFAULTS
export const ON_NETWORK_DEFAULT_CH_RESP_ENDPOINT = "ch_resp";
export const ON_NETWORK_DEFAULT_SEC_VERSION = 0;
export const ON_NETWORK_HTTP_TIMEOUT_MS = 15000;
export const ON_NETWORK_DISCOVERY_DURATION_MS = 5000;
/**
 * Budget for the unauthenticated `rmaker_local_ctrl/version` probe run per
 * RMNeo hit during a scan window. Kept well under
 * {@link ON_NETWORK_DISCOVERY_DURATION_MS} so a silent device can't hold the
 * scan open.
 */
export const ON_NETWORK_VERSION_PROBE_TIMEOUT_MS = 3000;

// TOAST TYPES
export const TOAST_TYPE_SUCCESS = "success";
export const TOAST_TYPE_ERROR = "error";
export const TOAST_TYPE_WARNING = "warning";
export const TOAST_TYPE_INFO = "info";
export const TOAST_TYPE_UNKNOWN = "unknown";
export const TOAST_TYPE_UNAUTHORIZED = "unauthorized";
export const TOAST_TYPE_FORBIDDEN = "forbidden";

// GROUP TYPES
export const GROUP_TYPE_ROOM = "room";
export const GROUP_TYPE_HOME = "home";
export const GROUP_TYPE_GROUP = "group";
export const GROUP_TYPE_SUBGROUP = "subgroup";

// GROUP CONTROL — cloud group/subgroup broadcast payload (device type → control envelope)
export const GROUP_CONTROL_PAYLOAD_PARAMS_ENVELOPE_KEY = "params";

// GROUP PARAM BROADCAST RELATED CONSTANTS
export const GROUP_PARAM_BROADCAST_ENVELOPE_TOP_LEVEL_KEY = "__espcdfGroupControlBroadcast";
export const GROUP_PARAM_BROADCAST_FIELD_VALUE = "value";
export const GROUP_PARAM_BROADCAST_FIELD_TARGETS = "targets";
export const GROUP_PARAM_BROADCAST_TARGET_ROW_DEVICE_KEY = "device";
export const GROUP_PARAM_BROADCAST_TARGET_ROW_PARAM_KEY = "param";

// GROUP USER ACCESS 
export const GROUP_USER_ACCESS_PRIMARY = "primary";
export const GROUP_USER_ACCESS_SECONDARY = "secondary";
export const GROUP_USER_ACCESS_SUBGROUP = "subgroup";

// DEVICE SELECTION LIST (layout variant; not i18n)
export const DEVICE_SELECTION_LIST_VARIANT_SCENE = "scene";
export const DEVICE_SELECTION_LIST_VARIANT_SCHEDULE = "schedule";

// DEVICE SELECTION LIST — QA / test ids
export const QA_DEVICE_SELECTION_SCROLL_SCENE = "scroll_scene_devices";
export const QA_DEVICE_SELECTION_SCROLL_SCHEDULE = "scroll_schedule_devices";
export const QA_DEVICE_SELECTION_VIEW_SELECTED_DEVICES = "view_selected_devices";
export const QA_DEVICE_SELECTION_TEXT_SELECTED_DEVICES = "text_selected_devices";
export const QA_DEVICE_SELECTION_VIEW_NON_SELECTED_DEVICES = "view_non_selected_devices";
export const QA_DEVICE_SELECTION_TEXT_SELECT_DEVICES = "text_select_devices";

// DEVICE CONTROL PANEL — QA / test ids
export const QA_DEVICE_PANEL_NO_PARAMS_EMPTY_STATE =
  "empty_state_device_fallback_no_params";

// LIGHT CONTROL SCREEN
export const COLOR_TAB = "Colour";
export const WHITE_TAB = "White";

// CONTROL NAVIGATION ROUTES
export const CONTROL_SCREEN_ROUTE = "/(control)/Control";
export const DEVICE_SETTINGS_SCREEN_ROUTE = "/(control)/Settings";

// ERROR CODES
export const ERROR_CODES = {
  // Group related errors
  GROUP_ID_MISSING: "error.group.id_missing",
  GROUP_NAME_MISSING: "error.group.name_missing",
  GROUP_UPDATE_INFO_MISSING: "error.group.update_info_missing",

  // Node/Device related errors
  NODE_LIST_MISSING: "error.node.list_missing",
  NODE_ID_MISSING: "error.node.id_missing",
  NODE_UNREACHABLE: "error.node.unreachable",
  NODE_REFERENCE_INVALID: "error.node.reference_invalid",
  DEVICE_LIST_REFRESH_REQUIRED: "error.device.refresh_required",

  // Authentication related errors
  SECRET_KEY_MISSING: "error.auth.secret_key_missing",
  BASE_URL_MISSING: "error.auth.base_url_missing",

  // API related errors
  DELETE_ENDPOINT_PARAMS_MISSING: "error.api.delete_params_missing",
  EVENT_TYPE_INVALID: "error.api.invalid_event_type",

  // Time related errors
  TIMEZONE_FORMAT_INVALID: "error.time.invalid_timezone_format",
  TIME_SERVICE_UNAVAILABLE: "error.time.service_unavailable",
  TIMEZONE_PARAM_UNAVAILABLE: "error.time.timezone_param_unavailable",

  // OTA related errors
  OTA_JOB_ID_MISSING: "error.ota.job_id_missing",

  // Time Series related errors
  TS_PARAMETER_INVALID: "error.timeseries.invalid_parameter",
  TS_SIMPLE_PARAMETER_INVALID: "error.timeseries.invalid_simple_parameter",
  TS_DATA_TYPE_INVALID: "error.timeseries.invalid_data_type",
  TS_PARAMETER_MIXED_INVALID: "error.timeseries.invalid_mixed_parameter",
  TS_TIMESTAMP_MISSING: "error.timeseries.missing_timestamp",
  TS_TIME_RANGE_INVALID: "error.timeseries.invalid_time_range",
  TS_RESULT_COUNT_INVALID: "error.timeseries.invalid_result_count",
  TS_TIMESTAMP_INVALID: "error.timeseries.invalid_timestamp",
  TS_INTERVAL_INVALID: "error.timeseries.invalid_interval",
  TS_AGGREGATION_INTERVAL_INVALID:
    "error.timeseries.invalid_aggregation_interval",
  TS_AGGREGATION_INVALID: "error.timeseries.invalid_aggregation",
  TS_WEEK_START_INVALID: "error.timeseries.invalid_week_start",
  TS_DIFFERENTIAL_INVALID: "error.timeseries.invalid_differential",
  TS_RESET_ON_NEGATIVE_INVALID: "error.timeseries.invalid_reset_negative",
  TS_TIMEZONE_INVALID: "error.timeseries.invalid_timezone",
  TS_AGGREGATION_INTERVAL_MISSING:
    "error.timeseries.missing_aggregation_interval",

  // Automation related errors
  AUTOMATION_NAME_MISSING: "error.automation.name_missing",
  AUTOMATION_EVENTS_MISSING: "error.automation.events_missing",
  AUTOMATION_ACTIONS_MISSING: "error.automation.actions_missing",
  AUTOMATION_ID_MISSING: "error.automation.id_missing",
  AUTOMATION_UPDATE_DETAILS_MISSING: "error.automation.update_details_missing",

  // Geo-location related errors
  LATITUDE_MISSING: "error.geo.latitude_missing",
  LONGITUDE_MISSING: "error.geo.longitude_missing",
  GEO_COORDINATES_MISSING: "error.geo.coordinates_missing",
  GEO_COORDINATES_INVALID: "error.geo.coordinates_invalid",
} as const;

/** i18next key under `automation.errors` in locales (RMNG adaptor; feature layer translates with `t()`). */
export const AUTOMATION_RMNG_ENABLE_DISABLE_UNSUPPORTED_I18N_KEY =
  "automation.errors.rmngEnableDisableNotSupported";

// Chat Constants
export const MAX_MESSAGES_IN_MEMORY = 500;

export const ERROR_CODES_MAP = {
  USER_NOT_FOUND: 108050,
  ADDING_SELF_NOT_ALLOWED: 108046,
  GROUP_NAME_ALREADY_EXISTS_ERROR_CODE: 108007,
} as const;

// CDF EXTERNAL PROPERTIES
export const CDF_EXTERNAL_PROPERTIES = {
  IS_OAUTH_LOGIN: "isOauthLogin",
} as const;

export const ESPRM_PARAM_WRITE_PROPERTY = "write";
export const ESPRM_PARAM_READ_PROPERTY = "read";
export const ESPRM_PARAM_TIME_SERIES_PROPERTY = "time_series";
export const ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY = "simple_ts";

export const SCHEDULE_DAYS = ["M", "T", "W", "Th", "F", "S", "Su"];

export const NODE_TYPE = {
  PURE_MATTER: "pure_matter",
  RAINMAKER_MATTER: "rainmaker_matter",
};

// Matter related constants
export const DEFAULT_MATTER_DEVICE_NAME = "Matter Device";
export const MAX_MATTER_DEVICE_NAME_LENGTH = 32;
export const MATTER_METADATA_KEY = "Matter";
export const MATTER_METADATA_DEVICE_NAME_KEY = "deviceName";
export const MATTER_METADATA_DEVICE_TYPE_KEY = "deviceType";
export const MATTER_METADATA_ACCEPTED_COMMANDS_KEY = "accepted_commands";
export const MATTER_METADATA_ENDPOINTS_KEY = "endpoints";

/**
 * Custom transport slot used by `ESPMatterLocalTransport` registrations on
 * SDK nodes (`customTransportManagers[<key>]`) and surfaced on
 * `node.availableTransports[<key>]` once installed.
 *
 * The Matter SDK exposes this same value as
 * `ESPRMMatterBase.MATTER_LOCAL_TRANSPORT_KEY`; we mirror it here so layers
 * that cannot import `@espressif/*` directly (shared, features) can still
 * reference the wire constant.
 */
export const MATTER_LOCAL_TRANSPORT_KEY = "matter_local";
export const MATTER_CONTROLLER_TRANSPORT_KEY = "matter_controller";

// DEVICE REACHABILITY
export const DEVICE_REACHABILITY_SOURCE_CLOUD = "cloud";
export const DEVICE_REACHABILITY_SOURCE_LOCAL = "local";
export const DEVICE_REACHABILITY_SOURCE_BRIDGE = "bridge";
export const DEVICE_REACHABILITY_SOURCE_CONTROLLER = "controller";
export const DEVICE_REACHABILITY_SOURCE_NONE = "none";

/** Generic invoke token for one-shot command param controls. */
export const PARAM_CONTROL_INVOKE_VALUE = "invoke";
/** Placeholder when a param value is not yet resolved. */
export const PARAM_VALUE_UNKNOWN = "unknown";

// Matter QR Code constants
export const MATTER_QR_CODE_PREFIX = "MT:";
export const RM_QR_CODE_PREFIX = "NP:";
export const RM_QR_TRANSPORT_MAP = {
  'b': 'ble',
  's': 'softap',
}

// Matter Commissioning Event constants
export const MATTER_COMMISSIONING_EVENT = "MatterCommissioningEvent";
export const MATTER_EVENT_COMMISSIONING_COMPLETE = "COMMISSIONING_COMPLETE";
export const MATTER_EVENT_CONFIRM_NODE_REQUEST = "CONFIRM_NODE_REQUEST";
export const MATTER_EVENT_NODE_NOC_REQUEST = "NODE_NOC_REQUEST";
export const MATTER_EVENT_COMMISSIONING_CONFIRMATION_REQUEST =
  "COMMISSIONING_CONFIRMATION_REQUEST";
export const MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE =
  "COMMISSIONING_CONFIRMATION_RESPONSE";
export const MATTER_EVENT_COMMISSIONING_ERROR = "COMMISSIONING_ERROR";
export const MATTER_EVENT_RMNG_ATTESTATION_CHALLENGE =
  "RMNG_ATTESTATION_CHALLENGE";
export const MATTER_EVENT_RMNG_MATTER_ATTESTATION_DATA =
  "RMNG_MATTER_ATTESTATION_DATA";

/** Android GPS commissioning service intermediate complete (not terminal). */
export const MATTER_COMMISSIONING_SOURCE_GPS = "GPS_SERVICE";

/** Android HeadlessJS confirm task terminal complete. */
export const MATTER_COMMISSIONING_SOURCE_HEADLESS_JS = "HEADLESS_JS";

/**
 * AppRegistry names in `registerHeadless.ts` — must match
 * `AppConstants.TASK_ISSUE_NOC` / `TASK_CONFIRM_COMMISSION` in Android.
 */
export const HEADLESS_JS_TASK_MATTER_ISSUE_NOC = "MatterIssueNocTask";
export const HEADLESS_JS_TASK_MATTER_CONFIRM_COMMISSION =
  "MatterConfirmCommissionTask";

// HeadlessJS handled event types (bypasses postMessage to native)
export const HEADLESS_HANDLED_TYPES = [
  "COMMISSIONING_CONFIRMATION_RESPONSE",
];

// HeadlessJS Task Types
export const HEADLESS_TASK_ISSUE_NOC = "ISSUE_NOC";
export const HEADLESS_TASK_CONFIRM_COMMISSION = "CONFIRM_COMMISSION";

// Commissioning Status Values
export const STATUS_PENDING = "pending";
export const STATUS_SUCCESS = "success";

// Metadata Keys
export const METADATA_KEY_CHALLENGE = "challenge";
export const METADATA_KEY_CHALLENGE_RESPONSE = "challengeResponse";
export const METADATA_KEY_CHALLENGE_RESPONSE_SNAKE = "challenge_response";
/**
 * Canonical RainMaker flag key inside `metadata.Matter`, aligned with reference
 * Android/iOS apps and the Matter SDK (`ESPRMMatterMetadataInterface.isRainmaker`).
 */
export const METADATA_KEY_IS_RAINMAKER = "isRainmaker";
export const METADATA_KEY_RAINMAKER_NODE_ID = "rainmaker_node_id";
export const METADATA_KEY_MATTER_NODE_ID = "matterNodeId";

// HeadlessJS Error Messages
export const HEADLESS_ERROR_MISSING_TASK_DATA = "Missing required task data";
export const HEADLESS_ERROR_USER_NOT_AUTHENTICATED = "User not authenticated. Cannot issue NOC.";
export const HEADLESS_ERROR_UNKNOWN = "Unknown error";
export const HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE = "Native module method not available";
export const HEADLESS_COMMISSIONING_DESCRIPTION = "Matter node commissioning in progress";

// Matter Commissioning Status constants
export const MATTER_STATUS_PREPARING = "Preparing...";
export const MATTER_STATUS_PREPARING_FABRIC = "Preparing fabric...";
export const MATTER_STATUS_CONVERTING_FABRIC = "Converting home to Matter fabric...";
export const MATTER_STATUS_STARTING_COMMISSIONING = "Starting commissioning...";
export const MATTER_STATUS_CONFIRMING_DEVICE = "Confirming device...";
export const MATTER_STATUS_ISSUING_CERTIFICATE = "Issuing user certificate...";

// Config Scan constants
export const CONFIG_FETCH_TIMEOUT_MS = 10000;

// QR Code Scanner constants
export const QR_CODE_TYPE = "qr";
export const QR_PROVISION_CONNECT_TIMEOUT_MS = 15000;
export const QR_PROVISION_CONNECT_TIMEOUT_ERROR = "DEVICE_CONNECTION_TIMEOUT";
/**
 * Max wait for each post-connect provisioning step (version info,
 * capabilities, PoP, session init). A hung native call otherwise leaves the
 * scan screen spinning forever with all controls disabled.
 */
export const QR_PROVISION_STEP_TIMEOUT_MS = 10000;
/**
 * Max wait for tearing down a device left connected by a previous scan before
 * starting a new connection to the same peripheral.
 */
export const QR_PROVISION_DISCONNECT_TIMEOUT_MS = 3000;
/**
 * Attempts for creating the provisioning device. The native create runs a BLE
 * scan for the device's advertisement; a device that was just disconnected can
 * miss the first scan window, so allow one retry.
 */
export const QR_PROVISION_CREATE_ATTEMPTS = 2;

/**
 * Overall app budget for node-online wait + MQTT reconnect retries during
 * "Setting up the Node" (1 minute). Enforced in the adaptor because the SDK
 * timeout may never start if `connectMQTT` / subscribe hangs first.
 */
export const PROVISION_WAIT_FOR_ONLINE_TIMEOUT_MS = 60_000;
/**
 * How many times to run `waitForNodeOnline` (with MQTT reconnect between
 * failures) before surfacing a provision error.
 */
export const PROVISION_WAIT_FOR_ONLINE_MAX_ATTEMPTS = 5;
/**
 * Per-attempt online wait inside the overall 1-minute budget
 */
export const PROVISION_WAIT_FOR_ONLINE_ATTEMPT_TIMEOUT_MS = 10_000;
/**
 * Brief pause after a forced MQTT reconnect before the next online wait.
 */
export const PROVISION_WAIT_FOR_ONLINE_RETRY_DELAY_MS = 2_000;
/**
 * Technical progress `description` values emitted during RMNeo post-provision
 * setup (wait-for-online / MQTT reconnect / timezone). Mapped to i18n in the
 * provision UI — do not show these strings raw to the user.
 */
export const PROVISION_SETUP_PROGRESS_MESSAGES = {
  CHECKING_NODE_ONLINE: "Checking node online status",
  TRYING_RECONNECT: "Trying reconnect",
  UPDATING_NODE_TIMEZONE: "Updating node timezone",
  COMPLETE: "Complete",
} as const;
/**
 * Stable error tag thrown when RMNeo node-online wait (+ retries) times out.
 * Mapped to i18n in the provision UI — do not show this string raw.
 */
export const PROVISION_NODE_ONLINE_TIMEOUT_ERROR =
  "PROVISION_NODE_ONLINE_TIMEOUT";
/**
 * SDK `ProvErrorCodes.NODE_ONLINE_TIMEOUT` string (when the SDK timer does fire).
 */
export const SDK_NODE_ONLINE_TIMEOUT_ERROR = "NODE_ONLINE_TIMEOUT";
/**
 * SDK `ProvErrorCodes.NO_PROVISION_STATE_TO_RESUME` — a Wi-Fi retry was asked
 * for with no completed association to resume from.
 */
export const SDK_NO_PROVISION_STATE_TO_RESUME_ERROR =
  "NO_PROVISION_STATE_TO_RESUME";
export const CAMERA_TYPE_FRONT = "front";
export const CAMERA_TYPE_BACK = "back";

// Constants for challenge-response communication
export const ESP_CHALLENGE_RESPONSE_CONSTANTS = {
  // Device communication endpoints (only challenge-response needed)
  CH_RESP_ENDPOINT: "ch_resp",
  // Challenge-response capability
  CHALLENGE_RESPONSE_CAPABILITY: "ch_resp",
};
export const TRANSPORT_BLE = "TRANSPORT_BLE";
export const BLE = "BLE";

// Constants for polling
export const POLLING = {
  MAX_ATTEMPTS: 5,
  INTERVAL_MS: 2000,
  ENABLE_LOGGING: true,
  DEFAULT_LABEL: "Polling",
  NODE_CONFIG_LABEL: "Node config",
};
// WebRTC Connection State constants
export const WEBRTC_CONNECTION_STATE = {
  CONNECTED: "connected",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected",
  CLOSED: "closed",
  FAILED: "failed",
} as const;

// WebRTC Signaling Client Event Names
export const WEBRTC_SIGNALING_EVENTS = {
  OPEN: "open",
  SDP_ANSWER: "sdpAnswer",
  ICE_CANDIDATE: "iceCandidate",
  CLOSE: "close",
  ERROR: "error",
} as const;

// WebRTC Translation Keys
export const WEBRTC_TRANSLATION_KEYS = {
  ERROR_HEADER: "layout.shared.errorHeader",
  CONNECTION_FAILED: "device.camera.errors.connectionFailed",
} as const;

// WebRTC Default Messages
export const WEBRTC_DEFAULT_MESSAGES = {
  ERROR: "Error",
  CONNECTION_FAILED: "Connection failed",
} as const;

// WebRTC Media constants
export const WEBRTC_MEDIA_KIND_VIDEO = "video";
export const WEBRTC_MEDIA_KIND_AUDIO = "audio";
export const WEBRTC_TRANSCEIVER_DIRECTION_RECVONLY = "recvonly";
export const WEBRTC_TRANSCEIVER_DIRECTION_SENDRECV = "sendrecv";
/** Auto-hide delay (ms) for the in-video media controls overlay after a tap. */
export const CAMERA_CONTROLS_AUTO_HIDE_MS = 3000;
/** Delay (ms) before re-applying loudspeaker routing after WebRTC audio connects (iOS). */
export const WEBRTC_LOUDSPEAKER_ROUTE_DELAY_MS = 500;
/**
 * Max wait (ms) for a local-control SDP answer before falling back to cloud KVS signaling.
 * Covers the full local handshake: secure session connect + mic getUserMedia +
 * fragmented offer send (several round-trips) + answer poll.
 */
export const WEBRTC_LOCAL_FALLBACK_TIMEOUT_MS = 15000;

// Local-control WebRTC signaling (esp_local_ctrl) constants
export const ESPRM_WEBRTC_SIGNAL_ENDPOINT = "webrtc_signal";
export const WEBRTC_LOCAL_POLL_INTERVAL_FAST_MS = 100;
export const WEBRTC_LOCAL_POLL_INTERVAL_SLOW_MS = 200;
export const WEBRTC_LOCAL_POLL_TIMEOUT_MS = 30000;
export const WEBRTC_LOCAL_MAX_POLL_FAILURES = 5;
/**
 * Peer-id prefix MUST start with `local-`: the firmware keys on it to route the
 * SDP answer back over the local-control channel (vs the cloud KVS channel).
 * The CLI uses `local-cli-`; we use `local-app-`.
 */
export const WEBRTC_LOCAL_PEER_ID_PREFIX = "local-app-";

// AGENT CHAT WEBSOCKET
export const AGENT_WS_MESSAGE_TYPE_USER = "user";
export const AGENT_WS_MESSAGE_TYPE_ASSISTANT = "assistant";
export const AGENT_WS_MESSAGE_TYPE_ASSISTANT_DELTA = "assistant_delta";
export const AGENT_WS_MESSAGE_TYPE_THINKING = "thinking";
export const AGENT_WS_MESSAGE_TYPE_THINKING_DELTA = "thinking_delta";
export const AGENT_WS_MESSAGE_TYPE_TOOL_CALL_INFO = "tool_call_info";
export const AGENT_WS_MESSAGE_TYPE_TOOL_RESULT_INFO = "tool_result_info";
export const AGENT_WS_MESSAGE_TYPE_TRANSACTION_END = "transaction_end";
export const AGENT_WS_MESSAGE_TYPE_HANDSHAKE_ACK = "handshake_ack";
export const AGENT_WS_MESSAGE_TYPE_HANDSHAKE = "handshake";
export const AGENT_WS_MESSAGE_TYPE_USAGE_INFO = "usage_info";
export const AGENT_WS_MESSAGE_TYPE_TIMEOUT = "timeout";
export const AGENT_WS_MESSAGE_TYPE_SYSTEM = "system";
export const AGENT_WS_CONTENT_TYPE_TEXT = "text";
export const AGENT_WS_CONTENT_TYPE_JSON = "json";
export const AGENT_WS_CONTENT_TYPE_MULTIMODAL = "multimodal";
export const AGENT_CHAT_MESSAGE_TYPE_THINKING = "thinking";
export const AGENT_CHAT_MESSAGE_TYPE_THINKING_INDICATOR = "thinking_indicator";
export const AGENT_CHAT_THINKING_INDICATOR_MESSAGE_ID = "__thinking-indicator__";
export const AGENT_CHAT_MESSAGE_TYPE_TOOL = "tool";
export const AGENT_CHAT_MESSAGE_TYPE_SYSTEM = "system";
export const AGENT_CHAT_MESSAGE_TYPE_ASSISTANT = "assistant";
export const AGENT_CHAT_TOOL_PREFIX_EXECUTING = "Executing tool";
export const AGENT_CHAT_TOOL_PREFIX_RESULT = "Tool result";
export const AGENT_CHAT_THINKING_PREFIX = "Thinking:";
export const AGENT_CHAT_THINKING_INDICATOR_DELAY_MS = 1000;
export const AGENT_MEDIA_TYPE_IMAGE = "image";
export const AGENT_MEDIA_TYPE_VIDEO = "video";
export const AGENT_MEDIA_TYPE_DOCUMENT = "document";
export const AGENT_CHAT_MESSAGE_ROLE_USER = "user";
export const AGENT_CHAT_MESSAGE_ROLE_ASSISTANT = "assistant";
export const HTTP_METHOD_PUT = "PUT";
export const IMAGE_MIME_TYPE_JPEG = "image/jpeg";
export const IMAGE_MIME_TYPE_PNG = "image/png";
export const IMAGE_MIME_TYPE_WEBP = "image/webp";
export const IMAGE_MIME_TYPE_GIF = "image/gif";

// GALLERY / FILE LIST (CDF getFiles + media classification)
/** RainMaker file list entity type for node-scoped files. */
export const GALLERY_FILE_ENTITY_TYPE_NODE = "node";
/** Classified media kind: image. */
export const GALLERY_MEDIA_TYPE_IMAGE = "image";
/** Classified media kind: video. */
export const GALLERY_MEDIA_TYPE_VIDEO = "video";
/** Classified media kind: neither image nor video. */
export const GALLERY_MEDIA_TYPE_OTHER = "other";
/** Grid filter that shows every media kind. */
export const GALLERY_FILTER_ALL = "all";
/** Filename prefix used by firmware for still snapshots. */
export const GALLERY_NAME_PREFIX_SNAPSHOT = "snapshot";
/** Filename prefix used by firmware for video clips. */
export const GALLERY_NAME_PREFIX_CLIP = "clip";
/** Extensions treated as images when MIME type is missing. */
export const GALLERY_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
] as const;
/** Extensions treated as videos when MIME type is missing. */
export const GALLERY_VIDEO_EXTENSIONS = [
  "mp4",
  "mkv",
  "webm",
  "mov",
  "m4v",
] as const;

// CAMERA CMD-RESP (jpeg-capture / snapshot upload)
/** Framework command id (0x1001) carried by every cmd-resp request. */
export const CAMERA_SNAPSHOT_COMMAND_ID = 4097;
/** Device-side response timeout (seconds) the cmd-resp framework waits for. */
export const NODE_CMD_DEFAULT_TIMEOUT = 1000;
/** Camera command name understood by the firmware. */
export const CAMERA_CMD_JPEG_CAPTURE = "jpeg-capture";
/** `jpeg-capture` arg that tells the device to upload the snapshot to RainMaker storage. */
export const CAMERA_CMD_ARG_UPLOAD = "--upload";
/** `jpeg-capture` arg flag selecting JPEG quality (1-100); lower = smaller file. */
export const CAMERA_CMD_ARG_QUALITY = "--quality";
/** `jpeg-capture` arg flag selecting capture resolution as `[width, height]`. */
export const CAMERA_CMD_ARG_RES = "--res";
/**
 * `jpeg-capture` arg flag carrying the agent id. Together with `--conv-id` it
 * lets the firmware target the agent `media/upload-url` endpoint.
 */
export const CAMERA_CMD_ARG_AGENT_ID = "--agent-id";
/**
 * `jpeg-capture` arg flag carrying the agent conversation id. The firmware
 * uploads the snapshot into this conversation via the agent media upload flow.
 */
export const CAMERA_CMD_ARG_CONV_ID = "--conv-id";
/**
 * Capture quality (JPEG, 1-100) used for cloud snapshots. Kept low to shrink the
 * file so device upload + phone download/re-upload stay fast.
 */
export const CAMERA_CAPTURE_QUALITY = "30";
/** Capture resolution (`[width, height]`) used for cloud snapshots. 720p. */
export const CAMERA_CAPTURE_RESOLUTION: [number, number] = [1280, 720];
/** Status-polling interval for an in-flight cmd-resp request. */
export const NODE_CMD_POLL_INTERVAL_MS = 2000;
/** Max poll attempts before treating cmd-resp as timed out client-side. */
export const NODE_CMD_POLL_MAX_ATTEMPTS = 15;
/** `pollUntilReady` label for camera snapshot cmd-resp status waits. */
export const NODE_CMD_POLL_LABEL_SNAPSHOT = "camera snapshot cmd-resp";
/** Terminal cmd-resp status: success. */
export const NODE_CMD_STATUS_SUCCESS = "success";
/** Terminal cmd-resp status: failure. */
export const NODE_CMD_STATUS_FAILURE = "failure";
/** Terminal cmd-resp status: timed out. */
export const NODE_CMD_STATUS_TIMED_OUT = "timed_out";
/** Threshold (bytes) above which a snapshot size is shown in MB rather than KB. */
export const SNAPSHOT_SIZE_MB_THRESHOLD = 1024 * 1024;

// MATTER DATA VALUE TYPES (Apple MTRDataValueDictionary / CHIP TLV wire shape)
export const MATTER_DATA_VALUE_TYPE_NULL = "Null";
export const MATTER_DATA_VALUE_TYPE_BOOLEAN = "Boolean";
export const MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER = "UnsignedInteger";
export const MATTER_DATA_VALUE_TYPE_SIGNED_INTEGER = "SignedInteger";
export const MATTER_DATA_VALUE_TYPE_FLOAT = "Float";
export const MATTER_DATA_VALUE_TYPE_DOUBLE = "Double";
export const MATTER_DATA_VALUE_TYPE_UTF8_STRING = "UTF8String";
export const MATTER_DATA_VALUE_TYPE_OCTET_STRING = "OctetString";
export const MATTER_DATA_VALUE_TYPE_STRUCTURE = "Structure";
export const MATTER_DATA_VALUE_TYPE_ARRAY = "Array";

// LANGUAGE / i18n
/** Supported locale (ISO 639-1) for English bundle. */
export const LANGUAGE_CODE_EN = "en";
/** Supported locale (ISO 639-1) for Simplified Chinese bundle. */
export const LANGUAGE_CODE_ZH = "zh";
/** Sentinel value used in persisted storage / UI to mean "follow device language". */
export const LANGUAGE_CODE_SYSTEM = "system";
/** Fallback when device locale does not match any supported bundle. */
export const LANGUAGE_DEFAULT = LANGUAGE_CODE_EN;
/** AsyncStorage key for the user-selected language override. */
export const LANGUAGE_STORAGE_KEY = "@app/language";

/** ISO codes shipped as full translation bundles (must match `i18n.ts` resources). */
export const SUPPORTED_LANGUAGE_CODES = [
  LANGUAGE_CODE_EN,
  LANGUAGE_CODE_ZH,
] as const;
export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

/**
 * Maps regional / script-tagged BCP-47 codes (e.g. `zh-CN`, `zh-Hans`, `en-US`) to one of the
 * `SUPPORTED_LANGUAGE_CODES`. Anything not listed falls back to `LANGUAGE_DEFAULT`.
 */
export const LANGUAGE_REGIONAL_MAP: Record<string, SupportedLanguageCode> = {
  en: LANGUAGE_CODE_EN,
  "en-US": LANGUAGE_CODE_EN,
  "en-GB": LANGUAGE_CODE_EN,
  zh: LANGUAGE_CODE_ZH,
  "zh-CN": LANGUAGE_CODE_ZH,
  "zh-Hans": LANGUAGE_CODE_ZH,
  "zh-Hans-CN": LANGUAGE_CODE_ZH,
  "zh-SG": LANGUAGE_CODE_ZH,
  "zh-Hant": LANGUAGE_CODE_ZH,
  "zh-TW": LANGUAGE_CODE_ZH,
  "zh-HK": LANGUAGE_CODE_ZH,
};
// AUTOMATION CARD CONDITION TAG SYMBOLS (display-only; picker/create flows keep their own labels)
/** Display symbol for equal condition on the automation card When tag. */
export const AUTOMATION_CONDITION_SYMBOL_EQUAL = "=";
/** Display symbol for not-equal condition on the automation card When tag. */
export const AUTOMATION_CONDITION_SYMBOL_NOT_EQUAL = "!=";
/** Display symbol for greater-than condition on the automation card When tag. */
export const AUTOMATION_CONDITION_SYMBOL_GREATER_THAN = ">";
/** Display symbol for less-than condition on the automation card When tag. */
export const AUTOMATION_CONDITION_SYMBOL_LESS_THAN = "<";
/** Display symbol for greater-than-or-equal condition on the automation card When tag. */
export const AUTOMATION_CONDITION_SYMBOL_GREATER_THAN_OR_EQUAL = ">=";
/** Display symbol for less-than-or-equal condition on the automation card When tag. */
export const AUTOMATION_CONDITION_SYMBOL_LESS_THAN_OR_EQUAL = "<=";

/** RMNG+Matter compressed endpoint topology keys (`endpoint.c.s.<cluster>.c|a.<id>`). */
export const MATTER_TOPOLOGY_KEY_C = "c";
export const MATTER_TOPOLOGY_KEY_S = "s";
export const MATTER_TOPOLOGY_KEY_A = "a";

/** Fieldless On/Off command TLV (empty Structure). */
export const MATTER_EMPTY_STRUCTURE_TLV_HEX = "0x1518";

/** Default Matter attribute id (hex) when a param's `_matterPath` omits one. */
export const MATTER_DEFAULT_ATTRIBUTE_HEX = "0x0";

/** CDF / Matter light param names used in schedule encode/decode. */
export const MATTER_PARAM_NAME_POWER = "Power";
export const MATTER_PARAM_NAME_BRIGHTNESS = "Brightness";
export const MATTER_PARAM_NAME_CCT = "CCT";
export const MATTER_PARAM_NAME_COLOR_TEMPERATURE = "ColorTemperature";
export const MATTER_PARAM_NAME_HUE = "Hue";
export const MATTER_PARAM_NAME_SATURATION = "Saturation";
