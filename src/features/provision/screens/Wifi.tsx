/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableOpacity,
} from "react-native";

// Styles and Theme
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { useWifi } from "@features/provision/hooks";

// Components
import { Header, ScreenWrapper, Button } from "@shared/components";
import { AgentTermsBottomSheet } from "@features/agent/components";
import {
  NetworkListModal,
  WifiNetworkSelection,
  WifiPasswordInput,
  JoinOtherNetworkModal,
} from "@features/provision/components";
import { Checkbox } from "react-native-paper";
import { testProps } from "@shared/utils/testProps";

/**
 * WiFi Configuration Screen
 *
 * Allows users to:
 * 1. Scan and select WiFi networks
 * 2. Enter network password
 * 3. Connect to selected network
 * 4. View network signal strength
 */
const Wifi = () => {
  const { t } = useTranslation();
  const {
    wifiList,
    selectedWifi,
    lastUsedSsid,
    password,
    isLoading,
    showPassword,
    shouldSave,
    isModalVisible,
    showAgentTerms,
    isJoinNetworkModalVisible,
    setPassword,
    setShowPassword,
    setShouldSave,
    setIsModalVisible,
    setIsJoinNetworkModalVisible,
    scanWifiNetworks,
    handleConnect,
    handleWifiSelect,
    handleJoinOtherNetworkConnect,
    handleAgentTermsComplete,
    handleAgentTermsClose,
  } = useWifi();

  // Get selected network info
  const selectedNetwork = wifiList.find(
    (network) => network.ssid === selectedWifi,
  );
  const isSecureNetwork = selectedNetwork?.secure;
  const isConnectDisabled = !selectedWifi || (isSecureNetwork && !password);

  return (
    <>
      <Header label={t("device.wifi.title")} showBack qaId="header_wifi" />
      <ScreenWrapper
        style={{
          ...globalStyles.screenWrapper,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_wifi"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          {...testProps("keyboard_avoiding_view_wifi")}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            {...testProps("scroll_view_wifi")}
          >
            <View style={styles.imageContainer} {...testProps("view_wifi")}>
              <Image
                source={require("@assets/images/wifi.png")}
                style={styles.networkImage}
                resizeMode="contain"
                {...testProps("image_wifi")}
              />
            </View>

            <View style={styles.formContainer} {...testProps("view_wifi")}>
              <WifiNetworkSelection
                selectedWifi={selectedWifi}
                placeholder={t("device.wifi.selectNetwork")}
                onPress={() => setIsModalVisible(true)}
                isLoading={isLoading}
              />

              {selectedWifi && isSecureNetwork && (
                <WifiPasswordInput
                  password={password}
                  showPassword={showPassword}
                  placeholder={t("device.wifi.password")}
                  onChangePassword={setPassword}
                  onToggleShowPassword={() => setShowPassword(!showPassword)}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (!isConnectDisabled) {
                      void handleConnect();
                    }
                  }}
                />
              )}

              {/* Only show save option for secure networks with passwords */}
              {selectedWifi && isSecureNetwork && (
                <View style={styles.saveWifi} {...testProps("view_wifi")}>
                  <Checkbox.Android
                    {...testProps("checkbox_save_network_wifi")}
                    status={shouldSave ? "checked" : "unchecked"}
                    onPress={() => setShouldSave(!shouldSave)}
                    color={tokens.colors.primary}
                    uncheckedColor={tokens.colors.gray}
                  />
                  <Text
                    style={styles.saveText}
                    {...testProps("text_save_network_wifi")}
                  >
                    {t("device.wifi.saveNetwork")}
                  </Text>
                </View>
              )}

              <Button
                label={t("device.wifi.connect")}
                onPress={handleConnect}
                disabled={isConnectDisabled}
                style={{
                  ...globalStyles.btn,
                  ...globalStyles.bgBlue,
                  ...globalStyles.shadowElevationForLightTheme,
                }}
                qaId="button_connect_wifi"
              />

              <TouchableOpacity
                style={[
                  styles.joinOtherNetworkLink,
                  isLoading && styles.joinOtherNetworkLinkDisabled,
                ]}
                onPress={() => {
                  setIsJoinNetworkModalVisible(true);
                }}
                disabled={isLoading}
                accessibilityState={{ disabled: isLoading }}
                {...testProps("button_join_other_network_wifi")}
              >
                <Text style={styles.joinOtherNetworkText}>
                  {t("device.wifi.joinOtherNetworkLink")}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <NetworkListModal
          visible={isModalVisible}
          onClose={() => setIsModalVisible(false)}
          wifiList={wifiList}
          lastUsedSsid={lastUsedSsid}
          onSelect={handleWifiSelect}
          isLoading={isLoading}
          onRefresh={scanWifiNetworks}
        />

        {/* Agent Terms Bottom Sheet - shown for AI Agent devices when user profile not setup */}
        <AgentTermsBottomSheet
          visible={showAgentTerms}
          onClose={handleAgentTermsClose}
          onComplete={handleAgentTermsComplete}
        />

        <JoinOtherNetworkModal
          visible={isJoinNetworkModalVisible}
          onCancel={() => setIsJoinNetworkModalVisible(false)}
          onConnect={handleJoinOtherNetworkConnect}
        />
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    padding: tokens.spacing._20,
  },
  imageContainer: {
    width: "100%",
    height: 160,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: tokens.spacing._20,
  },
  networkImage: {
    width: 160,
    height: 160,
  },
  formContainer: {
    width: "100%",
    gap: tokens.spacing._15,
  },
  saveWifi: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: tokens.spacing._10,
  },
  saveText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_primary,
  },
  joinOtherNetworkLink: {
    alignSelf: "center",
    paddingVertical: tokens.spacing._5,
    paddingHorizontal: tokens.spacing._5,
  },
  joinOtherNetworkText: {
    fontSize: tokens.fontSize._15,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
  },
  joinOtherNetworkLinkDisabled: {
    opacity: 0.5,
  },
});

export default Wifi;
