Feature: Forgot Password
  Password recovery and reset scenarios

  Background:
    Given the app is launched
    And user should be on login screen
    And user navigates to forgot password screen

  @sanity
  Scenario: Reset password with valid email
    When user requests resets password with "registered user 1"
    And user taps "send code"
    Then user should see the code-sent title
    And user should land on the reset password page
    When user enters verification code "correct"
    And user enters new password "registered user 1 password" and confirm password "registered user 1 password"
    And user taps "confirm"
    Then user should see title "Password reset successfully"
    Then user should be on login screen

  @regression
  Scenario: Forgot password with unregistered email
    When user requests resets password with "unregistered user"
    And user taps "send code"
    Then user should see forgot password toast with title "Failed to send verification code" and message "User does not exist"


  @regression
  Scenario: Forgot password with invalid email format
    When user requests resets password with "invalid-email"
    Then user should see forgot password error "Please enter a valid email address"

  @regression
  Scenario: Reset password with invalid verification code
    When user requests resets password with "registered user 1"
    And user taps "send code"
    And user enters verification code "123456"
    And user enters new password "Welcome01" and confirm password "Welcome01"
    And user taps "confirm"
    Then user should see forgot password toast with title "Failed to reset password" and message "Verification code is incorrect"

  @regression
  Scenario: Reset password with invalid verification code length
    When user requests resets password with "registered user 1"
    And user taps "send code"
    And user enters verification code "12345"
    Then user should see forgot password error "Please enter a valid 6-digit code"

  @regression
  Scenario: Reset password with mismatched passwords
    When user requests resets password with "registered user 1"
    And user taps "send code"
    And user enters verification code "correct"
    And user enters new password "Welcome01" and confirm password "Welcome02"
    Then user should see forgot password error "Passwords do not match"

