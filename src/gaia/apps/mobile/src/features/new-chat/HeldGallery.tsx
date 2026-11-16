// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { SystemStatus } from '@webui/types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { UIProvider } from '@/ui';

import { NewChatScreen } from './NewChatScreen';

const STARTING = {
    lemonade_running: true, context_size_sufficient: true, model_context_size: 65536, download_progress: null,
    init_state: 'initializing', init_tasks: [{ name: 'Loading the model', status: 'running' }],
} as unknown as SystemStatus;

/** Developer gallery (`/dev/composer?state=held`): a first message waiting for GAIA to finish starting. */
export function HeldGallery() {
    const client = useMemo(() => createFakeClient({ status: STARTING }), []);
    const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);
    const noop = () => undefined;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <NewChatScreen onOpen={noop} onChooseDocuments={noop} initialHeld="Summarize the board notes for me" />
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
