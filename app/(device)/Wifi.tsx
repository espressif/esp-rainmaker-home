/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";

// Styles and Theme
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK and Types
import { ESPDevice } from "@espressif/rainmaker-base-sdk";
import type {
  WifiNetwork,
  WifiItemProps,
  NetworkListModalProps,
} from "@/types/global";

// Hooks
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
import { useWifiStorage } from "@/hooks/useWifiStorage";

// Icons
import {
  ChevronDown,
  Wifi as WifiIcon,
  Eye,
  EyeOff,
  Lock,
  RotateCcw,
} from "lucide-react-native";

// Components
import { Header, ScreenWrapper, Button, AgentTermsBottomSheet } from "@/components";
import { Checkbox } from "react-native-paper";
import { testProps } from "@/utils/testProps";
import { getAgentTermsAccepted } from "@/utils/agent/storage";
import { isAIAgentFromAdvertisement } from "@/utils/device";

// Helpers
const createNetworkKey = (
  ssid: string,
  rssi: number,
  index: number
): string => {
  return `${ssid}-${rssi}-${index}`;
};

const getSignalStrength = (
  rssi: number,
  t: TFunction
): { text: string; color: string; strength: number } => {
  if (rssi >= -50)
    return {
      text: t("device.wifi.signalStrength.excellent"),
      color: tokens.colors.green,
      strength: 4,
    };
  if (rssi >= -60)
    return {
      text: t("device.wifi.signalStrength.good"),
      color: tokens.colors.green,
      strength: 3,
    };
  if (rssi >= -70)
    return {
      text: t("device.wifi.signalStrength.fair"),
      color: tokens.colors.green,
      strength: 2,
    };
  return {
    text: t("device.wifi.signalStrength.weak"),
    color: tokens.colors.green,
    strength: 1,
  };
};

// Helper function to calculate opacity
const getOpacityFromStrength = (strength: number): number => {
  // Map strength levels to opacity:
  // 4 -> 1.0 (100%)
  // 3 -> 0.88 (88%)
  // 2 -> 0.77 (77%)
  // 1 -> 0.65 (65%)
  return 0.65 + (strength - 1) * 0.117;
};

