/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { ArrowRight, Copy } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "tamagui";

import type { DeploymentTrustPrompt } from "@features/config/hooks/useDeploymentTrust";
import rainmakerClassic from "@assets/images/rainmaker-classic.png";
import rainmakerNeo from "@assets/images/rainmaker-neo.png";
import { isRmneoStackSdkId } from "@config/sdk.identifiers";
import { useToast } from "@shared/hooks/useToast";
import { tokens } from "@shared/theme/tokens";
import {
  DEPLOYMENT_TRUST_ICON_SIZE,
  DEPLOYMENT_TRUST_SHEET_HEIGHT_RATIO,
} from "@shared/utils/constants";
import { testProps } from "@shared/utils/testProps";

/** Props for {@link DeploymentTrustDialog}. */
interface DeploymentTrustDialogProps {
  /** Dialog state; the dialog is visible while this is not null. */
  prompt: DeploymentTrustPrompt | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Bottom sheet asking whether to trust a scanned or uploaded deployment; shows its
 * SDK logo, brand and API URL. Trust is disabled while the brand is loading.
 */
export function DeploymentTrustDialog({
  prompt,
  onConfirm,
  onCancel,
}: DeploymentTrustDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const sheetHeight =
    Dimensions.get("window").height * DEPLOYMENT_TRUST_SHEET_HEIGHT_RATIO;

  const isLoading = prompt?.loading === true;
  const sdkLogo = prompt && isRmneoStackSdkId(prompt.sdk) ? rainmakerNeo : rainmakerClassic;
  const brand = prompt?.brand ?? null;

  const handleCopyUrl = useCallback(async () => {
    if (!prompt?.apiUrl) return;
    try {
      await Clipboard.setStringAsync(prompt.apiUrl);
      toast.showSuccess(t("layout.shared.copiedToClipboard"));
    } catch {
      toast.showError(t("layout.shared.copyFailed"));
    }
  }, [prompt?.apiUrl, t, toast]);

  return (
    <Modal
      {...testProps("dialog_deployment_trust")}
      visible={prompt !== null}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          {...testProps("button_deployment_trust_backdrop")}
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
        />
        <View
          {...testProps("view_deployment_trust_sheet")}
          style={[
            styles.sheet,
            { height: sheetHeight, paddingBottom: insets.bottom + tokens.spacing._20 },
          ]}
        >
          <View style={styles.handle} />

          <ScrollView
            {...testProps("scroll_deployment_trust")}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text {...testProps("text_title_deployment_trust")} style={styles.title}>
              {t("config.scan.trustTitle")}
            </Text>

            {prompt ? (
              <View
                {...testProps("view_deployment_trust_icons")}
                style={styles.iconsBlock}
              >
                <View style={styles.iconsRow}>
                  <Image
                    {...testProps("image_deployment_trust_sdk")}
                    source={sdkLogo}
                    style={styles.icon}
                    resizeMode="contain"
                    accessibilityLabel={
                      isRmneoStackSdkId(prompt.sdk)
                        ? t("landing.neo.title")
                        : t("landing.classic.title")
                    }
                  />
                  {isLoading ? (
                    <>
                      <ArrowRight
                        size={tokens.iconSize._20}
                        color={tokens.colors.gray}
                        accessibilityLabel={t("config.scan.trustLogoArrow")}
                      />
                      <View
                        {...testProps("view_deployment_trust_brand_loading")}
                        style={[styles.icon, styles.iconLoading]}
                      >
                        <ActivityIndicator
                          size="small"
                          color={tokens.colors.primary}
                        />
                      </View>
                    </>
                  ) : brand ? (
                    <>
                      <ArrowRight
                        size={tokens.iconSize._20}
                        color={tokens.colors.gray}
                        accessibilityLabel={t("config.scan.trustLogoArrow")}
                      />
                      {brand.logoUrl ? (
                        <Image
                          {...testProps("image_deployment_trust_brand")}
                          source={{ uri: brand.logoUrl }}
                          style={styles.icon}
                          resizeMode="contain"
                          accessibilityLabel={brand.brandName}
                        />
                      ) : (
                        <View
                          {...testProps("view_deployment_trust_brand_placeholder")}
                          style={[styles.icon, styles.iconPlaceholder]}
                        >
                          <Text style={styles.iconPlaceholderText} numberOfLines={2}>
                            {brand.brandName}
                          </Text>
                        </View>
                      )}
                    </>
                  ) : null}
                </View>
                {isLoading ? (
                  <Text
                    {...testProps("text_deployment_trust_loading")}
                    style={styles.loadingLabel}
                  >
                    {t("config.scan.trustLoading")}
                  </Text>
                ) : brand ? (
                  <Text
                    {...testProps("text_deployment_trust_name")}
                    style={styles.brandName}
                  >
                    {brand.brandName}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {prompt?.apiUrl ? (
              <View {...testProps("view_deployment_trust_api")} style={styles.apiBox}>
                <View style={styles.apiHeader}>
                  <Text style={styles.apiLabel}>{t("config.scan.trustApiLabel")}</Text>
                  <Pressable
                    {...testProps("button_deployment_trust_copy_url")}
                    onPress={handleCopyUrl}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("config.scan.trustCopyUrl")}
                  >
                    <Copy size={tokens.iconSize._15} color={tokens.colors.primary} />
                  </Pressable>
                </View>
                <Text
                  {...testProps("text_deployment_trust_api")}
                  style={styles.apiUrl}
                  selectable
                >
                  {prompt.apiUrl}
                </Text>
              </View>
            ) : null}

            <View {...testProps("view_deployment_trust_warning")} style={styles.warningBox}>
              <Text
                {...testProps("text_description_deployment_trust")}
                style={styles.warningText}
              >
                {brand
                  ? t("config.scan.trustDescriptionBranded", { appName: brand.brandName })
                  : t("config.scan.trustDescription")}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button
              {...testProps("button_cancel_dialog")}
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text {...testProps("text_label_cancel")} style={styles.buttonText}>
                {t("layout.shared.cancel")}
              </Text>
            </Button>
            <View style={styles.actionGap} />
            <Button
              {...testProps("button_confirm_dialog")}
              style={[styles.button, styles.confirmButton]}
              onPress={onConfirm}
              disabled={isLoading}
              opacity={isLoading ? 0.5 : 1}
            >
              <Text
                {...testProps("text_label_confirm")}
                style={[styles.buttonText, styles.confirmLabel]}
              >
                {t("config.scan.trustConfirm")}
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: tokens.spacing._20,
    paddingTop: tokens.spacing._10,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: tokens.spacing._10,
  },
  title: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginBottom: tokens.spacing._20,
  },
  iconsBlock: {
    alignItems: "center",
    marginBottom: tokens.spacing._20,
  },
  iconsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
  },
  icon: {
    width: DEPLOYMENT_TRUST_ICON_SIZE,
    height: DEPLOYMENT_TRUST_ICON_SIZE,
  },
  iconLoading: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colors.bg5,
    borderRadius: tokens.radius.sm,
  },
  iconPlaceholder: {
    justifyContent: "center",
    paddingHorizontal: tokens.spacing._10,
    backgroundColor: tokens.colors.bg5,
    borderRadius: tokens.radius.sm,
  },
  iconPlaceholderText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
  },
  loadingLabel: {
    marginTop: tokens.spacing._10,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    textAlign: "center",
  },
  brandName: {
    marginTop: tokens.spacing._10,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
    paddingHorizontal: tokens.spacing._20,
  },
  apiBox: {
    backgroundColor: tokens.colors.bg5,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._15,
    marginBottom: tokens.spacing._20,
  },
  apiHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacing._5,
  },
  apiLabel: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_secondary,
  },
  apiUrl: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },
  warningBox: {
    backgroundColor: tokens.colors.warnBg,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing._20,
    marginBottom: tokens.spacing._10,
  },
  warningText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.warn,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    paddingTop: tokens.spacing._10,
  },
  actionGap: {
    width: 10,
  },
  button: {
    flex: 1,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: tokens.colors.bg2,
  },
  confirmButton: {
    backgroundColor: tokens.colors.primary,
  },
  buttonText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    textAlign: "center",
  },
  confirmLabel: {
    color: tokens.colors.white,
  },
});
