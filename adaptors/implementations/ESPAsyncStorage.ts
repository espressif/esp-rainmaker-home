/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ESPRMStorageAdapterInterface } from "@espressif/rainmaker-base-sdk";

export const asyncStorageAdapter: ESPRMStorageAdapterInterface = {
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
      await AsyncStorage.clear();
    } catch (error) {
      throw error;
    }
  },
};

export default asyncStorageAdapter;
