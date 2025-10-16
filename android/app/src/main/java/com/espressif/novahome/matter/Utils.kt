/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.util.Log

/**
 * Utility functions for Matter operations
 * Based on ESP RainMaker Android Utils implementation
 */
object Utils {
    
    private const val TAG = "Utils"
    
    /**
     * Get CAT ID from hex string for Access Control List operations
     * 
     * @param catIdHex Hex string representation of CAT ID
     * @return Long value of CAT ID for ACL operations
     */
    fun getCatId(catIdHex: String): Long {
        return try {
            if (catIdHex.isEmpty()) {
                Log.w(TAG, "Empty CAT ID hex string, returning 0")
                return 0L
            }
            
            // Remove any 0x prefix if present
            val cleanHex = catIdHex.removePrefix("0x").removePrefix("0X")
            
            // Parse hex string to long
            val catId = cleanHex.toLong(16)
            catId
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
