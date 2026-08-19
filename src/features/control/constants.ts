/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** i18n key for the empty state when a device control panel has no parameters. */
export const I18N_DEVICE_CONTROL_FALLBACK_NO_PARAMS = "device.control.fallbackNoParams";

/** Settings quick-action tile ids (horizontal row after node info). */
export const SETTINGS_QUICK_ACTION_AUTH_TOKEN = "auth_token";
export const SETTINGS_QUICK_ACTION_DEVICE_LIST = "device_list";

/** Settings screen section keys (visibility toggles in {@link useSettings}). */
export const SETTINGS_SECTION_NAME = "name";

/** Outcomes returned by {@link saveDeviceDisplayName}. */
export const SAVE_DEVICE_NAME_STATUS_SUCCESS = "success";
export const SAVE_DEVICE_NAME_STATUS_NO_PARAM = "no_param";
export const SAVE_DEVICE_NAME_STATUS_FAILED = "failed";

/** Toast categories for RainMaker user-auth update results. */
export const RMAKER_AUTH_TOAST_KIND_UPDATED = "updated";
export const RMAKER_AUTH_TOAST_KIND_NO_REFRESH_TOKEN = "no_refresh_token";
export const RMAKER_AUTH_TOAST_KIND_FAILED = "failed";

// TIME SERIES CHART GRANULARITIES
/** Chart tab granularity ids (Daily / Weekly / Monthly). */
export const CHART_GRANULARITY_DAILY = "daily";
export const CHART_GRANULARITY_WEEKLY = "weekly";
export const CHART_GRANULARITY_MONTHLY = "monthly";
/** Tab order shown on the chart screen. */
export const CHART_GRANULARITIES = [
  CHART_GRANULARITY_DAILY,
  CHART_GRANULARITY_WEEKLY,
  CHART_GRANULARITY_MONTHLY,
] as const;

// TIME SERIES CHART VIEW STATES
/** Chart view states (see ChartState in @src/types/global). */
export const CHART_STATE_LOADING = "loading";
export const CHART_STATE_ERROR = "error";
export const CHART_STATE_UNSUPPORTED = "unsupported";
export const CHART_STATE_EMPTY = "empty";
export const CHART_STATE_READY = "ready";

// TIME SERIES SUMMARY KINDS
/** Window summary semantics (see TimeSeriesSummaryKind). */
export const TS_SUMMARY_KIND_AVERAGE = "average";
export const TS_SUMMARY_KIND_TOTAL = "total";

// TIME SERIES CHART DATA
/** Number of buckets (bars) in one chart window, matching the revamp design. */
export const CHART_WINDOW_BUCKET_COUNT = 7;
/** Max records per simple_ts page (Base SDK `MAX_RESULT_COUNT`). */
export const TS_PAGE_RESULT_COUNT = 200;
/** Safety cap on simple_ts pagination fetches per window (memory guard). */
export const TS_MAX_PAGE_FETCHES = 20;
/** Week starts on Monday, matching the app-wide week alignment. */
export const CHART_WEEK_START_DAY_INDEX = 1;

// RainMaker cloud command-response (cmd-resp) framework — used to trigger
// device-side actions such as JPEG snapshot capture on camera nodes.
/** Framework command id (0x1001) carried by every cmd-resp request. */
export const CAMERA_SNAPSHOT_COMMAND_ID = 4097;
/** Device-side response timeout (seconds) the cmd-resp framework waits for. */
export const NODE_CMD_DEFAULT_TIMEOUT = 1000;
/** Camera command name understood by the firmware. */
export const CAMERA_CMD_JPEG_CAPTURE = "jpeg-capture";
/** `jpeg-capture` arg that tells the device to upload the snapshot, not just capture it. */
export const CAMERA_CMD_ARG_UPLOAD = "--upload";

// Status-polling cadence for an in-flight command request.
export const NODE_CMD_POLL_INTERVAL_MS = 2000;
export const NODE_CMD_POLL_MAX_ATTEMPTS = 15;
/** `pollUntilReady` label for camera snapshot cmd-resp status waits. */
export const NODE_CMD_POLL_LABEL_SNAPSHOT = "camera snapshot cmd-resp";

// Terminal statuses reported by cmd-resp request lookup.
export const NODE_CMD_STATUS_SUCCESS = "success";
export const NODE_CMD_STATUS_FAILURE = "failure";
export const NODE_CMD_STATUS_TIMED_OUT = "timed_out";

/** Threshold (bytes) above which a snapshot size is shown in MB rather than KB. */
export const SNAPSHOT_SIZE_MB_THRESHOLD = 1024 * 1024;
