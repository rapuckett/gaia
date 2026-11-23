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
  "chatAlert.needsApproval": "GAIA needs your approval", "chatAlert.question": "GAIA has a question",
  "mobileApp.push.title.needsYou": "GAIA needs you", "mobileApp.push.body.inChat": "In “{chat}”.",
  "mobileApp.push.body.approve": "In “{chat}”. Tap to review.", "mobileApp.push.body.approveNoChat": "Tap to review.",
  "mobileApp.push.body.needsYouNoChat": "Tap to see what it needs.", "tool.write_file.active": "Writing file",
]
let say = { (k: String) in en[k] ?? k }
func payload(_ kind: String, _ params: [String: Any], ids: [String: Any] = [:]) throws -> PushPayload {
  let root: [String: Any] = ["v": 1, "kind": kind, "params": params, "route": "/", "seq": 5, "badge": 1].merging(ids) { $1 }
  return try PushPayload(json: JSONSerialization.data(withJSONObject: root))
}
let I = { (s: String) in "\u{2068}\(s)\u{2069}" }
let approvalText = PushText.compose(try payload("approval", ["chat_title": "Plan", "tool": "write_file", "label": "writing /etc/hosts"]), say)!
check(approvalText == ("GAIA needs your approval", "In “\(I("Plan"))”. Tap to review."), "an approval names only its chat: no tool, label or path")
check(PushText.compose(try payload("approval", ["label": "doing it"]), say)!.body == "Tap to review.", "an untitled chat's approval: only the tap line")
check(PushText.compose(try payload("approval", ["ask": "question", "summary": "Which file?"]), say)! == ("GAIA has a question", I("Which file?")), "a question shows its text")
check(PushText.compose(try payload("needs_you", [:]), say)! == ("GAIA needs you", "Tap to see what it needs."), "needs_you without a chat")

// Approve and Deny: both need the phone unlocked and open GAIA; Deny is destructive; there is no "always".
let category = PushActions.approvalCategory(approveTitle: "Approve", denyTitle: "Deny")
let actions = Dictionary(uniqueKeysWithValues: category.actions.map { ($0.identifier, $0) })
check(category.identifier == "gaia.approval" && category.actions.map(\.identifier) == ["gaia.approve", "gaia.deny"], "the approval category has exactly Approve and Deny")
check(category.actions.allSatisfy { $0.options.contains(.authenticationRequired) && $0.options.contains(.foreground) }, "both actions need the phone unlocked and open GAIA")
check(actions["gaia.deny"]!.options.contains(.destructive) && !actions["gaia.approve"]!.options.contains(.destructive), "only Deny is destructive")
check(category.actions.allSatisfy { !$0.identifier.lowercased().contains("always") && !$0.title.lowercased().contains("always") }, "no action allows always")
check(actions["gaia.approve"]!.title == "Approve" && actions["gaia.deny"]!.title == "Deny", "the titles are the app's")

let ids: [String: Any] = ["session_id": "s_42", "approval_id": "0b6f2c1e-8d4a-4f7e-9a3b-2c5d6e7f8a9b"]
let approve = try payload("approval", ["ask": "approval", "tool": "write_file"], ids: ids)
check(PushActions.offered(approve, openOnly: []), "a tool approval with both ids offers the actions")
check(!PushActions.offered(try payload("approval", ["ask": "question"], ids: ids), openOnly: []), "a question offers none")
check(!PushActions.offered(try payload("approval", ["tool": "write_file"], ids: ids), openOnly: []), "an approval without ask=approval offers none")
check(!PushActions.offered(try payload("approval", ["ask": "approval"], ids: ["session_id": "s_42"]), openOnly: []), "no approval_id: none")
check(!PushActions.offered(try payload("approval", ["ask": "approval"], ids: ["approval_id": "a1"]), openOnly: []), "no session_id: none")
check(!PushActions.offered(try payload("approval", ["ask": "approval"], ids: ["session_id": "s 42", "approval_id": "a1"]), openOnly: []), "a malformed id: none")
check(!PushActions.offered(try payload("finished", [:], ids: ids), openOnly: []), "a finished run offers none")
check(!PushActions.offered(approve, openOnly: ["write_file"]), "an open-only tool offers none")
check(PushActions.offered(approve, openOnly: ["send_email"]), "another tool on the list doesn't stop it")
check(!PushActions.offered(try payload("approval", ["ask": "approval"], ids: ids), openOnly: ["send_email"]), "with a list, an approval naming no tool offers none")
check(!PushActions.offered(approve, openOnly: nil), "a build with no list offers none")
check(PushActions.openOnlyTools(Bundle(for: NSObject.self)) == nil, "a bundle without the key has no list")
let data = PushActions.approvalData(approve, pcId: "pc1", receivedAt: Date(timeIntervalSince1970: 1_795_000_000))
check(data["pc_id"] as? String == "pc1" && data["session_id"] as? String == "s_42" && data["approval_id"] as? String == ids["approval_id"] as? String
  && data["received_at"] as? Int64 == 1_795_000_000_000 && data["tool"] as? String == "write_file", "the hidden data names the PC, chat, approval, tool and arrival")
check(PushText.compose(try payload("finished", ["outcome": "stopped"]), say)!.title == "GAIA stopped", "a stopped run is titled stopped")
check(PushText.compose(try payload("finished", ["outcome": "ended"]), say)!.title == "A chat stopped running", "an ended run is titled ended")
check(PushText.compose(try payload("finished", [:]), say)!.title == "GAIA finished", "no outcome keeps finished")
check(PushText.compose(try payload("finished", ["outcome": "weird"]), say)!.title == "GAIA finished", "an unknown outcome keeps finished")
check(PushPayload.clean("  Plan\u{202E}\u{7} for\n\tQ3 ", max: 80) == "Plan for Q3", "PC text: overrides and controls out, whitespace collapsed")
check(PushPayload.clean(String(repeating: "x", count: 400), max: 300) == String(repeating: "x", count: 299) + "…", "PC text capped")
check((try? PushPayload(json: JSONSerialization.data(withJSONObject: ["v": 1, "kind": "approval", "route": "/"]))) == nil, "no seq: rejected")
exit(failed == 0 ? 0 : 1)
