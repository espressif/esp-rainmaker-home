/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Icons
import { UserRound } from "lucide-react-native";

// Hooks
import { useCDF } from "@/hooks/useCDF";
import { useRouter, useSegments } from "expo-router";
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

// Components
import { ScreenWrapper, Button, Input } from "@/components";
import { testProps } from "@/utils/testProps";

// Utils
import { updateUserProfile } from "@/utils/apiHelper";
import { setAgentTermsAccepted } from "@/utils/agent/storage";

/**
 * AgentTerms component that displays a nickname form for Agent service
 *
 * This component appears after successful login when getUserProfile() returns 404.
 * Users can add a nickname or skip (using "Anonymous" as default).
 * Terms are accepted by default.
 */
export default function AgentTermsScreen() {
  const { store } = useCDF();
  const router = useRouter();
  const segments = useSegments();
  const toast = useToast();
  const { t } = useTranslation();

  // Check if coming from User screen (re-enable flow)
  const isReEnableFlow =
    Array.isArray(segments) &&
    segments.some((segment: string) => segment.includes("(user)"));

  const [isLoading, setIsLoading] = useState(false);
  const [nickname, setNickname] = useState("");
  const [isNicknameValid, setIsNicknameValid] = useState(false);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(80)).current;

  // Initialize nickname from userInfo if available
  useEffect(() => {
    const userInfo = store?.userStore?.userInfo;
    if (userInfo?.name) {
      setNickname(userInfo.name);
      setIsNicknameValid(true);
    }
  }, [store]);

  useEffect(() => {
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -10,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    bounceLoop.start();

    return () => bounceLoop.stop();
  }, [bounceAnim]);

  useEffect(() => {
    Animated.timing(sheetTranslateY, {
      toValue: 0,
      duration: 450,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [sheetTranslateY]);

  /**
   * Validates nickname input
   */
  const nicknameValidator = (
    value: string
  ): { isValid: boolean; error?: string } => {
    if (!value.trim()) {
      return { isValid: false };
    }
    if (value.trim().length < 2) {
      return {
        isValid: false,
        error: "Name must be at least 2 characters",
      };
    }
    if (value.trim().length > 30) {
      return {
        isValid: false,
        error: "Name must be less than 30 characters",
      };
    }
    return { isValid: true };
  };

  /**
   * Handles nickname input change
   */
  const handleNicknameChange = (value: string, isValid: boolean) => {
    setNickname(value);
    setIsNicknameValid(isValid);
  };

  /**
   * Common function to save nickname and navigate
   */
  const saveAndNavigate = async (finalNickname: string) => {
    setIsLoading(true);

    try {
      const userInfo = store?.userStore?.userInfo;
      const email = userInfo?.username || "";

      // Update user profile via API
      await updateUserProfile({
        email,
        name: finalNickname,
      });

      // Also update nickname in userStore
      if (store.userStore.user && finalNickname !== "Anonymous") {
        await store.userStore.user.updateName(finalNickname);
      }

      // Store terms acceptance as true by default
      await setAgentTermsAccepted(store.userStore, true);

      toast.showSuccess(t("auth.agentTerms.profileSavedSuccessfully"));

      // Navigate to Home
      if (isReEnableFlow) {
        router.dismissTo("/(group)/Home");
      } else {
        router.replace("/(group)/Home");
      }
    } catch (error: any) {
      console.error("Failed to save profile:", error);
      toast.showError(
        t("auth.agentTerms.failedToSaveProfile"),
        error.message || t("auth.errors.pleaseTryAgain")
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles Add button press - saves the entered nickname
   */
  const handleAdd = async () => {
    const trimmedNickname = nickname.trim();
    if (trimmedNickname && isNicknameValid) {
      await saveAndNavigate(trimmedNickname);
    }
  };

  /**
   * Handles No button press - uses "Anonymous" as nickname
   */
  const handleSkip = async () => {
    await saveAndNavigate("Anonymous");
  };

  return (
    <ScreenWrapper
      style={styles.screenWrapper}
      excludeTop={false}
      qaId="screen_wrapper_agent_terms"
    >
      <Modal
        visible
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleSkip}
      >
        <View style={[globalStyles.agentTermsOverlay, styles.backdrop]}>
          <View style={styles.container} {...testProps("view_nickname")}>
            <View style={[globalStyles.agentTermsHero, styles.heroContainer]}>
              <Animated.View
                style={[
                  globalStyles.agentTermsHeroBubble,
                  styles.iconBubble,
                  {
                    transform: [
                      {
                        translateY: bounceAnim.interpolate({
                          inputRange: [-10, 0],
                          outputRange: [-2, 0],
                        }),
                      },
                    ],
                  },
                ]}
                accessibilityRole="image"
              >
                <UserRound size={50} color={tokens.colors.primary} />
              </Animated.View>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
              style={[globalStyles.agentTermsSheetWrapper, styles.sheetWrapper]}
            >
              <Animated.View
                style={[
                  globalStyles.agentTermsSheet,
                  styles.bottomSheet,
                  { transform: [{ translateY: sheetTranslateY }] },
                ]}
              >
                <View style={[globalStyles.agentTermsHandle, styles.handle]} />
                <Text style={styles.title}>
                  {t("auth.agentTerms.title")}
                </Text>
                <Text style={styles.subtitle}>
                  {t("auth.agentTerms.subtitle")}
                </Text>

                <View
                  style={styles.inputContainer}
                  {...testProps("view_input_nickname")}
                >
                  <Input
                    icon="person"
                    placeholder={t("auth.agentTerms.placeholder")}
                    initialValue={nickname}
                    onFieldChange={handleNicknameChange}
                    validator={nicknameValidator}
                    validateOnChange={true}
                    debounceDelay={300}
                    maxLength={30}
                    qaId="nickname"
                  />
                </View>

                <View style={styles.buttonContainer}>
                  <Button
                    label={t("auth.agentTerms.skip")}
                    onPress={handleSkip}
                    disabled={isLoading}
                    isLoading={isLoading}
                    style={styles.skipButton}
                    wrapperStyle={styles.buttonWrapper}
                    textStyle={styles.skipButtonText}
                    qaId="button_skip"
                  />
                  <Button
                    label={t("auth.agentTerms.add")}
                    onPress={handleAdd}
                    disabled={isLoading || !isNicknameValid}
                    isLoading={isLoading}
                    style={styles.addButton}
                    wrapperStyle={styles.buttonWrapper}
                    qaId="button_add"
                  />
                </View>
              </Animated.View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  screenWrapper: {
    flex: 1,
    backgroundColor: tokens.colors.bg1,
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  heroContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing._20,
    paddingBottom: tokens.spacing._30,
  },
  iconBubble: {
    width: 70,
    height: 70,
    borderRadius: 70,
    backgroundColor: tokens.colors.bg2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: tokens.colors.primary,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 6,
  },
  sheetWrapper: {
    flexGrow: 0,
    justifyContent: "flex-end",
  },
  bottomSheet: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: tokens.spacing._20,
    paddingTop: tokens.spacing._15,
    paddingBottom: tokens.spacing._30,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 10,
  },
  handle: {
    width: 48,
    height: 5,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: tokens.spacing._15,
  },
  title: {
    fontSize: tokens.fontSize.xl,
    fontWeight: "bold",
    color: tokens.colors.text_primary,
    textAlign: "center",
    lineHeight: 26,
  },
  subtitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    marginTop: tokens.spacing._20,
    marginBottom: tokens.spacing._20,
    textAlign: "center",
  },
  inputContainer: {
    marginTop: tokens.spacing._10,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: tokens.spacing._15,
    marginTop: tokens.spacing._20,
  },
  buttonWrapper: {
    flex: 1,
  },
  addButton: {
    // Primary button style - uses default
  },
  skipButton: {
    backgroundColor: tokens.colors.bg2,
  },
  skipButtonText: {
    color: tokens.colors.text_primary,
  },
});
