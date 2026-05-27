/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import chip.platform.BleCallback
import java.util.UUID
import kotlin.coroutines.resume
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/**
 * BLE scan + GATT helper used by [ChipToolCommissioningActivity] to:
 *
 *  1. Scan for a commissionable Matter device advertising the standard Matter service UUID
 *     (`0xFFF6`) and matching the supplied (long or short) discriminator.
 *  2. Open a GATT connection, request an MTU and wait until services are discovered.
 *  3. Register the resulting [BluetoothGatt] with the Matter SDK so the underlying
 *     `chip::Ble` layer can drive PASE / commissioning over the BLE transport.
 *
 * This is a Kotlin port of the upstream CHIPTool helper, adapted to use the existing
 * [ChipClient]'s process-wide [chip.platform.AndroidChipPlatform] so it shares state with
 * the rest of the RainMaker Matter integration (NOC chain issuer, KVS, etc.).
 */
@ExperimentalCoroutinesApi
class ChipToolBluetoothManager(private val chipClient: ChipClient) : BleCallback {

    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var bleGatt: BluetoothGatt? = null

    /** Connection identifier returned from `AndroidBleManager.addConnection()`. */
    var connectionId: Int = 0
        private set

    /**
     * Scan BLE for a commissionable Matter device matching the supplied [discriminator].
     *
     * @param discriminator 12-bit (long) or 4-bit (short) discriminator parsed from the
     *                      onboarding payload.
     * @param isShortDiscriminator If true, only the high 4 bits of the discriminator are
     *                             matched against the advertised payload.
     * @param timeoutMs Scan timeout window in milliseconds.
     * @return The first matching [BluetoothDevice] or null if the scan times out.
     */
    suspend fun getBluetoothDevice(
        discriminator: Int,
        isShortDiscriminator: Boolean = false,
        timeoutMs: Long = SCAN_TIMEOUT_MS
    ): BluetoothDevice? {
        val adapter = bluetoothAdapter ?: run {
            Log.e(TAG, "No Bluetooth adapter available on this device")
            return null
        }
        if (!adapter.isEnabled) {
            // Best-effort: leave the responsibility of asking the user to turn BT on to the
            // calling activity. This call is silently ignored on Android 13+.
            try {
                @Suppress("DEPRECATION")
                adapter.enable()
            } catch (e: SecurityException) {
                Log.w(TAG, "Unable to enable Bluetooth adapter: ${e.message}")
            }
        }

        val scanner = adapter.bluetoothLeScanner ?: run {
            Log.e(TAG, "No bluetooth scanner found")
            return null
        }

        return withTimeoutOrNull(timeoutMs) {
            callbackFlow {
                val scanCallback = object : ScanCallback() {
                    override fun onScanResult(callbackType: Int, result: ScanResult) {
                        val device = result.device
                        Log.i(TAG, "Bluetooth device scanned: ${device.address} ${device.name}")
                        val producerScope: ProducerScope<BluetoothDevice> = this@callbackFlow
                        if (!producerScope.channel.isClosedForSend) {
                            trySend(device).isSuccess
                        }
                    }

                    override fun onScanFailed(errorCode: Int) {
                        Log.e(TAG, "BLE scan failed with errorCode=$errorCode")
                    }
                }

                val serviceData = buildServiceData(discriminator)
                val serviceDataMask = buildServiceDataMask(isShortDiscriminator)
                val scanFilter = ScanFilter.Builder()
                    .setServiceData(
                        ParcelUuid(UUID.fromString(MATTER_BLE_SERVICE_UUID)),
                        serviceData,
                        serviceDataMask
                    )
                    .build()
                val scanSettings = ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                    .build()

                Log.i(
                    TAG,
                    "Starting BLE scan for discriminator=$discriminator (short=$isShortDiscriminator)"
                )
                scanner.startScan(listOf(scanFilter), scanSettings, scanCallback)
                awaitClose { scanner.stopScan(scanCallback) }
            }.first()
        }
    }

    /**
     * Connect to [device] and suspend until services have been discovered and an MTU has
     * been negotiated.
     *
     * @return The live [BluetoothGatt] handle, ready to be passed to
     *         `ChipDeviceController.pairDevice()`, or null if connection failed.
     */
    suspend fun connect(context: Context, device: BluetoothDevice): BluetoothGatt? {
        return suspendCancellableCoroutine { continuation ->
            val callback = buildBluetoothGattCallback(continuation)
            Log.i(TAG, "Connecting to ${device.address}")
            bleGatt = device.connectGatt(context, false, callback)

            val bleManager = chipClient.getBleManager()
            connectionId = bleManager.addConnection(bleGatt)
            bleManager.setBleCallback(this)

            continuation.invokeOnCancellation { bleGatt?.disconnect() }
        }
    }

