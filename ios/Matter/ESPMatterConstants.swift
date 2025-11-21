/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation

struct ESPMatterConstants {
    
    /// Matter data keys
    static let groupIdKey = "group.com.espressif.novahome"
    static let homesDataKey: String = "com.espressif.hmmatterdemo.homes"
    static let roomsDataKey: String = "com.espressif.hmmatterdemo.rooms"
    static let matterDevicesKey: String = "com.espressif.hmmatterdemo.devices"
    static let matterDevicesName: String = "com.espressif.hmmatterdemo.deviceName"
    static let matterStepsKey: String = "com.espressif.hmmatterdemo.step"
    static let matterUUIDKey: String = "com.espressif.hmmatterdemo.commissionerUUID"
    static let onboardingPayloadKey: String = "com.espressif.hmmatterdemo.onboardingPayload"
    static let bundleId = Bundle.main.bundleIdentifier ?? "com.espressif.nova"
    
    /// Device ID storage
    static let chipDeviceId: String = "ChipDeviceId"
    
    /// Cluster names (used in extension)
    static let onOffCluster = "OnOff Cluster"
    static let tempMeasurementCluster = "Termperature Measurement Cluster"
    
    /// API response keys
    static let type = "type"
    static let UTF8String = "UTF8String"
    static let data = "data"
    static let value = "value"
    
    /// Matter device types
    static let pureMatterDeviceType = "pure_matter"
    
    // MARK: - Queue Labels
    static let csrQueueLabel = "com.esp.matter.csr.queue"
    static let matterQueueLabel = "com.esp.matter.commissioning.queue"
    
    // MARK: - Event Identifiers
    static let matterEventIdentifier = "MatterCommissioningEvent"
    static let eventType = "eventType"
    static let requestBody = "requestBody"
    
    // MARK: - Event Types
    static let commissioningComplete = "COMMISSIONING_COMPLETE"
    static let nodeNocRequest = "NODE_NOC_REQUEST"
    static let commissioningConfirmationRequest = "COMMISSIONING_CONFIRMATION_REQUEST"
    
    // MARK: - Dictionary Keys
    static let groupId = "groupId"
    static let fabricId = "fabricId"
    static let name = "name"
    static let groupIdKeyDict = "group_id"
    static let csr = "csr"
    static let operation = "operation"
    static let operationAdd = "add"
    static let csrType = "csr_type"
    static let user = "user"
    static let deviceType = "device_type"
    static let matter = "Matter"
    static let csrRequests = "csr_requests"
    static let nodeNoc = "nodeNoc"
    static let operationalCert = "operationalCert"
    static let matterNodeId = "matterNodeId"
    static let requestId = "requestId"
    static let deviceName = "deviceName"
    static let matterNodeIdKey = "matterNodeId"
    static let isRainmakerNode = "isRainmakerNode"
    static let rainmakerNodeId = "rainmakerNodeId"
    static let fabricDetails = "fabricDetails"
    static let rootCa = "rootCa"
    static let userNOC = "userNOC"
    static let userNoc = "userNoc"
    static let matterUserId = "matterUserId"
    static let timestamp = "timestamp"
    static let id = "id"
    static let deviceId = "deviceId"
    static let fabricName = "fabricName"
    static let message = "message"
    static let source = "source"
    static let status = "status"
    static let success = "success"
    static let error = "error"
    static let challenge = "challenge"
    static let challengeResponse = "challengeResponse"
    static let metadata = "metadata"
    
    // MARK: - Error Codes
    static let invalidParams = "INVALID_PARAMS"
    static let csrGenerationFailed = "CSR_GENERATION_FAILED"
    static let commissioningFailed = "COMMISSIONING_FAILED"
    static let invalidPayload = "INVALID_PAYLOAD"
    static let unsupportedPostMessage = "UNSUPPORTED_POST_MESSAGE"
    static let noCompletionHandler = "NO_COMPLETION_HANDLER"
    static let invalidNocResponse = "INVALID_NOC_RESPONSE"
    static let nocConversionFailed = "NOC_CONVERSION_FAILED"
    static let rootCaNotFound = "ROOT_CA_NOT_FOUND"
    static let appleCommissioningFailed = "APPLE_COMMISSIONING_FAILED"
    static let pairingFailed = "PAIRING_FAILED"
    static let commissionNodeAfterPairingFailed = "COMMISSION_NODE_AFTER_PAIRING_FAILED"
    static let commissioningFailedPairing = "COMMISSIONING_FAILED_PAIRING"
    
