// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import ExpoModulesCore
import Foundation

/// The language GAIA itself uses, as iOS Settings › GAIA › Language shows it. Never the phone's language.
public class GaiaAppLanguageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GaiaAppLanguage")

    Constant("supported") { true }

    Function("get") { () throws -> String? in
      guard let bundleId = Bundle.main.bundleIdentifier else {
        throw Exception(name: "no_bundle_id", description: "The app has no bundle identifier, so its own language setting can't be read.", code: "no_bundle_id")
      }
      return AppLanguage.current(.standard, bundleId: bundleId)
    }

    Function("set") { (tag: String?) in
      AppLanguage.set(tag, .standard)
    }
  }
}
