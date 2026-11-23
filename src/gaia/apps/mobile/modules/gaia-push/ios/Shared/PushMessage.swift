// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation

/// The decrypted payload, `{v:1, kind, params, route, session_id?, approval_id?, badge, ts, seq}`, space-padded;
/// its route rules match src/features/push/pushRoutes.ts.
struct PushPayload {
  let kind: String
  let chatTitle: String?
  let summary: String?
  let label: String?
  /// The tool id an approval is for, when the PC sends it; only `[a-z0-9_]` ids are kept, to look up its label.
  let tool: String?
  let ask: String?
  /// How a `finished` run ended when it wasn't done: `stopped` or `ended`; any other value counts as absent.
  let outcome: String?
  let route: String
  let sessionId: String?
  let approvalId: String?
  let badge: Int?
  /// The PC's counter for this phone, only ever increasing; about 1.8e12, so 64-bit.
  let seq: Int64
  /// When the PC sent it, unix milliseconds; for display only.
  let ts: Int64?

  static let kinds: Set<String> = ["approval", "finished", "failed", "needs_you", "badge"]

  init(json data: Data) throws {
    // The PC pads the JSON with trailing spaces to a size bucket.
    var end = data.endIndex
    while end > data.startIndex, data[data.index(before: end)] == 0x20 { end = data.index(before: end) }
    guard let root = try JSONSerialization.jsonObject(with: data[data.startIndex..<end]) as? [String: Any],
      root["v"] as? Int == Int(PushCrypto.version),
      let kind = root["kind"] as? String, PushPayload.kinds.contains(kind),
      let seq = PushPayload.whole(root["seq"])
    else { throw PushCryptoError.malformed }
    self.seq = seq
    ts = PushPayload.whole(root["ts"])
    let params = root["params"] as? [String: Any] ?? [:]
    func text(_ value: Any?) -> String? {
      guard let s = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
      return s
    }
    self.kind = kind
    chatTitle = PushPayload.clean(params["chat_title"], max: 80)
    summary = PushPayload.clean(params["summary"], max: 300)
    label = PushPayload.clean(params["label"], max: 300)
    tool = text(params["tool"]).flatMap { $0.range(of: "^[a-z0-9_]{1,64}$", options: .regularExpression) != nil ? $0 : nil }
    ask = text(params["ask"])
    outcome = text(params["outcome"]).flatMap { $0 == "stopped" || $0 == "ended" ? $0 : nil }
    sessionId = text(root["session_id"])
    approvalId = text(root["approval_id"])
    route = PushPayload.safeRoute(root["route"] as? String, sessionId: sessionId)
    if let n = root["badge"] as? Int, (0...9999).contains(n) { badge = n } else { badge = nil }
  }

  /// The PC's text made safe to show: control and bidi-override characters dropped, whitespace and line breaks collapsed to
  /// one space, and at most `max` characters (an ellipsis marks a cut). Nil when nothing is left.
  static func clean(_ value: Any?, max: Int) -> String? {
    guard let raw = value as? String else { return nil }
    var out = String.UnicodeScalarView()
    var pendingSpace = false
    for scalar in raw.unicodeScalars {
      let v = scalar.value
      if (0x202A...0x202E).contains(v) || (0x2066...0x2069).contains(v) { continue }
      if v < 0x20 || (0x7F...0x9F).contains(v) || CharacterSet.whitespacesAndNewlines.contains(scalar) {
        pendingSpace = !out.isEmpty
        continue
      }
      if pendingSpace { out.append(" ") }
      pendingSpace = false
      out.append(scalar)
    }
    var text = String(out)
    if text.isEmpty { return nil }
    if text.count > max { text = String(text.prefix(max - 1)) + "…" }
    return text
  }

  /// A non-negative whole JSON number as 64 bits; nil for anything else (a fraction, a bool, a string).
  static func whole(_ value: Any?) -> Int64? {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
    let double = number.doubleValue
    guard double >= 0, double < 9.0e15, double == double.rounded() else { return nil }
    return number.int64Value
  }

  /// `/chat/<id>`, `/approvals/<id>` (opened as its chat) or `/`; anything else opens `/`.
  static func safeRoute(_ route: String?, sessionId: String?) -> String {
    guard let route else { return "/" }
    let id = "[A-Za-z0-9_-]{1,128}"
    if route.range(of: "^/chat/\(id)$", options: .regularExpression) != nil { return route }
    if route.range(of: "^/approvals/\(id)$", options: .regularExpression) != nil,
      let sessionId, sessionId.range(of: "^\(id)$", options: .regularExpression) != nil
    {
      return "/chat/\(sessionId)"
    }
    return "/"
  }

  /// One notification thread per chat.
  var threadId: String { sessionId.map { "chat:\($0)" } ?? "gaia" }
}

/// The title and body a notification shows for a payload, in one language; nil for a badge-only payload.
/// `say` gives a catalog key's text; `find` gives it only when the strings have that key.
enum PushText {
  /// First-strong isolate: server text keeps its own direction inside either language's sentence.
  static func isolate(_ text: String) -> String { "\u{2068}\(text)\u{2069}" }

  static func compose(_ p: PushPayload, _ say: (String) -> String, _ find: (String) -> String?) -> (title: String, body: String)? {
    let title: String
    let tap: String
    // The detail line: our own words for the tool, else the PC's words as sent (isolated).
    let detail: String?
    switch p.kind {
    case "approval" where p.ask == "question":
      title = say("chatAlert.question")
      tap = "answer"
      detail = p.summary.map(isolate)
    case "approval":
      title = say("chatAlert.needsApproval")
      tap = "approve"
      detail = p.tool.flatMap { find("tool.\($0).active") } ?? p.label.map(isolate)
    case "finished":
      title = say(p.outcome.map { "chatAlert.\($0)" } ?? "chatAlert.finished")
      tap = "read"
      detail = p.summary.map(isolate)
    case "failed":
      title = say("chatAlert.failed")
      tap = "problem"
      detail = p.summary.map(isolate)
    case "needs_you":
      title = say("mobileApp.push.title.needsYou")
      tap = "needsYou"
      detail = p.label.map(isolate)
    default:
      return nil
    }
    guard let chat = p.chatTitle else { return (title, detail ?? say("mobileApp.push.body.\(tap)NoChat")) }
    func inChat(_ key: String) -> String { say(key).replacingOccurrences(of: "{chat}", with: isolate(chat)) }
    if let detail { return (title, "\(inChat("mobileApp.push.body.inChat"))\n\(detail)") }
    return (title, inChat("mobileApp.push.body.\(tap)"))
  }
}
