/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ParamControlBoardActionSpec } from "@shared/utils/paramUtils";

/** Idle UI value for write-only Matter command params. */
export const MATTER_PARAM_COMMAND_IDLE = "idle";

/** Level Control cluster (0x0008) command ids. */
export const MATTER_LEVEL_CMD_MOVE_TO_LEVEL_WITH_ON_OFF = 0x04;

/** Color Control cluster (0x0300) command ids. */
export const MATTER_COLOR_CMD_MOVE_TO_HUE = 0x00;

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
