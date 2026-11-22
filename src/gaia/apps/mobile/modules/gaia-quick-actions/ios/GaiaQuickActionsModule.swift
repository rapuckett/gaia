// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import ExpoModulesCore
import UIKit

struct QuickActionItem: Record {
  @Field var id: String = ""
  @Field var title: String = ""
}

/// The actions on GAIA's home-screen icon. Every one shows the system compose glyph (GAIA has one: New chat).
public class GaiaQuickActionsModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("GaiaQuickActions")

    Events("onAction")

    Function("takePending") { () -> String? in
      QuickActionInbox.take()
    }

    AsyncFunction("setItems") { (items: [QuickActionItem]) in
      UIApplication.shared.shortcutItems = items.map {
        UIApplicationShortcutItem(
          type: $0.id,
          localizedTitle: $0.title,
          localizedSubtitle: nil,
          icon: UIApplicationShortcutIcon(type: .compose),
          userInfo: nil
        )
      }
    }.runOnQueue(.main)

    OnStartObserving("onAction") {
      self.stopObserving()
      self.observer = NotificationCenter.default.addObserver(forName: QuickActionInbox.arrived, object: nil, queue: nil) { [weak self] _ in
        guard let self, let id = QuickActionInbox.take() else { return }
        self.sendEvent("onAction", ["id": id])
      }
    }

    OnStopObserving("onAction") {
      self.stopObserving()
    }
  }

  private func stopObserving() {
    if let observer {
      NotificationCenter.default.removeObserver(observer)
    }
    observer = nil
  }
}
