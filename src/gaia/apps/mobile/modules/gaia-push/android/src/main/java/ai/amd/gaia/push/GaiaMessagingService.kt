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
 * Takes the relay's data-only messages: opens each with the paired PCs' keys and posts the chat's own notification,
 * worded from the generated gaia_push_* strings (which follow the app's language). One it can't open shows the generic alert.
 * The app re-sends its token to the relay on every start, so a new token needs nothing here.
 */
class GaiaMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val sealed = message.data["c"] ?: return
    val nonce = message.data["n"] ?: return
    val vault = PushVault(this)
    val opened = try {
      PushCrypto.open(sealed, nonce, vault.all())
    } catch (e: PushException) {
      Log.e(TAG, "Couldn't read this phone's push keys (${e.code}); showing the generic alert.")
      null
    }
    val payload = opened?.let { PushPayload.parse(it.second) }
    if (opened != null && payload != null) {
      val fresh = try {
        vault.accept(opened.first, payload.seq)
      } catch (e: PushException) {
        Log.e(TAG, "Couldn't record a push as seen (${e.code}); not showing it.")
        false
      }
      // A replayed push shows nothing.
      if (!fresh) {
        Log.w(TAG, "Dropped a push whose seq isn't newer than the last one from its PC.")
        return
      }
    }
    if (payload == null) {
      Log.w(TAG, "A push didn't open with any paired PC's key; showing the generic alert.")
      post(NEEDS_YOU, GENERIC_TAG, say("mobileApp.push.generic.title"), say("mobileApp.push.generic.body"), "/", null)
      return
    }
    if (payload.kind == "badge") {
      // The launcher's dot follows the notifications on show; nothing left to count means none should stay.
      if (payload.badge == 0) NotificationManagerCompat.from(this).cancelAll()
      return
    }
    val text = PushText.compose(payload, ::say) ?: return
    val channel = if (payload.kind == "approval" || payload.kind == "needs_you") NEEDS_YOU else CHATS
    post(channel, payload.sessionId?.let { "chat:$it" } ?: GENERIC_TAG, text.first, text.second, payload.route, payload.badge)
  }

  private fun post(channel: String, tag: String, title: String, body: String, route: String, badge: Int?) {
    val manager = NotificationManagerCompat.from(this)
    if (!manager.areNotificationsEnabled()) return
    ensureChannels()
    val builder = NotificationCompat.Builder(this, channel)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setGroup(tag)
      .setContentIntent(openIntent(route, tag))
      .setPriority(if (channel == NEEDS_YOU) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
    if (badge != null) builder.setNumber(badge)
    try {
      // One notification per chat: a newer event for it replaces the older.
      manager.notify(tag, NOTIFICATION_ID, builder.build())
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

  private fun ensureChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel(NEEDS_YOU, say("mobileApp.push.channel.needsYou"), NotificationManager.IMPORTANCE_HIGH))
    manager.createNotificationChannel(NotificationChannel(CHATS, say("mobileApp.push.channel.chats"), NotificationManager.IMPORTANCE_DEFAULT))
  }

  /** A catalog key's text from the strings plugins/push/withPushAndroid.js generates; a missing one is a build error made loud. */
  private fun say(key: String): String {
    val name = "gaia_push_" + key.replace('.', '_')
    val id = resources.getIdentifier(name, "string", packageName)
    if (id == 0) throw IllegalStateException("The string $name is missing; plugins/push/withPushAndroid.js generates it from the webui catalogs.")
    return getString(id)
  }

  private companion object {
    const val TAG = "GaiaPush"
    const val SCHEME_KEY = "ai.amd.gaia.push.SCHEME"
    const val NEEDS_YOU = "gaia.needs_you"
    const val CHATS = "gaia.chats"
    const val GENERIC_TAG = "gaia"
    const val NOTIFICATION_ID = 1
  }
}
