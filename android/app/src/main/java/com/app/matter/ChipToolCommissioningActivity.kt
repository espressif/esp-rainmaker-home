/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.bluetooth.BluetoothGatt
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import chip.devicecontroller.NetworkCredentials
import com.app.R
import java.security.SecureRandom
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import matter.onboardingpayload.OnboardingPayload
import matter.onboardingpayload.OnboardingPayloadParser
import org.greenrobot.eventbus.EventBus

/**
 * Activity that performs Matter commissioning using the in-app ChipTool flow (powered by
 * `ChipDeviceController`). Selected at build time via `BuildConfig.MATTER_COMMISSIONING_METHOD`
 * and launched by [ESPMatterModule.startEcosystemCommissioning].
 *
 * Flow:
 *   1. The caller supplies the Matter onboarding payload (QR code text) via the intent extras.
 *   2. The setup payload is parsed to extract discriminator and setup PIN code.
 *   3. The user is asked for the Wi-Fi credentials the new device should join.
 *   4. A BLE scan is started (via [ChipToolBluetoothManager]) to find the commissionable
 *      device, then a GATT connection is established.
 *   5. [ChipClient.awaitPairDeviceOverBle] drives the Matter SDK through PASE + commissioning
 *      + network provisioning. During the NOC chain step the existing [ChipClient]
 *      `EspNOCChainIssuer` requests a node NOC from RainMaker and feeds it back to the
 *      device — identical to the Google Play Services back-end.
 *   6. Success / failure are posted on EventBus so [ESPMatterModule] can forward them to
 *      React Native (mirroring [MatterCommissioningActivity]'s behaviour).
 */
