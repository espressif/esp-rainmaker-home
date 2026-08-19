/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { EspLocalDiscoveryAdapter } from "@native-adaptors/implementations/ESPDiscoveryAdapter";
import type { ESPCDFOnNetworkDevice } from "@store";
import { getResolvedActiveSdk, isRmneoStackSdkId } from "@config/sdk.config";
import { buildOnNetworkProvisioningDevice } from "@features/provision/utils/onNetworkProvisioningDevice";
import { probeOnNetworkSecurity } from "@features/provision/utils/onNetworkVersionProbe";
import {
  DISCOVERY_LOST_EVENT,
  DISCOVERY_UPDATE_EVENT,
  MDNS_DOMAIN_LOCAL,
  MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
  MDNS_SERVICE_TYPE_ESP_RMAKER_CHAL_RESP,
  MDNS_SERVICE_TYPE_ESP_RMAKER_LOCAL_CTRL,
  MDNS_TXT_CAP_CH_RESP,
  MDNS_TXT_KEY_CAP,
  MDNS_TXT_KEY_CH_RESP,
  MDNS_TXT_KEY_NODE_ID,
  MDNS_TXT_KEY_POP_REQUIRED,
  MDNS_TXT_KEY_SEC_VERSION,
  ON_NETWORK_DEFAULT_CH_RESP_ENDPOINT,
  ON_NETWORK_DEFAULT_SEC_VERSION,
  ON_NETWORK_DISCOVERY_DURATION_MS,
} from "@shared/utils/constants";

/**
 * Which mDNS service carries on-network provisionable devices for the active
 * stack, and how their security details are obtained.
 *
 * - **RainMaker classic** (`rainmaker-base-sdk` / `rainmaker-matter-sdk`) keeps
 *   the dedicated `_esp_rmaker_chal_resp._tcp` service, whose TXT records carry
 *   `sec_version` / `pop_required` / `ch_resp` directly.
 * - **RainMaker Neo** uses the shared `_esp_rmaker_ctrl._tcp` instance.
 *   Its TXT records carry only `node_id` and `cap`, so each hit is filtered on
 *   `cap` containing `ch_resp` and then probed on
 *   `rmaker_local_ctrl/version` for `sec_ver` / `no_pop`.
 */
interface OnNetworkDiscoveryProfile {
  serviceType: string;
  /** Whether hits need the version-endpoint probe (RMNeo shared instance). */
  probeVersionEndpoint: boolean;
  /** Local-control service to restore on unmount, so the SDK's browse resumes. */
  localControlServiceType: string;
}

/**
 * Resolves the discovery profile for the active SDK stack.
 *
 * Read once per scan rather than memoized in state: the active stack only
 * changes via Config Scan, which restarts the flow well before this screen.
 */
function resolveDiscoveryProfile(): OnNetworkDiscoveryProfile {
  return isRmneoStackSdkId(getResolvedActiveSdk())
    ? {
        serviceType: MDNS_SERVICE_TYPE_ESP_RMAKER_LOCAL_CTRL,
        probeVersionEndpoint: true,
        localControlServiceType: MDNS_SERVICE_TYPE_ESP_RMAKER_LOCAL_CTRL,
      }
    : {
        serviceType: MDNS_SERVICE_TYPE_ESP_RMAKER_CHAL_RESP,
        probeVersionEndpoint: false,
        localControlServiceType: MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
      };
}

interface UseOnNetworkDiscoveryReturn {
  /** True while a scan window is in progress. */
  isScanning: boolean;
  /** Devices found on the LAN that announce the chal-resp mDNS service. */
  devices: ESPCDFOnNetworkDevice[];
  /** Trigger another scan cycle (e.g. user tapped "Scan again"). */
  rescan: () => void;
  /** Selected handler — routes to POP or directly to Provision. */
  selectDevice: (device: ESPCDFOnNetworkDevice) => void;
}

/** Truthy for `"1" | "true" | "yes"` regardless of case; false otherwise. */
function parseBooleanFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Parse `sec_version` TXT value safely; defaults to `0` when missing/invalid. */
function parseSecVersion(raw: string | undefined): number {
  if (!raw) return ON_NETWORK_DEFAULT_SEC_VERSION;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : ON_NETWORK_DEFAULT_SEC_VERSION;
}

/** Splits a comma-separated mDNS `cap` TXT value into tokens. */
function parseCapabilities(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((capability) => capability.trim())
    .filter(Boolean);
}

