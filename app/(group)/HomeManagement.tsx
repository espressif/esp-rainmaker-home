/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Constants
import { GROUP_TYPE_HOME } from "@/utils/constants";
import { isHome } from "@/utils/home";

// SDK
import { ESPRMGroup } from "@espressif/rainmaker-base-sdk";

// Hooks
import { router, useFocusEffect } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

// State Management
import { observer } from "mobx-react-lite";

// Icons
import { ChevronRight, Plus } from "lucide-react-native";

// Components
import { Header, ScreenWrapper, InputDialog } from "@/components";

/**
 * HomeManagement Component
 *
 * Manages homes/groups in the application.
 * Features:
 * - List all homes
 * - Add new home
 * - Navigate to home details
 */
const HomeManagement = () => {
  // Hooks
  const { t } = useTranslation();
  const { store, fetchAllGroups } = useCDF();
  const toast = useToast();

  // State
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const homes = useMemo(() => {
    return store.groupStore.groupList.filter(isHome);
  }, [store.groupStore.groupList]);

  /**
   * Handles pull-to-refresh action
   * Triggers groupStore sync to refresh the list
   */
  const onRefresh = useCallback(async () => {
    if (!store?.groupStore) return;

    setRefreshing(true);
    try {
      /*
      For refresh operation, we need to fetch the first page again
      */
      const shouldFetchFirstPage = true;
      await fetchAllGroups(shouldFetchFirstPage);
    } catch (error) {
      toast.showError(
        t("layout.shared.errorHeader"),
        t("group.errors.failedToRefreshHomes")
      );
    } finally {
      setRefreshing(false);
    }
  }, [store?.groupStore]);

  /**
   * Validates the home name
   * @param homeName - The home name to validate
   * @returns {boolean} - True if the home name is valid, false otherwise
   */
  const validateHomeName = (homeName: string) => {
    const name = homeName.trim();

    // validate home name
    if (!name) {
      toast.showError(
        t("layout.shared.errorHeader"),
        t("group.validation.homeNameCannotBeEmpty")
      );
      return false;
    }
    // validate home name length
    if (name?.length > 32) {
      toast.showError(
        t("layout.shared.errorHeader"),
        t("group.validation.homeNameTooLong")
      );
      return false;
    }

    // validate home name uniqueness
    if (
      homes.find(
        (home) => home.name.toLowerCase() === name.trim().toLowerCase()
      )
    ) {
      toast.showError(
        t("layout.shared.errorHeader"),
        t("group.validation.homeNameAlreadyExists")
      );
      return false;
    }

    return true;
  };

  // Handlers
  /**
   * Creates a new home/group
   * - Validates home name
   * - Creates home using SDK
   * - Shows success/error messages
   *
   * SDK function used:
   * - ESPRMUser.createGroup
   *
   * @param newHomeName - Name for the new home
   * @returns {void}
   */
  const handleAddHome = (newHomeName: string) => {
    if (!validateHomeName(newHomeName)) {
      return;
    }

    setLoading(true);
    store?.userStore?.user
      ?.createGroup({
        mutuallyExclusive: true,
        name: newHomeName,
        nodeIds: [],
        type: GROUP_TYPE_HOME,
      })
      .then(() => {
        toast.showSuccess(
          t("layout.shared.successHeader"),
          t("group.homeManagement.homeCreatedSuccessfully")
        );
        setShowDialog(false);
      })
      .catch(() => {
        toast.showError(
          t("layout.shared.errorHeader"),
          t("group.errors.failedToCreateHome")
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  /**
   * Gets the description text for a home
   * @param home - The home to get description for
   * @returns Description string with device and room counts
   */
  const getDescription = (home: ESPRMGroup): string => {
    const devicesCount = store.nodeStore.nodeList
      .filter((node) => home.nodes?.includes(node.id))
      .reduce((acc, node) => acc + (node.nodeConfig?.devices?.length || 0), 0);

    return `${devicesCount} ${t("group.homeManagement.deviceCountPostfix")}, ${
      home.subGroups?.length || 0
    } ${t("group.homeManagement.roomCountPostfix")}`;
  };

  /**
   * Renders a single home item
   */
  const renderHomeItem = useCallback(
    ({ item: home }: { item: ESPRMGroup }) => (
      <TouchableOpacity
        key={home.id}
        style={[
          globalStyles.flex,
          globalStyles.justifyBetween,
          globalStyles.alignCenter,
          styles.homeItem,
        ]}
        onPress={() =>
          router.push({
            pathname: "/(group)/Settings",
            params: { id: home.id },
          } as any)
        }
      >
        <View>
          <Text style={[globalStyles.fontRegular, globalStyles.fontMd]}>
            {home.name}
          </Text>
          <Text
            style={[
              globalStyles.fontRegular,
              globalStyles.fontSm,
              globalStyles.textGray,
            ]}
          >
            {getDescription(home)}
          </Text>
        </View>
        <ChevronRight color={tokens.colors.primary} />
      </TouchableOpacity>
    ),
    []
  );

  // Render
  return (
    <>
      <Header
        label={t("group.homeManagement.title")}
        showBack={true}
        rightSlot={
          <Pressable onPress={() => setShowDialog(true)}>
            <Plus color={tokens.colors.primary} />
          </Pressable>
        }
      />
      <ScreenWrapper style={styles.screenWrapper}>
        <View style={styles.homeHeader}>
          <Text style={styles.homeHeaderTitle}>
            {t("group.homeManagement.myHomes")}
          </Text>
        </View>
        <FlatList
          data={homes}
          renderItem={renderHomeItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          style={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[tokens.colors.primary]}
              tintColor={tokens.colors.primary}
              progressViewOffset={10}
            />
          }
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
        />
      </ScreenWrapper>

      <InputDialog
        open={showDialog}
        title={t("group.homeManagement.addNewHomeInputDialogTitle")}
        inputPlaceholder={t(
          "group.homeManagement.addNewHomeInputDialogPlaceholder"
        )}
        initialValue=""
        confirmLabel={t(
          "group.homeManagement.addNewHomeInputDialogConfirmButton"
        )}
        cancelLabel={t(
          "group.homeManagement.addNewHomeInputDialogCancelButton"
        )}
        onSubmit={handleAddHome}
        onCancel={() => setShowDialog(false)}
        loading={loading}
      />
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  screenWrapper: {
    ...(globalStyles.container as ViewStyle),
    backgroundColor: tokens.colors.bg5,
  },
  listContainer: {
    flex: 1,
    width: "100%",
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: tokens.spacing._10,
  },
  homeItem: {
    marginBottom: tokens.spacing._10,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._10,
    ...globalStyles.shadowElevationForLightTheme,
  },
  homeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  homeHeaderTitle: {
    fontSize: tokens.fontSize.md,
    fontWeight: 500,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
});

export default observer(HomeManagement);
