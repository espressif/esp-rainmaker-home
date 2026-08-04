/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  useRef,
} from "react";
import { useCDF } from "@shared/hooks/useCDF";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import {
  executePostLoginPipeline,
  navigateToHomeAfterAuth,
  withPostLoginPipelineHooks,
} from "@features/auth/utils/postLoginPipeline";
import {
  CDF_EXTERNAL_PROPERTIES,
  OAUTH_APP_RESUME_CANCEL_GRACE_PERIOD_MS,
} from "@shared/utils/constants";
import { getAuthAllowedUsernameTypes } from "@features/auth/utils/authHelper";
import {
  createAuthUsernameValidator,
  createPasswordValidator,
  getAuthErrorDescription,
  isUsernameAllowedForAuth,
} from "@features/auth/utils/authHelper";
import {
  cancelOAuthAttempt,
  completeOAuthAttempt,
  createOAuthPostLoginPipelineHooks,
  createInitialOAuthFlowState,
  enterOAuthPostLoginPipeline,
  failOAuthAttempt,
  initPipelineProgress,
  isCurrentOAuthAttempt,
  isOAuthLoadingStatus,
  mapOAuthErrorToMessage,
  OAUTH_PIPELINE_STEP_GET_USER_PROFILE,
  shouldMonitorOAuthAppLifecycle,
  startOAuthAttempt,
  type OAuthFlowState,
  type PipelineProgress as OAuthPipelineProgress,
} from "@features/auth/utils/oauthFlow";
import {
  performWeChatLogin,
  isWeChatCancellation,
  hasReceivedWeChatAuthCode,
} from "@native-adaptors/implementations/ESPWeChatAdapter";
import { espOauthAdapter } from "@native-adaptors/implementations/ESPOauthAdapter";
import { runtimeConfigManager } from "@config/runtime.config";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { AppRestartContext } from "@context/appRestart.context";
import { getPreAuthRoute } from "@features/landing/utils/currentDeployment";

export type PostSignupLoginCredentials = {
  username: string;
  password: string;
};

let pendingPostSignupLogin: PostSignupLoginCredentials | null = null;

/** Queue credentials for Login to consume and sign in (in-memory only; never in URL). */
export function setPendingPostSignupLogin(
  creds: PostSignupLoginCredentials
): void {
  pendingPostSignupLogin = creds;
}

/**
 * Handles peek pending post signup login logic for this module.
 */
export function peekPendingPostSignupLogin(): PostSignupLoginCredentials | null {
  return pendingPostSignupLogin;
}

/**
 * Handles consume pending post signup login logic for this module.
 */
export function consumePendingPostSignupLogin(): PostSignupLoginCredentials | null {
  const next = pendingPostSignupLogin;
  pendingPostSignupLogin = null;
  return next;
}

export type PipelineProgress = OAuthPipelineProgress;

/**
 * Manages login state and related actions.
 */
