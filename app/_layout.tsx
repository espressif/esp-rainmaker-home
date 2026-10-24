/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Bootstrap
import "@src/bootstrap";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, ActivityIndicator, Text } from "react-native";

import { Stack, usePathname, RelativePathString } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { defaultConfig } from "@tamagui/config/v4";
import { createTamagui, TamaguiProvider } from "tamagui";

// providers
import { StoreProvider } from "@context/store.context";
import { ToastProvider, ToastViewport } from "@tamagui/toast";
import { Provider as PaperProvider } from "react-native-paper";
import { SceneProvider } from "@context/scenes.context";
import { ScheduleProvider } from "@context/schedules.context";
import { AppRestartContext } from "@context/appRestart.context";
import { ESPAppRestartAdapter } from "@native-adaptors/implementations/ESPAppRestartAdapter";

// hooks
import { useTranslation } from "react-i18next";

// components
import { Button, FooterTabs, ToastContainer } from "@shared/components";

// icons
import { Home, Calendar, User, History, Zap } from "lucide-react-native";

// feature flags
import { getFeatures } from "@/config/features.config";

// theme
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { syncOnLaunch } from "@shared/runtimeStyle/store";

// async SDK + runtime config init
import { cdfBootstrap, initializeApp } from "@src/integrations";
import { runtimeConfigManager } from "@config/runtime.config";

// constants
import {
  TOAST_PROVIDER_SWIPE_DIRECTION_NEUTRAL,
  TOAST_PROVIDER_SWIPE_THRESHOLD_DISABLED,
} from "@shared/utils/constants";

const config = createTamagui(defaultConfig);

const stackScreenOptions = {
  headerShown: false,
  animation: "slide_from_right" as const,
  gestureEnabled: false,
  gestureDirection: "horizontal" as const,
};

/**
 * Renders the full provider tree (store, theme, toast, scenes, schedules)
 * and the Expo Router `<Stack>`. Also conditionally shows the bottom
 * `<FooterTabs>` when the active route is one of the top-level tab routes.
 *
 * This component owns zero async side-effects; all heavy lifting is done
 * in `AppInitGate` before this tree is ever mounted.
 */
const InnerLayout = () => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const features = getFeatures();

  const statusBarHeight = insets.top;

  const tabs = [
    {
      route: "/(group)/Home" as RelativePathString,
      label: t("layout.navigation.footer.home"),
      Icon: Home,
    },
    features.schedules && {
      route: "/(schedule)/Schedules" as RelativePathString,
      label: t("layout.navigation.footer.schedules"),
      Icon: History,
    },
    features.scenes && {
      route: "/(scene)/Scenes" as RelativePathString,
      label: t("layout.navigation.footer.scenes"),
      Icon: Calendar,
    },
    features.automations && {
      route: "/(automation)/Automations" as RelativePathString,
      label: t("layout.navigation.footer.automations"),
      Icon: Zap,
    },
    {
      route: "/(user)/User" as RelativePathString,
      label: t("layout.navigation.footer.user"),
      Icon: User,
    },
  ].filter(Boolean) as {
    route: RelativePathString;
    label: string;
    Icon: any;
  }[];

  const isUserRoute = [
    "/Home",
    "/User",
    features.scenes && "/Scenes",
    features.automations && "/Automations",
    features.schedules && "/Schedules",
  ]
    .filter(Boolean)
    .some((route) => pathname === route);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StoreProvider>
        <TamaguiProvider config={config}>
          <PaperProvider>
            <SceneProvider>
              {/* ToastProvider must wrap ScheduleProvider: ScheduleProvider uses useToast (Tamagui controller). */}
              <ToastProvider
                swipeDirection={TOAST_PROVIDER_SWIPE_DIRECTION_NEUTRAL}
                swipeThreshold={TOAST_PROVIDER_SWIPE_THRESHOLD_DISABLED}
              >
                <ScheduleProvider>
                  <Stack screenOptions={stackScreenOptions}>
                    {/* Other components */}
                  </Stack>
                  {isUserRoute && <FooterTabs tabs={tabs} />}
                  <ToastContainer />
                  <ToastViewport
                    multipleToasts
                    flexDirection="column-reverse"
                    top={statusBarHeight}
                    alignItems="stretch"
                    width="100%"
                    paddingHorizontal={tokens.spacing._15}
                    paddingVertical={tokens.spacing._15}
                  />
                </ScheduleProvider>
              </ToastProvider>
            </SceneProvider>
          </PaperProvider>
        </TamaguiProvider>
      </StoreProvider>
    </GestureHandlerRootView>
  );
};

