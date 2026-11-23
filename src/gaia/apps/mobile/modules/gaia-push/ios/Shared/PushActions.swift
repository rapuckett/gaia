// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation
import UserNotifications

/// Approve and Deny on a tool approval's notification; the identifiers match src/features/push/approvalActions.ts.
/// Both need the phone unlocked and open GAIA, which sends the answer through its paired, pinned connection: an
/// action that doesn't open the app is never delivered to JavaScript once iOS has killed it.
enum PushActions {
  static let category = "gaia.approval"
  static let approve = "gaia.approve"
  static let deny = "gaia.deny"
  /// The NSE's Info.plist list of tools that get only Open (plugins/push/withPushIos.js, from modules/gaia-push/openOnlyTools.json).
  static let openOnlyPlistKey = "GAIAPushOpenOnlyTools"

  /// The approval category. There is no "always allow": a notification only ever answers once.
  static func approvalCategory(approveTitle: String, denyTitle: String) -> UNNotificationCategory {
    UNNotificationCategory(
      identifier: category,
      actions: [
        UNNotificationAction(identifier: approve, title: approveTitle, options: [.authenticationRequired, .foreground]),
        UNNotificationAction(identifier: deny, title: denyTitle, options: [.authenticationRequired, .destructive, .foreground]),
      ],
      intentIdentifiers: [],
      options: [])
  }

  /// The open-only tools in this bundle; nil when the build has no list, which then offers no actions at all.
  static func openOnlyTools(_ bundle: Bundle = .main) -> Set<String>? {
    (bundle.object(forInfoDictionaryKey: openOnlyPlistKey) as? [String]).map(Set.init)
  }

  /// Whether a payload's notification may carry Approve and Deny: a tool approval (never a question) naming its chat and
  /// its approval, for a tool that isn't open-only. With a non-empty list, an approval that doesn't name its tool gets none.
  static func offered(_ p: PushPayload, openOnly: Set<String>?) -> Bool {
    guard let openOnly, p.kind == "approval", p.ask == "approval",
      let session = p.sessionId, isId(session), let approval = p.approvalId, isId(approval)
    else { return false }
    guard let tool = p.tool else { return openOnly.isEmpty }
    return !openOnly.contains(tool)
  }

  /// What the actions answer, kept in the notification's data and never shown: the PC that sent it, the chat, the
  /// approval (confirm-tool's `confirm_id`), and when this phone received it, by this phone's clock.
  static func approvalData(_ p: PushPayload, pcId: String, receivedAt: Date) -> [String: Any] {
    var data: [String: Any] = [
      "pc_id": pcId,
      "session_id": p.sessionId ?? "",
      "approval_id": p.approvalId ?? "",
      "received_at": Int64(receivedAt.timeIntervalSince1970 * 1000),
    ]
    if let tool = p.tool { data["tool"] = tool }
    return data
  }

  static func isId(_ text: String) -> Bool {
    text.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil
  }
}
