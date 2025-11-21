/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates cross-platform QA props for React Native views
 *
 * Creates a consistent set of test properties for both iOS and Android:
 * - Sets testID for Appium/accessibility testing
 * - Sets nativeID for iOS view hierarchy (required for proper accessibility tree)
 *
 * ⚠️ IMPORTANT: IDs must be in snake_case format (e.g., "button_login", "input_email")
 * This function does NOT perform automatic conversion - use snake_case manually.
 *
 * @param {string} id - The identifier to use for test props (must be in snake_case)
 * @returns {Record<string, string>} Object containing testID and nativeID properties
 *
 * @example
 * <TextInput {...testProps("input_email")} />
 * // returns { testID: "input_email", nativeID: "input_email" }
 */

export const testProps = (id: string): Record<string, string> => {
  return {
    testID: id,
    nativeID: id
  };
};
