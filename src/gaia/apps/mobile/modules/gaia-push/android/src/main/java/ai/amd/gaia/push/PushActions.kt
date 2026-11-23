// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

/** What an approval's Approve or Deny answers. Kept in the action's intent extras, never shown on screen or logged. */
internal data class PushApproval(val pcId: String, val sessionId: String, val approvalId: String, val tool: String?)

/** One button on an approval's notification: the intent action it sends, the answer JavaScript gets, and its label's catalog key. */
internal data class PushActionSpec(val intentAction: String, val answer: String, val labelKey: String, val authenticationRequired: Boolean)

/**
 * Approve and Deny on a tool approval's notification; the answers match src/features/push/approvalActions.ts. Both open
 * GAIA, which sends the answer through its paired, pinned connection. No action is "always allow".
 */
internal object PushActions {
  const val APPROVE = "ai.amd.gaia.push.APPROVE"
  const val DENY = "ai.amd.gaia.push.DENY"
  const val EXTRA_PC_ID = "ai.amd.gaia.push.PC_ID"
  const val EXTRA_SESSION_ID = "ai.amd.gaia.push.SESSION_ID"
  const val EXTRA_APPROVAL_ID = "ai.amd.gaia.push.APPROVAL_ID"
  const val EXTRA_TOOL = "ai.amd.gaia.push.TOOL"
  const val EXTRA_RECEIVED_AT = "ai.amd.gaia.push.RECEIVED_AT"
  const val EXTRA_TAG = "ai.amd.gaia.push.TAG"

  /** The string-array of tools that get only Open (plugins/push/withPushAndroid.js, from modules/gaia-push/openOnlyTools.json). */
  const val OPEN_ONLY_RESOURCE = "gaia_push_open_only_tools"

  /** Android 12 (API 31) is the first that makes an action wait for the phone to be unlocked. */
  const val UNLOCK_ENFORCED_FROM_SDK = 31

  val SPECS = listOf(
    PushActionSpec(APPROVE, "gaia.approve", "notifications.approve", authenticationRequired = true),
    PushActionSpec(DENY, "gaia.deny", "notifications.deny", authenticationRequired = true),
  )

  private val ID = Regex("^[A-Za-z0-9_-]{1,128}$")

  fun isId(text: String?) = text != null && ID.matches(text)

  /**
   * The approval a payload's notification may offer Approve and Deny for: a tool approval (never a question) naming its
   * chat and its approval, for a tool that isn't open-only, on a phone that enforces unlock. With a non-empty list, an
   * approval that doesn't name its tool gets none. Null when it offers only Open.
   */
  fun offered(p: PushPayload, pcId: String, openOnly: Set<String>, sdk: Int): PushApproval? {
    if (sdk < UNLOCK_ENFORCED_FROM_SDK || p.kind != "approval" || p.ask != "approval") return null
    if (!isId(p.sessionId) || !isId(p.approvalId)) return null
    if (if (p.tool == null) openOnly.isNotEmpty() else p.tool in openOnly) return null
    return PushApproval(pcId, p.sessionId!!, p.approvalId!!, p.tool)
  }
}

/** An Approve or Deny the person pressed, waiting for JavaScript to send it; `receivedAt` is when this phone got the push, by its own clock. */
internal data class PushActionRequest(val answer: String, val approval: PushApproval, val receivedAt: Long, val tag: String) {
  fun toMap(): Map<String, Any?> = mapOf(
    "action" to answer,
    "pcId" to approval.pcId,
    "sessionId" to approval.sessionId,
    "approvalId" to approval.approvalId,
    "tool" to approval.tool,
    "receivedAt" to receivedAt.toDouble(),
  )
}

/** The action that opened or resumed the app and JavaScript hasn't taken yet. Each one is taken exactly once. */
internal object PushActionInbox {
  private var pending: PushActionRequest? = null
  private var listener: (() -> Unit)? = null

  /**
   * The request in an action's intent, or null for any other intent, an incomplete one, or one relaunched from Recents
   * (which would replay it). `extra` reads a string extra; the caller strips the extras afterwards.
   */
  fun parse(intentAction: String?, extra: (String) -> String?, receivedAt: Long, fromHistory: Boolean): PushActionRequest? {
    val spec = PushActions.SPECS.firstOrNull { it.intentAction == intentAction } ?: return null
    if (fromHistory || receivedAt <= 0) return null
    val pcId = extra(PushActions.EXTRA_PC_ID)?.takeIf { it.isNotEmpty() } ?: return null
    val session = extra(PushActions.EXTRA_SESSION_ID)?.takeIf(PushActions::isId) ?: return null
    val approval = extra(PushActions.EXTRA_APPROVAL_ID)?.takeIf(PushActions::isId) ?: return null
    val tag = extra(PushActions.EXTRA_TAG) ?: return null
    return PushActionRequest(spec.answer, PushApproval(pcId, session, approval, extra(PushActions.EXTRA_TOOL)), receivedAt, tag)
  }

  fun put(request: PushActionRequest) {
    synchronized(this) { pending = request }
    synchronized(this) { listener }?.invoke()
  }

  @Synchronized
  fun take(): PushActionRequest? {
    val request = pending
    pending = null
    return request
  }

  @Synchronized
  fun listen(body: (() -> Unit)?) {
    listener = body
  }
}
