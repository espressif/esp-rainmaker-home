/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Matter cluster param registry for this app.
 *
 * Add entries here to compile Matter device metadata into UI-ready params.
 * Passed to the SDK via `getMatterSDKConfig()` → `clusterConfig`.
 */

import {
  MATTER_CLUSTER_ID_COLOR_CONTROL,
  MATTER_CLUSTER_ID_DOOR_LOCK,
  MATTER_CLUSTER_ID_ILLUMINANCE_MEASUREMENT,
  MATTER_CLUSTER_ID_LEVEL_CONTROL,
  MATTER_CLUSTER_ID_OCCUPANCY_SENSING,
  MATTER_CLUSTER_ID_ON_OFF,
  MATTER_CLUSTER_ID_POWER_SOURCE,
  MATTER_CLUSTER_ID_RELATIVE_HUMIDITY_MEASUREMENT,
  MATTER_CLUSTER_ID_RVC_CLEAN_MODE,
  MATTER_CLUSTER_ID_RVC_OPERATIONAL_STATE,
  MATTER_CLUSTER_ID_RVC_RUN_MODE,
  MATTER_CLUSTER_ID_TEMPERATURE_MEASUREMENT,
  MATTER_CLUSTER_ID_USER_LABEL,
  MATTER_USER_LABEL_LIST_ATTRIBUTE_ID,
} from "./constants";
import type { ClusterConfigMap } from "@espressif/rainmaker-matter-sdk";
import { MATTER_PARAM_VALUE_UNKNOWN } from "@espressif/rainmaker-matter-sdk";
import {
  ESPRM_UI_DROPDOWN_PARAM_TYPE,
  ESPRM_UI_ACTION_BUTTON_PARAM_TYPE,
  ESPRM_UI_STATUS_PARAM_TYPE,
  ESPRM_UI_CONTROL_BOARD_PARAM_TYPE,
  ESPRM_UI_LOCK_CONTROL_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
  ESPRM_UI_SLIDER_PARAM_TYPE,
  ESPRM_UI_HUE_SLIDER_PARAM_TYPE,
  ESPRM_UI_CCT_SLIDER_PARAM_TYPE,
  ESPRM_UI_HIDDEN_PARAM_TYPE,
  ESPRM_NAME_PARAM_TYPE,
  DATA_TYPE_STRING,
  ESPRM_TEMPERATURE_PARAM_TYPE,
  PARAM_CONTROL_INVOKE_VALUE,
} from "@shared/utils/constants";
import {
  PARAM_BOUNDS_HIDE_WHEN_VALUE,
  PARAM_BOUNDS_ACTION_BUTTON_ONLY,
  PARAM_BOUNDS_CONTROL_BOARD_ACTIONS,
  PARAM_BOUNDS_DISABLED_WHEN_SIBLING_VALUE,
  PARAM_BOUNDS_VALUE_SUFFIX,
} from "@shared/utils/paramUtils";
import {
  createBrightnessInvokeResolver,
  createColorTemperatureInvokeResolver,
  createCommandResolver,
  createCrossClusterInvokeMarker,
  createHueInvokeResolver,
  createSaturationInvokeResolver,
  createMappingResolver,
  createModeChangeResolver,
  createTransformResolver,
  createValueResolver,
  type MappingDefinition,
} from "./utils/common";
import {
  MATTER_COLOR_CMD_MOVE_TO_HUE,
  MATTER_COLOR_CMD_MOVE_TO_SATURATION,
  MATTER_COLOR_CMD_MOVE_TO_COLOR_TEMPERATURE,
  MATTER_DOOR_LOCK_ACTION_LOCK,
  MATTER_DOOR_LOCK_ACTION_UNLOCK,
  MATTER_DOOR_LOCK_ACTIONS_BY_STATE,
  MATTER_DOOR_LOCK_CMD_LOCK_DOOR,
  MATTER_DOOR_LOCK_CMD_UNLOCK_DOOR,
  MATTER_DOOR_LOCK_STATE_LOCKED,
  MATTER_DOOR_LOCK_STATE_NOT_FULLY_LOCKED,
  MATTER_DOOR_LOCK_STATE_UNLATCHED,
  MATTER_DOOR_LOCK_STATE_UNLOCKED,
  MATTER_HUMIDITY_MEASURED_NULL,
  MATTER_HUMIDITY_SCALE_FACTOR,
  MATTER_ILLUMINANCE_MEASURED_NULL,
  MATTER_ILLUMINANCE_MEASURED_VALUE_OFFSET,
  MATTER_ILLUMINANCE_SCALE_FACTOR,
  MATTER_LEVEL_CMD_MOVE_TO_LEVEL_WITH_ON_OFF,
  MATTER_OCCUPANCY_BITMAP_OCCUPIED,
  MATTER_OCCUPANCY_STATE_OCCUPIED,
  MATTER_OCCUPANCY_STATE_UNOCCUPIED,
  MATTER_TEMPERATURE_MEASURED_NULL,
  MATTER_TEMPERATURE_SCALE_FACTOR,
  RVC_OPERATIONAL_ERROR_NO_ERROR,
  RVC_TRANSPORT_ACTION_PAUSE,
  RVC_TRANSPORT_ACTION_RESUME,
  RVC_TRANSPORT_ACTION_START,
  RVC_TRANSPORT_ACTIONS_BY_STATE,
} from "./matterParamConstants";
import {
  RVC_OPERATIONAL_ERROR_MAP,
  RVC_OPERATIONAL_STATE_CMD_GO_HOME,
  RVC_OPERATIONAL_STATE_CMD_PAUSE,
  RVC_OPERATIONAL_STATE_CMD_RESUME,
  RVC_OPERATIONAL_STATE_CMD_START,
  RVC_OPERATIONAL_STATE_MAP,
} from "./utils/rvcOperationalState";
import { createUserLabelDeviceNameResolver } from "./utils/userLabel";

