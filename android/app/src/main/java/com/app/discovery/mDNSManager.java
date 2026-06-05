/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.discovery;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.util.Log;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * `mDNSManager` is responsible for managing mDNS (Multicast DNS) discovery.
 *
 * <p>The manager is multi-browse: each registered service type owns an independent
 * {@link BrowseSession} with its own {@link NsdManager.DiscoveryListener},
 * {@link NsdManager.ResolveListener}, pending queue and resolved-services list.
 * This allows e.g. {@code _esp_local_ctrl._tcp.}, {@code _esp_rmaker_chal_resp._tcp.}
 * and {@code _matter._tcp.} to be browsed simultaneously without cross-talk —
 * a slow Matter resolve does not stall RainMaker local-control resolves.
 */
public class mDNSManager {

    private static final String TAG = mDNSManager.class.getSimpleName();

    private static volatile mDNSManager mdnsManager;

    private final Context context;
    private final mDNSEvenListener listener;
    private final NsdManager mNsdManager;

    /** Active browse sessions keyed by service type (e.g. {@code _matter._tcp.}). */
    private final Map<String, BrowseSession> sessionsByType = new ConcurrentHashMap<>();

    private static final String KEY_NODE_ID = "node_id";

    /**
     * Gets the singleton instance of `mDNSManager`.
     *
     * <p>The listener is captured on first call and shared across all browse
     * sessions; subsequent calls return the same instance and ignore the
     * listener argument (matches the previous singleton contract).
     *
     * @param context  Application context.
     * @param listener Callback listener for discovery events.
     * @return The singleton instance of `mDNSManager`.
     */
    public static mDNSManager getInstance(Context context, mDNSEvenListener listener) {
        if (mdnsManager == null) {
            synchronized (mDNSManager.class) {
                if (mdnsManager == null) {
                    mdnsManager = new mDNSManager(context, listener);
                }
            }
        }
        return mdnsManager;
    }

    private mDNSManager(Context context, mDNSEvenListener listener) {
        this.context = context;
        this.listener = listener;
        this.mNsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
    }

    /**
     * Idempotent: starts a browse session for {@code serviceType} if one is not
     * already running. Multiple service types can be browsed concurrently.
     *
     * @param serviceType The type of service to discover (e.g. {@code _matter._tcp.}).
     * @param domain      The domain in which to search (e.g. {@code local.}).
     */
    public void discoverServices(String serviceType, String domain) {
        if (serviceType == null) {
            Log.e(TAG, "discoverServices: null serviceType");
            return;
        }
        final String type = serviceType.trim();
        if (type.isEmpty()) {
            Log.e(TAG, "discoverServices: empty serviceType");
            return;
        }
        if (sessionsByType.containsKey(type)) {
            Log.d(TAG, "discoverServices: session already running for " + type);
            return;
        }
        BrowseSession session = new BrowseSession(type);
        sessionsByType.put(type, session);
        session.start();
    }

    /** Stops the browse session for a specific service type (no-op if not running). */
    public void stopDiscovery(String serviceType) {
        if (serviceType == null) {
            return;
        }
        BrowseSession session = sessionsByType.remove(serviceType.trim());
        if (session != null) {
            session.stop();
        }
    }

    /** Stops all active browse sessions. */
    public void stopAllDiscovery() {
        for (Iterator<Map.Entry<String, BrowseSession>> it = sessionsByType.entrySet().iterator();
                it.hasNext(); ) {
            Map.Entry<String, BrowseSession> entry = it.next();
            it.remove();
            entry.getValue().stop();
        }
    }

    /** Per-service-type browse + resolve state. Keeps slow resolves from blocking other types. */
    private final class BrowseSession {
        final String serviceType;
        NsdManager.DiscoveryListener discoveryListener;
        final NsdManager.ResolveListener resolveListener;
        final AtomicBoolean resolveListenerBusy = new AtomicBoolean(false);
        final ConcurrentLinkedQueue<NsdServiceInfo> pendingNsdServices = new ConcurrentLinkedQueue<>();
        final List<NsdServiceInfo> resolvedNsdServices =
                Collections.synchronizedList(new ArrayList<NsdServiceInfo>());

        BrowseSession(String serviceType) {
            this.serviceType = serviceType;
            this.resolveListener = createResolveListener();
            this.discoveryListener = createDiscoveryListener();
        }

        void start() {
            Log.d(TAG, "BrowseSession.start: " + serviceType);
            try {
                mNsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
            } catch (Exception e) {
                Log.e(TAG, "BrowseSession.start: NsdManager.discoverServices threw for " + serviceType, e);
            }
        }

