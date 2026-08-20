# `@modules/kvs`

AWS Kinesis Video Streams client suite for archived media (fragments, thumbnails, HLS) and WebRTC viewer signaling.

This is a **private Metro-local package**. Host apps own credential acquisition and React Native polyfills; this module only consumes what you pass in.

## Layout

Each capability is a self-contained folder under `src/services/`:

```text
src/
├── index.ts                 # package public API
├── client.ts                # KvsClient / createKvsClient
├── types.ts                 # shared: AwsCredentials, KvsClientConfig
├── logger.ts                # __DEV__-gated logger + URL redaction
└── services/
    ├── archived/            # fragments, thumbnails, HLS
    └── signaling/           # channel discovery, ICE, viewer WebSocket
```

Import only from `@modules/kvs`. Do not deep-import service internals. Add new capabilities as `services/<name>/` with their own `index.ts`, `types.ts`, and `constants.ts`.

## Import

```ts
import {
  createKvsClient,
  SIGNALING_EVENTS,
  type AwsCredentials,
  type KvsClientConfig,
} from "@modules/kvs";
```

## Dependencies

AWS SDK clients are **module dependencies** (installed with `@modules/kvs`):

| Package | Role |
| --- | --- |
| `@aws-sdk/client-kinesis-video` | Channel discovery (`DescribeSignalingChannel`, endpoints) |
| `@aws-sdk/client-kinesis-video-archived-media` | Fragments, images, HLS |
| `@aws-sdk/client-kinesis-video-signaling` | ICE server config |

All three are pinned to the same caret range (`^3.1111.0`).

## Peer dependencies

Install and link these in the **host app** (native / polyfill packages):

| Package | Role |
| --- | --- |
| `react-native-get-random-values` (`^1.11.0`) | CSPRNG for SigV4 / UUIDs |
| `react-native-webrtc` (`^124.0.0`) | `RTCSessionDescription` / `RTCIceCandidate` in signaling |

## Host-app requirements

### 1. Credentials

Pass **region + temporary AWS credentials** into `createKvsClient`. The module does **not** fetch or store credentials.

```ts
interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Required for assume-role / SigV4-signed signaling WebSockets. */
  sessionToken?: string;
}

interface KvsClientConfig {
  region: string;
  credentials: AwsCredentials;
}
```

- **Archived media** uses the credentials for SigV4 AWS SDK calls.
- **Signaling WebSocket** signing **requires** a non-empty `sessionToken` (assume-role style tokens).

When STS tokens refresh, prefer `kvs.updateCredentials(freshCreds)` on the same client (clears cached ICE servers). Create a **new** client if the region changes.

### 2. Polyfills (before signaling)

Initialize **before** opening a signaling client / calling SigV4:

1. **`react-native-get-random-values`** — imported early (e.g. app bootstrap). The signaling client also imports it for safety.
2. **Node-style `crypto` on `globalThis`** — `createHash("sha256")` and `createHmac("sha256", …)` with `update` / `digest`. Without this, URL signing throws:
   > `crypto.createHmac is not available…`
3. **`atob` / `btoa`** — used to decode/encode SDP and ICE payloads.
4. **AWS SDK on React Native** — if the host uses the fetch HTTP handler, ensure `Blob.prototype.arrayBuffer` exists (RN often needs a polyfill); otherwise archived-media responses can fail even on HTTP 200.

### 3. Metro + AWS SDK (React Native)

AWS SDK v3 client packages often resolve to a Node `dist-cjs` entry under Metro. The host app must remap `@aws-sdk/client-*` to their `dist-es` builds (see this repo’s root `metro.config.js`) so RN gets `runtimeConfig.native` / FetchHttpHandler. Without that, release bundles can pull `node:https` / `node:http2`.

### 4. WebRTC

Provide `react-native-webrtc` so signaling can construct `RTCSessionDescription` and `RTCIceCandidate`. Peer connection lifecycle stays in the host.

---

## Public API

### Factory / client

| Export | Description |
| --- | --- |
| `createKvsClient(config)` | Returns a credentials-bound `KvsClient` |
| `KvsClient` | Root client with `archived` and `signaling` services |
| `KvsClient.updateCredentials(creds)` | Refresh STS tokens on both services |

```ts
const kvs = createKvsClient({ region, credentials });

await kvs.archived.listFragments({ streamName, startMs, endMs });
await kvs.signaling.discoverChannel(channelName);

// later, after assume-role refresh:
kvs.updateCredentials(freshCredentials);
```

### Archived media — `KvsArchivedMediaService`

Accessed as `kvs.archived` (also exported as a class).

