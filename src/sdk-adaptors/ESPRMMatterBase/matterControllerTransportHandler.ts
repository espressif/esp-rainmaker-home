/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDF,
  handleNodeTransportUpdate,
} from "@store";
import {
  ESPRMBase,
  ESPRMNode,
  type ESPNodeUpdateData,
} from "@espressif/rainmaker-base-sdk";
import type { ESPRMUser, MatterControllerTransportMetadata } from "@espressif/rainmaker-matter-sdk";
import {
  MATTER_CONTROLLER_FOUND_EVENT,
  MATTER_CONTROLLER_LOST_EVENT,
  MATTER_CONTROLLER_TRANSPORT_KEY,
  RMAKER_EVENT_NODE_CONNECTED,
  RMAKER_EVENT_NODE_DISCONNECTED,
  RMAKER_EVENT_NODE_PARAMS_CHANGED,
} from "@shared/utils/constants";
import {
  MATTER_CTL_SETUP_SERVICE_TYPE,
  MATTER_CTL_SETUP_PARAM_MT_DEVICES,
} from "./constants";
import {
  type ControllerMTNodeMap,
  type MtDeviceReachability,
  extractMtDeviceReachability,
  matterCtlSetupToSingleNodeUpdate,
  parseMatterCtlSetupPayload,
} from "./matterControllerPayload";

interface MatterControllerEvent {
  nodeId: string;
}

/** SDK Matter controller node used for cloud subscription wiring. */
type MatterController = ESPRMNode;

const LOG_PREFIX = "MatterControllerTransportHandler";

/** Matter node-update handler registered by `transformToESPCDFUser`. */
let matterNodeUpdateHandler: ((update: ESPNodeUpdateData) => void) | null =
  null;

/**
 * Registers the matter `handleNodeUpdate` callback for controller fan-out.
 * @param handler - Handler from `subscribeToNodeUpdates`, or null on teardown
 */
export function setMatterNodeUpdateHandler(
  handler: ((update: ESPNodeUpdateData) => void) | null,
): void {
  matterNodeUpdateHandler = handler;
}

/**
 * Maps one `MatterCTLSetup` push to a peer update and fires `handleNodeUpdate`.
 * @param update - SDK subscription update for the controller node
 */
function dispatchControllerSetupNodeUpdate(update: ESPNodeUpdateData): void {
  const handler = matterNodeUpdateHandler;
  if (!handler) {
    return;
  }

  const synthetic = matterCtlSetupToSingleNodeUpdate(
    update.payload,
    (update.metadata?.timestamp as number | undefined) ?? Date.now(),
  );
  if (!synthetic) {
    return;
  }

  handler(synthetic);
}

/**
 * Reads MT device reachability from the controller node's setup service.
 * @param controllerNodeId - RainMaker node id of the Matter controller
 * @returns MT device entries, or null if controller or setup data is missing
 */
function getControllerMtDeviceReachability(
  controllerNodeId: string,
): MtDeviceReachability[] | null {
  const controller = ESPCDF.instance?.nodeStore.getNodeById(controllerNodeId);
  if (!controller) {
    return null;
  }

  const setupService = controller.services?.find(
    (s) => s.type === MATTER_CTL_SETUP_SERVICE_TYPE,
  );
  if (!setupService) {
    return null;
  }

  const mtDevicesParam = setupService.params?.find(
    (p) => p.type === MATTER_CTL_SETUP_PARAM_MT_DEVICES,
  );
  if (!mtDevicesParam) {
    return null;
  }

  const mtDeviceNodes = mtDevicesParam.value as ControllerMTNodeMap;
  const reachability = extractMtDeviceReachability(mtDeviceNodes);
  return reachability.length > 0 ? reachability : null;
}

/**
 * Adds or removes `matter_controller` transport for MT devices by online status.
 * @param store - CDF store instance
 * @param controllerNodeId - RainMaker node id of the Matter controller
 * @param reachability - MT device entries with RainMaker node id and online flag
 */
