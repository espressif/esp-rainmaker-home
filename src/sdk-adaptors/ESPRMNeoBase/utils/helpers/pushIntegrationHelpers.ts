/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Localization from "expo-localization";
import { Platform } from "react-native";
import {
  ESPRMNeoUser,
  type IntegrationInfo,
} from "@espressif/rainmaker-neo-base-sdk";
import { ESPNotificationAdapter } from "@native-adaptors/implementations/ESPNotificationAdapter";
import {
  PLATFORM_ANDROID,
  PLATFORM_IOS,
} from "@shared/utils/constants";
import {
  ESPRMNEO_EXPO_EXTRA_PUSH_KEY,
  ESPRMNEO_EXPO_PUSH_ANDROID_FCM_PROJECT_ID_KEY,
  ESPRMNEO_EXPO_PUSH_IOS_BUNDLE_ID_KEY,
  ESPRMNEO_INTEGRATION_TYPE_APNS,
  ESPRMNEO_INTEGRATION_TYPE_APNS_SANDBOX,
  ESPRMNEO_INTEGRATION_TYPE_GCM,
  ESPRMNEO_PUSH_ENDPOINT_KEY_PREFIX,
  ESPRMNEO_PUSH_PLATFORM_OTHER,
} from "../constants";
import { resolveRmneoUserIdForCustomDataStorage } from "./userCustomDataHelpers";

/**
 * `/v1/integrations` rows carry an addressing hint (`bundle_id` for Apple,
 * `project_id` for Firebase) that the installed SDK's {@link IntegrationInfo}
 * type declares as optional. The non-admin listing the app actually calls omits
 * these fields — it returns only `integration_id` / `integration_type` — so we
 * recover the identifier from `integration_id`, which always encodes it as
 * `<integration_type>_<identifier>` (e.g. `gcm_esp-novahome`,
 * `apns_com.espressif.nova`), via {@link resolveIntegrationProjectId} /
 * {@link resolveIntegrationBundleId}. Reading the explicit field first keeps
 * matching correct if the cloud later includes it (admin shape).
 */
export type RmneoPushIntegration = IntegrationInfo & {
  bundle_id?: string;
  project_id?: string;
};

/** The `{ integrationId, endpointId }` pair persisted after a successful registration. */
export interface StoredPushEndpoint {
  integrationId: string;
  endpointId: string;
}

/** Identity of the running build, used to match a push integration row. */
export interface AppPushIdentity {
  platform:
    | typeof PLATFORM_IOS
    | typeof PLATFORM_ANDROID
    | typeof ESPRMNEO_PUSH_PLATFORM_OTHER;
  /** iOS: app bundle identifier — matches `apns` / `apns_sandbox` rows. */
  bundleId?: string;
  /** Android: Firebase project id — matches `gcm` rows. */
  firebaseProjectId?: string;
  /** iOS: prefer `apns_sandbox` over `apns` (development/debug builds). */
  preferSandbox: boolean;
}

/**
 * Reads push identity overrides from Expo config.
 * @returns Configured Android project and iOS bundle identifiers.
 */
function readExtraPush(): {
  androidFcmProjectId?: string;
  iosBundleId?: string;
} {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const push = (extra[ESPRMNEO_EXPO_EXTRA_PUSH_KEY] ?? {}) as Record<
    string,
    unknown
  >;
  const androidFcmProjectIdRaw =
    push[ESPRMNEO_EXPO_PUSH_ANDROID_FCM_PROJECT_ID_KEY];
  const androidFcmProjectId =
    typeof androidFcmProjectIdRaw === "string" && androidFcmProjectIdRaw
      ? androidFcmProjectIdRaw
      : undefined;
  const iosBundleIdRaw = push[ESPRMNEO_EXPO_PUSH_IOS_BUNDLE_ID_KEY];
  const iosBundleId =
    typeof iosBundleIdRaw === "string" && iosBundleIdRaw
      ? iosBundleIdRaw
      : undefined;
  return { androidFcmProjectId, iosBundleId };
}

/**
 * Reads the live Firebase project id from the native module (Android). This is
 * the authoritative source — the project that actually mints the FCM token —
 * so it cannot drift from the compiled google-services.json. Returns undefined
 * when unavailable (iOS / CN build / older native binary) so callers fall back.
 * @returns Native Firebase project ID when available.
 */
