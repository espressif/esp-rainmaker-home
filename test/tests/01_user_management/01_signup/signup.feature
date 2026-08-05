Feature: Sign Up
  User registration testing scenarios

  Background:
    Given the app is launched
    And user should be on login screen
    And user navigates to sign up screen
    And user is on the sign up screen

  @sanity
  Scenario Outline: Successful sign up with valid credentials and verification
    When user signs up with "new user", "Welcome01!", "Welcome01!" and "accept" consent
    And user taps "confirm"
    Then user should proceed to verification screen
    When user enters verification code "correct"
    And user taps "verify"
    Then user should see toast with title "<title>" and message "<message>"
    Then user should land on the home screen
    Examples:
      | test_case | title               | message  |
      | success   | Sign up successful! | ""  |

  @regression
  Scenario: Sign up with invalid verification code
    When user signs up with "new user", "Welcome01!", "Welcome01!" and "accept" consent
    And user taps "confirm"
    Then user should proceed to verification screen
    When user enters verification code "000000"
    And user taps "verify"
    Then user should see toast with title "Failed to confirm signup" and message "Verification code is incorrect"
    And user should remain on verification screen

  @regression
  Scenario: Sign up with invalid verification code length
    When user signs up with "new user", "Welcome01!", "Welcome01!" and "accept" consent
    And user taps "confirm"
    Then user should proceed to verification screen
    When user enters verification code "12345"
    Then user should see error "Please enter a valid 6-digit code"
    And user should remain on verification screen

  @regression
  Scenario: Password mismatch validation
    When user signs up with "test@espressif.com", "password123", "differentpassword" and "decline" consent
    Then user should see error "Passwords do not match"
    And user should remain on sign up screen

  @regression
  Scenario: Email already exists
    When user signs up with "espressif.testing@gmail.com", "Welcome01", "Welcome01" and "accept" consent
    And user taps "confirm"
    Then user should see toast with title "Failed to send verification code" and message "User account already exist"
    And user should remain on sign up screen

  Scenario Outline: Sign up button should be disabled in invalid cases
    Given user is on the sign up screen
    When user signs up with "<email>", "<password>", "<confirm_password>" and "<terms>" consent
    Then sign up button should be disabled

    Examples:
      | email         | password   | confirm_password   | terms   |
      | ""            | "password" | "password"         | accept  |
      | test@abc.com  | ""         | "confirm_password" | accept  |
      | test@abc.com  | "password" | ""                 | accept  |
      | test@abc.com  | "password" | "password"         | decline |


  Scenario: Screen elements validation
    Then all sign up elements should be present

  Scenario: Password visibility toggle
    When user enters password and toggles visibility on sign up
    Then password should be visible on sign up

  Scenario: Navigate to sign in from sign up
    When user taps "sign in"
    Then user should be on login screen

  Scenario: App version display on sign up
    Then user should see app version displayed on sign up

  Scenario: Resend verification code during sign up
    When user signs up with "new user", "Welcome01!", "Welcome01!" and "accept" consent
    And user taps "confirm"
    Then user should proceed to verification screen
    When user requests to resend verification code
    Then user should see title "A verification code is on the way"
    And user should remain on verification screen

  Scenario Outline: Multiple invalid email formats
    When user signs up with "<email>", "password123", "password123" and "decline" consent
    Then user should see error "Please enter a valid email address"
    And user should remain on sign up screen

    Examples:
      | email           |
      | @missingemail.com |
      | email@.com      |
      | email@example   |

  Scenario Outline: Various weak passwords
    When user signs up with "test@espressif.com", "<password>", "<password>" and "accept" consent
    And user taps "confirm"
    Then user should see toast with title "Failed to send verification code" and message "Password length must be between 8 to 256 characters. It should be alpha-numeric without any whitespace. It should contain atleast one uppercase, one lowercase character and a number"                                                                                        
    And user should remain on sign up screen

    Examples:
      | password                 |
      | password123              |
      | 12345678                 |
      | password                 |
      | <space>Password1         |
      | Password1<space>         |
      | PASSWORD123              |
      | Password                 |
      | Pass1                    |
