// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.transport

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class PairingAnswerTest {
  @Test
  fun removesTheTokenAndKeepsTheRestOnEveryStatus() {
    for (answer in listOf(
      """{"token":"gaiad_FAKE","device_id":"d1","pc_name":"Desk"}""",
      """{"token":"gaiad_FAKE","detail":"Invitation expired"}""",
    )) {
      val kept = JSONObject(withoutToken(answer))
      assertFalse(kept.has("token"))
      val original = JSONObject(answer).apply { remove("token") }
      assertEquals(original.keySet(), kept.keySet())
      for (key in original.keySet()) assertEquals(original.get(key), kept.get(key))
    }
  }

  @Test
  fun dropsAnAnswerThatIsNotAJsonObject() {
    for (answer in listOf("<html>gaiad_FAKE</html>", """["gaiad_FAKE"]""", "")) {
      assertEquals(answer, "", withoutToken(answer))
    }
  }
}
