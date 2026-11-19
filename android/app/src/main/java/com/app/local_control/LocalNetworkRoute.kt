/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.local_control

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.NoRouteToHostException
import java.net.URL

/**
 * Opens connections to LAN IPv4 hosts only over a network that holds the host.
 *
 * An unbound connection follows the phone's default network, so when that is
 * mobile data a LAN address is tried over it and waits out the whole connect
 * timeout. Here such a connection fails at once with NoRouteToHostException.
 */
object LocalNetworkRoute {

    /**
     * Interface name prefixes of mobile data links: rmnet Qualcomm, ccmni
     * MediaTek, seth Spreadtrum/Unisoc, clat and v4- Android's IPv4 over IPv6
     * on mobile data, pdp older phones.
     */
    private val MOBILE_INTERFACE_PREFIXES = listOf("rmnet", "ccmni", "pdp", "clat", "v4-rmnet", "seth")

    /**
     * Opens [url] on the Wi-Fi or Ethernet network that holds its host, or on
     * the phone's own hotspot or tether link. Hosts that are not IPv4
     * addresses are opened as before.
     * @throws NoRouteToHostException when the phone has no link on the host's network.
     */
    fun openConnection(context: Context, url: URL): HttpURLConnection {
        val host = ipv4Host(url.host) ?: return url.openConnection() as HttpURLConnection
        localNetworkFor(context, host)?.let { return it.openConnection(url) as HttpURLConnection }
        if (onOwnInterface(host)) {
            return url.openConnection() as HttpURLConnection
        }
        throw NoRouteToHostException("Phone is not on the local network of ${url.host}")
    }

    /** [host] as an IPv4 address when it is four numbers from 0 to 255, built without a DNS lookup. */
    private fun ipv4Host(host: String): Inet4Address? {
        val parts = host.split(".")
        if (parts.size != 4) return null
        val bytes = ByteArray(4)
        for ((index, part) in parts.withIndex()) {
            if (part.isEmpty() || part.length > 3 || !part.all(Char::isDigit)) return null
            val value = part.toInt()
            if (value > 255) return null
            bytes[index] = value.toByte()
        }
        return InetAddress.getByAddress(bytes) as Inet4Address
    }

    /** Wi-Fi or Ethernet network whose subnet contains [host]. */
    private fun localNetworkFor(context: Context, host: Inet4Address): Network? {
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return null
        return manager.allNetworks.firstOrNull { network ->
            val capabilities = manager.getNetworkCapabilities(network) ?: return@firstOrNull false
            val isLocalLink = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
            isLocalLink && manager.getLinkProperties(network)?.linkAddresses.orEmpty().any {
                sameSubnet(it.address, host, it.prefixLength)
            }
        }
    }

    /** A phone side link that is not mobile data, e.g. its own hotspot, holds [host]. */
    private fun onOwnInterface(host: Inet4Address): Boolean {
        val interfaces = NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
        return interfaces.any { networkInterface ->
            networkInterface.isUp && !networkInterface.isLoopback &&
                MOBILE_INTERFACE_PREFIXES.none { networkInterface.name.startsWith(it) } &&
                networkInterface.interfaceAddresses.any {
                    sameSubnet(it.address, host, it.networkPrefixLength.toInt())
                }
        }
    }

    private fun sameSubnet(address: InetAddress?, host: Inet4Address, prefixLength: Int): Boolean {
        if (address !is Inet4Address || prefixLength !in 1..32) return false
        val mask = (-1L shl (32 - prefixLength)) and 0xFFFFFFFFL
        return (toLong(address) and mask) == (toLong(host) and mask)
    }

    private fun toLong(address: Inet4Address): Long =
        address.address.fold(0L) { value, byte -> (value shl 8) or (byte.toLong() and 0xFF) }
}
