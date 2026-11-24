// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import type { ActiveModel, ChatSpending, PermissionMode, ContextUsage, LocalModelStatus, ProviderModel } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ConnectionBanner } from '@/features/banners/ConnectionBanner';
import { HistoryNotice } from '@/features/chat/HistoryNotice';
import { useT } from '@/i18n/useT';
import { tEn } from '@webui/i18n/translator';
import { usePickLoadStore } from '@/state/pickLoad';
import { Screen, SheetScope, Stack, UIProvider } from '@/ui';

import { Composer } from './Composer';
import { FolderChip } from './FolderChip';
import { PermissionChip } from './PermissionChip';
import { PrivateChip } from './PrivateChip';
import type { Attachments } from './useAttachments';
import { ContextMeter, ContextWarning } from './ContextMeter';
import { ModelChip } from './ModelChip';
import { SpendMeter } from './SpendMeter';

/** Developer gallery (`/dev/composer?state=`): the context meter, spend meter, model menu and picked-model load banner in each state. */
export const COMPOSER_MENU_STATES = ['context', 'meterLow', 'meterHigh', 'warning', 'spend', 'spendOpen', 'permissionMenu', 'permissionAsk', 'permissionFull', 'permissionFullWaiting', 'permissionChecking', 'permissionUnknown', 'private-off', 'private-on', 'private-memoryOff', 'private-menu', 'folder-own', 'folder-add', 'menu', 'menuInfo', 'menuEmpty', 'menuSwitching', 'pickLoading', 'pickFailed', 'attachPaste', 'menuCloud', 'menuNeverStarted'] as const;
export type ComposerMenuState = (typeof COMPOSER_MENU_STATES)[number];

const USAGE: ContextUsage = {
    window: 65536,
    reply_reserve: 4096,
    system: 9000,
    tools: 6200,
    documents: 3100,
    history: 8400,
    query: 120,
    used: 26820,
    history_budget: 40000,
    history_used: 8400,
    turns_in_view: 6,
    turns_hidden: 2,
    at_risk: [],
    at_risk_tokens: 0,
    tokenizer: { exact: true, model: 'Gemma-4-E4B-it-GGUF' },
    categories: [],
    tool_loading: { loaded: [], on_demand: [] },
    model: 'Gemma-4-E4B-it-GGUF',
    model_window: 131072,
    context_state: { put_away: { results: 0, tokens: 0 }, summarized: { turns: 0, tokens: 0, summary_tokens: 0 } },
};

const SPEND: ChatSpending = {
    paid: true,
    model: 'accounts/fireworks/models/qwen3p6',
    chat: {
        usd: 0.0412,
        answers: 3,
        unpriced_answers: 1,
        items: [
            { message_id: 1, created_at: '2026-11-15T09:12:00Z', model: null, kind: 'estimate', usd: 0.0153 },
            { message_id: 2, created_at: '2026-11-15T09:20:00Z', model: null, kind: 'estimate', usd: 0.0259 },
            { message_id: 3, created_at: '2026-11-15T09:31:00Z', model: null, kind: 'unreported', usd: null },
        ],
    },
    today: { usd: 0.1807, answers: 9, unpriced_answers: 1, chats: 4, since: '2026-11-15T00:00:00Z' },
    price_source: 'list',
};

const model = (id: string, extra: Partial<ProviderModel> = {}): ProviderModel =>
    ({ id, display_name: id.replace(/-GGUF$/, ''), context_length: 65536, downloaded: true, labels: [], rank: null, note: null, evidence: null, state: 'downloaded', size_gb: 5.1, available: true, ...extra }) as ProviderModel;

const CLOUD_ID = 'accounts/fireworks/models/qwen3p6';
const CLOUD_NOTICE = tEn('providers.fireworks.notice');
const CLOUD = [model(CLOUD_ID, { display_name: 'Qwen3.6', size_gb: null })];

const OWN_FOLDER = { path: '/Users/avery/.gaia/documents', name: 'documents', gaia_folder: true, choosable: false };

/** The left-hand chip under test; the private and permission chips keep their own state so a tap flips them. */
function LeftChip({ state }: { state: ComposerMenuState }) {
    const [priv, setPriv] = useState(state === 'private-on' || state === 'private-menu');
    const [mode, setMode] = useState<PermissionMode>(state === 'permissionFull' || state === 'permissionFullWaiting' ? 'full_access' : 'ask');
    if (state === 'permissionChecking' || state === 'permissionUnknown') {
        return <PermissionChip mode={null} readFailed={state === 'permissionUnknown'} onChange={setMode} />;
    }
    if (state === 'permissionMenu' || state === 'permissionAsk' || state === 'permissionFull' || state === 'permissionFullWaiting') {
        return <PermissionChip mode={mode} onChange={setMode} initialOpen={state === 'permissionMenu' || state === 'permissionFullWaiting'} promptWaiting={state === 'permissionFullWaiting'} />;
    }
    if (state === 'private-off' || state === 'private-on' || state === 'private-menu') return <PrivateChip on={priv} onChange={setPriv} memoryEnabled initialOpen={state === 'private-menu'} />;
    if (state === 'private-memoryOff') return <PrivateChip on={false} onChange={setPriv} memoryEnabled={false} />;
    if (state === 'folder-own') return <FolderChip folder={OWN_FOLDER} />;
    if (state === 'folder-add') return <FolderChip folder={{ ...OWN_FOLDER, choosable: true }} />;
    return null;
}

const NO_ATTACHMENTS: Attachments = { items: [], add: () => undefined, addFailed: () => undefined, remove: () => undefined, clear: () => undefined, uploading: false, hasUploaded: false, compose: (text) => text };