/**
 * Blocks the UI tree until `initializeApp()` resolves. While the promise
 * is pending a full-screen `<ActivityIndicator>` is shown; once settled
 * `<InnerLayout>` (and the whole provider tree) is mounted for the first
 * time, guaranteeing the SDK and runtime config are ready before any
 * feature screen can render.
 *
 * On a programmatic restart (`restartApp`), the entire JS runtime is torn
 * down and rebuilt from the entry point, so this component's `useEffect`
 * naturally re-runs the init gate from scratch — no remount key needed.
 *
 * `generation` covers the in-place path: `reinitializeSdk` bumps it so the
 * provider tree remounts and `StoreProvider` re-reads the new `ESPCDF`
 * instance into its ref.
 *
 * If the SDK fails to start, shows an error with Retry instead of a spinner
 * that never ends.
 */
const AppInitGate = ({ generation }: { generation: number }) => {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  const startApp = useCallback(() => {
    initializeApp()
      .then(() => {
        setReady(true);
        // Saves a newer published style in the background for the next start.
        syncOnLaunch(runtimeConfigManager.config?.brandUrl);
      })
      .catch((error: unknown) => {
        console.error("[AppInitGate] app start failed:", error);
        setStartFailed(true);
      });
  }, []);

  // Reset first: a failed start leaves adaptors half set up.
  const isRetrying = useRef(false);
  const retryStart = useCallback(() => {
    if (isRetrying.current) return; // ignore a second tap while retrying
    isRetrying.current = true;
    setStartFailed(false);
    cdfBootstrap
      .reset()
      .then(startApp)
      .catch((error: unknown) => {
        console.error("[AppInitGate] app restart failed:", error);
        setStartFailed(true);
      })
      .finally(() => {
        isRetrying.current = false;
      });
  }, [startApp]);

  useEffect(() => {
    startApp();
  }, [startApp]);

  if (!ready) {
    return (
      <View style={globalStyles.appLoadingContainer}>
        {startFailed ? (
          <View
            style={{
              alignItems: "center",
              gap: tokens.spacing._15,
              padding: tokens.spacing._20,
            }}
          >
            <Text
              style={{
                color: tokens.colors.text_primary,
                fontSize: tokens.fontSize.md,
                textAlign: "center",
              }}
            >
              {t("error.fallBack")}
            </Text>
            <Button label={t("common.retry")} onPress={retryStart} />
          </View>
        ) : (
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        )}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={tokens.colors.white} translucent={false} />
      <InnerLayout key={generation} />
    </SafeAreaProvider>
  );
};

/**
 * Top-level component exported as the default Expo Router root layout.
 *
 * Exposes two ways to re-establish the SDK layer through `AppRestartContext`:
 *
 * - `restartApp` reloads the JS runtime without quitting the app, for state that
 *   is only read at start-up.
 * - `reinitializeSdk` rebuilds in place: tear the CDF runtime down (disposing the
 *   `ESPCDF` singleton so `initCDF` builds a fresh one on the new config rather
 *   than returning the cached instance), re-init, then remount via `generation`.
 */
const RootLayout = () => {
  const [generation, setGeneration] = useState(0);

  const restartApp = useCallback(() => {
    void ESPAppRestartAdapter.restartApp();
  }, []);

  const reinitializeSdk = useCallback(async () => {
    await cdfBootstrap.reset();
    await initializeApp();
    setGeneration((current) => current + 1);
  }, []);

  const restartValue = useMemo(
    () => ({ restartApp, reinitializeSdk }),
    [restartApp, reinitializeSdk],
  );

  return (
    <AppRestartContext.Provider value={restartValue}>
      <AppInitGate generation={generation} />
    </AppRestartContext.Provider>
  );
};

export default RootLayout;
