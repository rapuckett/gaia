// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data/GaiaClientProvider';
import { useDirection } from '@/i18n/useT';
import { applyDirection } from '@/platform/direction';
import { platformFetch } from '@/platform/fetch';
import { useConnectionStore } from '@/state/connection';

export default function RootLayout() {
    const [queryClient] = useState(() => new QueryClient());
    const dir = useDirection();
    const connection = useConnectionStore((s) => s.connection);
    const client = useMemo(
        () => (connection ? createHttpClient({ ...connection, fetch: platformFetch }) : null),
        [connection],
    );

    useEffect(() => applyDirection(dir), [dir]);

    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <Stack screenOptions={{ headerShown: false }} />
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
