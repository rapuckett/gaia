// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { RadioCard, Reasons } from './PlanStep';

jest.mock('@/platform/direction', () => ({ applyDirection: jest.fn(), layoutDirection: () => 'rtl' }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

beforeEach(() => useLocaleStore.getState().setLocale('ar'));
afterEach(() => useLocaleStore.getState().setLocale(null));

describeNative('the Plan step in Arabic on native', () => {
    it('start-aligns reason text in an RTL paragraph (iOS mirrors the physical side)', async () => {
        const reason = 'اختيار GAIA المختبر لجهاز مثل هذا. (GAIA’s tested pick for a PC like this one.)';
        await render(<Reasons items={[reason]} />, { wrapper: wrap });
        await waitFor(() => expect(screen.getAllByText(/GAIA/)).toHaveLength(1));
        expect(screen.getAllByText(/GAIA/)[0].props.style).toMatchObject({ writingDirection: 'rtl', textAlign: Platform.OS === 'ios' ? 'left' : 'right' });
    });

    it('lets the choice title wrap inside the card', async () => {
        const name = 'شغّل Gemma 4 E4B على الكمبيوتر لديك (Run Gemma 4 E4B on your PC)';
        await render(
            <RadioCard where="local" picked disabled={false} label="card" name={name} onPick={jest.fn()}>
                {null}
            </RadioCard>,
            { wrapper: wrap },
        );
        await waitFor(() => expect(screen.getAllByText(/Gemma 4 E4B/)).toHaveLength(1));
        const title = screen.getAllByText(/Gemma 4 E4B/)[0];
        expect(title.props.numberOfLines).toBeUndefined();
        expect(title.parent?.props.style).toMatchObject({ flex: 1 });
    });
});
