Feature: Login
  Simple login testing scenarios

  Background:
    Given the app is launched
    And user should be on login screen

  @sanity
  Scenario: Successful login with correct credentials
    When user login with "registered user 1" and "registered user 1 password"
    Then user should land on the home screen

  Scenario: Invalid email format
    When user login with "invalid-email" and "password123"
    Then login button should be disabled
    And user should be on login screen

  Scenario: Wrong password
    When user login with "registered user 1" and "wrongpassword"
    Then user should see toast with title "Sign in failed" and message "wrong credentials"
    And user should be on login screen

  Scenario: Empty credentials validation
    When user check login button state
    Then login button should be disabled

  Scenario: Screen elements validation
    Then all elements should be present

  Scenario Outline: Multiple valid users
    When user login with "<email>" and "<password>"
    Then user should land on the home screen

    Examples:
      | email                    | password   |
      | registered user 1        | registered user 1 password  |
      | registered user 2        | registered user 2 password  |


  Scenario: Forgot password navigation
    When user taps "forgot password"
    Then user should land on forgot password screen

  Scenario: Sign up navigation
    When user taps "sign up"
    Then user should land on sign up screen

  Scenario: App version display
    Then user should see app version displayed

  Scenario: Password visibility toggle
    When user enter password and toggle visibility
    Then password should be visible