function applyMtDeviceReachabilityTransport(
  store: ESPCDF | null | undefined,
  controllerNodeId: string,
  reachability: MtDeviceReachability[],
): void {
  const onlineMtDevices = reachability
    .filter((node) => node.online && node.rainmaker_node_id)
    .map((node) => node.rainmaker_node_id);
  const offlineMtDevices = reachability
    .filter((node) => !node.online && node.rainmaker_node_id)
    .map((node) => node.rainmaker_node_id);

  addMatterControllerTransport(store, onlineMtDevices, controllerNodeId);
  removeMatterControllerTransport(store, offlineMtDevices);
}

/**
 * Builds `matter_controller` transport metadata for the built-in SDK handler.
 * Cmd-resp create/poll/parse is owned by the Matter SDK; app supplies controller id only.
 */
function buildMatterControllerTransportMetadata(
  controllerNodeId: string,
): MatterControllerTransportMetadata {
  return { controllerNodeId };
}

/**
 * Returns node ids that have `matter_controller` transport via the given controller.
 * Used when the controller node is no longer in the CDF (e.g. controller lost).
 * @param store - CDF store instance
 * @param controllerNodeId - RainMaker node id of the Matter controller
 * @returns Node ids with matching controller transport
 */
function getNodeIdsWithControllerTransport(
  store: ESPCDF | null | undefined,
  controllerNodeId: string,
): string[] {
  const registeredTransports =
    store?.subscriptionStore.registeredTransports ?? {};

  return Object.entries(registeredTransports)
    .filter(
      ([, transportsByType]) =>
        transportsByType?.[MATTER_CONTROLLER_TRANSPORT_KEY]?.metadata
          ?.controllerNodeId === controllerNodeId,
    )
    .map(([nodeId]) => nodeId);
}

/**
 * Removes `matter_controller` transport from the given nodes.
 * @param store - CDF store instance
 * @param nodeIds - Matter node ids to remove controller transport from
 */
function removeMatterControllerTransport(
  store: ESPCDF | null | undefined,
  nodeIds: string[],
): void {
  const cdfStore = store ?? null;
  nodeIds.forEach((nodeId) => {
    handleNodeTransportUpdate(
      cdfStore,
      nodeId,
      { type: MATTER_CONTROLLER_TRANSPORT_KEY, metadata: {} },
      "remove",
    );
  });
}

/**
 * Adds `matter_controller` transport to the given peer Matter nodes.
 * @param store - CDF store instance
 * @param nodeIds - RainMaker node ids to update
 * @param controllerNodeId - RainMaker node id of the Matter controller
 */
function addMatterControllerTransport(
  store: ESPCDF | null | undefined,
  nodeIds: string[],
  controllerNodeId: string,
): void {
  const cdfStore = store ?? null;
  const metadata = buildMatterControllerTransportMetadata(controllerNodeId);
  nodeIds.forEach((nodeId) => {
    handleNodeTransportUpdate(
      cdfStore,
      nodeId,
      { type: MATTER_CONTROLLER_TRANSPORT_KEY, metadata },
      "add",
    );
  });
}

/**
 * Wires or removes `matter_controller` transport from online/offline MT devices.
 * @param controllerNodeId - RainMaker node id of the Matter controller
 */
function syncMatterControllerTransport(controllerNodeId: string): void {
  const store = ESPCDF.instance;
  const controller = store?.nodeStore.getNodeById(controllerNodeId);
  if (!controller) {
    return;
  }

  const mtDeviceReachability = getControllerMtDeviceReachability(controllerNodeId);
  if (!mtDeviceReachability) {
    return;
  }

  applyMtDeviceReachabilityTransport(
    store,
    controllerNodeId,
    mtDeviceReachability,
  );
}

/**
 * Stops listening for controller connectivity changes.
 * @param controllerNodeId - RainMaker node id of the Matter controller
 */
