// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import java.io.File
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** AES-GCM with a key in memory, standing in for the Keystore in JVM tests. */
private class MemorySealer : PushSealer {
  private val key = SecretKeySpec(ByteArray(32).also(SecureRandom()::nextBytes), "AES")

  override fun seal(plain: ByteArray, aad: ByteArray): ByteArray {
    val iv = ByteArray(12).also(SecureRandom()::nextBytes)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv))
    cipher.updateAAD(aad)
    return iv + cipher.doFinal(plain)
  }

  override fun open(sealed: ByteArray, aad: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed, 0, 12))
    cipher.updateAAD(aad)
    return cipher.doFinal(sealed, 12, sealed.size - 12)
  }
}

class PushActionsTest {
  @get:Rule val folder = TemporaryFolder()

  private val approvalId = "0b6f2c1e-8d4a-4f7e-9a3b-2c5d6e7f8a9b"

  private fun payload(params: String, ids: String = """"session_id":"s_42","approval_id":"$approvalId",""") =
    PushPayload.parse("""{"v":1,"kind":"approval","params":$params,$ids"route":"/chat/s_42","seq":5}""".toByteArray())!!

  private val approval = payload("""{"ask":"approval","tool":"write_file","ttl_s":600}""")

  private fun store(dir: File = folder.newFolder()) = PushActionStore(dir, MemorySealer())

  @Test
  fun offersReviewAndDenyOnlyWhereUnlockIsEnforced() {
    assertEquals(PushApproval("pc", "s_42", approvalId, "write_file", 600), PushActions.offered(approval, "pc", emptySet(), 31))
    assertNull(PushActions.offered(approval, "pc", emptySet(), 30))
    assertNull(PushActions.offered(approval, "pc", emptySet(), 24))
  }

  @Test
  fun offersNothingWithoutTtl() {
    assertNull(PushActions.offered(payload("""{"ask":"approval","tool":"write_file"}"""), "pc", emptySet(), 34))
  }

  @Test
  fun bothActionsNeedTheUnlockAndNoneApprovesOrAllowsAlways() {
    assertEquals(listOf("gaia.review", "gaia.deny"), PushActions.SPECS.map { it.answer })
    assertEquals(listOf("notifications.devices.review", "notifications.deny"), PushActions.SPECS.map { it.labelKey })
    assertTrue(PushActions.SPECS.all { it.authenticationRequired })
    assertFalse(PushActions.SPECS.any { s -> listOf(s.answer, s.intentAction).any { "always" in it.lowercase() || "approve" in it.lowercase() } })
  }

  @Test
  fun keepsButtonsOffWatchesAndEveryChatTitleOffTheLockScreen() {
    assertEquals(PushPostFlags(localOnly = true, genericPublicVersion = true), PushActions.postFlags(hasActions = true))
    assertEquals(PushPostFlags(localOnly = false, genericPublicVersion = true), PushActions.postFlags(hasActions = false))
  }

  @Test
  fun offersNothingForAQuestionOrAnIncompleteApproval() {
    assertNull(PushActions.offered(payload("""{"ask":"question","ttl_s":600}"""), "pc", emptySet(), 34))
    assertNull(PushActions.offered(payload("""{"tool":"write_file","ttl_s":600}"""), "pc", emptySet(), 34))
    assertNull(PushActions.offered(payload("""{"ask":"approval","ttl_s":600}""", """"session_id":"s_42","""), "pc", emptySet(), 34))
    assertNull(PushActions.offered(payload("""{"ask":"approval","ttl_s":600}""", """"approval_id":"a1","""), "pc", emptySet(), 34))
    assertNull(PushActions.offered(payload("""{"ask":"approval","ttl_s":600}""", """"session_id":"s 42","approval_id":"a1","""), "pc", emptySet(), 34))
  }

  @Test
  fun offersNothingForAnOpenOnlyTool() {
    assertNull(PushActions.offered(approval, "pc", setOf("write_file"), 34))
    assertNotNull(PushActions.offered(approval, "pc", setOf("send_email"), 34))
    // With a list, an approval that doesn't name its tool can't be checked against it.
    assertNull(PushActions.offered(payload("""{"ask":"approval","ttl_s":600}"""), "pc", setOf("send_email"), 34))
    assertNotNull(PushActions.offered(payload("""{"ask":"approval","ttl_s":600}"""), "pc", emptySet(), 34))
  }

  @Test
  fun tokensAreRandomAndGiveEachNotificationItsOwnRequestCodes() {
    val tokens = (1..100).map { PushActions.newToken() }
    assertTrue(tokens.all(PushActions::isToken))
    assertEquals(100, tokens.toSet().size)
    val codes = tokens.flatMap { t -> PushActions.SPECS.map { PushActions.requestCode(t, it) } }
    assertEquals(codes.size, codes.toSet().size)
    val t = tokens.first()
    assertNotEquals(PushActions.requestCode(t, PushActions.SPECS[0]), PushActions.requestCode(t, PushActions.SPECS[1]))
    assertEquals(PushActions.requestCode(t, PushActions.SPECS[0]), PushActions.requestCode(t, PushActions.SPECS[0]))
  }

  @Test
  fun aRefusedPressKeepsTheRecordAndAnAcceptedOneUsesItUpOnce() {
    val s = store()
    val record = PushActionRecord("pc", "s_42", approvalId, null, 1L, 2L, "chat:s_42")
    val token = s.save(record)
    // Looking, as a refused press does (another PC, an unreachable PC), keeps it for another try.
    assertEquals(record, s.peek(token))
    assertEquals(record, s.peek(token))
    assertEquals(record, s.consume(token))
    assertNull(s.consume(token))
    assertNull(s.peek(token))
  }

