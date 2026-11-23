// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import ReadAloud from './ReadAloud';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const SETTINGS: NonNullable<FakeClientData['speechSettings']> = {
    voice: 'af_heart', speed: 100, auto: false, min_speed: 50, max_speed: 200,
    voices: [
        { id: 'af_heart', name: 'Heart', accent: 'american', gender: 'female', quality: 'A' },
        { id: 'am_adam', name: 'Adam', accent: 'american', gender: 'male', quality: 'B' },
    ],
};

const mount = async (speechSettings: FakeClientData['speechSettings'] = SETTINGS) => {
    const client = createFakeClient({ speechSettings });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<ReadAloud />, { wrapper });
    await screen.findByTestId('read-aloud-voice');
};

describeNative('Settings > Read aloud accessibility', () => {
    it('every control is named, has a role and holds 44 pt', async () => {
        await mount();
        const list = touchables();
        expect(list.map((x) => x.testID)).toEqual(expect.arrayContaining(['read-aloud-voice', 'read-aloud-preview', 'read-aloud-speed', 'read-aloud-auto']));
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
    });

    it('each picker says its label and its current value, and that it opens a list', async () => {
        await mount();
        const voice = touchables().find((x) => x.testID === 'read-aloud-voice')!;
        expect(voice.name).toBe(`${t('readAloud.settings.voice')}: Heart`);
        expect(voice.expanded).toBe(false);
        expect((voice.node.props as { 'aria-haspopup'?: string })['aria-haspopup']).toBe('listbox');
        const speed = touchables().find((x) => x.testID === 'read-aloud-speed')!;
        expect(speed.name).toBe(`${t('readAloud.settings.speed')}: ${t('readAloud.settings.normalSpeed')}`);
    });

    it('the voice list opens as a modal sheet whose options are radios with one checked', async () => {
        await mount();
        await fireEvent.press(screen.getByTestId('read-aloud-voice'));
        await screen.findByText('Adam');
        expect(walk().some((n) => n.props.accessibilityViewIsModal === true)).toBe(true);
        const options = touchables().filter((x) => x.role === 'radio' || x.checked !== undefined);
        expect(options.length).toBeGreaterThanOrEqual(2);
        expect(options.filter((o) => o.checked === true || o.selected === true)).toHaveLength(1);
    });

    it('Auto-read is a switch that exposes its state and flips it', async () => {
        await mount();
        const auto = () => touchables().find((x) => x.testID === 'read-aloud-auto')!;
        expect(auto().role).toBe('switch');
        expect(auto().checked).toBe(false);
        await fireEvent.press(screen.getByTestId('read-aloud-auto'));
        await waitFor(() => expect(auto().checked).toBe(true));
    });

    it('Preview is a named button', async () => {
        await mount();
        const preview = touchables().find((x) => x.testID === 'read-aloud-preview')!;
        expect(preview.role).toBe('button');
        expect(preview.name).toBe(t('readAloud.settings.preview'));
    });

    it('the explanation comes before the controls, and the footnote after them', async () => {
        await mount();
        const order = walk().map((n) => n.props.testID);
        const text = (s: string) => walk().findIndex((n) => (n.children ?? []).some((c) => c === s));
        expect(text(t('readAloud.settings.lede'))).toBeLessThan(order.indexOf('read-aloud-voice'));
        expect(order.indexOf('read-aloud-auto')).toBeLessThan(text(t('readAloud.settings.shared')));
    });
});
