// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class PushCryptoTest {
  private fun vector(name: String) = JSONObject(javaClass.classLoader!!.getResource(name)!!.readText())

  private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }

  @Test
  fun opensParitysVector() {
    val v = vector("push-vector-parity.json")
    assertEquals(v.getString("aad_hex"), hex(PushCrypto.aad(v.getString("handle"))))
    val plain = PushCrypto.open(v.getString("ciphertext"), v.getString("nonce"), v.getString("key"), v.getString("handle"))
    assertEquals(v.getString("plaintext"), String(plain, Charsets.UTF_8))
  }

  @Test
  fun opensThePaddedVectorAndReadsSeqAs64Bits() {
    val v = vector("push-vector.json")
    val record = PushRecord("pc", v.getString("handle"), "s", "t", v.getString("key"))
    val opened = PushCrypto.open(v.getString("ciphertext"), v.getString("nonce"), listOf(record))
    assertNotNull(opened)
    assertEquals(v.getInt("padded_length"), opened!!.second.size)
    val payload = PushPayload.parse(opened.second)!!
    assertEquals(1795000000001L, payload.seq)
    assertEquals("/chat/s_42", payload.route)
  }

  @Test
  fun skipsAnotherHandleAndADroppedKey() {
    val v = vector("push-vector.json")
    val wrong = PushRecord("pc", "x", "s", "t", v.getString("key"))
    val dropped = PushRecord("pc2", v.getString("handle"), "s", "t", "")
    assertNull(PushCrypto.open(v.getString("ciphertext"), v.getString("nonce"), listOf(wrong, dropped)))
  }

  @Test
  fun wordsAnApprovalWithOnlyItsChat() {
    val strings = mapOf(
      "chatAlert.needsApproval" to "GAIA needs your approval",
      "mobileApp.push.body.approve" to "In “{chat}”. Tap to review.",
      "mobileApp.push.body.approveNoChat" to "Tap to review.",
    )
    fun payload(params: String) = PushPayload.parse("""{"v":1,"kind":"approval","params":$params,"route":"/","seq":5}    """.toByteArray())!!
    val i = { s: String -> "\u2068$s\u2069" }
    val say = { k: String -> strings[k] ?: k }
    // No tool, label or path: Approve can be pressed from the lock screen.
    assertEquals(
      "GAIA needs your approval" to "In “${i("Plan")}”. Tap to review.",
      PushText.compose(payload("""{"chat_title":"Plan","tool":"write_file","label":"writing /etc/hosts"}"""), say),
    )
    assertEquals("Tap to review.", PushText.compose(payload("""{"label":"doing it"}"""), say)!!.second)
  }
}
