Feature: Dynamic light params end-to-end
  Change an E2E light's params from the app — the home-card power toggle and the
  control screen's White/Colour tabs — then verify the app readback and the device's
  own serial log; over local transport and forced cloud.

  Background:
    Given the app is launched
    And user should be on login screen
    And user login with "registered user 1" and "registered user 1 password"
    And user should land on the home screen
    And a reserved online "E2E Light" device

  @sanity
  Scenario: Toggle power from the home screen card
    When the device is prepared with "Power" set to "on"
    And user toggles "E2E Light" power to "off" from the home screen
    Then the device log should show "Power" set to "off"
    And the home card should show "E2E Light" power as "off"
    When user toggles "E2E Light" power to "on" from the home screen
    Then the device log should show "Power" set to "on"

  Scenario: Control screen power and White tab brightness
    When the device is prepared with "Brightness" set to "80"
    And user opens the "E2E Light" control screen
    And user turns the device power "on" from the control screen
    And user opens the "White" tab
    And user sets "Brightness" to "40" from the control screen
    Then the device log should show "Brightness" set to "40"
    And the app should show "Power" as "on", "Brightness" as "40" for "E2E Light"

  @sanity
  Scenario: Colour tab params sync across app and device
    When the device is prepared with "Brightness" set to "80"
    And the device is prepared with "Hue" set to "90"
    And the device is prepared with "Saturation" set to "30"
    And user opens the "E2E Light" control screen
    And user opens the "Colour" tab
    And user sets "Brightness" to "40" from the control screen
    And user sets "Hue" to "200" from the control screen
    And user sets "Saturation" to "60" from the control screen
    Then the device log should show "Brightness" set to "40", "Hue" set to "200", "Saturation" set to "60"
    And the app should show "Brightness" as "40", "Hue" as "200", "Saturation" as "60" for "E2E Light"
    When the device reports "Hue" as "120"
    Then the app should show "Hue" as "120" for "E2E Light"

  Scenario: Params are delivered locally when phone and device share Wi-Fi
    Then the home card should show "E2E Light" as locally reachable
    When the device is prepared with "Brightness" set to "20"
    And user opens the "E2E Light" control screen
    And user sets "Brightness" to "70" from the control screen
    Then the device log should show "Brightness" set to "70"

  Scenario: Params are delivered over cloud when Wi-Fi is off
    When the device is prepared with "Brightness" set to "90"
    And the phone switches to mobile data only
    And user opens the "E2E Light" control screen
    And user sets "Brightness" to "30" from the control screen
    Then the device log should show "Brightness" set to "30"
    And the phone restores Wi-Fi