export function useLogin() {
  const { store, syncHomeWithNodes, initUserCustomData, setESPCDFUser } =
    useCDF();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const router = useRouter();
  const { restartApp, reinitializeSdk } = useContext(AppRestartContext);
  const toast = useToast();

  const usernameParam =
    typeof params.username === "string" ? params.username : "";
  const [email, setEmail] = useState(usernameParam);
  const [password, setPassword] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthFlowState, setOAuthFlowState] = useState<OAuthFlowState>(
    createInitialOAuthFlowState
  );
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [showConfigResetDialog, setShowConfigResetDialog] = useState(false);
  const [isConfigResetting, setIsConfigResetting] = useState(false);
  const [authFieldsKey, setAuthFieldsKey] = useState(0);
  const postSignupAutoLoginStartedRef = useRef(false);
  const oauthFlowStateRef = useRef(oauthFlowState);
  const oauthAttemptInFlightRef = useRef(false);
  const oauthResumeCancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    oauthFlowStateRef.current = oauthFlowState;
  }, [oauthFlowState]);

  const isOAuthLoading = isOAuthLoadingStatus(oauthFlowState.status);
  const monitorOAuthAppLifecycle = shouldMonitorOAuthAppLifecycle(
    oauthFlowState.status
  );

  const usernameValidator = useMemo(
    () => createAuthUsernameValidator(getAuthAllowedUsernameTypes(), t),
    [t]
  );
  const passwordValidator = useMemo(() => createPasswordValidator(t), [t]);

  const performLogin = useCallback(
    async (username: string, pwd: string) => {
      setIsLoading(true);
      try {
        await store?.userStore.auth.login({
          username,
          password: pwd,
        });

        if (!store?.userStore.user) return;

        setESPCDFUser(store.userStore.user ?? null);
        // Leave Login immediately — hydrate CDF in the background on Home.
        navigateToHomeAfterAuth(router);
        void executePostLoginPipeline(
          withPostLoginPipelineHooks({
            store,
            syncHomeWithNodes,
            initUserCustomData,
          })
        ).catch((error: unknown) => {
          console.warn("[useLogin] post-login pipeline failed:", error);
        });
      } catch (error: unknown) {
        console.error("[useLogin] credential login failed:", error);
        toast.showError(
          t("auth.errors.signInFailed"),
          getAuthErrorDescription(error) || t("auth.errors.fallback")
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      store,
      router,
      syncHomeWithNodes,
      initUserCustomData,
      setESPCDFUser,
      toast,
      t,
    ]
  );

  useEffect(() => {
    if (usernameParam) {
      setEmail(usernameParam);
      const validation = usernameValidator(usernameParam);
      setIsEmailValid(validation.isValid);
    }
  }, [usernameParam, usernameValidator]);

  useEffect(() => {
    if (postSignupAutoLoginStartedRef.current) return;
    const peeked = peekPendingPostSignupLogin();
    if (!peeked) return;

    const allowed = getAuthAllowedUsernameTypes();
    if (!isUsernameAllowedForAuth(peeked.username, allowed)) {
      consumePendingPostSignupLogin();
      return;
    }
    const uOk = usernameValidator(peeked.username).isValid;
    const pOk = passwordValidator(peeked.password).isValid;
    if (!uOk || !pOk) {
      consumePendingPostSignupLogin();
      return;
    }

    postSignupAutoLoginStartedRef.current = true;
    const creds = consumePendingPostSignupLogin();
    if (!creds) return;

    setEmail(creds.username);
    setPassword(creds.password);
    setIsEmailValid(true);
    setIsPasswordValid(true);
    setAuthFieldsKey((k) => k + 1);

    void performLogin(creds.username, creds.password);
  }, [performLogin, usernameValidator, passwordValidator]);

  const handleEmailChange = (value: string, isValid: boolean) => {
    setEmail(value.trim());
    setIsEmailValid(isValid);
  };

  const handlePasswordChange = (value: string, isValid: boolean) => {
    setPassword(value.trim());
    setIsPasswordValid(isValid);
  };

  const login = async () => {
    if (!isEmailValid || !isPasswordValid) return;

    const allowed = getAuthAllowedUsernameTypes();
    if (!isUsernameAllowedForAuth(email, allowed)) {
      return;
    }

    await performLogin(email, password);
  };

  const forgotPwd = () => {
    router.push("/(auth)/Forgot");
  };

  /**
   * Cancels the current OAuth attempt and resets overlay progress state.
   */
  const cancelOAuthFlow = useCallback(() => {
    if (oauthResumeCancelTimerRef.current) {
      clearTimeout(oauthResumeCancelTimerRef.current);
      oauthResumeCancelTimerRef.current = null;
    }
    oauthAttemptInFlightRef.current = false;
    const nextState = cancelOAuthAttempt(oauthFlowStateRef.current);
    oauthFlowStateRef.current = nextState;
    setOAuthFlowState(nextState);
    setPipelineProgress(null);
  }, []);

  /**
   * CN-only WeChat login. Drives native WeChat auth + token exchange, persists
   * the issued tokens, and restores the session so the shared OAuth post-login
   * flow below proceeds exactly like any other provider. Returns null when the
   * user cancels (so the caller completes silently, without an error toast).
   */
  const loginWithWeChat = async () => {
    try {
      await performWeChatLogin();
      return (await store?.userStore.restoreSession()) ?? null;
    } catch (error) {
      if (isWeChatCancellation(error)) {
        return null;
      }
      throw error;
    }
  };

  /**
   * Starts provider OAuth authentication and runs post-login setup on success.
   * @param provider OAuth provider key.
   */
  const oauthLogin = async (provider: string) => {
    const startedState = startOAuthAttempt(oauthFlowStateRef.current);
    oauthFlowStateRef.current = startedState;
    setOAuthFlowState(startedState);
    const oauthAttemptId = startedState.attemptId;
    oauthAttemptInFlightRef.current = true;
    if (oauthResumeCancelTimerRef.current) {
      clearTimeout(oauthResumeCancelTimerRef.current);
      oauthResumeCancelTimerRef.current = null;
    }
    setPipelineProgress(null);
    try {
      const user =
        provider.toLowerCase() === "wechat"
          ? await loginWithWeChat()
          : await store?.userStore.auth?.loginWithOauth({
              identityProvider: provider,
            });
      if (!isCurrentOAuthAttempt(oauthFlowStateRef.current, oauthAttemptId)) {
        return;
      }

      if (user) {
        const pipelineState = enterOAuthPostLoginPipeline(
          oauthFlowStateRef.current,
          oauthAttemptId
        );
        oauthFlowStateRef.current = pipelineState;
        setOAuthFlowState(pipelineState);
        store!.userStore[CDF_EXTERNAL_PROPERTIES.IS_OAUTH_LOGIN] = true;
        setESPCDFUser(store!.userStore.user ?? null);
        setPipelineProgress(initPipelineProgress());
        // Leave auth immediately; do not await hydrate (sync locks).
        navigateToHomeAfterAuth(router);
        const postLoginOptions = withPostLoginPipelineHooks(
          {
            store: store!,
            syncHomeWithNodes,
            initUserCustomData,
          },
          createOAuthPostLoginPipelineHooks(setPipelineProgress)
        );
        void executePostLoginPipeline(postLoginOptions).catch(
          (error: unknown) => {
            console.warn("[useLogin] OAuth post-login pipeline failed:", error);
          }
        );

        const completedState = completeOAuthAttempt(
          oauthFlowStateRef.current,
          oauthAttemptId
        );
        oauthFlowStateRef.current = completedState;
        setOAuthFlowState(completedState);
      } else {
        const completedState = completeOAuthAttempt(
          oauthFlowStateRef.current,
          oauthAttemptId
        );
        oauthFlowStateRef.current = completedState;
        setOAuthFlowState(completedState);
      }
    } catch (error) {
      if (!isCurrentOAuthAttempt(oauthFlowStateRef.current, oauthAttemptId)) {
        return;
      }
      const failedState = failOAuthAttempt(
        oauthFlowStateRef.current,
        oauthAttemptId
      );
      oauthFlowStateRef.current = failedState;
      setOAuthFlowState(failedState);
      console.error(`OAuth login failed for provider ${provider}:`, error);
      const errorMessage = mapOAuthErrorToMessage(error, t);
      toast.showError(t("auth.errors.oauthLoginFailedTitle"), errorMessage);
      setPipelineProgress(null);
    } finally {
      if (isCurrentOAuthAttempt(oauthFlowStateRef.current, oauthAttemptId)) {
        oauthAttemptInFlightRef.current = false;
      }
      if (oauthResumeCancelTimerRef.current) {
        clearTimeout(oauthResumeCancelTimerRef.current);
        oauthResumeCancelTimerRef.current = null;
      }
    }
  };

  /**
   * Handles app foreground return while the browser OAuth phase is pending.
   */
  const handleOAuthAppBecameActive = useCallback(() => {
    if (!shouldMonitorOAuthAppLifecycle(oauthFlowStateRef.current.status)) {
      return;
    }
    const attemptIdOnResume = oauthFlowStateRef.current.attemptId;
    if (oauthResumeCancelTimerRef.current) {
      clearTimeout(oauthResumeCancelTimerRef.current);
    }
    oauthResumeCancelTimerRef.current = setTimeout(() => {
      const isSameAttempt = isCurrentOAuthAttempt(
        oauthFlowStateRef.current,
        attemptIdOnResume
      );
      if (!isSameAttempt) {
        return;
      }
      if (
        shouldMonitorOAuthAppLifecycle(oauthFlowStateRef.current.status) &&
        oauthAttemptInFlightRef.current
      ) {
        // The watchdog exists to catch the user returning from the browser /
        // WeChat WITHOUT completing auth (no redirect will ever arrive). Once
        // the authorization code HAS been received, the attempt is past the
        // browser phase — the token exchange is in flight and will resolve or
        // fail on its own — so cancelling here would discard a valid login
        // (seen with SignInWithApple when the CN token exchange exceeded the
        // grace period). Let it finish; the loading overlay's close button
        // still allows a manual cancel.
        if (espOauthAdapter.hasReceivedAuthCode() || hasReceivedWeChatAuthCode()) {
          return;
        }
        cancelOAuthFlow();
        toast.showError("OAuth Login Failed", "OAuth login was cancelled.");
      }
    }, OAUTH_APP_RESUME_CANCEL_GRACE_PERIOD_MS);
  }, [cancelOAuthFlow, toast]);

  const handleCancelOAuth = useCallback(() => {
    cancelOAuthFlow();
  }, [cancelOAuthFlow]);

  const handleConfigReset = () => {
    setShowConfigResetDialog(true);
  };

  /**
   * Confirms the custom-deployment reset: drops the runtime override, wipes the
   * session, then rebuilds the SDK layer in place onto the built-in default
   * backend. Falls back to a process relaunch on failure.
   *
   * Routes via `getPreAuthRoute()` rather than staying here: it reads
   * `isRuntimeConfigActive` at call time, which the reset just cleared, so the
   * destination is usually Landing.
   */
  const confirmConfigReset = useCallback(async () => {
    setIsConfigResetting(true);
    try {
      await runtimeConfigManager.reset();
      await asyncStorageAdapter.clear();
      try {
        await reinitializeSdk();
        router.replace(getPreAuthRoute() as never);
      } catch (error) {
        console.error("[Login] In-place SDK switch failed, relaunching:", error);
        restartApp();
      }
    } finally {
      setIsConfigResetting(false);
    }
  }, [router, reinitializeSdk, restartApp, setIsConfigResetting]);

  const getFriendlyStepName = (stepName: string): string => {
    const stepMap: Record<string, string> = {
      setUserTimeZone: t("auth.login.settingUpAccount") || "Setting up account",
      registerForNotification: t("auth.login.settingUpAccount") || "Setting up account",
      syncHomeWithNodes: t("auth.login.settingUpHomes") || "Setting up homes",
      updateRefreshTokensForAllAIDevices: t("auth.login.settingUpNodes") || "Setting up nodes",
      initUserCustomData: t("auth.login.settingUpNodes") || "Setting up nodes",
    };
    return stepMap[stepName] || stepName;
  };

  const getCurrentFriendlyMessage = (): string => {
    if (!pipelineProgress) {
      return t("auth.login.settingUpAccount") || "Setting up account";
    }
    if (
      pipelineProgress.currentStep === OAUTH_PIPELINE_STEP_GET_USER_PROFILE
    ) {
      return t("auth.login.finishingUp") || "Finishing up";
    }
    if (!pipelineProgress.currentStep) {
      return t("auth.login.settingUpAccount") || "Setting up account";
    }
    return getFriendlyStepName(pipelineProgress.currentStep);
  };

  return {
    email,
    usernameParam,
    password,
    authFieldsKey,
    isEmailValid,
    isPasswordValid,
    isLoading,
    isOAuthLoading,
    monitorOAuthAppLifecycle,
    pipelineProgress,
    showConfigResetDialog,
    isConfigResetting,
    setShowConfigResetDialog,
    setIsConfigResetting,
    emailValidator: usernameValidator,
    passwordValidator,
    handleEmailChange,
    handlePasswordChange,
    login,
    forgotPwd,
    oauthLogin,
    handleOAuthAppBecameActive,
    handleCancelOAuth,
    handleConfigReset,
    confirmConfigReset,
    getCurrentFriendlyMessage,
  };
}
