/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AGENT_MEDIA_TYPE_IMAGE,
  HTTP_METHOD_PUT,
  IMAGE_MIME_TYPE_GIF,
  IMAGE_MIME_TYPE_JPEG,
  IMAGE_MIME_TYPE_PNG,
  IMAGE_MIME_TYPE_WEBP,
} from "@shared/utils/constants";
import {
  getAgentMediaConfig,
  getAgentMediaDownloadUrl,
  getAgentMediaUploadUrl,
} from "@features/agent/utils/apiHelper";
import {
  CHAT_MEDIA_VALIDATION_ERROR,
  validatePendingMediaAttachment,
  AgentMediaValidationError,
} from "@features/agent/utils/chat/mediaConfig";
import type {
  AgentChatMediaReference,
  AgentMediaConfig,
  AgentMediaUploadUrlResponse,
  PendingChatMediaAttachment,
} from "@features/agent/utils/types";
import type { ChatMediaAttachment } from "@src/types/global";

/** Optional metadata from `get_file_download_info` for remote uploads. */
export interface RemoteChatMediaSource {
  fileUrl: string;
  fileName?: string;
  fileType?: string;
  fileId?: string;
  /**
   * Exact byte size of the file, when known up front (e.g. the device's capture
   * report or the RainMaker file record). When provided together with `fileType`
   * and `fileName`, the agent upload URL is fetched *in parallel* with the
   * download instead of after it. It must be the true size: it is verified
   * against the downloaded bytes, and any mismatch falls back to a sequential
   * re-request so we never PUT against a wrongly-signed URL.
   */
  sizeBytes?: number;
}

/** A file downloaded into memory, ready to PUT to the agent's S3 bucket. */
interface DownloadedRemoteFile {
  blob: Blob;
  contentType: string;
  filename: string;
}

/**
 * Upload file bytes to the presigned S3 URL returned by the agents API.
 * @param uploadUrl - Presigned S3 PUT URL.
 * @param blob - File bytes to upload.
 * @param contentType - MIME type that must match the signed URL.
 */
