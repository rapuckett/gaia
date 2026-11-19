// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation

/// What one sign-in redirect brought back.
enum LoopbackOutcome: Equatable {
  case code(code: String, state: String)
  /// The provider's `error`, such as access_denied.
  case providerError(String)
  case timeout
  case cancelled
  /// The phone took the port away (the app was suspended, or the socket failed) before the redirect came.
  case lost

  var dictionary: [String: String] {
    switch self {
    case let .code(code, state): return ["outcome": "code", "code": code, "state": state]
    case let .providerError(error): return ["outcome": "error", "error": error]
    case .timeout: return ["outcome": "timeout"]
    case .cancelled: return ["outcome": "cancelled"]
    case .lost: return ["outcome": "lost"]
    }
  }
}

/// How the listener answers one request. Only `.accept` uses up the listener.
enum LoopbackDecision: Equatable {
  case accept(LoopbackOutcome)
  case notFound
  case methodNotAllowed
  case badRequest
  case tooLarge
}

/// The listener's request handling, without sockets, so it reads as plain functions.
enum LoopbackRequest {
  static let callbackPath = "/callback"
  static let maxHeadBytes = 8 * 1024
  static let maxCodeLength = 4096
  private static let headTerminator = Data("\r\n\r\n".utf8)
  // A reverse-DNS app scheme and one host, e.g. ai.amd.gaia.mobile://oauth-done; never http(s).
  // \A and \z: `$` would also match before a trailing newline.
  private static let returnUrlPattern = try! NSRegularExpression(pattern: "\\A[a-z][a-z0-9-]*(\\.[a-z0-9-]+)+://[a-z0-9-]+\\z")
  private static let errorPattern = try! NSRegularExpression(pattern: "\\A[A-Za-z0-9_.-]{1,64}\\z")

  static func isReturnUrl(_ url: String) -> Bool {
    matches(returnUrlPattern, url) && !url.hasPrefix("http")
  }

  /// The byte count of the request head, terminator included, once it has all arrived.
  static func headLength(_ buffer: Data) -> Int? {
    guard let range = buffer.range(of: headTerminator) else { return nil }
    return range.upperBound - buffer.startIndex
  }

  /// Decides the answer to a request head. `expectedState` is nil until the sign-in link exists; until then nothing is accepted.
  static func decide(head: Data, expectedState: String?) -> LoopbackDecision {
    guard let text = String(data: head, encoding: .utf8),
          let line = text.components(separatedBy: "\r\n").first
    else { return .badRequest }
    let parts = line.split(separator: " ", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[2].hasPrefix("HTTP/1.") else { return .badRequest }
    let method = String(parts[0])
    let target = String(parts[1])
    let pathEnd = target.firstIndex(where: { $0 == "?" || $0 == "#" }) ?? target.endIndex
    guard target[..<pathEnd] == callbackPath, let expectedState else { return .notFound }
    guard method == "GET" else { return .methodNotAllowed }
    guard target[pathEnd...].first != "#" else { return .badRequest }
    let query = pathEnd < target.endIndex ? String(target[target.index(after: pathEnd)...]) : ""
    guard let params = parseQuery(query) else { return .badRequest }
    guard let state = params["state"], constantTimeEqual(state, expectedState) else { return .badRequest }
    if let error = params["error"] {
      return .accept(.providerError(matches(errorPattern, error) ? error : "invalid_error"))
    }
    guard let code = params["code"], !code.isEmpty, code.count <= maxCodeLength else { return .badRequest }
    return .accept(.code(code: code, state: state))
  }

  /// A form-encoded query as one value per name; nil when it is malformed or names code, state or error twice.
  static func parseQuery(_ query: String) -> [String: String]? {
    var params: [String: String] = [:]
    for pair in query.split(separator: "&", omittingEmptySubsequences: true) {
      let pieces = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      guard let name = formDecode(String(pieces[0])) else { return nil }
      guard let value = formDecode(pieces.count > 1 ? String(pieces[1]) : "") else { return nil }
      if params[name] != nil, ["code", "state", "error"].contains(name) { return nil }
      params[name] = value
    }
    return params
  }

  /// `+` as a space and %XX as UTF-8 bytes; nil for a broken escape or bytes that aren't UTF-8.
  static func formDecode(_ text: String) -> String? {
    var bytes: [UInt8] = []
    var iterator = Array(text.utf8).makeIterator()
    while let byte = iterator.next() {
      switch byte {
      case UInt8(ascii: "+"): bytes.append(UInt8(ascii: " "))
      case UInt8(ascii: "%"):
        guard let high = iterator.next().flatMap(hexValue), let low = iterator.next().flatMap(hexValue) else { return nil }
        bytes.append(high << 4 | low)
      default: bytes.append(byte)
      }
    }
    return String(bytes: bytes, encoding: .utf8)
  }

  /// The whole HTTP response for a decision; the accepted one sends the browser back to the app.
  static func response(_ decision: LoopbackDecision, returnUrl: String) -> Data {
    let status: String
    var headers = [
      "Content-Type: text/html; charset=utf-8",
      "Cache-Control: no-store",
      "Referrer-Policy: no-referrer",
      "Content-Security-Policy: default-src 'none'",
      "Connection: close",
    ]
    let body: String
    switch decision {
    case .accept:
      status = "302 Found"
      headers.append("Location: \(returnUrl)")
      body = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>GAIA</title></head>"
        + "<body><p>Sign-in is finishing in GAIA.</p><p><a href=\"\(returnUrl)\">Return to GAIA</a></p></body></html>"
    case .notFound:
      status = "404 Not Found"
      body = "Not found"
    case .methodNotAllowed:
      status = "405 Method Not Allowed"
      body = "Method not allowed"
    case .badRequest:
      status = "400 Bad Request"
      body = "Bad request"
    case .tooLarge:
      status = "431 Request Header Fields Too Large"
      body = "Request too large"
    }
    let bodyData = Data(body.utf8)
    headers.append("Content-Length: \(bodyData.count)")
    var data = Data("HTTP/1.1 \(status)\r\n\(headers.joined(separator: "\r\n"))\r\n\r\n".utf8)
    data.append(bodyData)
    return data
  }

  private static func hexValue(_ byte: UInt8) -> UInt8? {
    switch byte {
    case UInt8(ascii: "0")...UInt8(ascii: "9"): return byte - UInt8(ascii: "0")
    case UInt8(ascii: "a")...UInt8(ascii: "f"): return byte - UInt8(ascii: "a") + 10
    case UInt8(ascii: "A")...UInt8(ascii: "F"): return byte - UInt8(ascii: "A") + 10
    default: return nil
    }
  }

  private static func constantTimeEqual(_ a: String, _ b: String) -> Bool {
    let x = Array(a.utf8), y = Array(b.utf8)
    guard x.count == y.count else { return false }
    var diff: UInt8 = 0
    for i in 0..<x.count { diff |= x[i] ^ y[i] }
    return diff == 0
  }

  private static func matches(_ pattern: NSRegularExpression, _ text: String) -> Bool {
    pattern.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
  }
}
