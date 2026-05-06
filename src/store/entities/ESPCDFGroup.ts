/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFAPIResponse,
  ESPCDFPaginatedAPIResponse,
  ESPCDFAPIDataResponse,
  ESPCDFSceneCreateInput,
} from "../types";
import {
  ESPCDFGroupOperationType,
  ESPCDFGroupInterface,
  ESPCDFGroupOperation,
  ESPCDFGroupSharingInfoInterface,
  ESPCDFScheduleCreateInput,
  ESPCDFAutomationCreateInput,
  ESPCDFIssueUserNoCResponse,
  ESPCDFCommissioningProgress,
} from "../types";
import { ESPCDFNode } from "./ESPCDFNode";
import { ESPCDFScene } from "./ESPCDFScene";
import { ESPCDFSchedule } from "./ESPCDFSchedule";
import { ESPCDFAutomation } from "./ESPCDFAutomation";
import { ESPCDFDevice } from "./ESPCDFDevice";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

export class ESPCDFGroup implements ESPCDFGroupInterface {
  identifier: string;
  name: string;
  id: string;
  nodeIds: string[];
  nodeDetails?: ESPCDFNode[];
  subGroups?: ESPCDFGroup[];
  isPrimaryUser?: boolean;
  accessType?: string;
  totalNodes?: number;
  parentId?: string;
  type?: string;
  mutuallyExclusive?: boolean;
  description?: string;
  metadata?: Record<string, any>;
  customData?: Record<string, any>;
  isMatter?: boolean;
  fabricId?: string;
  fabricDetails?: Record<string, any>;
  _raw: any;
  operations: ESPCDFGroupOperation;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFGroup,
    ESPCDFGroupOperationType
  >;

  constructor(groupData: ESPCDFGroupInterface) {
    this.identifier = groupData.identifier;
    this.operations = groupData.operations;
    this.name = groupData.name;
    this.id = groupData.id;
    this.nodeIds = groupData.nodeIds || [];
    this.nodeDetails =
      groupData.nodeDetails?.map((node) => new ESPCDFNode(node)) || [];
    this.subGroups =
      groupData.subGroups?.map((subGroup) => new ESPCDFGroup(subGroup)) || [];
    this.isPrimaryUser = groupData.isPrimaryUser;
    this.accessType = groupData.accessType;
    this.totalNodes = groupData.totalNodes;
    this.parentId = groupData.parentId;
    this.type = groupData.type;
    this.mutuallyExclusive = groupData.mutuallyExclusive;
    this.description = groupData.description;
    this.metadata = groupData.metadata;
    this.customData = groupData.customData;
    this.isMatter = groupData.isMatter;
    this.fabricId = groupData.fabricId;
    this.fabricDetails = groupData.fabricDetails;
    this._raw = groupData._raw;
    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFGroup,
      ESPCDFGroupOperationType
    >();
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<ESPCDFGroup, ESPCDFGroupOperationType>
  ): () => void {
    return this.events.subscribe(listener);
  }

  /**
   * Remove all listeners and clean up
   */
  dispose(): void {
    this.events.dispose();
  }

  /**
   * Internal method to emit callbacks after operations
   */
  private emit(
    operation: ESPCDFGroupOperationType,
    success: boolean,
    data?: any,
    error?: any
  ): void {
    this.events.emit(this, operation, success, data, error);
  }

  /**
   * Wraps an operation with consistent event emission logic
   */
  private async runAndEmit<T>(
    operation: ESPCDFGroupOperationType,
    execute: () => Promise<T>,
    getData?: (result: T) => unknown
  ): Promise<T> {
    let succeeded = false;
    let result!: T;
    let error: unknown;

    try {
      result = await execute();
      succeeded = true;
      return result;
    } catch (e) {
      error = e;
      throw e;
    } finally {
      this.emit(
        operation,
        succeeded,
        succeeded ? getData?.(result) : undefined,
        error
      );
    }
  }

  // Group information methods
  async getNodes(): Promise<ESPCDFNode[]> {
    return this.runAndEmit("getNodes", () => this.operations.getNodes(), (nodes) => nodes);
  }

  async getSubGroups(): Promise<ESPCDFGroup[]> {
    return this.runAndEmit("getSubGroups", () => this.operations.getSubGroups(), (subGroups) => subGroups);
  }

  async createSubGroup(options: Record<string, any>): Promise<ESPCDFGroup> {
    return this.runAndEmit("createSubGroup", () => this.operations.createSubGroup(options), (result) => result);
  }

