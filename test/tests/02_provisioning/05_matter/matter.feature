Feature: Matter device commissioning
  Commission a Matter light into the RainMaker app over BLE via the Google Play
  services half-sheet and confirm the device is commissioned and shown in the app.

  Background:
    Given the app is launched
    And user should be on login screen
    And user login with "registered user 1" and "registered user 1 password"
    And user should land on the home screen

  @sanity
  Scenario: Commission a Matter light via QR code
    Given a matter "light" device in commissioning mode
    When user adds a device via "scan qr"
    And user completes the Google Play services commissioning
    Then the matter device should be commissioned successfully
    And the home screen should show a matter device
