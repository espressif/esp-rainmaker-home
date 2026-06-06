/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DISCOVERY_LOST_EVENT,
  DISCOVERY_UPDATE_EVENT,
  MDNS_DOMAIN_LOCAL,
  MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
} from "@shared/utils/constants";
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
 *
 * The native modules emit `DiscoveryUpdate` payloads of the shape:
 *   { nodeId, baseUrl, host?, port?, txt?: { [key: string]: string } }
 * `host`/`port`/`txt` are populated for resolved Bonjour/NSD services and let
 * higher layers drive flows that need direct LAN HTTP communication
 * (e.g. on-network challenge-response provisioning).
 */
import {
  ESPLocalDiscoveryAdapterInterface,
  DiscoveryParamsInterface,
} from "@store";
import { NativeModules, DeviceEventEmitter } from "react-native";

const { ESPDiscoveryModule } = NativeModules;

/**
 * Params from `ESPDiscoveryManager` use `serviceType: ESP_LOCAL_CTRL_TCP` and `domain: "local"`.
 * Normalize for native: Bonjour expects `local.`; Android ignores domain today but we pass through.
 */
function resolvedMdnsParams(
  params: DiscoveryParamsInterface
): Record<string, string> {
  const serviceType = (
    params?.serviceType ?? MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL
  ).trim();
  let domain = (params?.domain ?? MDNS_DOMAIN_LOCAL).trim();
  if (domain === "local") {
    domain = MDNS_DOMAIN_LOCAL;
  }
  return { serviceType, domain };
}

/**
 * Native `_<service>._tcp.` types may arrive trimmed of a trailing dot; compare loosely.
 */
function serviceTypeMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/\.$/, "") === b.replace(/\.$/, "");
}

/** Normalized mDNS service type key (no trailing dot) for Set/Map lookups. */
function normalizedServiceTypeKey(serviceType: string): string {
  return serviceType.replace(/\.$/, "");
}

/**
 * Active browse service types (normalized keys). Each concurrent `startDiscovery`
 * registers its type so multi-browse listeners can filter cross-talk.
 */
const registeredServiceTypes = new Set<string>();

/** Reference count per service type — native browse starts/stops with first/last ref. */
const serviceTypeRefCounts = new Map<string, number>();

/**
 * Registers a service-type browse. Returns true when this is the first ref (native start needed).
 * @param serviceType - mDNS service type from discovery params.
 * @returns Whether native `startDiscovery` should be invoked.
 */
function acquireServiceType(serviceType: string): boolean {
  const key = normalizedServiceTypeKey(serviceType);
  const next = (serviceTypeRefCounts.get(key) ?? 0) + 1;
  serviceTypeRefCounts.set(key, next);
  registeredServiceTypes.add(key);
  return next === 1;
}

/**
 * Unregisters a service-type browse. Returns true when this was the last ref (native stop needed).
 * @param serviceType - mDNS service type from discovery params.
 * @returns Whether native `stopDiscoveryForType` should be invoked.
 */
function releaseServiceType(serviceType: string): boolean {
  const key = normalizedServiceTypeKey(serviceType);
  const current = serviceTypeRefCounts.get(key) ?? 0;
  if (current <= 1) {
    serviceTypeRefCounts.delete(key);
    registeredServiceTypes.delete(key);
    return true;
  }
  serviceTypeRefCounts.set(key, current - 1);
  return false;
}

/**
 * Whether a discovery event should reach a listener for `expectedServiceType`.
 *
 * Pass-through when native omits `serviceType` (legacy). Drop only when the payload
 * targets another actively registered browse type.
 * @param incoming - `serviceType` from the native event, if present.
 * @param expectedServiceType - Service type the listener registered for.
 * @returns True when the event should be forwarded to the callback.
 */
function shouldForwardDiscoveryEvent(
  incoming: string | undefined,
  expectedServiceType: string,
): boolean {
  if (!incoming) {
    return true;
  }
  if (serviceTypeMatches(incoming, expectedServiceType)) {
    return true;
  }
  if (registeredServiceTypes.has(normalizedServiceTypeKey(incoming))) {
    return false;
  }
  return true;
}

/**
 * ESP Local Discovery Adapter Implementation
 * 
 * This adapter implements the ESPLocalDiscoveryAdapterInterface to provide
 * device discovery capabilities for ESP nodes available for provisioning.
 * It bridges the React Native layer with the native Android/iOS discovery modules.
 */
