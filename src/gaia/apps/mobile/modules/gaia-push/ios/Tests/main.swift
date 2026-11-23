// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// The shared push Swift, checked on macOS against the same vectors as the JS and Kotlin tests (run.sh builds and runs it).
import Foundation
import UserNotifications

let args = CommandLine.arguments
func vector(_ path: String) throws -> [String: Any] {
  try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: Any]
}
var failed = 0
func check(_ ok: Bool, _ what: String) {
  print((ok ? "ok   " : "FAIL ") + what)
  if !ok { failed += 1 }
}
func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }

let parity = try vector(args[2])
let plainP = try PushCrypto.open(ciphertext: parity["ciphertext"] as! String, nonce: parity["nonce"] as! String, key: parity["key"] as! String, handle: parity["handle"] as! String)
check(String(data: plainP, encoding: .utf8) == parity["plaintext"] as? String, "opens Parity's vector")
check(hex(PushCrypto.aad(handle: parity["handle"] as! String)) == parity["aad_hex"] as! String, "AAD = ascii(handle) || 0x01")

let v = try vector(args[1])
let plain = try PushCrypto.open(ciphertext: v["ciphertext"] as! String, nonce: v["nonce"] as! String, key: v["key"] as! String, handle: v["handle"] as! String)
check(plain.count == v["padded_length"] as! Int, "opens the padded vector")
let p = try PushPayload(json: plain)
check(p.seq == 1795000000001 && p.ts == 1795000000000, "seq and ts as Int64 through the padding")
check(p.route == "/chat/s_42", "an approval opens its chat")
check((try? PushCrypto.open(ciphertext: v["ciphertext"] as! String, nonce: v["nonce"] as! String, key: v["key"] as! String, handle: "x")) == nil, "another handle fails")

let en: [String: String] = [
  "chatAlert.finished": "GAIA finished", "chatAlert.stopped": "GAIA stopped", "chatAlert.ended": "A chat stopped running",
  "chatAlert.failed": "GAIA hit a problem", "chatAlert.needsApproval": "GAIA needs your approval", "chatAlert.question": "GAIA has a question",
  "mobileApp.push.title.needsYou": "GAIA needs you", "mobileApp.push.body.inChat": "In “{chat}”.",
  "mobileApp.push.body.approve": "In “{chat}”. Tap to review.", "mobileApp.push.body.approveNoChat": "Tap to review.",
  "mobileApp.push.body.answer": "In “{chat}”. Tap to answer.", "mobileApp.push.body.answerNoChat": "Tap to answer.",
  "mobileApp.push.body.read": "In “{chat}”. Tap to read the answer.", "mobileApp.push.body.problem": "In “{chat}”. Tap to see what happened.",
  "mobileApp.push.body.needsYouNoChat": "Tap to see what it needs.", "tool.write_file.active": "Writing file",
]
let say = { (k: String) in en[k] ?? k }
let find = { (k: String) in en[k] }
func payload(_ kind: String, _ params: [String: Any], ids: [String: Any] = [:]) throws -> PushPayload {
  let root: [String: Any] = ["v": 1, "kind": kind, "params": params, "route": "/", "seq": 5, "badge": 1].merging(ids) { $1 }
  return try PushPayload(json: JSONSerialization.data(withJSONObject: root))
}
let I = { (s: String) in "\u{2068}\(s)\u{2069}" }
let inPlan = "In “\(I("Plan"))”."

// The copy: only the chat's title, and for an approval the phone's own label for its tool; never the PC's words.
check(PushText.compose(try payload("approval", ["chat_title": "Plan", "tool": "write_file", "label": "writing /etc/hosts"]), say, find)!
  == ("GAIA needs your approval", "\(inPlan)\nWriting file"), "an approval's tool line is the phone's own label, never the PC's")
check(PushText.compose(try payload("approval", ["chat_title": "Plan", "tool": "new_tool", "label": "deleting ~/Mail"]), say, find)!.body
  == "In “\(I("Plan"))”. Tap to review.", "a tool the phone has no label for: no tool line, and no PC label")
