// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation

/// The quick action the person chose that JavaScript hasn't taken yet. Each one is taken exactly once.
enum QuickActionInbox {
  static let arrived = Notification.Name("GaiaQuickActionArrived")

  private static let lock = NSLock()
  private static var pending: String?

  static func put(_ id: String) {
    lock.lock()
    pending = id
    lock.unlock()
    NotificationCenter.default.post(name: arrived, object: nil)
  }

  static func take() -> String? {
    lock.lock()
    defer { lock.unlock() }
    let id = pending
    pending = nil
    return id
  }
}