// Sub-Components
const WifiItem: React.FC<WifiItemProps> = ({ item, onSelect }) => {
  const { t } = useTranslation();
  const signalInfo = getSignalStrength(item.rssi, t);

  return (
    <TouchableOpacity
      style={[globalStyles.settingsItem]}
      {...testProps("wifi_item")}
      onPress={() => onSelect(item.ssid)}
    >
      <View style={globalStyles.settingsItemLeft} {...testProps("view_wifi")}>
        <WifiIcon
          {...testProps("icon_wifi_strength")}
          size={20}
          color={signalInfo.color}
          style={{
            ...globalStyles.settingsItemIcon,
            opacity: getOpacityFromStrength(signalInfo.strength),
          }}
        />
        <View style={{ flex: 1 }} {...testProps("view_wifi")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} {...testProps("view_wifi")}>
            {item.secure && <Lock {...testProps("icon_lock")} size={14} color={tokens.colors.gray} />}
            <Text style={globalStyles.settingsItemText} {...testProps("text_ssid")}>{item.ssid}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const NetworkListModal: React.FC<NetworkListModalProps> = ({
  visible,
  onClose,
  wifiList,
  onSelect,
  isLoading,
  onRefresh,
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      {...testProps("modal_wifi")}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        {...testProps("button_close_wifi")}
        onPress={onClose}
      >
        <View style={styles.modalContent} {...testProps("view_wifi")}>
          <View style={styles.modalHandle} {...testProps("view_wifi")} />

          <View style={styles.modalHeader} {...testProps("view_wifi")}>
            <Text style={styles.modalTitle} {...testProps("text_title_wifi")}>
              {t("device.wifi.availableNetworks")}
            </Text>
            <View style={styles.modalActions} {...testProps("view_wifi")}>
              {isLoading ? (
                <ActivityIndicator color={tokens.colors.primary} />
              ) : (
                <TouchableOpacity
                  onPress={onRefresh}
                  {...testProps("button_refresh_wifi")}
                  style={styles.refreshButton}
                >
                  <RotateCcw size={16} color={tokens.colors.primary} />
                  <Text style={styles.refreshText} {...testProps("text_refresh_wifi")}>
                    {t("layout.shared.refresh")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <FlatList
            data={wifiList}
            renderItem={({ item, index }) => (
              <WifiItem item={item} onSelect={onSelect} index={index} />
            )}
            keyExtractor={(item, index) =>
              createNetworkKey(item.ssid, item.rssi, index)
            }
            ItemSeparatorComponent={() => (
              <View style={globalStyles.settingsItemSeparator} {...testProps("view_wifi")}/>
            )}
            style={styles.wifiList}
            contentContainerStyle={styles.wifiListContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

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
  const toast = useToast();
  const router = useRouter();
  const { store } = useCDF();
  const { saveNetwork, getNetworkPassword } = useWifiStorage();

  // State
  const [wifiList, setWifiList] = useState<WifiNetwork[]>([]);
  const [selectedWifi, setSelectedWifi] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shouldSave, setShouldSave] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showAgentTerms, setShowAgentTerms] = useState(false);

  // Device reference
  const device: ESPDevice = store.nodeStore.connectedDevice;

  /**
   * Check if device is an AI Agent based on advertisement data (QR flow only)
   * Note: BLE flow handles terms in ScanBLE.tsx before reaching this screen
   */
  const isAIAgentDevice = (): boolean => {
    const deviceAny = device as any;
    return isAIAgentFromAdvertisement(deviceAny?.advertisementData);
  };

  useEffect(() => {
    scanWifiNetworks();
    
    // Check if this is an AI Agent device and terms are not accepted
    if (isAIAgentDevice()) {
      const termsAccepted = getAgentTermsAccepted(store.userStore);
      if (!termsAccepted) {
        setShowAgentTerms(true);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedWifi) {
      const savedPassword = getNetworkPassword(selectedWifi);
      if (savedPassword) {
        setPassword(savedPassword);
        setShouldSave(true);
      } else {
        setPassword("");
        setShouldSave(false);
      }
    }
  }, [selectedWifi]);

  /**
   * Scan for available WiFi networks
   */
  const scanWifiNetworks = async () => {
    try {
      setIsLoading(true);
      const networks = await device.scanWifiList();
      const validNetworks = networks
        .filter((network) => network.ssid && network.ssid.trim().length > 0)
        .map(
          (network: any): WifiNetwork => ({
            ssid: network.ssid,
            rssi: network.rssi,
            secure: network.secure,
          })
        );
      validNetworks.sort((a, b) => b.rssi - a.rssi);
      setWifiList(validNetworks);
    } catch (error) {
      console.error("Error scanning networks:", error);
      toast.showError(t("device.errors.failedToScanNetworks"));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle WiFi connection
   */
  const handleConnect = async () => {
    if (!selectedWifi) {
      toast.showError(t("device.errors.invalidCredentials"));
      return;
    }

    const selectedNetwork = wifiList.find(
      (network) => network.ssid === selectedWifi
    );
    const isSecureNetwork = selectedNetwork?.secure;

    // For secure networks, password is required
    if (isSecureNetwork && !password) {
      toast.showError(t("device.errors.invalidCredentials"));
      return;
    }

    // Only save network if it has a password and user wants to save
    if (shouldSave && password) {
      await saveNetwork(selectedWifi, password);
    }

    router.push({
      pathname: "/(device)/Provision",
      params: { ssid: selectedWifi, password: password || "" },
    });
  };

  /**
   * Handle WiFi network selection
   */
  const handleWifiSelect = (ssid: string) => {
    setSelectedWifi(ssid);
    setIsModalVisible(false);
  };

  /**
   * Handle agent terms completion - user accepted terms
   */
  const handleAgentTermsComplete = () => {
    setShowAgentTerms(false);
  };

  /**
   * Handle agent terms close - user declined, go back
   */
  const handleAgentTermsClose = () => {
    setShowAgentTerms(false);
    // Disconnect device and go back
    if (device) {
      device.disconnect();
      store.nodeStore.connectedDevice = null;
    }
    router.back();
  };

  // Render Methods
  const renderNetworkSelection = () => (
    <TouchableOpacity
      style={[
        styles.input,
        { borderRadius: tokens.radius.md },
        globalStyles.shadowElevationForLightTheme,
      ]}
      {...testProps("button_select_network_wifi")}
      onPress={() => setIsModalVisible(true)}
    >
      <Text
        style={
          selectedWifi ? globalStyles.settingsItemText : globalStyles.textGray
        }
        {...testProps("text_selected_wifi")}
      >
        {selectedWifi || t("device.wifi.selectNetwork")}
      </Text>
      <ChevronDown size={20} color={tokens.colors.gray} />
    </TouchableOpacity>
  );

  /**
   * Render the password input
   * @returns
   */
  const renderPasswordInput = () => {
    if (!selectedWifi) return null;

    const selectedNetwork = wifiList.find(
      (network) => network.ssid === selectedWifi
    );
    const isSecureNetwork = selectedNetwork?.secure;

    // Only show password input for secure networks
    if (!isSecureNetwork) return null;

    return (
      <View style={styles.passwordSection} {...testProps("view_wifi")}>
        <TextInput
          style={[
            styles.input,
            { borderRadius: tokens.radius.md },
            globalStyles.shadowElevationForLightTheme,
            globalStyles.settingsItemText,
          ]}
          placeholder={t("device.wifi.password")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          {...testProps("input_password")}
        />
        <TouchableOpacity
          style={styles.eyeIcon}
          {...testProps("button_show_password_wifi")}
          onPress={() => setShowPassword(!showPassword)}
        >
          {showPassword ? (
            <Eye size={20} color={tokens.colors.gray} />
          ) : (
            <EyeOff size={20} color={tokens.colors.gray} />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  /**
   * Render the connect button
   * @returns
   */
  const renderConnectButton = () => {
    const selectedNetwork = wifiList.find(
      (network) => network.ssid === selectedWifi
    );
    const isSecureNetwork = selectedNetwork?.secure;
    // Only disable if no network is selected, or if it's a secure network without password
    const isDisabled = !selectedWifi || (isSecureNetwork && !password);

    return (
      <Button
        label={t("device.wifi.connect")}
        onPress={handleConnect}
        disabled={isDisabled}
        style={{
          ...globalStyles.btn,
          ...globalStyles.bgBlue,
          ...globalStyles.shadowElevationForLightTheme,
        }}
        qaId="button_connect_wifi"
      />
    );
  };

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
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.imageContainer} {...testProps("view_wifi")}>
              <Image
                source={require("../../assets/images/wifi.png")}
                style={styles.networkImage}
                resizeMode="contain"
                {...testProps("image_wifi")}
              />
            </View>

            <View style={styles.formContainer} {...testProps("view_wifi")}>
              {renderNetworkSelection()}
              {renderPasswordInput()}
              {/* Only show save option for secure networks with passwords */}
              {selectedWifi &&
                wifiList.find((n) => n.ssid === selectedWifi)?.secure && (
                  <View style={styles.saveWifi} {...testProps("view_wifi")}>
                    <Checkbox.Android
                      {...testProps("checkbox_save_network_wifi")}
                      status={shouldSave ? "checked" : "unchecked"}
                      onPress={() => setShouldSave(!shouldSave)}
                      color={tokens.colors.primary}
                      uncheckedColor={tokens.colors.gray}
                    />
                    <Text style={styles.saveText} {...testProps("text_save_network_wifi")}>
                      {t("device.wifi.saveNetwork")}
                    </Text>
                  </View>
                )}

              {renderConnectButton()}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <NetworkListModal
          visible={isModalVisible}
          onClose={() => setIsModalVisible(false)}
          wifiList={wifiList}
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
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    paddingHorizontal: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.bg2,
  },
  inputWrapper: {
    position: "relative",
    width: "100%",
  },
  eyeIcon: {
    position: "absolute",
    right: tokens.spacing._15,
    top: "50%",
    transform: [{ translateY: -10 }],
  },
  button: {
    height: 48,
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginTop: tokens.spacing._20,
  },
  buttonDisabled: {
    borderColor: tokens.colors.bg2,
    opacity: 0.5,
  },
  buttonText: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: tokens.spacing._10,
    maxHeight: "80%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: tokens.spacing._15,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: tokens.spacing._20,
    paddingBottom: tokens.spacing._15,
  },
  modalTitle: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
  },
  refreshText: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },
  wifiList: {
    maxHeight: "100%",
  },
  wifiListContent: {
    paddingHorizontal: tokens.spacing._20,
    paddingBottom: tokens.spacing._20,
  },
  passwordSection: {
    width: "100%",
    gap: tokens.spacing._10,
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
  networkHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  networkInfo: {
    flex: 1,
  },
  networkItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: tokens.spacing._15,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg2,
  },
  selectedNetwork: {
    backgroundColor: tokens.colors.bg1,
  },
});

export default Wifi;
