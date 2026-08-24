# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Drives Apple's MatterSupport pairing sheet on iOS, which XCUITest cannot see.

`MatterAddDeviceRequest.perform()` hands off to an out-of-process system extension. That
sheet contributes no nodes to the accessibility hierarchy - a page source taken while it
covers half the screen returns only the app's own tree - so it cannot be located, waited on
or asserted with locators. Screenshots and coordinate taps do work, because WDA captures the
whole framebuffer and injects touches below the process boundary.

So state is read with Vision OCR and every action is an absolute tap on the OCR box of the
matched line, not a hardcoded point: the sheet moves with device size, text length and Apple's
own layout changes, and a box tracks all three.
"""
import logging
import subprocess
import time
from pathlib import Path

logger = logging.getLogger(__name__)

OCR_BOXES_SWIFT = """
import Foundation
import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try? handler.perform([request])
for obs in request.results ?? [] {
    guard let top = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    print("\\(top.string)\\t\\(b.origin.x)\\t\\(b.origin.y)\\t\\(b.size.width)\\t\\(b.size.height)")
}
"""

CONSENT_MARKERS = ("would like to add this accessory", "will be added to")
CONSENT_BUTTONS = ("Add to ", "Add Accessory")
PROGRESS_MARKERS = ("This may take a few minutes", "Connecting", "Setting Up", "Adding")
ERROR_MARKERS = ("Unable to Add", "Not Found", "Accessory Not Found", "Couldn't Add",
                 "Unable to Communicate", "Try Again")
SHEET_MARKERS = (("Accessory", "This may take a few minutes")
                 + CONSENT_MARKERS + CONSENT_BUTTONS + ERROR_MARKERS)

POST_CONSENT_LABELS = ("Continue", "Done", "Allow", "Next")
ADVANCE_LABELS = CONSENT_BUTTONS + POST_CONSENT_LABELS

# Modal decisions Apple interposes mid-pairing, each with the one button we may tap. These are
# answered before the progress check: the dialog is drawn over a sheet still reading
# "Setting Up...", so treating the screen as progress leaves the modal blocking until timeout.
# Test firmware carries an uncertified VID/PID, so that warning is expected, not a failure.
DECISION_DIALOGS = (
    ("Uncertified Accessory", "Add Anyway"),
)


class AppleMatterSheet:
    """Screenshot-and-coordinate bridge across Apple's Matter pairing sheet."""

    def __init__(self, driver, artifact_dir=None):
        self.driver = driver
        self.artifact_dir = Path(artifact_dir) if artifact_dir else Path("debug")
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        self._script = self.artifact_dir / "ocr_boxes.swift"
        if not self._script.exists():
            self._script.write_text(OCR_BOXES_SWIFT)

    def read_lines(self, tag="sheet"):
        """OCR the current screen; return [(text, (cx, cy))] with centres already in driver points."""
        shot = self.artifact_dir / f"matter_sheet_{tag}.png"
        self.driver.get_screenshot_as_file(str(shot))
        try:
            result = subprocess.run(["swift", str(self._script), str(shot)],
                                    capture_output=True, text=True, timeout=90)
        except subprocess.TimeoutExpired:
            logger.warning("Vision OCR timed out on %s", shot.name)
            return []
        if result.returncode != 0:
            logger.warning("Vision OCR failed (rc=%s): %s", result.returncode,
                           (result.stderr or "").strip()[:200])
            return []

        size = self.driver.get_window_size()
        width, height = size["width"], size["height"]
        lines = []
        for raw in (result.stdout or "").splitlines():
            parts = raw.split("\t")
            if len(parts) != 5:
                continue
            text, bx, by, bw, bh = parts
            try:
                bx, by, bw, bh = float(bx), float(by), float(bw), float(bh)
            except ValueError:
                continue
            centre_x = (bx + bw / 2) * width
            centre_y = (1 - (by + bh / 2)) * height
            lines.append((text, (int(centre_x), int(centre_y))))
        return lines

    def _tap_point(self, x, y):
        """W3C touch tap at an absolute point, matching BasePage._drag; the sheet has no element to target."""
        from selenium.webdriver.common.actions.action_builder import ActionBuilder
        from selenium.webdriver.common.actions.pointer_input import PointerInput
        from selenium.webdriver.common.actions import interaction

        pointer = PointerInput(interaction.POINTER_TOUCH, "touch")
        ab = ActionBuilder(self.driver, mouse=pointer)
        ab.pointer_action.move_to_location(x, y)
        ab.pointer_action.pointer_down()
        ab.pointer_action.pause(0.1)
        ab.pointer_action.pointer_up()
        ab.perform()

    def _match(self, lines, phrases):
        """First match by phrase priority, not by screen order.

        Apple's own body text repeats the button's wording - the consent screen says both
        "would like to add this accessory" and "Add to <home>" - so scanning lines first would
        return the sentence rather than the control, and tapping its centre does nothing.
        """
        for phrase in phrases:
            for text, centre in lines:
                if phrase.lower() in text.lower():
                    return text, centre, phrase
        return None

    def _answer_decision_dialog(self, lines, answered, max_attempts=2):
        """Tap the allowed button on a mid-pairing modal; never its Cancel.

        Capped per dialog because it stays on screen for a poll or two after the tap, and
        blind re-taps would land on whatever replaced it. More than one attempt is still
        allowed so a marginally-off OCR box gets a second chance.
        """
        for marker, button in DECISION_DIALOGS:
            if not self._match(lines, (marker,)):
                continue
            if answered.get(marker, 0) >= max_attempts:
                return False
            hit = self._match(lines, (button,))
            if not hit:
                logger.warning("Apple %r dialog is up but %r was not found by OCR", marker, button)
                return False
            text, (x, y), _ = hit
            answered[marker] = answered.get(marker, 0) + 1
            logger.info("Answering Apple %r dialog via %r at (%s, %s)", marker, text, x, y)
            self._tap_point(x, y)
            return True
        return False

    def is_displayed(self, lines=None):
        """True while any Apple sheet text is on screen."""
        lines = self.read_lines("probe") if lines is None else lines
        return self._match(lines, SHEET_MARKERS) is not None

    def wait_for_text(self, phrases, timeout=30, poll=2):
        """Wait until one of `phrases` is on screen; return (text, centre) or None."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            hit = self._match(self.read_lines("wait"), phrases)
            if hit:
                text, centre, phrase = hit
                logger.info("Apple sheet shows %r (matched %r)", text, phrase)
                return text, centre
            time.sleep(poll)
        return None

    def tap_text(self, phrases, timeout=30):
        """Locate one of `phrases` by OCR and tap the centre of its box."""
        hit = self.wait_for_text(phrases, timeout=timeout)
        if not hit:
            return False
        text, (x, y) = hit
        logger.info("Tapping Apple sheet control %r at (%s, %s)", text, x, y)
        self._tap_point(x, y)
        return True

    def dismiss(self):
        """Close the sheet via its X, so a failed test does not strand the next one behind it."""
        lines = self.read_lines("dismiss")
        if not self.is_displayed(lines):
            return False
        size = self.driver.get_window_size()
        self._tap_point(int(size["width"] * 0.88), int(size["height"] * 0.61))
        time.sleep(1)
        return True

    def complete_commissioning(self, timeout=240, poll=3, appear_timeout=90):
        """Wait for Apple's sheet, drive consent -> progress, and return once it closes.

        Absence of the sheet counts as completion only *after* it has been seen. Called
        straight after the QR scan it is simply not up yet, and treating that first empty
        poll as success returns a never-commissioned device to the caller.

        Raises on an Apple-reported failure, quoting the OCR text, because the sheet gives us
        no error element to assert against.
        """
        deadline = time.time() + timeout
        appear_deadline = time.time() + appear_timeout
        appeared = consented = False
        answered = {}
        while time.time() < deadline:
            lines = self.read_lines("flow")

            error = self._match(lines, ERROR_MARKERS)
            if error:
                text, _, _ = error
                raise RuntimeError(f"Apple Matter sheet reported a failure: {text!r}")

            if not self._match(lines, SHEET_MARKERS):
                if appeared:
                    logger.info("Apple Matter sheet closed; commissioning handed back to the app")
                    return True
                if time.time() > appear_deadline:
                    visible = ", ".join(text for text, _ in lines)[:300]
                    raise TimeoutError(
                        f"Apple Matter sheet never appeared within {appear_timeout}s; "
                        f"on screen: {visible!r}")
                time.sleep(poll)
                continue

            if not appeared:
                appeared = True
                logger.info("Apple Matter sheet appeared")

            if not consented and self._match(lines, CONSENT_MARKERS):
                hit = self._match(lines, CONSENT_BUTTONS)
                if hit:
                    text, (x, y), _ = hit
                    logger.info("Accepting Apple pairing consent via %r at (%s, %s)", text, x, y)
                    self._tap_point(x, y)
                    consented = True
                    time.sleep(poll)
                    continue

            if self._answer_decision_dialog(lines, answered):
                time.sleep(poll)
                continue

            if self._match(lines, PROGRESS_MARKERS):
                time.sleep(poll)
                continue

            advance = self._match(lines, POST_CONSENT_LABELS if consented else ADVANCE_LABELS)
            if advance:
                text, (x, y), _ = advance
                logger.info("Advancing Apple sheet via %r at (%s, %s)", text, x, y)
                self._tap_point(x, y)
            time.sleep(poll)

        visible = ", ".join(text for text, _ in self.read_lines("timeout"))[:300]
        raise TimeoutError(
            f"Apple Matter sheet did not complete within {timeout}s; on screen: {visible!r}")
