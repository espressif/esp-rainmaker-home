/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ESPCDFStorageAdapterInterface } from "@store";
import { RUNTIME_CONFIG_STORAGE_KEYS } from '@config/runtime.keys.config';
import { LANGUAGE_STORAGE_KEY } from "@shared/utils/constants";

// Device-level preferences that must survive `clear()` (logout wipes user data,
// not app settings such as the language override).
const PROTECTED_KEYS = [
  ...Object.values(RUNTIME_CONFIG_STORAGE_KEYS),
  LANGUAGE_STORAGE_KEY,
];

export const asyncStorageAdapter: ESPCDFStorageAdapterInterface = {
  setItem: async (name: string, value: string) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      throw error;
    }
  },

  getItem: async (name: string): Promise<string | null> => {
    try {
      const response = await AsyncStorage.getItem(name);
      return response;
    } catch (error) {
      throw error;
    }
  },

  removeItem: async (name: string) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      throw error;
    }
  },

  clear: async () => {
    try {
      const saved = await Promise.all(
        PROTECTED_KEYS.map(async (k) => [k, await AsyncStorage.getItem(k)] as const)
      );
      await AsyncStorage.clear();
      await Promise.all(
        saved
          .filter(([, v]) => v !== null)
          .map(([k, v]) => AsyncStorage.setItem(k, v as string))
      );
    } catch (error) {
      throw error;
    }
  },
};

export default asyncStorageAdapter;
