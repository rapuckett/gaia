// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import android.app.Activity
import android.app.Application
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/** Hands an approval notification's Review or Deny to PushActionInbox, whether it started the app or resumed it. */
class GaiaPushPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        app = application
        application.registerActivityLifecycleCallbacks(FreshLaunches)
      }
    })

  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(object : ReactActivityLifecycleListener {
      override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
        // Before Android 10 there is no pre-create hook; those phones never get actions, but a stray intent is still cleared.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) receive(activity.intent)
      }

      override fun onNewIntent(intent: Intent): Boolean {
        receive(intent)
        return false
      }
    })
}

private var app: Context? = null

/** Whether the phone is locked now. Unknown counts as locked, so nothing is answered from a locked phone. */
internal fun deviceLocked(context: Context?): Boolean =
  context?.getSystemService(KeyguardManager::class.java)?.isDeviceLocked ?: true

/** Sees the real saved state, so an activity restored after its process died doesn't answer the approval again. */
private object FreshLaunches : Application.ActivityLifecycleCallbacks {
  override fun onActivityPreCreated(activity: Activity, savedInstanceState: Bundle?) {
    if (savedInstanceState == null) receive(activity.intent)
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
  override fun onActivityStarted(activity: Activity) {}
  override fun onActivityResumed(activity: Activity) {}
  override fun onActivityPaused(activity: Activity) {}
  override fun onActivityStopped(activity: Activity) {}
  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
  override fun onActivityDestroyed(activity: Activity) {}
}

/** Takes the token out of the intent once, so a recreated activity can't replay it, and notes whether the phone was locked. */
private fun receive(intent: Intent?) {
  if (intent == null || PushActions.SPECS.none { it.intentAction == intent.action }) return
  val fromHistory = (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
  val request = PushActionInbox.parse(intent.action, intent.getStringExtra(PushActions.EXTRA_TOKEN), deviceLocked(app), fromHistory)
  intent.action = Intent.ACTION_MAIN
  intent.removeExtra(PushActions.EXTRA_TOKEN)
  if (request != null) PushActionInbox.put(request)
}
