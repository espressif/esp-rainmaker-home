/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React
import ESPProvision

@objc(ESPProvModule)
class ESPProvModule: NSObject, ESPDeviceConnectionDelegate, RCTBridgeModule {
  static func moduleName() -> String {
    return "ESPProvModule"
  }
  
  private var pop = ""
  private var espDevices: [String : ESPDevice] = [:]
  private var softAPPasswords: [String : String] = [:]
  private var popRecords: [String : String] = [:]
  private var resolveList: [String : RCTPromiseResolveBlock] = [:]
  
  /// Searches for ESP devices based on the provided device prefix and transport type.
  /// - Parameters:
  ///   - devicePrefix: The prefix to filter the device names.
  ///   - transport: The transport type to use for searching (e.g., BLE).
  ///   - resolve: A closure to be called with the list of found devices.
  ///   - reject: A closure to be called in case of an error.
  @objc(searchESPDevices:transport:resolve:reject:)
  func searchESPDevices(devicePrefix: String, transport: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Check if the provided transport type matches BLE (Bluetooth Low Energy)
    if (transport.lowercased() == ESPTransport.ble.rawValue.lowercased()) {
        // Attempt to initialize the transport object or fall back to BLE if invalid
        let transport = ESPTransport(rawValue: transport) ?? ESPTransport.ble
        
        // Clear any previously stored ESP devices and records
        self.espDevices.removeAll()
        self.popRecords.removeAll()
        
        // Start searching for ESP devices with the given prefix and transport type
        ESPProvisionManager.shared.searchESPDevices(devicePrefix: devicePrefix, transport: transport) { espDevices, error in
            
            // If there's an error, reject the promise with the error description
            if error != nil {
                reject("error", error?.description, nil)
                return
            }
            
            // Iterate over the discovered devices and store them in the dictionary
            espDevices?.forEach {
                self.espDevices[$0.name] = $0
            }
          
          // Resolve the promise with the array of discovered devices
          resolve(espDevices!.map {
            var result: [String: Any] = [
              "name": $0.name,
              "transport": $0.transport.rawValue,
              "security": $0.security.rawValue
            ]
            
            // Add manufacturer data if available for device parsing
            if let advertisementData = $0.advertisementData,
               let manufacturerData = advertisementData["kCBAdvDataManufacturerData"] as? Data {
              result["advertisementData"] = [
                "kCBAdvDataManufacturerData": Array(manufacturerData)
              ]
            }
            return result
          })
        }
    } else {
        // Reject the promise if the transport type is not supported
        reject("error", "\(transport) search is not supported", nil)
    }
  }
  
  /// Stops the ongoing search for ESP devices.
  @objc(stopESPDevicesSearch)
  func stopESPDevicesSearch() {
      // Call the shared instance of ESPProvisionManager to stop the ongoing search for ESP devices
      ESPProvisionManager.shared.stopESPDevicesSearch()
  }
  
  /// Creates and initializes an ESP device.
  ///
  /// - Parameters:
  ///   - name: The name of the ESP device to be created.
  ///   - transport: The transport type used to communicate with the device (e.g., BLE or SoftAP).
  ///   - security: The security level for device provisioning. Defaults to `0` (no security).
  ///   - proofOfPossession: (Optional) The proof of possession string for device authentication.
  ///   - softAPPassword: (Optional) The password for the SoftAP network.
  ///   - username: (Optional) The username for device authentication.
  ///   - resolve: A promise resolve block to return the connected device details.
  ///   - reject: A promise reject block to return an error in case of failure.
  @objc(createESPDevice:transport:security:proofOfPossession:softAPPassword:username:resolve:reject:)
  func createESPDevice(name: String, transport: String, security: NSNumber? = nil, proofOfPossession: String? = nil, softAPPassword: String? = nil, username: String? = nil, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Determine the transport type, defaulting to BLE if the provided type is invalid
    let transport = ESPTransport(rawValue: transport) ?? ESPTransport.ble
    
    // Request ESPProvisionManager to create an ESP device with the given parameters
    ESPProvisionManager.shared.createESPDevice(
      deviceName: name,
      transport: transport,
      security: ESPSecurity(rawValue: Int(truncating: security ?? 0)),
      proofOfPossession: proofOfPossession,
      softAPPassword: softAPPassword,
      username: username
    ) { espDevice, error in
      
      // Handle errors during device creation
      if error != nil {
        reject("error", error?.description, nil)
        return
      }
      
      // Store the softAP password and the device object
      self.softAPPasswords[espDevice!.name] = softAPPassword
      self.espDevices[espDevice!.name] = espDevice
      self.popRecords[espDevice!.name] = proofOfPossession
      
      resolve([
        "name": espDevice!.name,
        "transport": espDevice!.transport.rawValue,
        "security": espDevice!.security.rawValue,
      ])
    }
  }
  