        void stop() {
            Log.d(TAG, "BrowseSession.stop: " + serviceType);
            if (discoveryListener != null) {
                try {
                    mNsdManager.stopServiceDiscovery(discoveryListener);
                } catch (Exception e) {
                    Log.e(TAG, "BrowseSession.stop: error for " + serviceType + ": " + e.getMessage());
                }
                discoveryListener = null;
            }
            pendingNsdServices.clear();
            resolvedNsdServices.clear();
            resolveListenerBusy.set(false);
        }

        private NsdManager.DiscoveryListener createDiscoveryListener() {
            return new NsdManager.DiscoveryListener() {
                @Override
                public void onDiscoveryStarted(String regType) {
                    Log.d(TAG, "onDiscoveryStarted: " + regType + " (session=" + serviceType + ")");
                }

                @Override
                public void onServiceFound(NsdServiceInfo serviceInfo) {
                    String discoveredServiceType = serviceInfo.getServiceType();
                    String serviceName = serviceInfo.getServiceName();
                    Log.d(TAG, "onServiceFound: name=" + serviceName
                            + " type=" + discoveredServiceType + " (session=" + serviceType + ")");

                    // Android's NsdServiceInfo.getServiceType() is normalised differently across
                    // versions/locales — sometimes "._matter._tcp", sometimes "_matter._tcp.",
                    // sometimes "_matter._tcp". Normalise both sides by stripping leading/trailing
                    // dots before comparing so we don't drop matches for purely cosmetic differences.
                    if (typesMatch(discoveredServiceType, serviceType)) {
                        if (resolveListenerBusy.compareAndSet(false, true)) {
                            mNsdManager.resolveService(serviceInfo, resolveListener);
                        } else {
                            boolean isExist = false;
                            for (Iterator<NsdServiceInfo> it = pendingNsdServices.iterator(); it.hasNext(); ) {
                                NsdServiceInfo nsdServiceInfo = it.next();
                                if (nsdServiceInfo.getServiceName().equals(serviceName)) {
                                    isExist = true;
                                    break;
                                }
                            }
                            if (!isExist) {
                                pendingNsdServices.add(serviceInfo);
                            }
                        }
                    } else {
                        Log.w(TAG, "onServiceFound: type mismatch — got '" + discoveredServiceType
                                + "' expected '" + serviceType + "' (after normalisation)");
                    }
                }

                @Override
                public void onServiceLost(NsdServiceInfo serviceInfo) {
                    Log.d(TAG, "onServiceLost (" + serviceType + "): " + serviceInfo.getServiceName());
                    removeLostService(serviceInfo);
                }

                @Override
                public void onDiscoveryStopped(String stoppedType) {
                    Log.d(TAG, "onDiscoveryStopped: " + stoppedType);
                }

                @Override
                public void onStartDiscoveryFailed(String failedType, int errorCode) {
                    Log.e(TAG, "onStartDiscoveryFailed: " + failedType + " errorCode=" + errorCode);
                    sessionsByType.remove(serviceType);
                }

                @Override
                public void onStopDiscoveryFailed(String failedType, int errorCode) {
                    Log.e(TAG, "onStopDiscoveryFailed: " + failedType + " errorCode=" + errorCode);
                }
            };
        }

        private NsdManager.ResolveListener createResolveListener() {
            return new NsdManager.ResolveListener() {
                @Override
                public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                    Log.e(TAG, "Resolve failed for " + serviceType + ": " + errorCode);
                    resolveNextInQueue();
                }

                @Override
                public void onServiceResolved(NsdServiceInfo serviceInfo) {
                    InetAddress hostAddress = serviceInfo.getHost();
                    String serviceName = serviceInfo.getServiceName();
                    if (hostAddress == null) {
                        Log.e(TAG, "onServiceResolved: host is null name=" + serviceName
                                + " (" + serviceType + ")");
                        resolveNextInQueue();
                        return;
                    }
                    Log.d(TAG, "onServiceResolved: name=" + serviceName
                            + " host=" + hostAddress.getHostAddress()
                            + " port=" + serviceInfo.getPort()
                            + " (" + serviceType + ")");

                    resolvedNsdServices.add(serviceInfo);

                    int hostPort = serviceInfo.getPort();
                    Map<String, String> txtRecord = txtRecordToMap(serviceInfo);
                    // For RainMaker types, prefer TXT `node_id`; for Matter the TXT
                    // doesn't carry `node_id`, so we fall back to the instance name.
                    // Matter parsing into matterNodeId/compressedFabricId is done by
                    // ESPDiscoveryModule based on the service type.
                    String nodeId = txtRecord.getOrDefault(KEY_NODE_ID, "");
                    if (nodeId.isEmpty()) {
                        nodeId = serviceName;
                    }

                    if (!nodeId.isEmpty()) {
                        String host = hostAddress.getHostAddress();
                        String baseUrl = "http://" + host + ":" + hostPort;
                        DiscoveredService discovered = new DiscoveredService(
                                serviceType,
                                nodeId,
                                serviceName,
                                baseUrl,
                                host,
                                hostPort,
                                txtRecord
                        );
                        listener.deviceFound(discovered);
                    } else {
                        Log.e(TAG, "Could not determine node id for resolved service (" + serviceType + ")");
                    }

                    resolveNextInQueue();
                }
            };
        }

