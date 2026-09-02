Feature: Automation end-to-end
  Create an automation (event trigger + device action), verify it is listed,
  raise the trigger event on the device, confirm from the device's own serial
  log that the action ran, then disable and delete the automation.

  Background:
    Given the app is launched
    And user should be on login screen
    And user login with "registered user 1" and "registered user 1 password"
    And user should land on the home screen
    And a reserved online "E2E Light" device

  @sanity
  Scenario: Create, trigger and verify an automation
    When user opens the automation tab
    Then user should be on automations screen
    When user removes any existing automations
    And user taps add automation
    And user names the automation "Sanity Automation"
    Then user should be on create automation screen
    When user taps add event
    And user selects the "E2E Light" event device
    And user sets event "Power" to "on"
    And user taps add action
    And user selects the "E2E Light" action device
    And user sets action "Brightness" to "50"
    And user creates the automation
    Then user should see automation created successfully toast
    And automation "Sanity Automation" should be visible
    When the device is prepared with "Brightness" set to "10"
    And the device is prepared with "Power" set to "off"
    And the device raises the automation trigger "Power" as "on"
    Then the device log should show "Brightness" set to "50", "Hue" set to "unchanged", "Saturation" set to "unchanged" within "60" seconds
    And the app should show "Brightness" as "50", "Hue" as "unchanged", "Saturation" as "unchanged" for "E2E Light"
    When user opens the automation tab
    And user disables automation "Sanity Automation"
    And user removes any existing automations
    Then automation "Sanity Automation" should not be visible

  Scenario: Automation triggers on a greater-than condition
    When user opens the automation tab
    Then user should be on automations screen
    When user removes any existing automations
    And user taps add automation
    And user names the automation "GT Automation"
    Then user should be on create automation screen
    When user taps add event
    And user selects the "E2E Light" event device
    And user sets event "Brightness" above "60"
    And user taps add action
    And user selects the "E2E Light" action device
    And user sets action "Saturation" to "90"
    And user creates the automation
    Then user should see automation created successfully toast
    And automation "GT Automation" should be visible
    When the device is prepared with "Brightness" set to "40"
    And the device is prepared with "Saturation" set to "20"
    And the device raises the automation trigger "Brightness" as "80"
    Then the device log should show "Saturation" set to "90" within "60" seconds
    When user opens the automation tab
    And user disables automation "GT Automation"
    And user removes any existing automations
    Then automation "GT Automation" should not be visible

  Scenario: Automation triggers on a less-than condition
    When user opens the automation tab
    Then user should be on automations screen
    When user removes any existing automations
    And user taps add automation
    And user names the automation "LT Automation"
    Then user should be on create automation screen
    When user taps add event
    And user selects the "E2E Light" event device
    And user sets event "Brightness" below "30"
    And user taps add action
    And user selects the "E2E Light" action device
    And user sets action "Saturation" to "35"
    And user creates the automation
    Then user should see automation created successfully toast
    And automation "LT Automation" should be visible
    When the device is prepared with "Brightness" set to "70"
    And the device is prepared with "Saturation" set to "20"
    And the device raises the automation trigger "Brightness" as "10"
    Then the device log should show "Saturation" set to "35" within "60" seconds
    When user opens the automation tab
    And user disables automation "LT Automation"
    And user removes any existing automations
    Then automation "LT Automation" should not be visible

  Scenario: Edit an existing automation and verify the updated action
    When user opens the automation tab
    Then user should be on automations screen
    When user removes any existing automations
    And user taps add automation
    And user names the automation "Edit Automation"
    Then user should be on create automation screen
    When user taps add event
    And user selects the "E2E Light" event device
    And user sets event "Power" to "on"
    And user taps add action
    And user selects the "E2E Light" action device
    And user sets action "Brightness" to "50"
    And user creates the automation
    Then user should see automation created successfully toast
    And automation "Edit Automation" should be visible
    When user opens automation "Edit Automation" for editing
    And user edits the automation action "Brightness" to "70" for "Light"
    And user updates the automation
    Then automation "Edit Automation" should be visible
    When the device is prepared with "Brightness" set to "20"
    And the device is prepared with "Power" set to "off"
    And the device raises the automation trigger "Power" as "on"
    Then the device log should show "Brightness" set to "70" within "90" seconds
    When user opens the automation tab
    And user disables automation "Edit Automation"
    And user removes any existing automations
    Then automation "Edit Automation" should not be visible
