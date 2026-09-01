#!/usr/bin/env node

/**
 * Fills missing or empty keys in a CI/decoded env file from the committed
 * `.env.<region>.example` template. Non-empty values in the target always win.
 *
 * Used by GitLab CI when FS_ENV_* secrets are absent or omit keys that were
 * added to the template after the secret was last updated.
 *
 * @param {string} targetPath - Real-values env file (e.g. `.env.global` from CI).
 * @param {string} examplePath - Committed template (e.g. `.env.global.example`).
 */

const fs = require("fs");
const path = require("path");

/**
 * Parses KEY=VALUE lines from an env file (comments and blanks skipped).
 * @param {string} filePath - Absolute or repo-relative path.
 * @returns {Record<string, string>}
 */
function parseEnvFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Env file not found: ${filePath}`);
  }
  const result = {};
  for (const rawLine of fs.readFileSync(abs, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Merges example defaults under a target env map; target non-empty values win.
 * @param {Record<string, string>} target - CI / real-values env.
 * @param {Record<string, string>} example - Committed template env.
 * @returns {Record<string, string>}
 */
function mergeEnvMaps(target, example) {
  const merged = { ...example };
  for (const [key, value] of Object.entries(target)) {
    if (value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Serializes an env map to KEY=VALUE lines (stable: example key order first).
 * @param {Record<string, string>} merged - Merged env map.
 * @param {Record<string, string>} example - Template for key ordering.
 * @param {Record<string, string>} target - Target for extra keys not in template.
 * @returns {string}
 */
function serializeEnv(merged, example, target) {
  const lines = [];
  const written = new Set();

  for (const key of Object.keys(example)) {
    if (!(key in merged)) continue;
    lines.push(`${key}=${merged[key]}`);
    written.add(key);
  }

  for (const key of Object.keys(target)) {
    if (written.has(key)) continue;
    lines.push(`${key}=${merged[key] ?? target[key]}`);
    written.add(key);
  }

  for (const key of Object.keys(merged)) {
    if (written.has(key)) continue;
    lines.push(`${key}=${merged[key]}`);
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Entry: merge target env with example template and overwrite target in place.
 * @returns {void}
 */
function main() {
  const [targetPath, examplePath] = process.argv.slice(2);
  if (!targetPath || !examplePath) {
    console.error("Usage: node scripts/merge-env-with-example.js <target.env> <example.env>");
    process.exit(1);
  }

  const target = parseEnvFile(targetPath);
  const example = parseEnvFile(examplePath);
  const merged = mergeEnvMaps(target, example);
  const output = serializeEnv(merged, example, target);

  const absTarget = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(process.cwd(), targetPath);
  fs.writeFileSync(absTarget, output, "utf8");

  const filledFromExample = Object.keys(example).filter(
    (key) => (!(key in target) || target[key] === "") && example[key] !== ""
  );
  if (filledFromExample.length > 0) {
    console.log(
      `merge-env-with-example: filled ${filledFromExample.length} key(s) from ${examplePath}: ${filledFromExample.join(", ")}`
    );
  } else {
    console.log(`merge-env-with-example: ${targetPath} already complete (no example fill needed)`);
  }
}

main();
