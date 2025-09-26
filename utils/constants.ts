/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// CONSTANTS
export const TOAST_ANIMATION_DURATION = "200ms";

// PLATFORMS
export const PLATFORM_IOS = "ios";
export const PLATFORM_ANDROID = "android";

export const DEFAULT_HOME_GROUP_NAME = "Home";

// LINKS
export const WEBSITE_LINK = "https://rainmaker.espressif.com";
export const TERMS_OF_USE_LINK =
  "https://rainmaker.espressif.com/docs/terms-of-use.html";
export const PRIVACY_POLICY_LINK =
  "https://rainmaker.espressif.com/docs/privacy-policy.html";

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
export const ESPRM_FACTORY_RESET_PARAM_TYPE = "esp.param.factory-reset";
export const ESPRM_SPEED_PARAM_TYPE = "esp.param.speed";
export const ESPRM_DIRECTION_PARAM_TYPE = "esp.param.direction";

// SUPPORTED PARAM UI TYPES
export const ESPRM_UI_TEXT_PARAM_TYPE = "esp.ui.text";
export const ESPRM_UI_TOGGLE_PARAM_TYPE = "esp.ui.toggle";
export const ESPRM_UI_SLIDER_PARAM_TYPE = "esp.ui.slider";
export const ESPRM_UI_HUE_SLIDER_PARAM_TYPE = "esp.ui.hue-slider";
export const ESPRM_UI_HUE_CIRCLE_PARAM_TYPE = "esp.ui.hue-circle";
export const ESPRM_UI_PUSH_BUTTON_PARAM_TYPE = "esp.ui.push-btn-big";
export const ESPRM_UI_DROPDOWN_PARAM_TYPE = "esp.ui.dropdown";
export const ESPRM_UI_HIDDEN_PARAM_TYPE = "esp.ui.hidden";
export const ESPRM_UI_TRIGGER_PARAM_TYPE = "esp.ui.trigger";

// SUPPORTED PARAM PROPERTIES
export const WRITE_PERMISSION = "write";
export const READ_PERMISSION = "read";

// CODE REDIRECT TYPES
export const SIGNUP_CODE_TYPE = "SIGNUP";
export const RESET_PASSWORD_CODE_TYPE = "RESET_PASSWORD";

// SUPPORTED SERVICES
export const ESPRM_SYSTEM_SERVICE = "esp.service.system";
export const ESPRM_SCENES_SERVICE = "esp.service.scenes";
export const ESPRM_SCHEDULES_SERVICE = "esp.service.schedule";

// DISCOVERY EVENTS
export const DISCOVERY_UPDATE_EVENT = "DiscoveryUpdate";

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

// LIGHT CONTROL SCREEN
export const COLOR_TAB = "Colour";
export const WHITE_TAB = "White";

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

export const ERROR_CODES_MAP = {
  USER_NOT_FOUND: "108052",
  ADDING_SELF_NOT_ALLOWED: "108046",
} as const;

// CDF EXTERNAL PROPERTIES
export const CDF_EXTERNAL_PROPERTIES = {
  IS_OAUTH_LOGIN: "isOauthLogin",
} as const;

export const ESPRM_PARAM_WRITE_PROPERTY = "write";
export const SCHEDULE_DAYS = ["M", "T", "W", "Th", "F", "S", "Su"];
