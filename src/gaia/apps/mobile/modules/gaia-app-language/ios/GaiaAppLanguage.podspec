# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

Pod::Spec.new do |s|
  s.name           = 'GaiaAppLanguage'
  s.version        = '0.1.0'
  s.summary        = "GAIA's own language setting (AppleLanguages in the app's domain), never the device's."
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Advanced Micro Devices, Inc.'
  s.homepage       = 'https://amd-gaia.ai'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
