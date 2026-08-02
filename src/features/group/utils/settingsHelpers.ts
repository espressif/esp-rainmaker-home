/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export type GroupSharingInviteValidationResult = {
  isValid: boolean;
  error?: string;
};

/**
 * Validates the group share / transfer invite field. The invite is the
 * invitee's username on every SDK stack; its format is enforced by the
 * backend (unknown users surface as `USER_NOT_FOUND` on submit), so the app
 * only requires a non-empty value.
 * @param value - Raw invite field input
 * @returns Validation result consumed by the shared `Input` component
 */
export function validateGroupSharingInvite(
  value: string,
): GroupSharingInviteValidationResult {
  return { isValid: value.trim().length > 0 };
}

/**
 * Normalizes the invite before it is sent as `toUserName` to the share /
 * transfer store operations.
 * @param value - Invite field input that passed validation
 * @returns Trimmed username
 */
export function normalizeGroupSharingInviteForApi(value: string): string {
  return value.trim();
}
