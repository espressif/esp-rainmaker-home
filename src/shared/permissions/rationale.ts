/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { useCameraPermissions, type PermissionResponse } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
// No platform suffix: Metro resolves ESPAppUtilityAdapter.web.ts (a no-op request) on web.
import { ESPAppUtilityAdapter } from "@native-adaptors/implementations/ESPAppUtilityAdapter";
import { isCnRegion } from "@config/region.config";

import {
  PERMISSION_PURPOSE_BLE_AND_LOCATION,
  PERMISSION_PURPOSE_CAMERA,
  PERMISSION_PURPOSE_CHAT_CAMERA,
  PERMISSION_PURPOSE_MICROPHONE,
  PERMISSION_PURPOSE_NOTIFICATIONS,
  PERMISSION_PURPOSE_PHOTOS,
  type PermissionPurpose,
} from "./types";

/** Android API level from which POST_NOTIFICATIONS is a runtime permission. */
const ANDROID_TIRAMISU = 33;

/**
 * True only on the Android CN build, where app-store review requires the
 * purpose dialog before each OS prompt and no request at launch. Every other
 * build shows the OS prompts directly; Android global and iOS ask for
 * Bluetooth + location at launch.
 * @returns Whether permission requests go through the purpose dialog.
 */
export function usesCnPermissionFlow(): boolean {
  return Platform.OS === "android" && isCnRegion();
}

/**
 * Presenter registered by `<PermissionRationaleHost />`. Resolves true when the
 * user taps "Allow" in the in-app purpose dialog, false when they decline.
 */
type RationalePresenter = (purpose: PermissionPurpose) => Promise<boolean>;

let presenter: RationalePresenter | null = null;

/**
 * Registers the dialog presenter. Called once by `<PermissionRationaleHost />`
 * when it mounts; passing null on unmount clears it.
 * @param next Presenter to use, or null to unregister.
 */
export function setPermissionRationalePresenter(
  next: RationalePresenter | null,
): void {
  presenter = next;
}

/**
 * Shows the in-app permission purpose dialog and waits for the user's answer.
 *
 * The dialog names the permission, the feature that needs it and what the data
 * is used for, and it stays on screen until the user chooses (it never
 * auto-dismisses). Private: only {@link requestWithPurpose} calls it.
 *
 * If no host is mounted the call resolves false, so a mis-wired screen fails
 * closed (no silent system prompt) rather than open.
 * @param purpose Which permission group is about to be requested.
 * @returns True when the user tapped "Allow" and the OS prompt may be shown.
 */
async function confirmPermissionPurpose(
  purpose: PermissionPurpose,
): Promise<boolean> {
  if (!presenter) {
    console.warn(
      `[permissions] No rationale host mounted; refusing to request "${purpose}" without explaining its purpose.`,
    );
    return false;
  }
  return presenter(purpose);
}

/**
 * On the Android CN build shows the purpose dialog, then calls `request` only
 * after "Allow". Every other build calls `request` directly.
 * Private: every OS permission call in this file goes through it;
 * launchCameraAsync and getUserMedia, which can also prompt, are called only
 * after one of the helpers below has returned.
 * @param purpose Copy to show (`permissions.purposes.<purpose>`).
 * @param request The OS permission call. Never invoked on "Not now".
 * @returns The OS result, or null on "Not now" or with no host mounted (the OS was not asked).
 */
async function requestWithPurpose<T extends NonNullable<unknown>>(
  purpose: PermissionPurpose,
  request: () => Promise<T>,
): Promise<T | null> {
  if (usesCnPermissionFlow() && !(await confirmPermissionPurpose(purpose))) {
    return null;
  }
  return request();
}

/**
 * Camera permission for the QR scanner screens: expo-camera's permission hook
 * with the purpose dialog in front of its request.
 *
 * Mounting only reads the status (it never prompts), and the status is still
 * expo's own reactive state, so screens keep rendering on `status?.granted`.
 * @returns `[status, request]`: status is null until the first read; request
 *   resolves the OS response, or null on "Not now".
 */
export function useCameraPermissionsWithPurpose(): [
  status: PermissionResponse | null,
  request: () => Promise<PermissionResponse | null>,
] {
  const [status, requestFromOs] = useCameraPermissions();
  const request = useCallback(
    () => requestWithPurpose(PERMISSION_PURPOSE_CAMERA, requestFromOs),
    [requestFromOs],
  );
  return [status, request];
}

/**
 * Camera permission for taking a chat photo, before ImagePicker.launchCameraAsync.
 *
 * Always explains, even when the camera is already granted: below Android 10
 * the picker also asks for storage, which a camera-only check cannot see.
 * @returns The OS response, or null on "Not now".
 */
export function requestCameraCapturePermission(): Promise<ImagePicker.CameraPermissionResponse | null> {
  return requestWithPurpose(
    PERMISSION_PURPOSE_CHAT_CAMERA,
    ImagePicker.requestCameraPermissionsAsync,
  );
}

/**
 * Photo-library permission for attaching an existing image, before
 * ImagePicker.launchImageLibraryAsync.
 * @returns The OS response, or null on "Not now".
 */
export function requestPhotoLibraryPermission(): Promise<ImagePicker.MediaLibraryPermissionResponse | null> {
  return requestWithPurpose(PERMISSION_PURPOSE_PHOTOS, () =>
    ImagePicker.requestMediaLibraryPermissionsAsync(),
  );
}

/**
 * Microphone permission for two-way talk with a camera device, explaining first.
 *
 * Android only: an already-granted microphone shows no dialog. iOS and web
 * resolve true and the OS asks on getUserMedia, as before. PermissionsAndroid
 * is read only after the platform check, because react-native-web has none.
 * @returns False on "Not now", denial or error, so audio stays receive-only.
 */
export async function ensureMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }
  try {
    const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    if (await PermissionsAndroid.check(permission)) {
      return true;
    }
    const result = await requestWithPurpose(PERMISSION_PURPOSE_MICROPHONE, () =>
      PermissionsAndroid.request(permission),
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Asks for the notification permission on the Android CN build, explaining
 * first.
 *
 * The in-app dialog names the permission, the feature and what it is used for;
 * the OS prompt only follows an explicit "Allow". No-op (resolves true) on
 * every other build (Android global and iOS ask at launch) and on Android
 * versions where notifications need no runtime grant.
 * @returns True when notifications may be posted, false when declined.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!usesCnPermissionFlow()) {
    return true;
  }
  if (
    typeof Platform.Version === "number" &&
    Platform.Version < ANDROID_TIRAMISU
  ) {
    return true;
  }

  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(permission)) {
      return true;
    }
    const result = await requestWithPurpose(PERMISSION_PURPOSE_NOTIFICATIONS, () =>
      PermissionsAndroid.request(permission),
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn("[permissions] Notification permission request failed:", error);
    return false;
  }
}

/**
 * Explains, then raises the OS Bluetooth + location prompt for adding a device.
 *
 * Always explains, even when JS reads both as granted: Android counts coarse
 * location as granted but the native request asks for fine. The native call
 * is fire-and-forget and reports no answer, so callers re-read the state.
 * @returns True once the native request was sent: it reports no answer, and
 *   shows no prompt when everything is already granted. False on "Not now".
 */
export async function promptBleAndLocationPermissions(): Promise<boolean> {
  const prompted = await requestWithPurpose(
    PERMISSION_PURPOSE_BLE_AND_LOCATION,
    async () => {
      ESPAppUtilityAdapter.requestAllPermissions();
      return true;
    },
  );
  return prompted ?? false;
}
