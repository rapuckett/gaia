// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const HOST = '127.0.0.1';
const APP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_DIR, '../../../..');

// The static server is the app's origin and proxies /api to the backend, so the browser sees
// one origin and the backend's CORS list (first-party dev ports only) never applies.
export const STATIC_PORT = Number(process.env.GAIA_E2E_STATIC_PORT || 5185);
export const APP_URL = `http://${HOST}:${STATIC_PORT}`;
const BACKEND_PORT = Number(process.env.GAIA_E2E_BACKEND_PORT || 4212);
const LLM_PORT = Number(process.env.GAIA_E2E_LLM_PORT || 4213);
const READY_TIMEOUT_MS = 90_000;

// A path outside GAIA's home and the system temp dir is what makes write_file ask first.
export const OUT_DIR = path.join(APP_DIR, 'e2e', '.out');

export type ScriptEntry = string | { text: string } | { tool_call: { name: string; arguments: Record<string, unknown> } };

export function requirePython(): string {
    const value = process.env.GAIA_E2E_PYTHON;
    if (!value) {
        throw new Error('GAIA_E2E_PYTHON is not set. Point it at the Python of a GAIA dev environment (see e2e/playwright.config.ts).');
    }
    return value;
}

export interface Backend {
    home: string;
    stop(): Promise<void>;
}

// Starts gaia.testing.dev_backend with its own GAIA_HOME under the OS temp dir.
export async function startBackend(script: ScriptEntry[]): Promise<Backend> {
    const python = requirePython();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-e2e-home-'));
    const scriptFile = path.join(home, 'script.json');
    fs.writeFileSync(scriptFile, JSON.stringify(script));
    const args = ['-m', 'gaia.testing.dev_backend', '--port', String(BACKEND_PORT), '--llm-port', String(LLM_PORT), '--home', path.join(home, 'gaia'), '--script', scriptFile];
    // A scrubbed environment: nothing of the caller's GAIA or Lemonade settings leaks in.
    const child: ChildProcess = spawn(python, args, {
        env: { HOME: process.env.HOME ?? '', PATH: process.env.PATH ?? '', TMPDIR: os.tmpdir(), PYTHONPATH: path.join(REPO_ROOT, 'src') } as unknown as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (d) => (output += d));
    child.stderr?.on('data', (d) => (output += d));
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

    const stop = async () => {
        if (child.pid !== undefined && child.exitCode === null) {
            let kids: string[] = [];
            try {
                kids = execFileSync('pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).split('\n').filter(Boolean);
            } catch {
                // pgrep exits 1 when there are no children.
            }
            child.kill('SIGTERM');
            const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
            await exited;
            clearTimeout(timer);
            for (const k of kids) {
                try {
                    process.kill(Number(k), 'SIGTERM');
                } catch {
                    // already gone
                }
            }
        }
        fs.rmSync(home, { recursive: true, force: true });
    };

    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (!/^READY /m.test(output)) {
        if (child.exitCode !== null || Date.now() > deadline) {
            await stop();
            throw new Error(`dev backend did not become ready (ports ${BACKEND_PORT}/${LLM_PORT}). Output:\n${output}`);
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    return { home, stop };
}

const TYPES: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.map': 'application/json',
};

// Serves the export (index.html for every unknown path) and proxies /api to the backend.
export function startStaticServer(dir: string): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', APP_URL);
        if (url.pathname.startsWith('/api/')) {
            const upstream = http.request(
                { host: HOST, port: BACKEND_PORT, path: url.pathname + url.search, method: req.method, headers: { ...req.headers, host: `${HOST}:${BACKEND_PORT}` } },
                (up) => {
                    res.writeHead(up.statusCode ?? 502, up.headers);
                    up.pipe(res);
                },
            );
            upstream.on('error', (e) => {
                res.writeHead(502).end(`backend unreachable: ${e.message}`);
            });
            res.on('close', () => upstream.destroy());
            req.pipe(upstream);
            return;
        }
        let file = path.join(dir, path.normalize(url.pathname));
        if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(STATIC_PORT, HOST, () => resolve(server));
    });
}

// Builds the web export with the app pointed at the static server's origin.
export function exportWeb(outDir: string): void {
    execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', outDir], {
        cwd: APP_DIR,
        stdio: 'inherit',
        env: { ...process.env, APP_ENV: 'development', EXPO_PUBLIC_GAIA_URL: APP_URL, CI: '1' },
    });
}
