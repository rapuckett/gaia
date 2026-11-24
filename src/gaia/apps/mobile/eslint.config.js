// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

const { defineConfig, globalIgnores } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
    expo,
    globalIgnores(['dist/*', '.expo/*']),
    {
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'JSXAttribute[name.name="accessibilityState"]',
                    message: 'Use aria-expanded/checked/selected/disabled/busy: react-native-web 0.21 drops accessibilityState.',
                },
            ],
        },
    },
]);
