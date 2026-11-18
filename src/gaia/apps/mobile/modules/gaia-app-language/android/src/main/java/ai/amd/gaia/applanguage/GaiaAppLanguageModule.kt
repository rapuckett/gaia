// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.applanguage

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The language GAIA itself uses, as Android 13+ shows it in system Settings › Apps › GAIA › Language.
 * Never the phone's language.
 */
class GaiaAppLanguageModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("GaiaAppLanguage")

    // Android 13 added the per-app language; below it the app keeps its own pick.
    Constant("supported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU }

    Function("get") { current() }

    Function("set") { tag: String? ->
      val tags = try {
        requestedTags(tag)
      } catch (e: IllegalArgumentException) {
        throw CodedException("invalid_tag", e.message, e)
      }
      apply(tags)
    }
  }

  private fun current(): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) throw unsupported()
    return firstTag(context.getSystemService(LocaleManager::class.java).applicationLocales.toLanguageTags())
  }

  private fun apply(tags: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) throw unsupported()
    context.getSystemService(LocaleManager::class.java).applicationLocales = LocaleList.forLanguageTags(tags)
  }

  private fun unsupported() =
    CodedException("unsupported", "Android ${Build.VERSION.RELEASE} has no per-app language; it needs Android 13 or later.", null)
}
