/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from "i18next";
import {
  GOOGLE_SIGN_IN_CANCELLED_ERROR_TAG,
  OAUTH_CANCELLED_ERROR_TAG,
  OAUTH_NO_BROWSER_FOUND_ERROR_TAG,
} from "@shared/utils/constants";
import { type PostLoginPipelineHooks } from "./postLoginPipeline";

export const OAUTH_FLOW_STATUS_IDLE = "idle";
/**
 * Waiting on the identity provider: the hosted browser flow, or the platform's
 * own account sheet. The user is the bottleneck in both, so no blocking UI is
 * shown while this is the status.
 */
export const OAUTH_FLOW_STATUS_PROVIDER_AUTH = "provider_auth";
/**
 * Signed in; the post-login pipeline is fetching homes and nodes. The only
 * phase with real progress to report, so the only one that takes the screen.
 */
export const OAUTH_FLOW_STATUS_POST_LOGIN_PIPELINE = "post_login_pipeline";
export const OAUTH_FLOW_STATUS_CANCELLED = "cancelled";
export const OAUTH_FLOW_STATUS_FAILED = "failed";
export const OAUTH_FLOW_STATUS_COMPLETED = "completed";

export const OAUTH_PIPELINE_STEP_SET_USER_TIME_ZONE = "setUserTimeZone";
export const OAUTH_PIPELINE_STEP_REGISTER_FOR_NOTIFICATION =
  "registerForNotification";
export const OAUTH_PIPELINE_STEP_SYNC_HOME_WITH_NODES = "syncHomeWithNodes";
export const OAUTH_PIPELINE_STEP_INIT_USER_CUSTOM_DATA = "initUserCustomData";
export const OAUTH_PIPELINE_STEP_AUTO_CONNECT_MCP_CONNECTOR =
  "autoConnectMCPConnector";
export const OAUTH_PIPELINE_STEP_GET_USER_PROFILE = "getUserProfile";

export type OAuthFlowStatus =
  | typeof OAUTH_FLOW_STATUS_IDLE
  | typeof OAUTH_FLOW_STATUS_PROVIDER_AUTH
  | typeof OAUTH_FLOW_STATUS_POST_LOGIN_PIPELINE
  | typeof OAUTH_FLOW_STATUS_CANCELLED
  | typeof OAUTH_FLOW_STATUS_FAILED
  | typeof OAUTH_FLOW_STATUS_COMPLETED;

export type OAuthFlowState = {
  status: OAuthFlowStatus;
  attemptId: number;
};

export type PipelineStep = {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
};

export type PipelineProgress = {
  currentStep: string;
  completed: number;
  total: number;
  steps: PipelineStep[];
};

export type PipelineSnapshot = {
  completed: number;
  total: number;
};

export const OAUTH_PIPELINE_STEPS: readonly string[] = [
  OAUTH_PIPELINE_STEP_SET_USER_TIME_ZONE,
  OAUTH_PIPELINE_STEP_REGISTER_FOR_NOTIFICATION,
  OAUTH_PIPELINE_STEP_SYNC_HOME_WITH_NODES,
  OAUTH_PIPELINE_STEP_GET_USER_PROFILE,
  OAUTH_PIPELINE_STEP_AUTO_CONNECT_MCP_CONNECTOR,
];

export type PipelineProgressSetter = (
  updater: (previous: PipelineProgress | null) => PipelineProgress | null
) => void;

/**
 * Creates the default OAuth state before any login attempt starts.
 * @returns Initial OAuth flow state.
 */
export function createInitialOAuthFlowState(): OAuthFlowState {
  return {
    status: OAUTH_FLOW_STATUS_IDLE,
    attemptId: 0,
  };
}

/**
 * Advances OAuth state to a new browser-auth attempt.
 * @param previousState Current OAuth state.
 * @returns OAuth state for the new attempt.
 */
export function startOAuthAttempt(previousState: OAuthFlowState): OAuthFlowState {
  return {
    status: OAUTH_FLOW_STATUS_PROVIDER_AUTH,
    attemptId: previousState.attemptId + 1,
  };
}

