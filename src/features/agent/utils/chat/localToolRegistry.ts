/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  mapCdfFileToGalleryFile,
  pickDownloadUrl,
  sortGalleryFilesByNewest,
  type CdfFileEntity,
  type CdfFileListResult,
  type GalleryFile,
} from "@shared/utils/galleryFileUtils";
import {
  parseAgentCaptureResponse,
  runCameraJpegCapture,
} from "@shared/utils/camera/cameraCapture";
import { uploadRemoteChatMediaFromUrl, toAgentChatMediaReference } from "@features/agent/utils/chat/mediaUpload";
import { getAgentMediaDownloadUrl } from "@features/agent/utils/apiHelper";
import {
  CAMERA_SNAPSHOT_POLL_INTERVAL_SEC,
  CAPTURE_SNAPSHOT_MEDIA_MESSAGE_DELAY_MS,
  LOCAL_TOOL_NAMES,
  LOCAL_TOOL_WAIT_SECONDS_MAX,
} from "@features/agent/utils/constants";
import { delay } from "@shared/utils/common";
import {
  AGENT_MEDIA_TYPE_IMAGE,
  CAMERA_CMD_ARG_AGENT_ID,
  CAMERA_CMD_ARG_CONV_ID,
  CAMERA_CMD_ARG_QUALITY,
  CAMERA_CMD_ARG_RES,
  CAMERA_CAPTURE_QUALITY,
  CAMERA_CAPTURE_RESOLUTION,
  GALLERY_FILE_ENTITY_TYPE_NODE,
  IMAGE_MIME_TYPE_JPEG,
  NODE_CMD_STATUS_FAILURE,
  NODE_CMD_STATUS_SUCCESS,
  NODE_CMD_STATUS_TIMED_OUT,
} from "@shared/utils/constants";
import type { ESPCDFUser } from "@store";
import type { WebSocketMessage } from "@features/agent/utils/types";
import type { ChatMediaAttachment } from "@src/types/global";

/** Parsed `tool_request` payload from the agent WebSocket. */
export interface ToolRequestPayload {
  request_id: string;
  tool_name: string;
  input: Record<string, unknown>;
}

/** Dependencies injected by the chat hook when executing a local tool. */
export interface LocalToolContext {
  /** Authenticated CDF user for store-backed APIs (files + cmd-resp). */
  espCDFUser: ESPCDFUser | null;
  getAgentId: () => Promise<string | null>;
  getConversationId: () => Promise<string | null>;
  onAssistantMediaUploaded?: (
    media: ChatMediaAttachment,
    messageText: string,
  ) => void | Promise<void>;
}

type LocalToolHandler = (
  input: Record<string, unknown>,
  ctx: LocalToolContext,
) => Promise<unknown>;

/**
 * Maps a gallery file record to the shape expected by camera agent tools.
 * @param file - Normalized gallery file from CDF `getFiles` / `getFileById`.
 * @returns Agent-facing file metadata.
 */
function toAgentFileRecord(file: GalleryFile) {
  return {
    file_id: file.fileId,
    file_name: file.name,
    file_type: file.contentType,
    timestamp: file.timestampMs,
    ...(file.url ? { file_url: file.url } : {}),
  };
}

/**
 * Lists the most recent files uploaded by a camera node via CDF `getFiles`
 * (same path as the gallery screen).
 * Optional filters help locate a snapshot captured after a known baseline.
 * @param input - Tool input (`entity_id`, `entity_type`, `num_records`, `file_name`, `file_type`, `min_timestamp`, `exclude_file_ids`).
 * @param ctx - CDF user context for file APIs.
 * @returns File list or error payload.
 */
