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

    AsyncFunction("remove") { pcId: String -> guarded { vault().remove(pcId) } }

    AsyncFunction("removeAll") { guarded { vault().removeAll() } }

    // Android words notifications from resources, which already follow the app's language.
    AsyncFunction("setLanguage") { _: String? -> }
  }
}
