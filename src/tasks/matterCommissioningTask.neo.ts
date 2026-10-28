/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Android HeadlessJS commissioning tasks for the Neo Matter stack.
 *
 * Native `MatterHeadlessTaskService` starts these by name while the CHIP
 * commissioning session is open, so the cloud round-trips run outside the app's
 * UI lifecycle. Each task posts its result back through
 * `ESPMatterModule.handleHeadlessTaskResult`, which the native side is waiting on
 * — a task that returns without posting leaves commissioning hung until the
 * fail-safe expires.
 *
 * Pure Matter AND hybrid nodes. Hybrid devices carry RainMaker firmware: the
 * cloud identifies them from `vendor_reserved1` inside the DAC-signed CSR and
 * the device publishes its own config afterwards — confirm takes requestId
 * only. Pure Matter devices have neither: the cloud generates their node id at
 * `/verify`, confirm tags them `capabilities: ["matter"]`, and the endpoint
 * topology native probed is pushed to `PUT /config` (via the SDK) so the node
 * can be rebuilt for display. The pure/hybrid decision reads
 * `metadata.Matter.isRainmaker` — the flag native derives from probing
 * endpoint 0 for the RainMaker cluster — and defaults to hybrid when metadata
 * is missing or unparseable (fail-safe: today's behavior for existing devices).
 *
 * Credentials are not pre-seeded. `ESPSigV4APIManager` reads them from the
 * shared AsyncStorage adapter and, when absent or expired, refreshes via
 * `POST /v1/assumed-roles` — so a task starting in a cold runtime authenticates
 * on its own.
 */

import { NativeModules } from "react-native";
import { ESPRMNeoBase } from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPRMNeoFabric,
  ESPRMNeoMatterCommissioningRequest,
  ESPRMNeoMatterNodeType,
  MatterNodeTypes,
  reconcileNodeTypeWithCloud,
  resolveConfirmNodeType,
} from "@espressif/rainmaker-neo-matter-sdk";
import { getNeoMatterSDKConfig } from "@config/sdk.config";
import { runtimeConfigManager } from "@config/runtime.config";
import {
  setMatterMetadata,
  setMatterNodeId,
} from "@shared/utils/matterLocalStorage";
import { setPendingNodeConfig } from "@shared/utils/matterPendingNodeConfig";
import {
  HEADLESS_TASK_ISSUE_NOC,
  HEADLESS_TASK_CONFIRM_COMMISSION,
  HEADLESS_ERROR_MISSING_TASK_DATA,
  HEADLESS_ERROR_USER_NOT_AUTHENTICATED,
  HEADLESS_ERROR_UNKNOWN,
  HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE,
  MATTER_METADATA_KEY,
  MATTER_CAPABILITY,
  METADATA_KEY_RAINMAKER_NODE_ID,
  STATUS_PENDING,
  STATUS_SUCCESS,
} from "@shared/utils/constants";

const { ESPMatterModule } = NativeModules;

let neoSdkInitialized = false;

/**
 * Neo node id per request id, captured at `/verify`.
 *
 * `/confirm` answers `{ message }` only, but native reads `confirmNodeId` from the
 * confirm result to populate `chipClient.rmNodeId`. `/verify` is the one response
 * that carries the id, and it runs in this same runtime, so it is held here rather
 * than dropped and re-fetched.
 */
const neoNodeIdByRequestId = new Map<string, string>();

/** Matter node id per request id, from the same `/verify` response. */
const matterNodeIdByRequestId = new Map<string, string>();

/** True when the Neo base is already configured in THIS JS runtime. */
function isNeoBaseAlreadyConfigured(): boolean {
  try {
    return !!ESPRMNeoBase.subscriptionManager;
  } catch {
    return false;
  }
}

/**
 * Configures the Neo Matter SDK for this runtime, once.
 *
 * On Android a headless task can share the app's JS context, and
 * `ESPRMNeoBase.configure()` builds a fresh subscription manager on every call —
 * dropping channels the app already registered. So this is a no-op when the base
 * is already configured.
 */
