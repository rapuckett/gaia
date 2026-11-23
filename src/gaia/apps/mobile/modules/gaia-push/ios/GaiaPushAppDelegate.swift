// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import ExpoModulesCore
import UserNotifications
import os

/// A silent push (a badge resync) wakes the app instead of the extension: open it here and set the badge.
public class GaiaPushAppDelegate: ExpoAppDelegateSubscriber {
  private static let log = Logger(subsystem: "ai.amd.gaia.push", category: "silent")

  public func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    guard PushKeychain.group != nil, let sealed = userInfo["c"] as? String, let nonce = userInfo["n"] as? String else {
      completionHandler(.noData)
      return
    }
    let badge: Int
    do {
      let payload = try PushCrypto.openFresh(ciphertext: sealed, nonce: nonce)
      guard let count = payload.badge else {
        completionHandler(.noData)
        return
      }
      badge = count
    } catch {
      Self.log.error("Couldn't open a silent push (\(String(describing: type(of: error)), privacy: .public)).")
      completionHandler(.failed)
      return
    }
    UNUserNotificationCenter.current().setBadgeCount(badge) { error in
      if let error { Self.log.error("Couldn't set the badge: \(error.localizedDescription, privacy: .public)") }
      completionHandler(error == nil ? .newData : .failed)
    }
  }
}
