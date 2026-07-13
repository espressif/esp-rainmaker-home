# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Reads the Apple 2FA verification code from the trusted iPhone using the run's own XCUITest driver (accessibility tree first, Vision OCR fallback)."""
import logging
import re
import subprocess
import time
from pathlib import Path

logger = logging.getLogger(__name__)

OCR_SWIFT = """
import Foundation
import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try? handler.perform([request])
for obs in request.results ?? [] {
    if let top = obs.topCandidates(1).first { print(top.string) }
}
"""


def _ocr_code_from_screenshot(driver):
    debug_dir = Path("debug")
    debug_dir.mkdir(exist_ok=True)
    script = debug_dir / "ocr_apple_code.swift"
    if not script.exists():
        script.write_text(OCR_SWIFT)
    shot = debug_dir / "apple_2fa_ocr.png"
    driver.get_screenshot_as_file(str(shot))
    result = subprocess.run(["swift", str(script), str(shot)],
                            capture_output=True, text=True, timeout=90)
    for line in result.stdout.splitlines():
        digits = re.sub(r"\D", "", line)
        if len(digits) == 6:
            return digits
    logger.warning("OCR found no 6-digit code; lines: %s", result.stdout.splitlines()[:10])
    return None


def read_code_with_driver(driver, timeout=120):
    """Approve the Apple sign-in prompt and return the 6-digit code using an existing XCUITest driver session."""
    try:
        driver.update_settings({"defaultActiveApplication": "com.apple.springboard"})
        try:
            if driver.execute_script("mobile: isLocked"):
                logger.info("iPhone is locked; unlocking")
                driver.execute_script("mobile: unlock")
                time.sleep(2)
        except Exception as error:
            logger.warning("Lock-state check failed: %s", error)
        deadline = time.time() + timeout
        source = ""
        while time.time() < deadline:
            source = driver.page_source
            if 'name="Allow"' in source:
                logger.info("Approving Apple sign-in prompt on the iPhone")
                driver.find_element("accessibility id", "Allow").click()
                time.sleep(2)
                source = driver.page_source
            code = None
            match = re.search(r"(?:name|label|value)=\"(\d{6})\"", source)
            if match:
                code = match.group(1)
            elif "Verification Code" in source:
                code = _ocr_code_from_screenshot(driver)
            if code:
                logger.info("Read Apple 2FA code from the iPhone")
                for ok in ("OK", "Done"):
                    try:
                        driver.find_element("accessibility id", ok).click()
                        break
                    except Exception:
                        continue
                return code
            time.sleep(2)
        stamp = int(time.time())
        shot = Path("debug") / f"apple_2fa_iphone_{stamp}.png"
        dump = Path("debug") / f"apple_2fa_iphone_{stamp}.xml"
        try:
            shot.parent.mkdir(exist_ok=True)
            driver.get_screenshot_as_file(str(shot))
            dump.write_text(source)
        except Exception:
            pass
        raise RuntimeError(f"Apple 2FA code did not appear on the trusted iPhone in time (see {shot} / {dump})")
    finally:
        try:
            driver.update_settings({"defaultActiveApplication": "auto"})
        except Exception:
            pass