    private fun buildBluetoothGattCallback(
        continuation: CancellableContinuation<BluetoothGatt?>
    ): BluetoothGattCallback {
        return object : BluetoothGattCallback() {
            private val wrappedCallback = chipClient.getBleManager().callback

            private val stateInit = 1
            private val stateDiscoverService = 2
            private val stateRequestMtu = 3
            private var state = stateInit

            override fun onConnectionStateChange(
                gatt: BluetoothGatt?,
                status: Int,
                newState: Int
            ) {
                super.onConnectionStateChange(gatt, status, newState)
                Log.i(
                    TAG,
                    "${gatt?.device?.name}.onConnectionStateChange status=$status newState=$newState"
                )
                wrappedCallback?.onConnectionStateChange(gatt, status, newState)

                if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    state = stateDiscoverService
                    gatt?.discoverServices()
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
                Log.d(TAG, "${gatt?.device?.name}.onServicesDiscovered status=$status")
                if (state != stateDiscoverService) return
                wrappedCallback?.onServicesDiscovered(gatt, status)
                state = stateRequestMtu
                gatt?.requestMtu(MTU_SIZE)
            }

            override fun onMtuChanged(gatt: BluetoothGatt?, mtu: Int, status: Int) {
                super.onMtuChanged(gatt, mtu, status)
                Log.d(TAG, "${gatt?.device?.name}.onMtuChanged mtu=$mtu status=$status")
                if (state != stateRequestMtu) return
                wrappedCallback?.onMtuChanged(gatt, mtu, status)
                if (continuation.isActive) {
                    continuation.resume(gatt)
                }
            }

            override fun onCharacteristicChanged(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic
            ) {
                wrappedCallback?.onCharacteristicChanged(gatt, characteristic)
            }

            override fun onCharacteristicRead(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int
            ) {
                wrappedCallback?.onCharacteristicRead(gatt, characteristic, status)
            }

            override fun onCharacteristicWrite(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int
            ) {
                wrappedCallback?.onCharacteristicWrite(gatt, characteristic, status)
            }

            override fun onDescriptorRead(
                gatt: BluetoothGatt,
                descriptor: BluetoothGattDescriptor,
                status: Int
            ) {
                wrappedCallback?.onDescriptorRead(gatt, descriptor, status)
            }

            override fun onDescriptorWrite(
                gatt: BluetoothGatt,
                descriptor: BluetoothGattDescriptor,
                status: Int
            ) {
                wrappedCallback?.onDescriptorWrite(gatt, descriptor, status)
            }

            override fun onReadRemoteRssi(gatt: BluetoothGatt, rssi: Int, status: Int) {
                wrappedCallback?.onReadRemoteRssi(gatt, rssi, status)
            }

            override fun onReliableWriteCompleted(gatt: BluetoothGatt, status: Int) {
                wrappedCallback?.onReliableWriteCompleted(gatt, status)
            }
        }
    }

    override fun onCloseBleComplete(connId: Int) {
        Log.d(TAG, "onCloseBleComplete: connId=$connId")
        connectionId = 0
    }

    override fun onNotifyChipConnectionClosed(connId: Int) {
        Log.d(TAG, "onNotifyChipConnectionClosed: connId=$connId")
        bleGatt?.close()
        connectionId = 0
    }

    /**
     * Build the BLE service-data advertising payload that a Matter commissionable device
     * exposes. Format (per the Matter specification): opcode (1B) + version+discriminator
     * (12 bits discriminator, 4 bits version) packed little-endian into the next 2 bytes.
     */
    private fun buildServiceData(discriminator: Int): ByteArray {
        val opcode = 0
        val version = 0
        val versionDiscriminator = ((version and 0xf) shl 12) or (discriminator and 0xfff)
        return intArrayOf(opcode, versionDiscriminator, versionDiscriminator shr 8)
            .map { it.toByte() }
            .toByteArray()
    }

    private fun buildServiceDataMask(isShortDiscriminator: Boolean): ByteArray {
        val shortDiscriminatorMask = if (isShortDiscriminator) 0x00 else 0xff
        return intArrayOf(0xff, shortDiscriminatorMask, 0xff).map { it.toByte() }.toByteArray()
    }

    companion object {
        private const val TAG = "ChipToolBluetoothMgr"

        // Matter BLE service UUID (assigned number 0xFFF6).
        private const val MATTER_BLE_SERVICE_UUID = "0000FFF6-0000-1000-8000-00805F9B34FB"

        private const val SCAN_TIMEOUT_MS = 30_000L
        private const val MTU_SIZE = 247
    }
}
