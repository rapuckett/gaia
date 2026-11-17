// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';

import { GaiaNetworkError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useT } from '@/i18n/useT';
import { UIProvider } from '@/ui';

import { NewChatScreen } from './NewChatScreen';

export const NEW_CHAT_STATES = ['create-failed', 'skill-prompt'] as const;
export type NewChatState = (typeof NEW_CHAT_STATES)[number];

const noop = () => undefined;

/**
 * Developer gallery (`/dev/composer?state=`). APP-20 `create-failed`: a draft in the box and a PC that refuses to
 * make the chat; `#tap=composer-send` shows the failure notice. APP-21 `skill-prompt`: a skill's Try it prompt
 * arriving under an unsent draft, as the Skills screen sends it.
 */
export function NewChatGallery({ state }: { state: NewChatState }) {
    const t = useT();
    const client = useMemo(() => {
        const fake = createFakeClient({});
        return state === 'create-failed'
            ? { ...fake, createSession: () => Promise.reject(new GaiaNetworkError('http://pc.local:4200/api/sessions', new Error('Network request failed'))) }
            : fake;
    }, [state]);
    const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <NewChatScreen
                        onOpen={noop}
                        onChooseDocuments={noop}
                        initialText={state === 'create-failed' ? 'Draft a status update for the team' : 'Compare these two quotes'}
                        prompt={state === 'skill-prompt' ? { id: 'skill:summarize', text: t('settings.skills.tryPrompt', { name: 'summarize' }) } : undefined}
                    />
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
