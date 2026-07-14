/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useRef, useEffect } from "react";
import { Pressable, RefreshControl, ScrollView } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import { useFocusEffect } from "@react-navigation/native";
import { useAutomation } from "@context/automation.context";
import {
  useAutomationsList,
  type UseAutomationsListOptions,
} from "@features/automation/hooks";
import { observer } from "mobx-react-lite";
import { Plus, Edit, Trash2 } from "lucide-react-native";
import { Header, ScreenWrapper, InputDialog } from "@shared/components";
import {
  AutomationMenuBottomSheet,
  AutomationsEmptyState,
  AutomationsList,
  AutomationsFooterButton,
  AutomationsSubgroupAccessNotice,
} from "@features/automation/components";
import { testProps } from "@shared/utils/testProps";
import type { AutomationMenuOption } from "@src/types/global";
import type { ESPCDFAutomation } from "@store";

/**
 * Automations Screen – UI / presentation layer.
 * Business logic lives in useAutomationsList and utils/automation.
 * Handles toast, navigation, and translations; hook returns structured results.
 */
export const AutomationsScreen = observer(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { resetState } = useAutomation();

  const {
    filteredAutomations,
    nodeList,
    isAutomationsAccessRestricted,
    isLoading,
    isRefreshing,
    toggleLoadingStates,
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
      router.push({ pathname: "/(provision)/AddDeviceSelection" } as any);
    }
  }, [hasDevices, handleAddAutomation, router]);

  const showFullAutomationsUi = !isAutomationsAccessRestricted;

  return (
    <>
      <Header
        label={t("automation.automations.title")}
        showBack={false}
        rightSlot={
          showFullAutomationsUi && hasDevices ? (
            <Pressable
              {...testProps("button_add_automation_header")}
              onPress={handleAddAutomation}
            >
              <Plus size={24} color={tokens.colors.primary} />
            </Pressable>
          ) : undefined
        }
      />
      <ScreenWrapper style={globalStyles.automationsScreenContainer}>
        {isAutomationsAccessRestricted ? (
          <AutomationsSubgroupAccessNotice
            title={t("automation.automations.notSupportedSubgroupAccessTitle")}
            description={t(
              "automation.automations.notSupportedSubgroupAccessDescription",
            )}
          />
        ) : (
          <>
            <ScrollView
              {...testProps("scroll_automations")}
              style={globalStyles.automationsScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={globalStyles.automationsScrollContent}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  colors={[tokens.colors.primary]}
                  tintColor={tokens.colors.primary}
                />
              }
            >
              {filteredAutomations.length === 0 ? (
                <AutomationsEmptyState
                  isLoading={isLoading}
                  title={emptyTitle}
                  description={emptyDescription}
                />
              ) : (
                <AutomationsList
                  automations={filteredAutomations}
                  onAutomationPress={handleAutomationPress}
                  onToggle={handleAutomationToggle!}
                  toggleLoadingStates={toggleLoadingStates}
                />
              )}
            </ScrollView>

            {!isLoading && (
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
