/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getAgentToolEnabledTools } from "@features/agent/utils/settingHelper";
import type { AgentConfigResponse } from "@src/types/global";

type AgentConfigTool = NonNullable<AgentConfigResponse["tools"]>[number];

interface ChatSettingsToolDetailBottomSheetProps {
  /** Whether the detail sheet is visible. */
  visible: boolean;
  /** Tool entry whose enabled sub-tools are listed. */
  tool: AgentConfigTool | null;
  /** Closes the sheet without side effects. */
  onClose: () => void;
}

/**
 * Bottom sheet listing enabled sub-tools for a selected agent tool card.
 */
export function ChatSettingsToolDetailBottomSheet({
  visible,
  tool,
  onClose,
}: ChatSettingsToolDetailBottomSheetProps) {
  const { t } = useTranslation();

  if (!tool) {
    return null;
  }

  const enabledTools = getAgentToolEnabledTools(tool);

  /**
   * Prevents backdrop presses from closing when tapping sheet content.
   */
  const handleContentPress = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={globalStyles.chatSettingsToolDetailOverlay}
        onPress={onClose}
      >
        <Pressable
          style={globalStyles.chatSettingsToolDetailSheet}
          onPress={handleContentPress}
        >
          <View style={globalStyles.chatSettingsToolDetailSheetContent}>
            <View style={globalStyles.chatSettingsToolDetailHeader}>
              <Text
                style={globalStyles.chatSettingsToolDetailTitle}
                numberOfLines={2}
              >
                {tool.name}
              </Text>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  globalStyles.chatSettingsToolDetailCloseButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityLabel={t("common.close")}
              >
                <X size={20} color={tokens.colors.text_secondary} />
              </Pressable>
            </View>

            <Text style={globalStyles.chatSettingsToolDetailSectionLabel}>
              {t("chatSettings.enabledTools") || "Enabled tools"}
            </Text>

            <ScrollView
              style={globalStyles.chatSettingsToolDetailList}
              contentContainerStyle={
                globalStyles.chatSettingsToolDetailListContent
              }
              showsVerticalScrollIndicator={true}
              bounces={enabledTools.length > 0}
            >
              {enabledTools.length === 0 ? (
                <Text style={globalStyles.chatSettingsToolDetailEmptyText}>
                  {t("chatSettings.noEnabledTools") || "No enabled tools"}
                </Text>
              ) : (
                enabledTools.map((enabledTool) => (
                  <View
                    key={enabledTool}
                    style={globalStyles.chatSettingsToolDetailListItem}
                  >
                    <Text style={globalStyles.chatSettingsToolDetailListItemText}>
                      {enabledTool}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={globalStyles.bottomSafeArea} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
