// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { DocumentListResponse, PreflightReport } from '@/api/client.types';
import { GaiaApiError, GaiaError, GaiaNetworkError, GaiaUploadUnsupportedError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';

import type { Document } from '@webui/types';
import { unsupportedTypeMessage } from '@webui/utils/uploadErrors.core';

import type { LibraryStart } from './DocumentsScreen';

type LibraryDoc = DocumentListResponse['documents'][number];

/** A library state: the chat it opens from (none is the next-chat library), the fake PC's answers, and any transient state to open in. */
export interface DocumentsScene {
    chat: boolean;
    data: FakeClientData;
    start?: LibraryStart;
    /** The library read fails with this message. */
    loadError?: string;
    /** A removal that never finishes, so the row stays hidden behind its Undo notice. */
    holdRemoval?: boolean;
}

const CHAT_ID = 'chat-1';
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const doc = (id: string, filename: string, file_size: number, over: Partial<LibraryDoc> = {}): LibraryDoc => ({
    id, filename, filepath: `/Users/me/Documents/${filename}`, file_size, chunk_count: 12, indexed_at: ago(25), indexing_status: 'complete', ...over,
});

const BOARD = doc('d1', 'q3-board-deck.pdf', 481_000, { indexed_at: ago(5) });
const BUDGET = doc('d2', 'budget-2026.xlsx', 92_160, { indexed_at: ago(26 * 60) });
const NOTES = doc('d3', 'meeting-notes.md', 3_400, { indexed_at: ago(3 * 24 * 60) });
const PLAN = doc('d4', 'roadmap.docx', 1_250_000, { indexed_at: ago(40) });

const MIXED = [BOARD, BUDGET, NOTES, PLAN, doc('d5', 'server.py', 18_200, { indexed_at: ago(9 * 24 * 60) }), doc('d6', 'handbook.txt', 2_800_000, { indexed_at: ago(2) })];

const CLOCK = Date.now();
const NO_ANSWER = new GaiaNetworkError('https://pc.local', new Error('timed out'));

const INDEXING = [
    doc('i1', 'annual-report-2025.pdf', 18_400_000, { indexing_status: 'indexing', indexed_at: undefined }),
    doc('i2', 'supplier-contracts.pdf', 6_200_000, { indexing_status: 'indexing', indexed_at: undefined }),
    doc('i3', 'pricing.csv', 410_000, { indexing_status: 'pending', indexed_at: undefined }),
    BOARD,
];

const FAILED = [
    doc('f1', 'scan-0042.pdf', 3_100_000, { indexing_status: 'failed', error_kind: 'corrupted', last_error: 'RAG indexing failed for scan-0042.pdf: the file is damaged', indexed_at: undefined }),
    doc('f2', 'locked-report.pdf', 910_000, { indexing_status: 'failed', error_kind: 'encrypted', last_error: 'RAG indexing failed for locked-report.pdf: the file is password protected', indexed_at: undefined }),
    doc('f3', 'notes-final.docx', 195, { indexing_status: 'failed', error_kind: 'empty_file', last_error: 'RAG indexing failed for notes-final.docx: the file is empty', indexed_at: undefined }),
    doc('f4', 'contracts.pdf', 22_000_000, { indexing_status: 'failed', error_kind: null, last_error: 'RAG indexing failed for contracts.pdf: embedding service timed out\nTraceback (most recent call last):\n  File "rag/sdk.py", line 212, in index\nTimeoutError: no answer from the embedder after 120 s', indexed_at: undefined }),
    doc('f5', 'mystery.bin', 4_000, { indexing_status: 'failed', error_kind: null, last_error: null, indexed_at: undefined }),
    doc('c1', 'draft-v2.pdf', 740_000, { indexing_status: 'cancelled', indexed_at: undefined }),
    doc('m1', 'old-invoice.pdf', 120_000, { indexing_status: 'missing', indexed_at: undefined }),
    BOARD,
];

const LONG = Array.from({ length: 24 }, (_, i) => doc(`l${i}`, i % 5 === 0 ? `quarterly-financial-review-for-the-board-of-directors-draft-${i}.pdf` : `document-${i + 1}.${['pdf', 'txt', 'md', 'xlsx'][i % 4]}`, 40_000 + i * 173_000, { indexed_at: ago(10 + i * 90) }));

const CONTRACTS = [
    doc('k1', 'supplier-msa.pdf', 2_400_000, { filepath: '/Users/me/Documents/Contracts/supplier-msa.pdf', indexed_at: ago(0) }),
    doc('k2', 'nda-acme.docx', 88_000, { filepath: '/Users/me/Documents/Contracts/nda-acme.docx', indexed_at: ago(0) }),
    doc('k3', 'renewals.xlsx', 61_000, { filepath: '/Users/me/Documents/Contracts/renewals.xlsx', indexed_at: ago(0) }),
];

const folderResult = (documents: LibraryDoc[], over: { skipped?: number; skipped_images?: number; errors?: string[] } = {}) => {
    const { skipped = 0, skipped_images = 0, errors = [] } = over;
    return { indexed: documents.length, failed: errors.length, skipped, skipped_images, documents: documents as Document[], errors };
};

// What a PC says to a phone asking for a path outside the chat's folders.
const AWAY = 'Away from the PC, GAIA shows files only from the folders a chat was given. Keychains isn’t in this chat’s folders.';

const library = (documents: LibraryDoc[]): DocumentListResponse => ({
    documents, total: documents.length, total_chunks: documents.length * 12, total_size_bytes: documents.reduce((n, d) => n + d.file_size, 0),
});

const session = (document_ids: string[]) => ({
    id: CHAT_ID, title: 'Board prep', created_at: ago(120), updated_at: ago(5), model: '', system_prompt: null, message_count: 4, document_ids,
});

const COMMON: FakeClientData = {
    sessions: [session([])],
    documents: library([]),
    preflight: { os: 'mac-arm64', detected_platform: 'mac-arm64', ram_gb: 32, disk_free_gb: 200, npu_detected: false, gpu_name: null, gpu_vram_gb: null, lemonade_running: true, compatible: true } as PreflightReport,
};

const scene = (over: Partial<DocumentsScene> & { docs?: LibraryDoc[]; attached?: string[]; data?: FakeClientData }): DocumentsScene => {
    const { docs = [], attached = [], data, ...rest } = over;
    return { chat: true, ...rest, data: { ...COMMON, sessions: [session(attached)], documents: library(docs), ...data } };
};

const PROGRESS: NonNullable<FakeClientData['documentStatuses']> = {
    i2: { indexing_status: 'indexing', chunk_count: 0, is_active: true, progress: { phase: 'embedding', done: 310, total: 800 } },
    i3: { indexing_status: 'pending', chunk_count: 0, is_active: true, progress: { phase: 'reading', done: 7, total: null } },
};

// i1 reports no progress yet, so its row shows the Indexing label and the elapsed time.
const SEEDED_CLOCK = { now: CLOCK, startedAt: { i1: CLOCK - 83_000, i2: CLOCK - 205_000, i3: CLOCK - 12_000 } };

export const DOCUMENTS_SCENES: Record<string, DocumentsScene> = {
    empty: scene({}),
    'empty-next-chat': scene({ chat: false }),
    library: scene({ docs: MIXED }),
    'library-next-chat': scene({ chat: false, docs: MIXED }),
    'next-chat-chosen': scene({ docs: MIXED, start: { target: 'next' } }),
    attached: scene({ docs: MIXED, attached: ['d1', 'd2'], start: { note: { key: 'docs.attached', params: { name: 'q3-board-deck.pdf', chat: '“Board prep”' } } } }),
    indexing: scene({ docs: INDEXING, data: { documentStatuses: PROGRESS }, start: { indexing: SEEDED_CLOCK } }),
    failed: scene({ docs: FAILED }),
    // Cancelled and File missing at the top, which the long `failed` list pushes below the first screen.
    'failed-more': scene({ docs: [FAILED[5]!, FAILED[6]!, FAILED[4]!, BOARD] }),
    long: scene({ docs: LONG }),
    'remove-undo': scene({ docs: MIXED, start: { removing: 'd2' }, holdRemoval: true }),
    'remove-failed': scene({ docs: MIXED, start: { error: { key: 'docs.deleteFailed', params: { name: 'budget-2026.xlsx' }, cause: NO_ANSWER } } }),
    'cancel-failed': scene({ docs: INDEXING, data: { documentStatuses: PROGRESS }, start: { indexing: SEEDED_CLOCK, error: { key: 'docs.cancelFailed', params: { name: 'annual-report-2025.pdf' }, cause: NO_ANSWER } } }),
    'load-failed': scene({ loadError: 'The PC didn’t answer.' }),
    'adding-file': scene({ docs: MIXED, start: { add: { kind: 'busy', name: 'supplier-contracts.pdf' } } }),
    'added-file': scene({ docs: MIXED, start: { add: { kind: 'done', message: { key: 'docs.attached', params: { name: 'supplier-contracts.pdf', chat: '“Board prep”' } } } } }),
    'added-for-next-chat': scene({ chat: false, docs: MIXED, start: { add: { kind: 'done', message: { key: 'docs.willAttach', params: { name: 'supplier-contracts.pdf' } } } } }),
    'add-unreadable': scene({ docs: FAILED, start: { add: { kind: 'unreadable', message: { key: 'docs.notAdded', params: { name: 'scan-0042.pdf' } } } } }),
    'add-unsupported-type': scene({ docs: MIXED, start: { add: { kind: 'failed', upload: { filename: 'holiday.mov', error: unsupportedTypeMessage('holiday.mov') ?? '' } } } }),
    'add-too-large': scene({ docs: MIXED, start: { add: { kind: 'failed', upload: { filename: 'big-archive.pdf', status: 400, kind: 'too_large', error: { key: 'docs.tooLargeDetail', params: { max: '100' } } } } } }),
    'add-no-uploads': scene({ docs: MIXED, start: { add: { kind: 'unsupported', cause: new GaiaUploadUnsupportedError() } } }),
    'add-picker-failed': scene({ docs: MIXED, start: { add: { kind: 'picker', cause: new GaiaError('mobileApp.error.photosDenied') } } }),
    'path-empty': scene({ docs: MIXED }),
    'path-invalid': scene({
        docs: MIXED,
        start: { path: '/Users/me/Documents/q4-forecst.xlsx', add: { kind: 'failed', upload: { filename: 'q4-forecst.xlsx', status: 404, error: { key: 'mobileApp.error.http', params: { status: 404, detail: 'File not found: there is no file at /Users/me/Documents/q4-forecst.xlsx. Check the path for typos.' } } } } },
    }),
    'path-refused': scene({
        docs: MIXED,
        start: { path: '/Users/me/Library/Keychains', add: { kind: 'refused', cause: new GaiaApiError(403, AWAY, undefined, undefined, { code: 'not_in_chat_folders', name: 'Keychains' }) } },
    }),
    'path-adding': scene({ docs: MIXED, start: { path: '/Users/me/Documents/q4-forecast.xlsx', add: { kind: 'busy', name: 'q4-forecast.xlsx' } } }),
    'folder-adding': scene({ docs: MIXED, start: { path: '/Users/me/Documents/Contracts', add: { kind: 'busy', name: 'Contracts', folder: true } } }),
    'folder-indexed-one': scene({ docs: [CONTRACTS[0]!, ...MIXED], start: { add: { kind: 'folder', name: 'Contracts', result: folderResult([CONTRACTS[0]!]) } } }),
    'folder-indexed-other': scene({ docs: [...CONTRACTS, ...MIXED], start: { add: { kind: 'folder', name: 'Contracts', result: folderResult(CONTRACTS, { skipped: 2, skipped_images: 3 }) } } }),
    'folder-partial': scene({
        docs: [...CONTRACTS.slice(0, 2), FAILED[0]!, ...MIXED],
        start: { add: { kind: 'folder', name: 'Contracts', result: folderResult(CONTRACTS.slice(0, 2), { errors: ['scan-0042.pdf: the file is damaged'] }) } },
    }),
    'folder-none': scene({ docs: MIXED, start: { add: { kind: 'folder', name: 'Photos', result: folderResult([], { skipped: 4, skipped_images: 12 }) } } }),
};

/** The library on a fake PC; a removal that never finishes and a library read that fails are overlaid on the fake. */
export function documentsSceneClient(found: DocumentsScene) {
    const client = createFakeClient(found.data);
    if (found.loadError) {
        const message = found.loadError;
        client.listDocuments = async () => {
            throw new GaiaApiError(500, message);
        };
    }
    if (found.holdRemoval) client.deleteDocument = () => new Promise<never>(() => undefined);
    return client;
}

export const DOCUMENTS_SCENE_CHAT_ID = CHAT_ID;
