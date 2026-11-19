// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation
import Network

/// The listener was ended (cancelled, or a newer one replaced it) before it was ready.
struct LoopbackCancelled: Error {}

/// A one-shot HTTP listener on 127.0.0.1 for one sign-in redirect. Every piece of state lives on `queue`.
/// It never logs a request: the query carries the authorization code and state.
final class LoopbackListener {
  static let hardCap: TimeInterval = 15 * 60
  private static let connectionTimeout: TimeInterval = 10

  private let returnUrl: String
  private let queue = DispatchQueue(label: "ai.amd.gaia.oauth-loopback")
  private var listener: NWListener?
  private var connections: [ObjectIdentifier: NWConnection] = [:]
  private var expectedState: String?
  private var waiter: ((LoopbackOutcome) -> Void)?
  private var waitTimer: DispatchWorkItem?
  private var startedAt = Date()
  private var consumed = false
  private var ended = false

  init(returnUrl: String) {
    self.returnUrl = returnUrl
  }

  /// Binds a port the system picks on loopback and reports it once the listener is ready.
  func start(_ done: @escaping (Result<UInt16, Error>) -> Void) {
    queue.async { [weak self] in
      guard let self else { return }
      guard !self.ended else {
        done(.failure(LoopbackCancelled()))
        return
      }
      let params = NWParameters.tcp
      params.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
      params.requiredInterfaceType = .loopback
      params.acceptLocalOnly = true
      params.includePeerToPeer = false
      let listener: NWListener
      do {
        listener = try NWListener(using: params)
      } catch {
        done(.failure(error))
        return
      }
      self.listener = listener
      self.startedAt = Date()
      var reported = false
      listener.stateUpdateHandler = { [weak self] state in
        switch state {
        case .ready:
          guard !reported, let port = listener.port?.rawValue, port != 0 else { return }
          reported = true
          done(.success(port))
        case let .failed(error):
          if !reported {
            reported = true
            done(.failure(error))
            self?.end(.cancelled)
          } else {
            self?.end(.lost)
          }
        case .waiting:
          // After ready, the system took the port away (a reclaimed listener); before it, the bind is still retrying.
          if reported { self?.end(.lost) }
        case .cancelled:
          // Ended before it was ready: start still has to settle.
          if !reported {
            reported = true
            done(.failure(LoopbackCancelled()))
          }
        default:
          break
        }
      }
      listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
      listener.start(queue: self.queue)
      self.queue.asyncAfter(deadline: .now() + Self.hardCap) { [weak self] in self?.end(.timeout) }
    }
  }

  /// Waits for the redirect that carries `expectedState`; before this is called every request is refused.
  func wait(expectedState: String, timeout: TimeInterval, _ done: @escaping (LoopbackOutcome?) -> Void) {
    queue.async { [weak self] in
      guard let self else {
        done(nil)
        return
      }
      guard !self.ended, self.waiter == nil else {
        done(nil)
        return
      }
      self.expectedState = expectedState
      self.waiter = done
      let remaining = Self.hardCap - Date().timeIntervalSince(self.startedAt)
      let timer = DispatchWorkItem { [weak self] in self?.end(.timeout) }
      self.waitTimer = timer
      self.queue.asyncAfter(deadline: .now() + max(0, min(timeout, remaining)), execute: timer)
    }
  }

  func cancel() {
    queue.async { self.end(.cancelled) }
  }

  private func accept(_ connection: NWConnection) {
    guard !consumed, !ended, Self.isLoopback(connection.endpoint) else {
      connection.cancel()
      return
    }
    connections[ObjectIdentifier(connection)] = connection
    connection.stateUpdateHandler = { [weak self, weak connection] state in
      guard let connection else { return }
      switch state {
      case .failed, .cancelled: self?.connections[ObjectIdentifier(connection)] = nil
      default: break
      }
    }
    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + Self.connectionTimeout) { [weak connection] in connection?.cancel() }
    receive(connection, Data())
  }

  private func receive(_ connection: NWConnection, _ buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
      guard let self else { return }
      var buffer = buffer
      if let data { buffer.append(data) }
      if let length = LoopbackRequest.headLength(buffer), length <= LoopbackRequest.maxHeadBytes {
        self.answer(connection, LoopbackRequest.decide(head: buffer.prefix(length), expectedState: self.consumed ? nil : self.expectedState))
      } else if buffer.count > LoopbackRequest.maxHeadBytes {
        self.answer(connection, .tooLarge)
      } else if isComplete || error != nil {
        connection.cancel()
      } else {
        self.receive(connection, buffer)
      }
    }
  }

  private func answer(_ connection: NWConnection, _ decision: LoopbackDecision) {
    var outcome: LoopbackOutcome?
    if case let .accept(accepted) = decision {
      // The one request is taken: nothing else is accepted from here on.
      consumed = true
      listener?.cancel()
      outcome = accepted
    }
    let bytes = LoopbackRequest.response(decision, returnUrl: returnUrl)
    connection.send(content: bytes, completion: .contentProcessed { [weak self] _ in
      connection.cancel()
      if let outcome { self?.end(outcome) }
    })
  }

  private func end(_ outcome: LoopbackOutcome) {
    guard !ended else { return }
    ended = true
    waitTimer?.cancel()
    waitTimer = nil
    listener?.cancel()
    listener = nil
    for connection in connections.values { connection.cancel() }
    connections.removeAll()
    expectedState = nil
    let waiter = self.waiter
    self.waiter = nil
    waiter?(outcome)
  }

  private static func isLoopback(_ endpoint: NWEndpoint) -> Bool {
    guard case let .hostPort(host, _) = endpoint else { return false }
    switch host {
    case let .ipv4(address): return address.isLoopback
    case let .ipv6(address): return address.isLoopback
    default: return false
    }
  }
}
