// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ProviderModel } from '@/api/client.types';
import { ThemeProvider } from '@/ui';

import { ModelRow } from './ModelRow';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const gemma: ProviderModel = {
    id: 'Gemma-4-E4B-it-GGUF',
    display_name: 'Gemma 4 E4B',
    context_length: null,
    downloaded: true,
    labels: [],
    rank: null,
    note: null,
    evidence: null,
    available: true,
    state: 'loaded',
    fits: true,
    size_gb: 5.97,
};

const renderRow = (current: boolean) =>
    render(
        <ModelRow
            model={gemma}
            label="Gemma 4 E4B"
            current={current}
            remote={false}
            busy={null}
            onUse={jest.fn()}
            onDownload={jest.fn()}
            onRemove={jest.fn()}
            onNpuRecheck={jest.fn()}
        />,
        { wrapper: wrap },
    );

describeNative('Model row', () => {
    it('ends at the Details disclosure on the in-use model, with no empty action row under it', async () => {
        await renderRow(true);
        const kids = screen.getByTestId('model-row-Gemma-4-E4B-it-GGUF').children;
        const last = kids[kids.length - 1];
        expect(typeof last === 'object' && last.props.testID).toBe('model-details-Gemma-4-E4B-it-GGUF');
    });
    it('keeps the Use button row on a model that is not in use', async () => {
        await renderRow(false);
        expect(screen.getByTestId('model-use-Gemma-4-E4B-it-GGUF')).toBeTruthy();
    });
});
