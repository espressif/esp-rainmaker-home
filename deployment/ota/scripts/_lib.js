// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

// Shared helpers for the OTA scripts in this folder. Internal — not a CLI
// entrypoint. Leading underscore signals "don't invoke directly".

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..", "..");

// `--key value` pair parser (publish.js / promote.js). Every argument is
// treated as a `--key value` pair; no boolean flags.
function parsePairArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  return args;
}

// Mixed flags + options parser (sync-* scripts). `flags` are boolean; `options`
// take the following argv item as their value. `-h`/`--help` calls `onHelp` and
// exits. Unknown arguments print an error and exit 1.
function parseFlagArgs(argv, { flags = [], options = [], onHelp } = {}) {
  const result = {};
  for (const f of flags) result[f] = false;
  for (const o of options) result[o] = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      onHelp?.();
      process.exit(0);
    }
    const key = a.startsWith("--") ? a.slice(2) : null;
    if (key && flags.includes(key)) {
      result[key] = true;
    } else if (key && options.includes(key)) {
      result[key] = argv[++i];
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return result;
}

// Print the caller's top-level docblock (`/** … */`) as help output. Caller
// passes `__filename` so the block is read from its own source.
function printOwnHelp(callerFile) {
  const src = fs.readFileSync(callerFile, "utf-8");
  const start = src.indexOf("/**");
  const end = src.indexOf("*/");
  if (start >= 0 && end > start) console.log(src.slice(start, end + 2));
}

// `aws` spawn helpers used by publish/promote. `--metadata` values are
// redacted when the command is echoed because they contain signature material.
function awsRun(args, opts = {}) {
  const shown = args.map((a, i) => (args[i - 1] === "--metadata" ? "<redacted>" : a));
  console.log(`$ aws ${shown.join(" ")}`);
  const result = spawnSync("aws", args, { stdio: "inherit", ...opts });
  if (result.status !== 0) {
    console.error(`aws exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function awsRunCapture(args) {
  return spawnSync("aws", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
}

// Regex-anchored read/patch for a single field inside a native config file.
// `reKey` must have three capture groups: (prefix)(value)(suffix). Optional
// `decode`/`encode` hooks translate between the on-disk representation and the
// canonical source form (e.g. XML-entity newlines in AndroidManifest attrs).
// `fieldName` is used only in the not-found error message.
function readNativeField({ file, reKey, decode, fieldName }) {
  const abs = path.join(ROOT, file);
  const contents = fs.readFileSync(abs, "utf-8");
  const match = contents.match(reKey);
  if (!match) {
    throw new Error(
      `Could not locate ${fieldName || "field"} in ${file} — regex mismatch, file layout may have changed`
    );
  }
  const raw = match[2].trim();
  return { contents, current: decode ? decode(raw) : raw };
}

function patchNativeField(target, newValue) {
  const { file, reKey, encode } = target;
  const { contents, current } = readNativeField(target);
  if (current === newValue) return { changed: false, current };
  const encoded = encode ? encode(newValue) : newValue;
  const next = contents.replace(reKey, (_m, a, _b, c) => `${a}${encoded}${c}`);
  fs.writeFileSync(path.join(ROOT, file), next);
  return { changed: true, current };
}

module.exports = {
  ROOT,
  parsePairArgs,
  parseFlagArgs,
  printOwnHelp,
  awsRun,
  awsRunCapture,
  readNativeField,
  patchNativeField,
};
