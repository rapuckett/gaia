// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.applanguage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class AppLocalesTest {
  @Test
  fun aPickIsOneTagAndFollowingThePhoneIsNone() {
    assertEquals("ar", requestedTags("ar"))
    assertEquals("en-US", requestedTags("en-US"))
    assertEquals("", requestedTags(null))
  }

  @Test
  fun refusesWhatIsNotALanguageTag() {
    for (bad in listOf("", " ", "ar,en", "a", "ar_EG", "ar-", "../ar")) {
      try {
        requestedTags(bad)
        fail("accepted \"$bad\"")
      } catch (e: IllegalArgumentException) {
        // expected
      }
    }
  }

  @Test
  fun readsTheFirstLanguageOrNone() {
    assertEquals("ar", firstTag("ar"))
    assertEquals("ar-EG", firstTag("ar-EG,en-US"))
    assertNull(firstTag(""))
  }
}
