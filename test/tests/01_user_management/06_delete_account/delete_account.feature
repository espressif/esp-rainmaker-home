Feature: Delete Account
  Account deletion scenarios

  Background:
    Given the app is launched
    And user should be on login screen

  @sanity
  Scenario Outline: Delete account with valid verification code
    Given user is on delete account screen for "new user"
    When user taps "delete account"
    Then user should see delete account title "A verification code has been sent to your email"
    When user enters delete account verification code "correct"
    And user taps "verify delete account"
    Then user should see delete account toast with title "Account deleted successfully" and message "<message>"
    And user should be on login screen
    Examples:
      | test_case | message |
      | valid code | "" |

  @regression
  Scenario: Delete account with invalid verification code length
    Given user is on delete account screen for "registered user 1"
    When user taps "delete account"
    And user enters delete account verification code "12345"
    Then delete account verify button should be disabled

  @regression
  Scenario: Delete account with incorrect verification code
    Given user is on delete account screen for "registered user 1"
    When user taps "delete account"
    And user enters delete account verification code "123456"
    And user taps "verify delete account"
    Then user should see delete account toast with title "Failed to delete account" and message "incorrect verification code"

  @regression
  Scenario: Delete account with resend verification code
    Given user is on delete account screen for "registered user 1"
    When user taps "delete account"
    And user should be on verification code page
    When user waits for resend verification code to be enabled
    And user taps "resend verification code"
    Then user should see delete account title "A verification code has been sent to your email"
