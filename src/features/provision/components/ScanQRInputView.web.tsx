/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { createElement } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Clipboard, Upload } from "lucide-react-native";

import {
  PROVISION_QR_FILE_ACCEPT,
  PROVISION_QR_INPUT_TYPE_FILE,
} from "@features/provision/constants";
import { useScanQRInput } from "@features/provision/hooks/useScanQRInput.web";
import { scanQRWebStyles } from "@features/provision/theme/scanQRWebStyles";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

export interface ScanQRInputViewProps {
  /** Applies a decoded / pasted QR payload string. */
  onScan: (data: string) => Promise<void>;
  /** When false, paste/drop/file handlers are ignored. */
  enabled?: boolean;
}

/**
 * Web replacement for the camera scanner: drop/paste a device QR image or paste payload text.
 * @param props - Apply callback and enabled gate
 * @returns Upload / paste input UI for provision QR on web
 */
export function ScanQRInputView({
  onScan,
  enabled = true,
}: ScanQRInputViewProps) {
  const { t } = useTranslation();
  const {
    draft,
    setDraft,
    isDragging,
    isDecoding,
    localError,
    fileName,
    fileInputRef,
    handleChooseFile,
    handleFileChange,
    handlePasteFromClipboard,
    handleApply,
  } = useScanQRInput(onScan, enabled);

  const fileInput = createElement("input", {
    ref: fileInputRef,
    type: PROVISION_QR_INPUT_TYPE_FILE,
    accept: PROVISION_QR_FILE_ACCEPT,
    onChange: handleFileChange,
    style: { display: "none" },
    "data-testid": "input_scan_qr_file",
  });

  return (
    <ScrollView
      {...testProps("scroll_view_scan_qr_web")}
      style={scanQRWebStyles.scroll}
      contentContainerStyle={scanQRWebStyles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={scanQRWebStyles.hint}>{t("device.scan.qr.webHint")}</Text>

      <View
        {...testProps("view_scan_qr_drop_zone")}
        style={[
          scanQRWebStyles.dropZone,
          isDragging && scanQRWebStyles.dropZoneActive,
        ]}
      >
        {isDecoding ? (
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        ) : (
          <Upload size={tokens.spacing._30} color={tokens.colors.primary} />
        )}
        <Text style={scanQRWebStyles.dropZoneTitle}>
          {isDecoding
            ? t("device.scan.qr.decodingImage")
            : t("device.scan.qr.dropZoneTitle")}
        </Text>
        <Text style={scanQRWebStyles.dropZoneSubtitle}>
          {t("device.scan.qr.dropZoneSubtitle")}
        </Text>
        <View style={scanQRWebStyles.dropZoneActions}>
          <TouchableOpacity
            {...testProps("button_scan_qr_choose_file")}
            style={scanQRWebStyles.actionButton}
            onPress={handleChooseFile}
            disabled={isDecoding || !enabled}
          >
            <Upload size={tokens.iconSize._15} color={tokens.colors.primary} />
            <Text style={scanQRWebStyles.actionButtonText}>
              {t("device.scan.qr.chooseFile")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            {...testProps("button_scan_qr_paste_clipboard")}
            style={scanQRWebStyles.actionButton}
            onPress={() => {
              void handlePasteFromClipboard();
            }}
            disabled={isDecoding || !enabled}
          >
            <Clipboard
              size={tokens.iconSize._15}
              color={tokens.colors.primary}
            />
            <Text style={scanQRWebStyles.actionButtonText}>
              {t("device.scan.qr.pasteClipboard")}
            </Text>
          </TouchableOpacity>
        </View>
        {fileName ? (
          <Text
            {...testProps("text_scan_qr_file_name")}
            style={scanQRWebStyles.fileName}
          >
            {fileName}
          </Text>
        ) : null}
      </View>
      {fileInput}

      <Text style={scanQRWebStyles.fieldLabel}>
        {t("device.scan.qr.payloadLabel")}
      </Text>
      <TextInput
        {...testProps("input_scan_qr_payload")}
        style={scanQRWebStyles.textArea}
        value={draft}
        onChangeText={setDraft}
        placeholder={t("device.scan.qr.payloadPlaceholder")}
        placeholderTextColor={tokens.colors.gray}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isDecoding && enabled}
      />

      {localError ? (
        <Text
          {...testProps("text_scan_qr_local_error")}
          style={scanQRWebStyles.localError}
        >
          {localError}
        </Text>
      ) : null}

      <TouchableOpacity
        {...testProps("button_scan_qr_apply")}
        style={[
          scanQRWebStyles.primaryButton,
          (isDecoding || !draft.trim() || !enabled) && globalStyles.btnDisabled,
        ]}
        onPress={() => {
          void handleApply();
        }}
        disabled={isDecoding || !draft.trim() || !enabled}
      >
        <Text style={scanQRWebStyles.primaryButtonText}>
          {t("device.scan.qr.applyPayload")}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
