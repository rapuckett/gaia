// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushInboxTest {
  private val v = JSONObject(javaClass.classLoader!!.getResource("push-vector.json")!!.readText())
  private val strings = mapOf(
    "chatAlert.needsApproval" to "GAIA needs your approval",
    "mobileApp.push.body.approve" to "In “{chat}”. Tap to review.",
  )
  private val say = { k: String -> strings[k] ?: k }

  private fun decide(records: List<PushRecord>, sdk: Int = 34, openOnly: Set<String> = emptySet(), accept: (PushRecord, Long) -> Boolean = { _, _ -> true }) =
    PushInbox.decide(v.getString("ciphertext"), v.getString("nonce"), records, accept, say, strings::get, openOnly, sdk)

  @Test
  fun postsNothingWhenNoKeyOpensIt() {
    val wrongKey = PushRecord("pc", v.getString("handle"), "s", "t", "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8")
    val wrongHandle = PushRecord("pc", "AAECAwQFBgcICQoLDA0ODw", "s", "t", v.getString("key"))
    assertTrue(decide(listOf(wrongKey, wrongHandle)) is PushAction.Dropped)
    assertTrue(decide(emptyList()) is PushAction.Dropped)
  }

  @Test
  fun postsNothingForAReplay() {
    val record = PushRecord("pc", v.getString("handle"), "s", "t", v.getString("key"))
    assertTrue(decide(listOf(record), accept = { _, _ -> false }) is PushAction.Dropped)
  }

  @Test
  fun postsTheChatsOwnNotificationWhenItOpens() {
    val record = PushRecord("pc", v.getString("handle"), "s", "t", v.getString("key"))
    var seen: Long? = null
    val action = decide(listOf(record), accept = { _, seq -> seen = seq; true })
    assertEquals(1795000000001L, seen)
    // The vector's approval has no ttl_s, so it offers no actions: the phone never assumes an expiry.
    assertEquals(
      PushAction.Post(PushInbox.NEEDS_YOU, "chat:s_42", "GAIA needs your approval", "In “\u2068Weekly report\u2069”. Tap to review.", "/chat/s_42", 2, null),
      action,
    )
  }

  @Test
  fun cleansThePcsText() {
    val params = JSONObject()
      .put("chat_title", "  Plan\u202E\u0007 for\n\tQ3 ")
      .put("summary", "x".repeat(400))
      .put("label", "\u2066\u2069")
    assertEquals("Plan for Q3", PushPayload.clean(params, "chat_title", 80))
    assertEquals("x".repeat(299) + "…", PushPayload.clean(params, "summary", 300))
    assertNull(PushPayload.clean(params, "label", 300))
  }
}
