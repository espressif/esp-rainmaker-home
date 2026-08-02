/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRegistry } from "react-native";
import {
  HEADLESS_JS_TASK_MATTER_CONFIRM_COMMISSION,
  HEADLESS_JS_TASK_MATTER_ISSUE_NOC,
} from "@shared/utils/constants";
import {
  MatterIssueNocTask,
  MatterConfirmCommissionTask,
} from "@src/tasks/matterCommissioningTask";

/**
 * Registers Android Headless JS tasks for RainMaker Matter commissioning.
 *
 * Native `MatterHeadlessTaskService` starts these by name (`AppConstants.TASK_*` in Kotlin):
 * - Issue NOC: forwards the device CSR to the RainMaker backend via SDK `issueNodeNoC`,
 *   then the response is posted back to the native ChipClient.
 * - Confirm: reports the commissioned node to the cloud and drives the UI hook.
 */
export function registerHeadlessTasks(): void {
  AppRegistry.registerHeadlessTask(
    HEADLESS_JS_TASK_MATTER_ISSUE_NOC,
    () => async (taskData: any) => {
      try {
        await MatterIssueNocTask(taskData);
      } catch (error) {
        console.error("[HeadlessJS] MatterIssueNocTask failed:", error);
        throw error;
      }
    },
  );

  AppRegistry.registerHeadlessTask(
    HEADLESS_JS_TASK_MATTER_CONFIRM_COMMISSION,
    () => async (taskData: any) => {
      try {
        await MatterConfirmCommissionTask(taskData);
      } catch (error) {
        console.error("[HeadlessJS] MatterConfirmCommissionTask failed:", error);
        throw error;
      }
    },
  );
}
