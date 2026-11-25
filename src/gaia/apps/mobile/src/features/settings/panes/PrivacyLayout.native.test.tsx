// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import type { SystemStatus } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import Privacy from './Privacy';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const STATUS = { lemonade_running: true, data_dir: '/Users/Shared/gaia-demo/.gaia' } as unknown as SystemStatus;
const alignOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).parent?.props.style)?.alignSelf;

async function show(status?: SystemStatus) {
    const client = createFakeClient({ ...(status ? { status } : {}), sessions: [] });
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <ThemeProvider>
                    <SheetHost>
                        <Privacy />
                    </SheetHost>
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
}

(Platform.OS === 'web' ? describe.skip : describe)('Settings > Privacy layout', () => {
    it('keeps Delete all chats and the troubleshooting report at their natural width, not full width', async () => {
        await show(STATUS);
        expect(alignOf('privacy-delete-all')).toBe('flex-start');
        expect(alignOf('privacy-report-pc-only')).toBe('flex-start');
    });

    it('shows the Data folder row with the path when the PC reports data_dir', async () => {
        await show(STATUS);
        expect(await screen.findByText(/gaia-demo/)).toBeTruthy();
        expect(screen.getByText('Data folder')).toBeTruthy();
    });

    it('has no Data folder row when the PC reports none', async () => {
        await show({ lemonade_running: true } as unknown as SystemStatus);
        expect(await screen.findByText('Delete all chats')).toBeTruthy();
        expect(screen.queryByText('Data folder')).toBeNull();
    });
});
