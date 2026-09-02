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

  Scenario: Enable and disable a schedule via the inline switch
    When user opens the schedule tab
    Then user should be on schedules screen
    When user removes any existing schedules
    And user taps add schedule
    And user names the schedule "Switch Schedule"
    Then user should be on create schedule screen
    When user sets the schedule time "120" minutes ahead
    And user taps add action
    And user selects the "E2E Light" device
    And user sets action "Power" to "on"
    And user finishes the action
    And user saves the schedule
    Then user should see schedule created successfully toast
    And schedule "Switch Schedule" should be visible
    When user toggles schedule "Switch Schedule" via the inline switch
    And user toggles schedule "Switch Schedule" via the inline switch
    Then schedule "Switch Schedule" should be visible
    When user removes any existing schedules
    Then schedule "Switch Schedule" should not be visible

  Scenario: Edit an existing schedule and verify the edited time fires
    When user opens the schedule tab
    Then user should be on schedules screen
    When user removes any existing schedules
    And user taps add schedule
    And user names the schedule "Edit Schedule"
    Then user should be on create schedule screen
    When user sets the schedule time "120" minutes ahead
    And user taps add action
    And user selects the "E2E Light" device
    And user sets action "Hue" to "200"
    And user finishes the action
    And user saves the schedule
    Then user should see schedule created successfully toast
    And schedule "Edit Schedule" should be visible
    When user opens schedule "Edit Schedule" for editing
    And user renames the open schedule to "Edited Schedule"
    And user sets the schedule time "3" minutes ahead
    And user saves the schedule
    Then user should see schedule updated successfully toast
    And schedule "Edited Schedule" should be visible
    Then the device log should show "Hue" set to "200" within "250" seconds
    When user opens the schedule tab
    And user removes any existing schedules
    Then schedule "Edited Schedule" should not be visible

  @max_schedule_badge
  Scenario: Max schedules badge blocks the device in selection
    Given the device already has "10" bulk schedules
    When user opens the schedule tab
    Then user should be on schedules screen
    When user taps add schedule
    And user names the schedule "Overflow Schedule"
    Then user should be on create schedule screen
    When user sets the schedule time "120" minutes ahead
    And user taps add action
    Then the max schedules badge should be shown for the device
    When user removes all bulk schedules from the cloud
