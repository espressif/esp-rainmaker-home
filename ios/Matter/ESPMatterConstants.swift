/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation

// MARK: - Configuration Helper Extension
extension Bundle {
    /// Get configuration value from Info.plist
    /// - Parameter key: Configuration key name
    /// - Returns: Configuration value as String
    /// - Important: Fatal error if key is not found in Info.plist
    static func configValue(for key: String) -> String {
        guard let value = Bundle.main.infoDictionary?[key] as? String else {
            fatalError("\(key) not found in Info.plist")
        }
        return value
    }
    
    /// Get bundle identifier
    /// - Returns: Bundle identifier as String
    /// - Important: Fatal error if bundle identifier is not found
    static func bundleIdentifier() -> String {
        guard let value = Bundle.main.bundleIdentifier else {
            fatalError("Bundle identifier not found")
        }
        return value
    }
}

struct ESPMatterConstants {
    
    /// Matter data keys
    static var groupIdKey: String {
        return Bundle.configValue(for: "APP_GROUP_ID")
    }
    static let homesDataKey: String = "com.espressif.hmmatterdemo.homes"
    static let roomsDataKey: String = "com.espressif.hmmatterdemo.rooms"
    static let matterDevicesKey: String = "com.espressif.hmmatterdemo.devices"
    static let matterDevicesName: String = "com.espressif.hmmatterdemo.deviceName"
    static let matterStepsKey: String = "com.espressif.hmmatterdemo.step"
    static let matterUUIDKey: String = "com.espressif.hmmatterdemo.commissionerUUID"
    static let onboardingPayloadKey: String = "com.espressif.hmmatterdemo.onboardingPayload"
    static var bundleId: String {
        return Bundle.bundleIdentifier()
    }
    
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
    static let commissioningError = "COMMISSIONING_ERROR"
    static let nodeNocRequest = "NODE_NOC_REQUEST"
    static let commissioningConfirmationRequest = "COMMISSIONING_CONFIRMATION_REQUEST"
    /// RMNeo `/verify` flow events — the Neo Matter SDK's event handler switches on
    /// these names; classic RainMaker sessions never emit them.
    static let rmNeoAttestationChallenge = "RMNEO_ATTESTATION_CHALLENGE"
    static let rmNeoMatterAttestationData = "RMNEO_MATTER_ATTESTATION_DATA"

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
    static let deviceType = "deviceType"
    static let matter = "Matter"
    static let csrRequests = "csr_requests"
    static let nodeNoc = "nodeNoc"
    static let operationalCert = "operationalCert"
    static let matterNodeId = "matterNodeId"
    static let requestId = "requestId"
    static let deviceName = "deviceName"
    static let matterNodeIdKey = "matterNodeId"
    static let isRainmakerNode = "isRainmakerNode"
    /// Matter metadata flag key, aligned with reference Android/iOS apps.
    static let isRainmaker = "isRainmaker"
    static let rainmakerNodeId = "rainmakerNodeId"
    static let rmNeoNodeId = "neoNodeId"
    static let fabricDetails = "fabricDetails"
    static let rootCa = "rootCa"
    static let rootCaSnake = "root_ca"
    static let prefixCATId = "FFFFFFFD"
    static let groupCatIdAdmin = "group_cat_id_admin"
    static let groupCatIdAdminCamel = "groupCatIdAdmin"
    static let ipk = "ipk"
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
    static let cancelled = "cancelled"
    static let error = "error"
    static let errorMessage = "errorMessage"
    static let challenge = "challenge"
    static let challengeResponse = "challengeResponse"
    static let metadata = "metadata"
    /// RMNeo commissioning keys. `csrNonce` is the `/initiate` challenge the Neo SDK
    /// sets on the fabric object; its presence marks a Neo session.
    static let csrNonce = "csrNonce"
    static let nocsrElements = "nocsrElements"
    static let attestationSignature = "attestationSignature"
    static let attestationChallenge = "attestationChallenge"
    static let descriptionKey = "description"
    static let failedStatus = "failed"
    static let groupCatIdOperate = "group_cat_id_operate"
    static let groupCatIdOperateCamel = "groupCatIdOperate"

