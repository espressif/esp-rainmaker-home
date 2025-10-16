/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation

extension Data {
  var hexadecimalString: String {
    return map { String(format: "%02hhx", $0) }.joined()
  }
}

class ESPMatterExtensionEcoInfo {
    
    static let shared = ESPMatterExtensionEcoInfo()
    var homesData: [String: String] = [String: String]()
    var roomsDataForHome: [String: [[String: String]]] = [String: [[String: String]]]()
    static let groupIdKey = "group.com.espressif.novahome"
    static let homesDataKey: String = "com.espressif.hmmatterdemo.homes"
    static let roomsDataKey: String = "com.espressif.hmmatterdemo.rooms"
    static let matterDevicesKey: String = "com.espressif.hmmatterdemo.devices"
    static let matterDevicesName: String = "com.espressif.hmmatterdemo.deviceName"
    static let matterStepsKey: String = "com.espressif.hmmatterdemo.step"
    static let matterUUIDKey: String = "com.espressif.hmmatterdemo.commissionerUUID"
    static let onboardingPayloadKey: String = "com.espressif.hmmatterdemo.onboardingPayload"
    static let commissioningSB: String = "ESPCommissioning"
    static let deviceId = "deviceId"
    static let deviceName = "deviceName"
    static let certDeclarationKey: String = "certificate.declaration.key"
    static let attestationInfoKey: String = "attestation.information.key"
    static let borderAgentIdKey = "com.espressif.rainmaker.boder.agent.id"
    static let extendedAddressKey = "com.espressif.rainmaker.extended.address"

    /// Save homes data
    /// - Parameter data: homes
    func saveHomesData(data: [String: String]) {
        if let homesData = try? JSONSerialization.data(withJSONObject: data) {
            let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
            localStorage.saveDataInUserDefault(data: homesData, key: ESPMatterExtensionEcoInfo.homesDataKey)
        }
    }
    
    /// Save rooms data
    /// - Parameter data: data
    func saveRoomsData(data: [String: [[String: String]]]) {
        if let roomsData = try? JSONSerialization.data(withJSONObject: data) {
            let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
            localStorage.saveDataInUserDefault(data: roomsData, key: ESPMatterExtensionEcoInfo.roomsDataKey)
        }
    }
    
