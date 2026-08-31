/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging,
  type Unsubscribe,
} from "firebase/messaging";

import type {
  EspNotificationClient,
  EspNotificationFirebaseWebConfig,
  EspNotificationHandler,
} from "../src/types";
import {
  FCM_PAYLOAD_KEY_BODY,
  FCM_PAYLOAD_KEY_TITLE,
  FIREBASE_MESSAGING_SW_PATH,
  NOTIFICATION_PERMISSION_GRANTED,
  WEB_NOTIFICATION_PLATFORM,
} from "./constants";
import { logWebNotification } from "./logger";

/**
 * Returns true when the public Firebase web config has every field FCM needs.
 * @param config - Candidate web config
 */
function isFirebaseWebConfigComplete(
  config: EspNotificationFirebaseWebConfig | null,
): config is EspNotificationFirebaseWebConfig {
  return Boolean(
    config?.apiKey &&
      config.projectId &&
      config.messagingSenderId &&
      config.appId &&
      config.vapidKey,
  );
}

/**
 * Max scope allowed without `Service-Worker-Allowed` is the SW script directory.
 * Versioned CDN deploys serve the script under `/web/<env>/<region>/<ver>/`, so
 * registering with scope `/` is rejected by the browser.
 * @param scriptUrl - Absolute or origin-relative service worker script URL
 * @returns Scope path ending with `/` (e.g. `/web/prod/global/6.1.1/`)
 */
function resolveMessagingServiceWorkerScope(scriptUrl: string): string {
  try {
    const { pathname } = new URL(scriptUrl, window.location.origin);
    const lastSlash = pathname.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash + 1);
  } catch {
    return "/";
  }
}

/**
 * Flattens an FCM payload into the data map the RainMaker SDK already consumes.
 * @param payload - Firebase Messaging payload
 */
function payloadToData(payload: MessagePayload): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(payload.data ?? {}) };
  const title = payload.notification?.title;
  const body = payload.notification?.body;
  if (title && data[FCM_PAYLOAD_KEY_TITLE] == null) {
    data[FCM_PAYLOAD_KEY_TITLE] = title;
  }
  if (body && data[FCM_PAYLOAD_KEY_BODY] == null) {
    data[FCM_PAYLOAD_KEY_BODY] = body;
  }
  return data;
}

/**
 * Browser FCM client. Call {@link WebNotificationManager.configure} with env
 * values before requesting a token.
 */
class WebNotificationManager implements EspNotificationClient {
  private config: EspNotificationFirebaseWebConfig | null = null;
  private initPromise: Promise<Messaging | null> | null = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private readonly listeners = new Set<EspNotificationHandler>();
  private unsubscribeForeground: Unsubscribe | null = null;

  /**
   * Passes public Firebase Messaging config (from env / Expo extra).
   * @param config - `apiKey`, `projectId`, `messagingSenderId`, `appId`, `vapidKey`
   */
  configure(config: EspNotificationFirebaseWebConfig): void {
    this.config = config;
    this.initPromise = null;
    this.swRegistration = null;
  }

  /**
   * Requests notification permission (if needed) and returns the FCM token.
   * Resolves `""` when Messaging is unsupported, config is missing, or the
   * user denies permission — callers skip RainMaker registration in that case.
   */
  async getDeviceToken(): Promise<string> {
    const messaging = await this.ensureMessaging();
    if (!messaging || !this.config) {
      return "";
    }
    if (typeof Notification === "undefined") {
      logWebNotification("notification-api-missing");
      return "";
    }
    const permission = await Notification.requestPermission();
    if (permission !== NOTIFICATION_PERMISSION_GRANTED) {
      logWebNotification("permission-denied", { permission });
      return "";
    }
    try {
      const registration =
        this.swRegistration ?? (await this.registerMessagingServiceWorker());
      const token = await getToken(messaging, {
        vapidKey: this.config.vapidKey,
        serviceWorkerRegistration: registration,
      });
      logWebNotification("token", { hasToken: Boolean(token) });
      return token || "";
    } catch (error) {
      logWebNotification("token-error", {
        message: error instanceof Error ? error.message : String(error),
      });
      return "";
    }
  }

