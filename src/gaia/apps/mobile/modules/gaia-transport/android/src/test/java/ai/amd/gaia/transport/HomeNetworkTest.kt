// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.transport

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

// The cases of src/features/pairing/homeNetwork.test.ts, which checks the TypeScript twin the same way.
class HomeNetworkTest {
  private val relay = "relay.example.net"
  private val id = "abcdefghijklmnopqrstuvwxyz".take(20) + "234567"

  @Test
  fun acceptsEachKindsOwnAddresses() {
    val accepted = listOf(
      Triple("home", "https://192.168.1.20:4243", "https://192.168.1.20:4243"),
      Triple("home", "https://10.0.0.5:4243/", "https://10.0.0.5:4243"),
      Triple("home", "https://10.0.2.2:4243", "https://10.0.2.2:4243"),
      Triple("home", "https://172.16.0.1:4243", "https://172.16.0.1:4243"),
      Triple("home", "https://172.31.255.254:65535", "https://172.31.255.254:65535"),
      Triple("home", "https://192.168.0.1:1", "https://192.168.0.1:1"),
      Triple("tailnet", "https://100.64.0.1:4243", "https://100.64.0.1:4243"),
      Triple("tailnet", "https://100.127.255.254:4243/", "https://100.127.255.254:4243"),
      Triple("relay", "https://$id.$relay", "https://$id.$relay"),
      Triple("relay", "https://$id.$relay/", "https://$id.$relay"),
    )
    for ((kind, origin, want) in accepted) assertEquals("$kind $origin", want, routeOrigin(kind, origin, relay))
  }

  @Test
  fun refusesEverythingElse() {
    val refused = listOf(
      // Each kind accepts only its own addresses.
      "home" to "https://100.64.0.1:4243",
      "tailnet" to "https://192.168.1.20:4243",
      "relay" to "https://192.168.1.20:4243",
      // home: a dotted IPv4 literal on a private network, with a port, and nothing else.
      "home" to "https://172.32.0.1:4243",
      "home" to "https://172.15.255.255:4243",
      "home" to "https://8.8.8.8:4243",
      "home" to "https://127.0.0.1:4243",
      "home" to "https://169.254.1.1:4243",
      "home" to "https://11.0.0.1:4243",
      "home" to "https://192.169.0.1:4243",
      "home" to "http://192.168.1.20:4243",
      "home" to "https://192.168.1.20",
      "home" to "https://192.168.1.20:0",
      "home" to "https://192.168.1.20:65536",
      "home" to "https://192.168.1.20:04243",
      "home" to "https://192.168.01.20:4243",
      "home" to "https://192.168.1.256:4243",
      "home" to "https://192.168.1:4243",
      "home" to "https://192.168.1.20.5:4243",
      "home" to "https://192.168.1.20:4243/api",
      "home" to "https://192.168.1.20:4243//",
      "home" to "https://user@192.168.1.20:4243",
      "home" to "https://192.168.1.20:4243?x=1",
      "home" to "https://pc.local:4243",
      "home" to "https://[fd00::1]:4243",
      "home" to "https://192.168.1.20:+4243",
      "home" to "https://192.168.1.٢٠:4243",
      // tailnet: an IPv4 literal in 100.64.0.0/10, with a port, and nothing else.
      "tailnet" to "https://100.63.255.255:4243",
      "tailnet" to "https://100.128.0.1:4243",
      "tailnet" to "https://100.64.0.1",
      "tailnet" to "http://100.64.0.1:4243",
      "tailnet" to "https://100.064.0.1:4243",
      "tailnet" to "https://100.64.0.1:4243/api",
      "tailnet" to "https://pc.tailnet-name.ts.net:4243",
      "tailnet" to "https://[fd7a:115c:a1e0::1]:4243",
      // relay: a 26-character base32 id under the built-in domain, on 443.
      "relay" to "https://$id.$relay:443",
      "relay" to "https://$id.$relay:8443",
      "relay" to "http://$id.$relay",
      "relay" to "https://${id.drop(1)}.$relay",
      "relay" to "https://${id}a.$relay",
      "relay" to "https://${id.uppercase()}.$relay",
      "relay" to "https://${id.drop(1)}1.$relay",
      "relay" to "https://$id.evil.$relay",
      "relay" to "https://$id.$relay.evil.com",
      "relay" to "https://$id.other.example.net",
      "relay" to "https://user@$id.$relay",
      "relay" to "https://$id.$relay/path",
      "relay" to "https://$id.$relay?x=1",
      // Unknown kinds.
      "vpn" to "https://192.168.1.20:4243",
      "" to "https://192.168.1.20:4243",
    )
    for ((kind, origin) in refused) assertNull("$kind $origin", routeOrigin(kind, origin, relay))
  }

  @Test
  fun refusesEveryRelayOriginWhenTheBuildHasNoRelayDomain() {
    assertNull(routeOrigin("relay", "https://$id.$relay", null))
    assertNull(routeOrigin("relay", "https://$id.$relay", ""))
    assertNull(routeOrigin("relay", "https://$id.relay", "relay"))
  }

  @Test
  fun aReportedRouteSetIsSavedWholeOrNotAtAll() {
    val routes = checkedRoutes(
      """[{"kind":"home","origin":"https://192.168.1.20:4243/"},{"kind":"tailnet","origin":"https://100.64.0.1:4243"},{"kind":"home","origin":"https://192.168.1.20:4243"}]""",
      relay,
    )
    assertEquals(
      listOf(RouteOrigin("home", "https://192.168.1.20:4243"), RouteOrigin("tailnet", "https://100.64.0.1:4243")),
      routes,
    )
    for (json in listOf(
      """[{"kind":"home","origin":"https://192.168.1.20:4243"},{"kind":"home","origin":"https://8.8.8.8:4243"}]""",
      """[{"kind":"home","origin":"https://192.168.1.20:4243"},{"origin":"https://192.168.1.21:4243"}]""",
      """[{"kind":"home","origin":"https://192.168.1.20:4243"},"https://192.168.1.21:4243"]""",
      """[{"kind":"home","origin":4243}]""",
      """[]""",
      """{"kind":"home","origin":"https://192.168.1.20:4243"}""",
      "not json",
    )) {
      try {
        checkedRoutes(json, relay)
        fail("saved $json")
      } catch (e: TransportException) {
        assertEquals(json, "invalid_origin", e.code)
      }
    }
  }
}
