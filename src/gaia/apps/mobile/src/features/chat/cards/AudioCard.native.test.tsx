// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { getToolLabels, say } from '@webui/utils/agentActivity.core';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { AudioCard } from './AudioCard';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const t = translator('en');
const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const base = { src: '/api/media/audio/a.wav', caption: 'Hello' };

async function show(data: unknown) {
    await render(
        <QueryClientProvider client={new QueryClient()}>
            <GaiaClientProvider client={createFakeClient()}>
                <ThemeProvider>
                    <AudioCard data={data} />
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
}

describeNative('the audio card', () => {
    it('shows where the file and its script were saved', async () => {
        await show({ ...base, saved_to: '/Users/a/Music/a.wav', script_path: '/Users/a/Docs/a.txt' });
        expect(screen.getByTestId('card-audio-saved-to')).toHaveTextContent(`${t('media.savedTo')} \u2066/Users/a/Music/a.wav\u2069`);
        expect(screen.getByTestId('card-audio-script')).toHaveTextContent(`${t('media.listeningScript')} \u2066/Users/a/Docs/a.txt\u2069`);
    });

    it('shows neither line when the payload has none', async () => {
        await show(base);
        expect(screen.queryByTestId('card-audio-saved-to')).toBeNull();
        expect(screen.queryByTestId('card-audio-script')).toBeNull();
    });
});

describe('the dictate step labels', () => {
    it('say what is running and what finished', () => {
        const labels = getToolLabels('dictate_document');
        expect(say(t, labels.activeLabel)).toBe('Turning document into audio');
        expect(say(t, labels.label)).toBe('Turned document into audio');
    });
});
