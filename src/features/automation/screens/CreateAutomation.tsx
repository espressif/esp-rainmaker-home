/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { getFeatures } from "@config/features.config";
import { useToast } from "@shared/hooks/useToast";
import { useUnsavedChangesGuard } from "@shared/hooks/useUnsavedChangesGuard";
import { useAutomation } from "@context/automation.context";
import { useCreateAutomation } from "@features/automation/hooks";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Header, ScreenWrapper, UnsavedChangesDialog } from "@shared/components";
import {
  CreateAutomationNameSection,
  CreateAutomationRetriggerSection,
  CreateAutomationEventsSection,
  CreateAutomationActionsSection,
  CreateAutomationEmptyState,
  CreateAutomationActionButtons,
} from "@features/automation/components";

/**
 * CreateAutomation Screen – UI / presentation layer.
 * Business logic in useCreateAutomation and utils/automation.
 * Handles toast, navigation, and translations; hook returns structured results.
 */
export function CreateAutomationScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { resetState } = useAutomation();
  const features = getFeatures();
  const { automationName, automationId, isEditing } = useLocalSearchParams<{
    automationName?: string;
    automationId?: string;
    isEditing?: string;
  }>();

  const {
    state,
    setAutomationName,
    setRetrigger,
    loading,
    isValidAutomation,
    hasUnsavedChanges,
    eventInfo,
    eventDevice,
    actionCards,
    createAutomation,
    updateAutomation,
    deleteAutomation,
  } = useCreateAutomation({
    automationName,
    automationId,
    isEditing,
  });

  const navigateToAutomations = useCallback(() => {
    router.dismissTo("/(automation)/Automations");
  }, [router]);

  const {
    isDiscardDialogOpen,
    exit: exitToAutomations,
    requestExit: handleBackPress,
    confirmDiscard,
    cancelDiscard,
  } = useUnsavedChangesGuard({
    hasUnsavedChanges,
    onExit: navigateToAutomations,
  });

  /**
   * The draft lives in shared context, so resetting it while this screen is
   * still visible blanks the form during the dismiss transition. Reset only
   * on unmount, which fires after the screen has left (any removal path).
   */
  useEffect(() => () => resetState(), [resetState]);

  const handleAddEvent = useCallback(() => {
    router.push({
      pathname: "/(automation)/EventDeviceSelection",
      params: {
        isEditingEvent: state.isEditing ? "true" : "false",
      },
    } as any);
  }, [router, state.isEditing]);

  const handleAddAction = useCallback(() => {
    router.push({
      pathname: "/(automation)/ActionDeviceSelection",
      params: {
        isEditingAction: state.isEditing ? "true" : "false",
      },
    } as any);
  }, [router, state.isEditing]);

  const handleCreateAutomation = useCallback(async () => {
    if (!state.automationName?.trim()) {
      toast.showError(
        t("automation.errors.failedToCreateAutomation"),
        t("automation.errors.pleaseEnterAutomationName"),
      );
      return;
    }
    const result = await createAutomation();
    if (result.status === "success") {
      toast.showSuccess(
        t("automation.createAutomation.automationCreated"),
        t("automation.createAutomation.automationCreatedMessage"),
      );
      exitToAutomations();
    } else {
      toast.showError(
        t("automation.errors.failedToCreateAutomation"),
        result.description ?? t("automation.errors.fallback"),
      );
    }
  }, [
    state.automationName,
    createAutomation,
    toast,
    t,
    exitToAutomations,
  ]);

  const handleUpdateAutomation = useCallback(async () => {
    if (!state.automationName?.trim()) {
      toast.showError(
        t("automation.errors.updateFailedMessage"),
        t("automation.errors.pleaseEnterAutomationName"),
      );
      return;
    }
    const result = await updateAutomation();
    if (result.status === "success") {
      toast.showSuccess(
        t("automation.createAutomation.automationUpdated"),
        t("automation.createAutomation.automationUpdatedMessage"),
      );
      exitToAutomations();
    } else {
      toast.showError(
        t("automation.errors.updateFailedMessage"),
        result.description ?? t("automation.errors.fallback"),
      );
    }
  }, [
    state.automationName,
    updateAutomation,
    toast,
    t,
    exitToAutomations,
  ]);

  const handleDeleteAutomation = useCallback(async () => {
    const result = await deleteAutomation();
    if (result.status === "success") {
      toast.showSuccess(
        t("automation.createAutomation.automationDeleted"),
        t("automation.createAutomation.automationDeletedMessage"),
      );
      exitToAutomations();
    } else {
      toast.showError(
        t("automation.errors.deleteFailedMessage"),
        result.description ?? t("automation.errors.fallback"),
      );
    }
  }, [deleteAutomation, toast, t, exitToAutomations]);

  const eventDeviceShape = eventDevice
    ? { type: eventDevice.type ?? "switch", name: eventDevice.name }
    : null;
  const eventDisplayName =
    eventDevice?.displayName ?? eventInfo?.deviceName ?? "";
  const hasEvents = state.events.length > 0;
  const hasActions = Object.keys(state.actions).length > 0;
  const showEventsEmpty = !hasEvents;
  const showActionsEmpty = hasEvents && !hasActions;

  return (
    <>
      <Header
        label={
          state.isEditing
            ? t("automation.createAutomation.editAutomation")
            : t("automation.createAutomation.title")
        }
        showBack={true}
        onBackPress={handleBackPress}
      />
      <ScreenWrapper style={globalStyles.container}>
        <CreateAutomationNameSection
          title={t("automation.createAutomation.automationName")}
          placeholder={t(
            "automation.createAutomation.automationNamePlaceholder",
          )}
          value={state.automationName ?? ""}
          onNameChange={setAutomationName}
        />
        {features.automationRetrigger && (
          <CreateAutomationRetriggerSection
            label={t("automation.createAutomation.retrigger")}
            description={t("automation.createAutomation.retriggerDescription")}
            checked={state.retrigger}
            onCheckedChange={setRetrigger}
          />
        )}
        <CreateAutomationEventsSection
          sectionLabel={t("automation.createAutomation.event")}
          hasEvents={hasEvents}
          eventInfo={eventInfo}
          eventDevice={eventDeviceShape}
          eventDisplayName={eventDisplayName}
          onAddEvent={handleAddEvent}
        />
        {hasEvents && (
          <CreateAutomationActionsSection
            sectionLabel={t("automation.createAutomation.actions")}
            hasActions={hasActions}
            actionCards={actionCards}
            onAddAction={handleAddAction}
          />
        )}
        {showEventsEmpty && (
          <CreateAutomationEmptyState
            title={t("automation.createAutomation.noEventSelected")}
            description={t(
              "automation.createAutomation.noEventSelectedDescription",
            )}
            containerTestId="view_empty_event"
            titleTestId="text_title_empty_event"
            descriptionTestId="text_description_empty_event"
          />
        )}
        {showActionsEmpty && (
          <CreateAutomationEmptyState
            title={t("automation.createAutomation.noActionsSelected")}
            description={t(
              "automation.createAutomation.noActionsSelectedDescription",
              {
                action: state.isEditing ? "update" : "create",
              },
            )}
            containerTestId="view_empty_actions"
            titleTestId="text_title_empty_automations"
            descriptionTestId="text_description_empty_automations"
          />
        )}
        <CreateAutomationActionButtons
          isEditing={state.isEditing}
          loadingSave={loading.save}
          loadingDelete={loading.delete}
          disableSave={loading.save || !isValidAutomation}
          disableDelete={loading.delete}
          createButtonLabel={t(
            "automation.actionDeviceSelection.createAutomation",
          )}
          updateButtonLabel={t("layout.shared.update")}
          deleteButtonLabel={t("layout.shared.delete")}
          onCreate={handleCreateAutomation}
          onUpdate={handleUpdateAutomation}
          onDelete={handleDeleteAutomation}
        />
      </ScreenWrapper>
      <UnsavedChangesDialog
        open={isDiscardDialogOpen}
        onDiscard={confirmDiscard}
        onKeepEditing={cancelDiscard}
        qaId="create_automation_unsaved_changes"
      />
    </>
  );
}
