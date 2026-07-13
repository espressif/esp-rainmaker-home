# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

#!/usr/bin/env python3
"""
Download the provisioning-test firmware bundles from Jenkins into test/firmwares/.

Job: rainmaker_firmware/esp_rainmaker_firmware
Parameters: chip, prov_mode, product, esp_rainmaker_branch, CUSTOM_SDK_CONFIG
(sdkconfig fragment appended to sdkconfig.defaults).
Artifacts: artifacts/esp_rainmaker_firmware_<product>_<chip>_<build>.tar.gz

Required bundles (FIRMWARE_MATRIX):
  esp32c3  ble     sec1 provisioning / sec1 local control (PoP: random)
  esp32s2  softap  sec1 without PoP provisioning / sec1 local control
  esp32c5  ble     sec2 provisioning / sec2 local control

CONFIG_APP_POP_TYPE: 0=MAC, 1=RANDOM, 2=NONE (examples/led_light Kconfig).

Environment (same names as the GitLab CI variables):
  JENKINS_URL            firmware-build server base URL (required)
  JENKINS_FIRMWARE_JOB   firmware job path (required)
  JENKINS_USER           Jenkins user id
  JENKINS_API_TOKEN      Jenkins API token (profile -> Configure -> API Token)
  JENKINS_TRIGGER_TOKEN  optional, only for remote trigger tokens

Usage:
  python scripts/download_firmwares.py            # reuse latest matching builds, trigger missing
  python scripts/download_firmwares.py --trigger  # always trigger fresh builds
  python scripts/download_firmwares.py --list-params
  python scripts/download_firmwares.py --only esp32c3-ble-sec1
"""
import argparse
import base64
import io
import json
import os
import re
import shutil
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

# Internal firmware-build host/job — supplied via env (CI variables / secrets
# file), never hard-coded, so they don't leak into the public repo.
JENKINS_URL = os.environ.get("JENKINS_URL", "").rstrip("/")
JENKINS_FIRMWARE_JOB = os.environ.get("JENKINS_FIRMWARE_JOB", "").strip("/")
JENKINS_USER = os.environ.get("JENKINS_USER", "")
JENKINS_API_TOKEN = os.environ.get("JENKINS_API_TOKEN", "")
JENKINS_TRIGGER_TOKEN = os.environ.get("JENKINS_TRIGGER_TOKEN", "")

_FIRMWARE_ROOT = os.environ.get("FIRMWARE_ROOT", "firmwares")
FIRMWARES_DIR = Path(_FIRMWARE_ROOT) if os.path.isabs(_FIRMWARE_ROOT) else Path(__file__).resolve().parents[1] / _FIRMWARE_ROOT

# Matter test image: auto-updated launchpad artifact, no Jenkins involved.
MATTER_FW_URL = os.environ.get(
    "MATTER_FW_URL",
    "https://espressif.github.io/esp-matter/esp32c3_wifi_matter_light.bin",
)


def download_matter_image(url: str = MATTER_FW_URL, dest_dir: Path = None) -> Path:
    """Fetch the auto-updated esp-matter merged image into <firmwares>/matter/; skip when upstream is unchanged (ETag/Last-Modified) and fall back to the cached copy when offline."""
    dest_dir = dest_dir or FIRMWARES_DIR / "matter"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / url.rsplit("/", 1)[-1]
    meta = dest.with_suffix(dest.suffix + ".httpmeta")

    request = urllib.request.Request(url)
    if dest.exists() and meta.exists():
        try:
            cached = json.loads(meta.read_text())
            if cached.get("etag"):
                request.add_header("If-None-Match", cached["etag"])
            if cached.get("last_modified"):
                request.add_header("If-Modified-Since", cached["last_modified"])
        except Exception:
            pass
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
            if not data or len(data) < 0x10000:
                raise RuntimeError(f"Downloaded image suspiciously small ({len(data)} bytes)")
            dest.write_bytes(data)
            meta.write_text(json.dumps({
                "etag": response.headers.get("ETag"),
                "last_modified": response.headers.get("Last-Modified"),
                "url": url,
            }))
            print(f"  downloaded {dest.name} ({len(data)} bytes)")
    except urllib.error.HTTPError as error:
        if error.code == 304 and dest.exists():
            print(f"  upstream unchanged (304); reusing {dest.name}")
        else:
            raise
    except Exception as error:
        if dest.exists():
            print(f"  matter image download failed ({error}); reusing cached {dest.name}")
        else:
            raise
    return dest


