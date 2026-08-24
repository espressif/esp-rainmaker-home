Feature: Matter device commissioning
  Commission a Matter light into the RainMaker app over BLE via the platform pairing UI
  (Google Play services half-sheet on Android, Apple's MatterSupport sheet on iOS),
  confirm it is commissioned and shown, and control it from
  both the home card and the device control screen. The esp-matter demo light
  registers as "Light"; the RMNEO+Matter light registers as "Matter Device".

  Background:
    Given the app is launched
    And user should be on login screen
    And user login with "registered user 1" and "registered user 1 password"
    And user should land on the home screen

  @sanity @matter_only
  Scenario: Commission a Matter-only (esp-matter) light via QR code and control it
    Given a matter "Light" device in commissioning mode
    When user adds a device via "scan qr"
    And user completes the ecosystem commissioning
    Then the matter device should be commissioned successfully
    And the matter device should be visible on home screen
    When user prepares the matter device power "on"
    And user toggles the matter device power "off" from the home screen
    Then the device log should show matter "OnOff" set to "off"
    When user toggles the matter device power "on" from the home screen
    Then the device log should show matter "OnOff" set to "on"
    When user sets matter "Brightness" to "50" from the matter control screen
    Then the device log should show matter "Brightness" set to "50"
    When user sets matter "CCT" to "5000" from the matter control screen
    Then the device log should show matter "CCT" set to "5000"

  @sanity @rmneo_matter
  Scenario: Commission an RMNEO+Matter light via QR code and control it
    Given a matter "Light" device in commissioning mode
    When user adds a device via "scan qr"
    And user completes the ecosystem commissioning
    Then the matter device should be commissioned successfully
    And the matter device should be visible on home screen
    And the matter device should be online on the home screen
    When user prepares the matter device power "on"
    And user toggles the matter device power "off" from the home screen
    Then the device log should show matter "OnOff" set to "off"
    When user toggles the matter device power "on" from the home screen
    Then the device log should show matter "OnOff" set to "on"
    When user sets matter "Brightness" to "50" from the matter control screen
    Then the device log should show matter "Brightness" set to "50"
    When user sets matter "CCT" to "5000" from the matter control screen
    Then the device log should show matter "CCT" set to "5000"

  @sanity @matter_only @manual_pairing
  Scenario: Commission a Matter-only (esp-matter) light via manual pairing code
    Given a matter "Light" device in commissioning mode
    When user adds a device via "manual pairing code"
    And user enters the matter pairing code
    And user completes the ecosystem commissioning
    Then the matter device should be commissioned successfully
    And the matter device should be visible on home screen
