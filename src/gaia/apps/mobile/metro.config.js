// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const webui = path.resolve(__dirname, '../webui/src');

const config = getDefaultConfig(__dirname);

// Only the webui folders this app imports from; paths come from tsconfig `@webui/*`.
config.watchFolders = [...(config.watchFolders ?? []), path.join(webui, 'i18n'), path.join(webui, 'types'), path.join(webui, 'utils')];

module.exports = config;
