/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.googlesignin

import android.util.Log
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.Credential
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.app.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * ESPGoogleSignInModule — shows Google's own account picker (through Credential
 * Manager) and hands the selected account's ID token back to JS. Global flavor
 * only; the CN build ships no Google Play services.
 *
 * Returning that token is its whole job: the exchange for RainMaker tokens
 * belongs to the Base SDK, so no network call is made here.
 *
 * `BuildConfig.GOOGLE_WEB_CLIENT_ID` (synced from .env) must be the OAuth "Web
 * application" client registered as the deployment's Google identity provider —
 * the backend verifies the ID token against that audience.
 *
 * Rejection codes match the iOS module. GOOGLE_SIGN_IN_UNAVAILABLE is the one
 * carrying behaviour: JS reads it as "use the hosted browser flow instead".
 */
class ESPGoogleSignInModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ESPGoogleSignInModule"

        private const val ERROR_UNAVAILABLE = "GOOGLE_SIGN_IN_UNAVAILABLE"
        private const val ERROR_CANCELLED = "GOOGLE_SIGN_IN_CANCELLED"
        private const val ERROR_NO_ACCOUNT = "GOOGLE_NO_ACCOUNT"
        private const val ERROR_FAILED = "GOOGLE_SIGN_IN_FAILED"

        // Rejection messages, kept word for word identical to the iOS module so
        // a code always reaches JS with the same text. The platform-specific
        // cause goes to the log instead, where it does not cross the bridge.
        private const val MSG_UNAVAILABLE = "Google sign-in is not available"
        private const val MSG_CANCELLED = "Google account selection was cancelled"
        private const val MSG_NO_ACCOUNT = "No Google account found on this device"

        /**
         * True when a Google OAuth web client id has been configured for this
         * build. Without it Credential Manager cannot request a Google ID token.
         */
        private fun isConfigured(): Boolean {
            val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
            return clientId.isNotBlank() && !clientId.startsWith("your_")
        }
    }

    // Main dispatcher: getCredential shows UI on top of the current activity.
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun getName() = "ESPGoogleSignInModule"

    /**
     * Whether the native account picker can be attempted on this build. JS calls
     * this to decide between the native flow and the hosted browser flow before
     * showing any loading state.
     */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(isConfigured())
    }

    /**
     * Shows the Google account picker. Resolves with `{ idToken }` for the
     * account the user selects.
     */
    @ReactMethod
    fun signIn(promise: Promise) {
        if (!isConfigured()) {
            Log.e(TAG, "Google web client id is not configured for this build")
            promise.reject(ERROR_UNAVAILABLE, MSG_UNAVAILABLE)
            return
        }

        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            // The picker is shown on top of the caller, so without an activity
            // there is nothing to attach it to.
            Log.e(TAG, "No activity available to present the Google account picker")
            promise.reject(ERROR_UNAVAILABLE, MSG_UNAVAILABLE)
            return
        }

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(
                GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
            )
            .build()

        scope.launch {
            try {
                val result = CredentialManager.create(activity).getCredential(activity, request)
                handleCredential(result.credential, promise)
            } catch (e: GetCredentialCancellationException) {
                // Google reports a failed request the same way as a dismissed
                // picker, so log the details. A sign-in that failed instead of
                // being dismissed is usually explained by a warning from the
                // Auth tag — most often this build's signing SHA-1 not being
                // registered on the Android OAuth client.
                Log.d(TAG, "Google account selection cancelled : ${e.errorMessage}")
                // Google's own text (e.g. "[16] Account reauth failed.") stays in
                // the log above; the rejection message matches iOS word for word.
                promise.reject(ERROR_CANCELLED, MSG_CANCELLED)
            } catch (e: NoCredentialException) {
                Log.e(TAG, "No Google account available on this device", e)
                promise.reject(ERROR_NO_ACCOUNT, MSG_NO_ACCOUNT)
            } catch (e: GetCredentialProviderConfigurationException) {
                Log.e(TAG, "Credential Manager is not usable on this device", e)
                promise.reject(ERROR_UNAVAILABLE, MSG_UNAVAILABLE)
            } catch (e: GetCredentialUnsupportedException) {
                Log.e(TAG, "Credential Manager is not supported on this device", e)
                promise.reject(ERROR_UNAVAILABLE, MSG_UNAVAILABLE)
            } catch (e: GetCredentialException) {
                Log.e(TAG, "Failed to get Google credential", e)
                promise.reject(ERROR_FAILED, e.message ?: "Failed to get Google credential")
            } catch (e: CancellationException) {
                // Scope teardown (module destroyed) — the promise is settled by
                // invalidate(); rethrow so the coroutine machinery sees it.
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Unexpected failure while getting Google credential", e)
                promise.reject(ERROR_FAILED, e.message ?: "Google sign-in failed")
            }
        }
    }

    /**
     * Forgets the Google account this app signed in with, so the next sign-in
     * shows the account chooser instead of reusing the previous selection.
     * Call on logout.
     *
     * Resolves with whether the clear succeeded, and NEVER rejects: logout must
     * not fail because a credential provider was unavailable. A failure only
     * means the chooser may preselect the last account.
     */
    @ReactMethod
    fun signOut(promise: Promise) {
        val context = reactApplicationContext.applicationContext
        scope.launch {
            try {
                CredentialManager.create(context).clearCredentialState(
                    ClearCredentialStateRequest(
                        ClearCredentialStateRequest.TYPE_CLEAR_CREDENTIAL_STATE
                    )
                )
                Log.d(TAG, "Cleared Google credential state")
                promise.resolve(true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear Google credential state", e)
                promise.resolve(false)
            }
        }
    }

    private fun handleCredential(credential: Credential, promise: Promise) {
        if (credential !is CustomCredential ||
            credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            Log.e(TAG, "Unexpected credential type : ${credential.type}")
            promise.reject(ERROR_FAILED, "Unexpected credential type : ${credential.type}")
            return
        }

        try {
            val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
            Log.d(TAG, "Received Google ID token for the selected account")
            promise.resolve(
                Arguments.createMap().apply {
                    putString("idToken", googleIdTokenCredential.idToken)
                }
            )
        } catch (e: GoogleIdTokenParsingException) {
            Log.e(TAG, "Failed to parse Google ID token", e)
            promise.reject(ERROR_FAILED, "Failed to parse Google ID token")
        }
    }

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
    }
}
