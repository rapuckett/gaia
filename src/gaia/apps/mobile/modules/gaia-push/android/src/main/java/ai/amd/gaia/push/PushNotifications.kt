// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import android.app.NotificationManager
import android.content.Context
import java.io.File

/** The approvals' action records on this phone, sealed under the Keystore. */
internal fun pushActionStore(context: Context) = PushActionStore(File(context.noBackupFilesDir, PushActionStore.DIR), PushKeystoreSealer)

/** Removes a chat's notification only while it is still the one these buttons were on: a newer one for the chat stays. */
internal fun cancelApprovalNotification(context: Context, tag: String, token: String) {
  val manager = context.getSystemService(NotificationManager::class.java) ?: return
  val shown = manager.activeNotifications.any {
    it.tag == tag && it.id == PushInbox.NOTIFICATION_ID && it.notification.extras.getString(PushActions.EXTRA_TOKEN) == token
  }
  if (shown) manager.cancel(tag, PushInbox.NOTIFICATION_ID)
}
