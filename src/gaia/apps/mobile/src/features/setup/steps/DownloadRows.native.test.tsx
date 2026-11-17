// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SetupModelProgress } from '@webui/types';

import { ThemeProvider } from '@/ui';

import { ModelRow } from './DownloadRows';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const model = {
    id: 'm1',
    roles: ['embedding'],
    state: 'downloading',
    bytes_done: 50,
    bytes_total: 100,
    speed_bps: 1,
    eta_s: null,
    error: null,
    error_kind: null,
    can_retry: false,
    retrying_until: null,
    downloaded_before_gb: null,
    log: [],
} as SetupModelProgress;

describeNative('ModelRow name', () => {
    it('keeps the model name whole and left to right, and the state beside it from shrinking', async () => {
        await render(
            <ModelRow
                model={model}
                name="EmbeddingGemma-300M-GGUF"
                estimate={undefined}
                now={0}
                freeGb={null}
                checking={false}
                checkingFor={0}
                retryLater={false}
                idle={false}
                busy={false}
                onRetry={jest.fn()}
                onResume={jest.fn()}
                onSkip={jest.fn()}
                onRestart={jest.fn()}
            />,
            { wrapper: wrap },
        );
        const name = screen.getByTestId('download-row-name') as unknown as { props: { numberOfLines?: number; ellipsizeMode?: string; style?: unknown } };
        expect(name.props.numberOfLines).toBe(2);
        expect(name.props.ellipsizeMode).toBe('middle');
        const state = screen.getByTestId('download-row-state') as unknown as { props: { style: { flexShrink: number } } };
        expect(state.props.style.flexShrink).toBe(0);
    });
});
