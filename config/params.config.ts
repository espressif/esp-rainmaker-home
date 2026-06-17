/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import BrightnessSlider from "@shared/components/ParamControls/BrightnessSlider";
import ColorTemperatureSlider from "@shared/components/ParamControls/ColorTemperatureSlider";
import HueSlider from "@shared/components/ParamControls/HueSlider";
import SaturationSlider from "@shared/components/ParamControls/SaturationSlider";
import ToggleSwitch from "@shared/components/ParamControls/ToggleSwitch";
import Slider from "@shared/components/ParamControls/Slider";
import HueCircle from "@shared/components/ParamControls/HueCircle";
import PushButton from "@shared/components/ParamControls/PushButton";
import DropdownSelector from "@shared/components/ParamControls/DropdownSelector";
import TriggerButton from "@shared/components/ParamControls/TriggerButton";
import TextInput from "@shared/components/ParamControls/TextInput";
import Temperature from "@shared/components/ParamControls/Temperature";
import StatusReadout from "@shared/components/ParamControls/StatusReadout";
import ControlBoard from "@shared/components/ParamControls/ControlBoard";
import LockControl from "@shared/components/ParamControls/LockControl";
import ActionButton from "@shared/components/ParamControls/ActionButton";

import {
  MATTER_SERVER_PARAM_TYPE_COLOR_CONTROL,
  MATTER_SERVER_PARAM_TYPE_DOOR_LOCK,
  MATTER_SERVER_PARAM_TYPE_LEVEL_CONTROL,
  MATTER_SERVER_PARAM_TYPE_ON_OFF,
  MATTER_SERVER_PARAM_TYPE_POWER_SOURCE,
  MATTER_SERVER_PARAM_TYPE_RVC_CLEAN_MODE,
  MATTER_SERVER_PARAM_TYPE_RVC_RUN_MODE,
} from "@config/matter.constants";
import {
  DATA_TYPE_ALL,
  DATA_TYPE_BOOL,
  DATA_TYPE_INT,
  DATA_TYPE_FLOAT,
  DATA_TYPE_STRING,
  ESPRM_BRIGHTNESS_PARAM_TYPE,
  ESPRM_CCT_PARAM_TYPE,
  ESPRM_HUE_PARAM_TYPE,
  ESPRM_POWER_PARAM_TYPE,
  ESPRM_SATURATION_PARAM_TYPE,
  ESPRM_TEMPERATURE_PARAM_TYPE,
  ESPRM_LIGHT_MODE_PARAM_TYPE,
  ESPRM_UI_DROPDOWN_PARAM_TYPE,
  ESPRM_UI_STATUS_PARAM_TYPE,
  ESPRM_UI_CONTROL_BOARD_PARAM_TYPE,
  ESPRM_UI_LOCK_CONTROL_PARAM_TYPE,
  ESPRM_UI_ACTION_BUTTON_PARAM_TYPE,
  ESPRM_UI_HIDDEN_PARAM_TYPE,
  ESPRM_UI_HUE_CIRCLE_PARAM_TYPE,
  ESPRM_UI_HUE_SLIDER_PARAM_TYPE,
  ESPRM_UI_PUSH_BUTTON_PARAM_TYPE,
  ESPRM_UI_SLIDER_PARAM_TYPE,
  ESPRM_UI_TEXT_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
  ESPRM_UI_TRIGGER_PARAM_TYPE,
} from "@shared/utils/constants";

