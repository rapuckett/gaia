// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.transport

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** The networks a pairing code may name: the PC's OFFERED_NETWORKS (gaia/ui/devices). Twins: homeNetwork.ts, HomeNetwork.swift. */
private val OFFERED_NETWORKS = listOf("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
/** Tailscale's IPv4 range, the only addresses a `tailnet` origin may name. */
private const val TAILNET_NETWORK = "100.64.0.0/10"
/** A relay origin's first label: a PC's relay id, base32 lowercase. */
private const val RELAY_ID_LENGTH = 26
private const val RELAY_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"
/** Manifest meta-data plugins/withRelayDomain writes from EXPO_PUBLIC_GAIA_RELAY_DOMAIN; absent means relay origins are refused. */
internal const val RELAY_DOMAIN_KEY = "GAIARelayDomain"

/**
 * `origin` as `https://<address>:<port>` when it is exactly that, with a dotted IPv4 address on a
 * home network: no name, IPv6, userinfo, path, query or fragment. Null for anything else.
 */
internal fun homeNetworkOrigin(origin: String): String? = ipv4Origin(origin, OFFERED_NETWORKS)

/** `https://<address>:<port>` with a dotted IPv4 address in 100.64.0.0/10; null for anything else. */
internal fun tailnetOrigin(origin: String): String? = ipv4Origin(origin, listOf(TAILNET_NETWORK))

/** `https://<relay id>.<relay domain>` exactly, on 443; null for anything else, and always when no relay is built in. */
internal fun relayOrigin(origin: String, relayDomain: String?): String? {
  if (relayDomain == null || !isDomain(relayDomain)) return null
  val scheme = "https://"
  if (!origin.startsWith(scheme)) return null
  var rest = origin.substring(scheme.length)
  if (rest.endsWith("/")) rest = rest.dropLast(1)
  val dot = rest.indexOf('.')
  if (dot < 0) return null
  val id = rest.substring(0, dot)
  if (id.length != RELAY_ID_LENGTH || !id.all { it in RELAY_ID_ALPHABET } || rest.substring(dot + 1) != relayDomain) {
    return null
  }
  return "https://$id.$relayDomain"
}

/** A route the PC reported, checked by its kind; null when the kind is unknown or the origin isn't one that kind may name. */
internal fun routeOrigin(kind: String, origin: String, relayDomain: String?): String? = when (kind) {
  "home" -> homeNetworkOrigin(origin)
  "tailnet" -> tailnetOrigin(origin)
  "relay" -> relayOrigin(origin, relayDomain)
  else -> null
}

/** The routes JSON `[{kind, origin}]`, every one valid for its kind; any other entry refuses the whole set. */
internal fun checkedRoutes(json: String, relayDomain: String?): List<RouteOrigin> {
  val notAList = transportError(
    "invalid_origin",
    "The PC's addresses for this phone weren't a list of routes, so none were saved.",
  )
  val entries = try {
    JSONArray(json)
  } catch (e: JSONException) {
    throw notAList
  }
  if (entries.length() == 0) throw notAList
  val objects = (0 until entries.length()).map { entries.opt(it) as? JSONObject ?: throw notAList }
  val routes = ArrayList<RouteOrigin>()
  for (entry in objects) {
    val kind = entry.opt("kind") as? String
    val origin = entry.opt("origin") as? String
    val checked = if (kind != null && origin != null) routeOrigin(kind, origin, relayDomain) else null
    if (kind == null || checked == null) {
      throw transportError(
        "invalid_origin",
        "The PC reported an address this phone won't use (a ${kind ?: "unnamed"} route), so none were saved.",
      )
    }
    val route = RouteOrigin(kind, checked)
    if (route !in routes) routes.add(route)
  }
  return routes
}

private fun isDomain(text: String): Boolean {
  val labels = text.split(".")
  if (labels.size < 2) return false
  return labels.all { label ->
    label.isNotEmpty() && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-") &&
      label.all { it in 'a'..'z' || it in '0'..'9' || it == '-' }
  }
}

private fun ipv4Origin(origin: String, networks: List<String>): String? {
  val scheme = "https://"
  if (!origin.startsWith(scheme)) return null
  var rest = origin.substring(scheme.length)
  if (rest.endsWith("/")) rest = rest.dropLast(1)
  val parts = rest.split(":")
  if (parts.size != 2) return null
  val address = ipv4(parts[0]) ?: return null
  val port = decimal(parts[1], 5) ?: return null
  if (port < 1 || port > 65535) return null
  val onNetwork = networks.any { cidr ->
    val halves = cidr.split("/")
    val base = if (halves.size == 2) ipv4(halves[0]) else null
    val bits = if (halves.size == 2) halves[1].toIntOrNull() else null
    if (base == null || bits == null) {
      false
    } else {
      val mask = if (bits == 0) 0L else (0xFFFFFFFFL shl (32 - bits)) and 0xFFFFFFFFL
      (address and mask) == (base and mask)
    }
  }
  return if (onNetwork) "https://${parts[0]}:${parts[1]}" else null
}

private fun ipv4(text: String): Long? {
  val octets = text.split(".")
  if (octets.size != 4) return null
  var value = 0L
  for (octet in octets) {
    val n = decimal(octet, 3) ?: return null
    if (n > 255) return null
    value = (value shl 8) or n.toLong()
  }
  return value
}

/** ASCII digits only, no leading zero. */
private fun decimal(text: String, digits: Int): Int? {
  if (text.isEmpty() || text.length > digits || !text.all { it in '0'..'9' }) return null
  if (text != "0" && text.startsWith("0")) return null
  return text.toInt()
}
