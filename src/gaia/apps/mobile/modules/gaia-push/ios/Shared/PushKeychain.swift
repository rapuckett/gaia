// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

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

  /// The relay's secret (token rotation, delete) and the send token the PC was given.
  struct Credentials: Codable {
    let secret: String
    let sendToken: String
  }

  private static let keyService = "ai.amd.gaia.push.key"
  private static let secretService = "ai.amd.gaia.push.secret"
  private static let settingsService = "ai.amd.gaia.push.settings"
  private static let languageAccount = "language"
  private static let groupPlistKey = "GAIAPushKeychainGroup"

  /// Set by plugins/push/withPushIos.js in both bundles' Info.plist; a build without push has none.
  static var group: String? {
    guard let value = Bundle.main.object(forInfoDictionaryKey: groupPlistKey) as? String, !value.isEmpty, !value.hasPrefix("$(") else { return nil }
    return value
  }

  static func saveKey(_ pcId: String, _ key: Key) throws {
    try put(shared(keyService, pcId), JSONEncoder().encode(key))
  }

  static func saveCredentials(_ pcId: String, _ credentials: Credentials) throws {
    try put(own(secretService, pcId), JSONEncoder().encode(credentials))
  }

  static func key(_ pcId: String) throws -> Key? {
    guard let data = try get(shared(keyService, pcId)) else { return nil }
    return try JSONDecoder().decode(Key.self, from: data)
  }

  static func credentials(_ pcId: String) throws -> Credentials? {
    guard let data = try get(own(secretService, pcId)) else { return nil }
    return try JSONDecoder().decode(Credentials.self, from: data)
  }

  /// Every paired PC's handle and key, for the extension to try in turn.
  static func allKeys() throws -> [Key] {
    try all(keyService).compactMap { try? JSONDecoder().decode(Key.self, from: $0.data) }
  }

  /// The PC ids that have a push key on this phone.
  static func pcIds() throws -> [String] {
    try all(keyService).map(\.account)
  }

  static func delete(_ pcId: String) throws {
    try remove(shared(keyService, pcId))
    try remove(own(secretService, pcId))
  }

  static func deleteAll() throws {
    var keys = try base(keyService)
    keys.removeValue(forKey: kSecAttrAccount as String)
    try remove(keys)
    try remove([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: secretService])
  }

  /// The app's own language (`en`, `ar`), or nil to follow the phone; the extension can't read the app's per-app language.
  static func saveLanguage(_ code: String?) throws {
    let query = try shared(settingsService, languageAccount)
    if let code { try put(query, Data(code.utf8)) } else { try remove(query) }
  }

  static func language() -> String? {
    guard let query = try? shared(settingsService, languageAccount), let data = try? get(query) else { return nil }
    return String(data: data, encoding: .utf8)
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

  private static func put(_ query: [String: Any], _ data: Data) throws {
    try remove(query)
    var item = query
    item[kSecValueData as String] = data
    // The extension runs while the phone is locked, so after first unlock; never synced or restored to another phone.
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else { throw PushKeychainError.status("save", status) }
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

  private static func all(_ service: String) throws -> [(account: String, data: Data)] {
    var query = try base(service)
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
