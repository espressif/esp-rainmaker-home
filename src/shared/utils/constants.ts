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
export const DEFAULT_HOME_GROUP_NAME = "Home";
export const HOME_NAME_MAX_LENGTH = 32;

// LINKS — region-scoped values come from the committed region env files
// (.env.global.example / .env.cn.example → extra.regionConfigs.<region>.websiteLinks); the
// hard-coded defaults below are the last-resort fallback for blank values.
const DEFAULT_WEBSITE_LINK = "https://rainmaker.espressif.com";

// Legal pages exist per language × region
// (rainmaker.espressif.com/<en|zh>/<page>?region=<global|china>), so the
// region env files carry the URLs as templates with a {lang} placeholder
// filled with the active UI language at resolve time. A plain URL (no
// placeholder) is used verbatim for every language.
const LEGAL_LINK_LANG_PLACEHOLDER = "{lang}";
const DEFAULT_TERMS_OF_USE_LINK_TEMPLATE =
  "https://rainmaker.espressif.com/{lang}/terms-of-use?region=global";
const DEFAULT_PRIVACY_POLICY_LINK_TEMPLATE =
  "https://rainmaker.espressif.com/{lang}/privacy-policy?region=global";

// Resolved once at module load; the active region is session-stable
// (region.config.ts caches it), so this agrees with every call-time reader.
const websiteLinks = getRegionConfig().websiteLinks;

export const WEBSITE_LINK =
  websiteLinks.website?.trim() || DEFAULT_WEBSITE_LINK;

/**
 * Fills a legal-link template's `{lang}` placeholder with the supported UI
 * language for the given tag — regional tags map to their base (`zh-CN` →
 * `zh`), anything unsupported falls back to English. Do not call at module
 * scope: the language constants it reads are declared later in this file.
 */
const resolveLegalLink = (template: string, language?: string): string => {
  const base = (language || "").toLowerCase().split("-")[0];
  const lang = (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(base)
    ? base
    : LANGUAGE_DEFAULT;
  return template.split(LEGAL_LINK_LANG_PLACEHOLDER).join(lang);
};

/**
 * Terms of use URL for the given UI language (callers pass `i18n.language`).
 * Takes the active region's configured link and substitutes its `{lang}`
 * placeholder with the UI language; a plain URL (no placeholder) applies to
 * all languages.
 * @param language Optional UI language tag (e.g. `en`, `zh-CN`).
 * @returns The resolved terms of use URL.
 */
export const getTermsOfUseLink = (language?: string): string =>
  resolveLegalLink(
    websiteLinks.termsOfUse?.trim() || DEFAULT_TERMS_OF_USE_LINK_TEMPLATE,
    language
  );

/**
 * Privacy policy URL for the given UI language (callers pass `i18n.language`).
 * Takes the active region's configured link template and substitutes its
 * `{lang}` placeholder with the UI language; a plain URL (no placeholder)
 * applies to all languages.
 * @param language Optional UI language tag (e.g. `en`, `zh-CN`).
 * @returns The resolved privacy policy URL.
 */
export const getPrivacyPolicyLink = (language?: string): string =>
  resolveLegalLink(
    websiteLinks.privacyPolicy?.trim() || DEFAULT_PRIVACY_POLICY_LINK_TEMPLATE,
    language
  );

// STORAGE KEYS
// Persisted flag recording that the user accepted the CN-region privacy
// consent shown at first launch. Stored via the AsyncStorage adapter.
export const CN_CONSENT_ACCEPTED_KEY = "@esp_cn_consent_accepted";
export const CONSENT_ACCEPTED_VALUE = "true";

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
export const ESPRM_LIGHT_MODE_PARAM_TYPE = "esp.param.light-mode";
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

// RMAKER USER AUTH — update outcomes (UI + provisioning callers)
export const RMAKER_USER_AUTH_UPDATE_RESULT_UPDATED = "updated";
export const RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_SERVICE =
  "skipped_no_service";
export const RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_TOKEN_PARAM =
  "skipped_no_token_param";
export const RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_REFRESH_TOKEN =
  "skipped_no_refresh_token";

export const MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL = "_esp_local_ctrl._tcp.";
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

// ON-NETWORK DISCOVERY DEFAULTS
export const ON_NETWORK_DEFAULT_CH_RESP_ENDPOINT = "ch_resp";
export const ON_NETWORK_DEFAULT_SEC_VERSION = 0;
export const ON_NETWORK_HTTP_TIMEOUT_MS = 15000;
export const ON_NETWORK_DISCOVERY_DURATION_MS = 5000;

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
  USER_NOT_FOUND: "108052",
  ADDING_SELF_NOT_ALLOWED: "108046",
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
// TIME SERIES CONSTANTS
export const TIME_SERIES_PERIODS = ["1H", "1D", "7D", "4W", "1Y"] as const;

// Time Series Period Values
export const TIME_SERIES_PERIOD_1H = "1H";
export const TIME_SERIES_PERIOD_1D = "1D";
export const TIME_SERIES_PERIOD_7D = "7D";
export const TIME_SERIES_PERIOD_4W = "4W";
export const TIME_SERIES_PERIOD_1Y = "1Y";

// Aggregation Values
export const AGGREGATION_RAW = "raw";
export const AGGREGATION_AVG = "avg";
export const AGGREGATION_MIN = "min";
export const AGGREGATION_MAX = "max";
export const AGGREGATION_COUNT = "count";
export const AGGREGATION_LATEST = "latest";

export const TIME_SERIES_AGGREGATIONS = [AGGREGATION_RAW, AGGREGATION_AVG, AGGREGATION_MIN, AGGREGATION_MAX, AGGREGATION_COUNT, AGGREGATION_LATEST] as const;

// Chart Types
export const CHART_TYPE_AREA = "area";
export const CHART_TYPE_BAR = "bar";
export const CHART_TYPE_LINE = "line";

// TIME SERIES DISPLAY TEXT
export const TIME_SERIES_LABELS = {
  LAST_HOUR: "Last Hour",
  TODAY: "Today",
  LAST_7_DAYS: "Last 7 Days",
  LAST_4_WEEKS: "Last 4 Weeks",
  LAST_YEAR: "Last Year",
  CURRENT_PERIOD: "Current Period"
} as const;


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
export const WEBRTC_TRANSCEIVER_DIRECTION_RECVONLY = "recvonly";

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
