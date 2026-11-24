// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import type { StartScreen, SystemStatus } from '@webui/types';
import type { AgentPrograms, Settings } from '@/api/client.types';
import { PC_ONLY_REFUSAL } from '@/api/constants';
import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useNextChatFolder } from '@/features/composer';
import { useNextChatDocs } from '@/features/documents';
import { useT } from '@/i18n/useT';
import { SheetScope, UIProvider } from '@/ui';

import { NewChatScreen } from './NewChatScreen';

/**
 * Developer scenes (`/dev/composer?state=`) for the new-chat screen.
 * `new-chat-setup-failed` (NC-03), `new-chat-library` (NC-08: two documents attached, the rest of the library offered),
 * `new-chat-warmup` (NC-09), `new-chat-send-error` (NC-10: the opening message fails to start a chat),
 * `new-chat-assistant` (NC-13: `#tap=new-chat-details` opens Details for the reason; Try again asks again).
 * DOC-23 `new-chat-doc-brief`: the library has documents and the PC offers the "Ask about your documents" card (`document-brief-card`).
 * APP-20 `create-failed`: a draft in the box and a PC that can't be reached; `#tap=composer-send` shows the failure notice.
 * APP-21 `skill-prompt`: a skill's Try it prompt arriving under an unsent draft, as the Skills screen sends it.
 * NC-07, the new chat's folder, as the desktop's: GAIA's own folder or a project folder, fixed (`new-chat-folder-own-fixed`,
 * `new-chat-folder-project-fixed`) or with Add a folder (`new-chat-folder-own-add`, `new-chat-folder-project-add`);
 * `new-chat-folder-picker` (the picker open, folders only), `new-chat-folder-picked` (the picked folder, its path and a clear),
 * `new-chat-folder-refused` (the PC refused a credentials folder as the chat was made, coded `device_folder_withheld`),
 * `new-chat-folder-outside-home` (the same for a folder outside the PC's home folder, `device_folder_outside_home`).
 * NC-16, the starter row: `new-chat-starters` (two of this PC's tasks, then one example) and `new-chat-starters-none` (three examples).
 * NC-15, the chosen gaiacpp can't start, in place of NC-13: `new-chat-agent-missing` (Download gaiacpp again and Use the
 * Python agent; `#tap=composer-send` keeps the text and says so), `new-chat-agent-invalid` (it failed its check),
 * `new-chat-agent-cant-download` (this release has none to download: the reason, no Download), `new-chat-agent-downloading`
 * (a download the PC started, followed), `new-chat-agent-pc-only` (the PC keeps both ways out to itself: Check again).
 */
export const NEW_CHAT_SCENES = ['new-chat-setup-failed', 'new-chat-library', 'new-chat-warmup', 'new-chat-send-error', 'new-chat-assistant', 'new-chat-doc-brief', 'create-failed', 'skill-prompt', 'new-chat-folder-own-fixed', 'new-chat-folder-own-add', 'new-chat-folder-project-fixed', 'new-chat-folder-project-add', 'new-chat-folder-picker', 'new-chat-folder-picked', 'new-chat-folder-refused', 'new-chat-folder-outside-home', 'new-chat-agent-missing', 'new-chat-agent-invalid', 'new-chat-agent-cant-download', 'new-chat-agent-downloading', 'new-chat-agent-pc-only', 'new-chat-agent-fast', 'new-chat-starters', 'new-chat-starters-none'] as const;
export type NewChatScene = (typeof NEW_CHAT_SCENES)[number];

const READY = {
    lemonade_running: true, context_size_sufficient: true, model_context_size: 65536, download_progress: null,
    init_state: 'ready', model_loaded: 'Gemma-4-E4B-it-GGUF',
} as unknown as SystemStatus;

const START: StartScreen = { cards: [], working_folder: { path: '/Users/avery/Documents', name: 'Documents', gaia_folder: false, choosable: false } };

