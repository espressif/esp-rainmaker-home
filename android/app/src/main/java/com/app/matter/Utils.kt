/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.util.Log
import java.math.BigInteger

/**
 * Utility functions for Matter operations
 * Based on ESP RainMaker Android Utils implementation
 */
object Utils {

    private const val TAG = "Utils"

    /**
     * Convert a raw RainMaker CAT id hex string (e.g. "02090001") into the full Matter
     * CASE Authenticated Tag NodeId by prefixing it with [AppConstants.CAT_ID_PREFIX]
     * (`FFFFFFFD`) and parsing the resulting 64-bit value.
     *
     * This is the value the Matter SDK expects in:
     *  - `ControllerParams.setAdminSubject(...)` (passed to AddNOC, which the device puts
     *    into its ACL as the bootstrap admin subject); and
     *  - The `subjects` list of `AccessControlClusterAccessControlEntryStruct`.
     *
     * The CAT marker (`0xFFFFFFFD` in the high 32 bits) is what tells the device the
     * subject is a CAT and not a plain operational node id. Without it the device's
     * ACL check fails CommissioningComplete with `AccessControl: denied` (status 0x7e).
     *
     * @param catIdHex Hex string representation of the raw 32-bit CAT id (identifier in
     *                 the high 16 bits, version in the low 16 bits). May contain a
     *                 leading `0x` / `0X` which will be stripped.
     * @return The full 64-bit Matter NodeId for the CAT, or `0L` on parse failure /
     *         empty input.
     */
    fun getCatId(catIdHex: String): Long {
        return try {
            if (catIdHex.isEmpty()) {
                Log.w(TAG, "Empty CAT ID hex string, returning 0")
                return 0L
            }

            val cleanHex = catIdHex.removePrefix("0x").removePrefix("0X")
            val prefixedHex = AppConstants.CAT_ID_PREFIX + cleanHex

            // Use BigInteger because the resulting 64-bit value's top bit is set
            // (0xFFFFFFFD...) and would overflow Long.parseLong, but the bit pattern
            // is still a valid signed Long once narrowed via toLong().
            BigInteger(prefixedHex, 16).toLong()
        } catch (e: NumberFormatException) {
            Log.e(TAG, "Failed to parse CAT ID hex string: $catIdHex", e)
            0L
        }
    }
    
    /**
     * Convert bytes to hex string
     * 
     * @param bytes Byte array to convert
     * @return Hex string representation
     */
    fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Convert hex string to bytes
     * 
     * @param hex Hex string to convert
     * @return Byte array
     */
    fun hexToBytes(hex: String): ByteArray {
        val cleanHex = hex.removePrefix("0x").removePrefix("0X")
        return cleanHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }
}
