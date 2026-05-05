/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Switch } from "tamagui";
import { LayoutDashboard } from "lucide-react-native";
import type { ESPCDFDevice, ESPCDFGroup, ESPCDFNode } from "@store";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { getDeviceImage } from "@shared/utils/device";
import {
  broadcastGroupParam,
  findDeviceOfType,
  resolveHomogeneousDeviceType,
  stripGroupControlSubgroupDisplayName,
} from "@features/group/utils/controlGroupHelpers";
import { ESPRM_POWER_PARAM_TYPE, ERROR_CODES } from "@shared/utils/constants";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

/** Overlap for stacked avatars (~50% of 40px inner image). */
const AVATAR_OVERLAP = 16;

export interface ControlGroupCardProps {
  group: ESPCDFGroup;
  homeId: string;
  /** Defaults to navigating to ControlGroupPanel */
  onPress?: (groupId: string) => void;
  qaId?: string;
}

function buildGroupDevices(
  group: ESPCDFGroup,
  nodesList: ESPCDFNode[]
): { node: ESPCDFNode; device: ESPCDFDevice }[] {
  const map = new Map(nodesList.map((n) => [n.id, n] as const));
  const dtype = resolveHomogeneousDeviceType(group, map);
  if (!dtype) return [];
  const out: { node: ESPCDFNode; device: ESPCDFDevice }[] = [];
  for (const nid of group.nodeIds ?? []) {
    const node = map.get(nid);
    if (!node) continue;
    const device = findDeviceOfType(node, dtype);
    if (device) out.push({ node, device });
  }
  return out;
}

/**
 * Home / list card for a group-control subgroup: same footprint as DeviceCard
 * (see `globalStyles.controlGroupCard*`), stacked avatars, name row, optional
 * group power switch, status.
 */
