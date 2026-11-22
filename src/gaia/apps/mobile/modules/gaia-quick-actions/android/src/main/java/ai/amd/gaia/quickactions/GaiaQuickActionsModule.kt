// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.quickactions

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class QuickActionItem : Record {
  @Field val id: String = ""
  @Field val title: String = ""
}

/** The dynamic shortcuts on GAIA's launcher icon. Every one shows the compose glyph (GAIA has one: New chat). */
class GaiaQuickActionsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("GaiaQuickActions")

    Events("onAction")

    Function("takePending") { QuickActionInbox.take() }

    AsyncFunction("setItems") { items: List<QuickActionItem> ->
      val launcher = context.packageManager.getLaunchIntentForPackage(context.packageName)?.component
        ?: throw CodedException("no_launcher_activity", "${context.packageName} has no launcher activity for its shortcuts to open.", null)
      val icon = IconCompat.createWithResource(context, R.drawable.gaia_quick_action_compose)
      val shortcuts = items.map { item ->
        val intent = Intent(QuickActionInbox.ACTION).setComponent(launcher).putExtra(QuickActionInbox.EXTRA_ID, item.id)
        ShortcutInfoCompat.Builder(context, item.id)
          .setShortLabel(item.title)
          .setLongLabel(item.title)
          .setIcon(icon)
          .setIntent(intent)
          .build()
      }
      if (!ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)) {
        throw CodedException("rate_limited", "Android refused to update GAIA's app shortcuts because they changed too often.", null)
      }
    }

    OnStartObserving("onAction") {
      QuickActionInbox.listen {
        QuickActionInbox.take()?.let { sendEvent("onAction", mapOf("id" to it)) }
      }
    }

    OnStopObserving("onAction") {
      QuickActionInbox.listen(null)
    }
  }
}
