Feature: Third-party login
  Google and Apple sign-in through the external auth surface (Chrome Custom Tab on
  Android, system auth sheet on iOS), plus the cancel path back to the login screen.

  Background:
    Given the app is launched
    And user should be on login screen

  Scenario Outline: Cancel <provider> login returns to the login screen
    When user taps the "<provider>" login button
    Then the "<provider>" auth page should open
    When user cancels the third-party login
    Then user should be on login screen

    Examples:
      | provider |
      | google   |
      | apple    |

  @sanity
  Scenario: Google login end to end
    When user taps the "google" login button
    Then the "google" auth page should open
    When user completes "google" authentication
    Then user should land on the home screen
    When user logs out of the app
    Then user should be on login screen

  @sanity
  Scenario: Apple login end to end
    When user taps the "apple" login button
    Then the "apple" auth page should open
    When user completes "apple" authentication
    Then user should land on the home screen
    When user logs out of the app
    Then user should be on login screen
