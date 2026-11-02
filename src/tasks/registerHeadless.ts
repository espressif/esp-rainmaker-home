/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRegistry } from "react-native";
import {
  HEADLESS_ERROR_SDK_CANNOT_ADD_MATTER,
  HEADLESS_JS_TASK_MATTER_CONFIRM_COMMISSION,
  HEADLESS_JS_TASK_MATTER_ISSUE_NOC,
} from "@shared/utils/constants";
import {
  MatterIssueNocTask,
  MatterConfirmCommissionTask,
} from "@src/tasks/matterCommissioningTask";
import {
  neoMatterIssueNocTask,
  neoMatterConfirmCommissionTask,
} from "@src/tasks/matterCommissioningTask.neo";
import { getResolvedActiveSdk } from "@config/sdk.config";
import { runtimeConfigManager } from "@config/runtime.config";
import {
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNeoMatter_BASE_SDK_ID,
} from "@config/sdk.identifiers";

/** Only the two Matter SDKs can add Matter devices; any other SDK is refused. */
async function chooseTaskForActiveSdk<ClassicData, NeoData>(
  classicTask: (taskData: ClassicData) => Promise<unknown>,
  neoTask: (taskData: NeoData) => Promise<unknown>,
): Promise<
  | ((taskData: ClassicData) => Promise<unknown>)
  | ((taskData: NeoData) => Promise<unknown>)
> {
  // A task can start in a fresh background runtime: read the saved deployment
  // first, or a scanned Neo deployment would fall back to the build default.
  if (runtimeConfigManager.activeSdk === null) {
    await runtimeConfigManager.loadFromStorage();
  }
  const activeSdk = getResolvedActiveSdk();
  if (activeSdk === ESPRMNeoMatter_BASE_SDK_ID) {
    return neoTask;
  }
  if (activeSdk === ESPRMMatter_BASE_SDK_ID) {
    return classicTask;
  }
  throw new Error(`${HEADLESS_ERROR_SDK_CANNOT_ADD_MATTER}: ${activeSdk}`);
}

/**
 * Registers Android Headless JS tasks for RainMaker Matter commissioning.
 *
 * Native `MatterHeadlessTaskService` starts these by FIXED names
 * (`AppConstants.TASK_*` in Kotlin) regardless of which SDK is active, and only
 * one handler may own a name. So each handler dispatches on the active SDK
 * rather than registering a second task: the RM and Neo Matter stacks differ in
 * their cloud flow (Neo binds identity through `/verify` + `/confirm`) but share
 * this native entry point. Any other SDK is refused.
 *
 * The registered tasks:
 * - Issue NOC: forwards the device CSR to the RainMaker backend via SDK `issueNodeNoC`,
 *   then the response is posted back to the native ChipClient.
 * - Confirm: reports the commissioned node to the cloud and drives the UI hook.
 */
export function registerHeadlessTasks(): void {
  AppRegistry.registerHeadlessTask(
    HEADLESS_JS_TASK_MATTER_ISSUE_NOC,
    () => async (taskData: any) => {
      try {
        // Both stacks arrive on this one native task name; this is where their
        // cloud flows split.
        const issueCertificate = await chooseTaskForActiveSdk(
          MatterIssueNocTask,
          neoMatterIssueNocTask,
        );
        await issueCertificate(taskData);
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
        const confirmDeviceAdded = await chooseTaskForActiveSdk(
          MatterConfirmCommissionTask,
          neoMatterConfirmCommissionTask,
        );
        await confirmDeviceAdded(taskData);
      } catch (error) {
        console.error("[HeadlessJS] MatterConfirmCommissionTask failed:", error);
        throw error;
      }
    },
  );
}