def prune_superseded(keep: set) -> None:
    """Remove esp_rainmaker_firmware_* bundles whose build number is not in keep, so exactly one (newest) bundle per variant remains."""
    pattern = re.compile(r"^esp_rainmaker_firmware_.+_(\d+)(\.tar\.gz|\.tgz|\.zip)?$")
    for item in FIRMWARES_DIR.iterdir():
        match = pattern.match(item.name)
        if not match or int(match.group(1)) in keep:
            continue
        print(f"  pruning superseded {item.name}")
        shutil.rmtree(item) if item.is_dir() else item.unlink()

def _local_ctrl(security: int) -> str:
    return (
        "CONFIG_ESP_RMAKER_LOCAL_CTRL_FEATURE_ENABLE=y\n"
        "CONFIG_ESP_RMAKER_LOCAL_CTRL_AUTO_ENABLE=y\n"
        f"CONFIG_ESP_RMAKER_LOCAL_CTRL_SECURITY_{security}=y"
    )


FIRMWARE_MATRIX = [
    {
        "name": "esp32c3-ble-sec1",
        "chip": "esp32c3",
        "prov_mode": "ble",
        "product": "led_light",
        "custom_sdk_config": (
            "CONFIG_APP_PROV_SECURITY_VERSION_1=y\n"
            "CONFIG_APP_POP_TYPE=1\n" + _local_ctrl(1)
        ),
    },
    {
        # OTA over MQTT; challenge-response off so the S2 can self-claim
        # (challenge-response aborts boot without factory certificates).
        "name": "esp32s2-softap-sec1-nopop",
        "chip": "esp32s2",
        "prov_mode": "softap",
        "product": "led_light",
        "custom_sdk_config": (
            "CONFIG_ESP_RMAKER_OTA_USE_MQTT=y\n"
            "CONFIG_ESP_RMAKER_ENABLE_CHALLENGE_RESPONSE=n\n"
            "CONFIG_APP_PROV_SECURITY_VERSION_1=y\n"
            "CONFIG_APP_POP_TYPE=2\n" + _local_ctrl(1)
        ),
    },
    {
        "name": "esp32c5-ble-sec2",
        "chip": "esp32c5",
        "prov_mode": "ble",
        "product": "led_light",
        "idf_version": "release/v5.5",  # job's default IDF predates esp32c5
        "custom_sdk_config": (
            "CONFIG_APP_PROV_SECURITY_VERSION_2=y\n" + _local_ctrl(2)
        ),
    },
    {
        "name": "esp32c3-onnetwork-chalresp",
        "chip": "esp32c3",
        "prov_mode": "ble",
        "product": "led_light",
        "custom_sdk_config": (
            "CONFIG_APP_PROV_SECURITY_VERSION_1=y\n"
            "CONFIG_APP_POP_TYPE=1\n"
            "CONFIG_ESP_RMAKER_LOCAL_CTRL_CHAL_RESP_ENABLE=y\n"
            "CONFIG_ESP_RMAKER_CONSOLE_CHAL_RESP_CMDS_ENABLE=y\n" + _local_ctrl(1)
        ),
    },
]


def _request(path_or_url: str, data: bytes = None, method: str = "GET") -> bytes:
    """Authenticated Jenkins request; raises on HTTP errors."""
    url = path_or_url if path_or_url.startswith("http") else f"{JENKINS_URL}/{path_or_url.lstrip('/')}"
    request = urllib.request.Request(url, data=data, method=method)
    if JENKINS_USER and JENKINS_API_TOKEN:
        auth = base64.b64encode(f"{JENKINS_USER}:{JENKINS_API_TOKEN}".encode()).decode()
        request.add_header("Authorization", f"Basic {auth}")
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def _job_api(tree: str) -> dict:
    return json.loads(_request(f"{JENKINS_FIRMWARE_JOB}/api/json?tree={urllib.parse.quote(tree)}"))


