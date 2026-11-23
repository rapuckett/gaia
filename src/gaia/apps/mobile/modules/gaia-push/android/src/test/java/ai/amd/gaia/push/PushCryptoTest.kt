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
  fun wordsAlertsWithOnlyTheChatAndThePhonesOwnToolLabel() {
    val strings = mapOf(
      "chatAlert.needsApproval" to "GAIA needs your approval",
      "chatAlert.question" to "GAIA has a question",
      "chatAlert.finished" to "GAIA finished",
      "chatAlert.failed" to "GAIA hit a problem",
      "mobileApp.push.body.inChat" to "In “{chat}”.",
      "mobileApp.push.body.approve" to "In “{chat}”. Tap to review.",
      "mobileApp.push.body.approveNoChat" to "Tap to review.",
      "mobileApp.push.body.answer" to "In “{chat}”. Tap to answer.",
      "mobileApp.push.body.read" to "In “{chat}”. Tap to read the answer.",
      "mobileApp.push.body.problem" to "In “{chat}”. Tap to see what happened.",
      "tool.write_file.active" to "Writing file",
    )
    fun payload(kind: String, params: String) = PushPayload.parse("""{"v":1,"kind":"$kind","params":$params,"route":"/","seq":5}    """.toByteArray())!!
    val i = { s: String -> "\u2068$s\u2069" }
    val say = { k: String -> strings[k] ?: k }
    val compose = { p: PushPayload -> PushText.compose(p, say, strings::get) }
    assertEquals(
      "GAIA needs your approval" to "In “${i("Plan")}”.\nWriting file",
      compose(payload("approval", """{"chat_title":"Plan","tool":"write_file","label":"writing /etc/hosts"}""")),
    )
    // No phone label for the tool: no tool line, and never the PC's label.
    assertEquals("In “${i("Plan")}”. Tap to review.", compose(payload("approval", """{"chat_title":"Plan","tool":"new_tool","label":"deleting ~/Mail"}"""))!!.second)
    assertEquals("Tap to review.", compose(payload("approval", """{"label":"doing it"}"""))!!.second)
    assertEquals(
      "GAIA has a question" to "In “${i("Plan")}”. Tap to answer.",
      compose(payload("approval", """{"chat_title":"Plan","ask":"question","summary":"Send ~/notes.txt to Bob?"}""")),
    )
    assertEquals("In “${i("Plan")}”. Tap to read the answer.", compose(payload("finished", """{"chat_title":"Plan","summary":"Wrote /etc/hosts"}"""))!!.second)
    assertEquals("In “${i("Plan")}”. Tap to see what happened.", compose(payload("failed", """{"chat_title":"Plan","summary":"Mail from bob@example.com"}"""))!!.second)
  }

  @Test
  fun readsTtlAndResolved() {
    fun payload(params: String) = PushPayload.parse("""{"v":1,"kind":"badge","params":$params,"route":"/","seq":5}""".toByteArray())!!
    assertEquals(600L, payload("""{"ttl_s":600}""").ttlS)
    assertNull(payload("""{"ttl_s":1.5}""").ttlS)
    assertNull(payload("""{"ttl_s":0}""").ttlS)
    assertNull(payload("""{"ttl_s":"600"}""").ttlS)
    assertEquals(listOf("ap_7"), payload("""{"resolved":["ap_7","bad id",5]}""").resolved)
  }

  @Test
  fun titlesAFinishedRunByItsOutcome() {
    val strings = mapOf(
      "chatAlert.finished" to "GAIA finished",
      "chatAlert.stopped" to "GAIA stopped",
      "chatAlert.ended" to "A chat stopped running",
    )
    fun title(params: String): String {
      val p = PushPayload.parse("""{"v":1,"kind":"finished","params":$params,"route":"/","seq":5}    """.toByteArray())!!
      return PushText.compose(p, { strings[it] ?: it }, strings::get)!!.first
    }
    assertEquals("GAIA stopped", title("""{"outcome":"stopped"}"""))
    assertEquals("A chat stopped running", title("""{"outcome":"ended"}"""))
    assertEquals("GAIA finished", title("{}"))
    assertEquals("GAIA finished", title("""{"outcome":"weird"}"""))
  }
}
