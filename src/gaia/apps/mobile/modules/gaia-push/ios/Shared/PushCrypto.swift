// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import CryptoKit
import Foundation

enum PushCryptoError: Error {
  case malformed
  case noKey
  case replay
}

/// Opens what the PC sealed for this phone; the layout is documented in src/features/push/pushCrypto.ts.
enum PushCrypto {
  static let version: UInt8 = 1
  static let nonceBytes = 12
  static let tagBytes = 16
  static let keyBytes = 32

  /// UTF-8 of the handle as the relay issued it (base64url text), then one byte: the payload version.
  static func aad(handle: String) -> Data {
    var data = Data(handle.utf8)
    data.append(version)
    return data
  }

  /// `ciphertext` is base64url of the AES-256-GCM ciphertext with its 16-byte tag appended; `nonce` is base64url of 12 bytes.
  static func open(ciphertext: String, nonce: String, key: String, handle: String) throws -> Data {
    guard let sealed = base64url(ciphertext), let iv = base64url(nonce), let raw = base64url(key),
      iv.count == nonceBytes, raw.count == keyBytes, sealed.count >= tagBytes
    else { throw PushCryptoError.malformed }
    let box = try AES.GCM.SealedBox(
      nonce: AES.GCM.Nonce(data: iv),
      ciphertext: sealed.prefix(sealed.count - tagBytes),
      tag: sealed.suffix(tagBytes))
    return try AES.GCM.open(box, using: SymmetricKey(data: raw), authenticating: aad(handle: handle))
  }

  /// Tries each of this phone's push keys: one per paired PC, and the GCM tag tells them apart.
  static func open(ciphertext: String, nonce: String, keys: [(pcId: String, key: PushKeychain.Key)]) throws -> (pcId: String, key: PushKeychain.Key, plain: Data) {
    for entry in keys {
      if let plain = try? open(ciphertext: ciphertext, nonce: nonce, key: entry.key.key, handle: entry.key.handle) { return (entry.pcId, entry.key, plain) }
    }
    throw PushCryptoError.noKey
  }

  /// Opens a push and checks it isn't a replay: its `seq` must be newer than the last one accepted from that PC.
  static func openFresh(ciphertext: String, nonce: String) throws -> (pcId: String, payload: PushPayload) {
    let opened = try open(ciphertext: ciphertext, nonce: nonce, keys: try PushKeychain.allKeys())
    let payload = try PushPayload(json: opened.plain)
    guard try PushKeychain.accept(opened.pcId, key: opened.key.key, seq: payload.seq) else { throw PushCryptoError.replay }
    return (opened.pcId, payload)
  }

  static func base64url(_ text: String) -> Data? {
    var b64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    if b64.contains("=") { return nil }
    let pad = (4 - b64.count % 4) % 4
    if pad == 3 { return nil }
    b64 += String(repeating: "=", count: pad)
    return Data(base64Encoded: b64)
  }
}
