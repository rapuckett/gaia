// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT
/**
 * End-to-end tests of the phone app's web export against a real Agent UI
 * backend with a scripted fake LLM (gaia.testing.dev_backend), in headless
 * Chromium.
 *
 *   GAIA_E2E_PYTHON=/path/to/venv/bin/python \
 *   GAIA_VISUAL_CHROMIUM=/path/to/chromium_headless_shell \
 *   npm run test:e2e-web
 *
 * Pairing is not covered yet: pair-redeem isn't ready, so the app connects
 * through EXPO_PUBLIC_GAIA_URL, which the global setup bakes into the export.
 */

import { defineConfig } from '@playwright/test';

import { APP_URL } from './harness';

export default defineConfig({
    testDir: '.',
    testMatch: '*.e2e.ts',
    outputDir: 'test-results',
    globalSetup: './global-setup.ts',
    workers: 1,
    fullyParallel: false,
    reporter: [['list']],
    timeout: 90_000,
    expect: { timeout: 20_000 },
    use: {
        baseURL: APP_URL,
        viewport: { width: 1024, height: 800 },
        launchOptions: { executablePath: process.env.GAIA_VISUAL_CHROMIUM || undefined },
    },
});
