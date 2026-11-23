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
  /** The tool id an approval is for, when the PC sends it; only `[a-z0-9_]` ids are kept, to look up its label. */
  val tool: String?,
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
    private val TOOL = Regex("^[a-z0-9_]{1,64}$")

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
        clean(params, "chat_title", 80),
        clean(params, "summary", 300),
        clean(params, "label", 300),
        text(params, "tool")?.takeIf { TOOL.matches(it) },
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

    /**
     * The PC's text made safe to show: control and bidi-override characters dropped, whitespace and line breaks
     * collapsed to one space, and at most `max` characters (an ellipsis marks a cut). Null when nothing is left.
     */
    fun clean(obj: JSONObject, name: String, max: Int): String? {
      val raw = (if (obj.isNull(name)) null else obj.opt(name)) as? String ?: return null
      val out = StringBuilder()
      var pendingSpace = false
      var i = 0
      while (i < raw.length) {
        val cp = raw.codePointAt(i)
        i += Character.charCount(cp)
        if (cp in 0x202A..0x202E || cp in 0x2066..0x2069) continue
        if (cp < 0x20 || cp in 0x7F..0x9F || Character.isWhitespace(cp) || Character.isSpaceChar(cp)) {
          pendingSpace = out.isNotEmpty()
          continue
        }
        if (pendingSpace) out.append(' ')
        pendingSpace = false
        out.appendCodePoint(cp)
      }
      if (out.isEmpty()) return null
      val count = out.codePointCount(0, out.length)
      if (count <= max) return out.toString()
      return out.substring(0, out.offsetByCodePoints(0, max - 1)) + "…"
    }

    private fun text(obj: JSONObject, name: String): String? =
      if (obj.isNull(name)) null else obj.optString(name).trim().ifEmpty { null }
  }
}

/**
 * The title and body a notification shows, worded through `say` (catalog key to text) and `find` (the same, or null
 * when the strings lack the key); null for a badge-only payload.
 */
internal object PushText {
  /** First-strong isolate: server text keeps its own direction inside either language's sentence. */
  fun isolate(text: String) = "\u2068$text\u2069"

  fun compose(p: PushPayload, say: (String) -> String, find: (String) -> String?): Pair<String, String>? {
    val title: String
    val tap: String
    // The detail line: our own words for the tool, else the PC's words as sent (isolated).
    val detail: String?
    when {
      p.kind == "approval" && p.ask == "question" -> {
        title = say("chatAlert.question"); tap = "answer"; detail = p.summary?.let(::isolate)
      }
      p.kind == "approval" -> {
        title = say("chatAlert.needsApproval"); tap = "approve"
        detail = p.tool?.let { find("tool.$it.active") } ?: p.label?.let(::isolate)
      }
      p.kind == "finished" -> { title = say("chatAlert.finished"); tap = "read"; detail = p.summary?.let(::isolate) }
      p.kind == "failed" -> { title = say("chatAlert.failed"); tap = "problem"; detail = p.summary?.let(::isolate) }
      p.kind == "needs_you" -> { title = say("mobileApp.push.title.needsYou"); tap = "needsYou"; detail = p.label?.let(::isolate) }
      else -> return null
    }
    val chat = p.chatTitle ?: return title to (detail ?: say("mobileApp.push.body.${tap}NoChat"))
    val inChat = { key: String -> say(key).replace("{chat}", isolate(chat)) }
    return title to if (detail != null) "${inChat("mobileApp.push.body.inChat")}\n$detail" else inChat("mobileApp.push.body.$tap")
  }
}
