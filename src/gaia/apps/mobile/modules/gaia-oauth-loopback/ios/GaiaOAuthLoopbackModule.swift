// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import ExpoModulesCore
import Foundation
import UIKit

private func loopbackError(_ code: String, _ message: String) -> Exception {
  Exception(name: code, description: message, code: code)
}

/// Catches one sign-in redirect on this phone's loopback, so a browser sign-in can finish on the paired PC.
public class GaiaOAuthLoopbackModule: Module {
  private let lock = NSLock()
  private var current: LoopbackListener?

  public func definition() -> ModuleDefinition {
    Name("GaiaOAuthLoopback")

    // A new start ends the one before it.
    AsyncFunction("start") { (returnUrl: String, promise: Promise) in
      guard LoopbackRequest.isReturnUrl(returnUrl) else {
        promise.reject(loopbackError("invalid_return_url", "The sign-in return address must be this app's own link."))
        return
      }
      let listener = LoopbackListener(returnUrl: returnUrl)
      self.replace(with: listener)?.cancel()
      listener.start { result in
        switch result {
        case let .success(port):
          promise.resolve(["port": Int(port)])
        case .failure(is LoopbackCancelled):
          promise.reject(loopbackError("cancelled", "The sign-in listener was cancelled before it was ready."))
        case let .failure(error):
          promise.reject(loopbackError("listen_failed", "GAIA couldn't get ready for the sign-in on this phone (\(error.localizedDescription)). Try again."))
        }
      }
    }

    AsyncFunction("waitForRedirect") { (expectedState: String, timeoutMs: Double, promise: Promise) in
      guard let listener = self.listener() else {
        promise.reject(loopbackError("not_started", "No sign-in is waiting on this phone. Start it again."))
        return
      }
      // Keeps the port while the person is in another app (an authenticator) during the sign-in.
      let background = BackgroundTask()
      listener.wait(expectedState: expectedState, timeout: max(0, timeoutMs) / 1000) { outcome in
        background.end()
        if let outcome {
          promise.resolve(outcome.dictionary)
        } else {
          promise.reject(loopbackError("not_started", "No sign-in is waiting on this phone. Start it again."))
        }
      }
    }

    Function("cancel") {
      self.replace(with: nil)?.cancel()
    }

    OnDestroy {
      self.replace(with: nil)?.cancel()
    }
  }

  private func replace(with next: LoopbackListener?) -> LoopbackListener? {
    lock.lock()
    defer { lock.unlock() }
    let previous = current
    current = next
    return previous
  }

  private func listener() -> LoopbackListener? {
    lock.lock()
    defer { lock.unlock() }
    return current
  }
}

/// A background task held while a sign-in waits; ends once, whether the wait finishes or iOS runs out of time.
private final class BackgroundTask {
  private let lock = NSLock()
  private var id = UIBackgroundTaskIdentifier.invalid
  private var ended = false

  init() {
    // Safe off the main thread.
    let started = UIApplication.shared.beginBackgroundTask(withName: "GAIA sign-in") { [weak self] in self?.end() }
    lock.lock()
    let endNow = ended
    if !endNow { id = started }
    lock.unlock()
    if endNow, started != .invalid { UIApplication.shared.endBackgroundTask(started) }
  }

  func end() {
    lock.lock()
    let current = id
    id = .invalid
    ended = true
    lock.unlock()
    if current != .invalid { UIApplication.shared.endBackgroundTask(current) }
  }
}