| Method | Returns |
| --- | --- |
| `listFragments(options)` | `KvsFragment[]` (oldest-first by producer timestamp) |
| `getThumbnails(options)` | `KvsThumbnail[]` (`base64Jpeg`, no data-URI prefix) |
| `getHlsUrl(options)` | On-demand HLS session URL `string` |

Options share a producer-timestamp range (`startMs` / `endMs`, must satisfy `startMs < endMs`) plus `streamName`.

**Safety / caching:**

- `GetDataEndpoint` results are cached ~24 h per `(region, stream, api)`.
- `listFragments` stops after a max page count / total fragment cap (see module constants); narrow the time range for very large archives.
- `getThumbnails` paginates with `NextToken` until `maxResults` is reached.

### Signaling — `KvsSignalingService`

Accessed as `kvs.signaling`.

| Method | Description |
| --- | --- |
| `discoverChannel(channelName)` | ARN + WSS/HTTPS endpoints (cached ~24 h, per client) |
| `getIceServers(channelName, channelARN, httpsEndpoint)` | TURN/STUN list (cached; TTL from AWS when present) |
| `createViewerClient({ channelARN, channelEndpoint, clientId })` | Builds a `KvsSignalingClient` (call `open()` next) |
| `clearCache(channelName)` | Drops channel + ICE cache for that name |
| `updateCredentials(creds)` | Refresh credentials; clears ICE cache |

Channel/ICE caching is **internal** to the service (instance-scoped). It is not part of the package public API.

### Viewer WebSocket — `KvsSignalingClient`

| Member | Description |
| --- | --- |
| `open()` | SigV4-sign WSS URL and **await** connection (rejects on timeout/error) |
| `close()` | Close the socket |
| `on` / `off` | Typed subscribe to signaling events |
| `sendSdpOffer(offer)` | Send local SDP offer |
| `sendIceCandidate(candidate)` | Send local ICE candidate |

Events (`SIGNALING_EVENTS`):

| Key | Value | Payload |
| --- | --- | --- |
| `OPEN` | `"open"` | — |
| `CLOSE` | `"close"` | — |
| `ERROR` | `"error"` | `Error` |
| `SDP_ANSWER` | `"sdpAnswer"` | `RTCSessionDescription` |
| `ICE_CANDIDATE` | `"iceCandidate"` | `RTCIceCandidate` |

Logging never prints the signed WSS query string or raw SDP/ICE message bodies (host + path / message type only).

### Types

`AwsCredentials`, `KvsClientConfig`, `KvsTimeRange`, `ListFragmentsOptions`, `GetThumbnailsOptions`, `GetHlsUrlOptions`, `KvsFragment`, `KvsThumbnail`, `SignalingEventType`, `SignalingEventHandler`, `SignalingEventMap`, `SignalingClientConfig`, `CreateViewerClientOptions`, `CachedChannelInfo`, `IceServer`, `IceServersFetchResult`, `SignalingMessage`, `MessageHandler`.

---

## Minimal examples

### Archived clips

```ts
const kvs = createKvsClient({ region, credentials });

const fragments = await kvs.archived.listFragments({
  streamName: "my-stream",
  startMs,
  endMs,
});

const hlsUrl = await kvs.archived.getHlsUrl({
  streamName: "my-stream",
  startMs,
  endMs,
});
```

### Live viewer signaling

```ts
const kvs = createKvsClient({ region, credentials });

const { channelARN, wssEndpoint, httpsEndpoint } =
  await kvs.signaling.discoverChannel(channelName);

const iceServers = await kvs.signaling.getIceServers(
  channelName,
  channelARN,
  httpsEndpoint,
);

const client = kvs.signaling.createViewerClient({
  channelARN,
  channelEndpoint: wssEndpoint,
  clientId, // host-generated UUID
});

client.on(SIGNALING_EVENTS.SDP_ANSWER, (answer) => {
  /* setRemoteDescription(answer) */
});
client.on(SIGNALING_EVENTS.ICE_CANDIDATE, (candidate) => {
  /* addIceCandidate(candidate) */
});

await client.open(); // waits until WebSocket is open
// … create peer connection with iceServers, then:
// client.sendSdpOffer(localOffer);
```

---

## Ownership boundary

| Host owns | This module owns |
| --- | --- |
| Obtaining / refreshing AWS credentials | SigV4 AWS API calls with supplied credentials |
| RN crypto / URL / Blob / base64 polyfills | Archived-media and signaling service logic |
| Metro AWS `dist-es` remapping for RN | Viewer WebSocket + SDP/ICE message encode/decode |
| `RTCPeerConnection` and UI | Per-client channel + ICE in-memory cache |
