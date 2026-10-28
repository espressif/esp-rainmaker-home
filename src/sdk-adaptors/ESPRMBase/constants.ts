/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export { ESPRMBaseAdaptorIdentifier } from "@config/sdk.identifiers";

// SUPPORTED PARAM TYPES
export const ESPRM_POWER_PARAM_TYPE = "esp.param.power";
export const ESPRM_BRIGHTNESS_PARAM_TYPE = "esp.param.brightness";
export const ESPRM_CCT_PARAM_TYPE = "esp.param.cct";
export const ESPRM_HUE_PARAM_TYPE = "esp.param.hue";
export const ESPRM_SATURATION_PARAM_TYPE = "esp.param.saturation";
export const ESPRM_TEMPERATURE_PARAM_TYPE = "esp.param.temperature";
export const ESPRM_FACTORY_RESET_PARAM_TYPE = "esp.param.factory-reset";
export const ESPRM_REBOOT_PARAM_TYPE = "esp.param.reboot";
export const ESPRM_WIFI_RESET_PARAM_TYPE = "esp.param.wifi-reset";
export const ESPRM_SPEED_PARAM_TYPE = "esp.param.speed";
export const ESPRM_DIRECTION_PARAM_TYPE = "esp.param.direction";
export const ESPRM_REFRESH_TOKEN_PARAM_TYPE = "esp.param.refresh-token";
export const ESPRM_USER_TOKEN_PARAM_TYPE = "esp.param.user-token";
export const ESPRM_BASE_URL_PARAM_TYPE = "esp.param.base-url";

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

// SUPPORTED SERVICES
export const ESPRM_SYSTEM_SERVICE = "esp.service.system";
export const ESPRM_SCENES_SERVICE = "esp.service.scenes";
export const ESPRM_SCHEDULES_SERVICE = "esp.service.schedule";
export const ESPRM_AGENT_AUTH_SERVICE = "esp.service.agent-auth";
export const ESPRM_RMAKER_USER_AUTH_SERVICE = "esp.service.rmaker-user-auth";

// SUPPORTED SERVICE PARAM TYPES
export const ESPRM_PARAM_SCENES = "esp.param.scenes";
export const ESPRM_PARAM_SCHEDULES = "esp.param.schedules";

// SUPPORTED PARAM PROPERTIES
export const ESPRM_PARAM_WRITE_PROPERTY = "write";
export const ESPRM_PARAM_READ_PROPERTY = "read";
export const ESPRM_PARAM_TIME_SERIES_PROPERTY = "time_series";
export const ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY = "simple_ts";
