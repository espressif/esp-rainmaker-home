# Web Deployment (build + publish)

Publish the **Expo web export** to the existing **APP_ASSETS** S3 bucket under **`web/<env>/<region>/<version>/`**, update **latest** + tracking manifests, record state in **`deployment/web/cdn.yaml`**, then invalidate CloudFront. There is no CDK / hosting stack in this repo — hosting is managed separately; this project only **builds** and **uploads**.

## Overview

| Step | Command / trigger |
| --- | --- |
| Local publish | `npm run deploy:web` |
| CI | Manual `web_deploy` job on **`release/*`** branches |

**S3 layout** (web is a sibling of `ota/`):

```
s3://$APP_ASSETS_S3_BUCKET/
├── web/
│   ├── prod/
│   │   ├── global/                    ← WEB_DEPLOY_REGION (or cn)
│   │   │   ├── 6.1.0/                 ← package.json version
│   │   │   │   ├── index.html
│   │   │   │   ├── expo/…
│   │   │   │   └── assets/…
│   │   │   ├── latest/
│   │   │   │   ├── manifest.json      ← mutable pointer
│   │   │   │   └── index.html         ← bounce: fetch manifest → version URL
│   │   │   ├── history.jsonl          ← append-only deploy log
│   │   │   └── version-meta.json      ← per-version provenance
│   │   └── cn/
│   │       └── …
│   └── version-manifest.json          ← what's live per env/region
└── ota/                               ← future (tracked in cdn.yaml stubs)
```

Asset paths in HTML/JS are rewritten to `/web/<env>/<region>/<version>/…` so a pinned URL is self-contained when the CDN maps to the bucket root. `deploy:web` also sets **`WEB_BASE_URL`** so Expo Router’s `experiments.baseUrl` matches that prefix (client routes stay under the version folder).

### Open “latest” without typing the version

`latest/manifest.json` only stores the pointer. Deploy also uploads **`latest/index.html`**, a tiny page that fetches that manifest and redirects to the current version folder:

| URL | Redirects to |
| --- | --- |
| `…/web/prod/global/latest/` | `…/web/prod/global/<semver>/` |
| `…/web/prod/global/latest/embed` | `…/web/prod/global/<semver>/embed` |

CloudFront must rewrite those `latest` paths to `latest/index.html` (see SPA function below). After changing the function source, re-run `./deployment/web/scripts/apply-web-spa-cloudfront-function.sh`.

### SPA routing on CloudFront (required)

S3/CloudFront has no `_redirects`-style rewrite file, and CloudFront’s **Default Root Object** only covers `/`, not `/web/prod/global/6.1.0/`. Response headers such as `Permissions-Policy` for the embed (Bluetooth, camera, clipboard) likewise need a CloudFront **response headers policy**; nothing under `public/` can set them.

Without a **viewer-request CloudFront Function**, these fail even when objects exist in S3:

| Request | Expected |
| --- | --- |
| `…/web/prod/global/6.1.0/` | Serve that version’s `index.html` |
| `…/web/prod/global/6.1.0/login` (or any SPA deep link) | Same `index.html` (client router) |
| `…/web/prod/global/6.1.0/expo/…/*.js` | Pass through (real file) |
| `…/web/prod/global/latest/` or `…/latest/embed` | Serve `latest/index.html` (bounce) |
| `…/web/prod/global/latest/manifest.json` | Pass through (pointer JSON) |

One-time (or after function source changes):

```bash
export AWS_REGION=us-east-1
export CLOUDFRONT_DISTRIBUTION_ID=…   # same as deploy:web
./deployment/web/scripts/apply-web-spa-cloudfront-function.sh
```

Function source: `deployment/web/cloudfront/web-spa-router.js` (rewrites versioned SPA routes and `latest`/`latest/embed` bounce URLs to the matching `index.html`).


### Local tracking (`deployment/web/cdn.yaml`)

Copy the committed example once:

```bash
cp deployment/web/cdn.yaml.example deployment/web/cdn.yaml
```

`deploy:web` creates the file from the example if missing, then updates **`web.latest`** after a successful publish. **`android`** / **`ios`** blocks are stubs for future OTA tracking (fingerprint, runtime version, S3 prefix).

| Field | Purpose |
| --- | --- |
| `web.environment` / `web.region` | Next deploy target (`prod` + `global` \| `cn`) |
| `web.latest.*` | Last published version, prefix, git sha, site URL |
| `android.*` / `ios.*` | Reserved for `ota/…` publish tracking |

The file is **gitignored**; only `cdn.yaml.example` is committed.

---

## Prerequisites

| Tool | Notes |
| --- | --- |
| Node.js 22+ | Same as mobile CI |
| AWS CLI v2 | `aws sts get-caller-identity` must work |
| `.env.web` | Copy `.env.web.example` and fill it in locally, or supply `FS_ENV_WEB_FILE` (base64) in CI |
| `deployment/web/cdn.yaml` | Optional; auto-created from example |

