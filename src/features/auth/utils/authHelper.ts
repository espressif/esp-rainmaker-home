/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from "i18next";
import { ActiveSDK, SDK_FEATURE_MAP } from "@config/sdk.config";
import { runtimeConfigManager } from "@config/runtime.config";
import {
  validateEmail,
  validatePhoneE164,
  isPhoneLikeMissingLeadingPlus,
} from "@shared/utils/validations";

/** Username kinds accepted by the active SDK (`SDK_FEATURE_MAP.authAllowedUsernameTypes`). */
export type AuthUsernameType = "email" | "phone";

const FALLBACK: readonly AuthUsernameType[] = ["email"];

/**
 * Allowed username kinds for the active SDK (`SDK_FEATURE_MAP.authAllowedUsernameTypes`;
 * runtime scan wins, else compile-time ActiveSDK).
 */
export function getAuthAllowedUsernameTypes(): readonly AuthUsernameType[] {
  const sdk = runtimeConfigManager.activeSdk ?? ActiveSDK;
  const raw = SDK_FEATURE_MAP[sdk]?.authAllowedUsernameTypes;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw as readonly AuthUsernameType[];
  }
  return FALLBACK;
}

const VERIFICATION_CODE_LENGTH = 6;
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 30;

export type AuthValidationResult = {
  isValid: boolean;
  error?: string;
};

/**
 * Creates an email validator. Pure function - no side effects.
 */
export const createEmailValidator =
  (t: TFunction) =>
  (email: string): AuthValidationResult => {
    if (!email.trim()) {
      return { isValid: false };
    }
    if (!validateEmail(email)) {
      return { isValid: false, error: t("auth.validation.invalidEmail") };
    }
    return { isValid: true };
  };

/**
 * Checks whether username allowed for auth matches the expected condition.
 */
export function isUsernameAllowedForAuth(
  value: string,
  allowed: readonly AuthUsernameType[]
): boolean {
  const v = value.trim();
  if (!v) return false;
  if (allowed.includes("email") && validateEmail(v)) return true;
  if (allowed.includes("phone") && validatePhoneE164(v)) return true;
  return false;
}

/**
 * Validator for login/signup username based on SDK-allowed kinds (email and/or E.164 phone).
 */
export const createAuthUsernameValidator =
  (allowed: readonly AuthUsernameType[], t: TFunction) =>
  (username: string): AuthValidationResult => {
    const v = username.trim();
    if (!v) {
      return { isValid: false };
    }
    if (isUsernameAllowedForAuth(username, allowed)) {
      return { isValid: true };
    }
    const emailOnly = allowed.length === 1 && allowed[0] === "email";
    if (emailOnly) {
      return { isValid: false, error: t("auth.validation.invalidEmail") };
    }

    if (v.includes("@")) {
      return { isValid: false, error: t("auth.validation.invalidEmail") };
    }
    if (allowed.includes("phone")) {
      if (v.startsWith("+")) {
        return {
          isValid: false,
          error: t("auth.validation.invalidPhoneE164"),
        };
      }
      if (isPhoneLikeMissingLeadingPlus(v)) {
        return {
          isValid: false,
          error: t("auth.validation.phoneMustStartWithCountryCode"),
        };
      }
    }
    return {
      isValid: false,
      error: t("auth.validation.invalidEmailOrPhone"),
    };
  };

/**
 * Creates a simple password validator (non-empty). Pure function - no side effects.
 */
export const createPasswordValidator =
  (_t: TFunction) =>
  (password: string): AuthValidationResult => {
    if (!password?.trim()) {
      return { isValid: false };
    }
    return { isValid: true };
  };

/**
 * Creates a confirm password validator. Pure function - no side effects.
 * Matches confirm password exactly as entered (no trimming).
 */
export const createConfirmPasswordValidator =
  (getPasswordToMatch: () => string, t: TFunction) =>
  (confirmPwd: string): AuthValidationResult => {
    if (!confirmPwd.trim()) {
      return { isValid: false };
    }
    if (confirmPwd !== getPasswordToMatch()) {
      return {
        isValid: false,
        error: t("auth.validation.passwordsDoNotMatch"),
      };
    }
    return { isValid: true };
  };

/**
 * Creates a verification code validator with configurable error message.
 * Pure function - no side effects.
 */
export const createCodeValidator =
  (invalidCodeMessage: string) =>
  (inputCode: string): AuthValidationResult => {
    if (!inputCode.trim()) {
      return { isValid: false };
    }
    if (inputCode.trim().length !== VERIFICATION_CODE_LENGTH) {
      return {
        isValid: false,
        error: invalidCodeMessage,
      };
    }
    return { isValid: true };
  };

/**
 * Creates a nickname validator for Agent terms. Pure function - no side effects.
 */
export const createNicknameValidator =
  (t: TFunction) =>
  (value: string): AuthValidationResult => {
    if (!value.trim()) {
      return { isValid: false };
    }
    if (value.trim().length < NICKNAME_MIN_LENGTH) {
      return {
        isValid: false,
        error: t("auth.validation.nameMinLength"),
      };
    }
    if (value.trim().length > NICKNAME_MAX_LENGTH) {
      return {
        isValid: false,
        error: t("auth.validation.nameMaxLength"),
      };
    }
    return { isValid: true };
  };

/**
 * Creates a new password validator for change password flow.
 * Ensures new password is different from old password.
 */
export const createNewPasswordValidator =
  (getOldPassword: () => string, t: TFunction) =>
  (password: string): AuthValidationResult => {
    if (!password.trim()) {
      return { isValid: false };
    }
    if (password === getOldPassword()) {
      return {
        isValid: false,
        error: t("auth.validation.newPasswordSameAsCurrent"),
      };
    }
    return { isValid: true };
  };

/**
 * Surfaces a user-visible auth error string from CDF / adaptor throws.
 * Prefers `description` (adaptor contract), then `message` (SDK Error).
 * @param error - Caught value from an auth store call
 * @returns First non-empty description/message, or `undefined`
 */
export function getAuthErrorDescription(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return typeof error === "string" && error.trim() ? error : undefined;
  }
  const err = error as { description?: unknown; message?: unknown };
  if (typeof err.description === "string" && err.description.trim()) {
    return err.description;
  }
  if (typeof err.message === "string" && err.message.trim()) {
    return err.message;
  }
  return undefined;
}
