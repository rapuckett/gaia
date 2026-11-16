// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation

/// The networks a pairing code may name: the PC's OFFERED_NETWORKS (gaia/ui/devices). Twin: homeNetwork.ts.
private let offeredNetworks = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
/// Tailscale's IPv4 range, the only addresses a `tailnet` origin may name.
private let tailnetNetwork = "100.64.0.0/10"
/// A relay origin's first label: a PC's relay id, base32 lowercase.
private let relayIdLength = 26
private let relayIdAlphabet = "abcdefghijklmnopqrstuvwxyz234567"
/// Info.plist key app.config writes from EXPO_PUBLIC_GAIA_RELAY_DOMAIN; absent means relay origins are refused.
private let relayDomainKey = "GAIARelayDomain"

/// `origin` as `https://<address>:<port>` when it is exactly that, with a dotted IPv4 address on a
/// home network: no name, IPv6, userinfo, path, query or fragment. Nil for anything else.
func homeNetworkOrigin(_ origin: String) -> String? {
  ipv4Origin(origin, networks: offeredNetworks)
}

/// `https://<address>:<port>` with a dotted IPv4 address in 100.64.0.0/10; nil for anything else.
func tailnetOrigin(_ origin: String) -> String? {
  ipv4Origin(origin, networks: [tailnetNetwork])
}

/// `https://<relay id>.<relay domain>` exactly, on 443; nil for anything else, and always when no relay is built in.
func relayOrigin(_ origin: String, relayDomain: String? = builtInRelayDomain()) -> String? {
  guard let relayDomain, isDomain(relayDomain) else { return nil }
  let scheme = "https://"
  guard origin.hasPrefix(scheme) else { return nil }
  var rest = Substring(origin.dropFirst(scheme.count))
  if rest.hasSuffix("/") { rest = rest.dropLast() }
  guard let dot = rest.firstIndex(of: ".") else { return nil }
  let id = rest[..<dot]
  guard id.count == relayIdLength, id.allSatisfy({ relayIdAlphabet.contains($0) }),
    rest[rest.index(after: dot)...] == Substring(relayDomain)
  else { return nil }
  return "https://\(id).\(relayDomain)"
}

/// A route the PC reported, checked by its kind; nil when the kind is unknown or the origin isn't one that kind may name.
func routeOrigin(kind: String, origin: String) -> String? {
  switch kind {
  case "home": return homeNetworkOrigin(origin)
  case "tailnet": return tailnetOrigin(origin)
  case "relay": return relayOrigin(origin)
  default: return nil
  }
}

func builtInRelayDomain() -> String? {
  guard let value = Bundle.main.object(forInfoDictionaryKey: relayDomainKey) as? String, !value.isEmpty else {
    return nil
  }
  return value
}

private func isDomain(_ text: String) -> Bool {
  let labels = text.split(separator: ".", omittingEmptySubsequences: false)
  guard labels.count >= 2 else { return false }
  return labels.allSatisfy { label in
    let ok = label.utf8.allSatisfy { ($0 >= 97 && $0 <= 122) || ($0 >= 48 && $0 <= 57) || $0 == 45 }
    return ok && !label.isEmpty && label.count <= 63 && !label.hasPrefix("-") && !label.hasSuffix("-")
  }
}

private func ipv4Origin(_ origin: String, networks: [String]) -> String? {
  let scheme = "https://"
  guard origin.hasPrefix(scheme) else { return nil }
  var rest = Substring(origin.dropFirst(scheme.count))
  if rest.hasSuffix("/") { rest = rest.dropLast() }
  let parts = rest.split(separator: ":", omittingEmptySubsequences: false)
  guard parts.count == 2, let address = ipv4(parts[0]),
    let port = decimal(parts[1], digits: 5), port >= 1, port <= 65535
  else { return nil }
  let onNetwork = networks.contains { cidr in
    let halves = cidr.split(separator: "/")
    guard halves.count == 2, let base = ipv4(halves[0]), let bits = Int(halves[1]) else { return false }
    let mask: UInt32 = bits == 0 ? 0 : UInt32.max << UInt32(32 - bits)
    return address & mask == base & mask
  }
  return onNetwork ? "https://\(parts[0]):\(parts[1])" : nil
}

private func ipv4(_ text: Substring) -> UInt32? {
  let octets = text.split(separator: ".", omittingEmptySubsequences: false)
  guard octets.count == 4 else { return nil }
  var value: UInt32 = 0
  for octet in octets {
    guard let n = decimal(octet, digits: 3), n <= 255 else { return nil }
    value = value << 8 | UInt32(n)
  }
  return value
}

/// ASCII digits only, no leading zero.
private func decimal(_ text: Substring, digits: Int) -> Int? {
  guard !text.isEmpty, text.count <= digits, text.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }),
    text == "0" || !text.hasPrefix("0")
  else { return nil }
  return Int(text)
}