  /// Connects to a specified ESP device.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device to connect to.
  ///   - resolve: A promise resolve block that is called when the connection is successfully established.
  ///   - reject: A promise reject block that is called if the connection fails or the device disconnects.
  @objc(connect:resolve:reject:)
  func connect(deviceName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
      // Check if the specified ESP device exists in the espDevices dictionary
      guard let espDevice = self.espDevices[deviceName] else {
          // Reject the promise if the device is not found, advising the user to call createESPDevice first
          reject("error", "No ESP device found. Call createESPDevice first.", nil)
          return
      }
      
      // Store the resolve block in the resolveList dictionary for this device
      resolveList[deviceName] = resolve
      
      // Attempt to connect to the ESP device
      espDevice.connect(delegate: self) { status in
          // Handle different connection statuses
          switch status {
          case .connected:
              // Resolve the promise with a success indicator (e.g., 0) upon successful connection
              resolve(0)
          case .failedToConnect(let error):
              // Reject the promise with an error description if the connection fails
              reject("error", error.description, nil)
          case .disconnected:
              // Reject the promise if the device disconnects unexpectedly
              reject("error", "Device disconnected.", nil)
          }
      }
  }

  /// Retrieves the capabilities of a specified ESP device.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device whose capabilities are to be retrieved.
  ///   - resolve: A promise resolve block that is called with the device's capabilities as a response.
  ///   - reject: A promise reject block that is called if the device is not found.
  @objc(getDeviceCapabilities:resolve:reject:)
  func getDeviceCapabilities(deviceName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
      // Check if the specified ESP device exists in the espDevices dictionary
      guard let espDevice = self.espDevices[deviceName] else {
          // Reject the promise if the device is not found
          reject("error", "No ESP device found. Call createESPDevice first.", nil)
          return
      }
      
      // Resolve the promise with the capabilities of the ESP device
      resolve(espDevice.capabilities)
  }
  
  /// Retrieves the version info of a specified ESP device.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device whose version info is to be retrieved.
  ///   - resolve: A promise resolve block that is called with the device's version info as a dictionary.
  ///   - reject: A promise reject block that is called if the device is not found.
  @objc(getDeviceVersionInfo:resolve:reject:)
  func getDeviceVersionInfo(deviceName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
      // Check if the specified ESP device exists in the espDevices dictionary
      guard let espDevice = self.espDevices[deviceName] else {
          // Reject the promise if the device is not found
          reject("error", "No ESP device found. Call createESPDevice first.", nil)
          return
      }
      
      // Convert NSDictionary to a Swift dictionary for proper serialization
      if let versionInfo = espDevice.versionInfo as? [String: Any] {
          resolve(versionInfo)
      } else {
          // Return empty dictionary if version info is not available
          resolve([:])
      }
  }
  
  /// Sets the Proof of Possession (PoP) for a specified ESP device.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device for which the PoP is to be set.
  ///   - pop: The Proof of Possession string to be associated with the device.
  ///   - resolve: A promise resolve block that confirms the PoP was set successfully.
  ///   - reject: A promise reject block to return an error if the device is not found.
  @objc(setProofOfPossession:pop:resolve:reject:)
  func setProofOfPossession(deviceName: String, pop: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
      // Check if the specified ESP device exists in the espDevices dictionary
      guard let espDevice = self.espDevices[deviceName] else {
          // Reject the promise if the device is not found, advising the user to call createESPDevice first
          reject("error", "No ESP device found. Call createESPDevice first.", nil)
          return
      }
      
      // Store the Proof of Possession (PoP) string in the popRecords dictionary
      popRecords[deviceName] = pop
      
      // Resolve the promise to indicate the operation was successful
      resolve(true)
  }
  
  /// Initializes a session with a specified ESP device.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device to initialize a session with.
  ///   - resolve: A promise resolve block that is called when the session is successfully initialized.
  ///   - reject: A promise reject block that is called if the session initialization fails or the device disconnects.
  @objc(initializeSession:resolve:reject:)
  func initializeSession(deviceName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
      // Check if the specified ESP device exists in the espDevices dictionary
      if let device = espDevices[deviceName] {
          // Attempt to connect to the ESP device
          device.connect(delegate: self) { status in
              // Handle the connection status
              switch status {
              case .connected:
                  // Resolve the promise to indicate successful session initialization
                  resolve(true)
              case .failedToConnect(let error):
                  // Reject the promise with an error description if the connection fails
                  reject("error", error.description, nil)
              case .disconnected:
                  // Reject the promise if the device disconnects unexpectedly
                  reject("error", "Device disconnected.", nil)
              }
          }
      } else {
          // Reject the promise if the device is not found in the espDevices dictionary
          reject("error", "Device not present.", nil)
      }
  }
  
