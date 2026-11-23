// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import ExpoModulesCore
import UserNotifications

/// Each paired PC's push handle, relay credentials and payload key, kept in the Keychain; see PushKeychain.
public class GaiaPushModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GaiaPush")

    // A build without push has no shared Keychain group (plugins/withPush.js).
    Constant("available") { PushKeychain.group != nil }

    AsyncFunction("save") { (pcId: String, handle: String, secret: String, sendToken: String, key: String) throws in
      try guarded("save") {
        try PushKeychain.saveKey(pcId, PushKeychain.Key(handle: handle, key: key))
        try PushKeychain.saveCredentials(pcId, PushKeychain.Credentials(handle: handle, secret: secret, sendToken: sendToken))
      }
    }

    AsyncFunction("load") { (pcId: String) throws -> [String: String]? in
      try guarded("read") {
        guard let credentials = try PushKeychain.credentials(pcId) else { return nil }
        // An empty key: the PC was unpaired and its handle still waits to be deleted at the relay.
        let key = try PushKeychain.key(pcId)?.key ?? ""
        return ["handle": credentials.handle, "secret": credentials.secret, "sendToken": credentials.sendToken, "key": key]
      }
    }

    AsyncFunction("pcIds") { () throws -> [String] in
      try guarded("read") { try PushKeychain.pcIds() }
    }

    AsyncFunction("dropKey") { (pcId: String) throws in
      try guarded("delete") { try PushKeychain.deleteKey(pcId) }
    }

    AsyncFunction("remove") { (pcId: String) throws in
      try guarded("delete") { try PushKeychain.delete(pcId) }
    }

    AsyncFunction("removeAll") { () throws in
      try guarded("delete") { try PushKeychain.deleteAll() }
    }

    AsyncFunction("setLanguage") { (code: String?) throws in
      try guarded("save") { try PushKeychain.saveLanguage(code) }
    }

    // The approval category, titled in the app's language; other categories (none today) are kept.
    AsyncFunction("setApprovalActions") { (reviewTitle: String, denyTitle: String) async in
      let center = UNUserNotificationCenter.current()
      let others = await center.notificationCategories().filter { $0.identifier != PushActions.category }
      center.setNotificationCategories(others.union([PushActions.approvalCategory(reviewTitle: reviewTitle, denyTitle: denyTitle)]))
    }

    // What a pressed action answers, once: the record is deleted as it is read, and its notification removed. While the
    // phone is locked nothing is claimed and it answers `locked`; isProtectedDataAvailable is read on the main queue.
    AsyncFunction("claimApproval") { (token: String) throws -> [String: Any]? in
      try guarded("read") {
        switch try PushActionRecords.claim(token, in: PushKeychain.ActionStorage(), unlocked: UIApplication.shared.isProtectedDataAvailable) {
        case .locked:
          return ["locked": true]
        case .none:
          return nil
        case .record(let record):
          UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [record.notificationId])
          return record.dictionary
        }
      }
    }.runOnQueue(.main)
  }
}

private func guarded<T>(_ action: String, _ body: () throws -> T) throws -> T {
  do {
    return try body()
  } catch PushKeychainError.noGroup {
    throw Exception(name: "push_unavailable", description: "This build of the GAIA app has no push notifications.", code: "push_unavailable")
  } catch PushKeychainError.status(_, let status) {
    throw Exception(
      name: "keychain",
      description: "Couldn't \(action) this phone's push key in the Keychain (OSStatus \(status)). Turn notifications off and on again in Settings.",
      code: "keychain")
  }
}