@ExperimentalCoroutinesApi
class ChipToolCommissioningActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "ChipToolCommissioning"
        private const val REQUEST_BLE_PERMISSIONS = 2001
        private const val BLE_SCAN_TIMEOUT_MS = 35_000L
        private const val MATTER_QR_PREFIX = "MT:"
    }

    private lateinit var progressBar: ProgressBar
    private lateinit var statusText: TextView

    private var onboardingPayload: String? = null
    private var deviceInfo: ChipToolDeviceInfo? = null
    private var chipClient: ChipClient? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chiptool_commissioning)
        progressBar = findViewById(R.id.chiptool_progress)
        statusText = findViewById(R.id.chiptool_status_text)

        // Block the back button while commissioning is in flight so the user can't leave a
        // half-paired device behind. We finish() explicitly via the cancel / failure paths.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // No-op: ChipTool flow is best left to complete or time out on its own.
            }
        })

        onboardingPayload = intent.getStringExtra(AppConstants.EXTRA_ONBOARDING_PAYLOAD)
        if (TextUtils.isEmpty(onboardingPayload)) {
            failAndFinish(getString(R.string.chiptool_status_missing_payload))
            return
        }

        deviceInfo = parseOnboardingPayload(onboardingPayload!!) ?: run {
            failAndFinish(getString(R.string.chiptool_status_invalid_payload))
            return
        }

        if (!hasRequiredBlePermissions()) {
            requestRequiredBlePermissions()
            return
        }
        promptForWiFiCredentialsAndCommission()
    }

    // ---------------------------------------------------------------------------------------
    // Wi-Fi credential prompt
    // ---------------------------------------------------------------------------------------

    private fun promptForWiFiCredentialsAndCommission() {
        val dialogView = LayoutInflater.from(this)
            .inflate(R.layout.dialog_chiptool_wifi_credentials, null)
        val ssidEditText = dialogView.findViewById<EditText>(R.id.edit_text_chiptool_ssid)
        val passwordEditText = dialogView.findViewById<EditText>(R.id.edit_text_chiptool_password)

        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.chiptool_wifi_dialog_title)
            .setView(dialogView)
            .setCancelable(false)
            .setPositiveButton(R.string.chiptool_wifi_dialog_positive, null)
            .setNegativeButton(R.string.chiptool_wifi_dialog_negative) { _, _ ->
                cancelAndFinish()
            }
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val ssid = ssidEditText.text?.toString()?.trim().orEmpty()
                val password = passwordEditText.text?.toString().orEmpty()
                if (ssid.isEmpty() || password.isEmpty()) {
                    Toast.makeText(
                        this,
                        R.string.chiptool_wifi_dialog_validation,
                        Toast.LENGTH_SHORT
                    ).show()
                    return@setOnClickListener
                }
                dialog.dismiss()
                startCommissioning(ssid, password)
            }
        }
        dialog.show()
    }

    // ---------------------------------------------------------------------------------------
    // Commissioning
    // ---------------------------------------------------------------------------------------

    private fun startCommissioning(ssid: String, password: String) {
        val info = deviceInfo ?: run {
            failAndFinish(getString(R.string.chiptool_status_invalid_payload))
            return
        }

        val fabricInfo = FabricSessionManager.getCurrentFabric()
        if (fabricInfo?.groupId.isNullOrEmpty()
            || fabricInfo?.fabricId.isNullOrEmpty()
            || fabricInfo?.rootCa.isNullOrEmpty()
            || fabricInfo?.ipk.isNullOrEmpty()
        ) {
            failAndFinish(getString(R.string.chiptool_status_missing_fabric))
            return
        }

        val client = ChipClient(
            applicationContext,
            fabricInfo!!.groupId!!,
            fabricInfo.fabricId!!,
            fabricInfo.rootCa!!,
            fabricInfo.userNoc ?: "",
            fabricInfo.ipk!!,
            fabricInfo.groupCatIdOperate ?: "",
            fabricInfo.groupCatIdAdmin ?: ""
        )
        chipClient = client
        fabricInfo.requestId?.let { client.requestId = it }
        fabricInfo.csrNonce?.let { client.csrNonce = it }
        // The headless confirm-commission task and any other native callbacks look the
        // ChipClient up via FabricSessionManager, so register the freshly-created one here
        // before kicking off pairing.
        FabricSessionManager.setCurrentChipClient(client)

        val networkCredentials = NetworkCredentials.forWiFi(
            NetworkCredentials.WiFiCredentials(ssid, password)
        )

        showStatus(R.string.chiptool_status_scanning_ble)

        lifecycleScope.launch {
            val bluetoothManager = ChipToolBluetoothManager(client)
            try {
                val device = withTimeoutOrNull(BLE_SCAN_TIMEOUT_MS) {
                    bluetoothManager.getBluetoothDevice(
                        info.discriminator,
                        info.isShortDiscriminator
                    )
                }
                if (device == null) {
                    failAndFinish(getString(R.string.chiptool_status_ble_not_found))
                    return@launch
                }

                showStatus(R.string.chiptool_status_connecting_ble)
                val gatt: BluetoothGatt? =
                    bluetoothManager.connect(this@ChipToolCommissioningActivity, device)
                if (gatt == null) {
                    failAndFinish(getString(R.string.chiptool_status_ble_not_found))
                    return@launch
                }

                showStatus(R.string.chiptool_status_pairing)
                val deviceId = generateDeviceId()
                Log.d(
                    TAG,
                    "Starting awaitPairDeviceOverBle deviceId=$deviceId " +
                        "discriminator=${info.discriminator}"
                )
                client.awaitPairDeviceOverBle(
                    deviceId,
                    gatt,
                    bluetoothManager.connectionId,
                    info.setupPinCode,
                    networkCredentials
                )

                // awaitPairDeviceOverBle suspends until the headless confirm-commission task
                // calls onCommissioningFullyComplete(). At that point the
                // EVENT_COMMISSIONING_COMPLETE has already been emitted via
                // ESPMatterModule.handleHeadlessTaskResult, so we just need to clean up
                // and dismiss the activity.
                runOnUiThread {
                    statusText.setText(R.string.chiptool_status_success)
                    progressBar.visibility = View.GONE
                    Toast.makeText(
                        this@ChipToolCommissioningActivity,
                        R.string.chiptool_status_success,
                        Toast.LENGTH_SHORT
                    ).show()
                    finish()
                }
            } catch (e: Exception) {
                Log.e(TAG, "ChipTool commissioning failed", e)
                val message = e.message ?: e.javaClass.simpleName
                failAndFinish(getString(R.string.chiptool_status_failed, message))
            }
        }
    }

    /**
     * Pick a random non-zero positive Matter node id for the new device. The operational
     * node id assigned by the RainMaker backend is independent of this and is fetched via
     * the NOC chain issuer during commissioning.
     */
    private fun generateDeviceId(): Long {
        val random = SecureRandom().nextLong() and 0x7fffffffffffffffL
        return if (random == 0L) 1L else random
    }

    // ---------------------------------------------------------------------------------------
    // Setup payload parsing
    // ---------------------------------------------------------------------------------------

    private data class ChipToolDeviceInfo(
        val discriminator: Int,
        val setupPinCode: Long,
        val isShortDiscriminator: Boolean,
        val vendorId: Int,
        val productId: Int
    )

    /**
     * Parses a Matter QR (`MT:...`) or manual pairing code into the discriminator + setup
     * PIN code required for BLE pairing. Uses the pure-Kotlin OnboardingPayloadParser to
     * avoid depending on the JNI SetupPayloadParser library, which recent connectedhomeip
     * builds no longer ship.
     */
    private fun parseOnboardingPayload(payload: String): ChipToolDeviceInfo? {
        val parser = OnboardingPayloadParser()
        val setup: OnboardingPayload = try {
            if (payload.startsWith(MATTER_QR_PREFIX)) {
                parser.parseQrCode(payload)
            } else {
                parser.parseManualPairingCode(payload)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse setup payload '$payload'", e)
            return null
        }

        return ChipToolDeviceInfo(
            // Always pass the long (12-bit) form to the Matter SDK + BLE scanner; the
            // OnboardingPayload class normalises short / long discriminators internally.
            discriminator = setup.getLongDiscriminatorValue(),
            setupPinCode = setup.setupPinCode,
            isShortDiscriminator = setup.hasShortDiscriminator,
            vendorId = setup.vendorId,
            productId = setup.productId
        )
    }

    // ---------------------------------------------------------------------------------------
    // Permissions
    // ---------------------------------------------------------------------------------------

    private fun hasRequiredBlePermissions(): Boolean {
        val required = requiredBlePermissions()
        return required.all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestRequiredBlePermissions() {
        ActivityCompat.requestPermissions(
            this,
            requiredBlePermissions().toTypedArray(),
            REQUEST_BLE_PERMISSIONS
        )
    }

    private fun requiredBlePermissions(): List<String> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_BLE_PERMISSIONS) return
        val allGranted = grantResults.isNotEmpty() &&
            grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        if (allGranted) {
            promptForWiFiCredentialsAndCommission()
        } else {
            failAndFinish(getString(R.string.chiptool_status_permission_denied))
        }
    }

    // ---------------------------------------------------------------------------------------
    // UI / lifecycle helpers
    // ---------------------------------------------------------------------------------------

    private fun showStatus(stringRes: Int) {
        runOnUiThread {
            progressBar.visibility = View.VISIBLE
            statusText.setText(stringRes)
        }
    }

    private fun cancelAndFinish() {
        notifyCommissioningFailure(getString(R.string.chiptool_status_cancelled))
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    private fun failAndFinish(message: String) {
        runOnUiThread {
            progressBar.visibility = View.GONE
            statusText.text = message
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
            notifyCommissioningFailure(message)
            finish()
        }
    }

    /**
     * Mirrors [MatterCommissioningActivity.notifyCommissioningFailure] so the React Native
     * listener wired up in `FabricSelection.tsx` receives the same MatterCommissioningEvent
     * regardless of which commissioning back-end produced the failure.
     */
    private fun notifyCommissioningFailure(message: String) {
        try {
            val bundle = Bundle().apply {
                putString(AppConstants.KEY_STATUS, AppConstants.STATUS_ERROR)
                putString(AppConstants.KEY_ERROR_MESSAGE, message)
                putString(AppConstants.KEY_ERROR_MESSAGE_CAMEL, message)
                putBoolean(AppConstants.KEY_SUCCESS, false)
                putString(
                    AppConstants.KEY_SOURCE_CAMEL,
                    AppConstants.CHIP_TOOL_COMMISSIONING_SOURCE
                )
            }
            EventBus.getDefault().post(
                MatterEvent(AppConstants.EVENT_COMMISSIONING_ERROR, bundle)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to post commissioning failure event", e)
        }
        try {
            chipClient?.onCommissioningFailed(message)
        } catch (e: Exception) {
            Log.w(TAG, "onCommissioningFailed: ${e.message}")
        }
    }

}
