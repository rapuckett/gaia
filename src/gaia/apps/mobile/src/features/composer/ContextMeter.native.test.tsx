// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ContextUsage } from '@/api/client.types';
import { UIProvider } from '@/ui';

import { ContextMeter } from './ContextMeter';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const opts = { includeHiddenElements: true };

const usage = (pct: number, over: Partial<ContextUsage> = {}): ContextUsage =>
    ({
        window: 100,
        used: pct,
        reply_reserve: 0,
        system: 0,
        tools: 0,
        documents: 0,
        history: 0,
        query: 0,
        turns_in_view: 1,
        turns_hidden: 0,
        at_risk: [],
        model_window: null,
        tokenizer: { exact: true, model: 'm' },
        ...over,
    }) as unknown as ContextUsage;

const shown = (u: ContextUsage | null) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <UIProvider>
                <ContextMeter usage={u} />
            </UIProvider>
        </SafeAreaProvider>,
    );

describeNative('ContextMeter threshold', () => {
    it('is hidden at 49% and at 50%', async () => {
        await shown(usage(49));
        expect(screen.queryByTestId('context-meter', opts)).toBeNull();
        await screen.unmount();
        await shown(usage(50));
        expect(screen.queryByTestId('context-meter', opts)).toBeNull();
    });

    it('is not rendered when nothing is measured yet', async () => {
        await shown(null);
        expect(screen.queryByTestId('context-meter', opts)).toBeNull();
    });

    it('shows the percentage and the aria text above half', async () => {
        await shown(usage(72));
        const meter = screen.getByTestId('context-meter', opts);
        expect(meter.props.accessibilityLabel).toBe('Context 72% full: 72 of 100 tokens');
        expect(screen.getAllByText(/72%/, opts).length).toBeGreaterThan(0);
    });

    it('stays shown when turns are at risk', async () => {
        await shown(usage(20, { at_risk: ['q'] }));
        expect(screen.getByTestId('context-meter', opts)).toBeTruthy();
    });
});