const PICKED = '/Users/Shared/Projects/site-redesign';
const CREDENTIALS = '/Users/Shared/.password-store/work';
const OUTSIDE_HOME = '/Volumes/Archive/site-copy';
const OWN = { path: '/Users/Shared/GAIA/documents', name: 'documents', gaia_folder: true, choosable: true };
const PROJECT = { path: '/Users/Shared/demo-project', name: 'demo-project', gaia_folder: false, choosable: true };
const FOLDERS: Partial<Record<NewChatScene, StartScreen['working_folder']>> = {
    'new-chat-folder-own-fixed': { ...OWN, choosable: false },
    'new-chat-folder-own-add': OWN,
    'new-chat-folder-project-fixed': { ...PROJECT, choosable: false },
    'new-chat-folder-project-add': PROJECT,
    'new-chat-folder-picker': OWN,
    'new-chat-folder-picked': OWN,
    'new-chat-folder-refused': OWN,
    'new-chat-folder-outside-home': OWN,
};
// The PC's 403s for a folder it won't give this phone (`device_pick_refusal` in files.py).
const REFUSALS: Partial<Record<NewChatScene, { folder: string; code: string; message: string }>> = {
    'new-chat-folder-refused': { folder: CREDENTIALS, code: 'device_folder_withheld', message: "GAIA doesn't give a paired device this folder: it holds credentials or keys." },
    'new-chat-folder-outside-home': { folder: OUTSIDE_HOME, code: 'device_folder_outside_home', message: "Away from the PC, GAIA browses only your home folder on the PC, as the PC's own folder picker does." },
};
const entry = (name: string, type: 'folder' | 'file') => ({ name, path: `/Users/Shared/Projects/${name}`, type });
const PROJECTS = {
    current_path: '/Users/Shared/Projects',
    parent_path: '/Users/Shared',
    entries: [entry('.cache', 'folder'), entry('quarterly-report', 'folder'), entry('site-redesign', 'folder'), entry('budget.xlsx', 'file'), entry('notes.txt', 'file')],
    quick_links: [{ name: 'Home', path: '/Users/Shared', icon: 'home' }, { name: 'Documents', path: '/Users/Shared/Documents', icon: 'documents' }],
};

const DOC = (n: number, name: string) => ({
    id: `d${n}`, filename: name, filepath: `/Users/avery/Documents/${name}`, file_size: 20_000, chunk_count: 5,
    indexed_at: '2026-11-16T09:00:00Z', indexing_status: 'complete',
});
const DOCUMENTS = [DOC(1, 'board-notes.pdf'), DOC(2, 'q3-summary.md'), DOC(3, 'forecast.csv')];

const GAIACPP_MISSING = { code: 'gaiacpp_missing' as const, detail: 'gaiacpp is chosen as the agent but it is not installed on this PC (looked in: /Users/Shared/GAIA/bin/gaiacpp).' };
const AGENT_PROBLEMS: Partial<Record<NewChatScene, StartScreen>> = {
    'new-chat-agent-missing': { ...START, skills_error: 'gaiacpp is not installed', agent_problem: GAIACPP_MISSING },
    'new-chat-agent-invalid': { ...START, skills_error: 'gaiacpp failed its check', agent_problem: { code: 'gaiacpp_invalid', detail: 'gaiacpp no longer matches its download: sha256 3f1c… expected 9ab0….' } },
    'new-chat-agent-cant-download': { ...START, skills_error: 'gaiacpp is not installed', agent_problem: GAIACPP_MISSING },
    'new-chat-agent-downloading': { ...START, skills_error: 'gaiacpp is not installed', agent_problem: GAIACPP_MISSING },
    'new-chat-agent-pc-only': { ...START, skills_error: 'gaiacpp is not installed', agent_problem: GAIACPP_MISSING },
};
const AGENT_LISTING: AgentPrograms = {
    current: 'gaiacpp',
    programs: [
        { id: 'gaiapy', installed: true, size_bytes: null, can_download: false, unavailable_reason: null },
        { id: 'gaiacpp', installed: false, size_bytes: 9_400_000, can_download: true, unavailable_reason: null },
    ],
    download: { state: 'idle', bytes_done: 0, bytes_total: null, error: null },
};
const AGENT_DOWNLOADING = { state: 'downloading' as const, bytes_done: 3_100_000, bytes_total: 9_400_000, error: null };
const AGENT_LISTINGS: Partial<Record<NewChatScene, AgentPrograms | Error>> = {
    'new-chat-agent-cant-download': {
        ...AGENT_LISTING,
        programs: AGENT_LISTING.programs.map((p) => (p.id === 'gaiacpp' ? { ...p, can_download: false, unavailable_code: 'no_release' as const, unavailable_reason: 'No gaiacpp build for this GAIA release.' } : p)),
    },
    'new-chat-agent-downloading': { ...AGENT_LISTING, download: AGENT_DOWNLOADING },
    'new-chat-agent-pc-only': new GaiaApiError(403, PC_ONLY_REFUSAL),
};