/**
 * Cancels the active OAuth attempt and invalidates stale callbacks.
 * @param previousState Current OAuth state.
 * @returns OAuth state after cancellation.
 */
export function cancelOAuthAttempt(previousState: OAuthFlowState): OAuthFlowState {
  return {
    status: OAUTH_FLOW_STATUS_CANCELLED,
    attemptId: previousState.attemptId + 1,
  };
}

/**
 * Checks whether the given attempt id still matches the active OAuth attempt.
 * @param state Current OAuth state.
 * @param attemptId Attempt id captured by async flow.
 * @returns True when attempt id is still current.
 */
export function isCurrentOAuthAttempt(
  state: OAuthFlowState,
  attemptId: number
): boolean {
  return state.attemptId === attemptId;
}

/**
 * Moves OAuth state into post-login pipeline phase for current attempt.
 * @param state Current OAuth state.
 * @param attemptId Attempt id captured by async flow.
 * @returns Updated state when attempt matches, else original.
 */
export function enterOAuthPostLoginPipeline(
  state: OAuthFlowState,
  attemptId: number
): OAuthFlowState {
  if (!isCurrentOAuthAttempt(state, attemptId)) {
    return state;
  }
  return {
    ...state,
    status: OAUTH_FLOW_STATUS_POST_LOGIN_PIPELINE,
  };
}

/**
 * Completes the current OAuth attempt.
 * @param state Current OAuth state.
 * @param attemptId Attempt id captured by async flow.
 * @returns Updated state when attempt matches, else original.
 */
export function completeOAuthAttempt(
  state: OAuthFlowState,
  attemptId: number
): OAuthFlowState {
  if (!isCurrentOAuthAttempt(state, attemptId)) {
    return state;
  }
  return {
    ...state,
    status: OAUTH_FLOW_STATUS_COMPLETED,
  };
}

/**
 * Marks the current OAuth attempt as failed.
 * @param state Current OAuth state.
 * @param attemptId Attempt id captured by async flow.
 * @returns Updated state when attempt matches, else original.
 */
export function failOAuthAttempt(
  state: OAuthFlowState,
  attemptId: number
): OAuthFlowState {
  if (!isCurrentOAuthAttempt(state, attemptId)) {
    return state;
  }
  return {
    ...state,
    status: OAUTH_FLOW_STATUS_FAILED,
  };
}

/**
 * Returns whether OAuth loading overlay should be visible for a status.
 * @param status Current OAuth status.
 * @returns True when overlay should remain visible.
 */
export function isOAuthLoadingStatus(status: OAuthFlowStatus): boolean {
  // Deliberately NOT during PROVIDER_AUTH, nor while the token is exchanged.
  // The provider owns the screen for the first (its sheet is presented over the
  // app, or the browser has the app backgrounded) and the second is a single
  // short request — replacing the login screen for either just flickers. The
  // provider button carries an inline spinner throughout; the login screen is
  // only given up once the post-login pipeline has real progress to report.
  return status === OAUTH_FLOW_STATUS_POST_LOGIN_PIPELINE;
}

/**
 * Returns whether app lifecycle should be monitored for browser cancellation.
 * @param status Current OAuth status.
 * @returns True when app resume can indicate browser cancellation.
 */
export function shouldMonitorOAuthAppLifecycle(
  status: OAuthFlowStatus
): boolean {
  return status === OAUTH_FLOW_STATUS_PROVIDER_AUTH;
}

/**
 * Whether an error is the user backing out of sign-in rather than something
 * going wrong — dismissing the native account sheet, or leaving the hosted
 * browser without authorising.
 *
 * The native modules reject with their own code, which travels through the
 * adapter and the SDK untouched, so both tags are matched here. Callers use
 * this to report a dismissal as a cancellation instead of a failure.
 * @param error Unknown thrown error from OAuth flow.
 * @returns True when the user cancelled.
 */
