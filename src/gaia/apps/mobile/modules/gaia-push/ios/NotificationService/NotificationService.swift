// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation
import UserNotifications
import os

/// Turns the relay's alert into the chat's own, in the app's language. Every path builds fresh content, so nothing the
/// relay sent (subtitle, sound, category, target) reaches the screen. A push that can't be opened, or is a replay, shows
/// the phone's own generic alert: iOS must show something for an alert push, and hiding it would need Apple's
/// notification filtering entitlement (com.apple.developer.usernotifications.filtering), which this app doesn't have.
final class NotificationService: UNNotificationServiceExtension {
  private static let log = Logger(subsystem: "ai.amd.gaia.push", category: "extension")
  private var deliver: ((UNNotificationContent) -> Void)?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    deliver = contentHandler
    let strings = Strings(language: PushKeychain.language())
    contentHandler(rewrite(request.content.userInfo, strings) ?? Self.generic(strings))
    deliver = nil
  }

  override func serviceExtensionTimeWillExpire() {
    deliver?(Self.generic(Strings(language: PushKeychain.language())))
    deliver = nil
  }

  private static func generic(_ strings: Strings) -> UNNotificationContent {
    let content = UNMutableNotificationContent()
    content.title = strings.say("mobileApp.push.generic.title")
    content.body = strings.say("mobileApp.push.generic.body")
    content.sound = .default
    content.userInfo = ["body": ["route": "/"]]
    return content
  }

  private func rewrite(_ info: [AnyHashable: Any], _ strings: Strings) -> UNNotificationContent? {
    guard let sealed = info["c"] as? String, let nonce = info["n"] as? String else {
      Self.log.error("A push arrived without its sealed payload; showing the generic alert.")
      return nil
    }
    let pcId: String
    let payload: PushPayload
    do {
      (pcId, payload) = try PushCrypto.openFresh(ciphertext: sealed, nonce: nonce)
    } catch {
      // Never log the payload: only which step failed.
      Self.log.error("Couldn't open a push (\(String(describing: error), privacy: .public)); showing the generic alert.")
      return nil
    }
    guard let text = PushText.compose(payload, strings.say) else { return nil }
    let content = UNMutableNotificationContent()
    content.title = text.title
    content.body = text.body
    content.sound = .default
    if let badge = payload.badge { content.badge = NSNumber(value: badge) }
    content.threadIdentifier = payload.threadId
    var data: [String: Any] = ["route": payload.route]
    let openOnly = PushActions.openOnlyTools()
    if openOnly == nil, payload.kind == "approval" { Self.log.error("This build has no open-only tool list, so approvals get no Approve or Deny.") }
    if PushActions.offered(payload, openOnly: openOnly) {
      content.categoryIdentifier = PushActions.category
      data["approval"] = PushActions.approvalData(payload, pcId: pcId, receivedAt: Date())
    }
    // expo-notifications reads a remote notification's data from "body".
    content.userInfo = ["body": data]
    return content
  }
}

/// The extension's Localizable.strings in the app's chosen language, else the phone's.
private struct Strings {
  let bundle: Bundle

  init(language: String?) {
    if let language, let path = Bundle.main.path(forResource: language, ofType: "lproj"), let chosen = Bundle(path: path) {
      bundle = chosen
    } else {
      bundle = Bundle.main
    }
  }

  func say(_ key: String) -> String {
    bundle.localizedString(forKey: key, value: nil, table: nil)
  }
}