def _normalize_sdk(fragment: str) -> str:
    """Whitespace-insensitive comparison form of a sdkconfig fragment."""
    lines = [line.strip() for line in (fragment or "").replace("\r", "").split("\n") if line.strip()]
    return "\n".join(sorted(lines))


def jenkins_params_for(entry: dict) -> dict:
    params = {
        "chip": entry["chip"],
        "prov_mode": entry["prov_mode"],
        "product": entry["product"],
        "esp_rainmaker_branch": os.environ.get("ESP_RAINMAKER_BRANCH", "master"),
        "CUSTOM_SDK_CONFIG": entry["custom_sdk_config"],
    }
    if entry.get("idf_version"):
        params["idf_version"] = entry["idf_version"]
    return params


def get_job_parameters() -> dict:
    payload = _job_api("property[parameterDefinitions[name,type,choices]]")
    parameters = {}
    for prop in payload.get("property", []):
        for definition in prop.get("parameterDefinitions", []) or []:
            parameters[definition["name"]] = definition.get("choices") or []
    return parameters


def find_matching_build(entry: dict) -> int:
    """Latest successful build whose parameters match the variant and still has
    artifacts; 0 if none."""
    wanted = jenkins_params_for(entry)
    payload = _job_api("builds[number,result,artifacts[fileName],actions[parameters[name,value]]]{0,100}")
    for build in payload.get("builds", []):
        if build.get("result") != "SUCCESS":
            continue
        if not build.get("artifacts"):
            continue
        build_params = {}
        for action in build.get("actions", []):
            for parameter in action.get("parameters", []) or []:
                build_params[parameter.get("name")] = str(parameter.get("value", ""))
        if (
            build_params.get("chip") == wanted["chip"]
            and build_params.get("prov_mode") == wanted["prov_mode"]
            and build_params.get("product") == wanted["product"]
            and build_params.get("idf_version", "") == wanted.get("idf_version", "")
            and _normalize_sdk(build_params.get("CUSTOM_SDK_CONFIG", ""))
            == _normalize_sdk(wanted["CUSTOM_SDK_CONFIG"])
        ):
            return build["number"]
    return 0


def trigger_build(entry: dict) -> int:
    """Trigger buildWithParameters and wait for the build number via the queue."""
    params = jenkins_params_for(entry)
    if JENKINS_TRIGGER_TOKEN:
        params["token"] = JENKINS_TRIGGER_TOKEN
    body = urllib.parse.urlencode(params).encode()
    url = f"{JENKINS_URL}/{JENKINS_FIRMWARE_JOB}/buildWithParameters"
    request = urllib.request.Request(url, data=body, method="POST")
    if JENKINS_USER and JENKINS_API_TOKEN:
        auth = base64.b64encode(f"{JENKINS_USER}:{JENKINS_API_TOKEN}".encode()).decode()
        request.add_header("Authorization", f"Basic {auth}")
    with urllib.request.urlopen(request, timeout=60) as response:
        queue_url = response.headers.get("Location", "")
    if not queue_url:
        raise RuntimeError("Jenkins did not return a queue URL for the triggered build")

    print(f"  queued: {queue_url}")
    deadline = time.time() + 1800
    while time.time() < deadline:
        queue_item = json.loads(_request(f"{queue_url.rstrip('/')}/api/json"))
        executable = queue_item.get("executable")
        if executable:
            return executable["number"]
        time.sleep(10)
    raise TimeoutError("Triggered build did not leave the Jenkins queue in 30 min")


def wait_for_build(number: int, timeout: int = 3600) -> None:
    print(f"  build #{number} running ...")
    deadline = time.time() + timeout
    while time.time() < deadline:
        build = json.loads(_request(f"{JENKINS_FIRMWARE_JOB}/{number}/api/json?tree=result,building"))
        if not build.get("building"):
            if build.get("result") == "SUCCESS":
                return
            raise RuntimeError(f"Build #{number} finished with {build.get('result')}")
        time.sleep(30)
    raise TimeoutError(f"Build #{number} did not finish in {timeout}s")


