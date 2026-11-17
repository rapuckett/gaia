// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { ActiveModel, Message, ProviderModel, RetryResult } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import type { Comparison } from '@/state/answerComparison';
import { useT } from '@/i18n/useT';
import { Screen, UIProvider } from '@/ui';

import { AnswerComparison } from './AnswerComparison';
import { RetrySheet } from './RetrySheet';
import { failureOf } from './useAnswerComparison';

/** Developer gallery (`/dev/messages?state=`): the retry sheet and the answer comparison in each state. */
export const COMPARE_STATES = ['retry-sheet', 'retry-loading', 'retry-error', 'compare-ready', 'compare-running', 'compare-failed'] as const;
export type CompareState = (typeof COMPARE_STATES)[number];

const model = (id: string, extra: Partial<ProviderModel> = {}): ProviderModel =>
    ({ id, display_name: id, context_length: 65536, downloaded: true, labels: [], rank: null, note: null, evidence: null, state: 'downloaded', size_gb: 5.1, available: true, ...extra }) as ProviderModel;

const CLOUD_ID = 'accounts/fireworks/models/qwen3p6';
const ORIGINAL: Message = {
    id: 7,
    session_id: 'dev',
    role: 'assistant',
    content: 'The nightly job ran at **02:00** and copied 12 files. Three were skipped because they already existed.',
    created_at: '2026-11-13T14:01:09Z',
    rag_sources: null,
    stats: { tokens_per_second: 118, model: CLOUD_ID } as Message['stats'],
};
const RESULT: RetryResult = {
    message_id: 7,
    model: 'Gemma-4-E4B-it-GGUF',
    content: 'The nightly job started at **02:00**.\n\n- 12 files copied\n- 3 skipped (already there)',
    stats: { model: 'Gemma-4-E4B-it-GGUF', retried: true, seconds: 6.4, load_seconds: 12.3, input_tokens: 410, output_tokens: 62, tokens_per_second: 31.6, time_to_first_token: 0.8 },
};

const comparison = (state: Comparison['state']): Comparison => ({ messageId: 7, state, keeping: null });

function client(state: CompareState) {
    const active = { provider: 'fireworks', provider_name: 'Fireworks AI', model: CLOUD_ID, display_name: 'Qwen3.6', label: null, remote: true, is_default: true, downloaded: true } as ActiveModel;
    const base = createFakeClient({
        activeModel: active,
        providers: {
            providers: [
                { id: 'local', name: 'Local', remote: false, configured: true, blocked: false, privacy_notice: '' },
                { id: 'fireworks', name: 'Fireworks AI', remote: true, configured: true, blocked: false, privacy_notice: '' },
            ],
            ...(state === 'retry-error' ? { lemonade_error: 'The model server did not answer.' } : {}),
        },
        providerModels: {
            local: { provider: 'local', models: [model('Gemma-4-E4B-it-GGUF', { size_gb: 5.1 }), model('Qwen3-4B-Instruct-GGUF', { size_gb: 2.5 })] },
            fireworks: { provider: 'fireworks', models: [model(CLOUD_ID, { display_name: 'Qwen3.6', size_gb: null }), model('accounts/fireworks/models/glm-5', { display_name: 'GLM 5', size_gb: null })] },
        },
    });
    if (state === 'retry-loading') base.listProviderSummaries = () => new Promise<never>(() => undefined);
    return base;
}

export function CompareGallery({ state }: { state: CompareState }) {
    const t = useT();
    const fake = useMemo(() => client(state), [state]);
    const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);
    const noop = () => undefined;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={fake}>
                <UIProvider>
                    <Screen scroll>
                        {state.startsWith('retry-') ? (
                            <RetrySheet open onClose={noop} answeredBy={CLOUD_ID} onPick={noop} />
                        ) : (
                            <AnswerComparison
                                original={ORIGINAL}
                                originalModel={CLOUD_ID}
                                originalLatencyMs={2300}
                                comparison={comparison(
                                    state === 'compare-running'
                                        ? { status: 'running', model: 'Gemma-4-E4B-it-GGUF' }
                                        : state === 'compare-failed'
                                          ? { status: 'failed', model: 'Gemma-4-E4B-it-GGUF', ...failureOf(new GaiaApiError(500, 'Not enough free memory to load the model.'), t) }
                                          : { status: 'ready', result: RESULT },
                                )}
                                onKeep={noop}
                                onClose={noop}
                            />
                        )}
                    </Screen>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
