/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useRef, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useRouter } from "expo-router";
import { useAddDeviceNavigation } from "@features/provision/hooks";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import { useSkeletonReveal } from "@shared/hooks/useSkeletonReveal";
import { SKELETON_REVEAL_PHASE_READY } from "@shared/utils/constants";
import { useFocusEffect } from "@react-navigation/native";
import { useAutomation } from "@context/automation.context";
import {
  useAutomationsList,
  type UseAutomationsListOptions,
} from "@features/automation/hooks";
import { observer } from "mobx-react-lite";
import { Edit, Trash2 } from "lucide-react-native";
import { Header, ScreenWrapper, InputDialog } from "@shared/components";
import {
  AutomationMenuBottomSheet,
  AutomationsEmptyState,
  AutomationsList,
  AutomationsFooterButton,
  AutomationsSubgroupAccessNotice,
  AutomationsHeaderActions,
  AutomationsLoadingSkeleton,
} from "@features/automation/components";
import { testProps } from "@shared/utils/testProps";
import type { AutomationMenuOption } from "@src/types/global";
import type { ESPCDFAutomation } from "@store";

/**
 * Automations Screen – UI / presentation layer.
 * Business logic lives in useAutomationsList and utils/automation.
 * Handles toast, navigation, and translations; hook returns structured results.
 * Initial load uses a mild skeleton collapse then content slide-up.
 */
