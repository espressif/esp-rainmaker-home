/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { View } from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";

// config
import { PARAM_CONTROLS } from "@/config/params.config";

// CDF
import { observer } from "mobx-react-lite";

// components
import { DevicePanelNoParamsEmptyState } from "@features/control/components";
import { ParamControlWrap } from "@shared/components";

// Utils
import { useCDF } from "@shared/hooks/useCDF";
import { getDeviceReachability } from "@shared/utils/device";
import { resolveParamControl } from "@shared/utils/deviceParams";
import { parseBridgedChildParentNodeId } from "@shared/utils/matterLocalReachability";
import { testProps } from "@shared/utils/testProps";

// Types
import { DeviceFallbackProps } from "@src/types/global";
import { ESPRM_PARAM_WRITE_PROPERTY } from "@shared/utils/constants";
import {
  filterUnsupportedMatterColorParams,
  isParamDisabledBySibling,
  shouldHideParamRow,
} from "@shared/utils/paramUtils";
import { router } from "expo-router";
import { ESPCDFDevice, ESPCDFDeviceParam } from "@store";

/**
 * DeviceFallback
 *
 * A fallback component that displays device information and parameters when a specific
 * device panel is not available. Shows basic device info like name, type, connection status,
 * and a list of all available parameters. Writable controls stay enabled when the node is
 * cloud-connected or locally discovered (RainMaker local / Matter operational transport).
 * When there are no parameters, shows a centered empty state.
 *
 * Content-only (no nested ScrollView): Control owns the shared scroll + pull-to-refresh.
 * @param props - `node`, `device`, and optional parent scroll lock callback
 * @returns List of device fields and supported param controls
 */
const DeviceFallback = observer(
  ({ node, device: deviceProp, setScrollEnabled }: DeviceFallbackProps) => {
    /**
     * Locks Control's shared ScrollView while a param gesture is active.
     * @param updating - True while the control is being interacted with
     */
    const handleSetUpdating = (updating: boolean) => {
      setScrollEnabled?.(!updating);
    };

    const { store } = useCDF();
    const storeNode = store.nodeStore.nodesByIDMap[node.id] ?? node;
    const registeredTransports =
      store.subscriptionStore.registeredTransports[node.id];
    const bridgeParentNodeId = parseBridgedChildParentNodeId(storeNode.id);
    const bridgeParentTransports = bridgeParentNodeId
      ? store.subscriptionStore.registeredTransports[bridgeParentNodeId]
      : undefined;
    const deviceConnected = useMemo(
      () =>
        getDeviceReachability(
          storeNode,
          registeredTransports,
          bridgeParentTransports,
        ).reachable,
      [storeNode, registeredTransports, bridgeParentTransports],
    );

    const _paramsMap = PARAM_CONTROLS.reduce(
      (acc, control) => {
        if (control.types.includes("esp.ui.hidden")) {
          return acc;
        }
        control.types.forEach((type) => {
          acc[type] = control;
        });
        return acc;
      },
      {} as Record<string, any>,
    );

    // 1. Device Data
    const device: ESPCDFDevice = deviceProp;
    const params = filterUnsupportedMatterColorParams(
      storeNode,
      device?.params || [],
    );

    /**
     * Opens the time-series chart screen for a param.
     * @param param - Device param to chart
     */
    const handleOpenChart = (param: ESPCDFDeviceParam) => {
      router.push({
        pathname: "/(control)/Chart",
        params: {
          nodeId: node.id,
          deviceName: device.name,
          paramName: param.name,
        },
      } as any);
    };

    if (params.length === 0) {
      return <DevicePanelNoParamsEmptyState />;
    }

    // 2. Render
    return (
      <View
        style={{ backgroundColor: tokens.colors.bg5 }}
        {...testProps("scroll_fallback")}
      >
        {params.map((param) => {
          // Resolve via the shared resolver so uiType/type precedence (incl.
          // preferring a semantic type control over a generic esp.ui.text /
          // esp.ui.slider hint)
          const control = resolveParamControl(param, _paramsMap);

          // Return null only if neither uiType nor type has a valid control
          if (!control || !control.control) return null;
          const ControlComponent = control.control;

          if (shouldHideParamRow(param)) {
            return null;
          }

          const canWrite =
            param.properties?.includes(ESPRM_PARAM_WRITE_PROPERTY) ?? false;
          // Cross-param gating (e.g. RVC `Go Home` is inert while
          // `Run Mode` is `idle`). The rule lives in cluster meta —
          // `PARAM_BOUNDS_DISABLED_WHEN_SIBLING_VALUE` — and is evaluated
          // against the live sibling param values on this device.
          const disabledBySibling = isParamDisabledBySibling(param, params);

          if (control.derivedMeta && control.derivedMeta.length > 0) {
            control.derivedMeta.forEach((_param: any) => {
              const [name, type] = Object.entries(_param)[0];
              const derivedParam = params.find((p) => p.type === type);
              if (derivedParam && param.bounds) {
                param.bounds[name] = derivedParam.value;
              }
            });
          }

          return (
            <ParamControlWrap
              key={param.name}
              param={param}
              disabled={(canWrite && !deviceConnected) || disabledBySibling}
              setUpdating={handleSetUpdating}
              onOpenChart={handleOpenChart}
              style={{
                marginBottom: 10,
                backgroundColor: tokens.colors.white,
                borderRadius: tokens.radius.md,
              }}
            >
              <ControlComponent compact />
            </ParamControlWrap>
          );
        })}
      </View>
    );
  },
);

export default DeviceFallback;