export const PARAM_CONTROLS = [
  {
    name: "Temperature",
    types: [ESPRM_TEMPERATURE_PARAM_TYPE],
    control: Temperature,
    dataTypes: [DATA_TYPE_INT, DATA_TYPE_FLOAT],
  },
  {
    name: "Text",
    types: [ESPRM_UI_TEXT_PARAM_TYPE],
    control: TextInput,
    dataTypes: DATA_TYPE_ALL,
  },
  {
    name: "Power",
    types: [
      ESPRM_UI_TOGGLE_PARAM_TYPE,
      ESPRM_POWER_PARAM_TYPE,
      MATTER_SERVER_PARAM_TYPE_ON_OFF,
    ],
    control: ToggleSwitch,
    dataTypes: DATA_TYPE_BOOL,
    hide: true,
  },
  {
    name: "Slider",
    types: [ESPRM_UI_SLIDER_PARAM_TYPE],
    control: Slider,
    dataTypes: [DATA_TYPE_INT, DATA_TYPE_FLOAT],
    requirements: "bounds (min, max)",
  },
  {
    name: "Brightness",
    types: [ESPRM_BRIGHTNESS_PARAM_TYPE, MATTER_SERVER_PARAM_TYPE_LEVEL_CONTROL],
    control: BrightnessSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_BRIGHTNESS_PARAM_TYPE,
  },
  {
    name: "CCT",
    types: [ESPRM_CCT_PARAM_TYPE, MATTER_SERVER_PARAM_TYPE_COLOR_CONTROL],
    control: ColorTemperatureSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_CCT_PARAM_TYPE,
  },
  {
    name: "Saturation",
    types: [ESPRM_SATURATION_PARAM_TYPE],
    control: SaturationSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_SATURATION_PARAM_TYPE,
    derivedMeta: [{ hue: ESPRM_HUE_PARAM_TYPE }],
  },
  {
    name: "Hue Slider",
    types: [
      ESPRM_UI_HUE_SLIDER_PARAM_TYPE,
      ESPRM_HUE_PARAM_TYPE,
      MATTER_SERVER_PARAM_TYPE_COLOR_CONTROL,
    ],
    control: HueSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_HUE_PARAM_TYPE,
  },
  {
    name: "Hue Circle",
    types: [ESPRM_UI_HUE_CIRCLE_PARAM_TYPE],
    control: HueCircle,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_HUE_PARAM_TYPE,
  },
  {
    name: "Push Button",
    types: [ESPRM_UI_PUSH_BUTTON_PARAM_TYPE],
    control: PushButton,
    dataTypes: DATA_TYPE_BOOL,
  },
  {
    name: "Dropdown",
    types: [
      ESPRM_UI_DROPDOWN_PARAM_TYPE,
      ESPRM_LIGHT_MODE_PARAM_TYPE,
      MATTER_SERVER_PARAM_TYPE_RVC_RUN_MODE,
      MATTER_SERVER_PARAM_TYPE_RVC_CLEAN_MODE,
    ],
    control: DropdownSelector,
    dataTypes: [DATA_TYPE_INT, DATA_TYPE_STRING],
    requirements:
      "bounds (min/max) for Int, valid strings for String; string + bounds = discrete string values",
  },
  {
    name: "Status",
    types: [ESPRM_UI_STATUS_PARAM_TYPE, MATTER_SERVER_PARAM_TYPE_POWER_SOURCE],
    control: StatusReadout,
    dataTypes: [DATA_TYPE_INT, DATA_TYPE_STRING],
  },
  {
    name: "Transport Control",
    types: [ESPRM_UI_CONTROL_BOARD_PARAM_TYPE],
    control: ControlBoard,
    dataTypes: DATA_TYPE_STRING,
  },
  {
    name: "Lock Control",
    types: [ESPRM_UI_LOCK_CONTROL_PARAM_TYPE, MATTER_SERVER_PARAM_TYPE_DOOR_LOCK],
    control: LockControl,
    dataTypes: DATA_TYPE_STRING,
  },
  {
    name: "Action Button",
    types: [ESPRM_UI_ACTION_BUTTON_PARAM_TYPE],
    control: ActionButton,
    dataTypes: DATA_TYPE_STRING,
  },
  {
    name: "Trigger",
    types: [ESPRM_UI_TRIGGER_PARAM_TYPE],
    control: TriggerButton,
    dataTypes: DATA_TYPE_BOOL,
    platformRestriction: "android",
  },
  {
    name: "Hidden",
    types: [ESPRM_UI_HIDDEN_PARAM_TYPE],
    control: null,
    dataTypes: DATA_TYPE_BOOL,
    platformRestriction: "android",
    requirements: "param will be hidden",
  },
];