async function unsubscribeFromControllerConnectivity(
  controllerNodeId: string,
): Promise<void> {
  try {
    await ESPRMBase.subscriptionManager.unsubscribeFromNode(controllerNodeId);
  } catch (error) {
    console.warn(LOG_PREFIX, "unsubscribe failed", controllerNodeId, error);
  }
}

/**
 * Listens for controller cloud connect/disconnect and syncs peer transports.
 * @param event - SDK event payload with the controller RainMaker node id
 * @param controller - SDK Matter controller node
 */
async function subscribeToControllerConnectivity(
  event: MatterControllerEvent,
  controller: MatterController,
): Promise<void> {
  const controllerNodeId = event.nodeId;
  try {
    await ESPRMBase.subscriptionManager.subscribeToNode(
      controller,
      (update: ESPNodeUpdateData) => {
        switch (update.eventType) {
          case RMAKER_EVENT_NODE_DISCONNECTED: {
            handleMatterControllerLost({ nodeId: controllerNodeId });
            return;
          }
          case RMAKER_EVENT_NODE_CONNECTED: {
            syncMatterControllerTransport(controllerNodeId);
            return;
          }
          case RMAKER_EVENT_NODE_PARAMS_CHANGED: {
            const setup = parseMatterCtlSetupPayload(update.payload);
            if (!setup) {
              return;
            }
            dispatchControllerSetupNodeUpdate(update);
            const reachability = extractMtDeviceReachability(setup.mtDevices);
            if (!reachability.length) {
              return;
            }
            applyMtDeviceReachabilityTransport(
              ESPCDF.instance,
              controllerNodeId,
              reachability,
            );
            return;
          }
        }
      },
    );
  } catch (error) {
    console.warn(LOG_PREFIX, "subscribe failed", controllerNodeId, error);
  }
}

/**
 * Handles a Matter controller discovery event by wiring or removing
 * `matter_controller` transport on peer Matter nodes in the group.
 * @param event - SDK event payload with the controller RainMaker node id
 */
function handleMatterControllerFound(
  event: MatterControllerEvent,
): void {
  const store = ESPCDF.instance;
  const controller = store?.nodeStore.getNodeById(event?.nodeId);
  if (!controller) {
    return;
  }

  if (!controller.connectivityStatus?.isConnected) {
    handleMatterControllerLost(event);
    return;
  }

  void subscribeToControllerConnectivity(
    event,
    controller._raw as MatterController,
  );
  syncMatterControllerTransport(event.nodeId);
}

/**
 * Handles a Matter controller lost event by removing `matter_controller`
 * transport from nodes that had it registered via that controller.
 * The controller may no longer be in the CDF, so node ids are resolved
 * from `subscriptionStore.registeredTransports`.
 * @param event - SDK event payload with the controller RainMaker node id
 */
function handleMatterControllerLost(
  event: MatterControllerEvent,
): void {
  const store = ESPCDF.instance;
  const controllerNodeId = event?.nodeId;
  void unsubscribeFromControllerConnectivity(controllerNodeId);
  const nodeIds = getNodeIdsWithControllerTransport(store, controllerNodeId);
  if (nodeIds.length === 0) {
    return;
  }
  removeMatterControllerTransport(store, nodeIds);
}

/**
 * Subscribes to Matter controller discovery and updates peer Matter node
 * transports when a controller is found, disconnected, or lost.
 * @param esprmUser - Authenticated Matter SDK user
 */
export function subscribeMatterControllerTransport(
  esprmUser: ESPRMUser
): void {
  esprmUser.subscribe(MATTER_CONTROLLER_FOUND_EVENT, (event: MatterControllerEvent) => {
    handleMatterControllerFound(event);
  });
  esprmUser.subscribe(MATTER_CONTROLLER_LOST_EVENT, (event: MatterControllerEvent) => {
    handleMatterControllerLost(event);
  });
}
