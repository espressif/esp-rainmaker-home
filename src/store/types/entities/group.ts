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
  ESPCDFScheduleCreateInput,
  ESPCDFAutomationCreateInput,
} from "../../types";
import { ESPCDFGroup } from "../../entities/ESPCDFGroup";
import { ESPCDFNodeInterface } from "./node";
import { ESPCDFNode } from "../../entities/ESPCDFNode";
import { ESPCDFAutomation } from "@store";

/**
 * Operation types that can trigger callbacks for groups
 */
export type ESPCDFGroupOperationType =
  | "getNodes"
  | "getSubGroups"
  | "createSubGroup"
  | "createScene"
  | "getScenes"
  | "getSceneCapableDevices"
  | "createSchedule"
  | "getSchedules"
  | "getScheduleCapableDevices"
  | "createAutomation"
  | "getAutomations"
  | "share"
  | "removeSharingFor"
  | "transfer"
  | "getSharingInfo"
  | "delete"
  | "updateMetadata"
  | "updateGroupInfo"
  | "addNodes"
  | "removeNodes"
  | "leave"
  | "issueUserNoC"
  | "startCommissioning"
  | "setParams";

/**
 * Interface representing a group sharing user information.
 */
export interface ESPCDFGroupSharingUserInfoInterface {
  username: string;
  metadata?: Record<string, any>;
}

/**
 * Interface representing a group sharing information.
 */
export interface ESPCDFGroupSharingInfoInterface {
  groupId: string;
  mutuallyExclusive: boolean;
  primaryUsers?: ESPCDFGroupSharingUserInfoInterface[];
  secondaryUsers?: ESPCDFGroupSharingUserInfoInterface[];
  subGroupsInfo?: ESPCDFGroupSharingInfoInterface[];
  parentGroupsInfo?: ESPCDFGroupSharingInfoInterface[];
}

export interface ESPCDFGroupOperation {
  createSubGroup(data: Record<string, any>): Promise<ESPCDFGroup>;
  createScene?(sceneData: ESPCDFSceneCreateInput): Promise<any>; // Returns ESPCDFScene - using any to avoid circular dependency
  getScenes?(group: ESPCDFGroup): Promise<any[]>; // Returns ESPCDFScene[] - using any to avoid circular dependency
  getSceneCapableDevices?(group: ESPCDFGroup): Promise<any[]>; // Per-device rows { node, device, isMaxSceneReached } for scene UI — any avoids circular imports
  createSchedule?(scheduleData: ESPCDFScheduleCreateInput): Promise<any>; // Returns ESPCDFSchedule - using any to avoid circular dependency
  getSchedules?(group: ESPCDFGroup): Promise<any[]>; // Returns ESPCDFSchedule[] - using any to avoid circular dependency
  getScheduleCapableDevices?(group: ESPCDFGroup): Promise<any[]>; // Per-device rows { node, device, isMaxSceneReached } for schedule UI — any avoids circular imports
  createAutomation?(automationData: ESPCDFAutomationCreateInput): Promise<any>; // Returns ESPCDFAutomation - using any to avoid circular dependency
  getAutomations?(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>>; // Returns ESPCDFAutomation[] - using any to avoid circular dependency
  delete(): Promise<ESPCDFAPIResponse>;
  getNodes(): Promise<ESPCDFNode[]>;
  getSubGroups(): Promise<ESPCDFGroup[]>;
  share(params: Record<string, any>): Promise<string>;
  transfer(params: Record<string, any>): Promise<string>;
  removeSharingFor(username: string): Promise<ESPCDFAPIResponse>;
  getSharingInfo(
    options: Record<string, any>
  ): Promise<ESPCDFAPIDataResponse<ESPCDFGroupSharingInfoInterface>>;
  updateMetadata(metadata: Record<string, any>): Promise<ESPCDFAPIResponse>;
  updateGroupInfo(updates: Record<string, any>): Promise<ESPCDFAPIResponse>;
  addNodes(nodeIds: string[]): Promise<ESPCDFAPIResponse>;
  removeNodes(nodeIds: string[]): Promise<ESPCDFAPIResponse>;
  leave(): Promise<ESPCDFAPIResponse>;

  // Optional Matter commissioning operations (present when isMatter === true)
  issueUserNoC?(): Promise<ESPCDFIssueUserNoCResponse>;
  startCommissioning?(
    qrData: string,
    onProgress?: (message: ESPCDFCommissioningProgress) => void
  ): Promise<() => void>;
  // Optional: group-level param publish.
  setParams?(
    payload: Record<string, Record<string, unknown>>
  ): Promise<unknown>;
}

export interface ESPCDFIssueUserNoCResponse {
  status: string;
  description: string;
  certificates?: {
    groupId: string;
    matterUserId: string;
    userNoC: string;
  }[];
}

export interface ESPCDFCommissioningProgress {
  status?: string;
  description?: string;
}

export interface ESPCDFGroupInterface {
  identifier: string;
  name: string;
  id: string;
  nodeIds?: string[];
  nodeDetails?: ESPCDFNodeInterface[];
  subGroups?: ESPCDFGroupInterface[];
  isPrimaryUser?: boolean;
  /**
   * Normalized user access to this group: RMNG maps SDK `accessType`; classic RM maps from
   * `isPrimaryUser` (`primary` | `secondary`). RM has no subgroup-share mode.
   */
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
  operations: ESPCDFGroupOperation;
  _raw: any;
  /**
   * Present on {@link ESPCDFGroup} instances: group-level param publish.
   */
  setParams?(
    payload: Record<string, Record<string, unknown>>
  ): Promise<unknown>;
}
