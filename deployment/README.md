# Deployment

Umbrella folder for every publish workstream the RainMaker Home app owns. Each
workstream lives in its own subfolder with its own scripts, config, and
README. Cross-workstream conventions live here.

## Workstreams

| Path | Purpose |
| --- | --- |
| [`ota/`](./ota/README.md) | Over-The-Air JS bundle updates published to the shared APP_ASSETS S3 bucket + a dedicated CloudFront distribution, verified on-device by expo-updates. Fingerprint-partitioned S3 layout with signed manifests. |
| [`web/`](./web/README.md) | Expo web export published to the same APP_ASSETS bucket under `web/<env>/<region>/<version>/`, fronted by a CloudFront SPA-router Function. |

## Folder convention

Each workstream directory is expected to contain:

- `README.md` — the workstream's own operating docs (flow, prerequisites, CI trigger, verification, rotation, troubleshooting).
- `scripts/` — publish + supporting scripts. Called from `.gitlab-ci.yml` and available for local runs.
- Any workstream-specific config templates (e.g. `certs/`, `cdn.yaml.example`) — committed templates ship here; per-machine/per-CI state files are gitignored.

Nothing else in the repo should call the workstream scripts directly — CI
references them via their full `deployment/<name>/scripts/…` path, and any
in-app hot paths that intersect (e.g. expo-updates in `ios/APP/AppDelegate.mm`)
document their dependency in the workstream README.

## CI wiring

Both workstreams share a single GitLab `deploy` stage. Trigger rules per
workstream:

| Workstream | Trigger | Job(s) |
| --- | --- | --- |
| OTA | Auto on push to `release/*` (skipped when the native surface changed); never from MR pipelines | `ota_publish_global_ios`, `ota_publish_global_android` |
| Web | Manual on push to `release/*` after `code_quality` passes | `web_deploy` |

CI/CD variables shared across workstreams (bucket / distribution / creds) live at pipeline level. Per-workstream secrets (signing keys, region env files) are listed in each workstream's README.
