// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { Screen, Stack, UIProvider } from '@/ui';

import { PrivacyUndo } from './PrivacyUndo';

/** Developer gallery (`/dev/permission?only=undo`): the undo-history retention settings, open. */
export function UndoScene() {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() =>
        createFakeClient({ undoSettings: { retention_days: 7, max_mb: 500, used_bytes: 38_400_000, turns: 42, path: '/Users/avery/.gaia/undo' } }),
    );
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <Screen scroll>
                        <Stack paddingX="gutter" paddingY="md">
                            <PrivacyUndo initialOpen />
                        </Stack>
                    </Screen>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
