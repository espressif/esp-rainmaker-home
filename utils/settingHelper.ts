/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validates agent input fields
 * @param name - Agent name
 * @param agentId - Agent ID
 * @returns true if valid, false otherwise
 */
export const validateAgentInput = (
  name: string,
  agentId: string
): boolean => {
  return !!name.trim() && !!agentId.trim();
};

