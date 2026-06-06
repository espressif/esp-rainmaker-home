/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DISCOVERY_LOST_EVENT,
  DISCOVERY_UPDATE_EVENT,
  MATTER_DISCOVERY_CONFIG_KEY_NODE_IDS,
  MDNS_DOMAIN_LOCAL,
  MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
} from "@shared/utils/constants";
import {
  ESPLocalDiscoveryAdapterInterface,
  DiscoveryParamsInterface,
} from "@store";
import { DeviceEventEmitter, NativeModules, Platform } from "react-native";
import {
  formatMatterNodeIdForChipLog,
  MATTER_DISCOVERY_VERIFY_LOG,
} from "@shared/utils/matterNodeIdHex";
import {
  getMatterDiscoveryTargetNodeIds,
  syncMatterDiscoveryTargetNodeIds,
} from "./matterDiscoveryTargets";

/**
 * Android uses CHIP operational probing; iOS still browses `_matter._tcp.` via Bonjour
 * until a CHIP-backed iOS module is wired.
 */
const MatterNativeDiscoveryModule =
  Platform.OS === "android"
    ? NativeModules.MatterDiscoveryModule
    : NativeModules.ESPDiscoveryModule;

/**
 * Params from the Matter SDK use operational service type + `local.` domain.
 * @param params - Discovery params from the SDK subscription model.
 * @returns Native discovery config including target Matter node ids on Android.
 */
function resolvedMatterDiscoveryParams(
  params: DiscoveryParamsInterface,
): Record<string, string | string[]> {
  const serviceType = (
    params?.serviceType ?? MDNS_SERVICE_TYPE_MATTER_OPERATIONAL
  ).trim();
  let domain = (params?.domain ?? MDNS_DOMAIN_LOCAL).trim();
  if (domain === "local") {
    domain = MDNS_DOMAIN_LOCAL;
  }

  const nativeParams: Record<string, string | string[]> = {
    serviceType,
    domain,
  };

  if (Platform.OS === "android") {
    nativeParams[MATTER_DISCOVERY_CONFIG_KEY_NODE_IDS] = [
      ...getMatterDiscoveryTargetNodeIds(),
    ];
  }

  return nativeParams;
}

/**
 * Native `_<service>._tcp.` types may arrive trimmed of a trailing dot; compare loosely.
 * @param a - First service type string.
 * @param b - Second service type string.
 * @returns True when both refer to the same mDNS type.
 */
function serviceTypeMatches(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a || !b) return false;
  return a.replace(/\.$/, "") === b.replace(/\.$/, "");
}

/** Normalized mDNS service type key (no trailing dot) for Set/Map lookups. */
function normalizedServiceTypeKey(serviceType: string): string {
  return serviceType.replace(/\.$/, "");
}

const registeredServiceTypes = new Set<string>();
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
 * Matter local discovery adapter — same interface as RainMaker mDNS discovery, but on
 * Android delegates to CHIP `getConnectedDevicePointer` via [MatterDiscoveryModule].
 */
