// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import CryptoKit
import Foundation
import Security

enum PushKeychainError: Error {
  case noGroup
  case status(String, OSStatus)
}

/// The push items in the Keychain group the app shares with its notification extension. Each paired PC's
/// handle and key sit there; the relay credentials, which only the app needs, stay in the app's own group.
enum PushKeychain {
  struct Key: Codable {
    let handle: String
    let key: String
  }

  /// The relay handle with its secret (token rotation, delete) and the send token the PC was given; kept after the key is dropped, until the relay deletes the handle.
  struct Credentials: Codable {
    let handle: String
    let secret: String
    let sendToken: String
  }

  private static let keyService = "ai.amd.gaia.push.key"
  private static let seqService = "ai.amd.gaia.push.seq"
  private static let secretService = "ai.amd.gaia.push.secret"
  private static let settingsService = "ai.amd.gaia.push.settings"
  private static let actionService = "ai.amd.gaia.push.action"
  private static let languageAccount = "language"
  private static let groupPlistKey = "GAIAPushKeychainGroup"

  /// Set by plugins/push/withPushIos.js in both bundles' Info.plist; a build without push has none.
  static var group: String? {
    guard let value = Bundle.main.object(forInfoDictionaryKey: groupPlistKey) as? String, !value.isEmpty, !value.hasPrefix("$(") else { return nil }
    return value
  }

  // Only the app writes keys and credentials; the extension and the silent-push handler write only seq and action items.

  /// A new key starts with no seq item, so it accepts any first `seq`.
  static func saveKey(_ pcId: String, _ key: Key) throws {
    try clearSeqs(pcId)
    try upsert(shared(keyService, pcId), JSONEncoder().encode(key))
  }

  static func saveCredentials(_ pcId: String, _ credentials: Credentials) throws {
    try upsert(own(secretService, pcId), JSONEncoder().encode(credentials))
  }

  static func key(_ pcId: String) throws -> Key? {
    guard let data = try get(shared(keyService, pcId)) else { return nil }
    return try JSONDecoder().decode(Key.self, from: data)
  }

  static func credentials(_ pcId: String) throws -> Credentials? {
    guard let data = try get(own(secretService, pcId)) else { return nil }
    return try JSONDecoder().decode(Credentials.self, from: data)
  }

  /// Every paired PC's handle and key, by PC id, for the extension to try in turn.
  static func allKeys() throws -> [(pcId: String, key: Key)] {
    try all(try base(keyService)).compactMap { item in
      guard let key = try? JSONDecoder().decode(Key.self, from: item.data) else { return nil }
      return (item.account, key)
    }
  }

  /// The PC ids with a push registration on this phone, including one whose key is gone but whose relay handle isn't deleted yet.
  static func pcIds() throws -> [String] {
    let keys = try all(try base(keyService)).map(\.account)
    let credentials = try all([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: secretService]).map(\.account)
    return Array(Set(keys + credentials)).sorted()
  }

  /// Stops this phone opening that PC's pushes, keeping the relay credentials until the handle is deleted there.
  static func deleteKey(_ pcId: String) throws {
    try remove(shared(keyService, pcId))
    try clearSeqs(pcId)
  }

