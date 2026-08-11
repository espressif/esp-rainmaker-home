/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { useWifiStorage } from "./useWifiStorage";
import { ESPCDFProvisioningDevice } from "@store";
import type { WifiNetwork } from "@src/types/global";
import { isAIAgentFromAdvertisement } from "@shared/utils/device";
import { getAgentTermsAccepted } from "@features/agent/utils/storage";
import StorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";

const LAST_USED_WIFI_KEY = "@wifi_last_used_ssid";

interface UseWifiReturn {
  wifiList: WifiNetwork[];
  selectedWifi: string;
  lastUsedSsid: string;
  password: string;
  isLoading: boolean;
  showPassword: boolean;
  shouldSave: boolean;
  isModalVisible: boolean;
  showAgentTerms: boolean;
  isJoinNetworkModalVisible: boolean;
  setSelectedWifi: (ssid: string) => void;
  setPassword: (password: string) => void;
  setShowPassword: (show: boolean) => void;
  setShouldSave: (save: boolean) => void;
  setIsModalVisible: (visible: boolean) => void;
  setShowAgentTerms: (show: boolean) => void;
  setIsJoinNetworkModalVisible: (visible: boolean) => void;
  scanWifiNetworks: () => Promise<void>;
  handleConnect: () => Promise<void>;
  handleWifiSelect: (ssid: string) => void;
  handleAgentTermsComplete: () => void;
  handleAgentTermsClose: () => void;
  handleJoinOtherNetworkConnect: (ssid: string, password: string) => Promise<void>;
}

/**
 * Custom hook for Wifi screen business logic
 */
export const useWifi = (): UseWifiReturn => {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { store } = useCDF();
  const { getNetworkPassword } = useWifiStorage();

  const [wifiList, setWifiList] = useState<WifiNetwork[]>([]);
  const [selectedWifi, setSelectedWifi] = useState("");
  const [lastUsedSsid, setLastUsedSsid] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shouldSave, setShouldSave] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showAgentTerms, setShowAgentTerms] = useState(false);
  const [isJoinNetworkModalVisible, setIsJoinNetworkModalVisible] = useState(false);

  const user = store?.userStore?.user;
  const device: ESPCDFProvisioningDevice = store?.nodeStore?.connectedDevice as ESPCDFProvisioningDevice;

  /**
   * Check if device is an AI Agent based on advertisement data
   */
  const isAIAgentDevice = (): boolean => {
    const deviceAny = device as any;
    return isAIAgentFromAdvertisement(deviceAny?.advertisementData);
  };

  useEffect(() => {
    scanWifiNetworks();

    if (isAIAgentDevice()) {
      const termsAccepted = user ? getAgentTermsAccepted(user) : null;
      if (!termsAccepted) {
        setShowAgentTerms(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []);

  // Only load/clear password when user selects a *different* network.
  // Don't depend on getNetworkPassword — it gets a new reference when storage loads
  // and would re-run this effect, clearing the field while the user is typing.
  const prevSelectedWifiRef = useRef<string>("");
  useEffect(() => {
    if (!selectedWifi) {
      prevSelectedWifiRef.current = "";
      return;
    }
    if (prevSelectedWifiRef.current === selectedWifi) {
      return;
    }
    prevSelectedWifiRef.current = selectedWifi;
    const savedPassword = getNetworkPassword(selectedWifi);
    if (savedPassword) {
      setPassword(savedPassword);
    } else {
      setPassword("");
    }
    // Save WiFi by default
    setShouldSave(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [selectedWifi]);

  /**
   * Scan for available WiFi networks
   */
  const scanWifiNetworks = async () => {
    try {
      setIsLoading(true);
      const storedLastUsedSsid = await StorageAdapter.getItem(
        LAST_USED_WIFI_KEY
      );
      setLastUsedSsid(storedLastUsedSsid || "");
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
      validNetworks.sort((a, b) => {
        const aIsLastUsed = !!storedLastUsedSsid && a.ssid === storedLastUsedSsid;
        const bIsLastUsed = !!storedLastUsedSsid && b.ssid === storedLastUsedSsid;

        if (aIsLastUsed !== bIsLastUsed) {
          return aIsLastUsed ? -1 : 1;
        }

        return b.rssi - a.rssi;
      });
      setWifiList(validNetworks);
      setIsModalVisible(true);
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

    if (isSecureNetwork && !password) {
      toast.showError(t("device.errors.invalidCredentials"));
      return;
    }

    await StorageAdapter.setItem(LAST_USED_WIFI_KEY, selectedWifi);
    setLastUsedSsid(selectedWifi);

    // Stored only once the device accepts them, so the choice travels onward.
    router.push({
      pathname: "/(provision)/Provision",
      params: {
        ssid: selectedWifi,
        password: password || "",
        shouldSave: shouldSave ? "1" : "0",
      },
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
   * Handle a manual network connection from the Join Other Network modal.
   * @param ssid - The SSID entered by the user.
   * @param password - Password entered by the user (empty string for open networks).
   */
  const handleJoinOtherNetworkConnect = async (ssid: string, password: string) => {
    setIsJoinNetworkModalVisible(false);
    router.push({
      pathname: "/(provision)/Provision",
      params: { ssid, password },
    });
  };

  /**
   * Handle agent terms completion
   */
  const handleAgentTermsComplete = () => {
    setShowAgentTerms(false);
  };

  /**
   * Handle agent terms close
   */
  const handleAgentTermsClose = () => {
    setShowAgentTerms(false);
    if (device) {
      device.disconnect();
      store.nodeStore.connectedDevice = null;
    }
    router.back();
  };

  return {
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
    setSelectedWifi,
    setPassword,
    setShowPassword,
    setShouldSave,
    setIsModalVisible,
    setShowAgentTerms,
    setIsJoinNetworkModalVisible,
    scanWifiNetworks,
    handleConnect,
    handleWifiSelect,
    handleJoinOtherNetworkConnect,
    handleAgentTermsComplete,
    handleAgentTermsClose,
  };
};
