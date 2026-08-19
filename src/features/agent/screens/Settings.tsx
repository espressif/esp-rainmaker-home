/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from "react";
import { View, ScrollView, type LayoutChangeEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { RefreshControl } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import {
  Header,
  ScreenWrapper,
  ConfirmationDialog,
} from "@shared/components";
import {
  AddAgentBottomSheet,
  AgentSettingsSection,
  AgentSettingsEmptyState,
  AgentSettingsHeaderRight,
  AgentSettingsFloatingActions,
  AgentTermsBottomSheet,
} from "@features/agent/components";
import { useAgentSettings } from "@features/agent/hooks";

/**
 * SettingsScreen component
 * @returns Agent settings screen UI
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const {
    agents,
    selectedAgentId,
    isLoading,
    isEditing,
    isAddDialogVisible,
    deleteDialogVisible,
    agentToDelete,
    actionLoading,
    showTermsBottomSheet,
    agentId,
    agentName,
    fetchAgents,
    handleAddAgent,
    handleScanAgent,
    handleAddAgentConfirm,
    closeAddDialog,
    handleSelectAgent,
    handleDeleteAgent,
    confirmDeleteAgent,
    handleCloseDeleteDialog,
    groupAgentsBySource,
    toggleEditing,
    closeTermsBottomSheet,
    completeTermsBottomSheet,
  } = useAgentSettings();

  const grouped = groupAgentsBySource();
  const [scrollViewHeight, setScrollViewHeight] = useState(0);

  /**
   * Tracks ScrollView height so content can fill the viewport and stay scrollable in empty areas.
   * @param event - Layout event from the ScrollView.
   */
  const handleScrollViewLayout = useCallback((event: LayoutChangeEvent) => {
    setScrollViewHeight(event.nativeEvent.layout.height);
  }, []);

  return (
    <>
      <Header
        label={t("aiSettings.title")}
        showBack={true}
        rightSlot={
          <AgentSettingsHeaderRight
            hasAgents={agents.length > 0}
            isEditing={isEditing}
            onToggleEdit={toggleEditing}
            onRefresh={fetchAgents}
          />
        }
      />
      <ScreenWrapper
        style={globalStyles.agentSettingsContainer}
        dismissKeyboard={false}
      >
        <ScrollView
          style={globalStyles.agentSettingsScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            globalStyles.agentSettingsScrollContent,
            scrollViewHeight > 0 && { minHeight: scrollViewHeight },
          ]}
          alwaysBounceVertical={true}
          overScrollMode="always"
          nestedScrollEnabled={true}
          onLayout={handleScrollViewLayout}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={fetchAgents} />
          }
        >
          {agents.length > 0 ? (
            <View style={globalStyles.agentSettingsList}>
              <AgentSettingsSection
                title={
                  t("device.panels.aiAgent.defaultAgent") || "Default Agent"
                }
                agents={grouped.defaultAgent}
                selectedAgentId={selectedAgentId}
                isEditing={isEditing}
                actionLoading={actionLoading}
                onSelectAgent={handleSelectAgent}
                onDeleteAgent={handleDeleteAgent}
              />
              <AgentSettingsSection
                title={t("device.panels.aiAgent.userAgents") || "Your Agents"}
                agents={grouped.userAgents}
                selectedAgentId={selectedAgentId}
                isEditing={isEditing}
                actionLoading={actionLoading}
                onSelectAgent={handleSelectAgent}
                onDeleteAgent={handleDeleteAgent}
              />
              <AgentSettingsSection
                title={
                  t("device.panels.aiAgent.customAgents") || "Custom Agents"
                }
                agents={grouped.customAgents}
                selectedAgentId={selectedAgentId}
                isEditing={isEditing}
                actionLoading={actionLoading}
                onSelectAgent={handleSelectAgent}
                onDeleteAgent={handleDeleteAgent}
              />
              <AgentSettingsSection
                title={
                  t("device.panels.aiAgent.commonAgents") || "Public Agents"
                }
                agents={grouped.templateAgents}
                selectedAgentId={selectedAgentId}
                isEditing={isEditing}
                actionLoading={actionLoading}
                onSelectAgent={handleSelectAgent}
                onDeleteAgent={handleDeleteAgent}
              />
            </View>
          ) : (
            !isLoading && <AgentSettingsEmptyState />
          )}
        </ScrollView>

        <AgentSettingsFloatingActions
          onScanPress={handleScanAgent}
          onAddPress={handleAddAgent}
        />
      </ScreenWrapper>

      <AddAgentBottomSheet
        visible={isAddDialogVisible}
        onClose={closeAddDialog}
        onSave={handleAddAgentConfirm}
        initialAgentId={agentId}
        initialAgentName={agentName}
        existingAgents={agents}
      />

      <ConfirmationDialog
        open={deleteDialogVisible}
        title={t("aiSettings.confirmDelete.title")}
        description={t("aiSettings.confirmDelete.message")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        onConfirm={confirmDeleteAgent}
        onCancel={handleCloseDeleteDialog}
        confirmColor={tokens.colors.red}
        isLoading={actionLoading === agentToDelete?.id}
      />

      <AgentTermsBottomSheet
        visible={showTermsBottomSheet}
        onClose={closeTermsBottomSheet}
        onComplete={completeTermsBottomSheet}
        allowClose={true}
      />
    </>
  );
}
