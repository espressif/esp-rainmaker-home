/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** RVC Operational State enum map (cluster 0x61, attribute 0). */
export const RVC_OPERATIONAL_STATE_MAP = {
  0x00: { value: "stopped", label: "Stopped" },
  0x01: { value: "running", label: "Running" },
  0x02: { value: "paused", label: "Paused" },
  0x03: { value: "error", label: "Error" },
  0x40: { value: "seeking_charger", label: "Seeking Charger" },
  0x41: { value: "charging", label: "Charging" },
  0x42: { value: "docked", label: "Docked" },
  0x43: { value: "emptying_dust_bin", label: "Emptying Dust Bin" },
  0x44: { value: "cleaning_mop", label: "Cleaning Mop" },
  0x45: { value: "filling_water_tank", label: "Filling Water Tank" },
  0x46: { value: "updating_maps", label: "Updating Maps" },
} as const;

/** RVC Operational Error enum map (cluster 0x61, attribute 1). */
export const RVC_OPERATIONAL_ERROR_MAP = {
  0x00: { value: "no_error", label: "No Error" },
  0x01: { value: "unable_to_start_or_resume", label: "Unable to Start or Resume" },
  0x02: { value: "unable_to_complete_operation", label: "Unable to Complete Operation" },
  0x03: { value: "command_invalid_in_state", label: "Command Invalid in State" },
  0x40: { value: "failed_to_find_charging_dock", label: "Failed to Find Charging Dock" },
  0x41: { value: "stuck", label: "Stuck" },
  0x42: { value: "dust_bin_missing", label: "Dust Bin Missing" },
  0x43: { value: "dust_bin_full", label: "Dust Bin Full" },
  0x44: { value: "water_tank_empty", label: "Water Tank Empty" },
  0x45: { value: "water_tank_missing", label: "Water Tank Missing" },
  0x46: { value: "water_tank_lid_open", label: "Water Tank Lid Open" },
  0x47: { value: "mop_cleaning_pad_missing", label: "Mop Cleaning Pad Missing" },
  0x48: { value: "low_battery", label: "Low Battery" },
  0x49: { value: "cannot_reach_target_area", label: "Cannot Reach Target Area" },
  0x4a: { value: "dirty_water_tank_full", label: "Dirty Water Tank Full" },
  0x4b: { value: "dirty_water_tank_missing", label: "Dirty Water Tank Missing" },
  0x4c: { value: "wheels_jammed", label: "Wheels Jammed" },
  0x4d: { value: "brush_jammed", label: "Brush Jammed" },
  0x4e: { value: "navigation_sensor_obscured", label: "Navigation Sensor Obscured" },
} as const;

/** RVC Operational State command ids (cluster 0x61). */
export const RVC_OPERATIONAL_STATE_CMD_PAUSE = 0x00;
export const RVC_OPERATIONAL_STATE_CMD_STOP = 0x01;
export const RVC_OPERATIONAL_STATE_CMD_START = 0x02;
export const RVC_OPERATIONAL_STATE_CMD_RESUME = 0x03;
export const RVC_OPERATIONAL_STATE_CMD_GO_HOME = 0x80;
