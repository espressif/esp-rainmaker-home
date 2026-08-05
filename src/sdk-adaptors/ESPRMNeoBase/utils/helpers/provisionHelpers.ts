/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProvisionType } from "@espressif/rainmaker-neo-base-sdk";
import {
  type AddDeviceParams,
  type ESPCDFNode,
  type ESPCDFUser,
  type GroupStoreCallbacks,
} from "@store";
import { ESP_CHALLENGE_RESPONSE_CONSTANTS } from "@shared/utils/constants";
import {
  applyProvisionNodeTimezoneWithRetries,
  markProvisionTimezoneFailed,
} from "@shared/utils/timezone";
import {
  ESPRMNEO_RMAKER_EXTRA_CAP_KEY,
  ESPRMNEO_VERSION_INFO_RMAKER_EXTRA_KEY,
} from "../constants";

const LOG_PREFIX = "[provisionDevice]";

/**
 * Returns true when device version info advertises the challenge-response
 * capability (`ch_resp`).
 *
 * Inlined from the SDK's internal `ChallengeResponseHelper` — rainmaker-neo-base-sdk
 * does not re-export that helper publicly because it transitively pulls
 * protobuf modules that break the RN bundle.
 * @param versionInfo - Device version payload from `getDeviceVersion()`.
 * @returns `true` when `rmaker_extra.cap` includes `ch_resp`.
 */
export function checkChallengeResponseCapability(versionInfo: {
  [key: string]: unknown;
}): boolean {
  try {
    const rmakerExtra = versionInfo?.[ESPRMNEO_VERSION_INFO_RMAKER_EXTRA_KEY];
    if (!rmakerExtra || typeof rmakerExtra !== "object") {
      return false;
    }
    const extraCapabilities = (rmakerExtra as Record<string, unknown>)[
      ESPRMNEO_RMAKER_EXTRA_CAP_KEY
    ];
    if (!Array.isArray(extraCapabilities)) {
      return false;
    }
    return extraCapabilities.includes(
      ESP_CHALLENGE_RESPONSE_CONSTANTS.CHALLENGE_RESPONSE_CAPABILITY,
    );
  } catch {
    return false;
  }
}

/** SDK provision progress status when the flow finishes successfully. */
const PROVISION_PROGRESS_STATUS_SUCCEED = "succeed";

/**
 * Minimum length used to treat a space-free progress `description` as a node ID
 * when `data.nodeId` is absent (SDK succeed payload fallback).
 */
const PROVISION_NODE_ID_MIN_LENGTH = 16;

/** Progress payload shape emitted by the provisioning device operations. */
type ProvisionProgressResponse = {
  status?: string;
  description?: string;
  data?: Record<string, unknown>;
};

type ProvisionProgressHandler = (response: ProvisionProgressResponse) => void;

/**
 * Fluent RMNeo add-device provision pipeline. Each step extends the previous
 * promise; nothing runs until {@link ProvisionFlow.result} is awaited.
 */
class ProvisionFlow {
  private chain: Promise<void> = Promise.resolve();
  private nodeId: string | null = null;
  private readonly targetGroupId: string;
  private node: ESPCDFNode | null = null;
  private progressHandler: ProvisionProgressHandler | null = null;

  /**
   * @param user - CDF user used for provision options and timezone apply.
   * @param params - Provision inputs (device, home, Wi-Fi, progress).
   */
  private constructor(
    private readonly user: ESPCDFUser,
    private readonly params: AddDeviceParams,
  ) {
    this.targetGroupId = params.groupId;
  }

  /**
   * Starts a new provision flow.
   * @param user - CDF user.
   * @param params - Add-device provision params.
   * @returns A new {@link ProvisionFlow} ready for step chaining.
   */
  static start(user: ESPCDFUser, params: AddDeviceParams): ProvisionFlow {
    return new ProvisionFlow(user, params);
  }

  /**
   * Queues the challenge-response capability gate.
   * @returns This flow for chaining.
   */
  requireChallengeResponseSupport(): this {
    this.chain = this.chain.then(() => this.doRequireChallengeResponseSupport());
    return this;
  }

  /**
   * Queues building the progress handler that captures node ID from events.
   * @returns This flow for chaining.
   */
  createProvisionProgressHandler(): this {
    this.chain = this.chain.then(() => this.doCreateProvisionProgressHandler());
    return this;
  }

  /**
   * Queues the SDK BLE/Wi-Fi provision operation.
   * @returns This flow for chaining.
   */
  invokeProvisionOperation(): this {
    this.chain = this.chain.then(() => this.doInvokeProvisionOperation());
    return this;
  }

  /**
   * Queues CDF node details fetch for the provisioned node ID.
   * @returns This flow for chaining.
   */
  fetchNode(): this {
    this.chain = this.chain.then(() => this.doFetchNode());
    return this;
  }

  /**
   * Queues provision timezone apply with retries (non-blocking on failure).
   * @returns This flow for chaining.
   */
  applyTimezone(): this {
    this.chain = this.chain.then(() => this.doApplyTimezone());
    return this;
  }

  /**
   * Queues writing the CDF node into the target home group store.
   * @param callbacks - Group store mutation callbacks.
   * @returns This flow for chaining.
   */
  store(callbacks: GroupStoreCallbacks): this {
    this.chain = this.chain.then(() => this.doStore(callbacks));
    return this;
  }

