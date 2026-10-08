#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
//
// SPDX-License-Identifier: Apache-2.0
//
// Read / write `deployment/web/cdn.yaml` and build S3 pointer artifacts for
// web deploys (latest/manifest.json, history line, version-meta,
// version-manifest).

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const YAML = require("yaml");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", "..");
const WEB_DEPLOY_DIR = join(ROOT, "deployment", "web");
const CDN_PATH = join(WEB_DEPLOY_DIR, "cdn.yaml");
const CDN_EXAMPLE_PATH = join(WEB_DEPLOY_DIR, "cdn.yaml.example");

const WEB_PLATFORM = "web";
const DEFAULT_ENVIRONMENT = "prod";
const DEFAULT_REGION = "global";
const ALLOWED_REGIONS = new Set(["global", "cn"]);
const ALLOWED_ENVIRONMENTS = new Set(["prod"]);

/**
 * Prints usage for the cdn-config CLI.
 * @returns {void}
 */
function printUsage() {
  console.error(`Usage:
  node scripts/lib/cdn-config.mjs ensure
  node scripts/lib/cdn-config.mjs resolve-web [--env prod] [--region global]
  node scripts/lib/cdn-config.mjs record-web --version <semver> --prefix <s3-prefix> [--git-sha <sha>] [--git-branch <branch>] [--git-author <author>] [--deployed-by <name>] [--dist-sha <sha256>] [--site-url <url>]
  node scripts/lib/cdn-config.mjs write-web-pointers --version <semver> --env <env> --region <region> --out-dir <dir> [--git-sha <sha>] [--git-branch <branch>] [--dist-sha <sha256>] [--history-path <file>] [--version-meta-path <file>] [--version-manifest-path <file>]
  node scripts/lib/cdn-config.mjs hash-dist --dir <path>
`);
}

/**
 * Recursively lists files under a directory (files only).
 * @param {string} dir
 * @returns {string[]}
 */
function listFilesRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * SHA-256 of a deploy tree: sorted relative paths + file bytes.
 * Stable across machines; changes when any uploaded file changes.
 * @param {string} dir - Absolute or relative path to the versioned dist folder
 * @returns {string} Hex digest
 */
function hashDistDirectory(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`hash-dist: not a directory: ${dir}`);
  }

  const root = dir;
  const files = listFilesRecursive(root).sort((a, b) => {
    const ra = relative(root, a).split("\\").join("/");
    const rb = relative(root, b).split("\\").join("/");
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });

  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = relative(root, filePath).split("\\").join("/");
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * CLI: print SHA-256 of a dist directory to stdout.
 * @param {string[]} argv
 * @returns {void}
 */
function hashDistCommand(argv) {
  let dir = "";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dir" && argv[i + 1]) {
      dir = argv[++i];
    }
  }
  if (!dir) {
    throw new Error("hash-dist requires --dir <path>");
  }
  process.stdout.write(`${hashDistDirectory(dir)}\n`);
}

/**
 * Normalizes an optional string flag to null when empty.
 * @param {string | undefined} value
 * @returns {string | null}
 */
