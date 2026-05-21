/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// SUPPORTED PARAM TYPES
export const ESPRMNG_NAME_PARAM_TYPE = "esp.param.name";
export const ESPRMNG_POWER_PARAM_TYPE = "esp.param.power";
export const ESPRMNG_BRIGHTNESS_PARAM_TYPE = "esp.param.brightness";
export const ESPRMNG_CCT_PARAM_TYPE = "esp.param.cct";
export const ESPRMNG_HUE_PARAM_TYPE = "esp.param.hue";
export const ESPRMNG_SATURATION_PARAM_TYPE = "esp.param.saturation";
export const ESPRMNG_TEMPERATURE_PARAM_TYPE = "esp.param.temperature";
export const ESPRMNG_FACTORY_RESET_PARAM_TYPE = "esp.param.factory-reset";
export const ESPRMNG_REBOOT_PARAM_TYPE = "esp.param.reboot";
export const ESPRMNG_WIFI_RESET_PARAM_TYPE = "esp.param.wifi-reset";
export const ESPRMNG_SPEED_PARAM_TYPE = "esp.param.speed";
export const ESPRMNG_DIRECTION_PARAM_TYPE = "esp.param.direction";
export const ESPRMNG_REFRESH_TOKEN_PARAM_TYPE = "esp.param.refresh-token";
export const ESPRMNG_USER_TOKEN_PARAM_TYPE = "esp.param.user-token";
export const ESPRMNG_BASE_URL_PARAM_TYPE = "esp.param.base-url";

// SUPPORTED PARAM UI TYPES
export const ESPRMNG_UI_TEXT_PARAM_TYPE = "esp.ui.text";
export const ESPRMNG_UI_TOGGLE_PARAM_TYPE = "esp.ui.toggle";
export const ESPRMNG_UI_SLIDER_PARAM_TYPE = "esp.ui.slider";
export const ESPRMNG_UI_HUE_SLIDER_PARAM_TYPE = "esp.ui.hue-slider";
export const ESPRMNG_UI_HUE_CIRCLE_PARAM_TYPE = "esp.ui.hue-circle";
export const ESPRMNG_UI_PUSH_BUTTON_PARAM_TYPE = "esp.ui.push-btn-big";
export const ESPRMNG_UI_DROPDOWN_PARAM_TYPE = "esp.ui.dropdown";
export const ESPRMNG_UI_HIDDEN_PARAM_TYPE = "esp.ui.hidden";
export const ESPRMNG_UI_TRIGGER_PARAM_TYPE = "esp.ui.trigger";

// SUPPORTED SERVICES
export const ESPRMNG_SYSTEM_SERVICE = "esp.service.system";
export const ESPRMNG_SCENES_SERVICE = "esp.service.scenes";
export const ESPRMNG_SCHEDULES_SERVICE = "esp.service.schedule";
export const ESPRMNG_AGENT_AUTH_SERVICE = "esp.service.agent-auth";
export const ESPRMNG_RMAKER_USER_AUTH_SERVICE = "esp.service.rmaker-user-auth";

// SUPPORTED SERVICE PARAM TYPES
export const ESPRMNG_PARAM_SCENES = "esp.param.scenes";
export const ESPRMNG_PARAM_SCHEDULES = "esp.param.schedules";

// SUPPORTED PARAM PROPERTIES
export const ESPRMNG_PARAM_WRITE_PROPERTY = "write";
export const ESPRMNG_PARAM_READ_PROPERTY = "read";
export const ESPRMNG_PARAM_TIME_SERIES_PROPERTY = "time_series";
export const ESPRMNG_PARAM_SIMPLE_TIME_SERIES_PROPERTY = "simple_ts";

// Matter metadata (node-level; device name for Matter-commissioned nodes)
export const MATTER_METADATA_KEY = "Matter";
export const MATTER_METADATA_DEVICE_NAME_KEY = "deviceName";

// RMNG GET /v1/groups/{groupId}/users — `access_type` on each listed member
export const ESPRMNG_GROUP_USER_ACCESS_PRIMARY = "primary";
export const ESPRMNG_GROUP_USER_ACCESS_SECONDARY = "secondary";
export const ESPRMNG_GROUP_USER_ACCESS_SUBGROUP = "subgroup";

// Parent home group: secondary users are `access_type` secondary.
export const ESPRMNG_GROUP_SHARING_SCOPE_PARENT = "parent_group";
// Nested room group: secondary users are subgroup-scoped members from parent list.
export const ESPRMNG_GROUP_SHARING_SCOPE_SUBGROUP_ROOM = "subgroup_room";