  /**
   * Awaits the queued chain and returns the provisioned CDF node (or null).
   * @returns The stored node, or null when provision did not yield a node ID.
   */
  async result(): Promise<ESPCDFNode | null> {
    await this.chain;
    return this.node;
  }

  /**
   * Ensures the device supports challenge-response (required for RMNeo).
   * @throws When the device does not support chal-resp.
   */
  private async doRequireChallengeResponseSupport(): Promise<void> {
    const supportsChalResp =
      await this.params.provisioningDevice.checkChallengeResponseSupport();
    if (!supportsChalResp) {
      throw new Error(
        `${LOG_PREFIX} RMNeo provisioning requires challenge-response support on the device`,
      );
    }
  }

  /**
   * Builds and stores the progress handler used by the provision operation.
   */
  private async doCreateProvisionProgressHandler(): Promise<void> {
    const { onProgress } = this.params;
    this.progressHandler = (response) => {
      const nodeId = this.extractNodeIdFromProgress(response);
      if (nodeId) {
        this.nodeId = nodeId;
      }
      onProgress?.(
        response as Parameters<NonNullable<AddDeviceParams["onProgress"]>>[0],
      );
    };
  }

  /**
   * Extracts a node ID from a provision progress event.
   *
   * Prefers `data.nodeId`; falls back to a succeed `description` that looks like
   * a bare node ID (no spaces, long enough).
   * @param response - Progress callback payload from the provision operation.
   * @returns Captured node ID, or null when the event does not carry one.
   */
  private extractNodeIdFromProgress(
    response: ProvisionProgressResponse,
  ): string | null {
    const dataNodeId = response.data?.nodeId;
    if (typeof dataNodeId === "string" && dataNodeId.length > 0) {
      return dataNodeId;
    }

    const { status, description } = response;
    if (
      status === PROVISION_PROGRESS_STATUS_SUCCEED &&
      description &&
      !description.includes(" ") &&
      description.length >= PROVISION_NODE_ID_MIN_LENGTH
    ) {
      return description;
    }

    return null;
  }

  /**
   * Invokes the SDK BLE/Wi-Fi provision operation using the prepared progress handler.
   */
  private async doInvokeProvisionOperation(): Promise<void> {
    const { provisioningDevice, groupId, ssid, password } = this.params;
    if (!this.progressHandler) {
      throw new Error(
        `${LOG_PREFIX} createProvisionProgressHandler() must run before invokeProvisionOperation()`,
      );
    }

    try {
      await provisioningDevice.operations.provision(
        ssid,
        password,
        this.progressHandler,
        groupId,
        ProvisionType.CHAL_RESP,
        {
          // SDK waitForOnline is enabled; registration still follows via later steps.
          waitForOnline: true,
          user: this.user._raw,
        },
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} Provision failed:`, error);
      console.error(
        `${LOG_PREFIX} Error details:`,
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
      );
      throw error;
    }
  }

  /**
   * Fetches node details via CDF once the provisioned node ID is known.
   */
  private async doFetchNode(): Promise<void> {
    if (!this.nodeId) {
      return;
    }
    this.node = await this.user.getNodeDetails(this.nodeId);
  }

  /**
   * Applies timezone, then verifies via live Time-service params (MQTT).
   * Retries setTimeZone until reported TZ matches, or attempts are exhausted.
   * Failures are logged and non-blocking — provision still succeeds.
   */
  private async doApplyTimezone(): Promise<void> {
    if (!this.nodeId || !this.node) {
      return;
    }

    try {
      const result = await applyProvisionNodeTimezoneWithRetries(
        this.user,
        this.nodeId,
        this.node,
        (id) => this.user.getNodeDetails(id),
        { neoLiveVerify: true },
      );
      this.node = result.node;
      if (!result.timezoneApplied) {
        console.warn(
          `${LOG_PREFIX} Timezone not confirmed via live params (non-blocking); nodeId=`,
          this.nodeId,
        );
      }
    } catch (error) {
      markProvisionTimezoneFailed(this.nodeId);
      console.error(`${LOG_PREFIX} Timezone setup failed (non-blocking):`, error);
    }
  }

  /**
   * Adds the provisioned CDF node to the UI home group in the store.
   * @param callbacks - Group store mutation callbacks.
   */
  private async doStore(callbacks: GroupStoreCallbacks): Promise<void> {
    if (!this.node) {
      return;
    }
    callbacks.addNodesToGroup(this.targetGroupId, [this.node]);
  }
}

/**
 * Add device provision flow: gate chal-resp, prepare progress capture, provision,
 * fetch node, set timezone, and add to group store.
 * @param user - CDF user.
 * @param params - Provision params.
 * @param callbacks - Group store callbacks.
 * @returns The provisioned CDF node, or null when no node ID was captured.
 */
export async function provisionDevice(
  user: ESPCDFUser,
  params: AddDeviceParams,
  callbacks: GroupStoreCallbacks,
): Promise<ESPCDFNode | null> {
  return ProvisionFlow.start(user, params)
    .requireChallengeResponseSupport()
    .createProvisionProgressHandler()
    .invokeProvisionOperation()
    .fetchNode()
    .applyTimezone()
    .store(callbacks)
    .result();
}
