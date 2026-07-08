/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Headless JS Task Service for Matter commissioning operations.
 * This service runs JavaScript code even when the app UI is not visible.
 */
class MatterHeadlessTaskService : HeadlessJsTaskService() {

    companion object {
        private const val TAG = "MatterHeadlessTask"
    }

    var taskName: String? = null

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras: Bundle = intent?.extras ?: return null

        val resolvedTaskName = extras.getString(AppConstants.EXTRA_TASK_NAME)
        taskName = resolvedTaskName
        if (resolvedTaskName == null) {
            Log.e(TAG, "Task name not provided in intent")
            return null
        }

        Log.d(TAG, "Creating headless task config for: $resolvedTaskName")

        // Convert Bundle extras to WritableMap for JS
        val taskData = Arguments.createMap()

        when (taskName) {
            AppConstants.TASK_ISSUE_NOC -> {
                taskData.putString(AppConstants.EXTRA_NODE_ID, extras.getString(AppConstants.EXTRA_NODE_ID))
                taskData.putString(AppConstants.KEY_CSR, extras.getString(AppConstants.KEY_CSR))
                taskData.putString(AppConstants.KEY_FABRIC_ID_CAMEL, extras.getString(AppConstants.KEY_FABRIC_ID_CAMEL))
                taskData.putString(AppConstants.KEY_GROUP_ID_CAMEL, extras.getString(AppConstants.KEY_GROUP_ID_CAMEL))
                taskData.putString(AppConstants.KEY_REQUEST_ID_CAMEL, extras.getString(AppConstants.KEY_REQUEST_ID_CAMEL))
                extras.getString(AppConstants.KEY_NOCSR_ELEMENTS)?.let {
                    taskData.putString(AppConstants.KEY_NOCSR_ELEMENTS, it)
                }
                extras.getString(AppConstants.KEY_ATTESTATION_SIGNATURE)?.let {
                    taskData.putString(AppConstants.KEY_ATTESTATION_SIGNATURE, it)
                }
                extras.getString(AppConstants.KEY_ATTESTATION_CHALLENGE)?.let {
                    taskData.putString(AppConstants.KEY_ATTESTATION_CHALLENGE, it)
                }
            }

            AppConstants.TASK_CONFIRM_COMMISSION -> {
                taskData.putString(AppConstants.EXTRA_NODE_ID, extras.getString(AppConstants.EXTRA_NODE_ID))
                taskData.putString(AppConstants.KEY_FABRIC_ID_CAMEL, extras.getString(AppConstants.KEY_FABRIC_ID_CAMEL))
                taskData.putString(AppConstants.KEY_GROUP_ID_CAMEL, extras.getString(AppConstants.KEY_GROUP_ID_CAMEL))
                taskData.putString(AppConstants.KEY_REQUEST_ID_CAMEL, extras.getString(AppConstants.KEY_REQUEST_ID_CAMEL))
                taskData.putString(AppConstants.KEY_METADATA, extras.getString(AppConstants.KEY_METADATA))
                taskData.putString(
                    AppConstants.KEY_CHALLENGE_CAMEL,
                    extras.getString(AppConstants.KEY_CHALLENGE_CAMEL)
                )
                taskData.putString(
                    AppConstants.KEY_CHALLENGE_RESPONSE_CAMEL,
                    extras.getString(AppConstants.KEY_CHALLENGE_RESPONSE_CAMEL)
                )
            }

            else -> {
                Log.e(TAG, "Unknown task name: $taskName")
                return null
            }
        }

        // Forward SigV4 credentials from foreground to HeadlessJS for both task types
        taskData.putString(AppConstants.KEY_SIGV4_ACCESS_KEY, extras.getString(AppConstants.KEY_SIGV4_ACCESS_KEY))
        taskData.putString(AppConstants.KEY_SIGV4_SECRET_KEY, extras.getString(AppConstants.KEY_SIGV4_SECRET_KEY))
        taskData.putString(AppConstants.KEY_SIGV4_SESSION_TOKEN, extras.getString(AppConstants.KEY_SIGV4_SESSION_TOKEN))
        taskData.putString(AppConstants.KEY_SIGV4_EXPIRATION, extras.getString(AppConstants.KEY_SIGV4_EXPIRATION))

        return HeadlessJsTaskConfig(
            resolvedTaskName,
            taskData,
            60000, // Max timeout (task completes immediately on success/failure)
            true   // Allow in foreground
        )
    }

    override fun onHeadlessJsTaskStart(taskId: Int) {
        super.onHeadlessJsTaskStart(taskId)
        Log.d(TAG, "Task started: ${taskName ?: "unknown"} (taskId=$taskId)")
    }

    override fun onHeadlessJsTaskFinish(taskId: Int) {
        super.onHeadlessJsTaskFinish(taskId)
        Log.d(TAG, "Task finished: ${taskName ?: "unknown"} (taskId=$taskId)")
        stopSelf()
    }
}
