// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushActionsTest {
  private val approvalId = "0b6f2c1e-8d4a-4f7e-9a3b-2c5d6e7f8a9b"

  private fun payload(params: String, ids: String = """"session_id":"s_42","approval_id":"$approvalId",""") =
    PushPayload.parse("""{"v":1,"kind":"approval","params":$params,$ids"route":"/chat/s_42","seq":5}""".toByteArray())!!

  private val approval = payload("""{"ask":"approval","tool":"write_file"}""")

  @Test
  fun offersApproveAndDenyOnlyWhereUnlockIsEnforced() {
    assertEquals(PushApproval("pc", "s_42", approvalId, "write_file"), PushActions.offered(approval, "pc", emptySet(), 31))
    assertNull(PushActions.offered(approval, "pc", emptySet(), 30))
    assertNull(PushActions.offered(approval, "pc", emptySet(), 24))
  }

  @Test
  fun bothActionsNeedTheUnlockAndNoneAllowsAlways() {
    assertEquals(listOf("gaia.approve", "gaia.deny"), PushActions.SPECS.map { it.answer })
    assertEquals(listOf("notifications.approve", "notifications.deny"), PushActions.SPECS.map { it.labelKey })
    assertTrue(PushActions.SPECS.all { it.authenticationRequired })
    assertFalse(PushActions.SPECS.any { "always" in it.answer.lowercase() || "always" in it.intentAction.lowercase() || "always" in it.labelKey.lowercase() })
  }

  @Test
  fun offersNothingForAQuestionOrAnIncompleteApproval() {
    assertNull(PushActions.offered(payload("""{"ask":"question","summary":"Which file?"}"""), "pc", emptySet(), 34))
    assertNull(PushActions.offered(payload("""{"tool":"write_file"}"""), "pc", emptySet(), 34))
    assertNull(PushActions.offered(payload("""{"ask":"approval"}""", """"session_id":"s_42","""), "pc", emptySet(), 34))
    assertNull(PushActions.offered(payload("""{"ask":"approval"}""", """"approval_id":"a1","""), "pc", emptySet(), 34))
    assertNull(PushActions.offered(payload("""{"ask":"approval"}""", """"session_id":"s 42","approval_id":"a1","""), "pc", emptySet(), 34))
  }

  @Test
  fun offersNothingForAnOpenOnlyTool() {
    assertNull(PushActions.offered(approval, "pc", setOf("write_file"), 34))
    assertNotNull(PushActions.offered(approval, "pc", setOf("send_email"), 34))
    // With a list, an approval that doesn't name its tool can't be checked against it.
    assertNull(PushActions.offered(payload("""{"ask":"approval"}"""), "pc", setOf("send_email"), 34))
    assertNotNull(PushActions.offered(payload("""{"ask":"approval"}"""), "pc", emptySet(), 34))
  }

  private fun extras(vararg pairs: Pair<String, String>): (String) -> String? {
    val map = mapOf(*pairs)
    return { map[it] }
  }

  private val complete = extras(
    PushActions.EXTRA_PC_ID to "pc",
    PushActions.EXTRA_SESSION_ID to "s_42",
    PushActions.EXTRA_APPROVAL_ID to approvalId,
    PushActions.EXTRA_TAG to "chat:s_42",
  )

  @Test
  fun readsAnActionsIntentAndRefusesAnyOther() {
    val request = PushActionInbox.parse(PushActions.DENY, complete, 1795000000000L, fromHistory = false)
    assertEquals(PushActionRequest("gaia.deny", PushApproval("pc", "s_42", approvalId, null), 1795000000000L, "chat:s_42"), request)
    assertEquals("gaia.deny", request!!.toMap()["action"])
    assertNull(PushActionInbox.parse("android.intent.action.MAIN", complete, 1795000000000L, fromHistory = false))
    assertNull(PushActionInbox.parse(PushActions.APPROVE, complete, 1795000000000L, fromHistory = true))
    assertNull(PushActionInbox.parse(PushActions.APPROVE, complete, 0L, fromHistory = false))
    assertNull(PushActionInbox.parse(PushActions.APPROVE, extras(PushActions.EXTRA_PC_ID to "pc", PushActions.EXTRA_SESSION_ID to "s_42", PushActions.EXTRA_TAG to "t"), 1L, false))
  }

  @Test
  fun handsEachActionOverOnce() {
    val request = PushActionInbox.parse(PushActions.APPROVE, complete, 1795000000000L, fromHistory = false)!!
    var heard = 0
    PushActionInbox.listen { heard++ }
    PushActionInbox.put(request)
    PushActionInbox.listen(null)
    assertEquals(1, heard)
    assertEquals(request, PushActionInbox.take())
    assertNull(PushActionInbox.take())
  }
}
