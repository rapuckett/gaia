// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

/** What one push becomes on this phone. */
internal sealed interface PushAction {
  /** Nothing shown: it didn't open with any paired PC's key, wasn't a payload this app reads, or was a replay. */
  data class Dropped(val reason: String) : PushAction

  /**
   * A badge update. `clearAll` when it is zero: nothing left to count, so no notification should stay. `resolved` names
   * approvals answered or expired elsewhere, whose notifications and stored actions go.
   */
  data class Badge(val clearAll: Boolean, val resolved: List<String>) : PushAction

  /** `approval` is set when the notification carries Review and Deny. */
  data class Post(
    val channel: String,
    val tag: String,
    val title: String,
    val body: String,
    val route: String,
    val badge: Int?,
    val approval: PushApproval? = null,
  ) : PushAction
}

/** Decides what a data message shows; no Android calls, so it runs in JVM unit tests. */
internal object PushInbox {
  const val NEEDS_YOU = "gaia.needs_you"
  const val CHATS = "gaia.chats"
  /** Each chat's notification is posted under its tag with this id, so a newer one replaces it. */
  const val NOTIFICATION_ID = 1
  private const val GENERIC_TAG = "gaia"

  /** `accept` records a payload's `seq` for its PC and is false for a replay; `sdk` is the phone's Android API level. */
  fun decide(
    sealed: String,
    nonce: String,
    records: List<PushRecord>,
    accept: (PushRecord, Long) -> Boolean,
    say: (String) -> String,
    find: (String) -> String?,
    openOnly: Set<String>,
    sdk: Int,
  ): PushAction {
    val opened = PushCrypto.open(sealed, nonce, records) ?: return PushAction.Dropped("no paired PC's key opens it")
    val payload = PushPayload.parse(opened.second) ?: return PushAction.Dropped("not a payload this app reads")
    if (!accept(opened.first, payload.seq)) return PushAction.Dropped("its seq isn't newer than the last one from its PC")
    // The launcher's dot follows the notifications on show; a badge count of zero means none should stay.
    if (payload.kind == "badge") return PushAction.Badge(payload.badge == 0, payload.resolved)
    val text = PushText.compose(payload, say, find) ?: return PushAction.Dropped("no text for kind ${payload.kind}")
    val channel = if (payload.kind == "approval" || payload.kind == "needs_you") NEEDS_YOU else CHATS
    val tag = payload.sessionId?.let { "chat:$it" } ?: GENERIC_TAG
    val approval = PushActions.offered(payload, opened.first.pcId, openOnly, sdk)
    return PushAction.Post(channel, tag, text.first, text.second, payload.route, payload.badge, approval)
  }
}