/**
 * Build an `ESPCDFOnNetworkDevice` from the native discovery payload.
 *
 * Every event we receive here is for the profile's service type, so the
 * service-type filter has already happened at the Bonjour/NSD level. We only
 * need a usable host/port and a node id to act on it.
 *
 * On the legacy chal-resp service the TXT records also carry the security
 * details (POP requirement, security version, custom endpoint). On the RMNeo
 * shared instance they don't — the returned record carries placeholder security
 * values that {@link resolveNeoSecurity} must overwrite from the version
 * endpoint before the device is shown.
 */
function buildOnNetworkDevice(
  raw: Record<string, unknown>
): ESPCDFOnNetworkDevice | null {
  const host = typeof raw?.host === "string" ? raw.host : undefined;
  const port =
    typeof raw?.port === "number"
      ? raw.port
      : typeof raw?.port === "string"
        ? Number.parseInt(raw.port, 10)
        : undefined;
  if (!host || !port || Number.isNaN(port)) return null;

  const txt: Record<string, string> =
    (raw?.txt as Record<string, string>) || {};
  // Native modules already lowercase Android keys; iOS preserves case. Normalize.
  const normalizedTxt: Record<string, string> = {};
  for (const [k, v] of Object.entries(txt)) {
    normalizedTxt[k.toLowerCase()] = String(v);
  }

  const chRespEndpoint =
    normalizedTxt[MDNS_TXT_KEY_CH_RESP] || ON_NETWORK_DEFAULT_CH_RESP_ENDPOINT;

  const nodeId =
    normalizedTxt[MDNS_TXT_KEY_NODE_ID] ||
    (typeof raw?.nodeId === "string" ? raw.nodeId : "");
  if (!nodeId) return null;

  // Native modules emit the raw mDNS service instance name separately from
  // `nodeId`. If the older bridge build is running and only emits `nodeId`,
  // fall back to it so the UI still has something to show.
  const serviceName =
    (typeof raw?.serviceName === "string" && raw.serviceName.length > 0
      ? raw.serviceName
      : undefined) ??
    (typeof raw?.nodeId === "string" ? raw.nodeId : nodeId);

  return {
    nodeId,
    serviceName,
    host,
    port,
    secVersion: parseSecVersion(normalizedTxt[MDNS_TXT_KEY_SEC_VERSION]),
    popRequired: parseBooleanFlag(normalizedTxt[MDNS_TXT_KEY_POP_REQUIRED]),
    chRespEndpoint,
  };
}

/**
 * Whether a RMNeo hit is available for on-network association.
 *
 * The shared instance is advertised whenever *either* endpoint set is up, so a
 * control-only node (`cap=local_ctrl`) also appears on this browse and must be
 * skipped here. A hit with no `cap` record at all is treated as eligible, so
 * firmware that omits it still shows up.
 */
function isChalRespCapable(raw: Record<string, unknown>): boolean {
  const txt = (raw?.txt as Record<string, string>) || {};
  const capRaw = Object.entries(txt).find(
    ([key]) => key.toLowerCase() === MDNS_TXT_KEY_CAP,
  )?.[1];
  const capabilities = parseCapabilities(
    capRaw === undefined ? undefined : String(capRaw),
  );
  if (capabilities.length === 0) return true;
  return capabilities.includes(MDNS_TXT_CAP_CH_RESP);
}

/**
 * Fills in a RMNeo device's security details from its version endpoint.
 * @returns The device with real `secVersion` / `popRequired`, or `null` when the
 *   probe failed. Listing a device with a guessed scheme is worse than hiding
 *   it: the wrong security type fails the handshake, and a wrong PoP prompt
 *   misleads the user.
 */
async function resolveNeoSecurity(
  device: ESPCDFOnNetworkDevice,
): Promise<ESPCDFOnNetworkDevice | null> {
  const security = await probeOnNetworkSecurity(device.host, device.port);
  if (!security) return null;
  return {
    ...device,
    secVersion: security.secVersion,
    popRequired: security.popRequired,
  };
}

/**
 * Hook that drives the OnNetworkDiscovery screen.
 *
 * Browses the mDNS service used by unprovisioned firmware that's already on
 * Wi-Fi, builds a de-duplicated device list, and routes the chosen device into
 * either POP (when the device requires one) or directly into the on-network
 * provision flow. Which service is browsed — and where the security details
 * come from — depends on the active stack; see
 * {@link OnNetworkDiscoveryProfile}.
 *
 * Lifecycle contract: a single scan window runs on mount. The native browser
 * is stopped once the window expires; the user re-scans on demand. Discovery
 * is never auto-restarted by re-renders — `t`/`toast`/`router`/`store`
 * references that may flicker between renders are read through refs so the
 * mount effect runs exactly once. On real navigation away the hook restores the
 * active stack's local-control browse so post-login local control resumes.
 */
