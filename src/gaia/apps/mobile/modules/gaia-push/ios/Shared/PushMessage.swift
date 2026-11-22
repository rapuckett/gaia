// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation

/// The decrypted payload, `{v:1, kind, params, route, session_id?, approval_id?, badge}`; its route rules match src/features/push/pushRoutes.ts.
struct PushPayload {
  let kind: String
  let chatTitle: String?
  let summary: String?
  let label: String?
  let ask: String?
  let route: String
  let sessionId: String?
  let approvalId: String?
  let badge: Int?

  static let kinds: Set<String> = ["approval", "finished", "failed", "needs_you", "badge"]

  init(json data: Data) throws {
    guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      root["v"] as? Int == Int(PushCrypto.version),
      let kind = root["kind"] as? String, PushPayload.kinds.contains(kind)
    else { throw PushCryptoError.malformed }
    let params = root["params"] as? [String: Any] ?? [:]
    func text(_ value: Any?) -> String? {
      guard let s = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
      return s
    }
    self.kind = kind
    chatTitle = text(params["chat_title"])
    summary = text(params["summary"])
    label = text(params["label"])
    ask = text(params["ask"])
    sessionId = text(root["session_id"])
    approvalId = text(root["approval_id"])
    route = PushPayload.safeRoute(root["route"] as? String, sessionId: sessionId)
    if let n = root["badge"] as? Int, (0...9999).contains(n) { badge = n } else { badge = nil }
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
enum PushText {
  /// First-strong isolate: server text keeps its own direction inside either language's sentence.
  static func isolate(_ text: String) -> String { "\u{2068}\(text)\u{2069}" }

  static func compose(_ p: PushPayload, _ say: (String) -> String) -> (title: String, body: String)? {
    let title: String
    let tap: String
    switch p.kind {
    case "approval":
      let question = p.ask == "question"
      title = say(question ? "chatAlert.question" : "chatAlert.needsApproval")
      tap = question ? "answer" : "approve"
    case "finished":
      title = say("chatAlert.finished")
      tap = "read"
    case "failed":
      title = say("chatAlert.failed")
      tap = "problem"
    case "needs_you":
      return (say("mobileApp.push.title.needsYou"), p.label.map(isolate) ?? say("mobileApp.push.body.needsYou"))
    default:
      return nil
    }
    let inChat = { (key: String) in say(key).replacingOccurrences(of: "{chat}", with: isolate(p.chatTitle ?? "")) }
    switch (p.chatTitle, p.summary) {
    case (.some, .some(let summary)): return (title, "\(inChat("mobileApp.push.body.inChat"))\n\(isolate(summary))")
    case (.some, .none): return (title, inChat("mobileApp.push.body.\(tap)"))
    case (.none, .some(let summary)): return (title, isolate(summary))
    case (.none, .none): return (title, say("mobileApp.push.body.\(tap)NoChat"))
    }
  }
}
