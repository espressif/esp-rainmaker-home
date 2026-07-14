Feature: Schedule end-to-end
  Create a one-time schedule that sets a device parameter at a near-future
  time, verify it is listed, wait for it to fire, confirm from the device's
  own serial log that the parameter was applied, then delete it.

  Background:
    Given the app is launched
    And user should be on login screen
    And user login with "registered user 1" and "registered user 1 password"
    And user should land on the home screen
    And a reserved online "E2E Light" device

  @sanity
  Scenario: Create, fire and verify a schedule
    When user opens the schedule tab
    Then user should be on schedules screen
    When user removes any existing schedules
    And user taps add schedule
    And user names the schedule "Sanity Schedule"
    Then user should be on create schedule screen
    When user sets the schedule time "3" minutes ahead
    And user taps add action
    And user selects the "E2E Light" device
    And user sets action "Power" to "on"
    And user sets action "Hue" to "180"
    And user finishes the action
    And user saves the schedule
    Then user should see schedule created successfully toast
    And user should be on schedules screen
    And schedule "Sanity Schedule" should be visible
    Then the device log should show "Hue" set to "180", "Brightness" set to "unchanged", "Saturation" set to "unchanged" within "250" seconds
    And the app should show "Power" as "on", "Hue" as "180", "Brightness" as "unchanged", "Saturation" as "unchanged" for "E2E Light"
    When user opens the schedule tab
    And user removes any existing schedules
    Then schedule "Sanity Schedule" should not be visible
