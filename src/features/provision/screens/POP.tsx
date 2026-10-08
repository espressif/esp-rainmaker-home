/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { usePOP } from "@features/provision/hooks";

// Components
import { ScreenWrapper, Header, Input, Button } from "@shared/components";

// Assets
import POPCODE_Image from "@assets/images/popcode.png";

// Utils
import { testProps } from "@shared/utils/testProps";

/**
 * POPScreen component for device Proof of Possession code input.
 *
 * This component displays a screen for entering the POP code that comes with the device.
 * The POP code is typically printed on the device or included in the device packaging.
 */
const POPScreen = () => {
  const { t } = useTranslation();
  const { popCode, isLoading, setPopCode, handleVerify } = usePOP();

  return (
    <>
      <Header showBack label={t("device.pop.title")} qaId="header_pop" />
      <ScreenWrapper
        style={{
          ...globalStyles.screenWrapper,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_pop"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            {...testProps("scroll_pop")}
            contentContainerStyle={globalStyles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
          >
            <View
              {...testProps("view_image_pop")}
              style={styles.imageContainer}
            >
              <Image
                {...testProps("image_pop")}
                source={POPCODE_Image}
                style={styles.popcodeImage}
                resizeMode="contain"
              />
            </View>

            <Text
              {...testProps("text_title_pop")}
              style={[globalStyles.heading, globalStyles.verificationTitle]}
            >
              {t("device.pop.enterCode")}
            </Text>
            <Text
              {...testProps("text_subtitle_pop")}
              style={[
                globalStyles.subHeading,
                globalStyles.verificationSubtitle,
              ]}
            >
              {t("device.pop.description")}
            </Text>

            <View
              {...testProps("view_verification_pop")}
              style={globalStyles.verificationContainer}
            >
              {/* POP Code Input */}
              <Input
                initialValue={popCode}
                onFieldChange={(value) => setPopCode(value)}
                style={[
                  globalStyles.verificationInput,
                  globalStyles.shadowElevationForLightTheme,
                ]}
                placeholder={t("device.pop.placeholder")}
                maxLength={8}
                // PoP is case-sensitive for Security2 SRP (e.g. QR `de64a660`).
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (!isLoading) {
                    void handleVerify();
                  }
                }}
                qaId="pop_code"
              />
            </View>

            {/* Verify Button */}
            <Button
              label={t("device.pop.verify")}
              onPress={handleVerify}
              style={{
                ...globalStyles.btn,
                ...globalStyles.bgBlue,
                ...globalStyles.shadowElevationForLightTheme,
              }}
              disabled={isLoading}
              isLoading={isLoading}
              qaId="button_verify_pop"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenWrapper>
    </>
  );
};

export default POPScreen;

const styles = StyleSheet.create({
  imageContainer: {
    width: "100%",
    height: 160,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: tokens.spacing._20,
  },
  popcodeImage: {
    width: 160,
    height: 160,
  },
});
