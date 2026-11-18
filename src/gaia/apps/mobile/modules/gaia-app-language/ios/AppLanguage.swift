// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Foundation

private let languagesKey = "AppleLanguages"

/// GAIA's language in iOS Settings: AppleLanguages in the app's own domain. The phone's list lives in the
/// global domain, which this never writes.
enum AppLanguage {
  /// The first language of the app's own setting; nil when the app follows the phone.
  static func current(_ defaults: UserDefaults, bundleId: String) -> String? {
    // standard's lookups fall through to the global domain, so read the app's domain alone.
    let languages = defaults.persistentDomain(forName: bundleId)?[languagesKey] as? [String]
    return languages?.first
  }

  /// nil removes the app's setting, so it follows the phone again.
  static func set(_ tag: String?, _ defaults: UserDefaults) {
    if let tag {
      defaults.set([tag], forKey: languagesKey)
    } else {
      defaults.removeObject(forKey: languagesKey)
    }
  }
}