async function getLatestFiles(
  input: Record<string, unknown>,
  ctx: LocalToolContext,
): Promise<unknown> {
  const entityId = String(input.entity_id ?? "");
  const entityType = String(input.entity_type ?? "");
  if (!entityId || entityType !== GALLERY_FILE_ENTITY_TYPE_NODE) {
    return { status: "error", message: "Invalid entity_id or entity_type" };
  }
  if (!ctx.espCDFUser) {
    return { status: "error", message: "User not authenticated" };
  }

  const numRecords = Number(input.num_records ?? 3);
  const fileName = String(input.file_name ?? "").trim();
  const fileType = String(input.file_type ?? "").trim();
  const startId = String(input.start_id ?? "").trim();

  // Same CDF `getFiles` call as `useGallery` — no raw `/user/file` HTTP.
  const listed = (await ctx.espCDFUser.getFiles({
    entityType: GALLERY_FILE_ENTITY_TYPE_NODE,
    entityId,
    resultCount: Number.isFinite(numRecords) ? numRecords : 3,
    ...(fileName ? { fileName } : {}),
    ...(fileType ? { fileType } : {}),
    ...(startId ? { startId } : {}),
  })) as unknown as CdfFileListResult;

  const entities = Array.isArray(listed?.files) ? listed.files : [];
  const allFiles = sortGalleryFilesByNewest(
    entities.filter((f) => Boolean(f?.fileId)).map(mapCdfFileToGalleryFile),
  );
  let files = allFiles.map(toAgentFileRecord);

  const minTimestamp =
    input.min_timestamp != null ? Number(input.min_timestamp) : null;
  const excludeFileIds = Array.isArray(input.exclude_file_ids)
    ? input.exclude_file_ids.map((id) => String(id))
    : null;

  if (minTimestamp != null && Number.isFinite(minTimestamp)) {
    files = files.filter((file) => file.timestamp > minTimestamp);
  }
  if (excludeFileIds?.length) {
    const excluded = new Set(excludeFileIds);
    files = files.filter((file) => !excluded.has(file.file_id));
  }

  return {
    status: "success",
    files,
    newest_match: files[0] ?? null,
    total_before_filter: allFiles.length,
  };
}

/**
 * Pauses the agent flow for a fixed interval (used while polling for uploads).
 * @param input - Tool input (`seconds`, default 5).
 * @returns Confirmation of how long the tool waited.
 */
async function waitSeconds(
  input: Record<string, unknown>,
  _ctx: LocalToolContext,
): Promise<unknown> {
  const requested = Number(input.seconds ?? CAMERA_SNAPSHOT_POLL_INTERVAL_SEC);
  const seconds = Math.min(
    Math.max(Number.isFinite(requested) ? requested : CAMERA_SNAPSHOT_POLL_INTERVAL_SEC, 1),
    LOCAL_TOOL_WAIT_SECONDS_MAX,
  );
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return { status: "success", waited_seconds: seconds };
}

/**
 * Resolves a presigned download URL for a single node file via CDF
 * `getFileById` (same path as the gallery screen).
 * @param input - Tool input (`entity_id`, `entity_type`, `file_id`).
 * @param ctx - CDF user context for file APIs.
 * @returns Download metadata or error payload.
 */
async function getFileDownloadInfo(
  input: Record<string, unknown>,
  ctx: LocalToolContext,
): Promise<unknown> {
  const entityId = String(input.entity_id ?? "");
  const entityType = String(input.entity_type ?? "");
  const fileId = String(input.file_id ?? "");
  if (!entityId || entityType !== GALLERY_FILE_ENTITY_TYPE_NODE || !fileId) {
    return { status: "error", message: "Invalid entity_id, entity_type, or file_id" };
  }
  if (!ctx.espCDFUser) {
    return { status: "error", message: "User not authenticated" };
  }

  const entity = await ctx.espCDFUser.getFileById<CdfFileEntity | null>(fileId);
  if (!entity) {
    return { status: "error", message: "File not found or URL unavailable" };
  }
  const url = pickDownloadUrl(entity);
  if (!url) {
    return { status: "error", message: "File not found or URL unavailable" };
  }
  const file = mapCdfFileToGalleryFile(entity);
  return {
    status: "success",
    file_id: file.fileId,
    file_name: file.name,
    file_type: file.contentType,
    file_url: url,
  };
}

/**
 * Downloads a remote file URL and uploads it to the active agent conversation.
 * @param input - Tool input (`file_url`, optional `file_name`, `file_type`, `file_id`, `text`).
 * @param ctx - Agent and conversation context from the chat hook.
 * @returns Uploaded media metadata or error payload.
 */