/** RVC Run Mode cluster id (RvcRunMode, ModeBase derivative). */
const RVC_RUN_MODE_CLUSTER_ID = MATTER_CLUSTER_ID_RVC_RUN_MODE;

/** RVC Run Mode `Cleaning` raw index — used to start the RVC. */
const RVC_RUN_MODE_CLEANING_INDEX = 1;

/** RVC Run Mode index → UI slug map (cluster 0x54). */
const RVC_RUN_MODE_MAP: MappingDefinition = {
  0: { value: "idle", label: "Idle" },
  [RVC_RUN_MODE_CLEANING_INDEX]: { value: "cleaning", label: "Cleaning" },
  2: { value: "mapping", label: "Mapping" },
};

/**
 * Matter ModeBase `ChangeToMode` command id. Every ModeBase derivative
 * (RVC Run/Clean Mode, Laundry/Dishwasher/Oven/Microwave/EnergyEvse Mode,
 * etc.) exposes a read-only `CurrentMode` attribute (`0x01`) that can
 * only be changed by invoking this command with a `NewMode` field.
 */
const MODE_BASE_CHANGE_TO_MODE_COMMAND_ID = 0x00;

/** Door Lock LockState index → UI slug map (cluster 0x101). */
const DOOR_LOCK_STATE_MAP: MappingDefinition = {
  0: { value: MATTER_DOOR_LOCK_STATE_NOT_FULLY_LOCKED, label: "Not Fully Locked" },
  1: { value: MATTER_DOOR_LOCK_STATE_LOCKED, label: "Locked" },
  2: { value: MATTER_DOOR_LOCK_STATE_UNLOCKED, label: "Unlocked" },
  3: { value: MATTER_DOOR_LOCK_STATE_UNLATCHED, label: "Unlatched" },
};

const doorLockStateResolver = createMappingResolver(DOOR_LOCK_STATE_MAP);

const doorLockCommandResolver = createCommandResolver([
  {
    value: MATTER_DOOR_LOCK_ACTION_LOCK,
    label: "Lock",
    commandId: MATTER_DOOR_LOCK_CMD_LOCK_DOOR,
  },
  {
    value: MATTER_DOOR_LOCK_ACTION_UNLOCK,
    label: "Unlock",
    commandId: MATTER_DOOR_LOCK_CMD_UNLOCK_DOOR,
  },
]);

/** RVC Clean Mode index → UI slug map (cluster 0x55). */
const RVC_CLEAN_MODE_MAP: MappingDefinition = {
  0: { value: "deep_clean", label: "Deep Clean" },
  1: { value: "vacuum", label: "Vacuum" },
  2: { value: "mop", label: "Mop" },
  3: { value: "vacuum_then_mop", label: "Vacuum then Mop" },
};