check(PushText.compose(try payload("approval", ["label": "doing it"]), say, find)!.body == "Tap to review.", "an untitled chat's approval: only the tap line")
check(PushText.compose(try payload("approval", ["chat_title": "Plan", "ask": "question", "summary": "Send ~/notes.txt to Bob?"]), say, find)!
  == ("GAIA has a question", "In “\(I("Plan"))”. Tap to answer."), "a question shows no question text")
check(PushText.compose(try payload("finished", ["chat_title": "Plan", "summary": "Wrote /etc/hosts"]), say, find)!.body
  == "In “\(I("Plan"))”. Tap to read the answer.", "a finished run shows no summary")
check(PushText.compose(try payload("failed", ["chat_title": "Plan", "summary": "Mail from bob@example.com"]), say, find)!.body
  == "In “\(I("Plan"))”. Tap to see what happened.", "a failed run shows no summary")
check(PushText.compose(try payload("needs_you", [:]), say, find)! == ("GAIA needs you", "Tap to see what it needs."), "needs_you without a chat")
check(PushText.compose(try payload("finished", ["outcome": "stopped"]), say, find)!.title == "GAIA stopped", "a stopped run is titled stopped")
check(PushText.compose(try payload("finished", ["outcome": "ended"]), say, find)!.title == "A chat stopped running", "an ended run is titled ended")
check(PushText.compose(try payload("finished", [:]), say, find)!.title == "GAIA finished", "no outcome keeps finished")
check(PushText.compose(try payload("finished", ["outcome": "weird"]), say, find)!.title == "GAIA finished", "an unknown outcome keeps finished")

// Review and Deny: both need the phone unlocked and open GAIA; Deny is destructive; none approves or allows always.
let category = PushActions.approvalCategory(reviewTitle: "Review", denyTitle: "Deny")
let actions = Dictionary(uniqueKeysWithValues: category.actions.map { ($0.identifier, $0) })
check(category.identifier == "gaia.approval" && category.actions.map(\.identifier) == ["gaia.review", "gaia.deny"], "the approval category has exactly Review and Deny")
check(category.actions.allSatisfy { $0.options.contains(.authenticationRequired) && $0.options.contains(.foreground) }, "both actions need the phone unlocked and open GAIA")
check(actions["gaia.deny"]!.options.contains(.destructive) && !actions["gaia.review"]!.options.contains(.destructive), "only Deny is destructive")
check(category.actions.allSatisfy { !$0.identifier.lowercased().contains("always") && !$0.identifier.lowercased().contains("approve") }, "no action approves or allows always")
check(actions["gaia.review"]!.title == "Review" && actions["gaia.deny"]!.title == "Deny", "the titles are the app's")

let ids: [String: Any] = ["session_id": "s_42", "approval_id": "0b6f2c1e-8d4a-4f7e-9a3b-2c5d6e7f8a9b"]
let ask: [String: Any] = ["ask": "approval", "tool": "write_file", "ttl_s": 600]
let approve = try payload("approval", ask, ids: ids)
check(approve.ttlS == 600, "ttl_s is read as whole seconds")
check(try payload("approval", ["ttl_s": 1.5]).ttlS == nil && (try payload("approval", ["ttl_s": 0])).ttlS == nil && (try payload("approval", ["ttl_s": "600"])).ttlS == nil, "a fractional, zero or text ttl_s is absent")
check(PushActions.offered(approve, openOnly: []), "a tool approval with both ids and ttl_s offers the actions")
check(!PushActions.offered(try payload("approval", ["ask": "approval", "tool": "write_file"], ids: ids), openOnly: []), "no ttl_s: no actions, never an assumed expiry")
check(!PushActions.offered(try payload("approval", ["ask": "question", "ttl_s": 600], ids: ids), openOnly: []), "a question offers none")
check(!PushActions.offered(try payload("approval", ["tool": "write_file", "ttl_s": 600], ids: ids), openOnly: []), "an approval without ask=approval offers none")
check(!PushActions.offered(try payload("approval", ask, ids: ["session_id": "s_42"]), openOnly: []), "no approval_id: none")
check(!PushActions.offered(try payload("approval", ask, ids: ["approval_id": "a1"]), openOnly: []), "no session_id: none")
check(!PushActions.offered(try payload("approval", ask, ids: ["session_id": "s 42", "approval_id": "a1"]), openOnly: []), "a malformed id: none")
check(!PushActions.offered(try payload("finished", ["ttl_s": 600], ids: ids), openOnly: []), "a finished run offers none")
check(!PushActions.offered(approve, openOnly: ["write_file"]), "an open-only tool offers none")
check(PushActions.offered(approve, openOnly: ["send_email"]), "another tool on the list doesn't stop it")
check(!PushActions.offered(try payload("approval", ["ask": "approval", "ttl_s": 600], ids: ids), openOnly: ["send_email"]), "with a list, an approval naming no tool offers none")
check(!PushActions.offered(approve, openOnly: nil), "a build with no list offers none")
check(PushActions.openOnlyTools(Bundle(for: NSObject.self)) == nil, "a bundle without the key has no list")

