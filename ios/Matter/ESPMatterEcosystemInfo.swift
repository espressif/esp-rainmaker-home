/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation

class ESPMatterEcosystemInfo {
    
    static let shared = ESPMatterEcosystemInfo()
    
    /// Get onboarding payload
    /// - Returns: payload
    func getOnboardingPayload() -> String? {
        let localStorage = ESPLocalStorage(ESPMatterConstants.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterConstants.onboardingPayloadKey), let str = String(data: data, encoding: .utf8) {
            return str
        }
        return nil
    }
    
    /// Get device name
    /// - Returns: device name
    func getDeviceName() -> String? {
        let localStorage = ESPLocalStorage(ESPMatterConstants.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterConstants.matterDevicesName), let str = String(data: data, encoding: .utf8) {
            return str
        }
        return nil
    }
    
    /// Remove device name
    func removeDeviceName() {
        let localStorage = ESPLocalStorage(ESPMatterConstants.groupIdKey)
        if let _ = localStorage.getDataFromSharedUserDefault(key: ESPMatterConstants.matterDevicesName) {
            localStorage.cleanupData(forKey: ESPMatterConstants.matterDevicesName)
        }
    }
}
