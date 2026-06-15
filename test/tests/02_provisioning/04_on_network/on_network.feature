Feature: On network provisioning
  Add an ESP device that is already connected to the local Wi-Fi network
  using mDNS discovery

  Background:
    Given an "ESP32C3" device
    And the app is launched
    And user should be on login screen

  @sanity
  Scenario: Successfully add ESP32C3 device discovered on network
    When the device is flashed with "led_light", "ble" transport
    And the device is online on the local network
    And user login with "registered user 1" and "registered user 1 password"
    Then user should land on the home screen
    When user taps "add device"
    Then user should be on add device selection screen
    When user taps "on network"
    Then user should be on discover devices screen
    When user selects the discovered on-network device
    Then user should be on pop screen
    When user enters the device pop
    Then user should be on provisioning page
    And user should see all steps successful
    And user should see device provisioned successfully toast
    And continue button should be "enabled"
    When user taps "continue"
    Then user should be on name device screen
    When user renames the device name to "Network Light"
    And user taps "continue"
    Then user should be on add to room screen
    When user skips adding the device to a room
    Then user should be on guide screen
    When user taps "continue"
    Then user should land on the home screen
    And device "Network Light" should be visible on home screen

  Scenario: Discover devices screen elements validation
    When user login with "registered user 1" and "registered user 1 password"
    Then user should land on the home screen
    When user taps "add device"
    Then user should be on add device selection screen
    When user taps "on network"
    Then user should be on discover devices screen
    And discover devices screen elements should be present