### CI / env variables

| Variable | Description |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | IAM or STS access key |
| `AWS_SECRET_ACCESS_KEY` | Matching secret |
| `AWS_SESSION_TOKEN` | Required for temporary / SSO credentials |
| `AWS_REGION` | e.g. `us-east-1` |
| `APP_ASSETS_S3_BUCKET` | Shared assets bucket (hosts `web/` + `ota/`) |
| `CLOUDFRONT_DISTRIBUTION_ID` | Distribution in front of that bucket |
| `APP_ASSETS_URL` | Optional — CDN base URL printed after deploy |
| `FS_ENV_WEB_FILE` | Base64-encoded `.env.web` (CI only) |

Optional overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_DEPLOY_VERSION` | `package.json` `"version"` | Immutable folder under `web/<env>/<region>/` |
| `WEB_DEPLOY_ENV` | `cdn.yaml` → `prod` | Environment segment (`prod`) |
| `WEB_DEPLOY_REGION` | `cdn.yaml` → `global` | CDN folder segment (`global` \| `cn`) — **not** the RainMaker cloud region |
| `WEB_INVALIDATION_PATHS` | version + latest + manifests | CloudFront invalidation paths |
| `SKIP_WEB_BUILD` | unset | Set to `1` to reuse existing `dist/` (skip `npm ci` + `build:web`) |

> **`WEB_DEPLOY_REGION` vs `APP_REGION`.** `WEB_DEPLOY_REGION` only picks the S3 folder the export lands in (`web/<env>/<region>/…`). The RainMaker cloud the app talks to is controlled by `APP_REGION` in the bundle's `.env.web` and resolved at runtime by `getActiveRegion()` in `config/region.config.ts`. Publishing to `WEB_DEPLOY_REGION=cn` does **not** by itself point the app at the CN cloud.

Generate `FS_ENV_WEB_FILE` (and list the plain-text AWS vars):

```bash
./scripts/print-ci-secrets-base64.sh
```

---

## Local deploy

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...    # if using STS / SSO
export AWS_REGION=us-east-1
export APP_ASSETS_S3_BUCKET=rmng-app-assets-<account>-<region>-an
export CLOUDFRONT_DISTRIBUTION_ID=...
export APP_ASSETS_URL=https://…   # optional

# Optional: China region path
# export WEB_DEPLOY_REGION=cn

# Ensure .env.web exists at repo root
npm run deploy:web
```

What the script does:

1. Validates AWS credentials and required bucket / distribution vars  
2. Writes `.env.web` from `FS_ENV_WEB_FILE` when set (CI)  
3. Resolves env/region from `deployment/web/cdn.yaml` (overridable via `WEB_DEPLOY_*`)  
4. `npm ci` → `npm run build:web` with `WEB_BASE_URL=/web/<env>/<region>/<version>` (Expo Router base), unless `SKIP_WEB_BUILD=1`  
5. Rewrites `dist/_expo/` → `dist/expo/` (needed because `aws s3 sync` skips `_` roots)  
6. Syncs to `s3://…/web/<env>/<region>/<version>/` (`--delete` scoped to that prefix only)  
7. Updates `latest/manifest.json` (version + commit sha/branch; no author or deployer names on the CDN), appends `history.jsonl`, writes `version-meta.json` + `web/version-manifest.json`, uploads `latest/index.html` bounce page  
8. Records `web.latest` in `deployment/web/cdn.yaml`  
9. Invalidates CloudFront for the version prefix, `latest/`, and manifests  

Git fields in `latest/manifest.json` (and related pointers):

| Field | Source |
| --- | --- |
| `git_sha` | `CI_COMMIT_SHA` / `GITHUB_SHA`, else `git rev-parse HEAD` |
| `git_branch` | CI branch vars, else current local branch |
| `git_author` | `git log -1` author of HEAD |
| `deployed_by` | GitLab/GitHub actor, else local `git config user.name` / `$USER` |
| `dist_sha` | SHA-256 of the **versioned dist tree** actually uploaded (sorted paths + file bytes) |

`dist_sha` changes whenever the published bundle changes (including dirty local edits that affect the build). `git_sha` alone does not.  

