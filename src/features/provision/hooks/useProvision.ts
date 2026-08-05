/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollView, unstable_batchedUpdates } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useCDF } from "@shared/hooks/useCDF";
import { startNodeLocalDiscovery } from "@features/group/utils/localDiscovery";
import { startMatterLocalDiscovery } from "@features/matter/utils/matterLocalDiscovery";
import { useToast } from "@shared/hooks/useToast";
import {
  ESPCDF,
  ESPCDFProvisionResponse,
  ESPCDFProvisionResponseStatus,
  ESPCDFProvProgressMessages,
  ESPCDFProvisioningDevice,
  ESPCDFServiceParam,
  ESPCDFNode,
} from "@store";
import {
  ESPRM_AGENT_AUTH_SERVICE,
  ESPRM_REFRESH_TOKEN_PARAM_TYPE,
} from "@shared/utils/constants";
import { setUserAuthForNode } from "@features/agent/utils/device";
import { TOKEN_STORAGE_KEYS } from "@features/agent/utils";
import {
  ProvisionStage,
  getProvisionStages,
  getChallengeResponseStages,
  getOnNetworkProvisionStages,
  MESSAGE_STAGE_MAP,
  CHAL_RESP_MESSAGE_STAGE_MAP,
  CHAL_RESP_WIFI_STAGE_ID,
  ON_NETWORK_MESSAGE_STAGE_MAP,
  extractErrorMessage,
  getLocalizedErrorMessage,
} from "@features/provision/utils/provisionHelper";
import { takeProvisionTimezoneOutcome } from "@shared/utils/timezone";

interface UseProvisionReturn {
  stages: ProvisionStage[];
  isComplete: boolean;
  stepsScrollViewRef: React.RefObject<ScrollView | null>;
  handleContinue: () => void;
}

/** Same as Home pull-to-refresh: fresh node list + connectivity from cloud, then local discovery. */
async function syncHomeAfterProvision(
  store: ESPCDF | undefined,
  syncHomeWithNodes: (shouldFetchFirstPage?: boolean) => Promise<void>,
): Promise<void> {
  if (!store) return;
  try {
    await syncHomeWithNodes();
    // CDF's mergeLocalTransportFromNodeMap preserves matter_local across the
    // cloud refresh, so the just-commissioned device card stays "available on
    // WLAN" the moment local discovery resolves it — no extra reapply needed.
    startNodeLocalDiscovery(store);
    startMatterLocalDiscovery(store);
  } catch (e) {
    console.error(
      "[Provision] Post-provision syncHomeWithNodes failed (non-blocking):",
      e
    );
  }
}

/**
 * Custom hook for Provision component business logic
 */
