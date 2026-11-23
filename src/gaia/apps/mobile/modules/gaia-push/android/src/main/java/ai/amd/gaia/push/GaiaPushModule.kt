// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import android.content.pm.PackageManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Each paired PC's push handle, relay credentials and payload key, sealed under the Android Keystore; see PushVault. */
class GaiaPushModule : Module() {
  private val context get() = appContext.reactContext ?: throw CodedException("no_context", "The app isn't running.", null)

  private fun vault() = PushVault(context)

  private fun <T> guarded(block: () -> T): T = try {
    block()
  } catch (e: PushException) {
    throw CodedException(e.code, e.message, e)
  }

  override fun definition() = ModuleDefinition {
    Name("GaiaPush")

    // A build without push has no messaging service (plugins/withPush.js), and so no scheme for it.
    Constant("available") {
      val ctx = appContext.reactContext ?: return@Constant false
      ctx.packageManager.getApplicationInfo(ctx.packageName, PackageManager.GET_META_DATA).metaData?.getString("ai.amd.gaia.push.SCHEME") != null
    }

    AsyncFunction("save") { pcId: String, handle: String, secret: String, sendToken: String, key: String ->
      guarded { vault().save(PushRecord(pcId, handle, secret, sendToken, key)) }
    }

    AsyncFunction("load") { pcId: String ->
      guarded { vault().load(pcId)?.let { mapOf("handle" to it.handle, "secret" to it.secret, "sendToken" to it.sendToken, "key" to it.key) } }
    }

    AsyncFunction("pcIds") { guarded { vault().all().map { it.pcId } } }

    AsyncFunction("dropKey") { pcId: String -> guarded { vault().dropKey(pcId) } }

    AsyncFunction("remove") { pcId: String -> guarded { vault().remove(pcId) } }

    AsyncFunction("removeAll") { guarded { vault().removeAll() } }

    // Android words notifications from resources, which already follow the app's language.
    AsyncFunction("setLanguage") { _: String? -> }

    // The action buttons are labeled from those resources too, when each notification is posted.
    AsyncFunction("setApprovalActions") { _: String, _: String -> }

    Events("onApprovalAction")

    Function("takeApprovalAction") { take() }

    // What a pressed button answers, once: the record is deleted as it is read, and its notification removed.
    AsyncFunction("claimApproval") { token: String ->
      val record = pushActionStore(context).claim(token) ?: return@AsyncFunction null
      cancelApprovalNotification(context, record.tag, token)
      record.toMap()
    }

    OnStartObserving("onApprovalAction") {
      PushActionInbox.listen { take()?.let { sendEvent("onApprovalAction", it) } }
    }

    OnStopObserving("onApprovalAction") {
      PushActionInbox.listen(null)
    }
  }

  /**
   * The pressed Review or Deny, once. One pressed or delivered while the phone is locked comes back `locked`, and its
   * token is never handed over, so it stays unclaimed for a press after unlocking.
   */
  private fun take(): Map<String, Any?>? {
    val request = PushActionInbox.take() ?: return null
    val locked = request.locked || deviceLocked(context)
    return if (locked) mapOf("action" to request.answer, "token" to null, "locked" to true) else request.toMap()
  }
}
