// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation
import Network

private let checkSeconds: TimeInterval = 2.5
/// kDNSServiceErr_PolicyDenied: how Network reports a connection the local network setting stopped.
private let policyDenied: Int32 = -65570

/// Why a home address gave no answer, from a bare TCP connection that sends nothing: `local_network_denied`
/// when iOS's local network setting stopped it, else `refused`, `timeout`, `unreachable`, or `reachable`.
final class LocalNetworkCheck: @unchecked Sendable {
  private let queue = DispatchQueue(label: "ai.amd.gaia.transport.local-network-check")
  private let connection: NWConnection
  private var done: ((String) -> Void)?

  init(host: String, port: NWEndpoint.Port) {
    connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
  }

  func run(_ done: @escaping (String) -> Void) {
    self.done = done
    connection.stateUpdateHandler = { [self] state in
      switch state {
      case .ready: answer("reachable")
      case .waiting(let error), .failed(let error): answer(denied() ? "local_network_denied" : reason(error))
      default: break
      }
    }
    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + checkSeconds) { [self] in answer(denied() ? "local_network_denied" : "timeout") }
  }

  /// Runs on `queue`; the first answer wins, and the connection is always cancelled.
  private func answer(_ result: String) {
    guard let done else { return }
    self.done = nil
    connection.stateUpdateHandler = nil
    connection.cancel()
    done(result)
  }

  private func denied() -> Bool {
    connection.currentPath?.unsatisfiedReason == .localNetworkDenied
  }
}

private func reason(_ error: NWError) -> String {
  switch error {
  case .posix(.ECONNREFUSED): return "refused"
  case .posix(.ETIMEDOUT): return "timeout"
  case .dns(let code) where code == policyDenied: return "local_network_denied"
  default: return "unreachable"
  }
}
