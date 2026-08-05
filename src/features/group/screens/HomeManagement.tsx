/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { router } from "expo-router";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import type { ESPCDFGroup } from "@store";
import { ScreenWrapper } from "@shared/components";
import {
  HomeItem,
  HomeManagementHeader,
  HomeManagementListHeader,
  HomeManagementList,
  HomeManagementAddDialog,
} from "@features/group/components";
import { useToast } from "@shared/hooks/useToast";
import { useHomeManagement } from "@features/group/hooks";

/**
 * Home Management screen – UI / presentation layer.
 * Composes Group components; business logic in useHomeManagement and utils/group.
 */
const HomeManagement = observer(() => {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    homes,
    showDialog,
    setShowDialog,
    loading,
    refreshing,
    handleCreateHome,
    handleRefresh,
    formatHomeDescription,
  } = useHomeManagement({
    toast,
    t,
  });

  const handleAddPress = useCallback(() => {
    setShowDialog(true);
  }, [setShowDialog]);

  const handleDialogCancel = useCallback(() => {
    setShowDialog(false);
  }, [setShowDialog]);

  const handleHomePress = useCallback((home: ESPCDFGroup) => {
    router.push({
      pathname: "/(group)/Settings",
      params: { id: home.id },
    } as any);
  }, []);

  const renderItem = useCallback(
    ({ item: home }: { item: ESPCDFGroup }) => (
      <HomeItem
        homeName={home.name}
        description={formatHomeDescription?.(home) ?? ""}
        onPress={() => handleHomePress(home)}
      />
    ),
    [formatHomeDescription, handleHomePress],
  );

  return (
    <>
      <HomeManagementHeader
        title={t("group.homeManagement.title")}
        onAddPress={handleAddPress}
        qaId="header_home_management"
      />
      <ScreenWrapper style={globalStyles.homeManagementScreenWrapper}>
        <HomeManagementListHeader title={t("group.homeManagement.myHomes")} />
        <HomeManagementList<ESPCDFGroup>
          data={homes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={() => handleRefresh?.()}
        />
      </ScreenWrapper>

      <HomeManagementAddDialog
        open={showDialog}
        loading={loading}
        title={t("group.homeManagement.addNewHomeInputDialogTitle")}
        inputPlaceholder={t(
          "group.homeManagement.addNewHomeInputDialogPlaceholder",
        )}
        confirmLabel={t(
          "group.homeManagement.addNewHomeInputDialogConfirmButton",
        )}
        cancelLabel={t(
          "group.homeManagement.addNewHomeInputDialogCancelButton",
        )}
        onSubmit={(name) => handleCreateHome?.(name)}
        onCancel={handleDialogCancel}
        qaId="add_home"
      />
    </>
  );
});

export default HomeManagement;