  @Test
  fun ofTwoConcurrentConsumesOnlyOneWins() {
    val dir = folder.newFolder()
    val sealer = MemorySealer()
    repeat(20) {
      val token = PushActionStore(dir, sealer).save(PushActionRecord("pc", "s_42", approvalId, null, 1L, 2L, "chat:s_42"))
      val results = java.util.concurrent.ConcurrentLinkedQueue<Boolean>()
      val threads = (1..4).map { Thread { results.add(PushActionStore(dir, sealer).consume(token) != null) } }
      threads.forEach(Thread::start)
      threads.forEach(Thread::join)
      assertEquals(1, results.count { it })
    }
  }

  @Test
  fun aTokenIsConsumedOnceAcrossRestarts() {
    val dir = folder.newFolder()
    val sealer = MemorySealer()
    val record = PushActionRecord(PushActions.offered(approval, "pc", emptySet(), 34)!!, 1795000000000L, "chat:s_42")
    assertEquals(1795000600000L, record.expiresAt)
    val token = PushActionStore(dir, sealer).save(record)
    // The ids are sealed in the store; the token names none of them.
    assertFalse(token.contains("s_42") || dir.listFiles()!!.any { String(it.readBytes(), Charsets.ISO_8859_1).contains("s_42") })
    // A new instance, as after a restart, still consumes it once.
    assertEquals(record, PushActionStore(dir, sealer).consume(token))
    assertNull(PushActionStore(dir, sealer).consume(token))
    assertTrue(dir.listFiles()!!.isEmpty())
  }

  @Test
  fun findsNothingForAMalformedUnknownOrForeignToken() {
    val s = store()
    for (bad in listOf("not-a-token", "../../shared_prefs/x", PushActions.newToken())) {
      assertNull(s.peek(bad))
      assertNull(s.consume(bad))
    }
    // A record sealed by another install (another key) doesn't open.
    val dir = folder.newFolder()
    val token = PushActionStore(dir, MemorySealer()).save(PushActionRecord("pc", "s_42", approvalId, null, 1L, 2L, "chat:s_42"))
    assertNull(PushActionStore(dir, MemorySealer()).peek(token))
    assertNull(PushActionStore(dir, MemorySealer()).consume(token))
  }

  @Test
  fun resolvedApprovalsLoseTheirRecords() {
    val s = store()
    val a = s.save(PushActionRecord("pc", "s_42", approvalId, null, 1L, 2L, "chat:s_42"))
    val b = s.save(PushActionRecord("pc", "s_7", "ap_7", null, 1L, 2L, "chat:s_7"))
    val removed = s.resolve(listOf(approvalId, "ap_unknown"))
    assertEquals(listOf(a), removed.map { it.first })
    assertEquals("chat:s_42", removed.single().second.tag)
    assertNull(s.peek(a))
    assertNotNull(s.consume(b))
  }

  @Test
  fun sweepsRecordsADayPastTheirExpiry() {
    val s = store()
    val token = s.save(PushActionRecord("pc", "s_42", approvalId, null, 0L, 1000L, "chat:s_42"))
    s.sweep(1000L + PushActionStore.KEEP_AFTER_EXPIRY_MS)
    assertNotNull(s.consume(token))
    val late = s.save(PushActionRecord("pc", "s_42", approvalId, null, 0L, 1000L, "chat:s_42"))
    s.sweep(1001L + PushActionStore.KEEP_AFTER_EXPIRY_MS)
    assertNull(s.peek(late))
  }

  @Test
  fun readsAnActionsIntentAndRefusesAForgedOrReplayedOne() {
    val token = PushActions.newToken()
    assertEquals(PushActionRequest("gaia.deny", token, locked = false), PushActionInbox.parse(PushActions.DENY, token, locked = false, fromHistory = false))
    assertEquals(mapOf("action" to "gaia.review", "token" to token, "locked" to true), PushActionInbox.parse(PushActions.REVIEW, token, locked = true, fromHistory = false)!!.toMap())
    assertNull(PushActionInbox.parse("android.intent.action.MAIN", token, locked = false, fromHistory = false))
    assertNull(PushActionInbox.parse(PushActions.REVIEW, token, locked = false, fromHistory = true))
    // An intent another app sends the exported activity carries no token, or one the store has never seen.
    assertNull(PushActionInbox.parse(PushActions.DENY, null, locked = false, fromHistory = false))
    assertNull(PushActionInbox.parse(PushActions.DENY, "s_42", locked = false, fromHistory = false))
    assertNull(store().peek(PushActionInbox.parse(PushActions.DENY, PushActions.newToken(), locked = false, fromHistory = false)!!.token))
  }

  @Test
  fun handsEachActionOverOnce() {
    val request = PushActionInbox.parse(PushActions.REVIEW, PushActions.newToken(), locked = false, fromHistory = false)!!
    var heard = 0
    PushActionInbox.listen { heard++ }
    PushActionInbox.put(request)
    PushActionInbox.listen(null)
    assertEquals(1, heard)
    assertEquals(request, PushActionInbox.take())
    assertNull(PushActionInbox.take())
  }

  @Test
  fun encodesBase64urlAsItDecodes() {
    for (n in 0..40) {
      val bytes = ByteArray(n).also(SecureRandom()::nextBytes)
      assertTrue(PushCrypto.base64url(PushCrypto.base64urlEncode(bytes)).contentEquals(bytes))
    }
    assertEquals("AAECAwQFBgcICQoLDA0ODw", PushCrypto.base64urlEncode(ByteArray(16) { it.toByte() }))
  }
}
