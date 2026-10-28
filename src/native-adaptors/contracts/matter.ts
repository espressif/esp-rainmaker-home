/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SDK-neutral contracts for the native Matter adapters — commissioning,
 * control and subscription.
 *
 * These live in the native-adaptors layer (not CDF, not either Matter SDK)
 * because this layer OWNS the adapter objects while both Matter stacks merely
 * consume them: `config/sdk.config.ts` passes the same adapter instances to
 * the classic (`@espressif/rainmaker-matter-sdk`) and Neo
 * (`@espressif/rainmaker-neo-matter-sdk`) configs, whose interface names
 * diverge (`ESPMatterControlAdapterInterface` vs
 * `ESPRMNeoMatterControlAdapterInterface`, …). Typing the adapters against
 * either SDK would couple this layer to one stack and defeat the
 * `ACTIVE_SDK` swap; typing them here keeps the layer SDK-free while TypeScript
 * still verifies structural compatibility against BOTH SDKs at the injection
 * points in `config/sdk.config.ts`. CDF is not involved: it never calls these
 * adapters, so it has no claim on their contracts.
 *
 * Names are deliberately SDK-neutral (`ESPMatter*`): they mirror neither
 * stack's vocabulary (classic `ESPRM*`, neo `ESPRMNeo*`), so the contract
 * reads as owned by this layer rather than borrowed from one SDK.
 */

/** Fabric reference — adapters only read the id. */
export interface ESPMatterFabricRef {
  fabricId?: string;
}

/** Request parameters for CSR generation. */
export interface ESPMatterGenerateCSRRequest {
  groupId: string;
  fabricId: string;
  name: string;
}

/** CSR generation result from native secure storage. */
export interface ESPMatterCSRGenerationResult {
  csr?: string;
  requestBody?: string;
  metadata?: Record<string, any>;
  status?: string;
}

/** NoC request event, normalized by the adapter from the platform shape. */
export interface ESPMatterNoCRequestEventData {
  eventType: string;
  requestData: {
    csr: string;
    deviceId: string;
    groupId: string;
    fabricId: string;
  };
}

/** Node confirmation request event, normalized by the adapter. */
export interface ESPMatterConfirmRequestEventData {
  eventType: string;
  requestData: {
    rainmakerNodeId: string;
    matterNodeId: string;
    challengeResponse: string;
    challenge?: string;
    deviceId: string;
    requestId: string;
    metadata?: Record<string, any>;
  };
}

/** Typed payload sent to the native platform. */
export interface ESPMatterNativeDataPayload {
  type: string;
  data: Record<string, any>;
}

/** Native Matter commissioning adapter interface. */
export interface ESPMatterCommissioningAdapterInterface {
  generateCSR(
    fabricInfo: ESPMatterGenerateCSRRequest
  ): Promise<ESPMatterCSRGenerationResult>;
  startEcosystemCommissioning(
    onboardingPayload: string,
    fabric: ESPMatterFabricRef,
    onEvent: (
      eventType: string,
      data: ESPMatterNoCRequestEventData | ESPMatterConfirmRequestEventData
    ) => void
  ): Promise<() => void>;
  postMessage(payload: ESPMatterNativeDataPayload): Promise<any>;
  /**
   * Ends the native commissioning session, if any, so the next add can start.
   * Resolves without doing anything where the platform has no such session.
   */
  cancelCommissioning?(): Promise<void>;
}

/** Controller setup for a single fabric. */
export interface ESPMatterInitConfig {
  fabricId: string;
  groupId: string;
  rootCa?: string;
  ipk?: string;
  groupCatIdOperate?: string;
}

/** Outcome of a Matter control operation. */
export interface ESPMatterControlResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export interface ESPMatterAttributeReadResult extends ESPMatterControlResult {
  value?: unknown;
}

/** One attribute path to subscribe to. */
export interface ESPMatterSubscribeAttribute {
  endpoint: number;
  clusterId: number;
  attributeId: number;
}

/** A single attribute report from an active subscription. */
export interface ESPMatterAttributeReport {
  endpoint: number;
  clusterId: number;
  attributeId: number;
  value: unknown;
}

export interface ESPMatterSubscribeResult extends ESPMatterControlResult {
  unsubscribe?: () => void;
}

/** Native Matter control adapter — one controller per fabric. */
export interface ESPMatterControlAdapterInterface {
  init?(config: ESPMatterInitConfig): Promise<ESPMatterControlResult>;
  shutdown?(): Promise<ESPMatterControlResult>;
  read(
    matterNodeId: string,
    endpoint: number,
    clusterId: number,
    attributeId: number
  ): Promise<ESPMatterAttributeReadResult>;
  write(
    matterNodeId: string,
    endpoint: number,
    clusterId: number,
    attributeId: number,
    value: unknown
  ): Promise<ESPMatterControlResult>;
  invoke(
    matterNodeId: string,
    endpoint: number,
    clusterId: number,
    commandId: number,
    payload?: Record<string, unknown>
  ): Promise<ESPMatterControlResult>;
  /**
   * `onLinkStateChange` hears whether the link is up: true once it is
   * established, false while it re-subscribes or after it failed.
   */
  subscribe(
    matterNodeId: string,
    attributes: ESPMatterSubscribeAttribute[],
    callback: (report: ESPMatterAttributeReport) => void,
    onLinkStateChange?: (live: boolean) => void
  ): Promise<ESPMatterSubscribeResult>;
}

/** Raw attribute update streamed from a subscribed Matter device. */
export interface ESPMatterDeviceUpdate {
  endpointId: number;
  clusterId: number;
  attributeId: number;
  value: any;
  timestamp?: number;
  metadata?: Record<string, any>;
}

/** Native Matter subscription adapter, backing a subscription channel. */
export interface ESPMatterSubscriptionAdapterInterface {
  subscribeToDevice(
    nodeId: string,
    fabricId: string,
    callback: (update: ESPMatterDeviceUpdate) => void
  ): Promise<void>;
  unsubscribeFromDevice(nodeId: string, fabricId: string): Promise<void>;
  isDeviceReachable(nodeId: string, fabricId: string): Promise<boolean>;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  /**
   * Whether a node's Matter subscription is up right now. Takes every id the
   * node may be subscribed under (RainMaker or Matter id). Omitted, or false,
   * where link state is unknown.
   */
  isLinkLive?(...nodeIds: (string | undefined)[]): boolean;
}
