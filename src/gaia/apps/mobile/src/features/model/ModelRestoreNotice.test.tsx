// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { keepTogether } from '@webui/i18n/registry';

import type { ActiveModel } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { ModelRestoreNotice } from './ModelRestoreNotice';

const t = translator('en');
const ACTIVE: ActiveModel = { provider: 'local', model: 'm', label: 'Gemma 4 E4B', remote: false, is_default: true };

async function mount(restore: ActiveModel['restore'], onPick = jest.fn()) {
    const client = createFakeClient({ activeModel: { ...ACTIVE, restore } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<ModelRestoreNotice onPick={onPick} />, { wrapper: wrap });
    return onPick;
}

describe('ModelRestoreNotice', () => {
    it('a failed restore offers Pick a model, which opens the picker and clears the notice', async () => {
        const onPick = await mount({ status: 'failed', message: 'Could not restore Claude.' });
        expect(await screen.findByText('Could not restore Claude.')).toBeTruthy();
        fireEvent.press(screen.getByText(t('startup.pickModel')));
        expect(onPick).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByText('Could not restore Claude.')).toBeNull());
    });

    it('a restore that worked says so without a Pick a model action', async () => {
        await mount({ status: 'restored', message: 'Restored Gemma.' });
        expect(await screen.findByText('Restored Gemma.')).toBeTruthy();
        expect(screen.queryByText(t('startup.pickModel'))).toBeNull();
    });

    it('keeps the model name in the sentence as one isolated unit', async () => {
        await mount({ status: 'restored', message: 'Restored your saved model, Gemma 4 E4B.' });
        expect(await screen.findByText(`Restored your saved model, ${keepTogether('Gemma 4 E4B')}.`)).toBeTruthy();
    });

    it('shows nothing when there is nothing to report', async () => {
        await mount({ status: 'none', message: null });
        expect(screen.queryByTestId('model-restore-notice')).toBeNull();
    });
});
