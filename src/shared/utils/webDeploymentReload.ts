/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * No-op on native — web uses {@link ./webDeploymentReload.web}.
 * @param _brandEncoded - Ignored on native
 */
export function reloadWebAfterDeploymentChange(_brandEncoded?: string | null): void {}