    // MARK: - Matter Data-Value Types (MTRDeviceResponseHandler representation)
    static let unsignedIntegerType = "UnsignedInteger"
    static let structureType = "Structure"
    static let arrayType = "Array"
    static let nullType = "Null"
    static let contextTag = "contextTag"

    // MARK: - Access Control Cluster (0x1F)
    static let accessControlClusterId: UInt32 = 0x1F
    static let aclAttributeId: UInt32 = 0x0
    static let aclPrivilegeAdmin: UInt64 = 5
    static let aclPrivilegeOperate: UInt64 = 3
    static let aclAuthModeCase: UInt64 = 2
    /// Context tags of the fields in an Access Control cluster ACL entry.
    static let aclPrivilegeTag = 1
    static let aclAuthModeTag = 2
    static let aclSubjectsTag = 3
    static let aclTargetsTag = 4
    static let aclFabricIndexTag = 254

    // MARK: - Error Codes
    static let invalidParams = "INVALID_PARAMS"
    static let csrGenerationFailed = "CSR_GENERATION_FAILED"
    static let commissioningFailed = "COMMISSIONING_FAILED"
    static let commissioningInProgress = "COMMISSIONING_IN_PROGRESS"
    static let invalidPayload = "INVALID_PAYLOAD"
    static let unsupportedPostMessage = "UNSUPPORTED_POST_MESSAGE"
    static let noCompletionHandler = "NO_COMPLETION_HANDLER"
    static let invalidNocResponse = "INVALID_NOC_RESPONSE"
    static let nocConversionFailed = "NOC_CONVERSION_FAILED"
    static let rootCaNotFound = "ROOT_CA_NOT_FOUND"
    static let appleCommissioningFailed = "APPLE_COMMISSIONING_FAILED"
    static let commissionNodeAfterPairingFailed = "COMMISSION_NODE_AFTER_PAIRING_FAILED"
    static let commissioningFailedPairing = "COMMISSIONING_FAILED_PAIRING"
    static let commissioningCancelled = "COMMISSIONING_CANCELLED"
    
    // MARK: - Error Messages
    static let missingRequiredParams = "Missing required parameters: groupId, fabricId, and name are required"
    static let failedToGenerateCSR = "Failed to generate CSR: %@"
    static let failedToStartCommissioning = "Failed to start commissioning: %@"
    static let commissioningInProgressMsg = "A Matter commissioning session is already in progress"
    static let commissioningStartedMsg = "Commissioning started"
    static let commissioningCancelledMsg = "Matter commissioning was cancelled"
    static let missingOnboardingPayloadMsg = "Apple's sheet returned no setup code for the device"
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
    static let controllerNotInitialized = "Matter controller not initialized"
    static let failedToParseQR = "Failed to parse QR code payload"
    static let failedToSetupSession = "Failed to setup commissioning session: %@"
    static let failedToStoreNoc = "Failed to store user NOC in Keychain"
    static let failedToStartCommissionNode = "Failed to start commission node after pairing: %@"
    static let commissioningFailedPairingMsg = "Commissioning failed in pairing delegate: %@"
    static let appleCommissioningFailedMsg = "Apple commissioning failed: %@"
    static let invalidCsrNonceMsg = "Invalid csrNonce: expected a 32-byte hex challenge from initiate"
    static let nodeNocIssuanceFailedMsg = "Node operational certificate issuance failed"
    static let aclReadReturnedNoData = "ACL read returned no data"
    
    // MARK: - Default Values
    static let defaultDeviceName = "Matter Device"
    static let unknownFabric = "Unknown Fabric"
    static let unknown = "unknown"
    static let iosMatterFramework = "IOS_MATTER_FRAMEWORK"
    static let iosCommissioningCompleted = "iOS commissioning completed successfully"
    static let confirmationResponseSent = "Confirmation response sent and commissioning completed"
    static let nocResponseProcessed = "NOC response processed successfully"
    static var ecosystemName: String {
        return Bundle.configValue(for: "MATTER_ECOSYSTEM_NAME")
    }
    
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
    static let acceptedCommands = "accepted_commands"
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

    var hexToDecimal: UInt64? {
        let scanner = Scanner(string: self)
        var value: UInt64 = 0
        if scanner.scanHexInt64(&value) {
            return value
        }
        return nil
    }
}