const rvcOperationalStateResolver = createMappingResolver(
  RVC_OPERATIONAL_STATE_MAP as MappingDefinition,
);

/**
 * Pause/Resume route through the Control param's host cluster
 * (`0x61` RvcOperationalState) — both commands are part of the RVC
 * profile per Matter spec. `Start` is **NOT** part of the RVC profile
 * for cluster `0x61` (the spec drops Start/Stop for RVCs); attempting
 * cmd `0x02` returns `Status=0x81 UnsupportedCommand`. The Start action
 * is handled separately by the resolver below via a cross-cluster invoke
 * marker that targets `RvcRunMode.ChangeToMode` (`0x54` cmd `0x00`).
 */
const rvcTransportCommandResolver = createCommandResolver([
  {
    value: RVC_TRANSPORT_ACTION_START,
    label: "Start",
    commandId: RVC_OPERATIONAL_STATE_CMD_START,
  },
  {
    value: RVC_TRANSPORT_ACTION_PAUSE,
    label: "Pause",
    commandId: RVC_OPERATIONAL_STATE_CMD_PAUSE,
  },
  {
    value: RVC_TRANSPORT_ACTION_RESUME,
    label: "Resume",
    commandId: RVC_OPERATIONAL_STATE_CMD_RESUME,
  },
]);

/**
 * MatterDataValue Structure carrying `{ NewMode: <Cleaning index> }` for
 * `RvcRunMode.ChangeToMode`. Same shape `createModeChangeResolver`
 * builds for the Run Mode dropdown — kept here as a literal to avoid
 * coupling the Control param's encode path to that resolver instance.
 */
const RVC_RUN_MODE_CLEANING_PAYLOAD = {
  type: "Structure" as const,
  value: [
    {
      contextTag: 0,
      data: { type: "UnsignedInteger" as const, value: RVC_RUN_MODE_CLEANING_INDEX },
    },
  ],
};

/**
 * Encoder for the Control param. RVC `Start` cannot route through the
 * host cluster (`0x61`) — see comment on `rvcTransportCommandResolver`.
 * Returns a cross-cluster invoke marker the patched
 * `ESPRMMatterDeviceParam.setValue` honors by invoking
 * `RvcRunMode.ChangeToMode` on `0x54`. Pause/Resume fall through to the
 * default command-id encoding so they keep targeting `0x61`.
 */
const rvcControlEncodeValue = (
  uiValue: unknown,
  rawModes?: Record<string, number>,
): unknown => {
  if (uiValue === RVC_TRANSPORT_ACTION_START) {
    return createCrossClusterInvokeMarker(
      RVC_RUN_MODE_CLUSTER_ID,
      MODE_BASE_CHANGE_TO_MODE_COMMAND_ID,
      RVC_RUN_MODE_CLEANING_PAYLOAD as unknown as Record<string, unknown>,
    );
  }
  return rvcTransportCommandResolver.encodeValue(uiValue as string, rawModes);
};

