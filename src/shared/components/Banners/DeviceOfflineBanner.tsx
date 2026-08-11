/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StyleProp, ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import type { ESPCDFNode } from "@store";
import { useDeviceConnected } from "@shared/hooks/useDeviceConnected";
import { resolveNodeUnavailableMessage } from "@shared/utils/connectivity";
import WarningBanner from "./WarningBanner";

export interface DeviceOfflineBannerProps {
  /** Node whose connectivity drives the offline banner. */
  node: ESPCDFNode | undefined;
  /** Applied after the warning container styles. */
  containerStyle?: StyleProp<ViewStyle>;
  /** QA id prefix for the banner text. */
  qaId?: string;
}

/**
 * Renders an offline warning with last-seen timestamp when the node is unreachable.
 * Hidden while connected (cloud or local).
 * @param props - Node, optional style, and QA id
 * @returns Warning banner or `null` when online / node missing
 */
function DeviceOfflineBanner({
  node,
  containerStyle,
  qaId = "device_offline",
}: DeviceOfflineBannerProps) {
  const { t } = useTranslation();
  const isConnected = useDeviceConnected(node);

  if (!node || isConnected) {
    return null;
  }

  const message = resolveNodeUnavailableMessage(
    node.connectivityStatus?.isConnected,
    node.connectivityStatus?.lastConnectionTimestamp,
    t,
  );

  return (
    <WarningBanner
      message={message}
      containerStyle={containerStyle}
      qaId={qaId}
    />
  );
}

export default observer(DeviceOfflineBanner);