function nullableString(value) {
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds provenance fields for the LOCAL tracking file (deployment/web/cdn.yaml).
 * Includes people (git author, deployer); never use for published artifacts.
 * @param {{
 *   gitSha?: string,
 *   gitBranch?: string,
 *   gitAuthor?: string,
 *   deployedBy?: string,
 *   distSha?: string,
 * }} meta
 * @returns {{
 *   git_sha: string | null,
 *   git_branch: string | null,
 *   git_author: string | null,
 *   deployed_by: string | null,
 *   dist_sha: string | null,
 * }}
 */
function deployProvenanceFields(meta) {
  return {
    git_sha: nullableString(meta.gitSha),
    git_branch: nullableString(meta.gitBranch),
    git_author: nullableString(meta.gitAuthor),
    deployed_by: nullableString(meta.deployedBy),
    dist_sha: nullableString(meta.distSha),
  };
}

/**
 * Builds provenance fields for PUBLISHED pointer artifacts (latest/manifest.json,
 * history.jsonl, version-meta.json, version-manifest.json). These objects are
 * served from the public CDN, so they carry commit identifiers only — no
 * author names, emails, or deployer logins.
 * @param {{ gitSha?: string, gitBranch?: string, distSha?: string }} meta
 * @returns {{ git_sha: string | null, git_branch: string | null, dist_sha: string | null }}
 */
function publicProvenanceFields(meta) {
  return {
    git_sha: nullableString(meta.gitSha),
    git_branch: nullableString(meta.gitBranch),
    dist_sha: nullableString(meta.distSha),
  };
}

/**
 * Ensures `deployment/web/cdn.yaml` exists (copied from the committed example).
 * @returns {string} Absolute path to cdn.yaml
 */
function ensureCdnConfig() {
  mkdirSync(WEB_DEPLOY_DIR, { recursive: true });
  if (!existsSync(CDN_PATH)) {
    if (!existsSync(CDN_EXAMPLE_PATH)) {
      throw new Error(`Missing ${CDN_EXAMPLE_PATH}`);
    }
    copyFileSync(CDN_EXAMPLE_PATH, CDN_PATH);
    console.error(`Created ${CDN_PATH} from cdn.yaml.example`);
  }
  return CDN_PATH;
}

/**
 * Loads and parses `deployment/web/cdn.yaml`.
 * @returns {Record<string, unknown>}
 */
function loadCdnConfig() {
  ensureCdnConfig();
  const raw = readFileSync(CDN_PATH, "utf8");
  const doc = YAML.parse(raw);
  if (!doc || typeof doc !== "object") {
    throw new Error(`${CDN_PATH} is empty or invalid`);
  }
  return /** @type {Record<string, unknown>} */ (doc);
}

/**
 * Writes the CDN config document back to disk.
 * @param {Record<string, unknown>} doc
 * @returns {void}
 */
function saveCdnConfig(doc) {
  ensureCdnConfig();
  const body = YAML.stringify(doc, { lineWidth: 0 });
  writeFileSync(CDN_PATH, body.endsWith("\n") ? body : `${body}\n`, "utf8");
}

/**
 * Reads a nested platform block from the CDN config.
 * @param {Record<string, unknown>} doc
 * @param {string} platform
 * @returns {Record<string, unknown>}
 */
function platformBlock(doc, platform) {
  const block = doc[platform];
  if (!block || typeof block !== "object") {
    return {};
  }
  return /** @type {Record<string, unknown>} */ (block);
}

/**
 * Validates and normalizes environment / region for APP_ASSETS paths.
 * @param {string} environment
 * @param {string} region
 * @returns {{ environment: string, region: string }}
 */
function normalizeTarget(environment, region) {
  const env = String(environment || DEFAULT_ENVIRONMENT).trim();
  const reg = String(region || DEFAULT_REGION).trim();
  if (!ALLOWED_ENVIRONMENTS.has(env)) {
    throw new Error(`Unsupported CDN environment '${env}' (allowed: prod)`);
  }
  if (!ALLOWED_REGIONS.has(reg)) {
    throw new Error(`Unsupported CDN region '${reg}' (allowed: global, cn)`);
  }
  return { environment: env, region: reg };
}

/**
 * Builds the immutable web version S3 prefix (no trailing slash).
 * @param {string} environment
 * @param {string} region
 * @param {string} version
 * @returns {string}
 */
function webVersionPrefix(environment, region, version) {
  return `web/${environment}/${region}/${version}`;
}

/**
 * Builds the web region root prefix (no trailing slash).
 * @param {string} environment
 * @param {string} region
 * @returns {string}
 */
function webRegionPrefix(environment, region) {
  return `web/${environment}/${region}`;
}

/**
 * Resolves web deploy target from env overrides + `deployment/web/cdn.yaml`.
 * Prints shell-friendly KEY=value lines on stdout.
 * @param {string[]} argv
 * @returns {void}
 */
function resolveWeb(argv) {
  const doc = loadCdnConfig();
  const web = platformBlock(doc, WEB_PLATFORM);

  let environment =
    process.env.WEB_DEPLOY_ENV ||
    (typeof web.environment === "string" ? web.environment : DEFAULT_ENVIRONMENT);
  let region =
    process.env.WEB_DEPLOY_REGION ||
    (typeof web.region === "string" ? web.region : DEFAULT_REGION);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) {
      environment = argv[++i];
    } else if (arg === "--region" && argv[i + 1]) {
      region = argv[++i];
    }
  }

  const target = normalizeTarget(environment, region);
  const bucket =
    (typeof doc.bucket === "string" && doc.bucket.trim()) ||
    process.env.APP_ASSETS_S3_BUCKET ||
    "";
  const cdnUrl =
    (typeof doc.cdn_url === "string" && doc.cdn_url.trim()) ||
    process.env.APP_ASSETS_URL ||
    "";

  process.stdout.write(
    [
      `WEB_DEPLOY_ENV=${shellQuote(target.environment)}`,
      `WEB_DEPLOY_REGION=${shellQuote(target.region)}`,
      `WEB_REGION_S3_PREFIX=${shellQuote(webRegionPrefix(target.environment, target.region))}`,
      `CDN_CONFIG_BUCKET=${shellQuote(bucket)}`,
      `CDN_CONFIG_URL=${shellQuote(cdnUrl)}`,
      `CDN_CONFIG_PATH=${shellQuote(CDN_PATH)}`,
    ].join("\n") + "\n"
  );
}

