// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BrowseResponse, DocumentResponse, FileSearchResponse, GaiaClient, IndexFolderResponse } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';

import { useGaiaClient } from './GaiaClientProvider';
import { queryKeys, requireClient } from './queries';

/** Most results one search asks the PC for, as the web browser does. */
export const FILE_SEARCH_LIMIT = 30;

/** A folder on the PC; no `path` opens the chat's first folder. */
export function useBrowseFiles(sessionId: string, path: string | undefined) {
    const client = useGaiaClient();
    return useQuery<BrowseResponse>({
        queryKey: ['fileBrowse', sessionId, path ?? ''],
        enabled: client !== null,
        retry: false,
        queryFn: ({ signal }) => requireClient(client).browseFiles(sessionId, path, { signal }),
    });
}

/** Looks for files by name once `query` is set; `fileTypes` is a comma list of extensions. */
export function useSearchFiles(sessionId: string, query: string | null, fileTypes: string) {
    const client = useGaiaClient();
    return useQuery<FileSearchResponse>({
        queryKey: ['fileSearch', sessionId, query, fileTypes],
        enabled: client !== null && query !== null,
        retry: false,
        queryFn: ({ signal }) => requireClient(client).searchFiles(sessionId, query ?? '', fileTypes || undefined, FILE_SEARCH_LIMIT, { signal }),
    });
}

export interface AddPcFilesResult {
    added: DocumentResponse[];
    /** A file GAIA couldn't read has a library row with its reason; it isn't attached. */
    unreadable: DocumentResponse[];
    failures: { path: string; error: Error }[];
}

/** `mutate({ paths, chatId })` indexes PC files into the library and attaches them to the chat, as the web browser's Add to library does. */
export function useAddPcFiles() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<AddPcFilesResult, Error, { paths: string[]; chatId: string }>({
        mutationFn: async ({ paths, chatId }) => {
            const api = requireClient(client);
            const result: AddPcFilesResult = { added: [], unreadable: [], failures: [] };
            for (const path of paths) {
                try {
                    const document = await api.uploadDocumentByPath(path, chatId);
                    if (document.indexing_status === 'failed') {
                        result.unreadable.push(document);
                        continue;
                    }
                    await api.attachDocument(chatId, document.id);
                    result.added.push(document);
                } catch (err) {
                    result.failures.push({ path, error: err instanceof Error ? err : new Error(String(err)) });
                }
            }
            return result;
        },
        onSettled: (_result, _error, { chatId }) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
            void queryClient.invalidateQueries({ queryKey: queryKeys.session(chatId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        },
    });
}

export type AddPcPathResult =
    | { kind: 'file'; document: DocumentResponse; attachError: Error | null }
    | { kind: 'folder'; result: IndexFolderResponse; attachError: Error | null };

export interface AddPcPathRequest {
    /** The path as typed; the PC checks it against `readChatId`'s folders. */
    path: string;
    /** The chat whose folders the PC may read the path from. */
    readChatId: string;
    /** The chat to attach to once indexed; null leaves the documents for the next new chat. */
    chatId: string | null;
    /** Called when the PC answers that the path is a folder, before its documents are indexed. */
    onFolder?: () => void;
}

/** Attaches each document, carrying on past a refusal; the first refusal is returned. */
async function attachEach(api: GaiaClient, chatId: string | null, ids: readonly string[]): Promise<Error | null> {
    if (!chatId) return null;
    let first: Error | null = null;
    for (const id of ids) {
        try {
            await api.attachDocument(chatId, id);
        } catch (err) {
            first ??= err instanceof Error ? err : new Error(String(err));
        }
    }
    return first;
}

/** `mutate({ path, readChatId, chatId })` adds a file or folder on the PC by its typed path, as the web library's path box does. */
export function useAddPcPath() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<AddPcPathResult, Error, AddPcPathRequest>({
        mutationFn: async ({ path, readChatId, chatId, onFolder }) => {
            const api = requireClient(client);
            let document: DocumentResponse;
            try {
                document = await api.uploadDocumentByPath(path, readChatId);
            } catch (err) {
                if (!(err instanceof GaiaApiError && err.body?.status === 'is_folder')) throw err;
                onFolder?.();
                // Top level only: a typed home folder would otherwise index everything below it.
                const result = await api.indexFolder(path, false, readChatId);
                return { kind: 'folder', result, attachError: await attachEach(api, chatId, result.documents.map((d) => d.id)) };
            }
            // A file GAIA couldn't read has a library row with its reason; a chat must not be promised it.
            if (document.indexing_status === 'failed') return { kind: 'file', document, attachError: null };
            return { kind: 'file', document, attachError: await attachEach(api, chatId, [document.id]) };
        },
        onSettled: (_result, _error, { chatId }) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
            if (chatId) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.session(chatId) });
                void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
            }
        },
    });
}