async function initializeNeoMatterSDK(): Promise<void> {
  if (neoSdkInitialized || isNeoBaseAlreadyConfigured()) {
    neoSdkInitialized = true;
    return;
  }
  await runtimeConfigManager.loadFromStorage();
  const { ESPRMNeoMatterBase } =
    await import("@espressif/rainmaker-neo-matter-sdk");
  ESPRMNeoMatterBase.configure(getNeoMatterSDKConfig());
  neoSdkInitialized = true;
}

interface NeoIssueNocTaskData {
  nodeId: string;
  groupId: string;
  requestId: string;
  nocsrElements?: string;
  attestationChallenge?: string;
  attestationSignature?: string;
}

interface NeoConfirmCommissionTaskData {
  nodeId: string;
  groupId: string;
  requestId: string;
  /**
   * Full native confirm body JSON
   * (`{request_id, status, metadata:{Matter:{...}}, rainmaker_node_id?, challenge?}`)
   * — carries the endpoint topology and the pure/hybrid signal.
   */
  metadata?: string;
  /**
   * Neo cloud node id captured natively from the `/verify` result. Fallback for
   * `neoNodeIdByRequestId` when Android recycles the headless JS runtime
   * between the NOC and confirm tasks.
   */
  neoNodeId?: string;
}

/** Parsed pure/hybrid decision + Matter metadata from the native confirm body. */
interface NeoConfirmMetadata {
  matterData: Record<string, unknown>;
  isRainmakerNode: boolean;
}

/**
 * Extracts `metadata.Matter` and the pure/hybrid decision from the native
 * confirm body, mirroring the classic task. Missing or unparseable metadata ⇒
 * HYBRID (today's behavior — fail-safe for existing devices).
 */
function parseNeoConfirmMetadata(
  raw: string | undefined,
): NeoConfirmMetadata {
  const hybridDefault: NeoConfirmMetadata = {
    matterData: {},
    isRainmakerNode: true,
  };
  if (!raw) {
    return hybridDefault;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return hybridDefault;
  }
  if (!body || typeof body !== "object") {
    return hybridDefault;
  }

  const nestedMetadata = body.metadata as Record<string, unknown> | undefined;
  const matterData =
    (nestedMetadata?.[MATTER_METADATA_KEY] as
      Record<string, unknown> | undefined) ??
    (body[MATTER_METADATA_KEY] as Record<string, unknown> | undefined) ??
    {};

  // Single definition of pure-vs-hybrid lives in the SDK. EP0-probe only —
  // the caller still reconciles it against the cloud's own node ids.
  const isRainmakerNode =
    resolveConfirmNodeType(
      { metadata: { Matter: matterData } },
      typeof body[METADATA_KEY_RAINMAKER_NODE_ID] === "string"
        ? (body[METADATA_KEY_RAINMAKER_NODE_ID] as string)
        : undefined,
    ) === ESPRMNeoMatterNodeType.rmneoMatter;

  // No probe result at all ⇒ hybrid (fail-safe), matching the header contract.
  if (Object.keys(matterData).length === 0) {
    return hybridDefault;
  }
  return { matterData, isRainmakerNode };
}

/** Posts a task result to native, or throws when the bridge is unavailable. */
function postResult(task: string, payload: Record<string, unknown>): void {
  if (!ESPMatterModule?.handleHeadlessTaskResult) {
    throw new Error(HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE);
  }
  ESPMatterModule.handleHeadlessTaskResult(task, JSON.stringify(payload));
}

/** Resolves the logged-in user, or throws when the session is gone. */
async function requireLoggedInUser(): Promise<void> {
  const user = await ESPRMNeoBase.getAuthInstance().getLoggedInUser();
  if (!user) {
    throw new Error(HEADLESS_ERROR_USER_NOT_AUTHENTICATED);
  }
}

/**
 * Builds a fabric handle from a group id alone.
 *
 * Deliberately avoids `getFabricById`, which would `GET /v1/groups` — an extra
 * round-trip inside an open CHIP fail-safe window. The commissioning methods
 * only need the id.
 */
function fabricFor(groupId: string): ESPRMNeoFabric {
  return new ESPRMNeoFabric({ groupId, groupName: "" });
}

/**
 * Exchanges the device's attestation for a NoC (`/verify`).
 * @param taskData - Native payload: ids plus the DAC-signed NOCSR elements.
 * @returns Result posted to native, including the NoC and Matter node id.
 */