  /// Scans for available Wi-Fi networks using a specified ESP device.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device used to scan for Wi-Fi networks.
  ///   - resolve: A promise resolve block that returns the scanned Wi-Fi list as an array of dictionaries containing network details.
  ///   - reject: A promise reject block that is called if the device is not found or an error occurs.
  @objc(scanWifiList:resolve:reject:)
  func scanWifiList(deviceName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
      // Check if the specified ESP device exists in the espDevices dictionary
      guard let espDevice = self.espDevices[deviceName] else {
          // Reject the promise if the device is not found, advising the user to call createESPDevice first
          reject("error", "No ESP device found. Call createESPDevice first.", nil)
          return
      }
      
      // Initiate the Wi-Fi scan using the ESP device
      espDevice.scanWifiList { wifiList, error in
          
          if error != nil {
              reject("error", "No Wi-Fi networks found.",nil)
              return
          }
          
          // Resolve the promise with the scanned Wi-Fi list, mapping each network's details
          resolve(wifiList?.map { wifi in
              [
                  "ssid": wifi.ssid,         // Network SSID
                  "rssi": wifi.rssi,         // Signal strength
                  "secure": wifi.auth.rawValue > 0 // Convert to boolean (0 = open, >0 = secure)
              ]
          })
      }
  }
  
  /// Sends data to a specified endpoint on an ESP device.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device to send data to.
  ///   - endPoint: The endpoint path on the ESP device where the data will be sent.
  ///   - data: The data to be sent, encoded as a Base64 string.
  ///   - resolve: A promise resolve block that is called with the device's response as a Base64-encoded string.
  ///   - reject: A promise reject block that is called if the device is not found, the data is not Base64-encoded, or an error occurs during communication.
  @objc(sendData:endPoint:data:resolve:reject:)
  func sendData(deviceName: String, endPoint: String, data: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
      // Check if the specified ESP device exists in the espDevices dictionary
      guard let espDevice = self.espDevices[deviceName] else {
          // Reject the promise if the device is not found
          reject("error", "No ESP device found. Call createESPDevice first.", nil)
          return
      }
      
      // Convert the input data string to UTF-8 Data
      let data: Data = data.data(using: .utf8)!
      
      // Validate that the input data is Base64-encoded
      if let data = Data(base64Encoded: data) {
          // Ensure the completion handler is invoked only once
          var invoked = false
          
          // Send the data to the specified endpoint on the ESP device
          espDevice.sendData(path: endPoint, data: data) { responseData, error in
              // Prevent multiple invocations of the completion handler
              guard !invoked else { return }
              
              if error != nil {
                  // Reject the promise with an error description if the data transmission fails
                  reject("error", error?.description, nil)
                  invoked = true
                  return
              }
              
              // Resolve the promise with the device's response as a Base64-encoded string
              resolve(responseData!.base64EncodedString())
              invoked = true
          }
      } else {
          // Reject the promise if the input data is not Base64-encoded
          reject("error", "Data is not base64 encoded.", nil)
      }
  }
  
  /// Provisions the specified ESP device with the provided Wi-Fi credentials.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device to provision.
  ///   - ssid: The SSID (network name) of the Wi-Fi network to connect the device to.
  ///   - passphrase: The passphrase (password) of the Wi-Fi network.
  ///   - resolve: A promise resolve block that is called when provisioning is successful.
  ///   - reject: A promise reject block that is called if an error occurs during provisioning.
  @objc(provision:ssid:passphrase:resolve:reject:)
  func provision(deviceName: String, ssid: String, passphrase: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
      // Check if the specified ESP device exists in the espDevices dictionary
      guard let espDevice = self.espDevices[deviceName] else {
          // Reject the promise if the device is not found
          reject("error", "No ESP device found. Call createESPDevice first.", nil)
          return
      }
      
      // Ensure the completion handler is invoked only once
      var invoked = false
      
      // Provision the ESP device with the provided SSID and passphrase
      espDevice.provision(ssid: ssid, passPhrase: passphrase) { status in
          // Prevent multiple invocations of the completion handler
          guard !invoked else { return }
          
          // Handle the different provisioning statuses
          switch status {
          case .success:
              // Resolve the promise with a success status (0)
              resolve(0)
              invoked = true
          case .failure(let error):
              // Reject the promise with the error description if provisioning fails
              reject("error", error.description, nil)
              invoked = true
          case .configApplied:
              // No action needed when configuration is successfully applied
              break
          }
      }
  }
  
  /// Disconnects the specified ESP device.
  ///
  /// - Parameters:
  ///   - deviceName: The name of the ESP device to disconnect.
  @objc(disconnect:)
  func disconnect(deviceName: String) {
      // Disconnect the ESP device if it exists in the espDevices dictionary
      self.espDevices[deviceName]?.disconnect()
  }


  // MARK: ESPDeviceConnectionDelegate
  
  func getProofOfPossesion(forDevice: ESPDevice, completionHandler: @escaping (String) -> Void) {
    if let pop = popRecords[forDevice.name] {
      completionHandler(pop)
    } else {
      if let resolve = resolveList[forDevice.name] {
        resolve(0)
      }
    }
  }
  
  func getUsername(forDevice: ESPDevice, completionHandler: @escaping (String?) -> Void) {
    completionHandler("wifiprov")
  }
}
