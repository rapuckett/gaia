// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Takes the relay's data-only messages and posts the chat's own notification, worded from the generated gaia_push_*
 * strings (which follow the app's language). A push that doesn't open, or is a replay, shows nothing.
 * The app re-sends its token to the relay on every start, so a new token needs nothing here.
 */
class GaiaMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val sealed = message.data["c"] ?: return
    val nonce = message.data["n"] ?: return
    val vault = PushVault(this)
    val action = try {
      PushInbox.decide(sealed, nonce, vault.all(), vault::accept, ::say, openOnlyTools(), Build.VERSION.SDK_INT)
    } catch (e: PushException) {
      PushAction.Dropped("this phone's push keys can't be read (${e.code})")
    }
    when (action) {
      is PushAction.Dropped -> Log.w(TAG, "Showing nothing for a push: ${action.reason}.")
      PushAction.ClearAll -> NotificationManagerCompat.from(this).cancelAll()
      is PushAction.Post -> post(action)
    }
  }

  private fun post(action: PushAction.Post) {
    val (channel, tag, title, body, route, badge, approval) = action
    val manager = NotificationManagerCompat.from(this)
    if (!manager.areNotificationsEnabled()) return
    ensureChannels()
    val builder = NotificationCompat.Builder(this, channel)
      .setSmallIcon(resource("ic_stat_gaia", "drawable"))
      .setColor(getColor(resource("gaia_push_accent", "color")))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setGroup(tag)
      .setContentIntent(openIntent(route, tag))
      .setPriority(if (channel == PushInbox.NEEDS_YOU) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
    if (badge != null) builder.setNumber(badge)
    if (approval != null) {
      val receivedAt = System.currentTimeMillis()
      for (spec in PushActions.SPECS) {
        builder.addAction(
          NotificationCompat.Action.Builder(0, say(spec.labelKey), actionIntent(spec, approval, receivedAt, tag))
            .setAuthenticationRequired(spec.authenticationRequired)
            .setShowsUserInterface(true)
            .build(),
        )
      }
    }
    try {
      // One notification per chat: a newer event for it replaces the older.
      manager.notify(tag, PushInbox.NOTIFICATION_ID, builder.build())
    } catch (e: SecurityException) {
      Log.e(TAG, "Android refused the notification permission between the check and the post.")
    }
  }

  private fun openIntent(route: String, tag: String): PendingIntent {
    val scheme = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA).metaData?.getString(SCHEME_KEY)
      ?: throw IllegalStateException("The manifest has no $SCHEME_KEY; plugins/push/withPushAndroid.js writes it in every build with push.")
    val launch = packageManager.getLaunchIntentForPackage(packageName)
      ?: throw IllegalStateException("This app has no launcher activity to open a notification in.")
    val uri = Uri.Builder().scheme(scheme).authority("push").appendQueryParameter("route", route).build()
    val intent = launch.setAction(Intent.ACTION_VIEW).setData(uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(this, tag.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /**
   * Opens GAIA with the answer in the intent's extras (never its data URI, which Android logs), for PushActionInbox.
   * PushActions.offered only lets this run on Android 12 and later, where the action waits for the phone to be unlocked.
   */
  private fun actionIntent(spec: PushActionSpec, approval: PushApproval, receivedAt: Long, tag: String): PendingIntent {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
      ?: throw IllegalStateException("This app has no launcher activity to open a notification in.")
    val intent = launch.setAction(spec.intentAction)
      .putExtra(PushActions.EXTRA_PC_ID, approval.pcId)
      .putExtra(PushActions.EXTRA_SESSION_ID, approval.sessionId)
      .putExtra(PushActions.EXTRA_APPROVAL_ID, approval.approvalId)
      .putExtra(PushActions.EXTRA_RECEIVED_AT, receivedAt)
      .putExtra(PushActions.EXTRA_TAG, tag)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    if (approval.tool != null) intent.putExtra(PushActions.EXTRA_TOOL, approval.tool)
    return PendingIntent.getActivity(this, "$tag|${spec.intentAction}".hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /** The tools whose approvals get only Open; plugins/push/withPushAndroid.js writes the list in every build with push. */
  private fun openOnlyTools(): Set<String> = resources.getStringArray(resource(PushActions.OPEN_ONLY_RESOURCE, "array")).toSet()

  private fun ensureChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel(PushInbox.NEEDS_YOU, say("mobileApp.push.channel.needsYou"), NotificationManager.IMPORTANCE_HIGH))
    manager.createNotificationChannel(NotificationChannel(PushInbox.CHATS, say("mobileApp.push.channel.chats"), NotificationManager.IMPORTANCE_DEFAULT))
  }

  /** A resource plugins/push/withPushAndroid.js writes in every build with push; a missing one is a build error made loud. */
  private fun resource(name: String, type: String): Int {
    val id = resources.getIdentifier(name, type, packageName)
    if (id == 0) throw IllegalStateException("The $type $name is missing; plugins/push/withPushAndroid.js writes it in every build with push.")
    return id
  }

  /** A catalog key's text from the strings plugins/push/withPushAndroid.js generates; a missing one is a build error made loud. */
  private fun say(key: String): String {
    val id = resources.getIdentifier("gaia_push_" + key.replace('.', '_'), "string", packageName)
    if (id == 0) throw IllegalStateException("The string for $key is missing; plugins/push/withPushAndroid.js generates it from the webui catalogs.")
    return getString(id)
  }

  private companion object {
    const val TAG = "GaiaPush"
    const val SCHEME_KEY = "ai.amd.gaia.push.SCHEME"
  }
}
