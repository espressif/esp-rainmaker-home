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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react-native";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Components
import { ScreenWrapper, Header, Input, Button } from "@shared/components";

// Hooks
import { useManualCommissioning } from "@features/matter/hooks/useManualCommissioning";

// Constants
import { MATTER_MANUAL_PAIRING_CODE_MAX_INPUT_LENGTH } from "@features/matter/constants";

// Utils
import { testProps } from "@shared/utils/testProps";

/**
 * Key artwork box. Deliberately smaller than the POP screen's 160x160
 * `popcodeImage`: the key is a single-stroke glyph rather than a detailed
 * illustration, so it reads as oversized at that size. Lucide icons scale their
 * stroke with the 24-unit viewBox, so the glyph keeps its proportions here.
 */
const MATTER_MANUAL_ICON_SIZE = 120;

/**
 * Manual Matter commissioning screen.
 *
 * Collects the numeric Matter setup (pairing) code printed on the device and
 * forwards it into the shared commissioning pipeline as the onboarding payload —
 * the QR-free counterpart to scanning an `MT:` code on {@link ScanQR}. All
 * fabric prep and native commissioning happen on `/(matter)/Commissioning`.
 * @returns The manual pairing-code entry UI.
 */
export function ManualCommissioningScreen(): React.ReactElement {
  const { t } = useTranslation();
  const { pairingCode, isValid, setPairingCode, handleContinue } =
    useManualCommissioning();

  return (
    <>
      <Header
        showBack
        label={t("device.matter.manual.title")}
        qaId="header_matter_manual"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.screenWrapper,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_matter_manual"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
        >
          <ScrollView
            {...testProps("scroll_matter_manual")}
            contentContainerStyle={globalStyles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
          >
            <View
              {...testProps("view_icon_matter_manual")}
              style={styles.iconContainer}
            >
              <KeyRound
                size={MATTER_MANUAL_ICON_SIZE}
                color={tokens.colors.primary}
              />
            </View>

            <Text
              {...testProps("text_title_matter_manual")}
              style={[globalStyles.heading, globalStyles.verificationTitle]}
            >
              {t("device.matter.manual.heading")}
            </Text>
            <Text
              {...testProps("text_subtitle_matter_manual")}
              style={[
                globalStyles.subHeading,
                globalStyles.verificationSubtitle,
              ]}
            >
              {t("device.matter.manual.description")}
            </Text>

            <View
              {...testProps("view_input_matter_manual")}
              style={globalStyles.verificationContainer}
            >
              <Input
                initialValue={pairingCode}
                onFieldChange={(value) => setPairingCode(value)}
                style={[
                  globalStyles.verificationInput,
                  globalStyles.shadowElevationForLightTheme,
                ]}
                placeholder={t("device.matter.manual.placeholder")}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={MATTER_MANUAL_PAIRING_CODE_MAX_INPUT_LENGTH}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (isValid) {
                    handleContinue();
                  }
                }}
                qaId="matter_pairing_code"
              />
            </View>

            <Button
              label={t("layout.shared.continue")}
              onPress={handleContinue}
              style={{
                ...globalStyles.btn,
                ...globalStyles.bgBlue,
                ...globalStyles.shadowElevationForLightTheme,
              }}
              disabled={!isValid}
              qaId="button_continue_matter_manual"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenWrapper>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  iconContainer: {
    width: "100%",
    height: MATTER_MANUAL_ICON_SIZE,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: tokens.spacing._20,
  },
});
