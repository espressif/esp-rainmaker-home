/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.discovery;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.util.Log;

import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * `mDNSManager` is responsible for managing mDNS (Multicast DNS) discovery.
 * It discovers services in the local network and resolves their details.
 * This class uses Android's `NsdManager` API for service discovery.
 */
public class mDNSManager {

    private static final String TAG = mDNSManager.class.getSimpleName();

    private static mDNSManager mdnsManager;

    private final String serviceType;
    private final Context context;
    private final mDNSEvenListener listener;

    private final NsdManager mNsdManager;
    private NsdManager.ResolveListener resolveListener;
    private NsdManager.DiscoveryListener discoveryListener;

    private final AtomicBoolean resolveListenerBusy = new AtomicBoolean(false);
    private final ConcurrentLinkedQueue<NsdServiceInfo> pendingNsdServices = new ConcurrentLinkedQueue<>();
    private final List<NsdServiceInfo> resolvedNsdServices = Collections.synchronizedList(new ArrayList<>());

    private static final String KEY_NODE_ID = "node_id";

    /**
     * Gets the singleton instance of `mDNSManager`.
     *
     * @param context     Application context.
     * @param serviceType The type of service to discover (e.g., "_http._tcp.").
     * @param listener    Callback listener for discovery events.
     * @return The singleton instance of `mDNSManager`.
     */
    public static mDNSManager getInstance(Context context, String serviceType, mDNSEvenListener listener) {
        if (mdnsManager == null) {
            mdnsManager = new mDNSManager(context, serviceType, listener);
        }
        return mdnsManager;
    }

    /**
     * Private constructor to enforce the singleton pattern.
     *
     * @param context     Application context.
     * @param serviceType The type of service to discover.
     * @param listener    Callback listener for discovery events.
     */
    private mDNSManager(Context context, String serviceType, mDNSEvenListener listener) {
        this.context = context;
        this.serviceType = serviceType;
        this.listener = listener;
        this.mNsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
    }

    /**
     * Initializes the mDNS discovery by setting up the resolve listener.
     */
    public void initializeNsd() {
        initializeResolveListener();
    }

    /**
     * Starts discovering services of the specified type and domain.
     *
     * @param serviceType The type of service to discover.
     * @param domain      The domain in which to search (e.g., local network).
     */
    public void discoverServices(String serviceType, String domain) {
        stopDiscovery();
        initializeDiscoveryListener(serviceType);
        mNsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
    }

    /**
     * Stops the ongoing service discovery.
     */
    public void stopDiscovery() {
        if (discoveryListener != null) {
            try {
                mNsdManager.stopServiceDiscovery(discoveryListener);
            } catch (Exception e) {
                Log.e(TAG, "Error stopping discovery: " + e.getMessage());
            }
            discoveryListener = null;
        }
    }

    /**
     * Sets up the discovery listener to handle discovered services.
     *
     * @param serviceType The type of service to discover.
     */
    private void initializeDiscoveryListener(String serviceType) {

        discoveryListener = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String regType) {
                // Discovery started
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                String discoveredServiceType = serviceInfo.getServiceType().trim();

                if (discoveredServiceType.equals(serviceType)) {
                    if (resolveListenerBusy.compareAndSet(false, true)) {
                        if (resolveListener != null) {
                            mNsdManager.resolveService(serviceInfo, resolveListener);
                        }
                    } else {
                        String serviceName = serviceInfo.getServiceName();
                        Iterator iterator = pendingNsdServices.iterator();
                        boolean isExist = false;

                        while (iterator.hasNext()) {
                            NsdServiceInfo nsdServiceInfo = (NsdServiceInfo) iterator.next();
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
                    Log.w(TAG, "Unknown service type: " + serviceInfo.getServiceType());
                }
            }

            @Override
            public void onServiceLost(NsdServiceInfo serviceInfo) {
                removeLostService(serviceInfo);
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
                // Discovery stopped
            }

            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                Log.e(TAG, "Discovery start failed: " + errorCode);
                stopDiscovery();
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                Log.e(TAG, "Discovery stop failed: " + errorCode);
                stopDiscovery();
            }
        };
    }

    /**
     * Sets up the resolve listener to handle resolving services.
     */
    private void initializeResolveListener() {

        resolveListener = new NsdManager.ResolveListener() {

            @Override
            public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                Log.e(TAG, "Resolve failed: " + errorCode);
                resolveNextInQueue();
            }

            @Override
            public void onServiceResolved(NsdServiceInfo serviceInfo) {
                resolvedNsdServices.add(serviceInfo);

                InetAddress hostAddress = serviceInfo.getHost();
                int hostPort = serviceInfo.getPort();
                String nodeId = "";
                HashMap<String, String> baseUrls = new HashMap<>();

                Map<String, byte[]> attr = serviceInfo.getAttributes();
                for (Map.Entry<String, byte[]> entry : attr.entrySet()) {
                    String key = entry.getKey();
                    byte[] value = entry.getValue();

                    if (key.equals(KEY_NODE_ID)) {
                        nodeId = new String(value);
                    }
                }

                if (!nodeId.isEmpty()) {
                    String baseUrl = "http://" + hostAddress.getHostAddress() + ":" + hostPort;
                    baseUrls.put(nodeId, baseUrl);
                    listener.deviceFound(baseUrls);
                } else {
                    Log.e(TAG, "NodeId is missing, skipping service");
                }

                resolveNextInQueue();
            }
        };
    }

    /**
     * Adds a service to the pending queue if it is not already present.
     *
     * @param serviceInfo The service information to add.
     */
    private void addToPendingServices(NsdServiceInfo serviceInfo) {
        String serviceName = serviceInfo.getServiceName();
        boolean exists = pendingNsdServices.stream().anyMatch(s -> s.getServiceName().equals(serviceName));

        if (!exists) {
            pendingNsdServices.add(serviceInfo);
        }
    }

    /**
     * Resolves the next service in the queue.
     */
    private void resolveNextInQueue() {
        NsdServiceInfo nextService = pendingNsdServices.poll();
        if (nextService != null) {
            mNsdManager.resolveService(nextService, resolveListener);
        } else {
            resolveListenerBusy.set(false);
        }
    }

    /**
     * Removes a lost service from the resolved and pending lists.
     *
     * @param serviceInfo The service information to remove.
     */
    private void removeLostService(NsdServiceInfo serviceInfo) {
        String serviceName = serviceInfo.getServiceName();
        resolvedNsdServices.removeIf(s -> s.getServiceName().equals(serviceName));
        pendingNsdServices.removeIf(s -> s.getServiceName().equals(serviceName));
    }

    /**
     * Listener interface for mDNS events.
     */
    public interface mDNSEvenListener {
        void deviceFound(HashMap<String, String> baseUrls);
    }
}