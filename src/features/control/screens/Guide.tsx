/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import RenderHTML from "react-native-render-html";
import { Header, ScreenWrapper, Button } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { guideScreenStyleSheet } from "@features/control/theme";
import { GuideLoadErrorEmptyState } from "@features/control/components";
import { useGuide } from "@features/control/hooks";

const continueButtonStyle = {
  ...globalStyles.btn,
  ...globalStyles.bgBlue,
  ...globalStyles.shadowElevationForLightTheme,
  ...guideScreenStyleSheet.continueButtonContainer,
};

/**
 * Device guide screen: renders fetched markdown, or a centered empty state when
 * the guide cannot be loaded. In the provision flow, Continue stays pinned at
 * the bottom with the same style for loading, error, and success.
 * @returns Guide screen with header, body, and optional Continue footer
 */
export default function Guide() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    url: string;
    title?: string;
    deviceName?: string;
    fromProvisionFlow?: string;
  }>();
  const {
    isLoading,
    error,
    htmlContent,
    htmlStyles,
    customRenderers,
    renderersProps,
    systemFonts,
    screenWidth,
    handleBackPress: handleNavigationAction,
    fromProvisionFlow,
  } = useGuide();

  return (
    <>
      <Header
        label={params.title || "Guide"}
        showBack={!fromProvisionFlow}
        onBackPress={!fromProvisionFlow ? handleNavigationAction : undefined}
      />

      <ScreenWrapper>
        <View style={guideScreenStyleSheet.contentWrapper}>
          {isLoading ? (
            <View style={globalStyles.chatSettingsCenterContainer}>
              <ActivityIndicator size="large" color={tokens.colors.primary} />
            </View>
          ) : error ? (
            <GuideLoadErrorEmptyState hasFooter={fromProvisionFlow} />
          ) : (
            <ScrollView
              style={guideScreenStyleSheet.scrollView}
              contentContainerStyle={
                fromProvisionFlow
                  ? guideScreenStyleSheet.scrollContentWithBottomPadding
                  : undefined
              }
            >
              <Pressable onPress={() => {}}>
                <RenderHTML
                  contentWidth={screenWidth - 32}
                  source={{ html: htmlContent }}
                  tagsStyles={htmlStyles}
                  renderers={customRenderers}
                  renderersProps={renderersProps}
                  systemFonts={systemFonts}
                  enableExperimentalBRCollapsing={true}
                  enableExperimentalMarginCollapsing={true}
                  baseStyle={{
                    color: tokens.colors.text_primary,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                />
              </Pressable>
            </ScrollView>
          )}

          {fromProvisionFlow && (
            <Button
              label={t("layout.shared.continue")}
              onPress={handleNavigationAction}
              style={continueButtonStyle}
              qaId="button_continue_guide"
            />
          )}
        </View>
      </ScreenWrapper>
    </>
  );
}
