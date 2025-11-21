/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.ByteArrayInputStream
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.cert.Certificate
import java.security.cert.CertificateFactory
import java.security.spec.ECGenParameterSpec

class MatterFabricUtils {
    
    companion object {
        fun generateKeypair(fabricId: String): KeyPair {
            try {
                val keyPairGenerator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC,
                    AppConstants.KEYSTORE_ANDROID
                )
                
                val keyGenParameterSpec = KeyGenParameterSpec.Builder(
                    fabricId,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                )
                    .setAlgorithmParameterSpec(ECGenParameterSpec(AppConstants.EC_CURVE_SECP256R1))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build()
                
                keyPairGenerator.initialize(keyGenParameterSpec)
                return keyPairGenerator.generateKeyPair()
                
            } catch (e: Exception) {
                throw RuntimeException("Failed to generate key pair", e)
            }
        }

        fun decode(certPem: String): Certificate {
            try {
                val certificateFactory = CertificateFactory.getInstance(AppConstants.CERTIFICATE_TYPE_X509)
                val certBytes = certPem.toByteArray()
                val inputStream = ByteArrayInputStream(certBytes)
                return certificateFactory.generateCertificate(inputStream)
                
            } catch (e: Exception) {
                throw RuntimeException("Failed to decode certificate", e)
            }
        }
    }
}
