/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import "../i18n";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useCallback, useEffect } from "react";
import { useCDF } from "@shared/hooks/useCDF";
import {
  useRouter,
  usePathname,
  useFocusEffect,
  Redirect,
} from "expo-router";
import { Logo } from "@shared/components";
import { registerForNotification } from "@shared/utils/notifications";
import {
  executePostLoginPipeline,
  navigateToHomeAfterAuth,
} from "@features/auth/utils/postLoginPipeline";
import { isConsentAccepted } from "@features/consent";
import { getFeatures } from "@config/features.config";
import { isCnRegion } from "@config/region.config";
import { getPreAuthRoute } from "@features/landing";
import { shouldShowWebDesktopEmbedPhone } from "@features/embed/utils/shouldShowWebDesktopEmbedPhone";
import { WEB_EMBED_ROUTE } from "@shared/utils/constants";
import { tokens } from "@shared/theme/tokens";

/**
 * Root splash / auth gate for web (no native Matter bootstrap import).
 * On desktop host viewports (&gt;480px) redirects to `/embed` for the iPhone
 * frame; inside that iframe (or on mobile web) runs the normal single-app flow.
 */
const Index = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { store, isInitialized, syncHomeWithNodes, initUserCustomData } =
    useCDF();

  const user = store?.userStore.user;
  const useDesktopEmbedPhone = shouldShowWebDesktopEmbedPhone(width);

  const authCheck = async () => {
    try {
      if (isCnRegion() && !(await isConsentAccepted())) {
        if (!pathname.includes("/Consent")) {
          router.replace("/(consent)/Consent" as never);
        }
        return;
      }

      if (user) {
        navigateToHomeAfterAuth(router);
        void executePostLoginPipeline({
          store,
          syncHomeWithNodes,
          initUserCustomData,
        }).catch((error: unknown) => {
          console.warn("[Index] post-login pipeline failed:", error);
        });
        return;
      }

      const validRoutes = [
        "/Landing",
        "/ConfirmationCode",
        "/Forgot",
        "/Login",
        "/Signup",
      ];
      const isAuthRoute = validRoutes.some((route) => pathname.includes(route));
      if (!isAuthRoute) {
        router.replace(getPreAuthRoute() as never);
      }
    } catch {
      await user?.logout();
      router.replace(getPreAuthRoute() as never);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (useDesktopEmbedPhone || !store || !isInitialized) {
        return;
      }
      void authCheck();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
    }, [store, isInitialized, useDesktopEmbedPhone]),
  );

  useEffect(() => {
    if (
      useDesktopEmbedPhone ||
      !user ||
      !isInitialized ||
      !getFeatures().notifications
    ) {
      return;
    }
    void initNotification();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [user, isInitialized, useDesktopEmbedPhone]);

  /**
   * Registers for push notifications when the feature is enabled.
   */
  const initNotification = async () => {
    try {
      await registerForNotification(store);
    } catch (err) {
      console.error(err);
      console.error("Failed to initialize notification");
    }
  };

  if (useDesktopEmbedPhone) {
    return <Redirect href={WEB_EMBED_ROUTE as never} />;
  }

  return (
    <View style={styles.splashScreen}>
      <Logo qaId="logo_index" />
    </View>
  );
};

export default Index;

const styles = StyleSheet.create({
  splashScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
  },
});