/**
 * Quotes a value for `eval "$(…)"` shell consumption.
 * @param {string} value
 * @returns {string}
 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Records a successful web publish into `deployment/web/cdn.yaml`.
 * @param {string[]} argv
 * @returns {void}
 */
function recordWeb(argv) {
  let version = "";
  let prefix = "";
  let gitSha = process.env.CI_COMMIT_SHA || process.env.GITHUB_SHA || "";
  let gitBranch = process.env.CI_COMMIT_BRANCH || process.env.CI_COMMIT_REF_NAME || process.env.GITHUB_REF_NAME || "";
  let gitAuthor = "";
  let deployedBy =
    process.env.GITLAB_USER_NAME ||
    process.env.GITLAB_USER_LOGIN ||
    process.env.GITHUB_ACTOR ||
    "";
  let distSha = "";
  let siteUrl = "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version" && argv[i + 1]) {
      version = argv[++i];
    } else if (arg === "--prefix" && argv[i + 1]) {
      prefix = argv[++i];
    } else if (arg === "--git-sha" && argv[i + 1]) {
      gitSha = argv[++i];
    } else if (arg === "--git-branch" && argv[i + 1]) {
      gitBranch = argv[++i];
    } else if (arg === "--git-author" && argv[i + 1]) {
      gitAuthor = argv[++i];
    } else if (arg === "--deployed-by" && argv[i + 1]) {
      deployedBy = argv[++i];
    } else if (arg === "--dist-sha" && argv[i + 1]) {
      distSha = argv[++i];
    } else if (arg === "--site-url" && argv[i + 1]) {
      siteUrl = argv[++i];
    }
  }

  if (!version || !prefix) {
    throw new Error("record-web requires --version and --prefix");
  }

  const doc = loadCdnConfig();
  const web = platformBlock(doc, WEB_PLATFORM);
  const environment =
    process.env.WEB_DEPLOY_ENV ||
    (typeof web.environment === "string" ? web.environment : DEFAULT_ENVIRONMENT);
  const region =
    process.env.WEB_DEPLOY_REGION ||
    (typeof web.region === "string" ? web.region : DEFAULT_REGION);
  const target = normalizeTarget(environment, region);
  const provenance = deployProvenanceFields({
    gitSha,
    gitBranch,
    gitAuthor,
    deployedBy,
    distSha,
  });

  web.environment = target.environment;
  web.region = target.region;
  web.latest = {
    version,
    s3_prefix: prefix,
    published_at: new Date().toISOString(),
    git_sha: provenance.git_sha || "",
    git_branch: provenance.git_branch || "",
    git_author: provenance.git_author || "",
    deployed_by: provenance.deployed_by || "",
    dist_sha: provenance.dist_sha || "",
    site_url: siteUrl || "",
  };
  doc[WEB_PLATFORM] = web;

  saveCdnConfig(doc);
  console.error(`Updated ${CDN_PATH} web.latest → ${version}`);
}

/**
 * Parses CLI flags for write-web-pointers.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parsePointerArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--") && argv[i + 1]) {
      out[arg.slice(2)] = argv[++i];
    }
  }
  return out;
}

/**
 * Writes local pointer artifact files used before S3 upload.
 * @param {string[]} argv
 * @returns {void}
 */
