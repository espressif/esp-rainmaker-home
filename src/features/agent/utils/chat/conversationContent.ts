/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentChatMediaReference,
  AgentMultimodalMessageContent,
  ConversationMessage,
} from "@features/agent/utils/types";
import type { ChatMediaAttachment } from "@src/types/global";

/**
 * Coerce API size_bytes (number or string) into a finite byte count for UI.
 * @param sizeBytes - Raw size from conversation or upload metadata.
 * @returns Parsed byte count, or 0 when missing or invalid.
 */
function parseMediaSizeBytes(sizeBytes: number | string | undefined): number {
  if (sizeBytes === undefined || sizeBytes === null) {
    return 0;
  }
  const parsed =
    typeof sizeBytes === "string" ? Number(sizeBytes) : sizeBytes;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Map a wire-format media reference into chat UI attachment metadata.
 * @param item - Media reference from conversation or multimodal content.
 * @returns Chat attachment without a resolved display URL.
 */
export function mapAgentChatMediaReference(
  item: AgentChatMediaReference
): ChatMediaAttachment {
  return {
    type: item.type,
    mediaId: item.media_id,
    s3Key: item.s3_key,
    contentType: item.content_type,
    filename: item.filename,
    sizeBytes: parseMediaSizeBytes(item.size_bytes),
  };
}

/**
 * Normalize persisted conversation content into chat UI fields.
 * @param content - Stored conversation message content.
 * @returns Text and optional media attachments for rendering.
 */
export function mapConversationMessageContent(
  content: string | AgentMultimodalMessageContent
): { text: string; media?: ChatMediaAttachment[] } {
  if (typeof content === "string") {
    return { text: content };
  }

  return {
    text: content.text || "",
    media: content.media?.map(mapAgentChatMediaReference),
  };
}

/**
 * Normalize a stored conversation message, including root-level media arrays
 * returned by the agents API when content is plain text.
 * @param message - Stored conversation message row.
 * @returns Text and optional media attachments for rendering.
 */
export function mapConversationMessage(
  message: Pick<ConversationMessage, "content" | "media">
): { text: string; media?: ChatMediaAttachment[] } {
  const mappedContent = mapConversationMessageContent(message.content);
  const messageMedia = message.media?.map(mapAgentChatMediaReference);

  return {
    text: mappedContent.text,
    media: messageMedia?.length ? messageMedia : mappedContent.media,
  };
}
