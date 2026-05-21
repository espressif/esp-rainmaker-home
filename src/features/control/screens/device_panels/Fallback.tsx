/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ScrollView,
  RefreshControl,
} from "react-native";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";

// config
import { PARAM_CONTROLS } from "@/config/params.config";

// CDF
import { observer, useLocalObservable } from "mobx-react-lite";

// components
import { DevicePanelNoParamsEmptyState } from "@features/control/components";
import { ParamControlWrap } from "@shared/components";

// Utils
import { testProps } from "@shared/utils/testProps";

// Types
import { DeviceFallbackProps } from "@src/types/global";
import { ESPRM_PARAM_WRITE_PROPERTY } from "@shared/utils/constants";
import { router } from "expo-router";
import { ESPCDFDevice, ESPCDFDeviceParam } from "@store";

/**
 * DeviceFallback
 *
 * A fallback component that displays device information and parameters when a specific
 * device panel is not available. Shows basic device info like name, type, connection status,
 * and a list of all available parameters. When there are no parameters, shows a centered empty state.
 * @param props - `node` and `device` for generic param list rendering
 * @returns Scrollable list of device fields and supported param controls
 */
const DeviceFallback = observer(
  ({ node, device: deviceProp }: DeviceFallbackProps) => {
    const state = useLocalObservable(() => ({
      updating: false,
      setUpdating: (updating: boolean) => {
        state.updating = updating;
      },
    }));

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
    const params = device?.params || [];

    // Handler to open chart for time series params
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
      <ScrollView
        style={[
          globalStyles.flex1,
          { backgroundColor: tokens.colors.bg5 },
          { opacity: node.connectivityStatus?.isConnected ? 1 : 0.5 },
        ]}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: tokens.spacing._15,
        }}
        scrollEnabled={!state.updating}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            colors={[tokens.colors.primary]}
            tintColor={tokens.colors.primary}
            onRefresh={() => device.getParams()}
          />
        }
        {...testProps("scroll_fallback")}
      >
        {params.map((param) => {
          // Check for control using type
          let control = param.type ? _paramsMap[param.type] : null;

          // If no control found via type, try uiType as fallback
          if (!control && param.uiType) {
            control = _paramsMap[param.uiType];
          }

          // Return null only if neither uiType nor type has a valid control
          if (!control) return null;

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
              disabled={
                !node.connectivityStatus?.isConnected ||
                !param.properties?.includes(ESPRM_PARAM_WRITE_PROPERTY)
              }
              setUpdating={state.setUpdating}
              onOpenChart={handleOpenChart}
              style={{
                marginBottom: 10,
                ...globalStyles.shadowElevationForLightTheme,
                backgroundColor: tokens.colors.white,
              }}
            >
              <control.control compact />
            </ParamControlWrap>
          );
        })}
      </ScrollView>
    );
  },
);

export default DeviceFallback;