const ControlGroupCard = observer(
  ({ group, homeId, onPress, qaId }: ControlGroupCardProps) => {
    const { t } = useTranslation();
    const toast = useToast();
    const { width } = useWindowDimensions();
    const { store } = useCDF();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
    const nodesList = store?.nodeStore?.nodesList ?? [];

    let cardWidth = 180;
    if (width <= 500) {
      cardWidth = (width - tokens.spacing._15 * 2) / 2 - 6;
    }

    const entries = useMemo(
      () => buildGroupDevices(group, nodesList),
      [group, nodesList]
    );

    const displayName = stripGroupControlSubgroupDisplayName(group.name);
    const total = entries.length;

    const allOnline =
      total === 0 ||
      entries.every((e) => e.node.connectivityStatus?.isConnected);

    const entriesWithPower = useMemo(
      () =>
        entries.filter((e) =>
          e.device.params?.some((p) => p.type === ESPRM_POWER_PARAM_TYPE)
        ),
      [entries]
    );

    const hasPower = entriesWithPower.length > 0;

    const powerAllOn =
      hasPower &&
      entriesWithPower.every((e) => {
        const p = e.device.params?.find(
          (pr) => pr.type === ESPRM_POWER_PARAM_TYPE
        );
        return Boolean(p?.value);
      });

    const canTogglePower =
      hasPower &&
      entriesWithPower.every(
        (e) => e.node.connectivityStatus?.isConnected ?? false
      );

    const imageSlots = total > 3 ? entries.slice(0, 3) : entries;
    const moreCount = total > 3 ? total - 3 : 0;

    const handlePress = () => {
      if (onPress) {
        onPress(group.id);
        return;
      }
      router.push({
        pathname: "/(group)/ControlGroupPanel",
        params: { id: homeId, groupId: group.id },
      } as any);
    };

    /**
     * Toggles power for all members via {@link broadcastGroupParam} (same transport as ControlGroupPanel).
     */
    const handleGroupPower = (value: boolean) => {
      const broadcastTargets = entriesWithPower
        .map(({ device }) => {
          const param = device.params?.find(
            (pr) => pr.type === ESPRM_POWER_PARAM_TYPE
          );
          return param ? { device, param } : null;
        })
        .filter((row): row is NonNullable<typeof row> => row != null);
      if (broadcastTargets.length === 0) return;
      broadcastGroupParam(group, broadcastTargets, value, {
        onSetParamsError: (err: unknown) => {
          const code = (err as { code?: string })?.code;
          const key =
            code && ERROR_CODES[code as keyof typeof ERROR_CODES];
          toast.showError(key ? t(key) : t("group.errors.fallback"));
        },
      });
    };

    return (
      <TouchableOpacity
        {...(qaId ? testProps(qaId) : {})}
        style={[
          globalStyles.controlGroupCard,
          globalStyles.shadowElevationForLightTheme,
          {
            padding: 10,
            width: cardWidth,
            opacity: allOnline ? 1 : 0.7,
            backgroundColor: !allOnline
              ? tokens.colors.bg2
              : tokens.colors.white,
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={globalStyles.controlGroupCardFlexWrap}>
          <View style={globalStyles.controlGroupCardStack}>
            {imageSlots.length === 0 ? (
              <View
                style={[
                  globalStyles.controlGroupCardAvatarWrap,
                  { marginLeft: 0, zIndex: 1 },
                ]}
              >
                <Image
                  source={getDeviceImage(undefined, false)}
                  style={globalStyles.controlGroupCardAvatar}
                  resizeMode="contain"
                />
              </View>
            ) : (
              imageSlots.map((e, index) => {
                const connected =
                  e.node.connectivityStatus?.isConnected ?? false;
                return (
                  <View
                    key={`${e.node.id}-${e.device.name}`}
                    style={[
                      globalStyles.controlGroupCardAvatarWrap,
                      {
                        marginLeft: index === 0 ? 0 : -AVATAR_OVERLAP,
                        zIndex: imageSlots.length - index,
                      },
                    ]}
                  >
                    <Image
                      source={getDeviceImage(e.device.type, connected)}
                      style={globalStyles.controlGroupCardAvatar}
                      resizeMode="contain"
                    />
                  </View>
                );
              })
            )}
            {moreCount > 0 ? (
              <View
                style={[
                  globalStyles.controlGroupCardAvatarWrap,
                  globalStyles.controlGroupCardOverflowBubble,
                  {
                    marginLeft: imageSlots.length === 0 ? 0 : -AVATAR_OVERLAP,
                    zIndex: imageSlots.length + 1,
                  },
                ]}
              >
                <Text style={globalStyles.controlGroupCardOverflowText}>
                  +{moreCount}
                </Text>
              </View>
            ) : null}
          </View>

          {hasPower ? (
            <Switch
              {...testProps("switch_control_group_power")}
              size="$2.5"
              borderColor={tokens.colors.bg1}
              borderWidth={0}
              checked={powerAllOn}
              disabled={!canTogglePower}
              style={[
                globalStyles.switch,
                !canTogglePower && globalStyles.deviceCardDisabled,
              ]}
              onCheckedChange={(checked) =>
                handleGroupPower(Boolean(checked))
              }
            >
              <Switch.Thumb
                animation="quicker"
                style={
                  powerAllOn
                    ? globalStyles.switchThumbActive
                    : globalStyles.switchThumb
                }
              />
            </Switch>
          ) : (
            <View style={globalStyles.controlGroupCardSwitchPlaceholder} />
          )}
        </View>

        <View style={globalStyles.controlGroupCardNameBlock}>
          <Text
            {...testProps("text_control_group_name")}
            style={globalStyles.controlGroupCardName}
            numberOfLines={1}
          >
            {displayName.trim() || group.name}
          </Text>
          <View style={globalStyles.controlGroupCardStatusContainer}>
            {!allOnline ? (
              <Text
                {...testProps("text_control_group_offline")}
                style={globalStyles.controlGroupCardStatus}
              >
                {t("layout.shared.offline")}
              </Text>
            ) : total > 0 ? (
              <Text style={globalStyles.controlGroupCardStatus}>
                {total}{" "}
                {total !== 1
                  ? t("group.rooms.multipleDeviceCountPostfix")
                  : t("group.rooms.singleDeviceCountPostfix")}
              </Text>
            ) : (
              <Text style={globalStyles.controlGroupCardStatus} />
            )}
          </View>
        </View>

        <View
          style={globalStyles.controlGroupCardGroupBadge}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
        >
          <LayoutDashboard size={15} color={tokens.colors.gray} />
        </View>
      </TouchableOpacity>
    );
  }
);

export default ControlGroupCard;
