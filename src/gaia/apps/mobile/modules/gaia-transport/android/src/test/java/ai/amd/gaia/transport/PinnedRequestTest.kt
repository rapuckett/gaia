// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.transport

import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class PinnedRequestTest {
  private val root = HeldCertificate.Builder().commonName("Trusted CA").certificateAuthority(0).build()
  private val leaf = leafSignedByRoot("GAIA PC")
  private val otherLeaf = leafSignedByRoot("Another PC")
  private lateinit var server: MockWebServer

  @Before
  fun startServer() {
    server = MockWebServer()
    val certificates = HandshakeCertificates.Builder().heldCertificate(leaf, root.certificate).build()
    server.useHttps(certificates.sslSocketFactory(), false)
    server.start()
  }

  @After
  fun stopServer() {
    server.shutdown()
  }

  @Test
  fun pinIsTheSha256OfTheLeafAs64HexCharacters() {
    val hex = sha256(leaf.certificate).joinToString("") { "%02x".format(it) }
    assertArrayEquals(sha256(leaf.certificate), pinBytes(hex))
    assertArrayEquals(sha256(leaf.certificate), pinBytes(hex.uppercase()))
    assertNull(pinBytes(""))
    assertNull(pinBytes(hex.dropLast(2)))
    assertNull(pinBytes(hex.dropLast(1) + "g"))
  }

  @Test
  fun trustManagerAcceptsOnlyThePinnedLeaf() {
    var mismatches = 0
    val trust = PinTrustManager(sha256(leaf.certificate)) { mismatches++ }
    trust.checkServerTrusted(arrayOf(leaf.certificate, root.certificate), "ECDHE_ECDSA")
    assertEquals(0, mismatches)
    assertRejected(trust, arrayOf(otherLeaf.certificate, root.certificate))
    assertRejected(trust, arrayOf(root.certificate, leaf.certificate))
    assertRejected(trust, arrayOf())
    assertRejected(PinTrustManager(ByteArray(0)) { mismatches++ }, arrayOf(leaf.certificate))
    assertEquals(0, trust.getAcceptedIssuers().size)
  }

  @Test
  fun matchingPinReachesThePcAndStreamsTheBody() {
    server.enqueue(MockResponse().setResponseCode(200).setHeader("X-Gaia", "yes").setBody("hello pc"))
    val request = PinnedRequest(sha256(leaf.certificate))
    val head = startAndWait(request)
    assertTrue("expected a response, got $head", head is Outcome.Ok)
    val ok = head as Outcome.Ok
    assertEquals(200, ok.value.status)
    assertEquals("yes", ok.value.headers["x-gaia"])
    assertEquals("hello pc", String(readAll(request), Charsets.UTF_8))
  }

  @Test
  fun aDifferentLeafFromTheSameTrustedCaIsRefused() {
    // A client that trusts the CA accepts this server, so only the pin refuses it.
    val trustsCa = HandshakeCertificates.Builder().addTrustedCertificate(root.certificate).build()
    val trusting = OkHttpClient.Builder()
      .sslSocketFactory(trustsCa.sslSocketFactory(), trustsCa.trustManager)
      .hostnameVerifier { _, _ -> true }
      .build()
    server.enqueue(MockResponse().setBody("ok"))
    trusting.newCall(Request.Builder().url(server.url("/")).build()).execute().use { assertEquals(200, it.code) }

    val head = startAndWait(PinnedRequest(sha256(otherLeaf.certificate)))
    assertEquals("pin_mismatch", (head as Outcome.Failed).error.code)
  }

  @Test
  fun noPinRefusesEveryServer() {
    val head = startAndWait(PinnedRequest(ByteArray(0)))
    assertEquals("pin_mismatch", (head as Outcome.Failed).error.code)
  }

  @Test
  fun plainHttpIsNeverSent() {
    val plain = MockWebServer()
    plain.start()
    try {
      val head = startAndWait(PinnedRequest(sha256(leaf.certificate)), plain.url("/api/health"))
      assertEquals("network", (head as Outcome.Failed).error.code)
      assertEquals(0, plain.requestCount)
    } finally {
      plain.shutdown()
    }
  }

  private fun leafSignedByRoot(name: String) = HeldCertificate.Builder()
    .commonName(name)
    .addSubjectAlternativeName("localhost")
    .signedBy(root)
    .build()

  private fun startAndWait(request: PinnedRequest, url: HttpUrl = server.url("/api/health")): Outcome<ResponseHead> {
    val done = CountDownLatch(1)
    var outcome: Outcome<ResponseHead>? = null
    request.start(Outgoing(url), 5) {
      outcome = it
      done.countDown()
    }
    assertTrue("no answer within 10 s", done.await(10, TimeUnit.SECONDS))
    return outcome!!
  }

  private fun readAll(request: PinnedRequest): ByteArray {
    val done = CountDownLatch(1)
    var body: Outcome<ByteArray>? = null
    request.readAll {
      body = it
      done.countDown()
    }
    assertTrue("body not read within 10 s", done.await(10, TimeUnit.SECONDS))
    return (body as Outcome.Ok).value
  }

  private fun assertRejected(trust: PinTrustManager, chain: Array<X509Certificate>) {
    try {
      trust.checkServerTrusted(chain, "ECDHE_ECDSA")
      fail("accepted a chain whose leaf isn't pinned")
    } catch (expected: CertificateException) {
    }
  }

  private fun sha256(certificate: X509Certificate): ByteArray =
    MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
}
