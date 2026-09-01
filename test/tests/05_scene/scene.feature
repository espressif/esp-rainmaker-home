Feature: Scene end-to-end
  Create a scene that sets device parameters, verify it is listed, activate it,
  confirm from the device's own serial log that the parameters were applied,
  then delete the scene.

  Background:
    Given the app is launched
    And user should be on login screen
    And user login with "registered user 1" and "registered user 1 password"
    And user should land on the home screen
    And a reserved online "E2E Light" device

  @sanity
  Scenario: Create, activate and verify a scene
    When user opens the scene tab
    Then user should be on scenes screen
    When user removes any existing scenes
    And user taps add scene
    And user names the scene "Sanity Scene"
    Then user should be on create scene screen
    When user taps add action
    And user selects the "E2E Light" device
    And user sets action "Power" to "on"
    And user sets action "Brightness" to "50"
    And user sets action "Saturation" to "75"
    And user finishes the action
    And user saves the scene
    Then user should see scene created successfully toast
    And user should be on scenes screen
    And scene "Sanity Scene" should be visible
    When user activates scene "Sanity Scene"
    Then the device log should show "Power" set to "on", "Brightness" set to "50", "Saturation" set to "75", "Hue" set to "unchanged"
    And the app should show "Power" as "on", "Brightness" as "50", "Saturation" as "75", "Hue" as "unchanged" for "E2E Light"
    When user opens the scene tab
    And user removes any existing scenes
    Then scene "Sanity Scene" should not be visible

  Scenario: Edit an existing scene and verify the added action applies
    When user opens the scene tab
    Then user should be on scenes screen
    When user removes any existing scenes
    And user taps add scene
    And user names the scene "Edit Scene"
    Then user should be on create scene screen
    When user taps add action
    And user selects the "E2E Light" device
    And user sets action "Power" to "on"
    And user sets action "Brightness" to "40"
    And user finishes the action
    And user saves the scene
    Then user should see scene created successfully toast
    And scene "Edit Scene" should be visible
    When user opens scene "Edit Scene" for editing
    And user renames the open scene to "Edited Scene"
    And user taps add action
    And user selects the "E2E Light" device
    And user sets action "Saturation" to "80"
    And user finishes the action
    And user saves the scene
    Then user should see scene updated successfully toast
    And scene "Edited Scene" should be visible
    When user activates scene "Edited Scene"
    Then the device log should show "Brightness" set to "40", "Saturation" set to "80"
    When user opens the scene tab
    And user removes any existing scenes
    Then scene "Edited Scene" should not be visible

  Scenario: Max scenes badge blocks the device in selection
    Given the device already has "10" bulk scenes
    When user opens the scene tab
    Then user should be on scenes screen
    When user taps add scene
    And user names the scene "Overflow Scene"
    Then user should be on create scene screen
    When user taps add action
    Then the max scenes badge should be shown for the device
    When user removes all bulk scenes from the cloud
