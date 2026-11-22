// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.quickactions

import android.content.Intent

/** The app shortcut the person chose that JavaScript hasn't taken yet. Each one is taken exactly once. */
object QuickActionInbox {
  const val ACTION = "ai.amd.gaia.quickactions.OPEN"
  const val EXTRA_ID = "ai.amd.gaia.quickactions.ID"

  private var pending: String? = null
  private var listener: (() -> Unit)? = null

  /** Records a shortcut's intent once: a recreated activity or a launch from Recents would otherwise replay it. */
  fun receive(intent: Intent?) {
    if (intent?.action != ACTION) return
    val id = intent.getStringExtra(EXTRA_ID)
    intent.action = Intent.ACTION_MAIN
    intent.removeExtra(EXTRA_ID)
    if (id == null || (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return
    synchronized(this) { pending = id }
    synchronized(this) { listener }?.invoke()
  }

  @Synchronized
  fun take(): String? {
    val id = pending
    pending = null
    return id
  }

  @Synchronized
  fun listen(body: (() -> Unit)?) {
    listener = body
  }
}
