/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** i18n key for the empty state when a device control panel has no parameters. */
export const I18N_DEVICE_CONTROL_FALLBACK_NO_PARAMS = "device.control.fallbackNoParams";

/** i18n key for the Guide screen title when markdown fails to load. */
export const I18N_DEVICE_GUIDE_LOAD_FAILED = "device.control.guideLoadFailed";

/** i18n key for the Guide screen description when markdown fails to load. */
export const I18N_DEVICE_GUIDE_LOAD_FAILED_DESCRIPTION =
  "device.control.guideLoadFailedDescription";

/** Sentinel stored on Guide fetch failure (UI copy comes from i18n, not this value). */
export const GUIDE_LOAD_FAILED = "load_failed";

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

// RainMaker cloud command-response (cmd-resp) — canonical defs in `@shared/utils/constants`.
export {
  CAMERA_SNAPSHOT_COMMAND_ID,
  NODE_CMD_DEFAULT_TIMEOUT,
  CAMERA_CMD_JPEG_CAPTURE,
  CAMERA_CMD_ARG_UPLOAD,
  CAMERA_CMD_ARG_QUALITY,
  CAMERA_CMD_ARG_RES,
  CAMERA_CMD_ARG_AGENT_ID,
  CAMERA_CMD_ARG_CONV_ID,
  CAMERA_CAPTURE_QUALITY,
  CAMERA_CAPTURE_RESOLUTION,
  NODE_CMD_POLL_INTERVAL_MS,
  NODE_CMD_POLL_MAX_ATTEMPTS,
  NODE_CMD_POLL_LABEL_SNAPSHOT,
  NODE_CMD_STATUS_SUCCESS,
  NODE_CMD_STATUS_FAILURE,
  NODE_CMD_STATUS_TIMED_OUT,
  SNAPSHOT_SIZE_MB_THRESHOLD,
} from "@shared/utils/constants";