export async function neoMatterIssueNocTask(
  taskData: NeoIssueNocTaskData,
): Promise<Record<string, unknown>> {
  try {
    await initializeNeoMatterSDK();

    if (!taskData?.nodeId || !taskData?.requestId || !taskData?.groupId) {
      throw new Error(HEADLESS_ERROR_MISSING_TASK_DATA);
    }
    if (
      !taskData.nocsrElements ||
      !taskData.attestationChallenge ||
      !taskData.attestationSignature
    ) {
      throw new Error(HEADLESS_ERROR_MISSING_TASK_DATA);
    }

    await requireLoggedInUser();

    // No CSR is sent. RMNeo takes the DAC-signed NOCSRElements and verifies that
    // the nonce inside them is the challenge it issued at `/initiate`, which is
    // why the CSR nonce must be the cloud's and not one CHIP picked.
    const response = await fabricFor(taskData.groupId).addNodeToMatterFabric({
      requestId: taskData.requestId,
      nocsrElements: taskData.nocsrElements,
      attestationChallenge: taskData.attestationChallenge,
      attestationSignature: taskData.attestationSignature,
    });

    const neoNodeId = response.node_id || "";
    const matterNodeId = response.matter_node_id;

    if (neoNodeId) {
      neoNodeIdByRequestId.set(taskData.requestId, neoNodeId);
    }
    if (matterNodeId) {
      matterNodeIdByRequestId.set(taskData.requestId, matterNodeId);
    }

    // The cloud does not echo matter_node_id on later reads, so persist the
    // pairing now; local discovery needs it to target the device.
    if (neoNodeId && matterNodeId) {
      try {
        await setMatterNodeId(neoNodeId, matterNodeId);
      } catch (persistError) {
        console.warn(
          "[HeadlessJS] Failed to persist matter_node_id:",
          persistError,
        );
      }
    }

    const resultData = {
      success: true,
      requestId: taskData.requestId,
      nodeId: taskData.nodeId,
      noc: response.noc,
      matterNodeId,
      neoNodeId,
    };

    postResult(HEADLESS_TASK_ISSUE_NOC, resultData);
    return resultData;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
    console.error("[HeadlessJS] neoMatterIssueNocTask error:", message);
    const errorData = {
      success: false,
      requestId: taskData?.requestId,
      nodeId: taskData?.nodeId,
      error: message,
    };
    if (ESPMatterModule?.handleHeadlessTaskResult) {
      postResult(HEADLESS_TASK_ISSUE_NOC, errorData);
    }
    throw error;
  }
}

/**
 * Confirms the node↔user mapping once the device has installed its NoC.
 *
 * Retry and single-use idempotency belong to the SDK (shared
 * `postConfirmUserNodeMappingWithRetry`): the cloud can report the request
 * unverified for a moment after `/verify`, and a confirm it no longer
 * recognises was consumed by an earlier one that succeeded.
 *
 * Pure/hybrid branch: hybrid confirms with requestId only (no capabilities,
 * no metadata); pure Matter confirms with `capabilities: ["matter"]` and hands
 * the SDK the probed endpoint topology for the post-confirm node-config PUT.
 * @param taskData - Native payload: node id, group id, request id, plus the
 * confirm body JSON (`metadata`) and the `/verify` neo node id (`neoNodeId`).
 * @returns Result posted to native.
 */
