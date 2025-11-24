/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import "../i18n";
import { StyleSheet, View } from "react-native";
import { useCallback, useEffect } from "react";
// Initialize Matter adapter early
import "@/adaptors/implementations/ESPMatterAdapter";
// hooks
import { useCDF } from "@/hooks/useCDF";
import { useRouter, usePathname, useFocusEffect } from "expo-router";
// components
import { Logo } from "@/components";
import { createPlatformEndpoint } from "@/utils/notifications";
import { setUserTimeZone } from "@/utils/timezone";
// theme
import { tokens } from "@/theme/tokens";
import { CDFConfig } from "@/rainmaker.config";

const index = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { store, isInitialized, fetchNodesAndGroups, initUserCustomData } =
    useCDF();

  const authCheck = async () => {
    try {
      const userInfo = store.userStore.userInfo;
      if (userInfo) {
        // Set user timezone on app launch
        try {
          await setUserTimeZone(store.userStore.user);
        } catch (error) {
          console.error("Failed to set timezone:", error);
        }

        /*
        With CDFConfig.autoSync enabled, CDF will fetch the first page automatically,
        so we don't need to fetch the first page again
        */
        const shouldFetchFirstPage = !CDFConfig.autoSync;
        await fetchNodesAndGroups(shouldFetchFirstPage);
        await initUserCustomData();
        router.replace("/(group)/Home");
        return;
      }

      const validRoutes = ["/ConfirmationCode", "/Forgot", "/Login", "/Signup"];
      const isAuthRoute = validRoutes.some((route) => pathname.includes(route));
      if (!isAuthRoute) {
        router.replace("/(auth)/Login");
      }
    } catch (error) {
      await store.userStore?.logout();
      router.replace("/(auth)/Login");
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (store && isInitialized) {
        setTimeout(async () => {
          authCheck();
        }, 2000);
      }
    }, [store, isInitialized])
  );

  // Initialize notification when user is logged in
  useEffect(() => {
    if (store && isInitialized && store?.userStore.user) {
      initNotification();
    }
  }, [store, isInitialized, store?.userStore.user]);

  const initNotification = async () => {
    try {
      await createPlatformEndpoint(store);
    } catch (err) {
      console.error(err);
      console.error("Failed to initialize notification");
    }
  };

  return (
    <View style={styles.splashScreen}>
      <Logo qaId="logo_index" />
    </View>
  );
};

export default index;

const styles = StyleSheet.create({
  splashScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
  },
});
