/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runtime permissions: one gate, and one helper per OS permission built on it,
 * all in rationale.ts.
 *
 * Every helper calls its OS API only inside the private `requestWithPurpose()`.
 * On the Android CN build (`usesCnPermissionFlow()`) it shows the purpose
 * dialog first and never reaches the OS on "Not now"; every other build goes
 * straight to the OS prompt.
 * Features call a helper; they never call an OS permission API themselves, and
 * import nothing but this index (lint:arch).
 *
 * Results: `use…WithPurpose()` returns expo's `[status, request]` tuple;
 * `request…()` resolves the OS response, or null on "Not now"; `ensure…()`
 * resolves true when granted (already granted: no dialog);
 * `promptBleAndLocationPermissions()` resolves true once the native request is
 * sent, because the native call does not report the answer.
 *
 * Adding a permission:
 * 1. types.ts: a PERMISSION_PURPOSE_* constant in the union, plus
 *    `permissions.purposes.<key>` {title, permissions, feature, purpose} in
 *    locales/en.json and zh.json (without them the dialog shows raw keys).
 * 2. rationale.ts: a helper that calls the OS API only inside
 *    `requestWithPurpose()`, exported from this index.
 * 3. Call it where the feature that needs it starts, never at app launch, and
 *    never through expo's `{ request: true }` (it prompts on mount, before the
 *    dialog can run).
 * 4. A native Activity that asks by itself first shows a non-cancelable
 *    AlertDialog with `permission_rationale_*` strings
 *    (ChipToolCommissioningActivity).
 */

export {
  ensureMicrophonePermission,
  ensureNotificationPermission,
  promptBleAndLocationPermissions,
  requestCameraCapturePermission,
  requestPhotoLibraryPermission,
  setPermissionRationalePresenter,
  useCameraPermissionsWithPurpose,
  usesCnPermissionFlow,
} from "./rationale";
export type { PermissionPurpose } from "./types";
