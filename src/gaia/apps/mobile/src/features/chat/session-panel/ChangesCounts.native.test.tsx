// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { SessionChanges } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import { ChangesSection } from './ChangesSection';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const changes: SessionChanges = {
    files: [
        { path: '/work/a.txt', change: 'edited', unified: '', binary: false, too_large: false, truncated: false, additions: 12, deletions: 4, before_size: 1, after_size: 2, message_ids: [7], changed_since: null },
    ],
    totals: { files: 1, additions: 12, deletions: 4, uncounted: 0 },
    turns: 1,
    pending: false,
    untracked: [],
    incomplete: false,
};

(Platform.OS === 'web' ? describe.skip : describe)('per-file counts', () => {
    it('are their own left-to-right run', async () => {
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={createFakeClient({ sessionChanges: { s1: changes } })}>
                    <ThemeProvider>
                        <ChangesSection sessionId="s1" live={false} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
        const counts = (await screen.findByTestId('changes-counts-/work/a.txt')) as unknown as { props: { style: { writingDirection?: string } } };
        expect(counts.props.style.writingDirection).toBe('ltr');
    });
});