function clientFor(state: NewChatScene) {
    const base = { start: START, status: READY };
    const agentStart = AGENT_PROBLEMS[state];
    if (agentStart) {
        return createFakeClient({ ...base, start: agentStart, agentPrograms: AGENT_LISTINGS[state] ?? AGENT_LISTING, ...(state === 'new-chat-agent-downloading' ? { agentDownloads: [AGENT_DOWNLOADING] } : {}) });
    }
    if (state === 'new-chat-setup-failed') {
        return createFakeClient({ ...base, status: { ...READY, model_loaded: null, setup_error: 'The model download stopped at 41%.' } as unknown as SystemStatus });
    }
    if (state === 'new-chat-library') {
        return createFakeClient({ ...base, documents: { documents: DOCUMENTS, total: 3, total_chunks: 15, total_size_bytes: 60_000 } } as Parameters<typeof createFakeClient>[0]);
    }
    if (state === 'new-chat-doc-brief') {
        const card = { skill: 'document-brief', title: 'Ask about your documents', note: 'Attach your library and ask.', prompt: 'What do my documents say?', needs_input: false };
        return createFakeClient({ ...base, start: { ...START, cards: [card] }, documents: { documents: DOCUMENTS, total: 3, total_chunks: 15, total_size_bytes: 60_000 } } as Parameters<typeof createFakeClient>[0]);
    }
    if (state === 'new-chat-starters') {
        const cards = [
            { skill: 'document-brief', title: 'Ask about your documents', note: '3 indexed documents', prompt: 'Using my indexed documents, give me the key points.', needs_input: false },
            { skill: 'research-report', title: 'Research a topic', note: 'A cited report from the web', prompt: 'Research and write a short cited report on: ', needs_input: true },
            { skill: 'coding', title: 'Work on code', note: 'In my-project', prompt: 'Look around my-project and tell me what this project does.', needs_input: false },
        ];
        return createFakeClient({ ...base, start: { ...START, cards } });
    }
    if (state === 'new-chat-warmup') {
        return createFakeClient({ ...base, status: { ...READY, warm_up: { state: 'warming', elapsed_seconds: 12, model: 'Gemma-4-E4B-it-GGUF', device: 'gpu' } } as unknown as SystemStatus });
    }
    if (state === 'new-chat-agent-fast') {
        const settings = {
            custom_model: null, model_status: null, context_size: null, dynamic_tools: false, dynamic_tools_locked: false,
            agent_mode: 'manual', network_policy: 'cloud_allowed', flagship_agent: 'gaiacpp', gaiacpp_available: true,
        } as Settings;
        return createFakeClient({ ...base, settings });
    }
    const folder = FOLDERS[state];
    if (folder) {
        const fake = createFakeClient({ ...base, start: { cards: [], working_folder: folder }, fileFolders: { '': PROJECTS } });
        const refusal = REFUSALS[state];
        if (!refusal) return fake;
        const { code, message } = refusal;
        return { ...fake, createSession: () => Promise.reject(new GaiaApiError(403, message, undefined, undefined, { code, message })) };
    }
    if (state === 'new-chat-assistant') {
        return createFakeClient({ ...base, start: { ...START, skills_error: 'Could not list skills: agent process exited with code 1' } });
    }
    const fake = createFakeClient(base);
    if (state === 'create-failed') {
        return { ...fake, createSession: () => Promise.reject(new GaiaNetworkError('http://pc.local:4200/api/sessions', new Error('Network request failed'))) };
    }
    return { ...fake, createSession: () => Promise.reject(new GaiaApiError(500, 'database is locked')) };
}

export function NewChatScenes({ state }: { state: NewChatScene }) {
    const t = useT();
    const client = useMemo(() => clientFor(state), [state]);
    const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);
    const noop = () => undefined;
    useEffect(() => {
        if (state !== 'new-chat-library') return undefined;
        useNextChatDocs.getState().add(['d1', 'd2']);
        return () => useNextChatDocs.getState().clear();
    }, [state]);
    useEffect(() => {
        if (state !== 'new-chat-folder-picked' && !REFUSALS[state]) return undefined;
        useNextChatFolder.getState().set(REFUSALS[state]?.folder ?? PICKED);
        return () => useNextChatFolder.getState().set(null);
    }, [state]);
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <SheetScope>
                        <NewChatScreen
                            onOpen={noop}
                            onChooseDocuments={noop}
                            initialHeld={state === 'new-chat-send-error' ? 'Summarize the board notes for me' : REFUSALS[state] ? 'Review the site copy for typos' : undefined}
                            initialPicking={state === 'new-chat-folder-picker'}
                            initialText={state === 'create-failed' ? 'Draft a status update for the team' : state === 'skill-prompt' ? 'Compare these two quotes' : undefined}
                            prompt={state === 'skill-prompt' ? { id: 'skill:summarize', text: t('settings.skills.tryPrompt', { name: 'summarize' }) } : undefined}
                        />
                    </SheetScope>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
