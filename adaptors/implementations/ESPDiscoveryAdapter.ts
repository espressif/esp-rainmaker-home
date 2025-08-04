/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DISCOVERY_UPDATE_EVENT } from "@/utils/constants";
/**
 * ESP Discovery Adapter
 * 
 * This adapter is responsible for discovering ESP nodes (devices) that are available 
 * for provisioning on the local network. It provides functionality to:
 * - Start device discovery on the local network
 * - Listen for discovery updates and device announcements
 * - Stop the discovery process when needed
 * 
 * The discovery process helps identify unprovisioned ESP devices that can be 
 * configured and added to the user's network through the RainMaker platform.
 */
import {
  ESPLocalDiscoveryAdapterInterface,
  DiscoveryParamsInterface,
} from "@espressif/rainmaker-base-sdk";
import { NativeModules, DeviceEventEmitter } from "react-native";

const { ESPDiscoveryModule } = NativeModules;

/**
 * ESP Local Discovery Adapter Implementation
 * 
 * This adapter implements the ESPLocalDiscoveryAdapterInterface to provide
 * device discovery capabilities for ESP nodes available for provisioning.
 * It bridges the React Native layer with the native Android/iOS discovery modules.
 */
export const EspLocalDiscoveryAdapter: ESPLocalDiscoveryAdapterInterface = {
  /**
   * Start the discovery process and handle updates via callbacks.
   * 
   * This function initiates the device discovery process on the local network
   * to find ESP nodes that are available for provisioning. It sets up event
   * listeners to receive real-time updates about discovered devices.
   *
   * @param {(data: Record<string, any>) => void} callback - Callback function to handle 
   *        discovery updates, device announcements, status changes, or errors. The callback
   *        receives data about discovered nodes including device information, network
   *        details, and provisioning status.
   * @param {DiscoveryParamsInterface} Params - Configuration parameters for the discovery
   *        process, such as network interface settings, timeout values, and discovery
   *        scope (local network, specific subnets, etc.)
   * @returns {Promise<() => void>} A cleanup function that can be called to stop listening
   *          for discovery updates and remove event listeners.
   */
  startDiscovery: async (
    callback: (data: Record<string, any>) => void,
    Params: DiscoveryParamsInterface
  ): Promise<() => void> => {
    try {
      // Listen for discovery updates from the native module
      // This event listener receives real-time updates about discovered ESP nodes
      const discoveryUpdateListener = DeviceEventEmitter.addListener(
        DISCOVERY_UPDATE_EVENT,
        (data: Record<string, any>) => {
          callback(data);
        }
      );

      // Start the native discovery process with the provided parameters
      // This initiates the actual network scanning for ESP devices
      ESPDiscoveryModule.startDiscovery(Params);

      // Return a cleanup function to remove listeners and stop discovery
      // This ensures proper resource cleanup when discovery is no longer needed
      return () => {
        discoveryUpdateListener.remove();
      };
    } catch (error) {
      console.error("Error starting discovery:", error);
      return () => { }; // Return a no-op cleanup function in case of an error
    }
  },

  /**
   * Stop the ongoing discovery process.
   * 
   * This function terminates the active device discovery process and cleans up
   * any associated resources. It should be called when device discovery is no
   * longer needed to free up system resources and stop network scanning.
   * 
   * Note: This only stops the native discovery process. Event listeners should
   * be cleaned up separately using the cleanup function returned by startDiscovery.
   */
  stopDiscovery: async (): Promise<void> => {
    try {
      // Stop the native discovery process
      ESPDiscoveryModule.stopDiscovery();
    } catch (error) {
      console.error("Error stopping discovery:", error);
    }
  },
};