  /**
   * @returns RainMaker GCM platform identifier (same as Android FCM)
   */
  async getNotificationPlatform(): Promise<string> {
    return WEB_NOTIFICATION_PLATFORM;
  }

  /**
   * @returns Firebase project id for this web app
   */
  async getPushProjectId(): Promise<string> {
    return this.config?.projectId ?? "";
  }

  /**
   * Subscribes to foreground FCM messages. Background messages are handled
   * by `firebase-messaging-sw.js`.
   * @param callback - Payload handler
   * @returns Unsubscribe for this callback
   */
  addNotificationListener(callback: EspNotificationHandler): () => void {
    this.listeners.add(callback);
    void this.ensureForegroundSubscription();
    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.unsubscribeForeground?.();
        this.unsubscribeForeground = null;
      }
    };
  }

  /**
   * Drops all foreground listeners and the Firebase `onMessage` subscription.
   */
  removeNotificationListener(): void {
    this.listeners.clear();
    this.unsubscribeForeground?.();
    this.unsubscribeForeground = null;
  }

  /**
   * Initializes Firebase App + Messaging once, or returns null when FCM cannot run.
   */
  private async ensureMessaging(): Promise<Messaging | null> {
    if (!this.initPromise) {
      this.initPromise = this.initMessaging();
    }
    return this.initPromise;
  }

  /**
   * Creates the Firebase Messaging instance for this page.
   */
  private async initMessaging(): Promise<Messaging | null> {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return null;
    }
    const config = this.config;
    if (!isFirebaseWebConfigComplete(config)) {
      logWebNotification("config-missing");
      return null;
    }
    if (!("serviceWorker" in navigator)) {
      logWebNotification("service-worker-missing");
      return null;
    }
    const supported = await isSupported();
    if (!supported) {
      logWebNotification("messaging-unsupported");
      return null;
    }
    const app = this.getOrInitApp(config);
    const messaging = getMessaging(app);
    try {
      this.swRegistration = await this.registerMessagingServiceWorker();
    } catch (error) {
      logWebNotification("sw-register-error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return messaging;
  }

  /**
   * Registers the static Messaging SW generated from `.env.web` by
   * `deployment/web/scripts/sync-firebase-messaging-sw.js`. Browsers reject blob: worker URLs.
   * Scope matches the script directory so versioned CDN prefixes work.
   */
  private async registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration> {
    const scriptUrl = FIREBASE_MESSAGING_SW_PATH;
    const scope = resolveMessagingServiceWorkerScope(scriptUrl);
    logWebNotification("sw-register", { scriptUrl, scope });
    const registration = await navigator.serviceWorker.register(scriptUrl, {
      scope,
    });
    await navigator.serviceWorker.ready;
    return registration;
  }

  /**
   * Reuses an existing default Firebase app or initializes one from web config.
   * @param config - Complete public Firebase web config
   */
  private getOrInitApp(config: EspNotificationFirebaseWebConfig): FirebaseApp {
    if (getApps().length > 0) {
      return getApp();
    }
    return initializeApp({
      apiKey: config.apiKey,
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
  }

  /**
   * Attaches a single `onMessage` listener that fans out to registered callbacks.
   */
  private async ensureForegroundSubscription(): Promise<void> {
    if (this.unsubscribeForeground) {
      return;
    }
    const messaging = await this.ensureMessaging();
    if (!messaging) {
      return;
    }
    this.unsubscribeForeground = onMessage(messaging, (payload) => {
      const data = payloadToData(payload);
      logWebNotification("message", {
        keys: Object.keys(data),
      });
      this.listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          logWebNotification("listener-error", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    });
  }
}

/** Shared browser FCM client used by the web notification adaptor. */
export const webNotificationManager = new WebNotificationManager();
