/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.app.utils.BackupTimerChoreographerProvider
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

/**
 * Headless JS Task Service for Matter commissioning operations.
 * This service runs JavaScript code even when the app UI is not visible.
 */
class MatterHeadlessTaskService : HeadlessJsTaskService() {

    companion object {
        private const val TAG = "MatterHeadlessTask"

        /**
         * Task name per RN task id, kept across service instances.
         *
         * `HeadlessJsTaskContext.addTaskEventListener` replays
         * `onHeadlessJsTaskStart` for every still-active task whenever a listener
         * registers, and `HeadlessJsTaskService.invokeStartTask` registers on every
         * dispatch. So a second dispatch reports the first task again, and reading
         * the mutable `taskName` field there labels it with the wrong name — which
         * reads as a duplicate task that never happened.
         */
        private val taskNamesById = mutableMapOf<Int, String>()
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
                // Absent on the classic stack; the Neo confirm task uses it as a
                // fallback when its in-memory requestId→neoNodeId map was recycled.
                extras.getString(AppConstants.KEY_NEO_NODE_ID)?.takeIf { it.isNotEmpty() }?.let {
                    taskData.putString(AppConstants.KEY_NEO_NODE_ID, it)
                }
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
        // An id already in the map is RN replaying a task that is still running, not
        // a new dispatch; only an unseen id means JS is about to run.
        val replay = taskNamesById.containsKey(taskId)
        val name = taskNamesById.getOrPut(taskId) { taskName ?: "unknown" }
        Log.d(TAG, "Task ${if (replay) "replayed" else "started"}: $name (taskId=$taskId)")
        // Keeps JS timers (and so fetch) running while Google's screen covers the app.
        BackupTimerChoreographerProvider.onMatterTaskStarted(taskId)
    }

    override fun onHeadlessJsTaskFinish(taskId: Int) {
        super.onHeadlessJsTaskFinish(taskId)
        // Dropping the entry keeps the map bounded and frees the id for a real
        // re-dispatch; the recorded name is the one this task actually started with.
        val name = taskNamesById.remove(taskId) ?: taskName ?: "unknown"
        Log.d(TAG, "Task finished: $name (taskId=$taskId)")
        BackupTimerChoreographerProvider.onMatterTaskFinished(taskId)
        forgetFinishedTasks()
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        // A task still open when the service stops reports its finish to no one.
        forgetFinishedTasks()
    }

    /** Disarms the frame backup for any task React Native has already finished. */
    private fun forgetFinishedTasks() {
        val context = reactContext ?: return
        val tasks = HeadlessJsTaskContext.getInstance(context)
        BackupTimerChoreographerProvider.forgetTasksNotRunning { tasks.isTaskRunning(it) }
    }
}