  /// Takes a payload's `seq` if it's above the last one accepted under this PC's current key, and records the larger. False for a replay.
  static func accept(_ pcId: String, key: String, seq: Int64) throws -> Bool {
    let query = try shared(seqService, seqAccount(pcId, key))
    guard let last = try readSeq(query) else {
      let status = SecItemAdd(item(query, seqData(seq)) as CFDictionary, nil)
      if status == errSecSuccess { return true }
      guard status == errSecDuplicateItem else { throw PushKeychainError.status("save", status) }
      // Another process wrote it first: fall through to compare with its value.
      return try accept(pcId, key: key, seq: seq)
    }
    if seq <= last { return false }
    // Re-read just before writing and keep the larger, so a racing writer can't move it back.
    let latest = try readSeq(query) ?? last
    let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: seqData(max(seq, latest))] as CFDictionary)
    guard status == errSecSuccess else { throw PushKeychainError.status("save", status) }
    return seq > latest
  }

  static func delete(_ pcId: String) throws {
    try remove(shared(keyService, pcId))
    try clearSeqs(pcId)
    try remove(own(secretService, pcId))
  }

  static func deleteAll() throws {
    for service in [keyService, seqService, actionService] {
      var query = try base(service)
      query.removeValue(forKey: kSecAttrAccount as String)
      try remove(query)
    }
    try remove([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: secretService])
  }

  /// The app's own language (`en`, `ar`), or nil to follow the phone; the extension can't read the app's per-app language.
  static func saveLanguage(_ code: String?) throws {
    let query = try shared(settingsService, languageAccount)
    if let code { try upsert(query, Data(code.utf8)) } else { try remove(query) }
  }

  static func language() -> String? {
    guard let query = try? shared(settingsService, languageAccount), let data = try? get(query) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  /// The notification actions' records, in the shared group: the extension adds them, the app reads and consumes them.
  struct ActionStorage: PushActionStorage {
    func add(_ token: String, _ data: Data) throws {
      let status = SecItemAdd(PushKeychain.item(try PushKeychain.shared(PushKeychain.actionService, token), data) as CFDictionary, nil)
      guard status == errSecSuccess else { throw PushKeychainError.status("save", status) }
    }

    func read(_ token: String) throws -> Data? {
      try PushKeychain.get(try PushKeychain.shared(PushKeychain.actionService, token))
    }

    func take(_ token: String) throws -> Data? {
      let query = try PushKeychain.shared(PushKeychain.actionService, token)
      guard let data = try PushKeychain.get(query) else { return nil }
      // Whoever deletes it consumes it: a second consume, in this process or another, finds nothing to delete.
      let status = SecItemDelete(query as CFDictionary)
      if status == errSecItemNotFound { return nil }
      guard status == errSecSuccess else { throw PushKeychainError.status("delete", status) }
      return data
    }

    func all() throws -> [(token: String, data: Data)] {
      try PushKeychain.all(try PushKeychain.base(PushKeychain.actionService)).map { ($0.account, $0.data) }
    }

    func remove(_ token: String) throws {
      try PushKeychain.remove(try PushKeychain.shared(PushKeychain.actionService, token))
    }
  }

  /// One seq item per PC and key: the PC id and the first 8 bytes of SHA-256 of the key, in hex.
  private static func seqAccount(_ pcId: String, _ key: String) -> String {
    let digest = SHA256.hash(data: Data(key.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
    return "\(pcId)|\(digest)"
  }

  private static func seqData(_ seq: Int64) -> Data { Data(String(seq).utf8) }

  private static func readSeq(_ query: [String: Any]) throws -> Int64? {
    guard let data = try get(query) else { return nil }
    guard let text = String(data: data, encoding: .utf8), let seq = Int64(text) else { throw PushKeychainError.status("read", errSecDecode) }
    return seq
  }

  private static func clearSeqs(_ pcId: String) throws {
    for item in try all(try base(seqService)) where item.account.hasPrefix("\(pcId)|") {
      try remove(try shared(seqService, item.account))
    }
  }

  private static func base(_ service: String) throws -> [String: Any] {
    guard let group else { throw PushKeychainError.noGroup }
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccessGroup as String: group,
    ]
  }

  private static func shared(_ service: String, _ account: String) throws -> [String: Any] {
    var query = try base(service)
    query[kSecAttrAccount as String] = account
    return query
  }

  private static func own(_ service: String, _ account: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
  }

  private static func item(_ query: [String: Any], _ data: Data) -> [String: Any] {
    var item = query
    item[kSecValueData as String] = data
    // The extension runs while the phone is locked, so after first unlock; never synced or restored to another phone.
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return item
  }

  /// Updates the item in place, or adds it when missing: never a delete-then-add that a crash could leave empty.
  private static func upsert(_ query: [String: Any], _ data: Data) throws {
    let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecSuccess { return }
    guard status == errSecItemNotFound else { throw PushKeychainError.status("save", status) }
    let added = SecItemAdd(item(query, data) as CFDictionary, nil)
    guard added == errSecSuccess else { throw PushKeychainError.status("save", added) }
  }

  private static func get(_ query: [String: Any]) throws -> Data? {
    var item = query
    item[kSecReturnData as String] = true
    item[kSecMatchLimit as String] = kSecMatchLimitOne
    var found: CFTypeRef?
    let status = SecItemCopyMatching(item as CFDictionary, &found)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = found as? Data else { throw PushKeychainError.status("read", status) }
    return data
  }

  private static func all(_ base: [String: Any]) throws -> [(account: String, data: Data)] {
    var query = base
    query[kSecReturnData as String] = true
    query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitAll
    var found: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &found)
    if status == errSecItemNotFound { return [] }
    guard status == errSecSuccess, let items = found as? [[String: Any]] else { throw PushKeychainError.status("read", status) }
    return items.compactMap { item in
      guard let account = item[kSecAttrAccount as String] as? String, let data = item[kSecValueData as String] as? Data else { return nil }
      return (account, data)
    }
  }

  private static func remove(_ query: [String: Any]) throws {
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw PushKeychainError.status("delete", status) }
  }
}
