// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import org.json.JSONException
import org.json.JSONObject

/** The decrypted payload, `{v:1, kind, params, route, session_id?, approval_id?, badge, ts, seq}`, space-padded; its route rules match src/features/push/pushRoutes.ts. */
internal data class PushPayload(
  val kind: String,
  val chatTitle: String?,
  val summary: String?,
  val label: String?,
  val ask: String?,
  val route: String,
  val sessionId: String?,
  val badge: Int?,
  /** The PC's counter for this phone, only ever increasing. */
  val seq: Long,
  /** When the PC sent it, unix milliseconds; for display only. */
  val ts: Long?,
) {
  companion object {
    private val KINDS = setOf("approval", "finished", "failed", "needs_you", "badge")
    private const val ID = "[A-Za-z0-9_-]{1,128}"
    private val CHAT = Regex("^/chat/$ID$")
    private val APPROVAL = Regex("^/approvals/$ID$")
    private val SESSION = Regex("^$ID$")

    /** Null for anything that isn't a version-1 payload of a known kind. */
    fun parse(bytes: ByteArray): PushPayload? {
      // The PC pads the JSON with trailing spaces to a size bucket.
      val root = try {
        JSONObject(String(bytes, Charsets.UTF_8).trimEnd(' '))
      } catch (e: JSONException) {
        return null
      }
      if (root.optInt("v", -1) != PushCrypto.VERSION.toInt()) return null
      val kind = root.optString("kind")
      if (kind !in KINDS) return null
      val params = root.optJSONObject("params") ?: JSONObject()
      val sessionId = text(root, "session_id")
      val badge = if (root.has("badge")) root.optInt("badge", -1).takeIf { it in 0..9999 } else null
      val seq = whole(root, "seq") ?: return null
      return PushPayload(
        kind,
        text(params, "chat_title"),
        text(params, "summary"),
        text(params, "label"),
        text(params, "ask"),
        safeRoute(root.optString("route").ifEmpty { null }, sessionId),
        sessionId,
        badge,
        seq,
        whole(root, "ts"),
      )
    }

    /** A non-negative whole JSON number as a Long; null for anything else. */
    private fun whole(obj: JSONObject, name: String): Long? {
      val value = obj.opt(name)
      if (value !is Number || value is Double && value != Math.floor(value)) return null
      return value.toLong().takeIf { it >= 0 }
    }

    /** `/chat/<id>`, `/approvals/<id>` (opened as its chat) or `/`; anything else opens `/`. */
    fun safeRoute(route: String?, sessionId: String?): String = when {
      route == null -> "/"
      CHAT.matches(route) -> route
      APPROVAL.matches(route) && sessionId != null && SESSION.matches(sessionId) -> "/chat/$sessionId"
      else -> "/"
    }

    private fun text(obj: JSONObject, name: String): String? =
      if (obj.isNull(name)) null else obj.optString(name).trim().ifEmpty { null }
  }
}

/** The title and body a notification shows, worded through `say` (catalog key to text); null for a badge-only payload. */
internal object PushText {
  /** First-strong isolate: server text keeps its own direction inside either language's sentence. */
  fun isolate(text: String) = "⁨$text⁩"

  fun compose(p: PushPayload, say: (String) -> String): Pair<String, String>? {
    val title: String
    val tap: String
    when (p.kind) {
      "approval" -> {
        val question = p.ask == "question"
        title = say(if (question) "chatAlert.question" else "chatAlert.needsApproval")
        tap = if (question) "answer" else "approve"
      }
      "finished" -> { title = say("chatAlert.finished"); tap = "read" }
      "failed" -> { title = say("chatAlert.failed"); tap = "problem" }
      "needs_you" -> return say("mobileApp.push.title.needsYou") to (p.label?.let(::isolate) ?: say("mobileApp.push.body.needsYou"))
      else -> return null
    }
    val inChat = { key: String -> say(key).replace("{chat}", isolate(p.chatTitle ?: "")) }
    val body = when {
      p.chatTitle != null && p.summary != null -> "${inChat("mobileApp.push.body.inChat")}\n${isolate(p.summary)}"
      p.chatTitle != null -> inChat("mobileApp.push.body.$tap")
      p.summary != null -> isolate(p.summary)
      else -> say("mobileApp.push.body.${tap}NoChat")
    }
    return title to body
  }
}
