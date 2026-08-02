Feature: Matter device commissioning
  Commission a Matter light into the RainMaker app over BLE via the Google Play
  services half-sheet, confirm it is commissioned and shown, and control it from
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
    And user completes the Google Play services commissioning
    Then the matter device should be commissioned successfully
    And device "Light" should be visible on home screen
    When user prepares the matter device power "on" for "Light"
    And user toggles the matter device power "off" for "Light" from the home screen
    Then the device log should show matter "OnOff" set to "off"
    When user toggles the matter device power "on" for "Light" from the home screen
    Then the device log should show matter "OnOff" set to "on"
    When user sets "Light" "Brightness" to "50" from the matter control screen
    Then the device log should show matter "Brightness" set to "50"
    When user sets "Light" "CCT" to "5000" from the matter control screen
    Then the device log should show matter "CCT" set to "5000"

  @sanity @rmneo_matter
  Scenario: Commission an RMNEO+Matter light via QR code and control it
    Given a matter "Light" device in commissioning mode
    When user adds a device via "scan qr"
    And user completes the Google Play services commissioning
    Then the matter device should be commissioned successfully
    And device "Matter Device" should be visible on home screen
    And the device "Matter Device" should be online on the home screen
    When user prepares the matter device power "on" for "Matter Device"
    And user toggles the matter device power "off" for "Matter Device" from the home screen
    Then the device log should show matter "OnOff" set to "off"
    When user toggles the matter device power "on" for "Matter Device" from the home screen
    Then the device log should show matter "OnOff" set to "on"
    When user sets "Matter Device" "Brightness" to "50" from the matter control screen
    Then the device log should show matter "Brightness" set to "50"
    When user sets "Matter Device" "CCT" to "5000" from the matter control screen
    Then the device log should show matter "CCT" set to "5000"