export function isOAuthCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes(OAUTH_CANCELLED_ERROR_TAG) ||
    error.message.includes(GOOGLE_SIGN_IN_CANCELLED_ERROR_TAG) ||
    (error as { code?: unknown }).code === GOOGLE_SIGN_IN_CANCELLED_ERROR_TAG
  );
}

/**
 * Maps SDK OAuth errors to user-friendly messages using i18n.
 * @param error Unknown thrown error from OAuth flow.
 * @param t i18next translation function (auth namespace keys under `auth.errors.*`).
 * @returns Toast-ready message describing the error.
 */
export function mapOAuthErrorToMessage(error: unknown, t: TFunction): string {
  if (error instanceof Error) {
    if (error.message.includes(OAUTH_NO_BROWSER_FOUND_ERROR_TAG)) {
      return t("auth.errors.oauthNoBrowser");
    }
    return t("auth.errors.oauthErrorWithMessage", { message: error.message });
  }
  return t("auth.errors.oauthUnknownFailure");
}

/**
 * Creates initial post-login progress state for OAuth pipeline UI.
 * @returns Initial progress state with pending steps.
 */
export function initPipelineProgress(): PipelineProgress {
  return {
    currentStep: "",
    completed: 0,
    total: OAUTH_PIPELINE_STEPS.length,
    steps: OAUTH_PIPELINE_STEPS.map((name) => ({
      name,
      status: "pending" as const,
    })),
  };
}

/**
 * Marks a pipeline step as running.
 * @param progress Existing progress state.
 * @param stepName Step that just started.
 * @returns Updated progress snapshot.
 */
export function markStepRunning(
  progress: PipelineProgress,
  stepName: string
): PipelineProgress {
  return {
    ...progress,
    currentStep: stepName,
    steps: progress.steps.map((step) =>
      step.name === stepName ? { ...step, status: "running" as const } : step
    ),
  };
}

/**
 * Marks a pipeline step as completed and updates completed count.
 * @param progress Existing progress state.
 * @param stepName Step that just finished.
 * @returns Updated progress snapshot.
 */
export function markStepCompleted(
  progress: PipelineProgress,
  stepName: string
): PipelineProgress {
  const updatedSteps = progress.steps.map((step) =>
    step.name === stepName ? { ...step, status: "completed" as const } : step
  );
  const completed = updatedSteps.filter(
    (step) => step.status === "completed"
  ).length;
  return {
    ...progress,
    currentStep: stepName,
    completed,
    steps: updatedSteps,
  };
}

/**
 * Applies explicit numeric progress reported by the pipeline executor.
 * @param progress Existing progress state.
 * @param stepName Current pipeline step name.
 * @param snapshot Progress numbers from executor callback.
 * @returns Updated progress snapshot.
 */
export function applyProgressSnapshot(
  progress: PipelineProgress,
  stepName: string,
  snapshot: PipelineSnapshot
): PipelineProgress {
  return {
    ...progress,
    currentStep: stepName,
    completed: snapshot.completed,
    total: snapshot.total,
  };
}

/**
 * Builds OAuth-specific post-login lifecycle hooks for pipeline progress UI.
 * @param setPipelineProgress State updater function from login hook.
 * @returns Post-login pipeline hooks wired for OAuth progress updates.
 */
export function createOAuthPostLoginPipelineHooks(
  setPipelineProgress: PipelineProgressSetter
): PostLoginPipelineHooks {
  return {
    onStepStart: (stepName) => {
      setPipelineProgress((previous) => {
        if (!previous) {
          return previous;
        }
        return markStepRunning(previous, stepName);
      });
    },
    onStepComplete: (stepName) => {
      setPipelineProgress((previous) => {
        if (!previous) {
          return previous;
        }
        return markStepCompleted(previous, stepName);
      });
    },
    onProgress: (stepName, state) => {
      setPipelineProgress((previous) => {
        if (!previous) {
          return previous;
        }
        return applyProgressSnapshot(previous, stepName, state);
      });
    },
  };
}
