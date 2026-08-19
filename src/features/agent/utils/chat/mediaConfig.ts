/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AGENT_MEDIA_TYPE_IMAGE,
  IMAGE_MIME_TYPE_GIF,
  IMAGE_MIME_TYPE_JPEG,
  IMAGE_MIME_TYPE_PNG,
  IMAGE_MIME_TYPE_WEBP,
} from "@shared/utils/constants";
import type {
  AgentMediaConfig,
  PendingChatMediaAttachment,
} from "@features/agent/utils/types";

export const CHAT_MEDIA_VALIDATION_ERROR = {
  TYPE_NOT_ALLOWED: "chat.mediaTypeNotAllowed",
  TOO_LARGE: "chat.mediaTooLarge",
  IMAGE_NOT_SUPPORTED: "chat.imageNotSupportedForAgent",
} as const;

export type ChatMediaValidationErrorKey =
  (typeof CHAT_MEDIA_VALIDATION_ERROR)[keyof typeof CHAT_MEDIA_VALIDATION_ERROR];

export interface ChatMediaValidationResult {
  isValid: boolean;
  mediaType?: string;
  errorKey?: ChatMediaValidationErrorKey;
  maxSizeMb?: number;
}

/**
 * Error thrown when a pending attachment violates agent media constraints.
 */
export class AgentMediaValidationError extends Error {
  /**
   * @param errorKey - i18n key describing the validation failure.
   * @param maxSizeMb - Optional max size in megabytes for oversize errors.
   */
  constructor(
    public readonly errorKey: ChatMediaValidationErrorKey,
    public readonly maxSizeMb?: number
  ) {
    super(errorKey);
    this.name = "AgentMediaValidationError";
  }
}

/**
 * Resolve the agent media bucket (image/video/document) for a MIME type.
 * @param contentType - Selected file MIME type.
 * @param config - Agent media upload constraints.
 * @returns Matching media type key or null when unsupported.
 */
export function resolveAgentMediaType(
  contentType: string,
  config: AgentMediaConfig
): string | null {
  for (const [mediaType, rules] of Object.entries(config.allowed_types)) {
    if (rules.mime_types.includes(contentType)) {
      return mediaType;
    }
  }

  return null;
}

/**
 * Check whether image attachments are allowed for the active agent.
 * @param config - Agent media upload constraints.
 * @returns True when at least one image MIME type is permitted.
 */
export function isAgentImageUploadAllowed(
  config: AgentMediaConfig | null | undefined
): boolean {
  const imageRules = config?.allowed_types?.[AGENT_MEDIA_TYPE_IMAGE];
  return Boolean(imageRules?.mime_types?.length);
}

/**
 * Validate a pending chat attachment against agent media constraints.
 * @param attachment - Local attachment selected in chat input.
 * @param config - Agent media upload constraints.
 * @returns Validation outcome with optional i18n error key.
 */
export function validatePendingMediaAttachment(
  attachment: Pick<
    PendingChatMediaAttachment,
    "contentType" | "sizeBytes" | "mediaType"
  >,
  config: AgentMediaConfig
): ChatMediaValidationResult {
  const mediaType =
    attachment.mediaType ||
    resolveAgentMediaType(attachment.contentType, config);

  if (!mediaType) {
    return {
      isValid: false,
      errorKey: CHAT_MEDIA_VALIDATION_ERROR.TYPE_NOT_ALLOWED,
    };
  }

  const rules = config.allowed_types[mediaType];
  if (!rules) {
    return {
      isValid: false,
      errorKey: CHAT_MEDIA_VALIDATION_ERROR.TYPE_NOT_ALLOWED,
    };
  }

  if (attachment.sizeBytes > rules.max_size_bytes) {
    return {
      isValid: false,
      errorKey: CHAT_MEDIA_VALIDATION_ERROR.TOO_LARGE,
      maxSizeMb: rules.max_size_mb,
    };
  }

  return {
    isValid: true,
    mediaType,
  };
}

/**
 * Infer a MIME type from a picked asset URI when the picker omits mimeType.
 * @param uri - Local asset URI.
 * @returns Best-effort MIME type for common image extensions.
 */
export function inferImageContentTypeFromUri(uri: string): string {
  const normalizedUri = uri.toLowerCase();

  if (normalizedUri.endsWith(".png")) {
    return IMAGE_MIME_TYPE_PNG;
  }
  if (normalizedUri.endsWith(".webp")) {
    return IMAGE_MIME_TYPE_WEBP;
  }
  if (normalizedUri.endsWith(".gif")) {
    return IMAGE_MIME_TYPE_GIF;
  }

  return IMAGE_MIME_TYPE_JPEG;
}
