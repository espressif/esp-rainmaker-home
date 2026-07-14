# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Third-Party (OAuth) Login Page Helper — drives the external auth surface (Chrome tab / iOS auth sheet)."""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)

PROVIDER_BUTTONS = {
    "google": "google_login_button",
    "apple": "apple_login_button",
}

AUTH_BLOCKERS = (
    "This browser or app may not be secure",
    "Couldn't sign you in",
    "Verify it's you",
    "unusual activity",
)

TWO_FACTOR_MARKERS = (
    "2-Step Verification",
    "Two-factor authentication",
)

CHROME_FIRST_RUN_DISMISSALS = (
    "Stay signed out",
    "Use without an account",
    "No thanks",
    "Accept & continue",
)

# The Chrome sign-in/sync promo covers the provider form; decline it rather than signing Chrome in.
CHROME_SIGNIN_PROMO_MARKERS = ("Sign in to Chrome", "Turn on sync", "Use Chrome without an account")
CHROME_SIGNIN_PROMO_DECLINES = ("Skip", "No thanks", "Cancel")

AUTH_PAGE_MARKERS = (
    "Choose an account",
    "Sign in with",
    "Apple Account",
) + TWO_FACTOR_MARKERS


class OauthLogin(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def tap_provider(self, provider):
        """Tap the Google/Apple button on the login screen; on iOS also accept the system 'Wants to Use ... to Sign In' consent alert."""
        button = PROVIDER_BUTTONS.get(provider.lower())
        if not button:
            raise ValueError(f"Unknown oauth provider: {provider}")
        login = self.get_other_page_helper('login')
        perms = self.get_other_page_helper('permissions')
        if perms.any_system_alert_present(timeout=2):
            perms.handle_all_permissions(action="allow", timeout=5)
        self._ios_dismiss_local_network_dialog()
        assert login.check_screen_displayed(timeout=5), "Not on login screen"
        logger.info("Tapping third-party login button for %s", provider)
        login.click(button)
        if self.platform == "ios":
            self._ios_consent("Continue", timeout=10)
        return self

    def wait_for_auth_page(self, provider, timeout=45):
        """Wait until the external auth surface is showing the provider's login content."""
        start = time.time()
        deadline = start + timeout
        reloaded = False
        while time.time() < deadline:
            if self._dismiss_chrome_first_run():
                continue
            if self._dismiss_google_passkey():
                continue
            if self.platform == "ios":
                self._ios_dismiss_local_network_dialog()
                self._ios_consent("Continue", timeout=1)
                if provider.lower() == "apple" and self._ios_native_apple_sheet_present():
                    logger.info("Native Sign in with Apple sheet is displayed")
                    return True
                if not reloaded and time.time() - start > 20 and "IsPageLoaded=false" in self.driver.page_source \
                        and self.is_visible("accessibility_id", "ReloadButton", timeout=1):
                    logger.info("%s auth page stuck loading; tapping Reload", provider)
                    self.click("accessibility_id", "ReloadButton", timeout=3)
                    reloaded = True
                    time.sleep(3)
                    continue
            self._assert_no_redirect_chooser()
            if self.platform == "android" and not self._in_auth_surface():
                time.sleep(0.5)
                continue
            if self._find_text_field() is not None or self._find_password_field() is not None \
                    or self._text_visible(AUTH_PAGE_MARKERS, timeout=1):
                logger.info("%s auth page is displayed", provider)
                return True
            time.sleep(0.5)
        return False

    def cancel_auth(self):
        """Abort the external auth surface and land back on the app's login screen."""
        logger.info("Cancelling third-party login")
        if self.platform == "android":
            if self.is_visible("chrome_close_button", timeout=3):
                self.click("chrome_close_button")
            else:
                self.driver.back()
        else:
            if self._ios_native_apple_sheet_present():
                self._ios_native_apple_sheet_tap("close") or self._ios_native_apple_sheet_tap("Close")
            elif not self._ios_consent("Cancel", timeout=3) and self.is_visible("ios_consent_cancel", timeout=3):
                self.click("ios_consent_cancel")
        login = self.get_other_page_helper('login')
        end = time.time() + 15
        while time.time() < end:
            if login.check_screen_displayed(timeout=2):
                return self
            if self.platform == "android" and self._in_auth_surface():
                self.driver.back()
            elif self.platform == "ios":
                if not self._ios_consent("Cancel", timeout=1) and self.is_visible("ios_consent_cancel", timeout=1):
                    self.click("ios_consent_cancel")
            time.sleep(0.5)
        raise RuntimeError("Did not return to login screen after cancelling oauth")

    def perform_auth(self, provider, email, password, totp_secret=None, timeout=120):
        """Complete the provider's web login and wait until the app regains the foreground."""
        logger.info("Performing %s web authentication for %s", provider, email)
        if provider.lower() == "apple":
            return self._perform_apple_auth(email, password, timeout)
        return self._perform_google_auth(email, password, totp_secret, timeout)

    def _perform_google_auth(self, email, password, totp_secret, timeout):
        """Google web login: account chooser / email / password (dismissing any re-appearing Credential-Manager passkey sheet), then TOTP 2FA or the risk-based device prompt, until the app regains the foreground."""
        deadline = time.time() + timeout
        email_done = password_done = totp_done = totp_started = False
        while time.time() < deadline:
            self._assert_no_redirect_chooser()
            if not self._in_auth_surface():
                if self._dismiss_google_passkey() or self._approve_google_device_prompt():
                    continue
                logger.info("Auth surface closed; oauth redirect handed back to the app")
                return self
            if self._dismiss_chrome_first_run():
                continue
            if self._dismiss_google_passkey():
                continue
            blocker = self._detect_blocker()
            if blocker:
                raise RuntimeError(f"google blocked automated login: '{blocker}'")
            if not totp_done and self._text_visible(TWO_FACTOR_MARKERS, timeout=1):
                if not totp_secret:
                    raise RuntimeError(
                        "google requires 2FA and no totp_secret is configured; "
                        "enroll an authenticator app on the account and set "
                        "GOOGLE_OAUTH_TOTP_SECRET in ~/.esp_test_secrets.env")
                if not totp_started:
                    # device-push default needs the multi-step Try-another-way -> authenticator -> code detour; give it budget.
                    deadline = max(deadline, time.time() + 90)
                    totp_started = True
                totp_done = self._handle_totp_challenge(totp_secret)
                continue
            if self._text_visible(("Choose an account",), timeout=1) and self._text_visible((email,), timeout=1):
                logger.info("Account chooser shown; selecting %s", email)
                self._tap_text(email)
                time.sleep(2)
                continue
            password_field = self._find_password_field()
            if password_field is not None and not password_done:
                logger.info("Entering google password")
                self._type_and_submit(password_field, password, ("Next", "Continue", "Sign in", "Sign In"))
                password_done = True
                time.sleep(3)
                continue
            if not email_done and password_field is None:
                field = self._find_text_field()
                if field is not None:
                    logger.info("Entering google email")
                    self._type_and_submit(field, email, ("Next", "Continue"))
                    email_done = True
                    time.sleep(3)
                    continue
            self._tap_any(("Continue", "I agree", "Allow", "Next"), quiet=True)
            time.sleep(1)
        return self._finish_auth("google", timeout)

    def _perform_apple_auth(self, email, password, timeout):
        """Apple web login. iOS: the native Sign in with Apple sheet. Android: the apple.com web form — email / password / SMS 2FA / 'Trust this browser?' / share-email consent — until the app regains the foreground."""
        deadline = time.time() + timeout
        email_done = password_done = totp_done = False
        while time.time() < deadline:
            self._assert_no_redirect_chooser()
            if self.platform == "ios":
                if self._ios_apple_native_in_progress():
                    if self._ios_native_apple_sign_in(password):
                        # Apple password submitted; stop touching the sheet (~1 min to redirect; taps cancel it).
                        logger.info("Apple password submitted; leaving the sheet to complete undisturbed")
                        return self
                    continue
            if not self._in_auth_surface():
                logger.info("Auth surface closed; oauth redirect handed back to the app")
                return self
            if self._dismiss_chrome_first_run():
                continue
            blocker = self._detect_blocker()
            if blocker:
                raise RuntimeError(f"apple blocked automated login: '{blocker}'")
            if not totp_done and self._text_visible(TWO_FACTOR_MARKERS, timeout=1):
                totp_done = self._handle_apple_device_code()
                # SMS delivery + resend can burn most of the budget; guarantee time for Trust/consent/redirect.
                deadline = max(deadline, time.time() + 90)
                continue
            if self._apple_handle_trust_browser():
                continue
            if self._apple_handle_share_email_consent():
                # Consent is the last interactive step; hand off to wait_for_login_completion for the redirect.
                logger.info("Apple consent completed; leaving the redirect to complete undisturbed")
                return self
            password_field = self._find_password_field()
            if password_field is not None and not password_done:
                logger.info("Entering apple password")
                self._type_and_submit(password_field, password, ("Next", "Continue", "Sign in", "Sign In"))
                password_done = True
                time.sleep(3)
                continue
            if not email_done and password_field is None:
                field = self._find_text_field()
                if field is not None:
                    logger.info("Entering apple email")
                    self._type_and_submit(field, email, ("Next", "Continue"))
                    email_done = True
                    time.sleep(3)
                    continue
            self._tap_any(("Continue", "Trust", "I agree", "Allow", "Next"), quiet=True)
            time.sleep(1)
        return self._finish_auth("apple", timeout)

    def _finish_auth(self, provider, timeout):
        """Shared deadline epilogue: a redirect landing right at the deadline is success; still-in-surface is a timeout."""
        self._assert_no_redirect_chooser()
        if not self._in_auth_surface():
            logger.info("OAuth redirect landed right at the deadline; continuing")
            return self
        raise RuntimeError(f"{provider} web authentication did not hand back to the app within {timeout}s")

    def wait_for_login_completion(self, timeout=120):
        """After the redirect, wait out the post-login pipeline until home is displayed."""
        home = self.get_other_page_helper('home')
        perms = self.get_other_page_helper('permissions')
        deadline = time.time() + timeout
        while time.time() < deadline:
            if perms.any_system_alert_present(timeout=1):
                perms.handle_all_permissions(action="allow", timeout=3)
            if self.platform == "ios":
                self._ios_dismiss_local_network_dialog()
            self._approve_google_device_prompt()
            home.acknowledge_migration_dialog()
            if home.check_screen_displayed(timeout=3, quiet=True):
                logger.info("OAuth login completed; home screen displayed")
                return True
            time.sleep(1)
        return False

    IOS_SHEET_HOSTS = ("com.apple.AuthKitUIService", "com.apple.springboard")

    def _ios_scope(self, bundle):
        self.driver.update_settings({"defaultActiveApplication": bundle})

    def _ios_native_apple_sheet(self):
        """(host_bundle, source) of the native Sign in with Apple sheet (hosted by AuthKitUIService)."""
        try:
            for bundle in self.IOS_SHEET_HOSTS:
                self._ios_scope(bundle)
                source = self.driver.page_source
                if "Sign in with Apple" in source:
                    return bundle, source
            return None, ""
        finally:
            self._ios_scope("auto")

    def _ios_native_apple_sheet_present(self):
        return self._ios_native_apple_sheet()[0] is not None

    def _ios_apple_native_in_progress(self):
        """The native Sign in with Apple flow (account sheet or password page) is on screen."""
        try:
            for bundle in self.IOS_SHEET_HOSTS:
                self._ios_scope(bundle)
                source = self.driver.page_source
                if "Sign in with Apple" in source or "Enter the password for Apple" in source:
                    return True
            return False
        finally:
            self._ios_scope("auto")

    def _ios_native_apple_sheet_tap(self, label, timeout=3):
        bundle, _ = self._ios_native_apple_sheet()
        if not bundle:
            return False
        try:
            self._ios_scope(bundle)
            self.click("accessibility_id", label, timeout=timeout)
            return True
        except Exception:
            return False
        finally:
            self._ios_scope("auto")

    def _ios_native_apple_sign_in(self, password):
        """Drive the native Sign in with Apple sheet to password entry; True once the password is submitted."""
        for host in self.IOS_SHEET_HOSTS + ("auto",):
            try:
                self._ios_scope(host)
                fields = self.driver.find_elements("class name", "XCUIElementTypeSecureTextField")
                if not fields:
                    continue
                field = fields[0]
                logger.info("Entering Apple Account password in the native prompt (host %s)", host)
                # iOS SecureTextField.setValue can no-op if unfocused; verify the value took and retry.
                entered = False
                for attempt in range(3):
                    field.click()
                    time.sleep(0.5)
                    field.clear()
                    field.send_keys(password)
                    time.sleep(0.5)
                    if (field.get_attribute("value") or "").strip():
                        entered = True
                        break
                    logger.warning("Apple password field still empty after attempt %s; retrying", attempt + 1)
                if not entered:
                    logger.warning("Apple password did not register in the field; will retry on next loop")
                    return False
                # Tapping an enabled Sign In IS the submission — return True immediately (the page lingers ~1 min; re-checking corrupts the flow).
                deadline = time.time() + 10
                while time.time() < deadline:
                    btns = self.driver.find_elements(
                        "-ios predicate string",
                        'type == "XCUIElementTypeButton" AND (label CONTAINS[c] "sign in" OR label CONTAINS[c] "continue")')
                    enabled = [b for b in btns if b.get_attribute("enabled") == "true"]
                    if enabled:
                        enabled[0].click()
                        logger.info("Tapped Sign In on the Apple password page; submission handed off")
                        return True
                    time.sleep(0.5)
                field.send_keys("\n")
                logger.info("Sign In not enabled in 10s; submitted via return key")
                return True
            finally:
                self._ios_scope("auto")
        bundle, source = self._ios_native_apple_sheet()
        if bundle and "SIWA_CONTINUE_BUTTON" in source:
            logger.info("Native Sign in with Apple sheet: tapping SIWA_CONTINUE_BUTTON")
            try:
                self._ios_scope(bundle)
                self.click("accessibility_id", "SIWA_CONTINUE_BUTTON", timeout=3)
                time.sleep(3)
            except Exception as error:
                logger.warning("SIWA continue tap failed: %s", error)
            finally:
                self._ios_scope("auto")
        return False

    def _ios_dismiss_local_network_dialog(self):
        """Dismiss the iOS local-network permission panel via WDA's alert API (SpringBoard 'Allow' tap fallback)."""
        if self.platform != "ios":
            return False
        try:
            buttons = self.driver.execute_script("mobile: alert", {"action": "getButtons"}) or []
            if any("allow" in str(b).lower() for b in buttons):
                self.driver.execute_script("mobile: alert", {"action": "accept", "buttonLabel": "Allow"})
                logger.info("Allowed the local-network permission dialog (alert API)")
                time.sleep(1)
                return True
        except Exception:
            pass
        try:
            self._ios_scope("com.apple.springboard")
            source = self.driver.page_source
            if "local networks" in source and 'name="Allow"' in source:
                logger.info("Allowing the local-network permission dialog (springboard tap)")
                self.click("accessibility_id", "Allow", timeout=3)
                time.sleep(1)
                return True
            return False
        except Exception:
            return False
        finally:
            self._ios_scope("auto")

    def _ios_consent(self, button_label, timeout=10):
        """Act on the SpringBoard system consent alert via WDA's alert API."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                buttons = self.driver.execute_script("mobile: alert", {"action": "getButtons"}) or []
            except Exception:
                buttons = []
            if any(button_label.lower() in str(b).lower() for b in buttons):
                self.driver.execute_script("mobile: alert", {"action": "accept", "buttonLabel": button_label})
                logger.info("Consent alert: tapped %s", button_label)
                time.sleep(1)
                return True
            time.sleep(0.5)
        return False

    def _in_auth_surface(self):
        """Whether the external auth UI still owns the screen (browser tab / auth sheet)."""
        if self.platform == "android":
            try:
                package = self.driver.current_package or ""
            except Exception:
                return False
            return "chrome" in package or "browser" in package
        if self._find_text_field() is not None or self._find_password_field() is not None:
            return True
        return self._text_visible(AUTH_PAGE_MARKERS + ("Cancel",), timeout=1) and not \
            self.get_other_page_helper('login').check_screen_displayed(timeout=1)

    def _find_text_field(self):
        if self.platform == "android":
            if self._find_password_field() is not None:
                return None
            return self.find_visible("web_edit_text", timeout=1)
        return self.find_visible("ios_web_text_field", timeout=1)

    def _find_password_field(self):
        """The focused-page password input (UiSelector has no password() matcher on Android)."""
        if self.platform == "ios":
            return self.find_visible("ios_web_secure_field", timeout=1)
        for el in self.find_all("android_uiautomator", 'new UiSelector().className("android.widget.EditText")'):
            try:
                if el.get_attribute("password") == "true":
                    return el
            except Exception:
                continue
        return None

    def _text_visible(self, texts, timeout=1):
        for text in texts:
            if self.platform == "android":
                by, value = "android_uiautomator", f'new UiSelector().textContains("{text}")'
            else:
                by, value = "ios_predicate", f'label CONTAINS "{text}" OR name CONTAINS "{text}"'
            if self.is_visible(by, value, timeout=timeout):
                return True
        return False

    def _tap_text(self, text, timeout=3):
        if self.platform == "android":
            self.click("android_uiautomator", f'new UiSelector().textContains("{text}")', timeout=timeout)
        else:
            self.click("ios_predicate", f'label CONTAINS "{text}" OR name CONTAINS "{text}"', timeout=timeout)

    def _tap_any(self, texts, quiet=False):
        for text in texts:
            if self.platform == "android":
                selectors = (("android_uiautomator", f'new UiSelector().className("android.widget.Button").text("{text}")'),
                             ("android_uiautomator", f'new UiSelector().text("{text}")'))
            else:
                selectors = (("ios_predicate", f'type == "XCUIElementTypeButton" AND (name == "{text}" OR label == "{text}")'),
                             ("ios_predicate", f'label == "{text}"'))
            for by, value in selectors:
                if self.is_visible(by, value, timeout=1):
                    try:
                        self.click(by, value, timeout=3)
                        return True
                    except Exception:
                        continue  # button raced away (page auto-advanced) — best-effort, never raise
        if not quiet:
            logger.warning("None of the buttons %s found on auth page", texts)
        return False

    def _type_and_submit(self, field, text, next_buttons):
        """Type into a web form field and submit (avoid hide_keyboard in Chrome: back navigates)."""
        field.click()
        time.sleep(0.8)
        # Focusing the Google email field pops the passkey sheet; clear it before typing.
        if self._dismiss_google_passkey():
            field = self._find_text_field() or field
        try:
            field.send_keys(text)
        except Exception:
            logger.info("send_keys raced the passkey sheet; dismissing and retrying")
            if self._dismiss_google_passkey():
                field = self._find_text_field() or field
            field.send_keys(text)
        if self.platform == "android":
            self.driver.press_keycode(66)
            time.sleep(1.5)
            if self._is_keyboard_shown():
                self._tap_any(next_buttons, quiet=True)
        else:
            if not self._tap_any(next_buttons, quiet=True):
                field.send_keys("\n")

    def _apple_handle_trust_browser(self):
        """Apple's post-2FA 'Trust this browser?' interstitial: tap Trust so the sign-in redirect proceeds."""
        if not self._text_visible(("Trust this browser",), timeout=1):
            return False
        logger.info("Apple: 'Trust this browser?' shown; tapping Trust")
        if self._tap_any(("Trust", "Not Now")):
            time.sleep(2)
            return True
        return False

    def _apple_handle_share_email_consent(self):
        """First-time 'Sign in with Apple' consent: choose 'Share my email', then Continue."""
        if not self._text_visible(("Share my email", "Hide My Email"), timeout=1):
            return False
        logger.info("Apple: choosing 'Share my email' on the Sign in with Apple consent")
        self._tap_text("Share my email")
        time.sleep(1)
        for _ in range(3):
            self._tap_any(("Continue",))
            time.sleep(2)
            if not self._text_visible(("Share my email", "Hide My Email"), timeout=1):
                return True
        logger.warning("Apple consent screen did not clear after selecting 'Share my email'")
        return False

    def _apple_request_sms_code(self):
        """Route Apple's 2FA code to SMS via 'Cannot access your devices?' -> Text (best-effort)."""
        if not self._text_visible(("Cannot access your devices", "Didn't get"), timeout=3):
            logger.info("Apple: no 'Cannot access your devices' link found; leaving code routing as-is")
            return
        self._tap_text("Cannot access your devices")
        time.sleep(2)
        for label in ("Text me", "Text a code", "Send a text", "Text message", "Text", "Use phone number"):
            if self._text_visible((label,), timeout=1):
                logger.info("Apple: requesting the code via SMS ('%s')", label)
                self._tap_text(label)
                time.sleep(2)
                return
        logger.warning("Apple 'Cannot access your devices' shown but no Text option matched "
                       "(page may list the trusted number directly) — needs live verification")

    def _handle_apple_device_code(self):
        """Read the trusted-device 2FA code (iOS: from the phone; Android: routed to SMS) and enter it."""
        if self.platform == "ios":
            from utils.apple_2fa_reader import read_code_with_driver
            code = read_code_with_driver(self.driver)
        else:
            self._apple_request_sms_code()
            from utils.android_sms_reader import fetch_apple_2fa_code_from_sms
            udid = self.driver.capabilities.get("udid")
            code = fetch_apple_2fa_code_from_sms(udid=udid, timeout=60)
            if not code and self._tap_any(("Resend code", "Resend Code", "Resend")):
                logger.info("Apple 2FA SMS not received in first window; tapped 'Resend code' and re-waiting once")
                code = fetch_apple_2fa_code_from_sms(udid=udid, timeout=60)
            if not code:
                raise RuntimeError(
                    "No Apple 2FA code arrived by SMS. Ensure the device SIM's number is "
                    "registered as a trusted phone number on the Apple account and that the "
                    "'Cannot access your devices? -> Text' routing selected it.")
        field = self._find_text_field()
        if field is None:
            field = self.find_visible("web_edit_text" if self.platform == "android" else "ios_web_text_field", timeout=10)
        if field is None:
            raise RuntimeError("Apple 2FA code inputs not found in the auth surface")
        field.click()
        time.sleep(0.5)
        if self.platform == "android":
            for digit in code:
                self.driver.press_keycode(7 + int(digit))
                time.sleep(0.3)
        else:
            field.send_keys(code)
        time.sleep(2)
        return True

    def _handle_totp_challenge(self, totp_secret):
        """Steer the 2FA screen to the authenticator-code method and submit a fresh TOTP code."""
        import pyotp
        field = self._find_text_field()
        if field is not None:
            code = pyotp.TOTP(totp_secret).now()
            logger.info("Submitting authenticator TOTP code")
            self._type_and_submit(field, code, ("Next", "Verify", "Continue"))
            time.sleep(3)
            return True
        for option in ("Google Authenticator", "verification code"):
            if self._text_visible((option,), timeout=1):
                logger.info("Selecting 2FA method containing '%s'", option)
                self._tap_text(option)
                time.sleep(2)
                return False
        # 'Try another way' is below the fold in the provider web page (not natively scrollable); swipe is the only option.
        size = self.driver.get_window_size()
        self._drag(size["width"] // 2, int(size["height"] * 0.75),
                   size["width"] // 2, int(size["height"] * 0.30))
        time.sleep(1)
        if self._text_visible(("Try another way",), timeout=1):
            logger.info("Opening 2FA method list via 'Try another way'")
            self._tap_text("Try another way")
            time.sleep(2)
        return False

    def _dismiss_chrome_first_run(self):
        """Clear Chrome's first-run interstitials (fresh Chrome profile) blocking the auth page."""
        if self.platform != "android":
            return False
        if self._text_visible(CHROME_SIGNIN_PROMO_MARKERS, timeout=1):
            for text in CHROME_SIGNIN_PROMO_DECLINES:
                selector = f'new UiSelector().text("{text}")'
                if self.is_visible("android_uiautomator", selector, timeout=1):
                    logger.info("Declining Chrome sign-in/sync promo via '%s'", text)
                    self.click("android_uiautomator", selector, timeout=3)
                    time.sleep(1.5)
                    return True
        for text in CHROME_FIRST_RUN_DISMISSALS:
            selector = f'new UiSelector().text("{text}")'
            if self.is_visible("android_uiautomator", selector, timeout=1):
                logger.info("Dismissing Chrome first-run via '%s'", text)
                self.click("android_uiautomator", selector, timeout=3)
                time.sleep(1.5)
                return True
        return False

    PASSKEY_SHEET_MARKERS = ("Use your saved passkey", "Google Password Manager", "Set up screen lock", "to use passkeys", "Create a passkey")

    def _dismiss_google_passkey(self):
        """Dismiss any Android Credential-Manager passkey sheet (saved-passkey, set-up-screen-lock, create-passkey) via BACK; detects by package or text so new variants are covered, and BACK leaves the underlying field focused."""
        if self.platform != "android":
            return False
        try:
            in_cred_mgr = "credentialmanager" in (self.driver.current_package or "")
        except Exception:
            in_cred_mgr = False
        if not in_cred_mgr and not self._text_visible(self.PASSKEY_SHEET_MARKERS, timeout=1):
            return False
        logger.info("Credential-Manager passkey sheet shown; dismissing via BACK")
        self.driver.back()
        time.sleep(1)
        return True

    def _approve_google_device_prompt(self):
        """Approve Google's risk-based 'Are you trying to sign in?' 2SV prompt (Play Services shows it after password on an unusual sign-in, outside the Chrome surface) by tapping 'Yes, it's me'."""
        if self.platform != "android":
            return False
        if not self._text_visible(("Are you trying to sign in", "Keep your account safe"), timeout=1):
            return False
        logger.info("Google device-confirmation prompt shown; approving via 'Yes, it's me'")
        if self._tap_any(("Yes, it's me", "Yes")):
            time.sleep(2)
            return True
        return False

    def _assert_no_redirect_chooser(self):
        """Regression guard: fail loudly if the OAuth redirect 'Open with' chooser reappears."""
        if self.platform != "android":
            return
        if self.is_visible("android_uiautomator", 'new UiSelector().text("Open with")', timeout=1):
            raise RuntimeError(
                "OAuth redirect 'Open with' chooser reappeared — MainActivity deep-link filter "
                "regression (should be host-scoped so only OAuthRedirectActivity matches)")

    def _detect_blocker(self):
        for marker in AUTH_BLOCKERS:
            if self._text_visible((marker,), timeout=1):
                return marker
        return None