async function uploadFileToAgent(
  input: Record<string, unknown>,
  ctx: LocalToolContext,
): Promise<unknown> {
  const fileUrl = String(input.file_url ?? "");
  if (!fileUrl) {
    return { status: "error", message: "file_url is required" };
  }

  const agentId = await ctx.getAgentId();
  const conversationId = await ctx.getConversationId();
  if (!agentId || !conversationId) {
    return { status: "error", message: "Agent or conversation not ready" };
  }

  const fileName = String(input.file_name ?? "");
  const fileType = String(input.file_type ?? "");
  const fileId = String(input.file_id ?? "");
  const messageText = String(input.text ?? "hello");
  // Exact size (when the agent supplies it) lets the upload URL be fetched in
  // parallel with the download. Verified downstream, so a wrong value is safe.
  const sizeBytes = Number(input.file_size ?? input.size_bytes);

  try {
    const uploaded = await uploadRemoteChatMediaFromUrl(
      agentId,
      conversationId,
      {
        fileUrl,
        ...(fileName ? { fileName } : {}),
        ...(fileType ? { fileType } : {}),
        ...(fileId ? { fileId } : {}),
        ...(Number.isFinite(sizeBytes) && sizeBytes > 0 ? { sizeBytes } : {}),
      },
    );
    await ctx.onAssistantMediaUploaded?.(uploaded, messageText);
    return { status: "success", ...toAgentChatMediaReference(uploaded) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return { status: "error", message };
  }
}

/**
 * Triggers a fresh device snapshot that the device uploads straight into the
 * active agent conversation, then returns its media reference. Collapses the
 * old capture → poll → list → download → upload sequence into one call: the
 * device performs the agent upload itself (the capture command carries the
 * agent + conversation ids), so no phone-side download/re-upload is needed.
 * @param input - Tool input (`node_id` / `entity_id`, and `text` sent with the image message).
 * @param ctx - Agent and conversation context from the chat hook.
 * @returns Agent media reference for the captured snapshot, or error payload.
 */
async function captureSnapshot(
  input: Record<string, unknown>,
  ctx: LocalToolContext,
): Promise<unknown> {
  const nodeId = String(input.node_id ?? input.entity_id ?? "");
  if (!nodeId) {
    return { status: "error", message: "node_id is required" };
  }

  const messageText = String(input.text ?? "").trim();
  if (!messageText) {
    return {
      status: "error",
      message:
        "text is required — pass the user's visibility question or a describe prompt in their language.",
    };
  }

  const agentId = await ctx.getAgentId();
  const conversationId = await ctx.getConversationId();
  if (!agentId || !conversationId) {
    return { status: "error", message: "Agent or conversation not ready" };
  }

  if (!ctx.espCDFUser) {
    return { status: "error", message: "User not authenticated" };
  }

  try {
    // Same CDF cmd-resp path as Camera.tsx / `useCameraCommand`; only the
    // jpeg-capture args differ (`--agent-id` / `--conv-id` vs `--upload`).
    const { status, responseData } = await runCameraJpegCapture(
      ctx.espCDFUser,
      nodeId,
      [
        CAMERA_CMD_ARG_QUALITY,
        CAMERA_CAPTURE_QUALITY,
        CAMERA_CMD_ARG_RES,
        CAMERA_CAPTURE_RESOLUTION,
        CAMERA_CMD_ARG_AGENT_ID,
        agentId,
        CAMERA_CMD_ARG_CONV_ID,
        conversationId,
      ],
    );

    if (status === NODE_CMD_STATUS_FAILURE) {
      throw new Error("Device failed to capture the snapshot");
    }
    if (status === NODE_CMD_STATUS_TIMED_OUT) {
      throw new Error("Device snapshot capture timed out");
    }
    if (status !== NODE_CMD_STATUS_SUCCESS) {
      throw new Error("Timed out waiting for the snapshot capture to complete");
    }

    const snapshot = parseAgentCaptureResponse(responseData);
    // Resolve a display URL for the already-uploaded image so the snapshot
    // renders inline in the chat bubble (best-effort; describe still works
    // without it). This does NOT re-upload — it just fetches a presigned GET.
    let localUri: string | undefined;
    try {
      localUri = await getAgentMediaDownloadUrl(
        agentId,
        conversationId,
        snapshot.mediaId,
        snapshot.s3Key,
      );
    } catch {
      // No thumbnail URL — proceed without it.
    }

    // The device already uploaded the image; this does NOT re-upload it. It
    // posts a message that references the existing media so the agent's model
    // actually receives the pixels and can describe the real scene. Without
    // this the tool result alone never feeds the image to the model, so it
    // produces a generic, identical description every time.
    const attachment: ChatMediaAttachment = {
      type: AGENT_MEDIA_TYPE_IMAGE,
      mediaId: snapshot.mediaId,
      s3Key: snapshot.s3Key,
      contentType: IMAGE_MIME_TYPE_JPEG,
      filename: snapshot.filename,
      sizeBytes: snapshot.sizeBytes ?? 0,
      ...(localUri ? { localUri } : {}),
    };
    // `text` comes from the agent's tool call and is sent verbatim with the image.
    await delay(CAPTURE_SNAPSHOT_MEDIA_MESSAGE_DELAY_MS);
    await ctx.onAssistantMediaUploaded?.(attachment, messageText);

    // Minimal result on purpose: the image reaches the model via the message
    // posted above, so we do NOT echo the media reference here. Returning media
    // fields tempts the agent to "describe" the tool result — a second,
    // image-less, generic reply. Tell it the image is delivered as a message.
    return {
      status: "success"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture failed";
    return { status: "error", message };
  }
}

/** Registry of local tool name → handler. */
const LOCAL_TOOL_REGISTRY: Record<string, LocalToolHandler> = {
  [LOCAL_TOOL_NAMES.GET_LATEST_FILES]: getLatestFiles,
  [LOCAL_TOOL_NAMES.GET_FILE_DOWNLOAD_INFO]: getFileDownloadInfo,
  [LOCAL_TOOL_NAMES.UPLOAD_FILE_TO_AGENT]: uploadFileToAgent,
  [LOCAL_TOOL_NAMES.WAIT_SECONDS]: waitSeconds,
  [LOCAL_TOOL_NAMES.CAPTURE_SNAPSHOT]: captureSnapshot,
};

/**
 * Parses a `tool_request` WebSocket message into a normalized payload.
 * @param message - Incoming WebSocket message.
 * @returns Parsed request or null when not a local tool request.
 */
export function parseToolRequest(
  message: WebSocketMessage,
): ToolRequestPayload | null {
  if (message.type !== "tool_request") {
    return null;
  }
  const raw =
    typeof message.content === "string"
      ? (JSON.parse(message.content) as Record<string, unknown>)
      : (message.content as Record<string, unknown>);
  const toolName = String(raw.tool_name ?? "");
  if (!toolName || !LOCAL_TOOL_REGISTRY[toolName]) {
    return null;
  }
  return {
    request_id: String(raw.request_id ?? ""),
    tool_name: toolName,
    input: (raw.input as Record<string, unknown>) ?? {},
  };
}

/**
 * Builds the WebSocket response after a local tool completes.
 * @param requestId - `request_id` from the inbound `tool_request`.
 * @param result - Handler return value.
 * @returns Outbound `tool_response` message.
 */
export function buildToolResultMessage(
  requestId: string,
  result: unknown,
): WebSocketMessage {
  return {
    type: "tool_response",
    content_type: "json",
    content: {
      request_id: requestId,
      result,
    },
  };
}

/**
 * Runs a registered local tool and returns the WebSocket response, or null if
 * the tool name is not handled locally.
 * @param request - Parsed tool request payload.
 * @param ctx - Auth / API context from the chat hook.
 * @returns Response message to send on the socket, or null.
 */
export async function executeLocalTool(
  request: ToolRequestPayload,
  ctx: LocalToolContext,
): Promise<WebSocketMessage | null> {
  const handler = LOCAL_TOOL_REGISTRY[request.tool_name];
  if (!handler) {
    return null;
  }
  try {
    const result = await handler(request.input, ctx);
    return buildToolResultMessage(request.request_id, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed";
    return buildToolResultMessage(request.request_id, { status: "error", message });
  }
}

/**
 * Handles an incoming `tool_request` when it matches the local registry.
 * @param message - Raw WebSocket message.
 * @param ctx - Auth context.
 * @param send - Sends a message back on the open WebSocket.
 * @returns True when the message was handled locally.
 */
export async function handleLocalToolRequest(
  message: WebSocketMessage,
  ctx: LocalToolContext,
  send: (response: WebSocketMessage) => void,
): Promise<boolean> {
  const request = parseToolRequest(message);
  if (!request) {
    return false;
  }
  const response = await executeLocalTool(request, ctx);
  if (response) {
    send(response);
  }
  return true;
}
