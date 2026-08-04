/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  Text,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { Settings } from "lucide-react-native";
import {
  Header,
  ScreenWrapper,
  ParamWrap,
  WarningBanner,
} from "@shared/components";
import ParameterControl from "@features/scene/components/ParameterControl";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import { useToast } from "@shared/hooks/useToast";
import { resolveNodeUnavailableMessage } from "@shared/utils/connectivity";
import {
  useGroupControl,
  type GroupControlParamBroadcastRow,
} from "@features/group/hooks";

/**
 * Control panel for a homogeneous device group: FlatList of shared params with
 * pull-to-refresh (same scroll surface pattern as Home). `dismissKeyboard={false}`
 * avoids ScreenWrapper TouchableWithoutFeedback stealing list gestures.
 * @returns Header + param list (or empty / unavailable state)
 */
const ControlGroupPanel = observer(() => {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { id, groupId } = useLocalSearchParams<{
    id?: string;
    groupId?: string;
  }>();
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const {
    deviceGroup,
    groupTitle,
    homogeneousDeviceType,
    referenceNode,
    isConnected,
    paramBroadcastRows,
    refreshing,
    handleRefresh,
    handleEditGroup,
    handleBroadcastParam,
  } = useGroupControl({
    homeId: id,
    groupId,
    router: router as Parameters<typeof useGroupControl>[0]["router"],
  });

  const unavailableMessage = resolveNodeUnavailableMessage(
    referenceNode?.connectivityStatus?.isConnected,
    referenceNode?.connectivityStatus?.lastConnectionTimestamp,
    t,
  );

  const invalid =
    !deviceGroup || !homogeneousDeviceType || paramBroadcastRows.length === 0;

  /**
   * Renders one broadcast param card (ParamWrap + ParameterControl).
   * @param item - Reference param and per-member broadcast targets
   * @returns Param card view
   */
  const renderItem = useCallback(
    ({ item }: { item: GroupControlParamBroadcastRow }) => {
      const { referenceParam, broadcastTargets } = item;
      return (
        <View style={styles.paramCard}>
          <ParamWrap
            param={referenceParam}
            disabled={!isConnected}
            setUpdating={(updating) => {
              setScrollEnabled(!updating);
            }}
            onValueChange={(value: unknown) =>
              handleBroadcastParam(broadcastTargets, value, {
                onSetParamsError: () => {
                  toast.showError(t("group.errors.fallback"));
                },
              })
            }
            compact={true}
            qaId={`control_group_panel_param_${referenceParam.name}`}
          >
            <ParameterControl param={referenceParam} />
          </ParamWrap>
        </View>
      );
    },
    [handleBroadcastParam, isConnected, t, toast],
  );

  /**
   * Stable list key from the reference param name.
   * @param item - Broadcast row
   * @returns Param name key
   */
  const keyExtractor = useCallback(
    (item: GroupControlParamBroadcastRow) => item.referenceParam.name,
    [],
  );

  /**
   * Offline banner above the param list (scrolls with FlatList like Home header).
   * @returns Warning banner or null when connected
   */
  const listHeader = useCallback(() => {
    if (isConnected) return null;
    return (
      <WarningBanner
        message={unavailableMessage}
        qaId="control_group_panel_offline"
        containerStyle={styles.offlineBannerInScroll}
      />
    );
  }, [isConnected, unavailableMessage]);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Header
        label={groupTitle || t("group.deviceGroups.groupControl")}
        showBack={true}
        rightSlot={
          <Pressable
            onPress={handleEditGroup}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("group.deviceGroups.editGroup")}
          >
            <Settings size={22} color={tokens.colors.primary} />
          </Pressable>
        }
        qaId="header_control_group_panel"
      />
      <ScreenWrapper
        style={StyleSheet.flatten([globalStyles.container, styles.screenRoot])}
        qaId="screen_wrapper_control_group_panel"
        dismissKeyboard={false}
      >
        {invalid ? (
          <View
            style={[styles.empty, { opacity: isConnected ? 1 : 0.5 }]}
            {...testProps("view_control_group_panel_empty")}
          >
            {!isConnected ? (
              <WarningBanner
                message={unavailableMessage}
                qaId="control_group_panel_offline"
                containerStyle={styles.offlineBannerInEmpty}
              />
            ) : null}
            {deviceGroup ? (
              <Text style={styles.emptyText}>
                {t("group.deviceGroups.controlUnavailable")}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={globalStyles.flex1} {...testProps("view_control_group_panel_list")}>
            <FlatList
              {...testProps("list_control_group_panel")}
              data={paramBroadcastRows}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              ListHeaderComponent={listHeader}
              style={[
                globalStyles.flex1,
                { backgroundColor: tokens.colors.bg5 },
                { opacity: isConnected ? 1 : 0.5 },
              ]}
              contentContainerStyle={styles.scrollContent}
              scrollEnabled={scrollEnabled}
              showsVerticalScrollIndicator={false}
              bounces
              alwaysBounceVertical
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={[tokens.colors.primary]}
                  tintColor={tokens.colors.primary}
                  progressViewOffset={10}
                  enabled={isConnected && scrollEnabled}
                />
              }
            />
          </View>
        )}
      </ScreenWrapper>
    </>
  );
});

const styles = StyleSheet.create({
  /** Matches control Fallback panel: page sits on bg5 (also set in globalStyles.container). */
  screenRoot: {
    backgroundColor: tokens.colors.bg5,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: tokens.spacing._15,
    paddingTop: tokens.spacing._10,
  },
  /** Same as device_panels/Fallback ParamControlWrap wrapper. */
  paramCard: {
    marginBottom: 10,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    padding: tokens.spacing._15,
  },
  emptyText: {
    ...globalStyles.fontRegular,
    textAlign: "center",
    color: tokens.colors.bg3,
  },
  /** `globalStyles.warningContainer` already has marginBottom; align with scroll padding. */
  offlineBannerInScroll: {
    alignSelf: "stretch",
  },
  offlineBannerInEmpty: {
    alignSelf: "stretch",
    marginBottom: tokens.spacing._10,
  },
});

export default ControlGroupPanel;
