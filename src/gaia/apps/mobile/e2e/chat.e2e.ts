// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// Pairing is not covered: pair-redeem isn't ready, so the app connects through EXPO_PUBLIC_GAIA_URL.

import fs from 'node:fs';
import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { type Backend, OUT_DIR, type ScriptEntry, startBackend } from './harness';

let backend: Backend | null = null;

test.afterEach(async () => {
    await backend?.stop();
    backend = null;
});

const writeCall = (file: string): ScriptEntry => ({ tool_call: { name: 'write_file', arguments: { file_path: file, content: 'hello' } } });

// The new-chat screen stays mounted under the open chat, so each composer test id matches twice.
const visible = (page: Page, testId: string) => page.getByTestId(testId).locator('visible=true');

async function send(page: Page, text: string) {
    await visible(page, 'composer-input').fill(text);
    await visible(page, 'composer-send').click();
}

test('a sent message streams its reply to the end', async ({ page }) => {
    backend = await startBackend(['Hello from the scripted model.']);
    await page.goto('/new');
    await send(page, 'Hi there');
    await expect(page.getByText('Hello from the scripted model.')).toBeVisible();
    await expect(visible(page, 'composer-stop')).toHaveCount(0);
});

for (const answer of ['Allow once', 'Deny'] as const) {
    test(`the approval card: ${answer} ${answer === 'Deny' ? 'leaves' : 'writes'} the file`, async ({ page }) => {
        const target = path.join(OUT_DIR, `${answer === 'Deny' ? 'denied' : 'allowed'}.txt`);
        fs.rmSync(target, { force: true });
        backend = await startBackend([writeCall(target), 'The write is settled.', 'Extra reply.']);
        await page.goto('/new');
        await send(page, 'Write the file');
        await page.getByRole('button', { name: answer }).click();
        await expect(page.getByText('The write is settled.')).toBeVisible();
        await expect(visible(page, 'composer-stop')).toHaveCount(0);
        if (answer === 'Allow once') expect(fs.readFileSync(target, 'utf8')).toBe('hello');
        else expect(fs.existsSync(target)).toBe(false);
    });
}

test('a message sent during a reply goes out after it', async ({ page }) => {
    const target = path.join(OUT_DIR, 'queue.txt');
    // The chat's title takes one completion after the first reply, ahead of the second message's.
    backend = await startBackend([writeCall(target), 'First reply done.', 'Queue title', 'Second reply done.', 'Extra reply.']);
    await page.goto('/new');
    await send(page, 'First message');
    // The reply is held open by the approval card, so the next message has to queue behind it.
    const allow = page.getByRole('button', { name: 'Allow once' });
    await expect(allow).toBeVisible();
    await send(page, 'Second message');
    await expect(page.getByText('Second reply done.')).toHaveCount(0);
    await allow.click();
    await expect(page.getByText('First reply done.')).toBeVisible();
    await expect(page.getByText('Second reply done.')).toBeVisible();
    await expect(visible(page, 'composer-stop')).toHaveCount(0);
});
