// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import ExpoModulesCore
import UserNotifications
import os

/// A silent push (a badge resync) wakes the app instead of the extension: open it here, set the badge, and remove the
/// notifications of approvals answered or expired elsewhere, with their stored actions.
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
    let payload: PushPayload
    do {
      payload = try PushCrypto.openFresh(ciphertext: sealed, nonce: nonce).payload
    } catch {
      Self.log.error("Couldn't open a silent push (\(String(describing: type(of: error)), privacy: .public)).")
      completionHandler(.failed)
      return
    }
    let center = UNUserNotificationCenter.current()
    if !payload.resolved.isEmpty {
      do {
        center.removeDeliveredNotifications(withIdentifiers: try PushActionRecords.resolve(payload.resolved, in: PushKeychain.ActionStorage()))
      } catch {
        Self.log.error("Couldn't remove answered approvals' actions (\(String(describing: type(of: error)), privacy: .public)).")
      }
    }
    guard let badge = payload.badge else {
      completionHandler(payload.resolved.isEmpty ? .noData : .newData)
      return
    }
    center.setBadgeCount(badge) { error in
      if let error { Self.log.error("Couldn't set the badge: \(error.localizedDescription, privacy: .public)") }
      completionHandler(error == nil ? .newData : .failed)
    }
  }
}