// The records: the notification carries only a token; each token answers once, and resolved approvals' records go.
final class MemoryStorage: PushActionStorage {
  var items: [String: Data] = [:]
  func add(_ token: String, _ data: Data) throws { items[token] = data }
  func take(_ token: String) throws -> Data? { items.removeValue(forKey: token) }
  func all() throws -> [(token: String, data: Data)] { items.map { ($0.key, $0.value) } }
  func remove(_ token: String) throws { items[token] = nil }
}
let store = MemoryStorage()
let arrived = Date(timeIntervalSince1970: 1_795_000_000)
let record = PushActionRecord(approve, pcId: "pc1", receivedAt: arrived, notificationId: "n-1")
check(record.receivedAt == 1_795_000_000_000 && record.expiresAt == 1_795_000_600_000, "the record expires ttl_s after it arrived, by this phone's clock")
let token = try PushActionRecords.save(record, in: store)
let tokens = Set(try (0..<200).map { _ in try PushActions.newToken() })
check(PushActions.isToken(token) && tokens.count == 200 && tokens.allSatisfy(PushActions.isToken), "tokens are 128 random bits, base64url")
check(String(data: store.items[token]!, encoding: .utf8)!.contains("s_42") && !token.contains("s_42"), "the ids are in the store, not the token")
check(try PushActionRecords.claim(token, in: store) == record, "a token claims its record")
check(try PushActionRecords.claim(token, in: store) == nil, "a token claims at most once")
check(try PushActionRecords.claim("not-a-token", in: store) == nil && (try PushActionRecords.claim("AAAAAAAAAAAAAAAAAAAAAA", in: store)) == nil, "a malformed or unknown token claims nothing")
check(record.dictionary["approvalId"] as? String == ids["approval_id"] as? String && record.dictionary["notificationId"] == nil, "JavaScript gets the ids, not the notification's identifier")

let other = PushActionRecord(try payload("approval", ask, ids: ["session_id": "s_7", "approval_id": "ap_7"]), pcId: "pc1", receivedAt: arrived, notificationId: "n-7")
let kept = try PushActionRecords.save(other, in: store)
_ = try PushActionRecords.save(record, in: store)
check(try PushActionRecords.resolve([ids["approval_id"] as! String], in: store) == ["n-1"] && store.items.count == 1 && store.items[kept] != nil,
  "a resolved approval's record goes, and its notification is named for removal")
let resolvedBadge = try payload("badge", ["resolved": ["ap_7", "bad id", 5]])
check(resolvedBadge.resolved == ["ap_7"], "resolved keeps only well-formed approval ids")
try PushActionRecords.sweep(now: arrived.addingTimeInterval(600 + 86_400 - 1), in: store)
check(store.items.count == 1, "a record is kept a day past its expiry")
try PushActionRecords.sweep(now: arrived.addingTimeInterval(600 + 86_400 + 1), in: store)
check(store.items.isEmpty, "then swept")
check(PushPayload.clean("  Plan\u{202E}\u{7} for\n\tQ3 ", max: 80) == "Plan for Q3", "PC text: overrides and controls out, whitespace collapsed")
check(PushPayload.clean(String(repeating: "x", count: 400), max: 300) == String(repeating: "x", count: 299) + "…", "PC text capped")
check((try? PushPayload(json: JSONSerialization.data(withJSONObject: ["v": 1, "kind": "approval", "route": "/"]))) == nil, "no seq: rejected")
exit(failed == 0 ? 0 : 1)