export async function uploadBlobToS3(
  uploadUrl: string,
  blob: Blob,
  contentType: string
): Promise<void> {
  const putStart = Date.now();
  console.log(`[TIMING] ${putStart} agent-put-start bytes=${blob.size}`);
  const uploadResponse = await fetch(uploadUrl, {
    method: HTTP_METHOD_PUT,
    headers: {
      "Content-Type": contentType,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`S3 upload failed with status ${uploadResponse.status}`);
  }
  console.log(`[TIMING] ${Date.now()} agent-put-done (+${Date.now() - putStart}ms)`);
}

/**
 * Upload a local image file to the presigned S3 URL returned by the agents API.
 * @param uploadUrl - Presigned S3 PUT URL.
 * @param fileUri - Local file URI from the image picker.
 * @param contentType - MIME type that must match the signed URL.
 */
export async function uploadMediaToS3(
  uploadUrl: string,
  fileUri: string,
  contentType: string
): Promise<void> {
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();
  await uploadBlobToS3(uploadUrl, blob, contentType);
}

/**
 * Derives a filename from the last path segment of a remote URL.
 * @param fileUrl - Remote file URL.
 * @returns Decoded filename or null when unavailable.
 */
function filenameFromUrl(fileUrl: string): string | null {
  try {
    const pathname = new URL(fileUrl).pathname;
    const base = pathname.split("/").pop();
    if (!base || !base.includes(".")) {
      return null;
    }
    return decodeURIComponent(base);
  } catch {
    return null;
  }
}

/**
 * Downloads a remote file from URL into memory.
 * @param fileUrl - Presigned or public URL of the file.
 * @param sourceFilename - Original filename when provided by the caller.
 * @param sourceFileType - MIME type when provided by the caller.
 * @returns Downloaded blob, content type, and filename.
 */
async function downloadRemoteFile(
  fileUrl: string,
  sourceFilename?: string,
  sourceFileType?: string,
): Promise<DownloadedRemoteFile> {
  const dlStart = Date.now();
  console.log(`[TIMING] ${dlStart} rm-download-start`);
  const downloadResponse = await fetch(fileUrl);
  if (!downloadResponse.ok) {
    throw new Error(`Failed to download file: ${downloadResponse.status}`);
  }

  const downloadedBlob = await downloadResponse.blob();
  console.log(
    `[TIMING] ${Date.now()} rm-download-done (+${Date.now() - dlStart}ms) bytes=${downloadedBlob.size}`,
  );
  if (downloadedBlob.size <= 0) {
    throw new Error("Downloaded file is empty");
  }

  const contentType =
    sourceFileType ||
    downloadResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
    downloadedBlob.type ||
    IMAGE_MIME_TYPE_JPEG;
  const filename =
    sourceFilename ||
    filenameFromUrl(fileUrl) ||
    buildDefaultChatImageFilename(contentType);

  return {
    blob: downloadedBlob,
    contentType,
    filename,
  };
}

/**
 * Validates a content-type + size against the agent's media config, throwing
 * {@link AgentMediaValidationError} when not allowed.
 * @param contentType - File MIME type.
 * @param sizeBytes - File size in bytes.
 * @param config - The agent's media upload constraints.
 * @returns The resolved media type when valid.
 */
function assertMediaAllowed(
  contentType: string,
  sizeBytes: number,
  config: AgentMediaConfig,
): string | undefined {
  const validation = validatePendingMediaAttachment(
    { contentType, sizeBytes, mediaType: "" },
    config,
  );
  if (!validation.isValid) {
    throw new AgentMediaValidationError(
      validation.errorKey || CHAT_MEDIA_VALIDATION_ERROR.TYPE_NOT_ALLOWED,
      validation.maxSizeMb,
    );
  }
  return validation.mediaType;
}

/**
 * Builds the chat-media attachment record from a completed upload.
 * @param uploadMeta - Response from the agents upload-url request.
 * @param mediaType - Resolved media type from validation.
 * @param localUri - Source URL kept for UI rendering.
 * @returns The attachment metadata for the store + WebSocket.
 */
function toChatMediaAttachment(
  uploadMeta: AgentMediaUploadUrlResponse,
  mediaType: string | undefined,
  localUri: string,
): ChatMediaAttachment {
  return {
    type: uploadMeta.type || mediaType || AGENT_MEDIA_TYPE_IMAGE,
    mediaId: uploadMeta.media_id,
    s3Key: uploadMeta.s3_key,
    contentType: uploadMeta.content_type,
    filename: uploadMeta.filename,
    sizeBytes: uploadMeta.size_bytes,
    localUri,
  };
}

/**
 * Validates the downloaded bytes, requests an upload URL for their real
 * size/type, and PUTs them. Used as the canonical path and as the fallback when
 * a pipelined (pre-download) URL request was signed for the wrong size/type.
 * @param agentId - Active agent identifier.
 * @param conversationId - Current conversation identifier.
 * @param file - The downloaded file.
 * @param config - The agent's media config (already fetched).
 * @param localUri - Source URL kept for UI rendering.
 * @returns Uploaded media metadata.
 */
async function finalizeRemoteUpload(
  agentId: string,
  conversationId: string,
  file: DownloadedRemoteFile,
  config: AgentMediaConfig,
  localUri: string,
): Promise<ChatMediaAttachment> {
  const mediaType = assertMediaAllowed(file.contentType, file.blob.size, config);
  const uploadMeta = await getAgentMediaUploadUrl(agentId, {
    conversation_id: conversationId,
    filename: file.filename,
    content_type: file.contentType,
    size_bytes: file.blob.size,
  });
  await uploadBlobToS3(uploadMeta.upload_url, file.blob, uploadMeta.content_type);
  return toChatMediaAttachment(uploadMeta, mediaType, localUri);
}

/**
 * Downloads a remote file and uploads it through the agents presigned S3 flow.
 *
 * The agent media config is always fetched concurrently with the download. When
 * the caller supplies an exact `sizeBytes` (plus `fileType` and `fileName`), the
 * agent upload URL is also fetched *in parallel* with the download — the bytes
 * are verified against the declaration afterward, falling back to a sequential
 * re-request on any mismatch (the presigned PUT pins size/content-type).
 * @param agentId - Active agent identifier.
 * @param conversationId - Current conversation identifier.
 * @param source - Remote file URL or metadata from `get_file_download_info`.
 * @returns Uploaded media metadata for WebSocket and UI rendering.
 */
export async function uploadRemoteChatMediaFromUrl(
  agentId: string,
  conversationId: string,
  source: string | RemoteChatMediaSource,
): Promise<ChatMediaAttachment> {
  const fileUrl = typeof source === "string" ? source : source.fileUrl;
  const sourceFilename =
    typeof source === "string" ? undefined : source.fileName;
  const sourceFileType =
    typeof source === "string" ? undefined : source.fileType;
  const declaredSize =
    typeof source === "string" ? undefined : source.sizeBytes;

  // Config is independent of the bytes — never block the download on it.
  const configPromise = getAgentMediaConfig(agentId);

  // Pipeline the upload-URL fetch only when we have an exact size + type + name
  // to declare; otherwise the presigned PUT could be signed for the wrong bytes.
  const canPipeline =
    typeof declaredSize === "number" &&
    declaredSize > 0 &&
    !!sourceFileType &&
    !!sourceFilename;

  if (canPipeline) {
    const declaredContentType = sourceFileType as string;
    // Fail fast on the declared metadata before spending the download bandwidth.
    const config = await configPromise;
    const mediaType = assertMediaAllowed(
      declaredContentType,
      declaredSize as number,
      config,
    );

    // Download bytes and request the upload URL at the same time.
    const [file, uploadMeta] = await Promise.all([
      downloadRemoteFile(fileUrl, sourceFilename, declaredContentType),
      getAgentMediaUploadUrl(agentId, {
        conversation_id: conversationId,
        filename: sourceFilename as string,
        content_type: declaredContentType,
        size_bytes: declaredSize as number,
      }),
    ]);

    // Guard: the URL was signed for the declared size/type. Only reuse it when
    // the bytes actually match (pure passthrough — we PUT exactly what we got).
    const matchesDeclaration =
      file.blob.size === declaredSize &&
      file.contentType === declaredContentType;

    if (matchesDeclaration) {
      await uploadBlobToS3(uploadMeta.upload_url, file.blob, uploadMeta.content_type);
      return toChatMediaAttachment(uploadMeta, mediaType, fileUrl);
    }

    // Declared metadata was off — discard the pre-signed URL and re-request for
    // the real bytes so the PUT can't fail a size/content-length check.
    return finalizeRemoteUpload(agentId, conversationId, file, config, fileUrl);
  }

  // No trusted size: download + config concurrently, then upload sequentially.
  const [file, config] = await Promise.all([
    downloadRemoteFile(fileUrl, sourceFilename, sourceFileType),
    configPromise,
  ]);
  return finalizeRemoteUpload(agentId, conversationId, file, config, fileUrl);
}

/**
 * Resolve a chat media attachment through the agents upload-url + S3 PUT flow.
 * @param agentId - Active agent identifier.
 * @param conversationId - Current conversation identifier.
 * @param attachment - Local image selected in chat.
 * @returns Uploaded media metadata for WebSocket and UI rendering.
 */
export async function uploadChatMediaAttachment(
  agentId: string,
  conversationId: string,
  attachment: PendingChatMediaAttachment
): Promise<ChatMediaAttachment> {
  const mediaConfig = await getAgentMediaConfig(agentId);
  const validation = validatePendingMediaAttachment(attachment, mediaConfig);

  if (!validation.isValid) {
    throw new AgentMediaValidationError(
      validation.errorKey || CHAT_MEDIA_VALIDATION_ERROR.TYPE_NOT_ALLOWED,
      validation.maxSizeMb
    );
  }

  const uploadMeta = await getAgentMediaUploadUrl(agentId, {
    conversation_id: conversationId,
    filename: attachment.filename,
    content_type: attachment.contentType,
    size_bytes: attachment.sizeBytes,
  });

  await uploadMediaToS3(
    uploadMeta.upload_url,
    attachment.uri,
    uploadMeta.content_type
  );

  return {
    type: uploadMeta.type || validation.mediaType || AGENT_MEDIA_TYPE_IMAGE,
    mediaId: uploadMeta.media_id,
    s3Key: uploadMeta.s3_key,
    contentType: uploadMeta.content_type,
    filename: uploadMeta.filename,
    sizeBytes: uploadMeta.size_bytes,
    localUri: attachment.uri,
  };
}

/**
 * Map uploaded chat media into the WebSocket multimodal payload shape.
 * @param media - Uploaded media metadata from the app store model.
 * @returns API wire-format media reference.
 */
export function toAgentChatMediaReference(
  media: ChatMediaAttachment
): AgentChatMediaReference {
  return {
    type: media.type,
    media_id: media.mediaId,
    s3_key: media.s3Key,
    content_type: media.contentType,
    filename: media.filename,
    size_bytes: media.sizeBytes,
  };
}

/**
 * Build a default filename when the picker does not provide one.
 * @param contentType - Selected image MIME type.
 * @returns Generated filename with an appropriate extension.
 */
export function buildDefaultChatImageFilename(contentType: string): string {
  const extensionByMime: Record<string, string> = {
    [IMAGE_MIME_TYPE_JPEG]: "jpg",
    [IMAGE_MIME_TYPE_PNG]: "png",
    [IMAGE_MIME_TYPE_WEBP]: "webp",
    [IMAGE_MIME_TYPE_GIF]: "gif",
  };
  const extension = extensionByMime[contentType] || "jpg";
  return `chat-image-${Date.now()}.${extension}`;
}

/**
 * Resolve presigned download URLs for persisted chat media so loaded
 * conversations can render thumbnails and open full-screen previews.
 * @param agentId - Active agent identifier.
 * @param conversationId - Conversation that owns the media objects.
 * @param media - Mapped attachments without display URLs.
 * @returns Attachments with `localUri` set when the download URL resolves.
 */
export async function resolveChatMediaDownloadUrls(
  agentId: string,
  conversationId: string,
  media?: ChatMediaAttachment[]
): Promise<ChatMediaAttachment[] | undefined> {
  if (!media?.length) {
    return media;
  }

  return Promise.all(
    media.map(async (attachment) => {
      if (attachment.localUri) {
        return attachment;
      }
      if (!attachment.mediaId || !attachment.s3Key) {
        return attachment;
      }

      try {
        const localUri = await getAgentMediaDownloadUrl(
          agentId,
          conversationId,
          attachment.mediaId,
          attachment.s3Key
        );
        return { ...attachment, localUri };
      } catch (error) {
        console.error(
          "[resolveChatMediaDownloadUrls] Failed to resolve media URL:",
          attachment.mediaId,
          error
        );
        return attachment;
      }
    })
  );
}
