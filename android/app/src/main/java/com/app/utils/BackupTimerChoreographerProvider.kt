/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.utils

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.internal.ChoreographerProvider
import com.facebook.react.modules.core.ReactChoreographer

/**
 * Keeps React Native's frame-driven work, JS timers included, running during our
 * Matter headless tasks when the screen sends this app no frames.
 *
 * RN fires every JS timer, even `setTimeout(fn, 0)`, only from a screen frame
 * callback. Some phones (for example some Samsung phones on One UI) send a
 * hidden app no frames at all, even while a headless task is running. During
 * Matter commissioning Google's screen covers the app, so every `fetch`
 * (which settles through `setTimeout(0)`) and every retry delay waited until
 * the app came back to the front, long after the device had given up.
 *
 * While at least one Matter task runs, each frame request also gets a backup
 * timer on the main thread; whichever comes first runs the frame and cancels
 * the other. With no Matter task running, frames come only from the screen,
 * exactly as in stock React Native.
 */
object BackupTimerChoreographerProvider : ChoreographerProvider {

    private const val TAG = "BackupFrameTimer"

    /** Longest wait for a screen frame before the backup timer runs it instead. */
    private const val BACKUP_DELAY_MS = 50L

    private val lock = Any()

    /** Matter headless tasks running now. RN replays task starts, so a set, not a count. */
    private val runningTaskIds = HashSet<Int>()

    private var choreographer: BackupTimerChoreographer? = null

    /**
     * Makes RN use this provider. Must run before React Native starts (RN only
     * keeps the first provider it is given), so call it from Application.onCreate.
     */
    fun install() {
        ReactChoreographer.initialize(this)
    }

    /** A Matter headless task started (or RN replayed its start): arm the backup. */
    fun onMatterTaskStarted(taskId: Int) {
        synchronized(lock) {
            runningTaskIds.add(taskId)
            choreographer?.setBackupArmed(runningTaskIds.isNotEmpty())
        }
    }

    /** A Matter headless task finished: disarm once none are left. */
    fun onMatterTaskFinished(taskId: Int) {
        forgetTasks { it == taskId }
    }

    /**
     * Drops tasks RN no longer runs, in case a finish was never reported to us
     * (for example the service was stopped while a task was still open).
     */
    fun forgetTasksNotRunning(isRunning: (Int) -> Boolean) {
        forgetTasks { !isRunning(it) }
    }

    private fun forgetTasks(shouldForget: (Int) -> Boolean) {
        synchronized(lock) {
            if (runningTaskIds.removeAll { shouldForget(it) }) {
                choreographer?.setBackupArmed(runningTaskIds.isNotEmpty())
            }
        }
    }

    override fun getChoreographer(): ChoreographerProvider.Choreographer {
        UiThreadUtil.assertOnUiThread()
        // Async so a layout barrier posted while the app is hidden cannot hold the backup back.
        val created = BackupTimerChoreographer(
            Choreographer.getInstance(),
            Handler.createAsync(Looper.getMainLooper()),
        )
        synchronized(lock) {
            choreographer = created
            created.setBackupArmed(runningTaskIds.isNotEmpty())
        }
        // Proves RN took this provider (it keeps only the first one it is given).
        Log.i(TAG, "React Native frames get a ${BACKUP_DELAY_MS} ms backup timer during Matter tasks")
        return created
    }

    private class BackupTimerChoreographer(
        /** Android's screen frame signal (the system Choreographer). */
        private val screenFrames: Choreographer,
        private val backupHandler: Handler,
    ) : ChoreographerProvider.Choreographer {

        private val lock = Any()

        /** RN's ReactChoreographer posts one callback only; this wraps it. */
        private var frame: PendingFrame? = null
        private var backupArmed = false

        /** Frame times handed to RN never go backwards (a screen frame time can be older). */
        private var lastFrameTimeNanos = Long.MIN_VALUE
        private var backupFramesRun = 0L

        private inner class PendingFrame(val callback: Choreographer.FrameCallback) :
            Choreographer.FrameCallback, Runnable {
            var waiting = false
            var backupPosted = false

            override fun doFrame(frameTimeNanos: Long) = runFrame(this, frameTimeNanos, fromBackup = false)

            // Same clock as screen frame times, which RN compares timer due times against.
            override fun run() = runFrame(this, System.nanoTime(), fromBackup = true)
        }

        override fun postFrameCallback(callback: Choreographer.FrameCallback) {
            synchronized(lock) {
                val current = frame
                if (current != null && current.callback !== callback) {
                    // Not RN's frame callback: plain screen frames, as stock.
                    screenFrames.postFrameCallback(callback)
                    return
                }
                val pending = current ?: PendingFrame(callback).also { frame = it }
                // Already waiting for a frame: it will run once, like a screen frame.
                if (pending.waiting) return
                pending.waiting = true
                screenFrames.postFrameCallback(pending)
                if (backupArmed) postBackup(pending)
            }
        }

        override fun removeFrameCallback(callback: Choreographer.FrameCallback) {
            synchronized(lock) {
                val pending = frame
                if (pending == null || pending.callback !== callback) {
                    screenFrames.removeFrameCallback(callback)
                    return
                }
                pending.waiting = false
                screenFrames.removeFrameCallback(pending)
                cancelBackup(pending)
            }
        }

        /** Arming while a frame already waits gives that frame its backup straight away. */
        fun setBackupArmed(armed: Boolean) {
            synchronized(lock) {
                if (backupArmed == armed) return
                backupArmed = armed
                val pending = frame ?: return
                if (armed && pending.waiting) postBackup(pending)
                if (!armed) cancelBackup(pending)
            }
        }

        private fun postBackup(pending: PendingFrame) {
            if (!pending.backupPosted) {
                pending.backupPosted = true
                backupHandler.postDelayed(pending, BACKUP_DELAY_MS)
            }
        }

        private fun cancelBackup(pending: PendingFrame) {
            if (pending.backupPosted) {
                pending.backupPosted = false
                backupHandler.removeCallbacks(pending)
            }
        }

        private fun runFrame(pending: PendingFrame, frameTimeNanos: Long, fromBackup: Boolean) {
            val deliveredTimeNanos: Long
            synchronized(lock) {
                if (!pending.waiting) return
                pending.waiting = false
                if (fromBackup) {
                    pending.backupPosted = false
                    screenFrames.removeFrameCallback(pending)
                    backupFramesRun++
                    // First one proves the screen sent no frame; then a sample, not a flood.
                    if (backupFramesRun == 1L || backupFramesRun % 200L == 0L) {
                        Log.i(TAG, "No screen frame for ${BACKUP_DELAY_MS} ms, ran frame from backup timer (count=$backupFramesRun)")
                    }
                } else {
                    cancelBackup(pending)
                }
                deliveredTimeNanos = maxOf(frameTimeNanos, lastFrameTimeNanos)
                lastFrameTimeNanos = deliveredTimeNanos
            }
            // Outside the lock: the callback usually asks for the next frame right away.
            pending.callback.doFrame(deliveredTimeNanos)
        }
    }
}
