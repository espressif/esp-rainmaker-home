/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WifiCredential {
  ssid: string;
  password: string;
  timestamp: number;
}

const STORAGE_KEY = '@wifi_credentials';

/**
 * Hook for managing WiFi credentials in storage
 * 
 * Features:
 * - Save WiFi credentials
 * - Retrieve saved passwords
 * - Check if network exists
 * - Remove saved networks
 * - Auto-load saved networks on mount
 */
export const useWifiStorage = () => {
  const [savedNetworks, setSavedNetworks] = useState<WifiCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved networks on mount
  useEffect(() => {
    loadSavedNetworks();
  }, []);

  /**
   * Load saved networks from storage
   */
  const loadSavedNetworks = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedNetworks(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading saved networks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Save a network's credentials
   * @param ssid Network SSID
   * @param password Network password
   * @returns Promise<boolean> Success status
   */
  const saveNetwork = async (ssid: string, password: string): Promise<boolean> => {
    try {
      const newNetwork: WifiCredential = {
        ssid,
        password,
        timestamp: Date.now()
      };

      const updatedNetworks = [...savedNetworks];
      const existingIndex = updatedNetworks.findIndex(n => n.ssid === ssid);

      if (existingIndex >= 0) {
        // Update existing network
        updatedNetworks[existingIndex] = newNetwork;
      } else {
        // Add new network
        updatedNetworks.push(newNetwork);
      }

      // Sort by most recently used
      updatedNetworks.sort((a, b) => b.timestamp - a.timestamp);

      // Keep only the last 10 networks
      const trimmedNetworks = updatedNetworks.slice(0, 10);

      // Save to storage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedNetworks));
      setSavedNetworks(trimmedNetworks);
      return true;
    } catch (error) {
      console.error('Error saving network:', error);
      return false;
    }
  };

  /**
   * Remove a saved network
   * @param ssid Network SSID to remove
   * @returns Promise<boolean> Success status
   */
  const removeNetwork = async (ssid: string): Promise<boolean> => {
    try {
      const updatedNetworks = savedNetworks.filter(n => n.ssid !== ssid);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedNetworks));
      setSavedNetworks(updatedNetworks);
      return true;
    } catch (error) {
      console.error('Error removing network:', error);
      return false;
    }
  };

  /**
   * Get a saved network's password
   * @param ssid Network SSID
   * @returns string | null Password if found, null otherwise
   */
  const getNetworkPassword = (ssid: string): string | null => {
    const network = savedNetworks.find(n => n.ssid === ssid);
    return network?.password || null;
  };

  /**
   * Check if a network exists in storage
   * @param ssid Network SSID
   * @returns boolean True if network exists
   */
  const doesNetworkExist = (ssid: string): boolean => {
    return savedNetworks.some(n => n.ssid === ssid);
  };

  /**
   * Clear all saved networks
   * @returns Promise<boolean> Success status
   */
  const clearNetworks = async (): Promise<boolean> => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setSavedNetworks([]);
      return true;
    } catch (error) {
      console.error('Error clearing networks:', error);
      return false;
    }
  };

  return {
    savedNetworks,
    isLoading,
    saveNetwork,
    removeNetwork,
    getNetworkPassword,
    doesNetworkExist,
    clearNetworks
  };
}; 