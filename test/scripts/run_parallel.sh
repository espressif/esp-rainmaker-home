# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

#!/bin/bash

# Device-Level Parallel Test Execution
# Runs Android and iOS tests simultaneously without conflicts

# Defaults
DEVICES=("iPhone 13" "SM-M315F")
MARKER="sanity"
TS=$(date +"%Y-%m-%d_%H-%M-%S")

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Run pytest on multiple devices in parallel."
    echo ""
    echo "Options:"
    echo "  -d, --devices DEVICES   Comma-separated list of device models. Default: iPhone 13,SM-M315F"
    echo "  -m, --marker MARKER     Pytest marker (sanity, regression). Default: sanity"
    echo "  -h, --help             Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 -m regression"
    echo "  $0 -d 'iPhone 13,SM-M315F' -m sanity"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--devices)
            IFS=',' read -ra DEVICES <<< "$2"
            shift 2
            ;;
        -m|--marker)
            MARKER="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Run from test/ directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$TEST_DIR"

echo "Parallel tests: marker=$MARKER, devices=${DEVICES[*]}"
echo ""

run_device_tests() {
    local MODEL="$1"
    echo "$MODEL started at $(date '+%H:%M:%S')"
    python3 -m pytest -m "$MARKER" --html="${MODEL}_${TS}.html" --self-contained-html \
        --model "$MODEL" --tb=short --disable-warnings -v
    local EXIT=$?
    [[ $EXIT -eq 0 ]] && echo "$MODEL done" || echo "$MODEL failed ($EXIT)"
    return $EXIT
}

export -f run_device_tests
export MARKER TS

PIDS=()
for DEVICE in "${DEVICES[@]}"; do
    run_device_tests "$DEVICE" &
    PIDS+=($!)
done

SUCCESS=0
for PID in "${PIDS[@]}"; do
    wait $PID && SUCCESS=$((SUCCESS + 1)) || true
done

echo ""
echo "📊 ${SUCCESS}/${#DEVICES[@]} passed"
for MODEL in "${DEVICES[@]}"; do
    [[ -f "${MODEL}_${TS}.html" ]] && echo "  ✓ ${MODEL}_${TS}.html" || echo "  ✗ $MODEL: no report"
done

[[ $SUCCESS -eq ${#DEVICES[@]} ]] && exit 0 || exit 1