  async createScene(sceneData: ESPCDFSceneCreateInput): Promise<ESPCDFScene> {
    return this.runAndEmit(
      "createScene",
      async () => {
        const fullSceneData = {
          id: sceneData.id,
          name: sceneData.name,
          info: sceneData.info || "",
          nodes: sceneData.nodes,
          actions: sceneData.actions,
        };
        return this.operations.createScene?.(fullSceneData);
      },
      (scene) => scene
    );
  }

  /**
   * Lists devices in this group that can participate in scenes (nodes exposing the scenes service),
   * one row per device with params, plus whether the node has reached its max scene count.
   *
   * Used for scene device selection / provisioning flows — not a raw node list.
   * @returns Promise<Array<{ node: ESPCDFNode; device: ESPCDFDevice; isMaxSceneReached: boolean }>>
   * @throws Error if the adaptor does not implement this operation
   * @example
   * const rows = await group.getSceneCapableDevices();
   */
  async getSceneCapableDevices(): Promise<{
    node: ESPCDFNode;
    device: ESPCDFDevice;
    isMaxSceneReached: boolean;
  }[]> {
    return this.runAndEmit(
      "getSceneCapableDevices",
      async () => {
        if (!this.operations.getSceneCapableDevices) {
          throw new Error(
            "getSceneCapableDevices operation not supported by this group's SDK adaptor"
          );
        }
        return this.operations.getSceneCapableDevices(this);
      },
      (deviceData) => deviceData
    );
  }

  /**
   * Lists devices in this group that can participate in schedules (nodes exposing the schedules service),
   * one row per device with params, plus whether the node has reached its max schedule count
   * (same shape as scene rows: `isMaxSceneReached` is reused for the schedule service bound).
   *
   * Used for schedule device selection / provisioning flows.
   * @returns Promise<Array<{ node: ESPCDFNode; device: ESPCDFDevice; isMaxSceneReached: boolean }>>
   * @throws Error if the adaptor does not implement this operation
   * @example
   * const rows = await group.getScheduleCapableDevices();
   */
  async getScheduleCapableDevices(): Promise<{
    node: ESPCDFNode;
    device: ESPCDFDevice;
    isMaxSceneReached: boolean;
  }[]> {
    return this.runAndEmit(
      "getScheduleCapableDevices",
      async () => {
        if (!this.operations.getScheduleCapableDevices) {
          throw new Error(
            "getScheduleCapableDevices operation not supported by this group's SDK adaptor"
          );
        }
        return this.operations.getScheduleCapableDevices(this);
      },
      (deviceData) => deviceData
    );
  }

  async getScenes(): Promise<ESPCDFScene[]> {
    return this.runAndEmit(
      "getScenes",
      async () => {
        if (!this.operations.getScenes) {
          throw new Error(
            "getScenes operation not supported by this group's SDK adaptor"
          );
        }
        return this.operations.getScenes(this);
      },
      (scenes) => scenes
    );
  }

  async createSchedule(scheduleData: ESPCDFScheduleCreateInput): Promise<ESPCDFSchedule> {
    return this.runAndEmit(
      "createSchedule",
      async () => {
        const fullScheduleData = {
          id: scheduleData.id,
          name: scheduleData.name,
          info: scheduleData.info || "",
          nodes: scheduleData.nodes,
          triggers: scheduleData.triggers,
          action: scheduleData.action,
          enabled: scheduleData.enabled,
          validity: scheduleData.validity,
          flags: scheduleData.flags,
        };
        return this.operations.createSchedule?.(fullScheduleData);
      },
      (schedule) => schedule
    );
  }

  /**
   * Gets all schedules associated with nodes in this group (including subgroups)
   *
   * Fetches nodes from the group and extracts schedule configurations from their
   * services. Returns an array of ESPCDFSchedule entities that can be stored in ScheduleStore.
   * @returns Promise<ESPCDFSchedule[]> Array of schedule entities for this group's nodes
   * @throws Error if operation not supported or schedule extraction fails
   * @example
   * const schedules = await group.getSchedules();
   * // Schedules will be automatically added to scheduleStore via callback
   */
  async getSchedules(): Promise<ESPCDFSchedule[]> {
    return this.runAndEmit(
      "getSchedules",
      async () => {
        if (!this.operations.getSchedules) {
          throw new Error(
            "getSchedules operation not supported by this group's SDK adaptor"
          );
        }
        return this.operations.getSchedules(this);
      },
      (schedules) => schedules
    );
  }

