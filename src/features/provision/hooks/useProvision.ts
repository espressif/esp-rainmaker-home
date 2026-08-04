/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ScrollView, unstable_batchedUpdates } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
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
  PROVISION_SETUP_PROGRESS_MESSAGES,
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
  isWifiAuthFailure,
  isProvisionSetupProgressMessage,
} from "@features/provision/utils/provisionHelper";
import { takeProvisionTimezoneOutcome } from "@shared/utils/timezone";
import {
  captureProvisionNodeId,
  finalizeProvisionedNode,
} from "@shared/utils/provisionNode";
import { persistWifiCredential } from "./useWifiStorage";
import { isRmneoStackSdkId } from "@config/sdk.identifiers";

interface UseProvisionReturn {
  stages: ProvisionStage[];
  isComplete: boolean;
  stepsScrollViewRef: React.RefObject<ScrollView | null>;
  handleContinue: () => void;
  /** Whether the "stop setting up?" confirmation is showing. */
  isExitSetupDialogOpen: boolean;
  /** Abandon setup and return to Home. */
  handleConfirmExitSetup: () => void;
  /** Dismiss the confirmation and stay on this screen. */
  handleCancelExitSetup: () => void;
  /** Wi-Fi was reset on the device; asks whether to retry at all. */
  isWifiResetPromptOpen: boolean;
  /** Failure that triggered the reset, shown above the prompt's own message. */
  wifiResetErrorMessage: string;
  /** Accept the retry and move on to the password step. */
  handleConfirmWifiReset: () => void;
  /** Decline the retry and stay on the failed screen. */
  handleDismissWifiResetPrompt: () => void;
  /** Whether the corrected-password step is showing. */
  isWifiResetPasswordPromptOpen: boolean;
  /** SSID being retried, shown as the password step's title. */
  retrySsid: string;
  /** Re-send credentials with the corrected password. */
  handleRetryWithPassword: (password: string) => Promise<void>;
  /** Back out of the password step without retrying. */
  handleCancelWifiResetPassword: () => void;
  /** A retry is in flight. */
  isRetrying: boolean;
}

