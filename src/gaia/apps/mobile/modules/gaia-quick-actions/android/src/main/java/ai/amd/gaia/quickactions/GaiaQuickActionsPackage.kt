// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.quickactions

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/** Hands each shortcut intent to the inbox: the system launches a shortcut by recreating the task, so most arrive at creation. */
class GaiaQuickActionsPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        application.registerActivityLifecycleCallbacks(FreshLaunches)
      }
    })

  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(object : ReactActivityLifecycleListener {
      override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
        // Before Android 10 there is no pre-create hook, and MainActivity hands Expo a null state, so a restore looks fresh.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) QuickActionInbox.receive(activity.intent)
      }

      override fun onNewIntent(intent: Intent): Boolean {
        QuickActionInbox.receive(intent)
        return false
      }
    })
}

/** Sees the real saved state, so an activity restored from Recents after its process died doesn't replay the shortcut. */
private object FreshLaunches : Application.ActivityLifecycleCallbacks {
  override fun onActivityPreCreated(activity: Activity, savedInstanceState: Bundle?) {
    if (savedInstanceState == null) QuickActionInbox.receive(activity.intent)
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
  override fun onActivityStarted(activity: Activity) {}
  override fun onActivityResumed(activity: Activity) {}
  override fun onActivityPaused(activity: Activity) {}
  override fun onActivityStopped(activity: Activity) {}
  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
  override fun onActivityDestroyed(activity: Activity) {}
}
