# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Derive a Matter manual pairing code from a device's discriminator + passcode.

The E2E fixture generates a unique commissionable dataset (discriminator +
passcode) per run and knows the QR (``MT:``) payload, but the manual-entry test
needs the numeric manual pairing code the user would type. That code is a pure
function of the discriminator and passcode per the Matter spec (section 5.1.4.1),
so we compute it here rather than parsing tool output.

Reference vector (CHIP default): discriminator=3840, passcode=20202021 ->
``34970112332``.
"""

# Verhoeff dihedral-group tables (D5), used by Matter's "Verhoeff10" check digit.
_VERHOEFF_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)
_VERHOEFF_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)


def _verhoeff_check_digit(digits: str) -> str:
    """Return the Verhoeff check digit for a string of decimal digits."""
    checksum = 0
    for position, char in enumerate(reversed(digits)):
        checksum = _VERHOEFF_D[checksum][_VERHOEFF_P[(position + 1) % 8][int(char)]]
    return str(_VERHOEFF_INV[checksum])


def manual_pairing_code(discriminator: int, passcode: int) -> str:
    """Compute the 11-digit Matter manual pairing code (no VID/PID).

    Args:
        discriminator: The 12-bit setup discriminator (0..4095).
        passcode: The 27-bit setup passcode.

    Returns:
        The 11-character manual pairing code string (10 data digits + 1 Verhoeff
        check digit), e.g. ``"34970112332"``.
    """
    short_discriminator = (discriminator >> 8) & 0x0F

    # Chunk layout per Matter spec 5.1.4.1 (VID/PID-absent, 11-digit form).
    chunk1 = (short_discriminator >> 2) & 0x03
    chunk2 = ((short_discriminator & 0x03) << 14) | (passcode & 0x3FFF)
    chunk3 = (passcode >> 14) & 0x1FFF

    digits = f"{chunk1:01d}{chunk2:05d}{chunk3:04d}"
    return digits + _verhoeff_check_digit(digits)


if __name__ == "__main__":
    # Self-check against the canonical CHIP test onboarding payload.
    assert manual_pairing_code(3840, 20202021) == "34970112332", manual_pairing_code(
        3840, 20202021
    )
    print("matter_pairing self-check OK:", manual_pairing_code(3840, 20202021))
