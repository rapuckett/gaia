// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.quickactions

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/** Hands each shortcut intent to the inbox: the system launches a shortcut by recreating the task, so most arrive in onCreate. */
class GaiaQuickActionsPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(object : ReactActivityLifecycleListener {
      override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
        if (savedInstanceState == null) QuickActionInbox.receive(activity.intent)
      }

      override fun onNewIntent(intent: Intent): Boolean {
        QuickActionInbox.receive(intent)
        return false
      }
    })
}
