/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import { getAgentMediaConfig } from "@features/agent/utils/apiHelper";
import {
  buildDefaultChatImageFilename,
} from "@features/agent/utils/chat/mediaUpload";
import {
  CHAT_MEDIA_VALIDATION_ERROR,
  inferImageContentTypeFromUri,
  isAgentImageUploadAllowed,
  resolveAgentMediaType,
  validatePendingMediaAttachment,
} from "@features/agent/utils/chat/mediaConfig";
import type {
  AgentMediaConfig,
  PendingChatMediaAttachment,
} from "@features/agent/utils/types";
import {
  CHAT_IMAGE_ATTACHMENT_SOURCE,
  type ChatImageAttachmentSource,
} from "@features/agent/utils/constants";

const IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: false,
  quality: 1,
  exif: false,
};

/**
 * Manages pending image attachments for agent chat input.
 * @param agentId - Active agent identifier used to load upload constraints.
 * @returns Pending attachment state, config-aware picker helpers, and allow flags.
 */
export function useChatMediaAttachment(agentId: string | null) {
  const { t } = useTranslation();
  const toast = useToast();
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingChatMediaAttachment[]
  >([]);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isImageSourcePickerVisible, setIsImageSourcePickerVisible] =
    useState(false);
  const [mediaConfig, setMediaConfig] = useState<AgentMediaConfig | null>(null);
  const [isLoadingMediaConfig, setIsLoadingMediaConfig] = useState(false);

  /**
   * Loads upload constraints for the active agent.
   */
  const loadMediaConfig = useCallback(async (): Promise<AgentMediaConfig | null> => {
    if (!agentId) {
      setMediaConfig(null);
      return null;
    }

    setIsLoadingMediaConfig(true);
    try {
      const config = await getAgentMediaConfig(agentId);
      setMediaConfig(config);
      return config;
    } catch (error) {
      console.error("[useChatMediaAttachment] Failed to load media config:", error);
      setMediaConfig(null);
      return null;
    } finally {
      setIsLoadingMediaConfig(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadMediaConfig();
  }, [loadMediaConfig]);

  const maxAttachments = mediaConfig?.max_files_per_message ?? 1;

  const isImageAttachmentAllowed = useMemo(
    () => isAgentImageUploadAllowed(mediaConfig),
    [mediaConfig]
  );

  const canAddMoreAttachments = pendingAttachments.length < maxAttachments;

  /**
   * Clears all pending image attachments.
   */
  const clearAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

  /**
   * Removes one pending attachment by list index.
   * @param index - Attachment index in the pending list.
   */
  const removeAttachmentAt = useCallback((index: number) => {
    setPendingAttachments((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  }, []);

  /**
   * Shows a validation error toast using agent media constraint metadata.
   * @param errorKey - i18n key for the validation failure.
   * @param maxSizeMb - Optional max size in megabytes for oversize errors.
   */
  const showValidationError = useCallback(
    (errorKey: string, maxSizeMb?: number) => {
      if (errorKey === CHAT_MEDIA_VALIDATION_ERROR.TOO_LARGE && maxSizeMb) {
        toast.showError(
          t("chat.mediaTooLarge", { maxSizeMb })
        );
        return;
      }

      toast.showError(t(errorKey));
    },
    [t, toast]
  );

  /**
   * Validates and stores a picked image asset as a pending chat attachment.
   * @param asset - Image asset returned by expo-image-picker.
   * @param config - Active agent media constraints.
   * @param currentCount - Number of attachments already queued.
   * @returns Whether the asset was accepted.
   */
  const applyPickedImageAsset = useCallback(
    async (
      asset: ImagePicker.ImagePickerAsset,
      config: AgentMediaConfig,
      currentCount: number
    ): Promise<boolean> => {
      if (currentCount >= config.max_files_per_message) {
        toast.showError(
          t("chat.mediaMaxFiles", { maxFiles: config.max_files_per_message })
        );
        return false;
      }

      const contentType =
        asset.mimeType || inferImageContentTypeFromUri(asset.uri);
      const filename =
        asset.fileName || buildDefaultChatImageFilename(contentType);

      let sizeBytes = asset.fileSize ?? 0;
      if (!sizeBytes) {
        const file = new File(asset.uri);
        const fileInfo = file.info();
        sizeBytes = fileInfo.size ?? 0;
      }

      if (!sizeBytes) {
        toast.showError(t("chat.imageUploadFailed"));
        return false;
      }

      const mediaType = resolveAgentMediaType(contentType, config);
      if (!mediaType) {
        showValidationError(CHAT_MEDIA_VALIDATION_ERROR.TYPE_NOT_ALLOWED);
        return false;
      }

      const pendingCandidate: PendingChatMediaAttachment = {
        uri: asset.uri,
        filename,
        contentType,
        sizeBytes,
        mediaType,
      };

      const validation = validatePendingMediaAttachment(
        pendingCandidate,
        config
      );

      if (!validation.isValid) {
        showValidationError(
          validation.errorKey || CHAT_MEDIA_VALIDATION_ERROR.TYPE_NOT_ALLOWED,
          validation.maxSizeMb
        );
        return false;
      }

      setPendingAttachments((current) => [
        ...current,
        {
          ...pendingCandidate,
          mediaType: validation.mediaType || mediaType,
        },
      ]);
      return true;
    },
    [showValidationError, t, toast]
  );

  /**
   * Loads media config and confirms image uploads are allowed for the agent.
   * @returns Agent media config when uploads are allowed; otherwise null.
   */
  const ensureImageUploadAllowed = useCallback(async () => {
    const config = mediaConfig ?? (await loadMediaConfig());
    if (!isAgentImageUploadAllowed(config)) {
      toast.showError(t("chat.imageNotSupportedForAgent"));
      return null;
    }
    return config;
  }, [loadMediaConfig, mediaConfig, t, toast]);

  /**
   * Opens the camera or gallery picker and appends a pending attachment.
   * @param source - Whether to capture a new photo or choose from the library.
   */
  const pickImageFromSource = useCallback(
    async (source: ChatImageAttachmentSource) => {
      if (isPickingImage || !agentId) {
        return;
      }

      setIsPickingImage(true);
      try {
        const config = await ensureImageUploadAllowed();
        if (!config) {
          return;
        }

        if (pendingAttachments.length >= config.max_files_per_message) {
          toast.showError(
            t("chat.mediaMaxFiles", { maxFiles: config.max_files_per_message })
          );
          return;
        }

        const permission =
          source === CHAT_IMAGE_ATTACHMENT_SOURCE.CAMERA
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          toast.showError(
            t(
              source === CHAT_IMAGE_ATTACHMENT_SOURCE.CAMERA
                ? "chat.cameraPermissionDenied"
                : "chat.imagePermissionDenied"
            )
          );
          return;
        }

        const result =
          source === CHAT_IMAGE_ATTACHMENT_SOURCE.CAMERA
            ? await ImagePicker.launchCameraAsync(IMAGE_PICKER_OPTIONS)
            : await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);

        if (result.canceled || !result.assets?.length) {
          return;
        }

        await applyPickedImageAsset(
          result.assets[0],
          config,
          pendingAttachments.length
        );
      } catch (error) {
        console.error("[useChatMediaAttachment] Failed to pick image:", error);
        toast.showError(t("chat.imageUploadFailed"));
      } finally {
        setIsPickingImage(false);
      }
    },
    [
      agentId,
      applyPickedImageAsset,
      ensureImageUploadAllowed,
      isPickingImage,
      pendingAttachments.length,
      t,
      toast,
    ]
  );

  /**
   * Opens the image source picker sheet (camera or gallery).
   */
  const openImageAttachmentPicker = useCallback(() => {
    if (
      isPickingImage ||
      !agentId ||
      isLoadingMediaConfig ||
      !isImageAttachmentAllowed ||
      !canAddMoreAttachments
    ) {
      return;
    }
    setIsImageSourcePickerVisible(true);
  }, [
    agentId,
    canAddMoreAttachments,
    isImageAttachmentAllowed,
    isLoadingMediaConfig,
    isPickingImage,
  ]);

  /**
   * Closes the image source picker sheet without selecting a source.
   */
  const closeImageAttachmentPicker = useCallback(() => {
    setIsImageSourcePickerVisible(false);
  }, []);

  /**
   * Captures a new photo with the device camera.
   */
  const pickImageFromCamera = useCallback(async () => {
    setIsImageSourcePickerVisible(false);
    await pickImageFromSource(CHAT_IMAGE_ATTACHMENT_SOURCE.CAMERA);
  }, [pickImageFromSource]);

  /**
   * Opens the photo library to choose an existing image.
   */
  const pickImageFromGallery = useCallback(async () => {
    setIsImageSourcePickerVisible(false);
    await pickImageFromSource(CHAT_IMAGE_ATTACHMENT_SOURCE.GALLERY);
  }, [pickImageFromSource]);

  return {
    pendingAttachments,
    maxAttachments,
    canAddMoreAttachments,
    isPickingImage,
    isLoadingMediaConfig,
    isImageAttachmentAllowed,
    isImageSourcePickerVisible,
    openImageAttachmentPicker,
    closeImageAttachmentPicker,
    pickImageFromCamera,
    pickImageFromGallery,
    removeAttachmentAt,
    clearAttachments,
  };
}
