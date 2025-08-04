/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import "../i18n";
import { StyleSheet, View } from "react-native";
import { useCallback, useEffect } from "react";
// hooks
import { useCDF } from "@/hooks/useCDF";
import { useRouter, usePathname, useFocusEffect } from "expo-router";
// components
import { Logo } from "@/components";
import { createPlatformEndpoint } from "@/utils/notifications";
// theme
import { tokens } from "@/theme/tokens";

const index = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { store, isInitialized } = useCDF();

  const authCheck = async () => {
    try {
      const user = store.userStore.user;

      if (user) {
        try {
          const userInfo = await user.getUserInfo();
          if (userInfo) {
            router.replace("/(group)/Home");
            return;
          }
        } catch (error) {
          await store.userStore?.logout();
        }
      }

      const validRoutes = ["/ConfirmationCode", "/Forgot", "/Login", "/Signup"];
      const isAuthRoute = validRoutes.some((route) => pathname.includes(route));
      if (!isAuthRoute) {
        router.replace("/(auth)/Login");
      }
    } catch (error) {
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
      <Logo />
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