export const useOnNetworkDiscovery = (): UseOnNetworkDiscoveryReturn => {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const { store } = useCDF();
  const [devices, setDevices] = useState<ESPCDFOnNetworkDevice[]>([]);
  const [isScanning, setIsScanning] = useState(true);

  // Refs — referenced by stable callbacks so they never appear in deps.
  const tRef = useRef(t);
  const toastRef = useRef(toast);
  const routerRef = useRef(router);
  const storeRef = useRef(store);
  /** Cleanup of the most recent in-flight scan (event subs + adapter cb). */
  const scanCleanupRef = useRef<null | (() => void)>(null);
  /** Auto-stop timer that ends the current scan window. */
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tracks live mount state — used to suppress local-ctrl restore on remount. */
  const isMountedRef = useRef(false);
  /** Deferred local-ctrl restore on real unmount (cancelled on re-mount). */
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirrors `isScanning` for use in stable callbacks (no closure capture). */
  const isScanningRef = useRef(true);
  /** Profile of the most recent scan, read by the unmount restore. */
  const profileRef = useRef<OnNetworkDiscoveryProfile>(
    resolveDiscoveryProfile(),
  );

  // Keep refs current across renders without causing effects to re-run.
  useEffect(() => {
    tRef.current = t;
    toastRef.current = toast;
    routerRef.current = router;
    storeRef.current = store;
  }, [t, toast, router, store]);

  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

  /**
   * Run one scan window: tear down any previous scan, attach fresh listeners,
   * start the native browser, and arm the auto-stop timer.
   *
   * Stable identity (no deps) so the mount-effect below doesn't re-run on
   * every re-render and accidentally restart discovery in a loop.
   */
  const startScan = useCallback(async () => {
    // Defensive: if a previous scan's listeners are still live, drop them
    // before adding new ones — otherwise each `DiscoveryUpdate` would fire
    // through both the old and the new subscription.
    scanCleanupRef.current?.();
    scanCleanupRef.current = null;
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    setIsScanning(true);
    setDevices([]);

    const profile = resolveDiscoveryProfile();
    profileRef.current = profile;

    // Multi-browse: native may emit events for other concurrent browses
    // (`_matter._tcp.`, the SDK's local-control browse). Filter to ours only.
    const isOurService = (payload: { serviceType?: unknown }) => {
      const s = typeof payload?.serviceType === "string" ? payload.serviceType : "";
      if (!s) return true; // older native build without discriminator → trust
      return s.replace(/\.$/, "") === profile.serviceType.replace(/\.$/, "");
    };

    /** Adds or replaces a device, keyed by node id. */
    const upsertDevice = (next: ESPCDFOnNetworkDevice) => {
      setDevices((prev) => {
        const existingIdx = prev.findIndex((d) => d.nodeId === next.nodeId);
        if (existingIdx === -1) return [...prev, next];
        const copy = [...prev];
        copy[existingIdx] = next;
        return copy;
      });
    };

    /**
     * Node ids whose version probe is in flight or done, so a repeated mDNS
     * announcement for the same node doesn't re-probe it.
     */
    const probedNodeIds = new Set<string>();
    /** Guards against a probe resolving after this scan window was torn down. */
    let scanAborted = false;

    const updateSub = DeviceEventEmitter.addListener(
      DISCOVERY_UPDATE_EVENT,
      (payload: Record<string, unknown>) => {
        if (!isOurService(payload)) return;
        const next = buildOnNetworkDevice(payload);
        if (!next) return;

        if (!profile.probeVersionEndpoint) {
          upsertDevice(next);
          return;
        }

        // RMNeo shared instance: skip control-only nodes, then resolve security
        // from the version endpoint before listing the device.
        if (!isChalRespCapable(payload)) return;
        if (probedNodeIds.has(next.nodeId)) return;
        probedNodeIds.add(next.nodeId);

        void resolveNeoSecurity(next).then((resolved) => {
          if (scanAborted) return;
          if (!resolved) {
            // Allow a later announcement to retry within this window.
            probedNodeIds.delete(next.nodeId);
            return;
          }
          upsertDevice(resolved);
        });
      }
    );

    const lostSub = DeviceEventEmitter.addListener(
      DISCOVERY_LOST_EVENT,
      (payload: { nodeId?: string; serviceType?: string }) => {
        if (!isOurService(payload)) return;
        const lostId = payload?.nodeId;
        if (!lostId) return;
        probedNodeIds.delete(lostId);
        setDevices((prev) => prev.filter((d) => d.nodeId !== lostId));
      }
    );

    let adapterCleanup: () => void = () => {};
    try {
      adapterCleanup = await EspLocalDiscoveryAdapter.startDiscovery(
        () => {
          /* swallowed: we use our own DeviceEventEmitter listener above */
        },
        {
          serviceType: profile.serviceType,
          domain: MDNS_DOMAIN_LOCAL,
        }
      );
    } catch (e) {
      console.error("[useOnNetworkDiscovery] startDiscovery failed", e);
      toastRef.current.showError(
        tRef.current("device.errors.failedToStartDiscovery")
      );
    }

    // After the scan window: flip the spinner off AND stop the native mDNS
    // browser. Without this stop, NSD/Bonjour keeps polling/announcing in
    // the background which spams logs, drains battery, and (since the native
    // module is single-browser) keeps blocking the SDK's local-control
    // discovery. The user can re-scan on demand via `rescan()`.
    scanTimerRef.current = setTimeout(() => {
      scanTimerRef.current = null;
      setIsScanning(false);
      void EspLocalDiscoveryAdapter.stopDiscovery().catch((e) =>
        console.error(
          "[useOnNetworkDiscovery] stopDiscovery after window failed",
          e
        )
      );
    }, ON_NETWORK_DISCOVERY_DURATION_MS);

    scanCleanupRef.current = () => {
      scanAborted = true;
      updateSub.remove();
      lostSub.remove();
      adapterCleanup();
    };
  }, []);

  /**
   * Public re-scan handler bound to the "scan again" affordance and to
   * pull-to-refresh on the device list. No-op while a scan is already in
   * flight to avoid hammering the bridge if the user taps repeatedly.
   *
   * Stable identity (uses `isScanningRef` instead of closing over state).
   */
  const rescan = useCallback(() => {
    if (isScanningRef.current) return;
    void startScan();
  }, [startScan]);

  // Mount-only effect: runs exactly once because `startScan` is stable.
  useEffect(() => {
    isMountedRef.current = true;
    if (restoreTimerRef.current) {
      clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
    void startScan();
    return () => {
      isMountedRef.current = false;
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      scanCleanupRef.current?.();
      scanCleanupRef.current = null;

      // Defer the local-control restart by a tick. If React immediately
      // re-mounts the hook (StrictMode dev double-invoke), the next mount
      // will clear this timer above and the restart never fires — preserving
      // the chal-resp browser the new mount just started. Only real
      // navigation away leaves the timer alone, and 250 ms later we restore
      // local-control so the SDK's existing post-login local discovery
      // listener sees events again.
      //
      // The restored service type must match what the active stack's SDK
      // browses (classic `_esp_local_ctrl._tcp.` vs RMNeo
      // `_esp_rmaker_ctrl._tcp.`). Restoring the wrong one starts a
      // browse whose events the SDK's service-type-filtered listener discards,
      // silently killing local control until the next app launch.
      const { localControlServiceType } = profileRef.current;
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = setTimeout(() => {
        restoreTimerRef.current = null;
        if (isMountedRef.current) return;
        void EspLocalDiscoveryAdapter.stopDiscovery()
          .then(() =>
            EspLocalDiscoveryAdapter.startDiscovery(() => {}, {
              serviceType: localControlServiceType,
              domain: MDNS_DOMAIN_LOCAL,
            })
          )
          .catch((e) =>
            console.error(
              "[useOnNetworkDiscovery] Failed to restore local-control discovery",
              e
            )
          );
      }, 250);
    };
  }, [startScan]);

  /**
   * Stash the selected device on `nodeStore.connectedDevice` (same slot
   * BLE / SoftAP flows use) so downstream screens dispatch off the device
   * model via `device.checkOnNetworkProvisioning()` instead of route params.
   * The raw mDNS payload is also kept on `nodeStore.onNetworkDeviceInfo` so
   * the SDK adaptor (`addOnNetworkDeviceProvision`) can read host/port/TXT
   * fields directly when running the LAN HTTP flow.
   *
   * Stable identity (reads router/store via refs).
   */
  const selectDevice = useCallback((device: ESPCDFOnNetworkDevice) => {
    const provisioningDevice = buildOnNetworkProvisioningDevice(device);
    storeRef.current.nodeStore.connectedDevice = provisioningDevice;
    storeRef.current.nodeStore.onNetworkDeviceInfo = device;
    if (device.popRequired) {
      routerRef.current.push("/(provision)/POP");
    } else {
      routerRef.current.push("/(provision)/Provision");
    }
  }, []);

  return { isScanning, devices, rescan, selectDevice };
};