    // MARK: - Error Messages
    static let missingRequiredParams = "Missing required parameters: groupId, fabricId, and name are required"
    static let failedToGenerateCSR = "Failed to generate CSR: %@"
    static let failedToStartCommissioning = "Failed to start commissioning: %@"
    static let postMessageRequiresType = "postMessage requires a valid type field"
    static let postMessageRequiresData = "postMessage requires a valid data field"
    static let unsupportedPostMessageType = "Unsupported postMessage event type: %@"
    static let noNocCompletionHandler = "No NOC completion handler available"
    static let missingRequiredNocData = "Missing required NOC data in response"
    static let failedToConvertNoc = "Failed to convert NOC from PEM to DER format"
    static let failedToGetRootCa = "Failed to get root CA certificate from fabric"
    static let rootCaNotFoundMsg = "Root CA certificate not found"
    static let fabricNameRequired = "Fabric name is required for commissioning"
    static let matterRequiresIOS164 = "Matter commissioning requires iOS 16.4 or later"
    static let fabricIdRequired = "Fabric ID is required for custom commissioning"
    static let userNocNotFound = "User NOC not found for fabric: %@. Please generate user NOC first."
    static let fabricIdRequiredForInit = "Fabric ID is required for Matter controller initialization"
    static let userNocDataNotFound = "User NOC data not found in Keychain for fabric: %@"
    static let failedToStartFactory = "Failed to start Matter controller factory: %@"
    static let failedToConvertCerts = "Failed to convert certificates from PEM to DER format"
    static let failedToCreateController = "Failed to create Matter controller: %@"
    static let controllerNilAfterCreation = "Matter controller is nil after creation"
    static let controllerNotInitialized = "Matter controller not initialized"
    static let failedToParseQR = "Failed to parse QR code payload"
    static let failedToSetupSession = "Failed to setup commissioning session: %@"
    static let failedToStoreNoc = "Failed to store user NOC in Keychain"
    static let pairingFailedMsg = "Pairing failed: %@"
    static let failedToStartCommissionNode = "Failed to start commission node after pairing: %@"
    static let commissioningFailedPairingMsg = "Commissioning failed in pairing delegate: %@"
    static let appleCommissioningFailedMsg = "Apple commissioning failed: %@"
    
    // MARK: - Default Values
    static let defaultDeviceName = "Matter Device"
    static let unknownFabric = "Unknown Fabric"
    static let unknown = "unknown"
    static let iosMatterFramework = "IOS_MATTER_FRAMEWORK"
    static let iosCommissioningCompleted = "iOS commissioning completed successfully"
    static let confirmationResponseSent = "Confirmation response sent and commissioning completed"
    static let nocResponseProcessed = "NOC response processed successfully"
    static let ecosystemName = "ESP RainMaker Home"
    
    // MARK: - Post Message Types
    static let issueNodeNocResponse = "ISSUE_NODE_NOC_RESPONSE"
    static let commissioningConfirmationResponse = "COMMISSIONING_CONFIRMATION_RESPONSE"
    static let csrGenerationResponse = "CSR_GENERATION_RESPONSE"
    static let fabricCreationResponse = "FABRIC_CREATION_RESPONSE"
    static let startCommissioningResponse = "START_COMMISSIONING_RESPONSE"
    
    // MARK: - Storage Keys
    static let userNocPrefix = "user_noc_"
    static let matterDeviceInfoPrefix = "matter_device_info_"
    static let matterClustersPrefix = "matter_clusters_"
    
    // MARK: - Domain
    static let moduleDomain = "ESPMatterModule"
    
    // MARK: - PEM Headers
    static let beginCertificateRequest = "-----BEGIN CERTIFICATE REQUEST-----"
    static let endCertificateRequest = "-----END CERTIFICATE REQUEST-----"
    static let beginCertificate = "-----BEGIN CERTIFICATE-----"
    static let endCertificate = "-----END CERTIFICATE-----"
    
    // MARK: - Format Strings
    static let matterNodeIdFormat = "%016llX"
    
    // MARK: - JSON Format Keys
    static let attributes = "attributes"
    static let clusters = "clusters"
    static let endpoints = "endpoints"
    static let servers = "servers"
    static let clients = "clients"
}

extension String {
    
    var clusterId: UInt? {
        if self == ESPMatterConstants.onOffCluster {
            return 6
        }
        if self == ESPMatterConstants.tempMeasurementCluster {
            return 1026
        }
        return nil
    }
}

