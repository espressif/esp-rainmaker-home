# Changelog

All notable changes to `@modules/kvs` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0]

### Added

- **Client**
  - `createKvsClient` / `KvsClient` with `archived` and `signaling` services
  - `KvsClient.updateCredentials` (and service-level equivalents) for STS refresh

- **Archived media** (`KvsArchivedMediaService`)
  - `listFragments`, `getThumbnails`, and `getHlsUrl`
  - `GetDataEndpoint` cache (24 h TTL)
  - Safety caps for `listFragments` (max pages / max fragments)
  - `getThumbnails` pagination via `NextToken`
  - Time-range validation (`startMs < endMs`)

- **Signaling** (`KvsSignalingService`)
  - `discoverChannel`, `getIceServers`, `createViewerClient`, and `clearCache`
  - Instance-scoped channel + ICE cache (TTL + in-flight dedupe)

- **Viewer WebSocket** (`KvsSignalingClient`)
  - SigV4-signed WSS with typed `on` / `off` via `SignalingEventMap`
  - `sendSdpOffer` and `sendIceCandidate`
  - `SIGNALING_EVENTS`: `open`, `close`, `error`, `sdpAnswer`, `iceCandidate`
  - `open()` awaits socket connect (rejects on timeout / error)
  - Redacted WebSocket logging (no SigV4 query / raw SDP bodies)
