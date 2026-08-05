Feature: Group sharing end-to-end
  A primary user names their home, shares it with a secondary user, the
  secondary accepts the invitation from the notification center, selects the
  shared home and confirms the shared device is controllable from its own
  serial log, then the primary revokes the sharing. On RMNeo the app SDK has
  not integrated the primary-side sharing lists yet, so a UI-only scenario
  covers share, accept, control and the shared-access view; cleanup runs
  through the cloud API.

  Background:
    Given the app is launched
    And user should be on login screen
    And user login with "registered user 1" and "registered user 1 password"
    And user should land on the home screen
    And a reserved online "E2E Light" device

  @sanity
  Scenario: Share a home with a secondary user, verify control and revoke
    When user opens the home sharing settings for "Home"
    And user renames the home to "Primary Home"
    And user shares the home with "registered user 2"
    When user switches to "registered user 2"
    And user opens the notification center
    And user accepts the sharing invitation from "registered user 1"
    Then a "Sharing request accepted" toast should be shown
    When user selects the home "Primary Home"
    Then device "E2E Light" should be visible on the home screen
    When the device is prepared with "Power" set to "off"
    Then the home card should show "E2E Light" power as "off"
    When user toggles "E2E Light" power to "on" from the home screen
    Then the device log should show "Power" set to "on"
    When user opens the shared home settings for "Primary Home"
    Then the home should show it is shared by "registered user 1"
    And the add user option should not be available
    And the leave home option should be available
    When user switches to "registered user 1"
    And user opens the home sharing settings for "Primary Home"
    Then "registered user 2" should be listed under "shared with"
    When user revokes home sharing for "registered user 2"
    And user opens the home sharing settings for "Primary Home"
    Then "registered user 2" should not be listed under "shared with"
    And user renames the home to "Home"