    /// Fetch homes data
    /// - Returns: homes
    func fetchHomesData() -> [String: String]? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.homesDataKey), let hData = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
            return hData
        }
        return nil
    }
    
    /// Fetch rooms data
    /// - Returns: data
    func fetchRoomsData() -> [String: [[String: String]]]? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.roomsDataKey), let rData = try? JSONSerialization.jsonObject(with: data) as? [String: [[String: String]]] {
            return rData
        }
        return nil
    }
    
    /// Save mattter device data
    /// - Parameters:
    ///   - deviceId: device id
    ///   - deviceName: device name
    func saveMatterDeviceData(deviceId: UInt64, deviceName: String) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        let data = [ESPMatterExtensionEcoInfo.deviceId: deviceId as Any,
                    ESPMatterExtensionEcoInfo.deviceName: deviceName as Any]
        if let devicesData = try? JSONSerialization.data(withJSONObject: data) {
            localStorage.saveDataInUserDefault(data: devicesData, key: ESPMatterExtensionEcoInfo.matterDevicesKey)
        }
    }
    
    /// Get matter device data
    /// - Returns: matter device data
    func getMatterDeviceData() -> [String: Any]? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.matterDevicesKey), let dict = try? JSONSerialization.jsonObject(with: data, options: .mutableContainers) as? [String: Any] {
            return dict
        }
        return nil
    }
    
    /// Save step
    /// - Parameter step: setp
    func saveStep(_ step: String) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        var steps = [String]()
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.matterStepsKey), let stepsData = try? JSONSerialization.jsonObject(with: data, options: .mutableContainers) as? [String] {
            steps = stepsData
        }
        steps.append(step)
        if let data = try? JSONSerialization.data(withJSONObject: steps) {
            localStorage.saveDataInUserDefault(data: data, key: ESPMatterExtensionEcoInfo.matterStepsKey)
        }
    }
    
    /// Get steps
    /// - Returns: get all steps
    func getSteps() -> [String]? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.matterStepsKey), let dict = try? JSONSerialization.jsonObject(with: data, options: .mutableContainers) as? [String] {
            return dict
        }
        return nil
    }
    
    /// Save UUID
    /// - Parameter uuid: uuid
    func saveUUID(uuid: UUID) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = uuid.uuidString.data(using: .utf8) {
            localStorage.saveDataInUserDefault(data: data, key: ESPMatterExtensionEcoInfo.matterUUIDKey)
        }
    }
    
    /// Get uuids
    /// - Returns: uuids
    func getUUIDs() -> String? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.matterUUIDKey), let str = String(data: data, encoding: .utf8) {
            return str
        }
        return nil
    }
    
    /// Save onboarding payload
    /// - Parameter onboardingPayload: on boarding payload
    func saveOnboardingPayload(onboardingPayload: String) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = onboardingPayload.data(using: .utf8) {
            localStorage.saveDataInUserDefault(data: data, key: ESPMatterExtensionEcoInfo.onboardingPayloadKey)
        }
    }
    
    /// Get onboarding payload
    /// - Returns: payload
    func getOnboardingPayload() -> String? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.onboardingPayloadKey), let str = String(data: data, encoding: .utf8) {
            return str
        }
        return nil
    }
    
    /// Remove onboarding payload
    func removeOnboardingPayload() {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let _ = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.onboardingPayloadKey) {
            localStorage.cleanupData(forKey: ESPMatterExtensionEcoInfo.onboardingPayloadKey)
        }
    }
    
    /// Save device name
    /// - Parameter deviceName: device name
    func saveDeviceName(deviceName: String) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = deviceName.data(using: .utf8) {
            localStorage.saveDataInUserDefault(data: data, key: ESPMatterExtensionEcoInfo.matterDevicesName)
        }
    }
    
    /// Get device name
    /// - Returns: device name
    func getDeviceName() -> String? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.matterDevicesName), let str = String(data: data, encoding: .utf8) {
            return str
        }
        return nil
    }
    
    /// Remove device name
    func removeDeviceName() {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let _ = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.matterDevicesName) {
            localStorage.cleanupData(forKey: ESPMatterExtensionEcoInfo.matterDevicesName)
        }
    }
    
    /// Save certificate declaration
    /// - Parameter certDeclaration: cert declaration
    func saveCertDeclaration(certDeclaration: Data) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        localStorage.saveDataInUserDefault(data: certDeclaration, key: ESPMatterExtensionEcoInfo.certDeclarationKey)
    }
    
    /// Get certificate declaration
    /// - Returns: cert declaration data
    func getCertDeclaration() -> Data? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.certDeclarationKey) {
            localStorage.cleanupData(forKey: ESPMatterExtensionEcoInfo.certDeclarationKey)
            return data
        }
        return nil
    }
    
    /// Save attestation indo
    /// - Parameter attestationInfo: attestation info
    func saveAttestationInfo(attestationInfo: Data) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        localStorage.saveDataInUserDefault(data: attestationInfo, key: ESPMatterExtensionEcoInfo.attestationInfoKey)
    }
    
    /// Get attestation info
    /// - Returns: attestation info
    func getAttestationInfo() -> Data? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let data = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.attestationInfoKey) {
            localStorage.cleanupData(forKey: ESPMatterExtensionEcoInfo.attestationInfoKey)
            return data
        }
        return nil
    }
    
    func saveBorderAgentIdKey(borderAgentId: Data) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        
        // Convert new border agent ID to hex string
        let hexString = borderAgentId.hexadecimalString
        
        // Get existing border agent IDs
        var borderAgentIds: [String] = []
        if let existingData = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.borderAgentIdKey) {
            // Try to decode as array of strings first (new format)
            if let existingIds = try? JSONDecoder().decode([String].self, from: existingData) {
                borderAgentIds = existingIds
            } else {
                // Handle legacy format - single Data object
                borderAgentIds = [existingData.hexadecimalString]
            }
        }
        
        // Add new ID if not already present
        if !borderAgentIds.contains(hexString) {
            borderAgentIds.append(hexString)
        }
        
        // Save updated array
        if let encodedData = try? JSONEncoder().encode(borderAgentIds) {
            localStorage.saveDataInUserDefault(data: encodedData, key: ESPMatterExtensionEcoInfo.borderAgentIdKey)
        }
    }
    
    func getBorderAgentIdKey() -> [String]? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let storedData = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.borderAgentIdKey) {
            // Try to decode as array of strings first (new format)
            if let borderAgentIds = try? JSONDecoder().decode([String].self, from: storedData) {
                return borderAgentIds
            } else {
                // Handle legacy format - single Data object
                return [storedData.hexadecimalString]
            }
        }
        return nil
    }
    
    func saveExtendedAddress(extendedAddress: Data) {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        
        // Convert new border agent ID to hex string
        let hexString = extendedAddress.hexadecimalString
        
        // Get existing border agent IDs
        var extendedAddresses: [String] = []
        if let existingData = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.extendedAddressKey) {
            // Try to decode as array of strings first (new format)
            if let existingIds = try? JSONDecoder().decode([String].self, from: existingData) {
                extendedAddresses = existingIds
            } else {
                // Handle legacy format - single Data object
                extendedAddresses = [existingData.hexadecimalString]
            }
        }
        
        // Add new ID if not already present
        if !extendedAddresses.contains(hexString) {
            extendedAddresses.append(hexString)
        }
        
        // Save updated array
        if let encodedData = try? JSONEncoder().encode(extendedAddresses) {
            localStorage.saveDataInUserDefault(data: encodedData, key: ESPMatterExtensionEcoInfo.extendedAddressKey)
        }
    }
    
    func getExtendedAddress() -> [String]? {
        let localStorage = ESPMatterExtLocalStorage(ESPMatterExtensionEcoInfo.groupIdKey)
        if let storedData = localStorage.getDataFromSharedUserDefault(key: ESPMatterExtensionEcoInfo.extendedAddressKey) {
            // Try to decode as array of strings first (new format)
            if let extendedAddresses = try? JSONDecoder().decode([String].self, from: storedData) {
                return extendedAddresses
            } else {
                // Handle legacy format - single Data object
                return [storedData.hexadecimalString]
            }
        }
        return nil
    }
}