export const matterLocalDiscoveryAdapter: ESPLocalDiscoveryAdapterInterface & {
  stopDiscoveryForType: (serviceType: string) => Promise<void>;
  addLostListener: (
    callback: (data: Record<string, unknown>) => void,
    params?: DiscoveryParamsInterface,
  ) => Promise<() => void>;
  /** Syncs target node ids before the SDK starts CHIP operational probing (Android). */
  syncTargetNodeIds: (nodeIds: string[]) => void;
} = {
  /**
   * Starts Matter operational discovery and forwards native events to the callback.
   * @param callback - Invoked for each discovered Matter node payload.
   * @param params - SDK discovery params (`_matter._tcp.` / `local.`).
   * @returns Cleanup function that removes listeners and stops native discovery.
   */
  startDiscovery: async (
    callback: (data: Record<string, unknown>) => void,
    params: DiscoveryParamsInterface,
  ): Promise<() => void> => {
    try {
      const nativeParams = resolvedMatterDiscoveryParams(params);
      const expectedServiceType = String(nativeParams.serviceType);
      const shouldStartNativeBrowse = acquireServiceType(expectedServiceType);

      const discoveryUpdateListener = DeviceEventEmitter.addListener(
        DISCOVERY_UPDATE_EVENT,
        (data: Record<string, unknown>) => {
          const incoming =
            typeof data?.serviceType === "string" ? data.serviceType : undefined;
          if (!shouldForwardDiscoveryEvent(incoming, expectedServiceType)) {
            return;
          }
          console.log("[matterLocalDiscoveryAdapter] discoveryUpdateListener:", data);
          callback(data);
        },
      );

      if (shouldStartNativeBrowse && MatterNativeDiscoveryModule?.startDiscovery) {
        console.log(
          `${MATTER_DISCOVERY_VERIFY_LOG} matterLocalDiscoveryAdapter.startDiscovery → native:`,
          {
            serviceType: nativeParams.serviceType,
            domain: nativeParams.domain,
            matterNodeIds: (
              nativeParams[MATTER_DISCOVERY_CONFIG_KEY_NODE_IDS] as string[] | undefined
            )?.map((id) => formatMatterNodeIdForChipLog(id)),
          },
        );
        MatterNativeDiscoveryModule.startDiscovery(nativeParams);
      }

      return () => {
        discoveryUpdateListener.remove();
        if (releaseServiceType(expectedServiceType)) {
          if (
            typeof MatterNativeDiscoveryModule?.stopDiscoveryForType === "function"
          ) {
            MatterNativeDiscoveryModule.stopDiscoveryForType(expectedServiceType);
          } else {
            MatterNativeDiscoveryModule?.stopDiscovery?.();
          }
        }
      };
    } catch (error) {
      console.error("[matterLocalDiscoveryAdapter] Error starting discovery:", error);
      return () => {};
    }
  },

  /**
   * Stops every active Matter discovery session on the native side.
   */
  stopDiscovery: async (): Promise<void> => {
    try {
      registeredServiceTypes.clear();
      serviceTypeRefCounts.clear();
      MatterNativeDiscoveryModule?.stopDiscovery?.();
    } catch (error) {
      console.error("[matterLocalDiscoveryAdapter] Error stopping discovery:", error);
    }
  },

  /**
   * Stops the browse session for a specific service type.
   * @param serviceType - Operational Matter mDNS type.
   */
  stopDiscoveryForType: async (serviceType: string): Promise<void> => {
    try {
      const key = normalizedServiceTypeKey(serviceType);
      registeredServiceTypes.delete(key);
      serviceTypeRefCounts.delete(key);
      if (typeof MatterNativeDiscoveryModule?.stopDiscoveryForType === "function") {
        MatterNativeDiscoveryModule.stopDiscoveryForType(serviceType);
      } else {
        registeredServiceTypes.clear();
        serviceTypeRefCounts.clear();
        MatterNativeDiscoveryModule?.stopDiscovery?.();
      }
    } catch (error) {
      console.error(
        "[matterLocalDiscoveryAdapter] Error stopping discovery for type:",
        error,
      );
    }
  },

  /**
   * Listens for Matter operational discovery-lost events filtered by service type.
   * @param callback - Invoked when a previously discovered node is lost.
   * @param params - Discovery params used to filter by service type.
   * @returns Cleanup function that removes the lost listener.
   */
  addLostListener: async (
    callback: (data: Record<string, unknown>) => void,
    params: DiscoveryParamsInterface = {
      serviceType: MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
      domain: MDNS_DOMAIN_LOCAL,
    },
  ): Promise<() => void> => {
    const nativeParams = resolvedMatterDiscoveryParams(params);
    const expectedServiceType = String(nativeParams.serviceType);

    const discoveryLostListener = DeviceEventEmitter.addListener(
      DISCOVERY_LOST_EVENT,
      (data: Record<string, unknown>) => {
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

  /**
   * Updates the Matter node id list probed by the Android CHIP discovery module.
   * @param nodeIds - Hex Matter node ids from the active Matter home.
   */
  syncTargetNodeIds: (nodeIds: string[]): void => {
    syncMatterDiscoveryTargetNodeIds(nodeIds);
  },
};

export { setMatterDiscoveryTargetNodeIds } from "./matterDiscoveryTargets";
