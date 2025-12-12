/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { router } from "expo-router";

// SDK
import { ESPClaimStatus } from "@espressif/rainmaker-base-sdk";
import type {
  ESPDevice,
  ESPClaimResponse,
} from "@espressif/rainmaker-base-sdk";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";

// Components
import { ScreenWrapper, Header, Button } from "@/components";

// Utils
import { testProps } from "@/utils/testProps";

// Icons
import { AlertCircle, CheckCircle } from "lucide-react-native";

/**
 * ClaimingScreen component for device assisted claiming.
 *
 * This component handles the assisted claiming process for ESP devices
 * that require claiming before provisioning.
 */
const ClaimingScreen = () => {
  const { t } = useTranslation();
  const { store } = useCDF();
  // Get device
  const device: ESPDevice = store.nodeStore.connectedDevice;

  // State
  const [status, setStatus] = useState<ESPClaimStatus>(
    ESPClaimStatus.inProgress
  );
  const [progressMessage, setProgressMessage] = useState(
    t("device.claiming.starting") || "Starting assisted claiming..."
  );
  const [errorMessage, setErrorMessage] = useState("");

  // Animation
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Refs to track claiming state
  const hasStartedRef = useRef(false);

  // Start rotation animation
  useEffect(() => {
    if (status === ESPClaimStatus.inProgress) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
    }
  }, [status, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  /**
   * Progress callback for claiming
   */
  const handleClaimProgress = (response: ESPClaimResponse) => {
    setStatus(response.status);
    setProgressMessage(response.message);

    if (response.status === ESPClaimStatus.failed && response.error) {
      setErrorMessage(response.error);
    }
  };

  /**
   * Main claiming flow
   */
  const startClaiming = async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    try {
      // Use the SDK's startAssistedClaiming method
      await device.startAssistedClaiming(handleClaimProgress);
    } catch (error) {
      setStatus(ESPClaimStatus.failed);
      setErrorMessage(
        (error as Error).message ||
          t("device.claiming.failed") ||
          "Claiming failed"
      );
      setProgressMessage(
        t("device.claiming.failedMessage") || "Claiming failed"
      );
    }
  };

  // Start claiming on mount
  useEffect(() => {
    if (device) {
      startClaiming();
    } else {
      setStatus(ESPClaimStatus.failed);
      setErrorMessage(
        t("device.errors.deviceNotConnected") || "Device not connected"
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, t]);

  // Handle success - navigate to WiFi
  useEffect(() => {
    if (status === ESPClaimStatus.success) {
      const timer = setTimeout(() => {
        router.push({
          pathname: "/(device)/Wifi",
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  /**
   * Handle OK button press (on error)
   */
  const handleOkPress = () => {
    if (device) {
      // Disconnect device
      try {
        device.disconnect?.();
      } catch (e) {
        console.error("Error disconnecting:", e);
      }
    }
    router.back();
  };

  // Render
  return (
    <>
      <Header
        showBack
        label={t("device.claiming.title") || "Claiming"}
        qaId="header_claiming"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.screenWrapper,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_claiming"
      >
        <View style={styles.container} {...testProps("view_claiming")}>
          {/* Icon with animation */}
          <View
            style={styles.iconContainer}
            {...testProps("view_claiming_icon")}
          >
            {status === ESPClaimStatus.inProgress && (
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <ActivityIndicator size={80} color={tokens.colors.primary} />
              </Animated.View>
            )}
            {status === ESPClaimStatus.success && (
              <CheckCircle size={80} color={tokens.colors.green} />
            )}
            {status === ESPClaimStatus.failed && (
              <AlertCircle size={80} color={tokens.colors.red} />
            )}
          </View>

          {/* Progress message */}
          <Text
            style={[
              styles.progressText,
              status === ESPClaimStatus.failed && styles.errorText,
            ]}
            {...testProps("text_claiming_progress")}
          >
            {progressMessage}
          </Text>

          {/* Error message */}
          {status === ESPClaimStatus.failed && errorMessage && (
            <Text
              style={styles.errorDetail}
              {...testProps("text_claiming_error")}
            >
              {errorMessage}
            </Text>
          )}

          {/* Subtitle for in-progress */}
          {status === ESPClaimStatus.inProgress && (
            <Text style={styles.subtitle} {...testProps("text_claiming_wait")}>
              {t("device.claiming.pleaseWait") ||
                "This process may take a few moments..."}
            </Text>
          )}

          {/* OK button for error state */}
          {status === ESPClaimStatus.failed && (
            <Button
              label={t("common.ok") || "OK"}
              onPress={handleOkPress}
              style={{
                ...globalStyles.btn,
                ...globalStyles.bgBlue,
                marginTop: tokens.spacing._30,
              }}
              qaId="button_claiming_ok"
            />
          )}
        </View>
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
  },
  iconContainer: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: tokens.spacing._30,
  },
  progressText: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginBottom: tokens.spacing._10,
  },
  errorText: {
    color: tokens.colors.red,
  },
  errorDetail: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.gray,
    textAlign: "center",
    marginTop: tokens.spacing._10,
  },
  subtitle: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.gray,
    textAlign: "center",
  },
});

export default ClaimingScreen;
