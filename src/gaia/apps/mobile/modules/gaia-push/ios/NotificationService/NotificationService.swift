// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation
import UserNotifications
import os

/// Turns the relay's generic alert into the chat's own, in the app's language. Any failure leaves the generic alert as it came.
final class NotificationService: UNNotificationServiceExtension {
  private static let log = Logger(subsystem: "ai.amd.gaia.push", category: "extension")
  private var deliver: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    deliver = contentHandler
    original = request.content
    contentHandler(rewrite(request.content) ?? request.content)
    deliver = nil
  }

  override func serviceExtensionTimeWillExpire() {
    if let deliver, let original { deliver(original) }
    deliver = nil
  }

  private func rewrite(_ content: UNNotificationContent) -> UNNotificationContent? {
    let info = content.userInfo
    guard let sealed = info["c"] as? String, let nonce = info["n"] as? String else {
      Self.log.error("A push arrived without its sealed payload; showing the generic alert.")
      return nil
    }
    let payload: PushPayload
    do {
      payload = try PushCrypto.openFresh(ciphertext: sealed, nonce: nonce)
    } catch {
      // Never log the payload: only which step failed.
      Self.log.error("Couldn't open a push (\(String(describing: type(of: error)), privacy: .public)); showing the generic alert.")
      return nil
    }
    guard let next = content.mutableCopy() as? UNMutableNotificationContent else { return nil }
    if let badge = payload.badge { next.badge = NSNumber(value: badge) }
    let strings = Strings(language: PushKeychain.language())
    if let text = PushText.compose(payload, strings.say) {
      next.title = text.title
      next.body = text.body
    }
    next.threadIdentifier = payload.threadId
    var userInfo = info
    userInfo.removeValue(forKey: "c")
    userInfo.removeValue(forKey: "n")
    // expo-notifications reads a remote notification's data from "body".
    userInfo["body"] = ["route": payload.route]
    next.userInfo = userInfo
    return next
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
