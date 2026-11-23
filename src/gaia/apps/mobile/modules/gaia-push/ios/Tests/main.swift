// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// The shared push Swift, checked on macOS against the same vectors as the JS and Kotlin tests (run.sh builds and runs it).
import Foundation

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
  "chatAlert.needsApproval": "GAIA needs your approval", "chatAlert.question": "GAIA has a question",
  "mobileApp.push.title.needsYou": "GAIA needs you", "mobileApp.push.body.inChat": "In “{chat}”.",
  "mobileApp.push.body.approve": "In “{chat}”. Tap to review.", "mobileApp.push.body.approveNoChat": "Tap to review.",
  "mobileApp.push.body.needsYouNoChat": "Tap to see what it needs.", "tool.write_file.active": "Writing file",
]
let say = { (k: String) in en[k] ?? k }
let find = { (k: String) in en[k] }
func payload(_ kind: String, _ params: [String: Any]) throws -> PushPayload {
  try PushPayload(json: JSONSerialization.data(withJSONObject: ["v": 1, "kind": kind, "params": params, "route": "/", "seq": 5, "badge": 1]))
}
let I = { (s: String) in "\u{2068}\(s)\u{2069}" }
check(PushText.compose(try payload("approval", ["chat_title": "Plan", "tool": "write_file", "label": "writing file"]), say, find)!.body == "In “\(I("Plan"))”.\nWriting file", "the tool's own label first")
check(PushText.compose(try payload("approval", ["chat_title": "Plan", "tool": "new_tool", "label": "doing it"]), say, find)!.body == "In “\(I("Plan"))”.\n\(I("doing it"))", "else the PC's label, isolated")
check(PushText.compose(try payload("approval", ["chat_title": "Plan"]), say, find)!.body == "In “\(I("Plan"))”. Tap to review.", "else the tap line")
check(PushText.compose(try payload("approval", ["ask": "question", "summary": "Which file?"]), say, find)! == ("GAIA has a question", I("Which file?")), "a question shows its text")
check(PushText.compose(try payload("needs_you", [:]), say, find)! == ("GAIA needs you", "Tap to see what it needs."), "needs_you without a chat")
check(PushPayload.clean("  Plan\u{202E}\u{7} for\n\tQ3 ", max: 80) == "Plan for Q3", "PC text: overrides and controls out, whitespace collapsed")
check(PushPayload.clean(String(repeating: "x", count: 400), max: 300) == String(repeating: "x", count: 299) + "…", "PC text capped")
check((try? PushPayload(json: JSONSerialization.data(withJSONObject: ["v": 1, "kind": "approval", "route": "/"]))) == nil, "no seq: rejected")
exit(failed == 0 ? 0 : 1)