/** Destination this screen is leaving to, once an exit has been requested. */
type PendingExit =
  | { kind: "addDevice" }
  | { kind: "home" }
  | { kind: "deviceName"; nodeId: string };

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
  const { ssid, password, shouldSave } = useLocalSearchParams<{
    ssid?: string;
    password?: string;
    /** "1" when the Wi-Fi screen's "Save network" box was ticked. */
    shouldSave?: string;
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
  // Non-null once an exit is requested; releases the back guard below.
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
  const [isExitSetupDialogOpen, setIsExitSetupDialogOpen] = useState(false);
  const [isWifiResetPromptOpen, setIsWifiResetPromptOpen] = useState(false);
  const [wifiResetErrorMessage, setWifiResetErrorMessage] = useState("");
  const [isWifiResetPasswordPromptOpen, setIsWifiResetPasswordPromptOpen] =
    useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Refs
  const stepsScrollViewRef = useRef<ScrollView>(null);
  const stagesRef = useRef<ProvisionStage[]>(stages);
  const isChallengeResponseFlowRef = useRef(false);
  const isOnNetworkFlowRef = useRef(false);
  const provisionedNodeRef = useRef<ESPCDFNode | null>(null);
  const hasStartedProvisioningRef = useRef(false);
  // Password currently in play; a retry replaces the one we arrived with.
  const attemptedPasswordRef = useRef<string>((password as string) ?? "");

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
    const lastIdx = newStages.length - 1;
    for (let i = stageId - 1; i < newStages.length; i++) {
      const stage = newStages[i];
      if (stage) {
        stage.status = "error";
        stage.error = i === stageId - 1 ? (errorMessage || "An error occurred") : undefined;
        // Clear live Neo sub-status so only the error line remains.
        if (i === lastIdx) {
          stage.description = t("device.provision.setup.checkingNodeOnline");
        }
      }
    }
    return newStages;
  }, [t]);

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

        // Activate the next step when one exists (chal-resp or on-network).
        if (stageId < newStages.length) {
          const nextStage = newStages[stageId];
          if (nextStage) {
            nextStage.status = "pending";
            // Completing the second-to-last step activates setting-up —
            // reset Neo sub-status so stale reconnect/timezone text is gone.
            if (stageId === newStages.length - 1) {
              nextStage.description = t(
                "device.provision.setup.checkingNodeOnline"
              );
              nextStage.error = undefined;
            }
          }
        }
      }

      stagesRef.current = newStages;
      return newStages;
    });

    scrollToBottom();
  }, [markStagesAsError, scrollToBottom, t]);

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
          lastStage.description = t("device.provision.setup.complete");
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
    [scrollToBottom, t]
  );

  /**
   * Updates the last ("Setting up") stage description from RMNeo setup progress.
   * @param message - Technical progress key from {@link PROVISION_SETUP_PROGRESS_MESSAGES}.
   * @param data - Optional progress payload (reconnect attempt index).
   */
  const updateSettingUpStageDescription = useCallback(
    (message: string, data?: Record<string, unknown>) => {
      let description: string;
      switch (message) {
        case PROVISION_SETUP_PROGRESS_MESSAGES.CHECKING_NODE_ONLINE:
          description = t("device.provision.setup.checkingNodeOnline");
          break;
        case PROVISION_SETUP_PROGRESS_MESSAGES.TRYING_RECONNECT: {
          const rawAttempt = data?.reconnectAttempt;
          const attempt =
            typeof rawAttempt === "number" ? rawAttempt : undefined;
          description = t("device.provision.setup.tryingReconnect", {
            attempt: attempt ?? "",
          });
          break;
        }
        case PROVISION_SETUP_PROGRESS_MESSAGES.UPDATING_NODE_TIMEZONE:
          description = t("device.provision.setup.updatingNodeTimezone");
          break;
        case PROVISION_SETUP_PROGRESS_MESSAGES.COMPLETE:
          description = t("device.provision.setup.complete");
          break;
        default:
          return;
      }

      setStages((prevStages) => {
        const newStages = [...prevStages];
        const lastIdx = newStages.length - 1;
        const lastStage = newStages[lastIdx];
        if (!lastStage) {
          return prevStages;
        }
        // Keep the stage pending with a live detail line until success/error.
        if (lastStage.status !== "pending") {
          lastStage.status = "pending";
        }
        lastStage.description = description;
        lastStage.error = undefined;
        stagesRef.current = newStages;
        return newStages;
      });
      scrollToBottom();
    },
    [scrollToBottom, t]
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

    // Only a password the device accepted is worth remembering.
    if (shouldSave === "1" && ssid && attemptedPasswordRef.current) {
      await persistWifiCredential(ssid as string, attemptedPasswordRef.current);
    }

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
    ssid,
    shouldSave,
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
        if (isProvisionSetupProgressMessage(message)) {
          updateSettingUpStageDescription(message, response.data);
          break;
        }
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
  }, [
    updateChallengeResponseStage,
    updateStageStatus,
    updateSettingUpStageDescription,
    markStage3AsComplete,
    scrollToBottom,
  ]);

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

    // Wrong password: the association survived, so reset Wi-Fi and correct it in place.
    if (!isWifiAuthFailure(rawErrorMessage) || !device) {
      return;
    }

    void (async () => {
      try {
        const acknowledged = await device.resetWifiStatus();
        if (acknowledged) {
          // Same as native: the prompt leads with why the first attempt failed.
          setWifiResetErrorMessage(localizedMessage);
          setIsWifiResetPromptOpen(true);
          return;
        }
        toast.showError(t("device.provision.wifiResetFailedMessage"));
      } catch (resetError) {
        console.error("[Provision] Wi-Fi reset failed:", resetError);
        toast.showError(t("device.provision.wifiResetFailedMessage"));
      }
    })();
  }, [t, markCurrentStageAsError, device, toast]);

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
        handleProvisionError(new Error(t("device.errors.missingProvisionData")));
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
              t("device.errors.missingProvisionData")
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
            t("device.errors.nodeNotFound")
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
        toast.showError(t("device.errors.nodeNotFound"));
      }
    } catch (error) {
      console.error("[Provision] startProvisioning caught error:", error);
      hasStartedProvisioningRef.current = false; // Reset on error so it can retry
      handleProvisionError(error);
    }
  }, [user, device, onNetworkDeviceInfo, onNetworkDevicePop, store, currentHomeId, ssid, password, t, handleProvisionUpdate, handleAddDeviceSuccess, handleProvisionError, toast]);

  // A stage that errored out means provisioning stopped part-way.
  const hasFailure = useMemo(
    () => stages.some((stage) => stage.status === "error"),
    [stages]
  );

  /** Intercepts every back so it never falls through to the Wi-Fi screen; exits route via `pendingExit`. */
  usePreventRemove(pendingExit === null, () => {
    if (hasFailure) {
      setPendingExit({ kind: "addDevice" });
      return;
    }
    setIsExitSetupDialogOpen(true);
  });

  const handleConfirmExitSetup = useCallback(() => {
    setIsExitSetupDialogOpen(false);
    setPendingExit({ kind: "home" });
  }, []);

  const handleCancelExitSetup = useCallback(() => {
    setIsExitSetupDialogOpen(false);
  }, []);

  /** Native's OK: close the ask and collect the corrected password. */
  const handleConfirmWifiReset = useCallback(() => {
    setIsWifiResetPromptOpen(false);
    setIsWifiResetPasswordPromptOpen(true);
  }, []);

  /** Native's Cancel: dismiss only, leaving the failure on screen. */
  const handleDismissWifiResetPrompt = useCallback(() => {
    setIsWifiResetPromptOpen(false);
  }, []);

  const handleCancelWifiResetPassword = useCallback(() => {
    setIsWifiResetPasswordPromptOpen(false);
  }, []);

  /**
   * Re-sends credentials over the still-open session; the SDK resumes rather
   * than repeating association, so the post-provision tail is replayed here.
   * @param retryPassword - Corrected Wi-Fi password.
   */
  const handleRetryWithPassword = useCallback(
    async (retryPassword: string) => {
      if (!device || isRetrying) {
        return;
      }

      setIsWifiResetPasswordPromptOpen(false);
      setIsRetrying(true);
      attemptedPasswordRef.current = retryPassword;

      const freshStages = isOnNetworkFlowRef.current
        ? getOnNetworkProvisionStages(t)
        : isChallengeResponseFlowRef.current
          ? getChallengeResponseStages(t)
          : getProvisionStages(t);

      unstable_batchedUpdates(() => {
        setStages(freshStages);
        setIsComplete(false);
      });
      stagesRef.current = freshStages;

      const retriedNodeIdRef: { current: string | null } = { current: null };
      const captureThenUpdate = (response: ESPCDFProvisionResponse) => {
        retriedNodeIdRef.current =
          captureProvisionNodeId(response) ?? retriedNodeIdRef.current;
        handleProvisionUpdate(response);
      };

      try {
        await device.retryNetworkCredentials(
          ssid as string,
          retryPassword,
          captureThenUpdate
        );

        const retriedNodeId = retriedNodeIdRef.current;
        // Neo's timezone write needs its MQTT transport attached first.
        const isNeoStack = isRmneoStackSdkId(store?.getActiveAdaptorIdentifier());
        const node =
          user && retriedNodeId
            ? await finalizeProvisionedNode(user, retriedNodeId, isNeoStack)
            : null;
        if (!node) {
          throw new Error(t("device.errors.nodeNotFound"));
        }
        await handleAddDeviceSuccess(node);
      } catch (error) {
        console.error("[Provision] Retry failed:", error);
        handleProvisionError(error);
      } finally {
        setIsRetrying(false);
      }
    },
    [
      device,
      isRetrying,
      t,
      ssid,
      user,
      store,
      handleProvisionUpdate,
      handleProvisionError,
      handleAddDeviceSuccess,
    ]
  );

  useEffect(() => {
    if (!pendingExit) return;

    switch (pendingExit.kind) {
      case "addDevice":
        router.dismissTo("/(provision)/ScanQR" as any);
        break;
      case "home":
        router.dismissTo("/(group)/Home");
        break;
      case "deviceName":
        router.replace({
          pathname: "/(provision)/UpdateDeviceName" as any,
          params: { nodeId: pendingExit.nodeId },
        });
        break;
    }
  }, [pendingExit, router]);

  // Handle continue
  const handleContinue = useCallback(() => {
    const provisionedNode = provisionedNodeRef.current;

    // A node exists even when a later stage (e.g. timezone setup) errored, so
    // naming still has to win over the failure exit.
    setPendingExit(
      provisionedNode
        ? { kind: "deviceName", nodeId: provisionedNode.id }
        : { kind: "home" }
    );
  }, []);

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
    isExitSetupDialogOpen,
    handleConfirmExitSetup,
    handleCancelExitSetup,
    isWifiResetPromptOpen,
    wifiResetErrorMessage,
    handleConfirmWifiReset,
    handleDismissWifiResetPrompt,
    isWifiResetPasswordPromptOpen,
    retrySsid: (ssid as string) ?? "",
    handleRetryWithPassword,
    handleCancelWifiResetPassword,
    isRetrying,
  };
};
