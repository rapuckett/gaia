// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browseFiles, previewFile } from '../api';
import { requestErrorText } from '../../utils/requestErrors.core';
import { translator } from '../../i18n/translator';
import { useChatStore } from '../../stores/chatStore';

function refuse(detail: Record<string, string>) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ detail }), { status: 403, headers: { 'content-type': 'application/json' } }),
    );
}

describe("a refused file read away from the PC", () => {
    beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
    afterEach(() => { vi.unstubAllGlobals(); useChatStore.getState().setLocale('en'); });

    it.each(['en', 'ar'] as const)('words a known code in %s with the file name', async (locale) => {
        useChatStore.getState().setLocale(locale);
        refuse({ code: 'not_in_chat_folders', message: 'English from the server', name: 'x.txt' });
        const err = await previewFile('/a/x.txt', undefined, 's1').catch((e) => e);
        expect(err.message).toBe(translator(locale)('files.refused.notInChatFolders', { name: '⁦x.txt⁩' }));
        expect(err.message).toContain('x.txt');
        expect(err.message).not.toContain('English from the server');
    });

    it('shows the translated sentence where the file browser shows a failed listing', async () => {
        refuse({ code: 'outside_home', message: 'English from the server' });
        const err = await browseFiles('/etc', 's1').catch((e) => e);
        expect(requestErrorText(err, translator('en'))).toBe(translator('en')('files.refused.outsideHome'));
    });

    it("keeps the server's sentence for a code it doesn't word", async () => {
        refuse({ code: 'something_new', message: 'The server says no.' });
        await expect(previewFile('/a/x.txt', undefined, 's1')).rejects.toHaveProperty('message', 'The server says no.');
    });
});
