package com.espressif.novahome.matter

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

    override fun getTaskConfig(intent: Intent): HeadlessJsTaskConfig? {
        val extras: Bundle = intent.extras ?: return null

        taskName = extras.getString(AppConstants.EXTRA_TASK_NAME)
        if (taskName == null) {
            Log.e(TAG, "Task name not provided in intent")
            return null
        }

        Log.d(TAG, "Creating headless task config for: $taskName")

        // Convert Bundle extras to WritableMap for JS
        val taskData = Arguments.createMap()

        when (taskName) {
            AppConstants.TASK_ISSUE_NOC -> {
                taskData.putString(AppConstants.EXTRA_NODE_ID, extras.getString(AppConstants.EXTRA_NODE_ID))
                taskData.putString(AppConstants.KEY_CSR, extras.getString(AppConstants.KEY_CSR))
                taskData.putString(AppConstants.KEY_FABRIC_ID_CAMEL, extras.getString(AppConstants.KEY_FABRIC_ID_CAMEL))
                taskData.putString(AppConstants.KEY_GROUP_ID_CAMEL, extras.getString(AppConstants.KEY_GROUP_ID_CAMEL))
                taskData.putString(AppConstants.KEY_REQUEST_ID_CAMEL, extras.getString(AppConstants.KEY_REQUEST_ID_CAMEL))
            }

            AppConstants.TASK_CONFIRM_COMMISSION -> {
                taskData.putString(AppConstants.EXTRA_NODE_ID, extras.getString(AppConstants.EXTRA_NODE_ID))
                taskData.putString(AppConstants.KEY_FABRIC_ID_CAMEL, extras.getString(AppConstants.KEY_FABRIC_ID_CAMEL))
                taskData.putString(AppConstants.KEY_GROUP_ID_CAMEL, extras.getString(AppConstants.KEY_GROUP_ID_CAMEL))
                taskData.putString(AppConstants.KEY_REQUEST_ID_CAMEL, extras.getString(AppConstants.KEY_REQUEST_ID_CAMEL))
                taskData.putString(AppConstants.KEY_METADATA, extras.getString(AppConstants.KEY_METADATA))
                // Challenge values passed separately as fallback in case metadata parsing fails
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

        return HeadlessJsTaskConfig(
            taskName,
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