export async function neoMatterConfirmCommissionTask(
  taskData: NeoConfirmCommissionTaskData,
): Promise<Record<string, unknown>> {
  try {
    await initializeNeoMatterSDK();

    if (!taskData?.nodeId || !taskData?.requestId || !taskData?.groupId) {
      throw new Error(HEADLESS_ERROR_MISSING_TASK_DATA);
    }

    await requireLoggedInUser();

    const fabric = fabricFor(taskData.groupId);
    const { matterData, isRainmakerNode: probeSaysRainmakerNode } =
      parseNeoConfirmMetadata(taskData.metadata);
    const neoNodeId =
      neoNodeIdByRequestId.get(taskData.requestId) ??
      taskData.neoNodeId?.trim() ??
      "";
    // Native's nodeId is the operational Matter id; prefer the one `/verify`
    // returned alongside neoNodeId, which is the pair the cloud actually minted.
    const matterNodeId =
      matterNodeIdByRequestId.get(taskData.requestId) ??
      taskData.nodeId?.trim() ??
      "";

    // The EP0 probe reports isRainmaker=false for mirror firmware, which is a
    // hybrid: it publishes its own config and the cloud 403s a config write. The
    // cloud's ids settle it — they differ unless the node is really pure Matter.
    const isRainmakerNode =
      reconcileNodeTypeWithCloud(
        probeSaysRainmakerNode
          ? ESPRMNeoMatterNodeType.rmneoMatter
          : ESPRMNeoMatterNodeType.pureMatter,
        neoNodeId,
        matterNodeId,
      ) === ESPRMNeoMatterNodeType.rmneoMatter;

    let confirmResponse: Record<string, unknown>;
    let nodeConfigPushed: boolean | undefined;

    if (isRainmakerNode) {
      // Hybrid: identity binding split across `/verify` and `/confirm`, keyed
      // by requestId. No capabilities, no metadata — the device publishes its
      // own config afterwards. Byte-identical to the pre-pure-Matter behavior.

      confirmResponse = (await fabric.confirmUserNodeMappingWithRetry({
        requestId: taskData.requestId,
      })) as Record<string, unknown>;

      // The cloud rejects a config write for a hybrid, so its endpoint
      // topology has no home there — keep it locally instead. It is what maps
      // the node's cloud params onto Matter addresses for local control.
      if (neoNodeId && Object.keys(matterData).length > 0) {
        await setMatterMetadata(neoNodeId, matterData);
      }
    } else {
      // Pure Matter: confirm tags the node `["matter"]` and the SDK pushes the
      // endpoint topology to PUT /config (best-effort) right after.

      const commissioningRequest = new ESPRMNeoMatterCommissioningRequest({
        requestId: taskData.requestId,
        groupId: taskData.groupId,
        status: STATUS_PENDING,
        description: "Matter node commissioning in progress",
      });

      const pureResponse =
        await commissioningRequest.confirmMatterNodeCommissioning({
          nodeType: MatterNodeTypes.PURE_MATTER,
          status: STATUS_SUCCESS,
          nodeId: neoNodeId || undefined,
          matterNodeId: matterNodeId || undefined,
          capabilities: [MATTER_CAPABILITY],
          metadata:
            Object.keys(matterData).length > 0
              ? { [MATTER_METADATA_KEY]: matterData }
              : undefined,
        });
      confirmResponse = pureResponse as unknown as Record<string, unknown>;
      nodeConfigPushed = pureResponse.nodeConfigPushed;

      // Config-write failure must not fail commissioning: the node is mapped.
      // Persist the payload so group sync re-pushes it (self-heal).
      if (
        nodeConfigPushed === false &&
        neoNodeId &&
        Object.keys(matterData).length > 0
      ) {
        await setPendingNodeConfig(taskData.groupId, neoNodeId, matterData);
      }
    }

    const resultData = {
      success: true,
      requestId: taskData.requestId,
      nodeId: taskData.nodeId,
      // Neo cloud node id in BOTH branches; native must only treat it as a
      // RainMaker node id when isRainmakerNode is true.
      confirmNodeId: neoNodeId,
      isRainmakerNode,
      ...(nodeConfigPushed !== undefined ? { nodeConfigPushed } : {}),
      response: confirmResponse,
    };
    neoNodeIdByRequestId.delete(taskData.requestId);
    matterNodeIdByRequestId.delete(taskData.requestId);
    postResult(HEADLESS_TASK_CONFIRM_COMMISSION, resultData);
    return resultData;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
    console.error(
      "[HeadlessJS] neoMatterConfirmCommissionTask error:",
      message,
    );
    const errorData = {
      success: false,
      requestId: taskData?.requestId,
      nodeId: taskData?.nodeId,
      error: message,
    };
    if (ESPMatterModule?.handleHeadlessTaskResult) {
      postResult(HEADLESS_TASK_CONFIRM_COMMISSION, errorData);
    }
    throw error;
  }
}
