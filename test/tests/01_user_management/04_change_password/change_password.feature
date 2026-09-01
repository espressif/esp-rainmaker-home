Feature: Change Password
  Update password for logged-in users

  Background:
    Given the app is launched
    And user should be on login screen

  @sanity
  Scenario Outline: Change password with valid credentials
    Given user is on change password screen for "<login_user>"
    When user enters current password "<old_password>", new password "<new_password>" and confirm password "<confirm_password>"
    And user taps "update password"
    Then user should see toast with title "<title>" and message "<message>"
    And user should be on login screen
    Examples:
      | test_case              | login_user        | old_password                | new_password | confirm_password | title                          | message |
      | Valid change password  | registered user 1 | registered user 1 password | Welcome02!   | Welcome02!       | Password changed successfully | ""     |

  @regression
  Scenario Outline: Password policy failures
    Given user is on change password screen for "<login_user>"
    When user enters current password "<old_password>", new password "<new_password>" and confirm password "<confirm_password>"
    And user taps "update password"
    Then user should see toast with title "Failed to change password. Please try again" and message "<message>"
    Examples:
      | test_case                               | login_user        | old_password                | new_password      | confirm_password  | message |
      | Password length not enough              | registered user 1 | registered user 1 password | 1234567           | 1234567           | change password policy error |
      | Password with no uppercase characters   | registered user 1 | registered user 1 password | welcome01         | welcome01         | change password policy error |
      | Password with no numeric characters     | registered user 2 | registered user 2 password | Welcom<space>e    | Welcom<space>e    | change password policy error |
      | Password with no lowercase characters   | registered user 2 | registered user 2 password | WELCOME1          | WELCOME1          | change password policy error |
      | Password with leading whitespace        | registered user 2 | registered user 2 password | <space>Welcome1   | <space>Welcome1   | change password policy error |
      | Password with trailing whitespace       | registered user 2 | registered user 2 password | Welcome1<space>   | Welcome1<space>   | change password policy error |
      | Incorrect current password              | registered user 1 | incorrect_password         | registered user 1 password | registered user 1 password | incorrect current password |

  @regression
  Scenario Outline: Inline validation errors
    Given user is on change password screen for "<login_user>"
    When user enters current password "<old_password>", new password "<new_password>" and confirm password "<confirm_password>"
    Then user should see error "<message>"
    Examples:
      | test_case                         | login_user        | old_password                | new_password                | confirm_password            | message |
      | New password same as current      | registered user 1 | registered user 1 password | registered user 1 password | registered user 1 password | New password cannot be the same as the current password |
      | Password confirmation mismatch    | registered user 1 | registered user 1 password | Welcome123                 | Welcome456                 | Passwords do not match |

  @regression
  Scenario Outline: Update password button should remain disabled
    Given user is on change password screen for "<login_user>"
    When user enters current password "<old_password>", new password "<new_password>" and confirm password "<confirm_password>"
    Then update password button should be disabled
    Examples:
      | test_case                        | login_user        | old_password                | new_password | confirm_password |
      | Empty old password               | registered user 1 | ""                          | Welcome123   | Welcome123       |
      | Empty new password               | registered user 1 | registered user 1 password | ""           | Welcome123       |
      | Empty confirm new password       | registered user 1 | registered user 1 password | registered user 1 password | ""               |
