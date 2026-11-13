// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ENDPOINTS, MESSAGE_PAGE_SIZE, SESSION_PAGE_SIZE, UI_HEADERS } from './constants';

const GAIA = resolve(__dirname, '../../../..');
const UI_DIR = join(GAIA, 'ui');
const WEBUI_API = join(GAIA, 'apps/webui/src/services/api.ts');

function pythonFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((e) => e.isFile() && e.name.endsWith('.py'))
        .map((e) => join(e.parentPath, e.name));
}

function pyString(source: string, name: string): string {
    const match = new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, 'm').exec(source);
    if (!match) throw new Error(`${name} not found in security.py; update api/constants.test.ts`);
    return match[1]!;
}

describe('request headers', () => {
    it('match the backend guard in ui/security.py', () => {
        const security = readFileSync(join(UI_DIR, 'security.py'), 'utf-8');
        const backend = {
            [pyString(security, 'UI_HEADER_NAME')]: pyString(security, 'UI_HEADER_VALUE'),
            [pyString(security, 'CLIENT_HEADER_NAME')]: pyString(security, 'AGENT_UI_CLIENT'),
        };
        const ours = Object.fromEntries(Object.entries(UI_HEADERS).map(([k, v]) => [k.toLowerCase(), v]));
        expect(ours).toEqual(backend);
    });

    it("match webui's UI_HEADER", () => {
        const api = readFileSync(WEBUI_API, 'utf-8');
        const match = /export const UI_HEADER = \{([^}]*)\}/.exec(api);
        if (!match) throw new Error('UI_HEADER not found in webui services/api.ts; update api/constants.test.ts');
        const webui = Object.fromEntries(
            [...match[1]!.matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)].map((m) => [m[1]!, m[2]!]),
        );
        const ours = Object.fromEntries(Object.entries(UI_HEADERS).map(([k, v]) => [k.toLowerCase(), v]));
        expect(ours).toEqual(webui);
    });
});

describe('endpoints', () => {
    const decorators = pythonFiles(UI_DIR).flatMap((file) =>
        [...readFileSync(file, 'utf-8').matchAll(/@(?:router|app)\.(get|post)\(\s*"([^"]+)"/g)].map(
            (m) => `${m[1]!.toUpperCase()} ${m[2]!}`,
        ),
    );
    const methods: Record<keyof typeof ENDPOINTS, string> = {
        health: 'GET',
        sessions: 'GET',
        sessionMessages: 'GET',
        chatSend: 'POST',
        documentFile: 'GET',
    };

    it.each(Object.entries(ENDPOINTS))('%s (%s) has a route under src/gaia/ui', (name, path) => {
        const method = methods[name as keyof typeof ENDPOINTS];
        expect(decorators).toContain(`${method} ${path}`);
    });
});

describe('page sizes', () => {
    const sessions = readFileSync(join(UI_DIR, 'routers/sessions.py'), 'utf-8');

    it('sessions: the largest page the backend serves', () => {
        expect(sessions).toContain(`limit = max(1, min(limit, ${SESSION_PAGE_SIZE}))`);
    });

    it('messages: within what the backend serves, and its default page', () => {
        expect(sessions).toContain(`    limit: int = ${MESSAGE_PAGE_SIZE},`);
    });
});
