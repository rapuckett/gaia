// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import ExpoModulesCore
import UIKit

/// Catches the quick action on both paths: a running app, and a cold start (Expo's scene delegate re-sends that one here).
public class GaiaQuickActionsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  // The launch-options key by its string, as Expo's scene delegate does, since the accessor is deprecated in iOS 26.
  private static let shortcutItemKey = UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsShortcutItemKey")

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if let item = launchOptions?[Self.shortcutItemKey] as? UIApplicationShortcutItem {
      QuickActionInbox.put(item.type)
    }
    return true
  }

  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    QuickActionInbox.put(shortcutItem.type)
    completionHandler(true)
  }
}
