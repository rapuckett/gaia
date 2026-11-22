// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import ExpoModulesCore

/// Each paired PC's push handle, relay credentials and payload key, kept in the Keychain; see PushKeychain.
public class GaiaPushModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GaiaPush")

    // A build without push has no shared Keychain group (plugins/withPush.js).
    Constant("available") { PushKeychain.group != nil }

    AsyncFunction("save") { (pcId: String, handle: String, secret: String, sendToken: String, key: String) throws in
      try guarded("save") {
        try PushKeychain.saveKey(pcId, PushKeychain.Key(handle: handle, key: key))
        try PushKeychain.saveCredentials(pcId, PushKeychain.Credentials(secret: secret, sendToken: sendToken))
      }
    }

    AsyncFunction("load") { (pcId: String) throws -> [String: String]? in
      try guarded("read") {
        guard let entry = try PushKeychain.key(pcId), let credentials = try PushKeychain.credentials(pcId) else { return nil }
        return ["handle": entry.handle, "secret": credentials.secret, "sendToken": credentials.sendToken, "key": entry.key]
      }
    }

    AsyncFunction("pcIds") { () throws -> [String] in
      try guarded("read") { try PushKeychain.pcIds() }
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
