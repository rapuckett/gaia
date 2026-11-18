// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.applanguage

private val LANGUAGE_TAG = Regex("^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$")

/** The tags to give LocaleManager for a pick: one language, or none (null) to follow the phone. */
fun requestedTags(tag: String?): String {
  if (tag == null) return ""
  // LocaleList.forLanguageTags turns a malformed tag into an undefined locale instead of failing.
  require(LANGUAGE_TAG.matches(tag)) { "\"$tag\" is not a language tag such as \"ar\" or \"en\"." }
  return tag
}

/** The app's language from LocaleList.toLanguageTags(); null when it follows the phone. */
fun firstTag(tags: String): String? = tags.split(',').map { it.trim() }.firstOrNull { it.isNotEmpty() }
