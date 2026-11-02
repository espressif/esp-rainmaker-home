/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import {
  clearMatterNodeLocalTransport,
  ESPRMNeoMatterBase,
  getMatterNodeByNodeId,
  hydrateHybridLocalControlFromDevice,
  setMatterNodeLocalTransport,
  type ESPRMNeoFabric,
} from "@espressif/rainmaker-neo-matter-sdk";
import type { ESPCDFUser, ESPCDFMatterPrecommissionInfo } from "@store";
import { transformToESPCDFUser as transformToESPCDFUserFromNeoBase } from "@sdk-adaptors/ESPRMNeoBase/transformers/transformToESPCDFUser";
import { projectRmneoUpdateToCdf } from "@sdk-adaptors/ESPRMNeoBase/utils/helpers/cdfStoreSinkHelpers";
import { ESPMatterUtilityAdapter } from "@native-adaptors/implementations/ESPMatterUtilityAdapter";
import { ESPMatterControlAdapter } from "@native-adaptors/implementations/ESPMatterControlAdapter";
import { ESPRMNeoMatterBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { registerAttributeReadForUser } from "@shared/utils/matterAttributeRead";
import { registerMatterLocalNetworkHooks } from "@shared/utils/matterLocalNetworkHooks";
import {
  MATTER_LOCAL_DISCOVERY_EVENT,
  MATTER_LOCAL_DISCOVERY_LOST_EVENT,
} from "@shared/utils/constants";
import { transformToESPCDFGroup } from "./transformToESPCDFGroup";

/**
 * True for the Matter local discovery events, which have no SDK source on Neo.
 * @param event - CDF event type string.
 * @returns Whether the event is a Matter discovery or discovery-lost event.
 */
function isMatterLocalDiscoveryEvent(event: string): boolean {
  return (
    event === MATTER_LOCAL_DISCOVERY_EVENT ||
    event === MATTER_LOCAL_DISCOVERY_LOST_EVENT
  );
}

/**
 * Neo user → CDF user, with Matter-aware groups.
 *
 * Delegates everything to the Neo base transformer, injecting the Matter group
 * transform so every group-producing operation returns groups carrying the
 * commissioning verbs — `getGroups`, `syncHomeWithNodes`, `createGroup` and
 * `createHome` alike. Overriding `getGroups` alone is not enough: the store's
 * homes come from `syncHomeWithNodes`, and the commissioning screen reads them
 * from the store, so a group without the verbs fails at `convertToMatterFabric`.
 *
 * The SDK's `getGroups` already returns Matter-capable groups as `ESPRMNeoFabric`
 * (its `ESPRMNeoUser.getGroups` override), so the fabric detection in the group
 * transformer works off the instance type rather than a flag.
 * @param esprmneoUser - Neo SDK user, or null before login.
 * @param initialUserId - User id read from the id token.
 * @returns CDF user whose groups expose Matter commissioning.
 */
export function transformToESPCDFUser(
  esprmneoUser: ESPRMNeoUser | null,
  initialUserId = "",
): ESPCDFUser {
  const baseUser = transformToESPCDFUserFromNeoBase(
    esprmneoUser,
    initialUserId,
    (group, user) =>
      transformToESPCDFGroup(
        group as ESPRMNeoFabric,
        user,
        ESPRMNeoMatterBaseAdaptorIdentifier,
      ),
  );

  if (!esprmneoUser) {
    return baseUser;
  }

  /**
   * Credential handoff to the native CHIP stack.
   *
   * Both are stack-agnostic native calls, so they are reused from the RM Matter
   * adaptor rather than reimplemented. Without `storePrecommissionInfo` the
   * native `FabricSessionManager` holds a fabric with no user NoC, the Android
   * keystore returns an empty certificate chain, and `OperationalKeyConfig`
   * throws on a null root certificate the moment PASE begins.
   */
  const baseOperations = baseUser.operations;
  baseUser.operations = {
    ...baseOperations,

    /**
     * Matter discovery has no SDK event on Neo: the native listener in
     * matterLocalDiscovery already receives every discovery and mirrors the
     * LAN path into the SDK (setMatterNodeLocalTransport). Accepting the
     * subscription as a no-op stops the caller retrying and warning on every
     * start; every other event still goes to the Neo base adaptor.
     */
    async subscribeToEvent(
      event: string,
      callback: (data: any) => void,
    ): Promise<void> {
      if (isMatterLocalDiscoveryEvent(event)) return;
      return baseOperations.subscribeToEvent(event, callback);
    },

    async unsubscribeFromEvent(
      event: string,
      callback: (data: any) => void,
    ): Promise<void> {
      if (isMatterLocalDiscoveryEvent(event)) return;
      return baseOperations.unsubscribeFromEvent(event, callback);
    },

    /**
     * Logs out, then drops every device from the SDK's Matter channel (so its
     * own retry cannot reopen a link) and closes every Matter link. A link
     * opened while logout runs belongs to nobody and would double reports.
     */
    async logout(): Promise<void> {
      try {
        await baseOperations.logout?.();
      } finally {
        try {
          await ESPRMNeoMatterBase.getMatterSubscriptionChannel()?.unsubscribe();
          await ESPMatterControlAdapter.shutdown?.();
        } catch (error) {
          console.warn(
            "[neoMatterTransformToESPCDFUser] Matter subscription shutdown on logout failed:",
            error,
          );
        }
      }
    },

    async isUserNocAvailableForFabric(fabricId: string): Promise<boolean> {
      return ESPMatterUtilityAdapter.isUserNocAvailableForFabric(fabricId);
    },

    async storePrecommissionInfo(
      info: ESPCDFMatterPrecommissionInfo,
    ): Promise<void> {
      return ESPMatterUtilityAdapter.storePrecommissionInfo(info);
    },
  };
  baseUser.identifier = ESPRMNeoMatterBaseAdaptorIdentifier;

  // One-shot attribute read for Control's panel-open refresh (Control.tsx
  // gates on `node.isMatter` and calls `readAttributesForNodeId`). Live
  // subscription frames need NO app-side routing on this stack: the SDK's
  // "matter" channel already emits registry-mapped `{deviceId: {paramId}}`
  // payloads and the base store sink projects them into CDF.
  registerAttributeReadForUser(baseUser, async (nodeId) => {
    const node = getMatterNodeByNodeId(nodeId);
    if (!node) return;
    // Skip when the node has no LAN path yet — every read would just time out.
    if (!node.availableTransports?.matter_local) return;
    try {
      const payload = await node.refreshMatterParams();
      if (payload && Object.keys(payload).length > 0) {
        projectRmneoUpdateToCdf({
          nodeId,
          source: "matter",
          eventType: "rmaker.event.node_params_changed",
          payload,
        });
      }
    } catch (error) {
      console.warn(
        `[neoMatterTransformToESPCDFUser] attribute read failed for node ${nodeId}:`,
        error,
      );
    }
  });

  // Discovery tells the SDK when a node is on the LAN, so `param.setValue` can
  // send over Wi-Fi. Only this adaptor registers, so classic never loads the
  // Neo SDK. Unknown node ids are ignored by the SDK.
  registerMatterLocalNetworkHooks(baseUser, {
    async updateReachability(matterNodeId, address, change) {
      if (change === "add") {
        setMatterNodeLocalTransport(
          matterNodeId,
          address as Parameters<typeof setMatterNodeLocalTransport>[1],
        );
      } else {
        clearMatterNodeLocalTransport(matterNodeId);
      }
    },
    // A phone that did not commission a hybrid has no saved setup for it
    // (the cloud never stores it), so it reads one off the device.
    readHybridSetupFromDevice: (matterNodeId) =>
      hydrateHybridLocalControlFromDevice(matterNodeId),
  });

  return baseUser;
}
