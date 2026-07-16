/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zh from "./locales/zh.json";
import {
  LANGUAGE_CODE_SYSTEM,
  LANGUAGE_DEFAULT,
  LANGUAGE_REGIONAL_MAP,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGE_CODES,
  type SupportedLanguageCode,
} from "./src/shared/utils/constants";

/**
 * Resolves the active OS language to one of the `SUPPORTED_LANGUAGE_CODES`.
 * Tries the most specific BCP-47 tag (e.g. `zh-Hans-CN`) first, then progressively
 * less specific (`zh-Hans`, `zh`); returns `LANGUAGE_DEFAULT` if nothing matches.
 * @returns The supported language code that best matches the device locale.
 */
const getDeviceLanguage = (): SupportedLanguageCode => {
  const locales = Localization.getLocales();
  for (const locale of locales) {
    const candidates: string[] = [];
    if (locale.languageTag) {
      // Progressively drop trailing segments: e.g. `zh-Hans-CN` → `zh-Hans` → `zh`.
      const parts = locale.languageTag.split("-");
      while (parts.length > 0) {
        candidates.push(parts.join("-"));
        parts.pop();
      }
    }
    if (locale.languageCode) candidates.push(locale.languageCode);
    for (const candidate of candidates) {
      if (LANGUAGE_REGIONAL_MAP[candidate]) {
        return LANGUAGE_REGIONAL_MAP[candidate];
      }
    }
  }
  return LANGUAGE_DEFAULT;
};

const deviceLanguage = getDeviceLanguage();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: deviceLanguage,
  fallbackLng: LANGUAGE_DEFAULT,
  supportedLngs: [...SUPPORTED_LANGUAGE_CODES],
  interpolation: {
    escapeValue: false,
  },
});

/**
 * Reads any persisted language override from AsyncStorage and applies it.
 * Runs as a fire-and-forget side-effect so app boot is not blocked on storage I/O.
 * If the stored value is `LANGUAGE_CODE_SYSTEM` or unsupported, the device-detected
 * language already set during init is left in place.
 */
const applyPersistedLanguage = async (): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (
      stored &&
      stored !== LANGUAGE_CODE_SYSTEM &&
      (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(stored) &&
      stored !== i18n.language
    ) {
      await i18n.changeLanguage(stored);
    }
  } catch (error) {
    console.warn("[i18n] Failed to read persisted language", error);
  }
};

void applyPersistedLanguage();

/**
 * Returns the language that would be used right now if no manual override existed
 * (i.e. the value derived from the device locale). UI uses this to render the
 * "follow system" option in the language picker.
 * @returns Supported language code derived from the current device locale.
 */
export const getSystemLanguage = (): SupportedLanguageCode => getDeviceLanguage();

export default i18n;