/** Matter cluster registry passed to the SDK at configure time. */
export const matterClusterConfig: ClusterConfigMap = {
  "0x6": {
    clusterId: MATTER_CLUSTER_ID_ON_OFF,
    name: "On/Off",
    params: [
      {
        name: "Power",
        type: "bool",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_UI_TOGGLE_PARAM_TYPE,
        dataType: "boolean",
        writeAsCommand: true,
        properties: ["read", "write"],
        resolver: createValueResolver({
          decode: (raw) => Boolean(raw),
        }),
      },
    ],
  },
  "0x8": {
    clusterId: MATTER_CLUSTER_ID_LEVEL_CONTROL,
    name: "Level Control",
    params: [
      {
        name: "Brightness",
        type: "int",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_UI_SLIDER_PARAM_TYPE,
        dataType: "int",
        writeAsCommand: true,
        matterCommandId: MATTER_LEVEL_CMD_MOVE_TO_LEVEL_WITH_ON_OFF,
        properties: ["read", "write"],
        meta: { min: 0, max: 100, step: 1 },
        resolver: createBrightnessInvokeResolver(),
      },
    ],
  },
  "0x300": {
    clusterId: MATTER_CLUSTER_ID_COLOR_CONTROL,
    name: "Color Control",
    params: [
      {
        name: "Hue",
        type: "int",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_UI_HUE_SLIDER_PARAM_TYPE,
        dataType: "int",
        writeAsCommand: true,
        matterCommandId: MATTER_COLOR_CMD_MOVE_TO_HUE,
        properties: ["read", "write"],
        meta: { min: 0, max: 360, step: 1 },
        resolver: createHueInvokeResolver(),
      },
      {
        name: "Saturation",
        type: "int",
        valueAttribute: 1,
        optionsAttribute: 0,
        uiType: ESPRM_UI_SLIDER_PARAM_TYPE,
        dataType: "int",
        writeAsCommand: true,
        matterCommandId: MATTER_COLOR_CMD_MOVE_TO_SATURATION,
        properties: ["read", "write"],
        meta: { min: 0, max: 100, step: 1 },
        resolver: createSaturationInvokeResolver(),
      },
      {
        name: "CCT",
        type: "int",
        valueAttribute: 0x7,
        optionsAttribute: 0x7,
        uiType: ESPRM_UI_CCT_SLIDER_PARAM_TYPE,
        dataType: "int",
        writeAsCommand: true,
        matterCommandId: MATTER_COLOR_CMD_MOVE_TO_COLOR_TEMPERATURE,
        properties: ["read", "write"],
        // Slider is in Kelvin; the resolver converts K↔mireds for attr 0x7.
        meta: { min: 2700, max: 6500, step: 100 },
        resolver: createColorTemperatureInvokeResolver(),
      },
    ],
  },
  "0x54": {
    clusterId: MATTER_CLUSTER_ID_RVC_RUN_MODE,
    name: "RVC Run Mode",
    defaultOptions: [
      { value: "idle", label: "Idle", rawMode: 0 },
      { value: "cleaning", label: "Cleaning", rawMode: 1 },
      { value: "mapping", label: "Mapping", rawMode: 2 },
    ],
    params: [
      {
        name: "Run Mode",
        type: "enum",
        valueAttribute: 1,
        optionsAttribute: 0,
        uiType: ESPRM_UI_DROPDOWN_PARAM_TYPE,
        dataType: "string",
        // RvcRunMode is a ModeBase derivative — CurrentMode (attr 0x01)
        // is read-only; mode changes go through ChangeToMode (cmd 0x00)
        // with `{ NewMode: <index> }`. See createModeChangeResolver.
        properties: ["read", "write"],
        writeAsCommand: true,
        matterCommandId: MODE_BASE_CHANGE_TO_MODE_COMMAND_ID,
        resolver: createModeChangeResolver(RVC_RUN_MODE_MAP),
      },
    ],
  },
  "0x55": {
    clusterId: MATTER_CLUSTER_ID_RVC_CLEAN_MODE,
    name: "RVC Clean Mode",
    defaultOptions: [
      { value: "deep_clean", label: "Deep Clean", rawMode: 0 },
      { value: "vacuum", label: "Vacuum", rawMode: 1 },
      { value: "mop", label: "Mop", rawMode: 2 },
      { value: "vacuum_then_mop", label: "Vacuum then Mop", rawMode: 3 },
    ],
    params: [
      {
        name: "Clean Mode",
        type: "enum",
        valueAttribute: 1,
        optionsAttribute: 0,
        uiType: ESPRM_UI_DROPDOWN_PARAM_TYPE,
        dataType: "string",
        // RvcCleanMode is also a ModeBase derivative — same routing
        // through ChangeToMode (cmd 0x00) as RvcRunMode above.
        properties: ["read", "write"],
        writeAsCommand: true,
        matterCommandId: MODE_BASE_CHANGE_TO_MODE_COMMAND_ID,
        resolver: createModeChangeResolver(RVC_CLEAN_MODE_MAP),
      },
    ],
  },
  "0x61": {
    clusterId: MATTER_CLUSTER_ID_RVC_OPERATIONAL_STATE,
    name: "RVC Operational State",
    params: [
      {
        name: "Control",
        type: "command",
        // Display state of the transport-control tile mirrors the device's
        // current OperationalState (cluster 0x61, attr `0x04`). The Pause /
        // Resume / Start command IDs come from `rvcTransportCommandResolver`
        // and are routed via `writeAsCommand` (no attribute write).
        valueAttribute: 4,
        optionsAttribute: 4,
        uiType: ESPRM_UI_CONTROL_BOARD_PARAM_TYPE,
        dataType: "string",
        writeAsCommand: true,
        properties: ["read", "write"],
        meta: {
          [PARAM_BOUNDS_CONTROL_BOARD_ACTIONS]: RVC_TRANSPORT_ACTIONS_BY_STATE,
        },
        resolver: {
          decodeOptions: rvcTransportCommandResolver.decodeOptions,
          decodeValue: rvcOperationalStateResolver.decodeValue,
          encodeValue: rvcControlEncodeValue as (typeof rvcTransportCommandResolver)["encodeValue"],
        },
      },
      {
        name: "Go Home",
        type: "command",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_UI_ACTION_BUTTON_PARAM_TYPE,
        dataType: "string",
        matterCommandId: RVC_OPERATIONAL_STATE_CMD_GO_HOME,
        properties: ["write"],
        meta: {
          [PARAM_BOUNDS_ACTION_BUTTON_ONLY]: true,
          // `Go Home` only makes sense while the RVC is roaming. When
          // `Run Mode` is `idle` the device is parked / at base, so the
          // dock command would be a no-op — keep the button inert until
          // the user puts the bot into `cleaning` or `mapping`.
          [PARAM_BOUNDS_DISABLED_WHEN_SIBLING_VALUE]: {
            paramName: "Run Mode",
            values: ["idle"],
          },
        },
        resolver: createCommandResolver([
          {
            value: PARAM_CONTROL_INVOKE_VALUE,
            label: "Go Home",
            commandId: RVC_OPERATIONAL_STATE_CMD_GO_HOME,
          },
        ]),
      },
      {
        name: "Operational Error",
        type: "enum",
        // OperationalError is attr `0x05` of cluster 0x61
        // (RvcOperationalState derives from OperationalState 0x60). The
        // earlier `valueAttribute: 1` pointed at CurrentPhase, which made
        // a CurrentPhase=NULL frame decode as "no_error" and clobbered the
        // tile after every subscription frame.
        valueAttribute: 5,
        optionsAttribute: 5,
        uiType: ESPRM_UI_STATUS_PARAM_TYPE,
        dataType: "string",
        properties: ["read"],
        meta: {
          [PARAM_BOUNDS_HIDE_WHEN_VALUE]: RVC_OPERATIONAL_ERROR_NO_ERROR,
        },
        resolver: createMappingResolver(
          RVC_OPERATIONAL_ERROR_MAP as MappingDefinition,
        ),
      },
    ],
  },
  "0x101": {
    clusterId: MATTER_CLUSTER_ID_DOOR_LOCK,
    name: "Door Lock",
    params: [
      {
        name: "Lock",
        type: "command",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_UI_LOCK_CONTROL_PARAM_TYPE,
        dataType: "string",
        writeAsCommand: true,
        properties: ["read", "write"],
        meta: {
          [PARAM_BOUNDS_CONTROL_BOARD_ACTIONS]: MATTER_DOOR_LOCK_ACTIONS_BY_STATE,
        },
        resolver: {
          decodeOptions: doorLockCommandResolver.decodeOptions,
          decodeValue: doorLockStateResolver.decodeValue,
          encodeValue: doorLockCommandResolver.encodeValue,
        },
      },
    ],
  },
  "0x400": {
    clusterId: MATTER_CLUSTER_ID_ILLUMINANCE_MEASUREMENT,
    name: "Illuminance Measurement",
    params: [
      {
        name: "Illuminance",
        type: "int",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_UI_STATUS_PARAM_TYPE,
        dataType: "string",
        properties: ["read"],
        meta: {
          [PARAM_BOUNDS_VALUE_SUFFIX]: " lux",
        },
        resolver: createTransformResolver({
          decode(raw) {
            const value = Number(raw);

            if (
              !Number.isFinite(value) ||
              value === MATTER_ILLUMINANCE_MEASURED_NULL ||
              value <= 0
            ) {
              return MATTER_PARAM_VALUE_UNKNOWN;
            }

            return String(
              Math.round(
                10 **
                  ((value - MATTER_ILLUMINANCE_MEASURED_VALUE_OFFSET) /
                    MATTER_ILLUMINANCE_SCALE_FACTOR),
              ),
            );
          },
        }),
      },
    ],
  },
  "0x402": {
    clusterId: MATTER_CLUSTER_ID_TEMPERATURE_MEASUREMENT,
    name: "Temperature Measurement",
    params: [
      {
        name: "Temperature",
        type: "int",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_TEMPERATURE_PARAM_TYPE,
        dataType: "float",
        properties: ["read"],
        resolver: createTransformResolver({
          decode(raw) {
            const value = Number(raw);

            if (
              !Number.isFinite(value) ||
              value === MATTER_TEMPERATURE_MEASURED_NULL
            ) {
              return MATTER_PARAM_VALUE_UNKNOWN;
            }

            return String(value / MATTER_TEMPERATURE_SCALE_FACTOR);
          },
        }),
      },
    ],
  },
  "0x405": {
    clusterId: MATTER_CLUSTER_ID_RELATIVE_HUMIDITY_MEASUREMENT,
    name: "Relative Humidity Measurement",
    params: [
      {
        name: "Humidity",
        type: "int",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_UI_STATUS_PARAM_TYPE,
        dataType: "string",
        properties: ["read"],
        meta: {
          [PARAM_BOUNDS_VALUE_SUFFIX]: "%",
        },
        resolver: createTransformResolver({
          decode(raw) {
            const value = Number(raw);

            if (
              !Number.isFinite(value) ||
              value === MATTER_HUMIDITY_MEASURED_NULL ||
              value > MATTER_HUMIDITY_SCALE_FACTOR * 100
            ) {
              return MATTER_PARAM_VALUE_UNKNOWN;
            }

            return String(Math.round(value / MATTER_HUMIDITY_SCALE_FACTOR));
          },
        }),
      },
    ],
  },
  "0x406": {
    clusterId: MATTER_CLUSTER_ID_OCCUPANCY_SENSING,
    name: "Occupancy Sensing",
    params: [
      {
        name: "Occupancy",
        type: "enum",
        valueAttribute: 0,
        optionsAttribute: 0,
        uiType: ESPRM_UI_STATUS_PARAM_TYPE,
        dataType: "string",
        properties: ["read"],
        resolver: createTransformResolver({
          decode(raw) {
            const value = Number(raw);

            if (!Number.isFinite(value)) {
              return MATTER_PARAM_VALUE_UNKNOWN;
            }

            return value & MATTER_OCCUPANCY_BITMAP_OCCUPIED
              ? MATTER_OCCUPANCY_STATE_OCCUPIED
              : MATTER_OCCUPANCY_STATE_UNOCCUPIED;
          },
        }),
      },
    ],
  },
  "0x2f": {
    clusterId: MATTER_CLUSTER_ID_POWER_SOURCE,
    name: "Power Source",
    params: [
      {
        name: "Battery",
        type: "int",
        valueAttribute: 12,
        optionsAttribute: 12,
        uiType: ESPRM_UI_STATUS_PARAM_TYPE,
        dataType: "string",
        properties: ["read"],
        meta: {
          [PARAM_BOUNDS_VALUE_SUFFIX]: "%",
        },
        resolver: createTransformResolver({
          decode(raw) {
            const value = Number(raw);

            if (!Number.isFinite(value) || value <= 0) {
              return MATTER_PARAM_VALUE_UNKNOWN;
            }

            return String(Math.round((Math.min(value, 200) / 200) * 100));
          },
        }),
      },
    ],
  },
  "0x41": {
    clusterId: MATTER_CLUSTER_ID_USER_LABEL,
    name: "User Label",
    params: [
      {
        name: "Name",
        type: ESPRM_NAME_PARAM_TYPE,
        valueAttribute: MATTER_USER_LABEL_LIST_ATTRIBUTE_ID,
        optionsAttribute: MATTER_USER_LABEL_LIST_ATTRIBUTE_ID,
        uiType: ESPRM_UI_HIDDEN_PARAM_TYPE,
        dataType: DATA_TYPE_STRING,
        properties: ["read", "write"],
        resolver: createUserLabelDeviceNameResolver(),
      },
    ],
  },
};