def download_artifacts(number: int, dest_dir: Path) -> list:
    """Download and extract build artifact archives into dest_dir."""
    build = json.loads(_request(f"{JENKINS_FIRMWARE_JOB}/{number}/api/json?tree=artifacts[fileName,relativePath]"))
    artifacts = build.get("artifacts", [])
    if not artifacts:
        raise RuntimeError(f"Build #{number} has no artifacts")

    extracted = []
    for artifact in artifacts:
        relative_path = artifact["relativePath"]
        file_name = artifact["fileName"]
        if not file_name.endswith((".tar.gz", ".tgz", ".zip")):
            continue
        print(f"  downloading {file_name} ...")
        blob = _request(f"{JENKINS_FIRMWARE_JOB}/{number}/artifact/{relative_path}")
        if file_name.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(blob)) as archive:
                top_levels = {name.split("/")[0] for name in archive.namelist()}
                archive.extractall(dest_dir)
        else:
            with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as archive:
                top_levels = {name.split("/")[0] for name in archive.getnames()}
                archive.extractall(dest_dir)
        extracted.extend(sorted(dest_dir / name for name in top_levels))
    if not extracted:
        raise RuntimeError(f"Build #{number} produced no firmware archive")
    return extracted


def bundle_exists_for(entry: dict) -> bool:
    """True when a local bundle already matches chip + prov_mode (any build number)."""
    if not FIRMWARES_DIR.is_dir():
        return False
    for bundle in FIRMWARES_DIR.iterdir():
        info = None
        for name in ("build_details.info", "build_details.txt"):
            candidate = bundle / name
            if candidate.exists():
                info = candidate.read_text(errors="replace").lower()
                break
        if info and f"chip: {entry['chip']}" in info and f"prov_mode: {entry['prov_mode']}" in info:
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--trigger", action="store_true", help="always trigger fresh builds")
    parser.add_argument("--list-params", action="store_true", help="print the Jenkins job parameters and exit")
    parser.add_argument("--only", help="download a single variant by name (see FIRMWARE_MATRIX)")
    parser.add_argument("--skip-existing", action="store_true",
                        help="skip variants that already have a local bundle for the chip+prov_mode")
    args = parser.parse_args()

    if not (JENKINS_URL and JENKINS_FIRMWARE_JOB):
        print("ERROR: set JENKINS_URL and JENKINS_FIRMWARE_JOB (CI variables / secrets file)")
        return 2

    if not (JENKINS_USER and JENKINS_API_TOKEN):
        print("ERROR: set JENKINS_USER and JENKINS_API_TOKEN (CI variables / .env)")
        return 2

    if args.list_params:
        print(json.dumps(get_job_parameters(), indent=2))
        return 0

    FIRMWARES_DIR.mkdir(parents=True, exist_ok=True)
    failures = []
    keep = set()
    for entry in FIRMWARE_MATRIX:
        if args.only and entry["name"] != args.only:
            continue
        print(f"\n=== {entry['name']} ===")
        if args.skip_existing and bundle_exists_for(entry):
            print("  local bundle already present — skipping")
            continue
        try:
            number = 0
            if not args.trigger:
                number = find_matching_build(entry)
                if number:
                    print(f"  reusing successful build #{number}")
            if not number:
                print("  triggering fresh build")
                number = trigger_build(entry)
                wait_for_build(number)
            for bundle in download_artifacts(number, FIRMWARES_DIR):
                print(f"  -> {bundle}")
            keep.add(number)
        except Exception as error:
            print(f"  FAILED: {error}")
            failures.append(entry["name"])

    # Prune only after a full, successful sweep: with --only/--skip-existing the
    # unresolved variants' bundles would look superseded and get deleted.
    if keep and not failures and not args.only and not args.skip_existing:
        prune_superseded(keep)

    print("\n=== matter image ===")
    try:
        download_matter_image()
    except Exception as error:
        print(f"  matter image refresh FAILED (the matter fixture retries at test time): {error}")

    if failures:
        print(f"\nFailed variants: {failures}")
        return 1
    print(f"\nAll firmware bundles ready under {FIRMWARES_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
