// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.oauthloopback

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

private const val NOT_STARTED = "No sign-in is waiting on this phone. Start it again."

/** Catches one sign-in redirect on this phone's loopback, so a browser sign-in can finish on the paired PC. */
class GaiaOAuthLoopbackModule : Module() {
  private val lock = Any()
  private var current: LoopbackListener? = null

  override fun definition() = ModuleDefinition {
    Name("GaiaOAuthLoopback")

    // A new start ends the one before it.
    AsyncFunction("start") { returnUrl: String, promise: Promise ->
      if (!isReturnUrl(returnUrl)) {
        promise.reject(CodedException("invalid_return_url", "The sign-in return address must be this app's own link.", null))
        return@AsyncFunction
      }
      val listener = LoopbackListener(returnUrl)
      replace(listener)?.cancel()
      try {
        promise.resolve(mapOf("port" to listener.start()))
      } catch (e: LoopbackCancelledException) {
        promise.reject(CodedException("cancelled", e.message, e))
      } catch (e: IOException) {
        clear(listener)
        promise.reject(CodedException("listen_failed", "GAIA couldn't get ready for the sign-in on this phone (${e.message}). Try again.", e))
      }
    }

    AsyncFunction("waitForRedirect") { expectedState: String, timeoutMs: Double, promise: Promise ->
      val listener = synchronized(lock) { current }
      val waiting = listener?.wait(expectedState, timeoutMs.toLong().coerceAtLeast(0)) { outcome -> promise.resolve(outcome.toMap()) } ?: false
      if (!waiting) promise.reject(CodedException("not_started", NOT_STARTED, null))
    }

    Function("cancel") {
      replace(null)?.cancel()
    }

    OnDestroy {
      replace(null)?.cancel()
    }
  }

  private fun replace(next: LoopbackListener?): LoopbackListener? = synchronized(lock) {
    current.also { current = next }
  }

  // Only if it is still the current one: a newer start may have replaced it meanwhile.
  private fun clear(listener: LoopbackListener) = synchronized(lock) {
    if (current === listener) current = null
  }
}