async function readNativeFirebaseProjectId(): Promise<string | undefined> {
  try {
    const id = await ESPNotificationAdapter.getPushProjectId();
    return typeof id === "string" && id ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the running build's push identity.
 * iOS uses the bundle identifier; Android uses the Firebase project id (read
 * live from the native FirebaseApp, falling back to the build-time value in
 * `expoConfig.extra.push.androidFcmProjectId` if the native read is empty).
 * @returns Push identity for the running app build.
 */
export async function resolveAppPushIdentity(): Promise<AppPushIdentity> {
  const extraPush = readExtraPush();

  if (Platform.OS === PLATFORM_IOS) {
    const bundleId =
      Constants.expoConfig?.ios?.bundleIdentifier ??
      extraPush.iosBundleId ??
      undefined;
    return { platform: PLATFORM_IOS, bundleId, preferSandbox: __DEV__ };
  }

  if (Platform.OS === PLATFORM_ANDROID) {
    const firebaseProjectId =
      (await readNativeFirebaseProjectId()) ?? extraPush.androidFcmProjectId;
    return {
      platform: PLATFORM_ANDROID,
      firebaseProjectId,
      preferSandbox: false,
    };
  }

  return { platform: ESPRMNEO_PUSH_PLATFORM_OTHER, preferSandbox: false };
}

/**
 * Best-effort device locale as `xx_YY` (e.g. `en_US`) for the endpoint
 * registration body. Returns `undefined` when it cannot be determined.
 * @returns Device locale formatted for endpoint registration.
 */
export function resolveDeviceLocale(): string | undefined {
  try {
    const tag = Localization.getLocales?.()?.[0]?.languageTag;
    if (typeof tag === "string" && tag) {
      return tag.replace("-", "_");
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

/**
 * Recovers the `<identifier>` from an `integration_id` shaped
 * `<integration_type>_<identifier>`,
 * or `undefined` when the id does not carry the expected prefix.
 * @param integrationId - Integration row identifier.
 * @param integrationType - Expected integration type prefix.
 * @returns Embedded target identifier when present.
 */
function identifierFromIntegrationId(
  integrationId: string | undefined,
  integrationType: string,
): string | undefined {
  const prefix = `${integrationType}_`;
  if (integrationId && integrationId.startsWith(prefix)) {
    return integrationId.slice(prefix.length) || undefined;
  }
  return undefined;
}

/**
 * Firebase project id for a `gcm` row: the explicit `project_id` when the cloud
 * provides it, otherwise parsed from the `integration_id` (`gcm_<projectId>`).
 * @param integration - RMNeo push integration row.
 * @returns Firebase project ID when available.
 */
export function resolveIntegrationProjectId(
  integration: RmneoPushIntegration,
): string | undefined {
  if (integration.project_id) {
    return integration.project_id;
  }
  if (integration.integration_type === ESPRMNEO_INTEGRATION_TYPE_GCM) {
    return identifierFromIntegrationId(
      integration.integration_id,
      ESPRMNEO_INTEGRATION_TYPE_GCM,
    );
  }
  return undefined;
}

/**
 * Apple bundle id for an `apns` / `apns_sandbox` row: the explicit `bundle_id`
 * when present, otherwise parsed from the `integration_id`
 * (`apns_<bundleId>` / `apns_sandbox_<bundleId>`). The row's own
 * `integration_type` is used as the prefix, so the `apns` / `apns_sandbox`
 * overlap is handled correctly.
 * @param integration - RMNeo push integration row.
 * @returns Apple bundle ID when available.
 */
export function resolveIntegrationBundleId(
  integration: RmneoPushIntegration,
): string | undefined {
  if (integration.bundle_id) {
    return integration.bundle_id;
  }
  if (
    integration.integration_type === ESPRMNEO_INTEGRATION_TYPE_APNS ||
    integration.integration_type === ESPRMNEO_INTEGRATION_TYPE_APNS_SANDBOX
  ) {
    return identifierFromIntegrationId(
      integration.integration_id,
      integration.integration_type,
    );
  }
  return undefined;
}

/**
 * Selects the `integration_id` to register against for the current build, or
 * `null` when no confident match exists (caller should skip registration).
 *
 * The match is intentionally conservative: it never registers against a row
 * whose platform target contradicts the running build. When the target cannot
 * be disambiguated (e.g. multiple `gcm` projects and no known project id) it
 * returns `null` rather than guessing.
 * @param integrations - Available RMNeo push integrations.
 * @param identity - Running app build identity.
 * @returns Selected integration ID, or `null` when no safe match exists.
 */
export function selectPushIntegrationId(
  integrations: RmneoPushIntegration[],
  identity: AppPushIdentity,
): string | null {
  if (!integrations?.length) {
    return null;
  }

  if (identity.platform === PLATFORM_IOS) {
    const appleRows = integrations.filter(
      (integration) =>
        integration.integration_type === ESPRMNEO_INTEGRATION_TYPE_APNS ||
        integration.integration_type ===
          ESPRMNEO_INTEGRATION_TYPE_APNS_SANDBOX,
    );
    if (!appleRows.length) {
      return null;
    }

    // Scope to the app bundle id when known. If some rows are bundle-scoped but
    // none match this build, do not register (wrong app) — unless no row is
    // bundle-scoped at all, in which case fall back to all Apple rows.
    let candidates = appleRows;
    if (identity.bundleId) {
      const matching = appleRows.filter(
        (integration) =>
          resolveIntegrationBundleId(integration) === identity.bundleId,
      );
      const anyBundleScoped = appleRows.some(
        (integration) => !!resolveIntegrationBundleId(integration),
      );
      candidates = matching.length
        ? matching
        : anyBundleScoped
          ? []
          : appleRows;
    }
    if (!candidates.length) {
      return null;
    }

    const preferredType = identity.preferSandbox
      ? ESPRMNEO_INTEGRATION_TYPE_APNS_SANDBOX
      : ESPRMNEO_INTEGRATION_TYPE_APNS;
    const preferred = candidates.find(
      (integration) => integration.integration_type === preferredType,
    );
    return (preferred ?? candidates[0]).integration_id;
  }

  if (identity.platform === PLATFORM_ANDROID) {
    const gcmRows = integrations.filter(
      (integration) =>
        integration.integration_type === ESPRMNEO_INTEGRATION_TYPE_GCM,
    );
    if (!gcmRows.length) {
      return null;
    }
    if (identity.firebaseProjectId) {
      const matched = gcmRows.find(
        (integration) =>
          resolveIntegrationProjectId(integration) ===
          identity.firebaseProjectId,
      );
      if (matched) {
        return matched.integration_id;
      }
      // Known project id but no match: only safe when the project ships a
      // single gcm integration (unambiguous); otherwise skip.
      return gcmRows.length === 1 ? gcmRows[0].integration_id : null;
    }
    // Unknown project id: only safe when unambiguous.
    return gcmRows.length === 1 ? gcmRows[0].integration_id : null;
  }

  return null;
}

/**
 * Builds the namespaced AsyncStorage key for a persisted push endpoint.
 * @param userId - Stable RMNeo user identifier.
 * @returns Namespaced push endpoint storage key.
 */
function pushEndpointKey(userId: string): string {
  return `${ESPRMNEO_PUSH_ENDPOINT_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

/**
 * Persists the `{ integrationId, endpointId }` returned by
 * `registerIntegrationEndpoint`, namespaced to the RMNeo user, so the endpoint
 * can be removed on a later logout even across app restarts.
 * @param esprmngUser - Authenticated RMNeo user.
 * @param endpoint - Registered integration and endpoint IDs.
 */
export async function savePushEndpoint(
  esprmngUser: ESPRMNeoUser,
  endpoint: StoredPushEndpoint,
): Promise<void> {
  const userId = await resolveRmneoUserIdForCustomDataStorage(esprmngUser);
  await AsyncStorage.setItem(pushEndpointKey(userId), JSON.stringify(endpoint));
}

/**
 * Reads the persisted push endpoint for the RMNeo user, or `null` if none/invalid.
 * @param esprmngUser - Authenticated RMNeo user.
 * @returns Stored push endpoint or `null`.
 */
export async function readPushEndpoint(
  esprmngUser: ESPRMNeoUser,
): Promise<StoredPushEndpoint | null> {
  const userId = await resolveRmneoUserIdForCustomDataStorage(esprmngUser);
  const raw = await AsyncStorage.getItem(pushEndpointKey(userId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPushEndpoint>;
    if (
      typeof parsed?.integrationId === "string" &&
      parsed.integrationId &&
      typeof parsed?.endpointId === "string" &&
      parsed.endpointId
    ) {
      return {
        integrationId: parsed.integrationId,
        endpointId: parsed.endpointId,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Clears the persisted push endpoint for the RMNeo user.
 * @param esprmngUser - Authenticated RMNeo user.
 */
export async function clearPushEndpoint(
  esprmngUser: ESPRMNeoUser,
): Promise<void> {
  const userId = await resolveRmneoUserIdForCustomDataStorage(esprmngUser);
  await AsyncStorage.removeItem(pushEndpointKey(userId));
}