const LOCAL = [
    model('Gemma-4-E4B-it-GGUF', { state: 'loaded', size_gb: 5.1, tokens_per_second: 31.6, placement: { label: 'GPU · Vulkan', source: 'reported', device: 'gpu', backend: 'vulkan', warning: null } as ProviderModel['placement'] }),
    model('Qwen3-4B-Instruct-GGUF', { size_gb: 2.5 }),
    model('Qwen3.6-35B-A3B-GGUF', { downloaded: false, state: 'not_downloaded', size_gb: 23.3, placement: { label: 'GPU · Vulkan', source: 'expected', device: 'gpu', backend: 'vulkan', warning: 'Needs about 27 GB; this PC has less free right now.' } as ProviderModel['placement'] }),
    model('Qwen3-VL-4B-Instruct-GGUF', { downloaded: false, state: 'not_downloaded', size_gb: 3.3, download_progress: { state: 'downloading', percent: 42 } as ProviderModel['download_progress'] }),
];

const LOCAL_STATUS: LocalModelStatus = {
    state: 'loaded', active_model: 'Gemma-4-E4B-it-GGUF', active_display_name: 'Gemma 4 E4B', active_remote: false, model: 'Gemma-4-E4B-it-GGUF',
    display_name: 'Gemma 4 E4B', placement: null, ctx_size: 65536, memory: null, memory_error: null, error: null, base_url: null, owner: 'gaia', busy: false, restarting: false, restart_error: null,
};

export function ComposerMenusGallery({ state }: { state: ComposerMenuState }) {
    const t = useT();
    const cloud = state === 'spend' || state === 'spendOpen';
    const spendScene = cloud;
    const chipScene = state.startsWith('permission') || state.startsWith('private-') || state === 'folder-own' || state === 'folder-add';
    const client = useMemo(() => {
        const active = { provider: cloud ? 'fireworks' : 'local', model: cloud ? SPEND.model : 'Gemma-4-E4B-it-GGUF', display_name: cloud ? 'Qwen3.6' : 'Gemma 4 E4B', label: null, remote: cloud, is_default: true, downloaded: true } as ActiveModel;
        const base = createFakeClient({
            activeModel: active,
            localModel: cloud ? { ...LOCAL_STATUS, active_remote: true, active_display_name: 'Qwen3.6' } : LOCAL_STATUS,
            chatSpending: SPEND,
            providerModels: { local: { provider: 'local', models: state === 'menuEmpty' ? [] : LOCAL }, ...(state === 'menuCloud' ? { fireworks: { provider: 'fireworks', models: CLOUD } } : {}) },
            providers: { providers: [
                { id: 'local', name: 'Local', remote: false, configured: true, blocked: false, privacy_notice: '' },
                { id: 'fireworks', name: 'Fireworks AI', remote: true, configured: state !== 'menu' && state !== 'menuInfo' && state !== 'menuSwitching' && state !== 'menuNeverStarted', blocked: false, privacy_notice: CLOUD_NOTICE },
            ] },
        });
        return base;
    }, [state, cloud]);
    const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);
    const noop = () => undefined;
    useEffect(() => {
        if (state === 'pickLoading') usePickLoadStore.setState({ pickLoad: { model: 'Qwen3.6-35B-A3B-GGUF', seconds: 14, error: null } });
        else if (state === 'pickFailed') usePickLoadStore.setState({ pickLoad: { model: 'Qwen3.6-35B-A3B-GGUF', seconds: 0, error: { reason: 'Not enough free memory to load the model.' } } });
        return () => usePickLoadStore.getState().clear();
    }, [state]);
    const usage = state === 'meterLow' ? { ...USAGE, used: 19660 } : state === 'meterHigh' ? { ...USAGE, used: 47180 } : state === 'warning' ? { ...USAGE, used: 61000, at_risk: ['What did the vendor contract say about renewal?', 'Summarize the board notes'] } : USAGE;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                  <SheetScope>
                    <Screen>
                        <Stack gap="md" justify="end" flex={1}>
                            {state === 'warning' ? <HistoryNotice text="Older messages are now out of the model's view (6 turns). Ask me to recall them if you need them." /> : null}
                            {state === 'pickLoading' || state === 'pickFailed' ? (
                                <Stack paddingX="gutter">
                                    <ConnectionBanner />
                                </Stack>
                            ) : null}
                            <ContextWarning usage={state === 'warning' ? usage : null} />
                            <Composer
                                onSend={noop}
                                onStop={noop}
                                attachments={state === 'attachPaste' ? NO_ATTACHMENTS : undefined}
                                attachMenu={state === 'attachPaste' ? { open: true, paste: true } : undefined}
                                leftControls={chipScene ? <LeftChip state={state} /> : undefined}
                                rightControls={
                                    chipScene ? undefined : (
                                    <>
                                        <SpendMeter sessionId="dev" busy={false} initialOpen={state === 'spendOpen'} />
                                        {spendScene ? null : <ContextMeter usage={usage} initialOpen={state === 'context'} onDetails={noop} />}
                                        <ModelChip initialOpen={state === 'menu' || state === 'menuInfo' || state === 'menuEmpty' || state === 'menuSwitching' || state === 'menuCloud' || state === 'menuNeverStarted'} initialInfoRow={state === 'menuInfo' ? 'Qwen3.6-35B-A3B-GGUF' : undefined} initialSwitchError={state === 'menuNeverStarted' ? t('modelMenu.downloadNeverStarted', { name: 'Qwen3.6-35B-A3B' }) : undefined} forceSwitching={state === 'menuSwitching' ? 'Qwen3-4B-Instruct-GGUF' : undefined} />
                                    </>
                                    )
                                }
                            />
                        </Stack>
                    </Screen>
                  </SheetScope>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
