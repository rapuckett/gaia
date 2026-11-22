// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createFakeClient } from '@/api/fake';
import type { GaiaClient, LogLineInfo, LogReadResponse } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import type { LogSource } from '@/data';

export interface LogScene {
    source: LogSource;
    follow: boolean;
    problemsOnly: boolean;
    read: LogReadResponse | Error;
    /** What the file list answers; an Error is thrown. */
    files?: string[];
}

/** Made-up lines with generic paths; nothing here comes from a real log. */
const SAMPLE_LINES: LogLineInfo[] = [
    { text: '2026-01-01 09:00:01 INFO  server: listening on http://127.0.0.1:0000', severity: 'info' },
    { text: '2026-01-01 09:00:02 INFO  model: loading example-model (ctx 65536)', severity: 'info' },
    { text: '2026-01-01 09:00:05 WARNING  model: free memory is low, window reduced to 32768', severity: 'warning' },
    { text: '2026-01-01 09:00:07 INFO  chat: turn started', severity: 'info' },
    { text: '2026-01-01 09:00:09 ERROR  tool: could not read /example/folder/file.txt (permission denied)', severity: 'error' },
    { text: '2026-01-01 09:00:10 DEBUG  chat: retrying with a shorter prompt', severity: 'debug' },
    { text: '2026-01-01 09:00:12 INFO  chat: turn finished in 5.2 s', severity: 'info' },
    { text: 'a line that names no level, with a very long run of text that has to wrap inside the block instead of pushing the screen wider than the phone' },
];

const FILE_READ: LogReadResponse = {
    available: true,
    source: 'file',
    log_path: 'example-server.log',
    lines: SAMPLE_LINES,
    cursor: '1024',
    dropped: 0,
};

export const LOG_SCENES: Record<string, LogScene> = {
    errors: { source: 'gaia', follow: false, problemsOnly: false, read: FILE_READ, files: ['example-server.log', 'example-server.log.1'] },
    follow: { source: 'gaia', follow: true, problemsOnly: false, read: FILE_READ, files: ['example-server.log'] },
    filtered: { source: 'gaia', follow: false, problemsOnly: true, read: FILE_READ, files: ['example-server.log'] },
    empty: { source: 'service', follow: false, problemsOnly: false, read: { available: true, source: 'file', log_path: 'example-service.log', lines: [], cursor: '0' }, files: ['example-service.log'] },
    unavailable: {
        source: 'model_server',
        follow: false,
        problemsOnly: false,
        read: { available: false, reason: 'not_running', detail: 'Connection refused (example detail from the PC)', lines: [] },
        files: [],
    },
    failed: { source: 'gaia', follow: false, problemsOnly: false, read: new GaiaApiError(409, 'No Lemonade Server is chosen yet (example reason from the PC).'), files: ['example-server.log'] },
};

export function logSceneClient(scene: LogScene): GaiaClient {
    return createFakeClient({
        logSources: scene.files ? { sources: [{ id: scene.source, files: scene.files.map((name) => ({ name, path: name, size_bytes: 20_480 })) }] } : new GaiaApiError(503, 'none'),
        logReads: { [scene.source]: scene.read },
    });
}
