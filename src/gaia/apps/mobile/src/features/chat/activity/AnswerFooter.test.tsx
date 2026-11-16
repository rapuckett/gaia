// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { InferenceStats } from '@webui/types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { AnswerFooter } from './AnswerFooter';

const t = translator('en');

const FULL = { tokens_per_second: 20, time_to_first_token: 1, input_tokens: 10, output_tokens: 10 };
const mount = (stats: Partial<InferenceStats>) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <AnswerFooter stats={{ ...FULL, ...stats }} />
            </ThemeProvider>
        </SafeAreaProvider>,
    );

describe('AnswerFooter hybrid route', () => {
    it('names the model the router picked, with its reason one tap away', async () => {
        await mount({ seconds: 4, route: { model: 'Qwen3.6-35B-A3B-GGUF', reason: 'Needs the larger model.' } });
        expect(screen.getByTestId('answer-route')).toBeTruthy();
        fireEvent.press(screen.getByTestId('answer-footer-toggle'));
        expect(await screen.findByText(t('msg.route', { reason: 'Needs the larger model.' }))).toBeTruthy();
    });

    it('hides the pick on a retried answer but still shows a degraded-route warning', async () => {
        await mount({ seconds: 4, retried: true, route: { model: 'x', degraded: true, notice: 'Routing is struggling.' } });
        expect(screen.queryByTestId('answer-route')).toBeNull();
        expect(screen.getByText('Routing is struggling.')).toBeTruthy();
    });
});
