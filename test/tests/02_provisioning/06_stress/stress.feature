Feature: Provisioning stress and resilience
  Repeated provisioning of the same chip at a configurable scale, and
  recovery behaviour when the app or device is disrupted mid-flow.

  Background:
    Given an "ESP32C3" device
    And the app is launched
    And user should be on login screen
    And user login with "registered user 1" and "registered user 1 password"
    And user should land on the home screen

  @scale
  Scenario: Provision the same device repeatedly at the configured scale
    When the device is flashed with "led_light", "ble" transport
    Then the device provisions successfully over BLE for every scale iteration

  Scenario: App kill during provisioning recovers cleanly
    When the device is flashed with "led_light", "ble" transport
    And user taps "add device"
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
    When the app is killed and relaunched
    Then user should land on the home screen
    And the device provisions successfully over BLE once more

  Scenario: Provisioning survives app backgrounding
    When the device is flashed with "led_light", "ble" transport
    And user taps "add device"
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
    When the app is backgrounded for "20" seconds
    Then user should see all steps successful
    And continue button should be "enabled"
