// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.oauthloopback

import java.net.InetAddress
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

private const val STATE = "abc_DEF-123"

private fun head(text: String) = "$text\r\n\r\n".toByteArray()

class LoopbackRequestTest {
  @Test
  fun acceptsTheRedirectWithItsStateAndDecodesTheCode() {
    assertEquals(
      LoopbackDecision.Accept(LoopbackOutcome.Code("4/0Ab c", STATE)),
      decide(head("GET /callback?code=4%2F0Ab+c&state=$STATE&scope=x HTTP/1.1\r\nHost: 127.0.0.1"), STATE),
    )
    assertEquals(
      LoopbackDecision.Accept(LoopbackOutcome.ProviderError("access_denied")),
      decide(head("GET /callback?error=access_denied&state=$STATE HTTP/1.1"), STATE),
    )
  }

  @Test
  fun refusesWithoutUsingItUp() {
    assertEquals(LoopbackDecision.NotFound, decide(head("GET /favicon.ico HTTP/1.1"), STATE))
    assertEquals(LoopbackDecision.NotFound, decide(head("GET /callback?code=x&state=$STATE HTTP/1.1"), null))
    assertEquals(LoopbackDecision.MethodNotAllowed, decide(head("POST /callback?code=x&state=$STATE HTTP/1.1"), STATE))
    for (bad in listOf("code=x&state=wrong", "code=x&code=y&state=$STATE", "code=%ZZ&state=$STATE", "state=$STATE")) {
      assertEquals(bad, LoopbackDecision.BadRequest, decide(head("GET /callback?$bad HTTP/1.1"), STATE))
    }
  }

  @Test
  fun returnsOnlyToTheAppsOwnLink() {
    assertTrue(isReturnUrl("ai.amd.gaia.mobile.dev://oauth-done"))
    assertFalse(isReturnUrl("https://example.com"))
    assertFalse(isReturnUrl("javascript://oauth-done"))
    assertFalse(isReturnUrl("ai.amd.gaia://x\"><script>"))
  }

  @Test
  fun findsTheEndOfTheHead() {
    assertEquals(18, headLength("GET / HTTP/1.1\r\n\r\nrest".toByteArray()))
    assertNull(headLength("GET / HTTP/1.1\r\n".toByteArray()))
  }

  private fun get(port: Int, path: String): String = Socket(LOOPBACK_V4, port).use { s ->
    s.soTimeout = 5_000
    s.getOutputStream().write("GET $path HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n".toByteArray())
    s.getInputStream().bufferedReader().readLine()
  }

  @Test
  fun bindsTheAddressTheRedirectGoesTo() {
    val listener = LoopbackListener("ai.amd.gaia.mobile.dev://oauth-done")
    val port = listener.start()
    try {
      // The redirect names 127.0.0.1; a listener on ::1 would leave that port free for another app.
      Socket(InetAddress.getByName("127.0.0.1"), port).close()
    } finally {
      listener.cancel()
    }
  }

  @Test
  fun takesOneRedirectThenCloses() {
    val listener = LoopbackListener("ai.amd.gaia.mobile.dev://oauth-done")
    val port = listener.start()
    val got = CountDownLatch(1)
    var outcome: LoopbackOutcome? = null
    assertTrue(listener.wait(STATE, 5_000) { outcome = it; got.countDown() })
    assertEquals("HTTP/1.1 404 Not Found", get(port, "/favicon.ico"))
    assertEquals("HTTP/1.1 302 Found", get(port, "/callback?code=c&state=$STATE"))
    assertTrue(got.await(5, TimeUnit.SECONDS))
    assertEquals(LoopbackOutcome.Code("c", STATE), outcome)
    assertFalse(listener.wait(STATE, 5_000) {})
  }

  @Test
  fun aSilentOrTricklingClientDoesNotHoldUpTheRedirect() {
    val listener = LoopbackListener("ai.amd.gaia.mobile.dev://oauth-done")
    val port = listener.start()
    val got = CountDownLatch(1)
    assertTrue(listener.wait(STATE, 30_000) { got.countDown() })
    val silent = Socket(LOOPBACK_V4, port)
    val trickling = Socket(LOOPBACK_V4, port).apply { getOutputStream().write("GET /call".toByteArray()) }
    try {
      val started = System.nanoTime()
      assertEquals("HTTP/1.1 302 Found", get(port, "/callback?code=c&state=$STATE"))
      assertTrue(got.await(2, TimeUnit.SECONDS))
      assertTrue("the redirect waited behind the other clients", System.nanoTime() - started < TimeUnit.SECONDS.toNanos(2))
    } finally {
      silent.close()
      trickling.close()
    }
  }

  @Test
  fun clientsFillingEverySlotDoNotHoldUpTheRedirect() {
    val listener = LoopbackListener("ai.amd.gaia.mobile.dev://oauth-done")
    val port = listener.start()
    val got = CountDownLatch(1)
    assertTrue(listener.wait(STATE, 30_000) { got.countDown() })
    val silent = List(MAX_CONNECTIONS) { Socket(LOOPBACK_V4, port) }
    try {
      Thread.sleep(200)
      val started = System.nanoTime()
      assertEquals("HTTP/1.1 302 Found", get(port, "/callback?code=c&state=$STATE"))
      assertTrue(got.await(2, TimeUnit.SECONDS))
      assertTrue("the redirect waited behind the silent clients", System.nanoTime() - started < TimeUnit.SECONDS.toNanos(2))
    } finally {
      silent.forEach { it.close() }
    }
  }

  @Test
  fun aCancelBeforeStartLeavesNoPortOpen() {
    val listener = LoopbackListener("ai.amd.gaia.mobile.dev://oauth-done")
    listener.cancel()
    try {
      listener.start()
      fail("started after it was cancelled")
    } catch (e: LoopbackCancelledException) {
      // expected
    }
  }
}
