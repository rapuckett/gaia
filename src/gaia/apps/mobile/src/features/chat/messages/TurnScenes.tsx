// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import type { FileDiff, Session, TurnChanges } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { Screen, Stack, UIProvider } from '@/ui';

import { ChangesReview } from '../changes/ChangesReview';
import { TurnChanges as TurnChangesRow } from '../changes/TurnChanges';
import { ChatHeader } from '../header/ChatHeader';
import { DocsBar } from '../header/DocsBar';

/**
 * Developer scenes (`/dev/messages?state=`) for what a turn changed (PRM-13 to 16, CV-60; `turn-changes-untracked` is PRM-18, the untracked-work warning), the export-chat error (CV-05) and the documents bar limit notices (CV-63).
 * Taps: `turn-changes` and `turn-changes-undone` open the review with `#tap=turn-changes-review`; `turn-changes` shows the undo confirm after `#tap=turn-changes-undo`;
 * `turn-undo-conflict` shows the conflict (Undo anyway, Keep) after the same two taps; `turn-undo-hang` shows "Undoing…" after `#tap=turn-changes-undo` then `#tap=turn-changes-confirm`; the export errors show after `#tap=export-chat`.
 */
export const TURN_SCENES = [
    'turn-changes',
    'turn-changes-undone',
    'turn-changes-untracked',
    'turn-changes-error',
    'turn-review',
    'turn-review-loading',
    'turn-review-error',
    'turn-undo-hang',
    'turn-undo-conflict',
    'export-error-http',
    'export-error-unreachable',
    'docs-past-cap',
    'docs-past-size',
] as const;
export type TurnScene = (typeof TURN_SCENES)[number];

const NOW = '2026-11-16T09:00:00Z';
const SESSION = (documents: string[] = []): Session => ({
    id: 's1',
    title: 'Quarterly reports',
    created_at: NOW,
    updated_at: NOW,
    model: '',
    system_prompt: null,
    message_count: 2,
    document_ids: documents,
});

const TURN = (restored: boolean, untracked: TurnChanges['untracked'] = []): TurnChanges => ({
    turn_id: 't1',
    session_id: 's1',
    message_id: 7,
    started_at: NOW,
    finished_at: NOW,
    restored_at: restored ? NOW : null,
    files: [
        { path: '/Users/avery/Documents/Quarterly reports/q3-summary.md', change: 'edited', tool: 'write_file' },
        { path: '/Users/avery/Documents/Quarterly reports/forecast.csv', change: 'created', tool: 'write_file' },
    ],
    untracked,
    incomplete: false,
});

const UNTRACKED: TurnChanges['untracked'] = [
    { kind: 'shell', detail: 'rm -rf build && ./scripts/package.sh', paths: ['/Users/avery/Documents/Quarterly reports/build'], may_write: true },
    { kind: 'run_python', detail: 'counts errors by hour', paths: [], may_write: true },
    { kind: 'run_python', detail: 'renames the exported files', paths: [], may_write: true },
];

const DIFF = '@@ -1,3 +1,3 @@\n # Q3 summary\n-Revenue was flat.\n+Revenue grew 4%.\n Costs held steady.\n';
const FILE = (path: string, change: FileDiff['change'], extra: Partial<FileDiff> = {}): FileDiff => ({ path, change, unified: DIFF, binary: false, too_large: false, truncated: false, before_size: 120, after_size: 140, ...extra });
const DIFFS: FileDiff[] = [
    FILE('/Users/avery/Documents/Quarterly reports/q3-summary.md', 'edited'),
    FILE('/Users/avery/Documents/Quarterly reports/forecast.csv', 'created', { truncated: true }),
    FILE('/Users/avery/Documents/Quarterly reports/old-draft.txt', 'deleted'),
    FILE('/Users/avery/Documents/Quarterly reports/chart.png', 'created', { binary: true, unified: '' }),
    FILE('/Users/avery/Documents/Quarterly reports/raw-export.json', 'edited', { too_large: true, unified: '', before_size: 9_000_000, after_size: 9_100_000 }),
];

const DOC = (n: number, chunks: number) => ({
    id: `d${n}`,
    filename: `report-${n}.pdf`,
    filepath: `/Users/avery/Documents/report-${n}.pdf`,
    file_size: 20_000,
    chunk_count: chunks,
    indexed_at: NOW,
    indexing_status: 'complete',
});

function libraryOf(count: number, chunks: number) {
    const documents = Array.from({ length: count }, (_, i) => DOC(i + 1, chunks));
    return { session: SESSION(documents.map((d) => d.id)), documents: { documents, total: count, total_chunks: count * chunks, total_size_bytes: count * 20_000 } };
}

const never = () => new Promise<never>(() => undefined);

function clientFor(state: TurnScene) {
    if (state === 'docs-past-cap' || state === 'docs-past-size') {
        const { session, documents } = libraryOf(state === 'docs-past-cap' ? 101 : 3, state === 'docs-past-cap' ? 5 : 4000);
        return createFakeClient({ sessions: [session], documents });
    }
    const fake = createFakeClient({ sessions: [SESSION()], turnChanges: { s1: [TURN(state === 'turn-changes-undone', state === 'turn-changes-untracked' ? UNTRACKED : [])] }, turnDiffs: { t1: DIFFS } });
    if (state === 'turn-changes-error') return { ...fake, listTurnChanges: () => Promise.reject(new GaiaApiError(500, 'database is locked')) };
    if (state === 'turn-review-loading') return { ...fake, getTurnDiff: never };
    if (state === 'turn-review-error') return { ...fake, getTurnDiff: () => Promise.reject(new GaiaApiError(500, 'diff store unreadable')) };
    if (state === 'turn-undo-conflict') {
        const body = { status: 'conflict', message: 'q3-summary.md changed after this turn' };
        return createFakeClient({ sessions: [SESSION()], turnChanges: { s1: [TURN(false)] }, undoConflict: new GaiaApiError(409, body.message, undefined, undefined, body) });
    }
    if (state === 'turn-undo-hang') return { ...fake, undoTurn: never };
    if (state === 'export-error-http') return { ...fake, exportSessionMarkdown: () => Promise.reject(new GaiaApiError(500, 'export failed')) };
    if (state === 'export-error-unreachable') return { ...fake, exportSessionMarkdown: () => Promise.reject(new Error('network')) };
    return fake;
}

function Body({ state }: { state: TurnScene }) {
    if (state === 'docs-past-cap' || state === 'docs-past-size') return <DocsBar sessionId="s1" onFailed={() => undefined} />;
    if (state === 'export-error-http' || state === 'export-error-unreachable') return <ChatHeader sessionId="s1" />;
    if (state === 'turn-review' || state === 'turn-review-loading' || state === 'turn-review-error') return <ChangesReview sessionId="s1" turn={TURN(false)} onClose={() => undefined} />;
    return <TurnChangesRow sessionId="s1" messageId={7} />;
}

export function TurnScenes({ state }: { state: TurnScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => clientFor(state));
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <Screen>
                        <Stack gap="md" paddingX="gutter" paddingY="md">
                            <Body state={state} />
                        </Stack>
                    </Screen>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