export const AutomationsScreen = observer(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const goToAddDevice = useAddDeviceNavigation();
  const toast = useToast();
  const { resetState } = useAutomation();

  const {
    filteredAutomations,
    nodeList,
    isAutomationsAccessRestricted,
    isLoading,
    isRefreshing,
    isEditing,
    setIsEditing,
    toggleLoadingStates,
    actionLoadingStates,
    setSelectedAutomation,
    selectedAutomation,
    isBottomSheetVisible,
    setIsBottomSheetVisible,
    isAutomationNameDialogVisible,
    setIsAutomationNameDialogVisible,
    automationName,
    setAutomationName,
    refresh,
    loadAutomations,
    handleAutomationAction,
    handleAutomationToggle,
    handleAutomationNameConfirm,
    automationMenuOptions,
  } = useAutomationsList({
    router: router as UseAutomationsListOptions["router"],
    toast,
    t,
    resetState,
  });

  const toastRef = useRef(toast);
  const tRef = useRef(t);
  useEffect(() => {
    toastRef.current = toast;
    tRef.current = t;
  }, [toast, t]);

  useFocusEffect(
    useCallback(() => {
      loadAutomations().then((result) => {
        if (result.status === "error") {
          toastRef.current.showError(
            tRef.current("automation.errors.failedToFetchAutomation"),
            result.description ?? tRef.current("automation.errors.fallback"),
          );
        }
      });
    }, [loadAutomations]),
  );

  const handleRefresh = useCallback(async () => {
    const result = await refresh();
    if (result.status === "error") {
      toast.showError(
        t("automation.errors.refreshFailed"),
        result.description ?? t("automation.errors.fallback"),
      );
    }
  }, [refresh, toast, t]);

  const handleAutomationPress = useCallback(
    (automation: ESPCDFAutomation) => {
      setSelectedAutomation(automation);
      setIsBottomSheetVisible(true);
    },
    [setSelectedAutomation, setIsBottomSheetVisible],
  );

  /**
   * Deletes an automation from list edit mode (trash on card).
   * @param automation - Automation to delete
   */
  const handleAutomationDelete = useCallback(
    (automation: ESPCDFAutomation) => {
      if (!handleAutomationAction || !automation.id) return;
      void handleAutomationAction(automation.id, "delete");
    },
    [handleAutomationAction],
  );

  const handleCloseBottomSheet = useCallback(() => {
    setIsBottomSheetVisible(false);
    setSelectedAutomation(null);
  }, [setIsBottomSheetVisible, setSelectedAutomation]);

  const handleAddAutomation = useCallback(() => {
    setAutomationName("");
    setIsAutomationNameDialogVisible(true);
  }, [setAutomationName, setIsAutomationNameDialogVisible]);

  const menuOptions: AutomationMenuOption[] = useMemo(() => {
    if (
      !automationMenuOptions ||
      !handleAutomationAction ||
      !selectedAutomation
    )
      return [];
    const automationId = selectedAutomation.id ?? "";
    return automationMenuOptions.map((opt) => ({
      id: opt.id,
      label: t(opt.labelKey),
      icon:
        opt.id === "edit" ? (
          <Edit size={16} color={tokens.colors.text_primary} />
        ) : (
          <Trash2 size={16} color={tokens.colors.red} />
        ),
      onPress: () => handleAutomationAction(automationId, opt.action),
      loading: opt.loading,
      destructive: opt.destructive,
    }));
  }, [automationMenuOptions, handleAutomationAction, selectedAutomation, t]);

  const hasDevices = nodeList.length > 0;
  const hasAutomations = filteredAutomations.length > 0;
  const emptyTitle = hasDevices
    ? t("automation.automations.noAutomationsYet")
    : t("automation.automations.noDevicesForAutomation");
  const emptyDescription = hasDevices
    ? t("automation.automations.noAutomationsYetDescription")
    : t("automation.automations.noDevicesForAutomationDescription");

  const footerButtonLabel = hasDevices
    ? t("automation.automations.addAutomation")
    : t("automation.automations.addFirstDevice");

  const handleFooterButtonPress = useCallback(() => {
    if (hasDevices) {
      handleAddAutomation();
    } else {
      goToAddDevice();
    }
  }, [hasDevices, handleAddAutomation, goToAddDevice]);

  const showFullAutomationsUi = !isAutomationsAccessRestricted;

  const {
    showSkeleton,
    showContent,
    phase,
    skeletonAnimatedStyle,
    contentAnimatedStyle,
    onSkeletonLayout,
  } = useSkeletonReveal(isLoading && showFullAutomationsUi);

  const showFooter = phase === SKELETON_REVEAL_PHASE_READY;

  return (
    <>
      <Header
        label={t("automation.automations.title")}
        showBack={false}
        rightSlot={
          showFullAutomationsUi ? (
            <AutomationsHeaderActions
              hasAutomations={hasAutomations}
              isEditing={isEditing}
              onEditToggle={() => setIsEditing(!isEditing)}
            />
          ) : undefined
        }
      />
      <ScreenWrapper
        style={globalStyles.automationsScreenContainer}
        dismissKeyboard={false}
      >
        {isAutomationsAccessRestricted ? (
          <AutomationsSubgroupAccessNotice
            title={t("automation.automations.notSupportedSubgroupAccessTitle")}
            description={t(
              "automation.automations.notSupportedSubgroupAccessDescription",
            )}
          />
        ) : (
          <>
            {showSkeleton && (
              <Animated.View
                {...testProps("view_automations_skeleton_reveal")}
                style={[styles.skeletonSlot, skeletonAnimatedStyle]}
              >
                <View onLayout={onSkeletonLayout}>
                  <AutomationsLoadingSkeleton />
                </View>
              </Animated.View>
            )}

            {showContent && (
              <Animated.View style={contentAnimatedStyle}>
                {hasAutomations ? (
                  <AutomationsList
                    automations={filteredAutomations}
                    onAutomationPress={handleAutomationPress}
                    onToggle={handleAutomationToggle!}
                    onDelete={handleAutomationDelete}
                    toggleLoadingStates={toggleLoadingStates}
                    actionLoadingStates={actionLoadingStates}
                    isEditing={isEditing}
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                  />
                ) : (
                  <View
                    {...testProps("view_automations_empty")}
                    style={globalStyles.flex1}
                  >
                    <AutomationsEmptyState
                      refreshing={isRefreshing}
                      onRefresh={handleRefresh}
                      title={emptyTitle}
                      description={emptyDescription}
                    />
                  </View>
                )}
              </Animated.View>
            )}

            {showFooter && (
              <AutomationsFooterButton
                label={footerButtonLabel}
                onPress={handleFooterButtonPress}
              />
            )}
          </>
        )}
      </ScreenWrapper>

      {showFullAutomationsUi && (
        <>
          <AutomationMenuBottomSheet
            visible={isBottomSheetVisible}
            automation={selectedAutomation}
            automationName={selectedAutomation?.name ?? "Automation"}
            options={menuOptions}
            onClose={handleCloseBottomSheet}
          />

          <InputDialog
            qaId="create_automation"
            open={isAutomationNameDialogVisible}
            title={t("automation.automations.createAutomation")}
            inputPlaceholder={t(
              "automation.automations.automationNamePlaceholder",
            )}
            confirmLabel={t("layout.shared.next")}
            cancelLabel={t("layout.shared.cancel")}
            onSubmit={(name) => handleAutomationNameConfirm?.(name)}
            onCancel={() => setIsAutomationNameDialogVisible(false)}
            initialValue={automationName}
          />
        </>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  skeletonSlot: {
    width: "100%",
  },
});
