/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fails the build when a `t("...")` key is missing from en.json, when either
 * locale has a duplicate key, or when zh.json has drifted from en.json.
 *
 * A missing key is not a silent no-op: i18next returns the key string itself,
 * so the user sees `device.errors.nodeNotFound` rendered on screen. `||`
 * fallbacks after `t()` never fire, because the returned key is truthy.
 *
 * Run: npm run check:i18n [-- --strict-zh]
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOCALES = { en: "locales/en.json", zh: "locales/zh.json" };
const SOURCE_DIRS = ["src", "app"];
/** Untranslated zh keys fall back to English, so they warn rather than fail. */
const STRICT_ZH = process.argv.includes("--strict-zh");

/** Flattens a locale tree into dotted keys. */
const flatten = (node, prefix = "", out = {}) => {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, full, out);
    } else {
      out[full] = value;
    }
  }
  return out;
};

/** Reports keys declared twice in the same object; JSON.parse would hide them. */
const findDuplicates = (file) => {
  const stack = [];
  const scopes = [];
  const duplicates = [];
  fs.readFileSync(path.join(ROOT, file), "utf8")
    .split("\n")
    .forEach((raw, index) => {
      const line = raw.trim();
      const match = line.match(/^"([^"]+)":/);
      const scope = scopes[scopes.length - 1];
      if (match && scope) {
        if (scope.has(match[1])) {
          duplicates.push(`${file}:${index + 1}  ${[...stack, match[1]].join(".")}`);
        }
        scope.add(match[1]);
      }
      if (line.endsWith("{")) {
        stack.push(match ? match[1] : "?");
        scopes.push(new Set());
      }
      if (line.startsWith("}")) {
        stack.pop();
        scopes.pop();
      }
    });
  return duplicates;
};

/** Every .ts/.tsx file under the source dirs. */
const collectSources = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") collectSources(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

const en = flatten(JSON.parse(fs.readFileSync(path.join(ROOT, LOCALES.en), "utf8")));
const zh = flatten(JSON.parse(fs.readFileSync(path.join(ROOT, LOCALES.zh), "utf8")));
const enKeys = new Set(Object.keys(en));
const zhKeys = new Set(Object.keys(zh));

const files = SOURCE_DIRS.flatMap((dir) => collectSources(path.join(ROOT, dir)));

// Literal single-argument t("...") calls only; runtime-built keys are skipped.
const KEY_CALL = /\bt\(\s*"([a-zA-Z][\w.]*\.[\w.]+)"/g;
const missing = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(KEY_CALL)) {
    const key = match[1];
    if (key.endsWith(".") || enKeys.has(key)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    const where = `${path.relative(ROOT, file)}:${line}`;
    missing.set(key, [...(missing.get(key) ?? []), where]);
  }
}

const duplicates = [...findDuplicates(LOCALES.en), ...findDuplicates(LOCALES.zh)];
const zhMissing = [...enKeys].filter((key) => !zhKeys.has(key));
const zhOrphans = [...zhKeys].filter((key) => !enKeys.has(key));

let failed = false;

if (missing.size) {
  failed = true;
  console.error(`\n✖ ${missing.size} key(s) used in code but missing from ${LOCALES.en}:`);
  for (const [key, locations] of [...missing].sort()) {
    console.error(`  ${key}`);
    locations.forEach((location) => console.error(`      ${location}`));
  }
}

if (duplicates.length) {
  failed = true;
  console.error(`\n✖ ${duplicates.length} duplicate key(s) — JSON keeps only the last:`);
  duplicates.forEach((entry) => console.error(`  ${entry}`));
}

// Locale drift degrades to English rather than rendering a raw key, so it
// warns by default and only fails under --strict-zh.
const drift = [
  [zhOrphans, `key(s) in ${LOCALES.zh} with no ${LOCALES.en} counterpart`],
  [zhMissing, `key(s) untranslated in ${LOCALES.zh} (falls back to English)`],
];
for (const [keys, label] of drift) {
  if (!keys.length) continue;
  if (STRICT_ZH) failed = true;
  const log = STRICT_ZH ? console.error : console.warn;
  log(`\n${STRICT_ZH ? "✖" : "!"} ${keys.length} ${label}:`);
  keys.forEach((key) => log(`  ${key}`));
}

if (failed) {
  process.exit(1);
}

console.log(`✔ i18n OK — ${enKeys.size} keys, ${files.length} files checked`);
