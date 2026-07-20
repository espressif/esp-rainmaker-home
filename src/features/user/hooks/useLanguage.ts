/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";

import i18n, { getSystemLanguage } from "@/i18n";
import {
  LANGUAGE_CODE_EN,
  LANGUAGE_CODE_SYSTEM,
  LANGUAGE_CODE_ZH,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGE_CODES,
  type SupportedLanguageCode,
} from "@shared/utils/constants";

/** Sentinel `"system"` is allowed in the picker; persists to "follow device language". */
export type LanguageSelection = SupportedLanguageCode | typeof LANGUAGE_CODE_SYSTEM;

export interface LanguageOption {
  /** Unique value stored in AsyncStorage and used as React key. */
  value: LanguageSelection;
  /** i18n key used to render the option label in the picker. */
  labelKey: string;
}

/**
 * Stable list of language options shown in the picker. Keep order in sync with
 * `SUPPORTED_LANGUAGE_CODES`; "System default" always sits at the top.
 */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { value: LANGUAGE_CODE_SYSTEM, labelKey: "user.language.systemDefault" },
  { value: LANGUAGE_CODE_EN, labelKey: "user.language.english" },
  { value: LANGUAGE_CODE_ZH, labelKey: "user.language.chinese" },
] as const;

/**
 * Reads the persisted language override (or `"system"` if none).
 * Used to render the "selected" state in the picker — distinct from the
 * resolved active language, which is always one of `SUPPORTED_LANGUAGE_CODES`.
 * @returns Persisted selection (`"system"` when no override set) or `null` while loading.
 */
const readPersistedSelection = async (): Promise<LanguageSelection> => {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (
    stored &&
    (stored === LANGUAGE_CODE_SYSTEM ||
      (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(stored))
  ) {
    return stored as LanguageSelection;
  }
  return LANGUAGE_CODE_SYSTEM;
};

interface UseLanguageResult {
  /** What the user picked (`"system"` | `"en"` | `"zh"`). Drives the checkmark. */
  selection: LanguageSelection;
  /** Resolved language currently in use (always one of `SUPPORTED_LANGUAGE_CODES`). */
  activeLanguage: SupportedLanguageCode;
  /** Static list of options to render in the picker UI. */
  options: readonly LanguageOption[];
  /** Whether a language switch is currently in flight (prevents double-taps). */
  isUpdating: boolean;
  /**
   * Persists the selection and applies it to i18next. Passing `"system"` clears
   * any override and re-applies the device-detected language.
   */
  setLanguage: (next: LanguageSelection) => Promise<void>;
}

/**
 * Hook that powers the in-app language picker. Reads the persisted user
 * selection, exposes the list of supported options, and writes new picks back
 * to AsyncStorage while invoking `i18n.changeLanguage` so the entire UI
 * re-renders in the chosen locale.
 * @returns Selection state, options, and an updater used by the picker screen.
 */
export const useLanguage = (): UseLanguageResult => {
  const { i18n: i18nInstance } = useTranslation();
  const [selection, setSelection] = useState<LanguageSelection>(
    LANGUAGE_CODE_SYSTEM
  );
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readPersistedSelection()
      .then((value) => {
        if (!cancelled) setSelection(value);
      })
      .catch((error) => {
        console.warn("[useLanguage] Failed to read persisted selection", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback(
    async (next: LanguageSelection): Promise<void> => {
      if (next === selection || isUpdating) return;
      setIsUpdating(true);
      try {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        const resolved =
          next === LANGUAGE_CODE_SYSTEM ? getSystemLanguage() : next;
        if (resolved !== i18nInstance.language) {
          await i18nInstance.changeLanguage(resolved);
        }
        setSelection(next);
      } catch (error) {
        console.warn("[useLanguage] Failed to update language", error);
      } finally {
        setIsUpdating(false);
      }
    },
    [selection, isUpdating, i18nInstance]
  );

  const activeLanguage =
    ((SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(i18n.language)
      ? i18n.language
      : getSystemLanguage()) as SupportedLanguageCode;

  return {
    selection,
    activeLanguage,
    options: LANGUAGE_OPTIONS,
    isUpdating,
    setLanguage,
  };
};
