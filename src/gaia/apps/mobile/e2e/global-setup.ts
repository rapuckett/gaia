// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { exportWeb, OUT_DIR, requirePython, startStaticServer } from './harness';

// Exports the app once, serves it, and returns the teardown that stops the server and deletes both.
export default async function globalSetup(): Promise<() => Promise<void>> {
    requirePython();
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-e2e-export-'));
    fs.mkdirSync(OUT_DIR, { recursive: true });
    try {
        exportWeb(dist);
    } catch (e) {
        fs.rmSync(dist, { recursive: true, force: true });
        throw e;
    }
    const server = await startStaticServer(dist);
    return async () => {
        await new Promise((resolve) => server.close(resolve));
        server.closeAllConnections();
        fs.rmSync(dist, { recursive: true, force: true });
        fs.rmSync(OUT_DIR, { recursive: true, force: true });
    };
}
