// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { documentFileUrl } from '@/api/constants';

export interface OpenableDocument {
    id: string;
    filename: string;
}

// The file name keeps its extension, so the share sheet knows the type; path separators never reach the file system.
function safeName(filename: string): string {
    return filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'document';
}

/**
 * Fetches a library document from the paired PC with the pairing token, then hands the file to the phone's
 * share sheet (Quick Look / Open in). The page a citation names can't ride along: the viewer opens at page 1.
 */
export async function openDocument(baseUrl: string, token: string | null | undefined, doc: OpenableDocument): Promise<void> {
    const folder = new Directory(Paths.cache, 'documents', doc.id);
    folder.create({ intermediates: true, idempotent: true });
    const file = await File.downloadFileAsync(documentFileUrl(baseUrl, doc.id), new File(folder, safeName(doc.filename)), {
        idempotent: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    await Sharing.shareAsync(file.uri, file.name.toLowerCase().endsWith('.pdf') ? { mimeType: 'application/pdf' } : undefined);
}