export const useProvision = (): UseProvisionReturn => {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const { store, syncHomeWithNodes } = useCDF();
  const { ssid, password } = useLocalSearchParams<{
    ssid?: string;
    password?: string;
  }>();

  // State — always start with the default 5-stage list. The actual flow
  // (chal-resp / on-network / MQTT) is detected inside `startProvisioning`
  // via async device methods, and `setStages` is called once the right
  // branch is known. This mirrors the existing chal-resp pattern instead
  // of reading route params up front.
  const [stages, setStages] = useState<ProvisionStage[]>(() =>
    getProvisionStages(t)
  );
  const [isComplete, setIsComplete] = useState(false);

  // Refs
  const stepsScrollViewRef = useRef<ScrollView>(null);
  const stagesRef = useRef<ProvisionStage[]>(stages);
  const isChallengeResponseFlowRef = useRef(false);
  const isOnNetworkFlowRef = useRef(false);
  const provisionedNodeRef = useRef<ESPCDFNode | null>(null);
  const hasStartedProvisioningRef = useRef(false);

  // Data
  const device: ESPCDFProvisioningDevice = store?.nodeStore?.connectedDevice as ESPCDFProvisioningDevice;
  const onNetworkDeviceInfo = store?.nodeStore?.onNetworkDeviceInfo;
  const onNetworkDevicePop: string | undefined =
    store?.nodeStore?.onNetworkDevicePop;
  const currentHomeId = store?.groupStore?.currentHomeId;
  const user = store?.userStore?.user;

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      stepsScrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  // Mark stages as error helper
  const markStagesAsError = useCallback((
    stages: ProvisionStage[],
    stageId: number,
    errorMessage?: string
  ): ProvisionStage[] => {
    const newStages = [...stages];
    for (let i = stageId - 1; i < newStages.length; i++) {
      const stage = newStages[i];
      if (stage) {
        stage.status = "error";
        stage.error = i === stageId - 1 ? (errorMessage || "An error occurred") : undefined;
      }
    }
    return newStages;
  }, []);

  // Update challenge response stage
  const updateChallengeResponseStage = useCallback((stageId: number, isError?: boolean, errorMessage?: string) => {
    setStages((prevStages) => {
      const newStages = isError
        ? markStagesAsError(prevStages, stageId, errorMessage)
        : [...prevStages];

      if (!isError) {
        const currentStage = newStages[stageId - 1];
        if (currentStage) {
          currentStage.status = "success";
          currentStage.error = undefined;
        }

        if (stageId < 3) {
          const nextStage = newStages[stageId];
          if (nextStage) {
            nextStage.status = "pending";
          }
        }
      }

      stagesRef.current = newStages;
      return newStages;
    });

    scrollToBottom();
  }, [markStagesAsError, scrollToBottom]);

  // Update stage status
  const updateStageStatus = useCallback((message: string, isError?: boolean, errorMessage?: string) => {
    const stageId = MESSAGE_STAGE_MAP[message];

    if (!stageId) return;

    setStages((prevStages) => {
      const newStages = isError
        ? markStagesAsError(prevStages, stageId, errorMessage || message)
        : [...prevStages];

      if (!isError) {
        const currentStage = newStages[stageId - 1];
        if (currentStage) {
          currentStage.status = "success";
          currentStage.error = undefined;
        }

        if (stageId < 5) {
          const nextStage = newStages[stageId];
          if (nextStage) {
            nextStage.status = "pending";
          }
        }
      }

      stagesRef.current = newStages;
      return newStages;
    });

    scrollToBottom();
  }, [markStagesAsError, scrollToBottom]);

  // Mark stage 3 as complete
  const markStage3AsComplete = useCallback(() => {
    setTimeout(() => {
      setStages((prevStages) => {
        const newStages = [...prevStages];
        const stage3 = newStages[2];
        if (stage3) {
          stage3.status = "success";
          stage3.error = undefined;
        }
        const stage4 = newStages[3];
        if (stage4) {
          stage4.status = "pending";
        }
        stagesRef.current = newStages;
        return newStages;
      });
      scrollToBottom();
    }, 2000);
  }, [scrollToBottom]);

  // Set refresh token for node
  const setRefreshTokenForNode = useCallback(async (node: ESPCDFNode) => {
    try {
      const agentAuthService = node?.services?.find(
        (service) => service.type === ESPRM_AGENT_AUTH_SERVICE
      );

      if (!agentAuthService) return;

      const refreshTokenParam: ESPCDFServiceParam | undefined =
        agentAuthService.params?.find(
          (param) => param.type === ESPRM_REFRESH_TOKEN_PARAM_TYPE
        );

      if (!refreshTokenParam) return;

      const refreshToken = await AsyncStorage.getItem(
        TOKEN_STORAGE_KEYS.REFRESH_TOKEN
      );

      if (!refreshToken) return;

      await refreshTokenParam.setValue(refreshToken);
    } catch (error) {
      console.error("Error setting refresh token for provisioned node:", error);
    }
  }, []);

  /**
   * Completes the last step when Continue is enabled.
   * If post-provision TZ verify failed, show the soft warning in the stage
   * error slot (same place as other step errors) — not a toast.
   */
  const markFinalProvisionStageComplete = useCallback(
    (timezoneSoftWarning?: string) => {
      setStages((prevStages) => {
        const newStages = [...prevStages];
        const lastIdx = newStages.length - 1;
        const lastStage = newStages[lastIdx];
        if (lastStage) {
          if (timezoneSoftWarning) {
            lastStage.status = "error";
            lastStage.error = timezoneSoftWarning;
          } else {
            lastStage.status = "success";
            lastStage.error = undefined;
          }
        }
        stagesRef.current = newStages;
        return newStages;
      });
      scrollToBottom();
    },
    [scrollToBottom]
  );

  // Handle add device success
  const handleAddDeviceSuccess = useCallback(async (provisionedNode: ESPCDFNode) => {
    const timezoneApplied = takeProvisionTimezoneOutcome(provisionedNode.id);
    const timezoneSoftWarning =
      timezoneApplied === false
        ? t("device.provision.timezoneNotSet")
        : undefined;

    const finishSuccess = () => {
      unstable_batchedUpdates(() => {
        markFinalProvisionStageComplete(timezoneSoftWarning);
        setIsComplete(true);
      });
      toast.showSuccess(t("device.provision.success"), undefined, { duration: 4000 });
    };

    try {
      provisionedNodeRef.current = provisionedNode;
      const agentAuthService = provisionedNode?.services?.find(
        (service) => service.type === ESPRM_AGENT_AUTH_SERVICE
      );
      const isAgentDevice = !!agentAuthService;

      if (isAgentDevice) {
        try {
          await setRefreshTokenForNode(provisionedNode);
          await setUserAuthForNode(provisionedNode);
        } catch (tokenError) {
          console.error("Error setting refresh token (non-blocking):", tokenError);
        }
      } else {
        try {
          await setUserAuthForNode(provisionedNode);
        } catch (userAuthError) {
          console.error("Error setting user auth (non-blocking):", userAuthError);
        }
      }
      await syncHomeAfterProvision(store, syncHomeWithNodes);
      finishSuccess();
    } catch (error) {
      console.error("Error in post-provision agent setup:", error);
      await syncHomeAfterProvision(store, syncHomeWithNodes);
      finishSuccess();
    }
  }, [
    markFinalProvisionStageComplete,
    setRefreshTokenForNode,
    store,
    syncHomeWithNodes,
    toast,
    t,
  ]);

  /**
   * Maps SDK / adaptor provision progress callbacks onto the visible stage list.
   *
   * Chal-resp (BLE/SoftAP) emits the same milestone style as MQTT:
   * association complete → Wi-Fi complete (SUCCEED / WAITING_FOR_ONLINE) →
   * final "Setting up node" in `handleAddDeviceSuccess`.
   */
  const handleProvisionUpdate = useCallback((response: ESPCDFProvisionResponse) => {
    const message = response.description || "";

    switch (response.status) {
      case ESPCDFProvisionResponseStatus.SUCCEED:
        // On-network flow: stage 1 completes when cloud confirms the mapping;
        // stage 2 ("Setting up Node") completes via Continue (same as chal-resp).
        if (isOnNetworkFlowRef.current) {
          if (ON_NETWORK_MESSAGE_STAGE_MAP[message] !== undefined) {
            updateChallengeResponseStage(
              ON_NETWORK_MESSAGE_STAGE_MAP[message]!,
              false
            );
          }
        } else if (isChallengeResponseFlowRef.current) {
          // Chal-resp SUCCEED description is typically the raw nodeId (or
          // DEVICE_PROVISIONED fallback). Either means Wi-Fi credentials were
          // applied — complete stage 2; stage 3 waits for post-provision setup.
          updateChallengeResponseStage(CHAL_RESP_WIFI_STAGE_ID, false);
        } else {
          // MQTT flow: stage 3 completes later in handleAddDeviceSuccess.
          if (message === ESPCDFProvProgressMessages.DEVICE_PROVISIONED) {
            updateStageStatus(message);
            markStage3AsComplete();
          } else if (message === ESPCDFProvProgressMessages.USER_NODE_MAPPING_SUCCEED) {
            updateStageStatus(message);
          }
        }
        break;

      case ESPCDFProvisionResponseStatus.ON_PROGRESS:
        if (
          isOnNetworkFlowRef.current &&
          ON_NETWORK_MESSAGE_STAGE_MAP[message] !== undefined
        ) {
          updateChallengeResponseStage(
            ON_NETWORK_MESSAGE_STAGE_MAP[message]!,
            false
          );
        } else if (isChallengeResponseFlowRef.current) {
          const chalRespStageId = CHAL_RESP_MESSAGE_STAGE_MAP[message];
          if (chalRespStageId !== undefined) {
            updateChallengeResponseStage(chalRespStageId, false);
          }
          // INITIATING / SENDING / VERIFYING intentionally leave stage 1
          // pending until SETTING_NETWORK_CREDENTIALS (association confirmed).
        } else if (message === ESPCDFProvProgressMessages.DECODED_NODE_ID) {
          updateStageStatus(message);
        }
        break;

      case ESPCDFProvisionResponseStatus.FAILED:
        handleProvisionError(new Error(message));
        updateStageStatus(message, true, message);
        break;

      default:
        handleProvisionError(new Error(message));
        updateStageStatus(message, true, message);
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [updateChallengeResponseStage, updateStageStatus, markStage3AsComplete, scrollToBottom]);

  // Mark current stage as error
  const markCurrentStageAsError = useCallback((errorMessage: string) => {
    const currentStages = stagesRef.current;
    const loadingStageIndex = currentStages.findIndex(
      (stage) => stage.status === "pending"
    );

    if (loadingStageIndex < 0) return;

    const stage = currentStages[loadingStageIndex];
    if (!stage) return;

    if (isOnNetworkFlowRef.current || isChallengeResponseFlowRef.current) {
      updateChallengeResponseStage(stage.id, true, errorMessage);
    } else {
      const stageIdToMessage: Record<number, string> = {
        1: ESPCDFProvProgressMessages.DECODED_NODE_ID,
        2: ESPCDFProvProgressMessages.DEVICE_PROVISIONED,
        3: ESPCDFProvProgressMessages.DEVICE_PROVISIONED,
        4: ESPCDFProvProgressMessages.USER_NODE_MAPPING_SUCCEED,
        5: ESPCDFProvProgressMessages.NODE_TIMEZONE_SETUP_SUCCEED,
      };
      updateStageStatus(stageIdToMessage[stage.id] ?? "", true, errorMessage);
    }
  }, [updateChallengeResponseStage, updateStageStatus]);

  // Handle provision error
  const handleProvisionError = useCallback((error: any) => {
    console.error("[Provision] Provision error:", error);
    const rawErrorMessage = extractErrorMessage(error);
    const localizedMessage = getLocalizedErrorMessage(rawErrorMessage, t);
    markCurrentStageAsError(localizedMessage);
    setIsComplete(true);
  }, [t, markCurrentStageAsError]);

  // Start provisioning
  const startProvisioning = useCallback(async () => {
    // Prevent multiple calls
    if (hasStartedProvisioningRef.current) {
      return;
    }
    hasStartedProvisioningRef.current = true;

    try {
      if (!user || !device || !currentHomeId) {
        hasStartedProvisioningRef.current = false; // Reset on error so it can retry
        handleProvisionError(new Error(t("device.errors.missingProvisionData") || "Missing provision data"));
        return;
      }

      // Dispatch the provisioning flow off the device model — same pattern
      // chal-resp / MQTT already use. On-network is treated as a third
      // branch alongside chal-resp and traditional MQTT, with the choice
      // owned by `device.checkOnNetworkProvisioning()` rather than by a
      // route param.
      const isOnNetwork = await device.checkOnNetworkProvisioning();
      if (isOnNetwork) {
        isOnNetworkFlowRef.current = true;
        setStages(getOnNetworkProvisionStages(t));
        stagesRef.current = getOnNetworkProvisionStages(t);

        console.log("[useProvision] on-network branch: starting", {
          hasDeviceInfo: !!onNetworkDeviceInfo,
          currentHomeId,
          hasPop: !!onNetworkDevicePop,
        });
        if (!onNetworkDeviceInfo) {
          hasStartedProvisioningRef.current = false;
          handleProvisionError(
            new Error(
              t("device.errors.missingProvisionData") ||
                "Missing provision data"
            )
          );
          return;
        }
        const node = await user.addOnNetworkDevice({
          device: onNetworkDeviceInfo,
          groupId: currentHomeId,
          pop: onNetworkDevicePop,
          onProgress: handleProvisionUpdate,
        });
        console.log(
          "[useProvision] on-network addOnNetworkDevice returned",
          { gotNode: !!node, nodeId: node?.id }
        );

        if (node) {
          // Clear stashed device info before navigating away.
          store.nodeStore.onNetworkDeviceInfo = null;
          store.nodeStore.onNetworkDevicePop = null;
          store.nodeStore.connectedDevice = null;
          await handleAddDeviceSuccess(node);
        } else {
          hasStartedProvisioningRef.current = false;
          toast.showError(
            t("device.errors.nodeNotFound") ||
              "Device not found after provisioning"
          );
        }
        return;
      }

      const isChallengeResponseSupported = await device.checkChallengeResponseSupport();
      if (isChallengeResponseSupported) {
        isChallengeResponseFlowRef.current = true;
        setStages(getChallengeResponseStages(t));
        stagesRef.current = getChallengeResponseStages(t);
      } else {
        isChallengeResponseFlowRef.current = false;
        setStages(getProvisionStages(t));
        stagesRef.current = getProvisionStages(t);
      }

      const node = await user.addDevice({
        provisioningDevice: device,
        groupId: currentHomeId,
        ssid: ssid as string,
        password: (password as string) || "",
        onProgress: handleProvisionUpdate,
      });

      if (node) {
        await handleAddDeviceSuccess(node);
      } else {
        hasStartedProvisioningRef.current = false; // Reset on error
        toast.showError(t("device.errors.nodeNotFound") || "Device not found after provisioning");
      }
    } catch (error) {
      console.error("[Provision] startProvisioning caught error:", error);
      hasStartedProvisioningRef.current = false; // Reset on error so it can retry
      handleProvisionError(error);
    }
  }, [user, device, onNetworkDeviceInfo, onNetworkDevicePop, store, currentHomeId, ssid, password, t, handleProvisionUpdate, handleAddDeviceSuccess, handleProvisionError, toast]);

  // Handle continue
  const handleContinue = useCallback(() => {
    const provisionedNode = provisionedNodeRef.current;

    if (provisionedNode) {
      router.replace({
        pathname: "/(provision)/UpdateDeviceName" as any,
        params: { nodeId: provisionedNode.id },
      });
      return;
    }

    router.dismissTo("/(group)/Home");
  }, [router]);

  // Start provisioning on mount - only once
  useEffect(() => {
    if (hasStartedProvisioningRef.current) return;
    if (!device) return;
    // `startProvisioning` itself dispatches the flow off the device model
    // (`device.checkOnNetworkProvisioning()` / `checkChallengeResponseSupport()`)
    // and consumes `ssid`/`password` only on flows that actually need them.
    // BLE/SoftAP flows always navigate into this screen with `ssid` already
    // set; on-network flows never set `ssid` (the device is already on Wi-Fi),
    // so the single `device`-set trigger handles both branches cleanly.
    startProvisioning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssid, device]);

  return {
    stages,
    isComplete,
    stepsScrollViewRef,
    handleContinue,
  };
};
