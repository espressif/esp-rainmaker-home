# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Hardware framework exceptions."""


class HardwareError(Exception):
    """Base exception for hardware framework errors."""


class HardwareUnavailableException(HardwareError):
    """Raised when no ESP device of the requested type can be acquired."""


class HardwareLockException(HardwareError):
    """Raised when a resource lock cannot be acquired or released."""


class FlashingError(HardwareError):
    """Raised when firmware flashing fails."""


class FirmwareNotFoundError(HardwareError):
    """Raised when firmware binaries cannot be resolved."""


class FirmwareMismatchError(FirmwareNotFoundError):
    """Raised when build_details.info does not match scenario requirements."""


class DeviceDiscoveryError(HardwareError):
    """Raised when device discovery fails."""


class SerialLogError(HardwareError):
    """Raised when serial logging fails."""