**One-time CDN setup:** attach the SPA router Function so `/web/…/<version>/` and deep links resolve to that version’s `index.html` — see [SPA routing on CloudFront](#spa-routing-on-cloudfront-required).

Build only (no upload):

```bash
npm run build:web
```

Upload an existing `dist/` (skip install + build — must already match the target `WEB_BASE_URL` / version):

```bash
SKIP_WEB_BUILD=1 npm run deploy:web
```

---

## CI/CD (GitLab)

- Pipelines on **`release/*`** include a **manual** `web_deploy` job (after `code_quality`).
- MR and `main` pipelines do **not** publish web.

Flow:

1. Push / update a `release/*` branch  
2. Wait for `code_quality`  
3. Play **`web_deploy`** in the GitLab UI  

The runner needs **AWS CLI v2**. Set `WEB_DEPLOY_REGION=cn` in the job/variables when publishing the China tree.

---

## Verify

```bash
REGION="${WEB_DEPLOY_REGION:-global}"
VER="${WEB_DEPLOY_VERSION:-6.1.0}"

aws s3 ls "s3://${APP_ASSETS_S3_BUCKET}/web/prod/${REGION}/"
aws s3 ls "s3://${APP_ASSETS_S3_BUCKET}/web/prod/${REGION}/${VER}/"
aws s3 cp "s3://${APP_ASSETS_S3_BUCKET}/web/prod/${REGION}/latest/manifest.json" -
aws s3 cp "s3://${APP_ASSETS_S3_BUCKET}/web/version-manifest.json" -

# If APP_ASSETS_URL is set:
curl -I "${APP_ASSETS_URL%/}/web/prod/${REGION}/${VER}/"
curl -I "${APP_ASSETS_URL%/}/web/prod/${REGION}/latest/"
curl -s "${APP_ASSETS_URL%/}/web/prod/${REGION}/latest/manifest.json"
```

---

## Troubleshooting

### `Missing .env.web` or `FS_ENV_WEB_FILE`

Copy `.env.web.example` to `.env.web` and fill it in, or set the base64 CI variable via `./scripts/print-ci-secrets-base64.sh`.

### `Access Denied` on `aws s3 sync`

IAM needs `s3:ListBucket`, `s3:PutObject`, `s3:DeleteObject` on the assets bucket (at least under `web/`), plus `cloudfront:CreateInvalidation` on the distribution. For SSO, export `AWS_SESSION_TOKEN`.

### Deep link or trailing slash 404 under `/web/prod/…/<version>/`

S3 upload succeeded but CloudFront is not rewriting SPA routes to that version’s `index.html`. Run `./deployment/web/scripts/apply-web-spa-cloudfront-function.sh` once on the APP_ASSETS distribution, wait for deploy, then hard-refresh. Real asset URLs (`.js` / `.css` / images) must still return 200 without rewrite.

### `/latest/` or `/latest/embed` 404 / no redirect

Confirm `latest/index.html` exists after `deploy:web`, then re-apply the SPA function so `/latest` and `/latest/embed` rewrite to that HTML. `latest/manifest.json` must still return JSON (not HTML).

### CloudFront shows old content

Invalidations take a few minutes. Default paths include `/web/prod/<region>/<version>/*` and `/web/prod/<region>/latest/*`. Hard-refresh after the invalidation completes.

### `/expo/…` missing after upload

Deploy must run `rewrite-expo-web-export.sh` before sync. Re-run `npm run deploy:web` and confirm keys under `web/prod/<region>/<version>/expo/`.

### Service worker: scope not under max allowed

FCM registers `firebase-messaging-sw.js` from the version folder. Browsers only allow a scope under that script’s directory (e.g. `/web/prod/global/6.1.1/`), not `/`, unless CloudFront sends `Service-Worker-Allowed`. The web notification client derives scope from the script path — redeploy after that fix. Confirm the SW object exists at `…/<version>/firebase-messaging-sw.js`.

---

## File reference

| Path | Role |
| --- | --- |
| `deployment/web/scripts/deploy-web.sh` | Build + publish version + pointers + invalidate |
| `deployment/web/scripts/lib/web-deploy-common.sh` | Shared helpers (creds, sync, pointers, invalidate) |
| `deployment/web/scripts/lib/cdn-config.mjs` | `deployment/web/cdn.yaml` + pointer artifact helper |
| `deployment/web/cdn.yaml.example` | Committed CDN tracking schema (web / android / ios) |
| `deployment/web/scripts/rewrite-expo-web-export.sh` | `dist/_expo/` → `dist/expo/` for S3 sync |
| `deployment/web/cloudfront/web-spa-router.js` | CloudFront Function: versioned SPA + `latest` bounce → `index.html` |
| `deployment/web/cdn/latest-redirect.html` | Uploaded as `latest/index.html`; fetch manifest → redirect |
| `deployment/web/scripts/apply-web-spa-cloudfront-function.sh` | Publish + attach the SPA Function to the distribution |
| `scripts/print-ci-secrets-base64.sh` | Print CI secrets including web vars |
| `deployment/web/scripts/sync-firebase-messaging-sw.js` | Bake Firebase config before build |
| `.gitlab-ci.yml` | Manual `web_deploy` on `release/*` |
| `package.json` | `build:web`, `deploy:web` |

```bash
npm run build:web                 # Build only → dist/
npm run deploy:web                # Build + upload + pointers + invalidate
SKIP_WEB_BUILD=1 npm run deploy:web   # Upload existing dist/ only
```

For app configuration (env files, features, Firebase keys), see **[Configuration & Customization Guide](../../docs/CONFIGURATION.md)**.
