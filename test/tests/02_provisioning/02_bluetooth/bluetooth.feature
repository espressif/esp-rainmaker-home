Feature: Bluetooth provisioning
  Provision an ESP device over BLE: scan, select, prove possession,
  configure Wi-Fi and verify the device on the home screen

  Background:
    Given an "ESP32C3" device
    And the device is hard reset
    And the app is launched
    And user should be on login screen

  @sanity
  Scenario: Successfully provision ESP32C3 device via Bluetooth (BLE sec1)
    When the device is flashed with "led_light", "ble" transport
    And user login with "registered user 1" and "registered user 1 password"
    Then user should land on the home screen
    When user taps "add device"
    Then user should be on add device selection screen
    When user taps "bluetooth"
    Then user should be on scan bluetooth screen
    When user selects the discovered ble device
    Then user should be on pop screen
    When user enters the device pop
    Then user should be on connect wifi screen
    When user taps "join other network"
    And user enters "ssid" and "ssid_password"
    And user taps "connect"
    Then user should be on provisioning page
    And user should see all steps successful
    And user should see device provisioned successfully toast
    And continue button should be "enabled"
    When user taps "continue"
    Then user should be on name device screen
    When user renames the device name to "BLE Light"
    And user taps "continue"
    Then user should be on add to room screen
    When user skips adding the device to a room
    Then user should be on guide screen
    When user taps "continue"
    Then user should land on the home screen
    And device "BLE Light" should be visible on home screen

  Scenario: Scan bluetooth screen elements validation
    When user login with "registered user 1" and "registered user 1 password"
    Then user should land on the home screen
    When user taps "add device"
    Then user should be on add device selection screen
    When user taps "bluetooth"
    Then user should be on scan bluetooth screen
    And scan bluetooth screen elements should be present
