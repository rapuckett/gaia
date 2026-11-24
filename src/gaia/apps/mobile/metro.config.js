// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const webui = path.resolve(__dirname, '../webui/src');

const config = getDefaultConfig(__dirname);

// All of webui's source, so any `@webui/*` import resolves; Metro bundles only what the app imports.
config.watchFolders = [...(config.watchFolders ?? []), webui];
// Packages for files under webui (an imported png's asset registry, too) resolve from the app, as in jest.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

// MathJax's SVG output imports its default font; the TeX font is the one drawn (MathJax's `#default-font` switch).
const MATHJAX_FONT = '#default-font/';
// remark-math needs only the syntax; the package's index also loads KaTeX for HTML output.
const MATH_SYNTAX = path.resolve(__dirname, 'node_modules/micromark-extension-math/lib/syntax.js');
const resolveUpstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve = resolveUpstream ?? context.resolveRequest;
    if (moduleName.startsWith(MATHJAX_FONT)) return resolve(context, `@mathjax/mathjax-tex-font/cjs/${moduleName.slice(MATHJAX_FONT.length)}`, platform);
    if (moduleName === 'micromark-extension-math') return { type: 'sourceFile', filePath: MATH_SYNTAX };
    return resolve(context, moduleName, platform);
};

module.exports = config;
