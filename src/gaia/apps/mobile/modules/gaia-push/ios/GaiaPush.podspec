# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

Pod::Spec.new do |s|
  s.name           = 'GaiaPush'
  s.version        = '0.1.0'
  s.summary        = 'Push keys in the Keychain group shared with the notification extension, and silent badge pushes.'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Advanced Micro Devices, Inc.'
  s.homepage       = 'https://amd-gaia.ai'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # NotificationService/ is the extension's entry point; plugins/push/withPushIos.js copies it and Shared/ into the extension.
  s.source_files = '*.swift', 'Shared/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
