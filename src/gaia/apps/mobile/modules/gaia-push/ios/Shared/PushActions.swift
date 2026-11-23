// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation
import Security
import UserNotifications

/// Review and Deny on a tool approval's notification; the identifiers match src/features/push/approvalActions.ts.
/// Both need the phone unlocked and open GAIA. Review only opens the chat's approval card; Deny is sent from the app.
/// An action that doesn't open the app is never delivered to JavaScript once iOS has killed it.
enum PushActions {
  static let category = "gaia.approval"
  static let review = "gaia.review"
  static let deny = "gaia.deny"
  /// The notification data's only approval field: the token of the record the extension stored.
  static let tokenKey = "action_token"
  /// The NSE's Info.plist list of tools that get only Open (plugins/push/withPushIos.js, from modules/gaia-push/openOnlyTools.json).
  static let openOnlyPlistKey = "GAIAPushOpenOnlyTools"

  /// The approval category. There is no "always allow", and no action approves anything by itself.
  static func approvalCategory(reviewTitle: String, denyTitle: String) -> UNNotificationCategory {
    UNNotificationCategory(
      identifier: category,
      actions: [
        UNNotificationAction(identifier: review, title: reviewTitle, options: [.authenticationRequired, .foreground]),
        UNNotificationAction(identifier: deny, title: denyTitle, options: [.authenticationRequired, .destructive, .foreground]),
      ],
      intentIdentifiers: [],
      options: [])
  }

  /// The open-only tools in this bundle; nil when the build has no list, which then offers no actions at all.
  static func openOnlyTools(_ bundle: Bundle = .main) -> Set<String>? {
    (bundle.object(forInfoDictionaryKey: openOnlyPlistKey) as? [String]).map(Set.init)
  }

  /// Whether a payload's notification may carry Review and Deny: a tool approval (never a question) naming its chat, its
  /// approval and how long the PC waits, for a tool that isn't open-only. With a non-empty list, an approval that
  /// doesn't name its tool gets none.
  static func offered(_ p: PushPayload, openOnly: Set<String>?) -> Bool {
    guard let openOnly, p.kind == "approval", p.ask == "approval", p.ttlS != nil,
      let session = p.sessionId, isId(session), let approval = p.approvalId, isId(approval)
    else { return false }
    guard let tool = p.tool else { return openOnly.isEmpty }
    return !openOnly.contains(tool)
  }

  static func isId(_ text: String) -> Bool {
    text.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil
  }

  /// 128 random bits, base64url without padding (22 characters).
  static func newToken() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard status == errSecSuccess else { throw PushKeychainError.status("random", status) }
    return Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  static func isToken(_ text: String) -> Bool {
    text.range(of: "^[A-Za-z0-9_-]{22}$", options: .regularExpression) != nil
  }
}

/// What a notification's actions answer, stored by the extension under a random token and never shown or logged.
struct PushActionRecord: Codable, Equatable {
  let pcId: String
  let sessionId: String
  let approvalId: String
  let tool: String?
  /// When this phone received the push and when the PC stops waiting, by this phone's clock (unix ms).
  let receivedAt: Int64
  let expiresAt: Int64
  /// The delivered notification's request identifier, so a resolved approval's notification can be removed.
  let notificationId: String

  init(_ p: PushPayload, pcId: String, receivedAt: Date, notificationId: String) {
    self.pcId = pcId
    sessionId = p.sessionId ?? ""
    approvalId = p.approvalId ?? ""
    tool = p.tool
    self.receivedAt = Int64(receivedAt.timeIntervalSince1970 * 1000)
    expiresAt = self.receivedAt + (p.ttlS ?? 0) * 1000
    self.notificationId = notificationId
  }

  var dictionary: [String: Any] {
    var out: [String: Any] = [
      "pcId": pcId, "sessionId": sessionId, "approvalId": approvalId, "receivedAt": Double(receivedAt), "expiresAt": Double(expiresAt),
    ]
    if let tool { out["tool"] = tool }
    return out
  }
}

/// Where the records live: the Keychain group the app shares with its extension, or memory in the tests.
protocol PushActionStorage {
  func add(_ token: String, _ data: Data) throws
  /// Reads without deleting; nil when there is none.
  func read(_ token: String) throws -> Data?
  /// Reads and deletes in one step; nil when there is none (or another process took it first).
  func take(_ token: String) throws -> Data?
  func all() throws -> [(token: String, data: Data)]
  func remove(_ token: String) throws
}

/// What a look at a token found: the phone locked, no record, or the record (still stored until it is consumed).
enum PushActionClaim: Equatable {
  case locked
  case none
  case record(PushActionRecord)
}

/// The records' rules, over any storage: a press looks at its record first, and each token is consumed at most once,
/// only once the press is accepted or can never succeed, so a refused press can be tried again. Stale ones are swept.
enum PushActionRecords {
  /// Kept a day past their expiry, so a late press still gets "no longer waiting" rather than "not from GAIA".
  static let keepAfterExpiryMs: Int64 = 86_400_000

  static func save(_ record: PushActionRecord, in store: PushActionStorage) throws -> String {
    let token = try PushActions.newToken()
    try store.add(token, JSONEncoder().encode(record))
    return token
  }

  /// The record a token stands for, left stored; `.locked` while the phone is locked, `.none` for a malformed, unknown
  /// or consumed token.
  static func peek(_ token: String, in store: PushActionStorage, unlocked: Bool) throws -> PushActionClaim {
    guard unlocked else { return .locked }
    guard PushActions.isToken(token), let data = try store.read(token),
      let record = try? JSONDecoder().decode(PushActionRecord.self, from: data)
    else { return .none }
    return .record(record)
  }

  /// Deletes a token's record; it is returned only to the one caller whose delete took it, so of two consumes one wins.
  static func consume(_ token: String, in store: PushActionStorage) throws -> PushActionRecord? {
    guard PushActions.isToken(token), let data = try store.take(token) else { return nil }
    return try? JSONDecoder().decode(PushActionRecord.self, from: data)
  }

  /// Deletes the records of approvals answered or expired elsewhere; their notifications' identifiers, to remove.
  static func resolve(_ approvalIds: [String], in store: PushActionStorage) throws -> [String] {
    let wanted = Set(approvalIds)
    var removed: [String] = []
    for item in try store.all() {
      guard let record = try? JSONDecoder().decode(PushActionRecord.self, from: item.data), wanted.contains(record.approvalId) else { continue }
      try store.remove(item.token)
      removed.append(record.notificationId)
    }
    return removed
  }

  /// Deletes records well past their expiry, and any this build can't read.
  static func sweep(now: Date, in store: PushActionStorage) throws {
    let nowMs = Int64(now.timeIntervalSince1970 * 1000)
    for item in try store.all() {
      let record = try? JSONDecoder().decode(PushActionRecord.self, from: item.data)
      if record.map({ nowMs > $0.expiresAt + keepAfterExpiryMs }) ?? true { try store.remove(item.token) }
    }
  }
}
