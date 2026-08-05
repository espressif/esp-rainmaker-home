/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useGroupControl } from "@features/group/hooks";

const ControlGroupPanel = observer(() => {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { id, groupId } = useLocalSearchParams<{
    id?: string;
    groupId?: string;
  }>();
  const [updating, setUpdating] = useState(false);

  const {
    deviceGroup,
    groupTitle,
    homogeneousDeviceType,
    isConnected,
    paramBroadcastRows,
    handleEditGroup,
    handleBroadcastParam,
  } = useGroupControl({
    homeId: id,
    groupId,
    router: router as Parameters<typeof useGroupControl>[0]["router"],
  });

  const invalid =
    !deviceGroup || !homogeneousDeviceType || paramBroadcastRows.length === 0;

  return (
    <>
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
      >
        {invalid ? (
          <View
            style={[styles.empty, { opacity: isConnected ? 1 : 0.5 }]}
            {...testProps("view_control_group_panel_empty")}
          >
            {!isConnected ? (
              <WarningBanner
                message={t("layout.shared.offline")}
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
          <ScrollView
            style={[
              globalStyles.flex1,
              { backgroundColor: tokens.colors.bg5 },
              { opacity: isConnected ? 1 : 0.5 },
            ]}
            contentContainerStyle={styles.scrollContent}
            scrollEnabled={!updating}
            showsVerticalScrollIndicator={false}
            {...testProps("scroll_control_group_panel")}
          >
            {!isConnected ? (
              <WarningBanner
                message={t("layout.shared.offline")}
                qaId="control_group_panel_offline"
                containerStyle={styles.offlineBannerInScroll}
              />
            ) : null}
            {paramBroadcastRows.map(({ referenceParam, broadcastTargets }) => (
              <View key={referenceParam.name} style={styles.paramCard}>
                <ParamWrap
                  param={referenceParam}
                  disabled={!isConnected}
                  setUpdating={setUpdating}
                  onValueChange={(value: unknown) =>
                    handleBroadcastParam(broadcastTargets, value, {
                      onSetParamsError: () => {
                        toast.showError(t("group.errors.fallback"));
                      },
                    })
                  }
                  qaId={`control_group_panel_param_${referenceParam.name}`}
                >
                  <ParameterControl param={referenceParam} />
                </ParamWrap>
              </View>
            ))}
          </ScrollView>
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
    paddingVertical: tokens.spacing._10,
    ...globalStyles.shadowElevationForLightTheme,
    backgroundColor: tokens.colors.white,
  },
  updatingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
    paddingVertical: tokens.spacing._10,
  },
  updatingText: {
    ...globalStyles.fontRegular,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.bg3,
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
