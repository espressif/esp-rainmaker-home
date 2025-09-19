/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validates the email input.
 *
 * This function checks if the email input is a valid email address.
 * @param {string} email - The email to validate.
 * @returns {boolean} - True if the email is valid, false otherwise.
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    return false;
  }
  if (!emailRegex.test(String(email))) {
    return false;
  }
  return true;
};