function writeWebPointers(argv) {
  const args = parsePointerArgs(argv);
  const version = args.version || "";
  const environment = args.env || DEFAULT_ENVIRONMENT;
  const region = args.region || DEFAULT_REGION;
  const outDir = args["out-dir"] || "";
  const gitSha = args["git-sha"] || process.env.CI_COMMIT_SHA || process.env.GITHUB_SHA || "";
  const gitBranch =
    args["git-branch"] ||
    process.env.CI_COMMIT_BRANCH ||
    process.env.CI_COMMIT_REF_NAME ||
    process.env.GITHUB_REF_NAME ||
    "";
  const distSha = args["dist-sha"] || "";
  const historyPath = args["history-path"] || "";
  const versionMetaPath = args["version-meta-path"] || "";
  const versionManifestPath = args["version-manifest-path"] || "";

  if (!version || !outDir) {
    throw new Error("write-web-pointers requires --version and --out-dir");
  }

  const target = normalizeTarget(environment, region);
  const prefix = webVersionPrefix(target.environment, target.region, version);
  const regionPrefix = webRegionPrefix(target.environment, target.region);
  const publishedAt = new Date().toISOString();
  const provenance = publicProvenanceFields({ gitSha, gitBranch, distSha });

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "latest"), { recursive: true });

  const latestManifest = {
    version,
    prefix,
    environment: target.environment,
    region: target.region,
    updated_at: publishedAt,
    ...provenance,
  };
  writeFileSync(
    join(outDir, "latest", "manifest.json"),
    `${JSON.stringify(latestManifest, null, 2)}\n`,
    "utf8"
  );

  /** @type {Record<string, unknown>} */
  let versionMeta = { versions: {} };
  if (versionMetaPath && existsSync(versionMetaPath)) {
    try {
      versionMeta = JSON.parse(readFileSync(versionMetaPath, "utf8"));
    } catch {
      versionMeta = { versions: {} };
    }
  }
  if (!versionMeta.versions || typeof versionMeta.versions !== "object") {
    versionMeta.versions = {};
  }
  const versions = /** @type {Record<string, unknown>} */ (versionMeta.versions);
  versions[version] = {
    published_at: publishedAt,
    prefix,
    ...provenance,
  };
  versionMeta.environment = target.environment;
  versionMeta.region = target.region;
  versionMeta.updated_at = publishedAt;
  writeFileSync(
    join(outDir, "version-meta.json"),
    `${JSON.stringify(versionMeta, null, 2)}\n`,
    "utf8"
  );

  const historyLine = JSON.stringify({
    action: "promote",
    version,
    prefix,
    environment: target.environment,
    region: target.region,
    published_at: publishedAt,
    ...provenance,
  });

  let historyBody = "";
  if (historyPath && existsSync(historyPath)) {
    historyBody = readFileSync(historyPath, "utf8");
    if (historyBody.length > 0 && !historyBody.endsWith("\n")) {
      historyBody += "\n";
    }
  }
  historyBody += `${historyLine}\n`;
  writeFileSync(join(outDir, "history.jsonl"), historyBody, "utf8");

  /** @type {Record<string, unknown>} */
  let versionManifest = {};
  if (versionManifestPath && existsSync(versionManifestPath)) {
    try {
      versionManifest = JSON.parse(readFileSync(versionManifestPath, "utf8"));
    } catch {
      versionManifest = {};
    }
  }
  if (!versionManifest[target.environment] || typeof versionManifest[target.environment] !== "object") {
    versionManifest[target.environment] = {};
  }
  const envBlock = /** @type {Record<string, unknown>} */ (
    versionManifest[target.environment]
  );
  envBlock[target.region] = {
    version,
    prefix,
    updated_at: publishedAt,
    ...provenance,
  };
  versionManifest.updated_at = publishedAt;
  writeFileSync(
    join(outDir, "version-manifest.json"),
    `${JSON.stringify(versionManifest, null, 2)}\n`,
    "utf8"
  );

  process.stdout.write(
    [
      `WEB_POINTER_LATEST=${shellQuote(join(outDir, "latest", "manifest.json"))}`,
      `WEB_POINTER_HISTORY=${shellQuote(join(outDir, "history.jsonl"))}`,
      `WEB_POINTER_VERSION_META=${shellQuote(join(outDir, "version-meta.json"))}`,
      `WEB_POINTER_VERSION_MANIFEST=${shellQuote(join(outDir, "version-manifest.json"))}`,
      `WEB_VERSION_S3_PREFIX=${shellQuote(prefix)}`,
      `WEB_REGION_S3_PREFIX=${shellQuote(regionPrefix)}`,
    ].join("\n") + "\n"
  );
}

/**
 * CLI entrypoint.
 * @returns {void}
 */
function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "-h" || command === "--help") {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  switch (command) {
    case "ensure":
      console.log(ensureCdnConfig());
      break;
    case "resolve-web":
      resolveWeb(rest);
      break;
    case "record-web":
      recordWeb(rest);
      break;
    case "write-web-pointers":
      writeWebPointers(rest);
      break;
    case "hash-dist":
      hashDistCommand(rest);
      break;
    default:
      printUsage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main();
