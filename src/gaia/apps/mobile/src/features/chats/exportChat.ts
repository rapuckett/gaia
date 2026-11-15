// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { GaiaError } from '@/api/errors';
import { requireClient, useGaiaClient } from '@/data';

export type ExportFormat = 'markdown' | 'json';

const FILE_TYPE: Record<ExportFormat, { extension: string; mimeType: string; uti: string }> = {
    markdown: { extension: 'md', mimeType: 'text/markdown', uti: 'net.daringfireball.markdown' },
    json: { extension: 'json', mimeType: 'application/json', uti: 'public.json' },
};

/** A chat title as a file name: no path separators or characters a file system refuses, as the web export does. */
export function exportFileName(title: string, format: ExportFormat): string {
    const safe = (title || 'chat').replace(/[/\\:*?"<>|]/g, '_').slice(0, 100);
    return `${safe}.${FILE_TYPE[format].extension}`;
}

/** `mutate({ sessionId, title, format })` fetches the chat from the PC, writes it to a cache file and opens the phone's share sheet. */
export function useExportChat() {
    const client = useGaiaClient();
    return useMutation<void, Error, { sessionId: string; title: string; format: ExportFormat }>({
        mutationFn: async ({ sessionId, title, format }) => {
            if (!(await Sharing.isAvailableAsync())) throw new GaiaError('mobileApp.export.noShare');
            const data = await requireClient(client).exportSession(sessionId, format);
            const file = new File(Paths.cache, exportFileName(title, format));
            if (file.exists) file.delete();
            file.create();
            file.write(data.format === 'markdown' ? data.content : JSON.stringify(data, null, 2));
            const { mimeType, uti } = FILE_TYPE[format];
            await Sharing.shareAsync(file.uri, { mimeType, UTI: uti });
        },
    });
}