export const EspLocalDiscoveryAdapter: ESPLocalDiscoveryAdapterInterface & {
  /** Stops only the browse session for the given service type (per-type teardown for multi-browse). */
  stopDiscoveryForType: (serviceType: string) => Promise<void>;
  /** Adds listener for service-loss events filtered by service type. */
  addLostListener: (
    callback: (data: Record<string, any>) => void,
    params?: DiscoveryParamsInterface,
  ) => Promise<() => void>;
} = {
  /**
   * Start the discovery process and handle updates via callbacks.
   *
   * This function initiates the device discovery process on the local network
   * to find ESP nodes that are available for provisioning. It sets up event
   * listeners to receive real-time updates about discovered devices.
   * @param callback - Callback function to handle 
   *        discovery updates, device announcements, status changes, or errors. The callback
   *        receives data about discovered nodes including device information, network
   *        details, and provisioning status.
   * @param Params - Configuration parameters for the discovery
   *        process, such as network interface settings, timeout values, and discovery
   *        scope (local network, specific subnets, etc.)
   * @returns A cleanup function that can be called to stop listening
   *          for discovery updates and remove event listeners.
   */
  startDiscovery: async (
    callback: (data: Record<string, any>) => void,
    Params: DiscoveryParamsInterface
  ): Promise<() => void> => {
    try {
      console.log("[localDiscoveryAdapter] startDiscovery:", Params);
      const nativeParams = resolvedMdnsParams(Params);
      const expectedServiceType = nativeParams.serviceType;
      const shouldStartNativeBrowse = acquireServiceType(expectedServiceType);

      // Multi-browse: native emits a single `DiscoveryUpdate` stream with a
      // `serviceType` discriminator. Filter so each caller only sees events
      // for the type it asked for, without dropping other active browses.
      const discoveryUpdateListener = DeviceEventEmitter.addListener(
        DISCOVERY_UPDATE_EVENT,
        (data: Record<string, any>) => {
          const incoming =
            typeof data?.serviceType === "string" ? data.serviceType : undefined;
          if (!shouldForwardDiscoveryEvent(incoming, expectedServiceType)) {
            return;
          }
          console.log("[EspLocalDiscoveryAdapter] discoveryUpdateListener:", data);
          callback(data);
        },
      );

      if (shouldStartNativeBrowse) {
        ESPDiscoveryModule.startDiscovery(nativeParams);
      }

      return () => {
        discoveryUpdateListener.remove();
        if (releaseServiceType(expectedServiceType)) {
          if (typeof ESPDiscoveryModule?.stopDiscoveryForType === "function") {
            ESPDiscoveryModule.stopDiscoveryForType(expectedServiceType);
          } else {
            ESPDiscoveryModule.stopDiscovery();
          }
        }
      };
    } catch (error) {
      console.error("Error starting discovery:", error);
      return () => { }; // Return a no-op cleanup function in case of an error
    }
  },

  /**
   * Stop every active mDNS browse session.
   *
   * Note: This stops ALL service-type browses on the native side. To stop a
   * single service type while leaving others running, use `stopDiscoveryForType`.
   * Event listeners should be cleaned up separately using the cleanup function
   * returned by `startDiscovery`.
   */
  stopDiscovery: async (): Promise<void> => {
    try {
      registeredServiceTypes.clear();
      serviceTypeRefCounts.clear();
      ESPDiscoveryModule.stopDiscovery();
    } catch (error) {
      console.error("Error stopping discovery:", error);
    }
  },

  /**
   * Stop the browse session for a specific service type, leaving any other
   * concurrent browses untouched. No-op if no session is running for that type.
   */
  stopDiscoveryForType: async (serviceType: string): Promise<void> => {
    try {
      const key = normalizedServiceTypeKey(serviceType);
      registeredServiceTypes.delete(key);
      serviceTypeRefCounts.delete(key);
      if (typeof ESPDiscoveryModule?.stopDiscoveryForType === "function") {
        ESPDiscoveryModule.stopDiscoveryForType(serviceType);
      } else {
        // Older native build without per-type stop — fall back to global stop.
        registeredServiceTypes.clear();
        serviceTypeRefCounts.clear();
        ESPDiscoveryModule.stopDiscovery();
      }
    } catch (error) {
      console.error("Error stopping discovery for type:", error);
    }
  },

  /**
   * Listen for discovery-lost events for a single service type.
   *
   * Used by the Matter SDK subscription model so it can emit
   * `matterLocalDiscoveryLost` without app-managed listeners.
   */
  addLostListener: async (
    callback: (data: Record<string, any>) => void,
    params: DiscoveryParamsInterface = {
      serviceType: MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
      domain: MDNS_DOMAIN_LOCAL,
    },
  ): Promise<() => void> => {
    const nativeParams = resolvedMdnsParams(params);
    const expectedServiceType = nativeParams.serviceType;

    const discoveryLostListener = DeviceEventEmitter.addListener(
      DISCOVERY_LOST_EVENT,
      (data: Record<string, any>) => {
        const incoming =
          typeof data?.serviceType === "string" ? data.serviceType : undefined;
        if (!shouldForwardDiscoveryEvent(incoming, expectedServiceType)) {
          return;
        }
        callback(data);
      },
    );

    return () => {
      discoveryLostListener.remove();
    };
  },
};
