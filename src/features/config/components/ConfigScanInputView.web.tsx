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
  CONFIG_SCAN_FILE_ACCEPT,
  CONFIG_SCAN_INPUT_TYPE_FILE,
} from "@features/config/constants";
import { useConfigScanInput } from "@features/config/hooks/useConfigScanInput.web";
import { configScanWebStyles } from "@features/config/theme/configScanWebStyles";
import { Header, ScreenWrapper } from "@shared/components";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

export interface ConfigScanInputViewProps {
  title: string;
  onScan: (data: string) => Promise<void>;
  onBack: () => void;
}

/**
 * Web replacement for the camera scanner: drop/paste a QR image, upload JSON,
 * or paste a config URL / JSON body.
 * @param props - Title, apply callback, and back handler
 */
export function ConfigScanInputView({
  title,
  onScan,
  onBack,
}: ConfigScanInputViewProps) {
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
  } = useConfigScanInput(onScan);

  const fileInput = createElement("input", {
    ref: fileInputRef,
    type: CONFIG_SCAN_INPUT_TYPE_FILE,
    accept: CONFIG_SCAN_FILE_ACCEPT,
    onChange: handleFileChange,
    style: { display: "none" },
    "data-testid": "input_config_scan_file",
  });

  return (
    <ScreenWrapper
      {...testProps("screen_wrapper_config_scan_web")}
      style={globalStyles.configScanNoPadding}
    >
      <Header label={title} showBack onBackPress={onBack} />
      <ScrollView
        {...testProps("scroll_view_config_scan_web")}
        style={configScanWebStyles.scroll}
        contentContainerStyle={configScanWebStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={configScanWebStyles.hint}>{t("config.scan.webHint")}</Text>

        <View
          {...testProps("view_config_scan_drop_zone")}
          style={[
            configScanWebStyles.dropZone,
            isDragging && configScanWebStyles.dropZoneActive,
          ]}
        >
          {isDecoding ? (
            <ActivityIndicator size="large" color={tokens.colors.primary} />
          ) : (
            <Upload size={tokens.spacing._30} color={tokens.colors.primary} />
          )}
          <Text style={configScanWebStyles.dropZoneTitle}>
            {isDecoding
              ? t("config.scan.decodingImage")
              : t("config.scan.dropZoneTitle")}
          </Text>
          <Text style={configScanWebStyles.dropZoneSubtitle}>
            {t("config.scan.dropZoneSubtitle")}
          </Text>
          <View style={configScanWebStyles.dropZoneActions}>
            <TouchableOpacity
              {...testProps("button_config_scan_choose_file")}
              style={configScanWebStyles.actionButton}
              onPress={handleChooseFile}
              disabled={isDecoding}
            >
              <Upload size={tokens.iconSize._15} color={tokens.colors.primary} />
              <Text style={configScanWebStyles.actionButtonText}>
                {t("config.scan.chooseFile")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              {...testProps("button_config_scan_paste_clipboard")}
              style={configScanWebStyles.actionButton}
              onPress={() => {
                void handlePasteFromClipboard();
              }}
              disabled={isDecoding}
            >
              <Clipboard
                size={tokens.iconSize._15}
                color={tokens.colors.primary}
              />
              <Text style={configScanWebStyles.actionButtonText}>
                {t("config.scan.pasteClipboard")}
              </Text>
            </TouchableOpacity>
          </View>
          {fileName ? (
            <Text
              {...testProps("text_config_scan_file_name")}
              style={configScanWebStyles.fileName}
            >
              {fileName}
            </Text>
          ) : null}
        </View>
        {fileInput}

        <Text style={configScanWebStyles.fieldLabel}>
          {t("config.scan.jsonOrUrlLabel")}
        </Text>
        <TextInput
          {...testProps("input_config_scan_json")}
          style={configScanWebStyles.textArea}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("config.scan.jsonOrUrlPlaceholder")}
          placeholderTextColor={tokens.colors.gray}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isDecoding}
        />

        {localError ? (
          <Text
            {...testProps("text_config_scan_local_error")}
            style={configScanWebStyles.localError}
          >
            {localError}
          </Text>
        ) : null}

        <TouchableOpacity
          {...testProps("button_config_scan_apply")}
          style={[
            globalStyles.configScanUpdateButton,
            (isDecoding || !draft.trim()) && globalStyles.btnDisabled,
          ]}
          onPress={() => {
            void handleApply();
          }}
          disabled={isDecoding || !draft.trim()}
        >
          <Text style={globalStyles.configScanButtonText}>
            {t("config.scan.applyConfig")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenWrapper>
  );
}
