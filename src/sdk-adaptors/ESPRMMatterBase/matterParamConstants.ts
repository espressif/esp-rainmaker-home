/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ParamControlBoardActionSpec } from "@shared/utils/paramUtils";

/** Placeholder value for Matter cluster params with unknown live state. */
export const MATTER_PARAM_VALUE_UNKNOWN = "unknown";

/** Idle UI value for write-only Matter command params. */
export const MATTER_PARAM_COMMAND_IDLE = "idle";

/** Level Control cluster (0x0008) command ids. */
export const MATTER_LEVEL_CMD_MOVE_TO_LEVEL_WITH_ON_OFF = 0x04;

/** Color Control cluster (0x0300) command ids. */
export const MATTER_COLOR_CMD_MOVE_TO_HUE = 0x00;
export const MATTER_COLOR_CMD_MOVE_TO_SATURATION = 0x03;
export const MATTER_COLOR_CMD_MOVE_TO_COLOR_TEMPERATURE = 0x0a;

/** RVC Operational Error semantic value when no error is active. */
export const RVC_OPERATIONAL_ERROR_NO_ERROR = "no_error";

/** RVC transport command tokens compiled into cluster param `rawModes`. */
export const RVC_TRANSPORT_ACTION_START = "start";
export const RVC_TRANSPORT_ACTION_PAUSE = "pause";
export const RVC_TRANSPORT_ACTION_RESUME = "resume";

/** RVC Operational State semantic slugs (cluster 0x61 attribute 0). */
export const RVC_OP_STATE_STOPPED = "stopped";
export const RVC_OP_STATE_RUNNING = "running";
export const RVC_OP_STATE_PAUSED = "paused";
export const RVC_OP_STATE_SEEKING_CHARGER = "seeking_charger";
export const RVC_OP_STATE_CHARGING = "charging";
export const RVC_OP_STATE_DOCKED = "docked";

/**
 * Maps RVC Operational State slugs to control-board actions.
 * Passed to the SDK via cluster param `meta.controlBoardActions`.
 */
export const RVC_TRANSPORT_ACTIONS_BY_STATE: Record<
  string,
  ParamControlBoardActionSpec
> = {
  [RVC_OP_STATE_RUNNING]: {
    action: RVC_TRANSPORT_ACTION_PAUSE,
    label: "Pause",
    icon: "pause",
  },
  [RVC_OP_STATE_PAUSED]: {
    action: RVC_TRANSPORT_ACTION_RESUME,
    label: "Resume",
    icon: "play",
  },
  [RVC_OP_STATE_SEEKING_CHARGER]: {
    action: RVC_TRANSPORT_ACTION_PAUSE,
    label: "Pause",
    icon: "pause",
  },
  [RVC_OP_STATE_STOPPED]: {
    action: RVC_TRANSPORT_ACTION_START,
    label: "Start",
    icon: "play",
  },
  [RVC_OP_STATE_DOCKED]: {
    action: RVC_TRANSPORT_ACTION_START,
    label: "Start",
    icon: "play",
  },
  [RVC_OP_STATE_CHARGING]: {
    action: RVC_TRANSPORT_ACTION_START,
    label: "Start",
    icon: "play",
  },
};

/** TemperatureMeasurement MeasuredValue null sentinel (int16 `0x8000`). */
export const MATTER_TEMPERATURE_MEASURED_NULL = -32768;

/** RelativeHumidityMeasurement / IlluminanceMeasurement null sentinel (`0xFFFF`). */
export const MATTER_HUMIDITY_MEASURED_NULL = 0xffff;
export const MATTER_ILLUMINANCE_MEASURED_NULL = 0xffff;

/** Matter sensor attribute scale divisors (linear: raw / factor). */
export const MATTER_TEMPERATURE_SCALE_FACTOR = 100;
export const MATTER_HUMIDITY_SCALE_FACTOR = 100;

/**
 * IlluminanceMeasurement log encoding (cluster 0x0400, MeasuredValue):
 * `MeasuredValue = SCALE × log10(lux) + OFFSET` → lux = 10^((value − OFFSET) / SCALE).
 */
export const MATTER_ILLUMINANCE_SCALE_FACTOR = 10000;
export const MATTER_ILLUMINANCE_MEASURED_VALUE_OFFSET = 1;

/** OccupancySensing Occupancy bitmap — bit 0 set means occupied. */
export const MATTER_OCCUPANCY_BITMAP_OCCUPIED = 0x01;

/** Occupancy semantic slugs for UI mapping. */
export const MATTER_OCCUPANCY_STATE_OCCUPIED = "occupied";
export const MATTER_OCCUPANCY_STATE_UNOCCUPIED = "unoccupied";

/** Door Lock cluster (0x0101) command ids. */
export const MATTER_DOOR_LOCK_CMD_LOCK_DOOR = 0x00;
export const MATTER_DOOR_LOCK_CMD_UNLOCK_DOOR = 0x01;

/** Door Lock control-board action tokens. */
export const MATTER_DOOR_LOCK_ACTION_LOCK = "lock";
export const MATTER_DOOR_LOCK_ACTION_UNLOCK = "unlock";

/** Door Lock LockState attribute semantic slugs. */
export const MATTER_DOOR_LOCK_STATE_NOT_FULLY_LOCKED = "not_fully_locked";
export const MATTER_DOOR_LOCK_STATE_LOCKED = "locked";
export const MATTER_DOOR_LOCK_STATE_UNLOCKED = "unlocked";
export const MATTER_DOOR_LOCK_STATE_UNLATCHED = "unlatched";

/**
 * Maps Door Lock LockState slugs to control-board actions (lock / unlock only).
 * Passed to the SDK via cluster param `meta.controlBoardActions`.
 */
export const MATTER_DOOR_LOCK_ACTIONS_BY_STATE: Record<
  string,
  ParamControlBoardActionSpec
> = {
  [MATTER_DOOR_LOCK_STATE_LOCKED]: {
    action: MATTER_DOOR_LOCK_ACTION_UNLOCK,
    label: "Unlock",
    icon: "unlock",
  },
  [MATTER_DOOR_LOCK_STATE_UNLOCKED]: {
    action: MATTER_DOOR_LOCK_ACTION_LOCK,
    label: "Lock",
    icon: "lock",
  },
  [MATTER_DOOR_LOCK_STATE_NOT_FULLY_LOCKED]: {
    action: MATTER_DOOR_LOCK_ACTION_LOCK,
    label: "Lock",
    icon: "lock",
  },
  [MATTER_DOOR_LOCK_STATE_UNLATCHED]: {
    action: MATTER_DOOR_LOCK_ACTION_LOCK,
    label: "Lock",
    icon: "lock",
  },
};