        private void resolveNextInQueue() {
            NsdServiceInfo nextService = pendingNsdServices.poll();
            if (nextService != null) {
                mNsdManager.resolveService(nextService, resolveListener);
            } else {
                resolveListenerBusy.set(false);
            }
        }

        /**
         * Removes a lost service from this session's resolved/pending lists and
         * notifies the listener. {@code serviceName} is used as the lookup key.
         */
        private void removeLostService(NsdServiceInfo serviceInfo) {
            String serviceName = serviceInfo.getServiceName();
            String nodeId = null;
            synchronized (resolvedNsdServices) {
                for (NsdServiceInfo s : resolvedNsdServices) {
                    if (s.getServiceName().equals(serviceName)) {
                        nodeId = nodeIdForLostService(s);
                        break;
                    }
                }
                resolvedNsdServices.removeIf(s -> s.getServiceName().equals(serviceName));
            }
            pendingNsdServices.removeIf(s -> s.getServiceName().equals(serviceName));
            if (nodeId == null || nodeId.isEmpty()) {
                nodeId = serviceName;
            }
            if (!nodeId.isEmpty()) {
                listener.deviceLost(serviceType, nodeId, serviceName);
            }
        }
    }

    /**
     * Normalise an mDNS service-type string by stripping leading and trailing dots and trimming
     * whitespace. Android's NsdServiceInfo.getServiceType() varies across OEMs/versions —
     * sometimes returning {@code "._matter._tcp"}, sometimes {@code "_matter._tcp."} — so we
     * compare normalised forms to avoid silently dropping otherwise-matching results.
     */
    private static String normaliseType(String s) {
        if (s == null) {
            return "";
        }
        String t = s.trim();
        while (t.startsWith(".")) {
            t = t.substring(1);
        }
        while (t.endsWith(".")) {
            t = t.substring(0, t.length() - 1);
        }
        return t;
    }

    /** True iff two service-type strings refer to the same type after dot/whitespace normalisation. */
    private static boolean typesMatch(String a, String b) {
        return normaliseType(a).equalsIgnoreCase(normaliseType(b));
    }

    /**
     * Prefer TXT {@code node_id}; otherwise use the service instance name (RainMaker-style fallback).
     */
    private static String nodeIdForLostService(NsdServiceInfo s) {
        String fromTxt = txtRecordToMap(s).getOrDefault(KEY_NODE_ID, "");
        if (!fromTxt.isEmpty()) {
            return fromTxt;
        }
        return s.getServiceName();
    }

    /**
     * Decode TXT records into a {@code Map<String, String>} of UTF-8 values
     * (case-insensitive normalised to lowercase keys).
     *
     * <p>Used both for {@code node_id} lookup and to expose chal-resp metadata
     * ({@code pop_required}, {@code sec_version}, {@code ch_resp}, ...) to the
     * React Native layer for on-network provisioning flows.
     */
    private static Map<String, String> txtRecordToMap(NsdServiceInfo s) {
        Map<String, String> out = new HashMap<>();
        Map<String, byte[]> attr = s.getAttributes();
        if (attr == null) {
            return out;
        }
        for (Map.Entry<String, byte[]> e : attr.entrySet()) {
            String key = e.getKey();
            byte[] value = e.getValue();
            if (key == null || value == null) {
                continue;
            }
            out.put(key.toLowerCase(), new String(value, StandardCharsets.UTF_8));
        }
        return out;
    }

    /**
     * Discovered service payload, including the originating service type, TXT
     * records, and reachable host/port.
     */
    public static class DiscoveredService {
        public final String serviceType;
        public final String nodeId;
        public final String serviceName;
        public final String baseUrl;
        public final String host;
        public final int port;
        public final Map<String, String> txt;

        public DiscoveredService(
            String serviceType,
            String nodeId,
            String serviceName,
            String baseUrl,
            String host,
            int port,
            Map<String, String> txt
        ) {
            this.serviceType = serviceType;
            this.nodeId = nodeId;
            this.serviceName = serviceName;
            this.baseUrl = baseUrl;
            this.host = host;
            this.port = port;
            this.txt = txt;
        }
    }

    /**
     * Listener interface for mDNS events.
     *
     * <p>{@code deviceLost} carries the originating {@code serviceType} so JS
     * consumers can filter by type when multiple browses run in parallel, and
     * the raw {@code serviceName} so Matter consumers can re-derive
     * {@code matterNodeId} from the instance name.
     */
    public interface mDNSEvenListener {
        void deviceFound(DiscoveredService service);

        void deviceLost(String serviceType, String nodeId, String serviceName);
    }
}
