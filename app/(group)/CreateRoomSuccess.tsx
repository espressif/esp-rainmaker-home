/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, StyleSheet, Pressable, Image } from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Hooks
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

// Components
import { ScreenWrapper } from "@/components";

/**
 * CreateRoomSuccess Component
 *
 * Success screen shown after successfully creating a room.
 * Features:
 * - Shows success message and illustration
 * - Provides a done button to return to room management
 * - Handles navigation back to room management
 */
const CreateRoomSuccess = () => {
  // Hooks
  const { t } = useTranslation();
  const { id, updated = false } = useLocalSearchParams();
  const router = useRouter();

  /**
   * Handles the done button press
   * Dismisses the current screen and navigates back to room management
   */
  const handleDone = () => {
    router.dismissTo({
      pathname: "/(group)/Rooms",
      params: { id: id },
    });
  };

  // Render
  return (
    <>
      <ScreenWrapper style={styles.container}>
        <View style={styles.content}>
          <Image
            source={require("@/assets/images/success.png")}
            style={styles.illustration}
            resizeMode="contain"
          />

          <Text style={styles.title}>{t("group.createRoomSuccess.title")}</Text>
          {updated && (
            <Text style={styles.subtitle}>
              {t("group.createRoomSuccess.roomUpdatedSuccessfully")}
            </Text>
          )}
          {/* Done button */}
          <Pressable
            style={[
              globalStyles.btn,
              globalStyles.bgBlue,
              styles.button,
              styles.buttonSpacing,
            ]}
            onPress={handleDone}
          >
            <Text style={[globalStyles.fontMedium, globalStyles.textWhite]}>
              {t("group.createRoomSuccess.done")}
            </Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.white,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing._20,
  },
  illustration: {
    width: 120,
    height: 120,
    marginBottom: tokens.spacing._10,
  },
  title: {
    ...globalStyles.fontMedium,
    fontSize: 18,
    color: tokens.colors.black,
    textAlign: "center",
    marginBottom: tokens.spacing._10,
  },
  subtitle: {
    ...globalStyles.fontRegular,
    textAlign: "center",
    color: tokens.colors.gray,
    marginBottom: tokens.spacing._30,
  },
  button: {
    width: "100%",
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonSpacing: {
    marginTop: tokens.spacing._10,
  },
});

export default CreateRoomSuccess;
