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

import type { ClusterConfigMap } from "@espressif/rainmaker-matter-sdk";
import { MATTER_PARAM_VALUE_UNKNOWN } from "@espressif/rainmaker-matter-sdk";
import {
  ESPRM_UI_DROPDOWN_PARAM_TYPE,
  ESPRM_UI_ACTION_BUTTON_PARAM_TYPE,
  ESPRM_UI_STATUS_PARAM_TYPE,
  ESPRM_UI_CONTROL_BOARD_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
  ESPRM_UI_SLIDER_PARAM_TYPE,
  ESPRM_UI_HUE_SLIDER_PARAM_TYPE,
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
  createCommandResolver,
  createCrossClusterInvokeMarker,
  createHueInvokeResolver,
  createMappingResolver,
  createModeChangeResolver,
  createTransformResolver,
  createValueResolver,
  type MappingDefinition,
} from "./utils/common";
import {
  MATTER_COLOR_CMD_MOVE_TO_HUE,
  MATTER_LEVEL_CMD_MOVE_TO_LEVEL_WITH_ON_OFF,
} from "./matterParamConstants";
import {
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

/** RVC Run Mode cluster id (RvcRunMode, ModeBase derivative). */
const RVC_RUN_MODE_CLUSTER_ID = 0x54;

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
    clusterId: 0x6,
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
    clusterId: 0x8,
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
    clusterId: 0x300,
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
    ],
  },
  "0x54": {
    clusterId: 0x54,
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
    clusterId: 0x55,
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
    clusterId: 0x61,
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
  "0x2f": {
    clusterId: 0x2f,
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
};
