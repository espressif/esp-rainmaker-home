/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";

import { Stack, usePathname, RelativePathString } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
// styles
import "@/i18n";
// config
import { defaultConfig } from "@tamagui/config/v4";
const config = createTamagui(defaultConfig);
import { configure } from "mobx";

// providers
import { StoreProvider } from "@/context/CDF";
import { ToastProvider, ToastViewport } from "@tamagui/toast";
import { createTamagui, TamaguiProvider } from "tamagui";
import { Provider as PaperProvider } from "react-native-paper";
// hooks
import { useTranslation } from "react-i18next";
// components
import { FooterTabs } from "@/components";
import { ToastContainer } from "@/components";
// icons
import { Home, DoorOpen, Calendar, User, History, Zap } from "lucide-react-native";

const InnerLayout = () => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Calculate statusBarHeight for toast positioning using safe area insets
  const statusBarHeight = insets.top;

  // Define tabs for FooterTabs
  const tabs = [
    {
      route: "/(group)/Home" as RelativePathString,
      label: t("layout.navigation.footer.home"),
      Icon: Home,
    },
    {
      route: "/(group)/Rooms" as RelativePathString,
      label: t("layout.navigation.footer.rooms"),
      Icon: DoorOpen,
    },
    {
      route: "/(scene)/Scenes" as RelativePathString,
      label: t("layout.navigation.footer.scenes"),
      Icon: Calendar,
    },
    {
      route: "/(automation)/Automations" as RelativePathString,
      label: t("layout.navigation.footer.automations"),
      Icon: Zap,
    },
    {
      route: "/(schedule)/Schedules" as RelativePathString,
      label: t("layout.navigation.footer.schedules"),
      Icon: History,
    },
    {
      route: "/(user)/User" as RelativePathString,
      label: t("layout.navigation.footer.user"),
      Icon: User,
    },
  ];

  const isUserRoute = [
    "/Rooms",
    "/Home",
    "/User",
    "/Scenes",
    "/Automations",
    "/Schedules"
  ].some((route) => pathname === route);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StoreProvider>
        <TamaguiProvider config={config}>
          <PaperProvider>
            <ToastProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: Platform.select({
                    ios: "slide_from_right",
                    android: "slide_from_right",
                    default: "slide_from_right",
                  }),
                  gestureEnabled: true,
                  gestureDirection: "horizontal",
                }}
              >
                {/* Other components */}
              </Stack>
              {isUserRoute && <FooterTabs tabs={tabs} />}
              <ToastContainer />
              <ToastViewport
                multipleToasts
                flexDirection="column-reverse"
                top={statusBarHeight}
                alignItems="center"
                width="100%"
                padding={16}
              />
            </ToastProvider>
          </PaperProvider>
        </TamaguiProvider>
      </StoreProvider>
    </GestureHandlerRootView>
  );
};

const _layout = () => {
  // MobX strict mode
  configure({
    enforceActions: "never", // disables strict mode
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
      <InnerLayout />
    </SafeAreaProvider>
  );
};

export default _layout;