  async createAutomation(automationData: ESPCDFAutomationCreateInput): Promise<ESPCDFAutomation> {
    return this.runAndEmit(
      "createAutomation",
      async () => {
        const fullAutomationData = {
          name: automationData.name,
          enabled: automationData.enabled ?? false,
          nodeId: automationData.nodeId,
          eventType: automationData.eventType,
          events: automationData.events,
          eventOperator: automationData.eventOperator,
          actions: automationData.actions,
          retrigger: automationData.retrigger,
          location: automationData.location,
          region: automationData.region,
          metadata: automationData.metadata,
        };
        return this.operations.createAutomation?.(fullAutomationData);
      },
      (automation) => automation
    );
  }

  /**
   * Gets all automations associated with nodes in this group (including subgroups)
   *
   * Fetches nodes from the group and extracts automation configurations from their
   * services. Returns an array of ESPCDFAutomation entities that can be stored in AutomationStore.
   * @returns Promise<ESPCDFAutomation[]> Array of automation entities for this group's nodes
   * @throws Error if operation not supported or automation extraction fails
   * @example
   * const automations = await group.getAutomations();
   * // Automations will be automatically added to automationStore via callback
   */
  async getAutomations(): Promise<
    ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>
  > {
    return this.runAndEmit(
      "getAutomations",
      async () => {
        if (!this.operations.getAutomations) {
          throw new Error(
            "getAutomations operation not supported by this group's SDK adaptor"
          );
        }
        return this.operations.getAutomations();
      },
      (automations) => automations
    );
  }

  // Sharing operations
  async share(params: Record<string, any>): Promise<string> {
    return this.operations.share(params);
  }

  async removeSharingFor(username: string): Promise<ESPCDFAPIResponse> {
    return this.operations.removeSharingFor(username);
  }

  async transfer(params: Record<string, any>): Promise<string> {
    return this.operations.transfer(params);
  }

  async getSharingInfo(
    options: Record<string, any>
  ): Promise<ESPCDFAPIDataResponse<ESPCDFGroupSharingInfoInterface>> {
    return this.operations.getSharingInfo(options);
  }

  // Group management operations
  async delete(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("delete", () => this.operations.delete(), () => this);
  }

  async updateMetadata(
    metadata: Record<string, any>
  ): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "updateMetadata",
      () => this.operations.updateMetadata(metadata),
      () => metadata
    );
  }

  async updateGroupInfo(
    updates: Record<string, any>
  ): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "updateGroupInfo",
      () => this.operations.updateGroupInfo(updates),
      () => updates
    );
  }

  async addNodes(nodeIds: string[]): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "addNodes",
      () => this.operations.addNodes(nodeIds),
      () => nodeIds
    );
  }

  async removeNodes(nodeIds: string[]): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "removeNodes",
      () => this.operations.removeNodes(nodeIds),
      () => nodeIds
    );
  }

  async leave(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("leave", () => this.operations.leave(), () => this);
  }

  // Matter fabric commissioning operations (only when isMatter === true)

  async issueUserNoC(): Promise<ESPCDFIssueUserNoCResponse> {
    if (!this.operations.issueUserNoC) {
      throw new Error(
        "issueUserNoC not available - group is not a Matter fabric"
      );
    }
    return this.runAndEmit(
      "issueUserNoC",
      () => this.operations.issueUserNoC!(),
      (result) => result
    );
  }

  async startCommissioning(
    qrData: string,
    onProgress?: (message: ESPCDFCommissioningProgress) => void
  ): Promise<() => void> {
    if (!this.operations.startCommissioning) {
      throw new Error(
        "startCommissioning not available - group is not a Matter fabric"
      );
    }
    return this.runAndEmit(
      "startCommissioning",
      () => this.operations.startCommissioning!(qrData, onProgress),
      () => ({ qrData })
    );
  }

  /**
   * Publishes param values through the adaptor group-level `setParams` path when supported.
   * @param payload The payload contains the value to publish and the target objects which represent the row of device and param that should receive the broadcast value for the given param.
   * @returns Adaptor-specific result.
   * @throws Error when the adaptor does not implement {@link ESPCDFGroupOperation.setParams}.
   */
  setParams(
    payload: Record<string, Record<string, unknown>>
  ): Promise<unknown> {
    return this.runAndEmit(
      "setParams",
      async () => {
        if (!this.operations.setParams) {
          throw new Error(
            "setParams not supported by this group's SDK adaptor"
          );
        }
        return this.operations.setParams(payload);
      },
      (result) => result
    );
  }
}
