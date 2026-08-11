Feature: Scan QR provisioning
  End-to-end QR provisioning flow from add device through home verification

  Background:
    Given an "ESP32C3" device
    And the device is hard reset
    And the app is launched
    And user should be on login screen

  @sanity
  Scenario: Successfully provision ESP32C3 device via scan QR (BLE)
    When the device is flashed with "led_light", "ble" transport
    And user login with "registered user 1" and "registered user 1 password"
    Then user should land on the home screen
    When user taps "add device"
    Then user should be on scan qr screen
    And device provisioning qr should be displayed for scan
    When user scans the qr code
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
    When user renames the device name to "Renamed Light"
    And user taps "continue"
    Then user should be on add to room screen
    When user skips adding the device to a room
    Then user should be on guide screen
    When user taps "continue"
    Then user should land on the home screen
    And device "Renamed Light" should be visible on home screen

  Scenario: Scan QR screen elements validation
    When user login with "registered user 1" and "registered user 1 password"
    Then user should land on the home screen
    When user taps "add device"
    Then user should be on scan qr screen
    And scan qr screen elements should be present
