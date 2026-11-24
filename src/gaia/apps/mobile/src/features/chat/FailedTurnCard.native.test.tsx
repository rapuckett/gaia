// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Message } from '@/api/client.types';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { SavedReplyErrors } from './ReplyErrors';

const mockPush = jest.fn();
let mockLocal = false;
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@/data', () => ({
    useSession: () => ({ data: { inference_remote: !mockLocal ? undefined : false } }),
    useStartScreen: () => ({ data: undefined, dataUpdatedAt: 0, refetch: () => undefined }),
}));

const t = translator('en');
const reply = (content: string) => ({ id: 1, session_id: 's1', role: 'assistant', content, failed: true }) as Message;

const mount = (content: string, latest = true) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <SavedReplyErrors message={reply(content)} latest={latest} />
            </ThemeProvider>
        </SafeAreaProvider>,
    );

describe('failed reply names its cause', () => {
    beforeEach(() => {
        mockPush.mockClear();
        mockLocal = false;
    });

    it.each([
        ['modelUnavailable', "Failed to start the query run: Failed to preload model: Lemonade has no model called 'x'."],
        ['modelLoad', 'Failed to start the query run: Failed to load model Gemma: llama-server exited with code 1.'],
        ['context', 'Failed to start the query run: Error: request exceeds the available context size.'],
    ] as const)('%s: title and body', async (kind, content) => {
        await mount(content);
        expect(screen.getByText(t(`failedTurn.${kind}.title`))).toBeTruthy();
        expect(screen.getByText(t(`failedTurn.${kind}.body`))).toBeTruthy();
        expect(screen.queryByText(t('msg.error'))).toBeNull();
    });

    it('unknown keeps "Something went wrong", with the plain body and the raw text under Details', async () => {
        await mount('Failed to start the query run: Error: upstream reset');
        expect(screen.getByText(t('msg.error'))).toBeTruthy();
        expect(screen.getByText(t('failedTurn.unknown.body'))).toBeTruthy();
        expect(screen.queryByText(/upstream reset/)).toBeNull();
        await fireEvent.press(screen.getByTestId('failed-details-toggle'));
        expect(screen.getByText(/Error: upstream reset/)).toBeTruthy();
        expect(screen.queryByTestId('open-settings-model')).toBeNull();
    });

    it('Open Settings opens Agent & model for a model failure', async () => {
        await mount('Failed to start the query run: Failed to load model Gemma: llama-server exited with code 1.');
        await fireEvent.press(screen.getByTestId('open-settings-model'));
        expect(mockPush).toHaveBeenCalledWith({ pathname: '/settings/[section]', params: { section: 'model' } });
    });

    it('a remedy naming Advanced › Custom model ID lands on that card', async () => {
        await mount("Failed to start the query run: Failed to preload model: Lemonade has no model called 'x'. Check Settings › Advanced › Custom model ID.");
        await fireEvent.press(screen.getByTestId('open-settings-advanced'));
        expect(mockPush).toHaveBeenCalledWith({ pathname: '/settings/[section]', params: { section: 'advanced', target: 'custom-model' } });
    });

    it('an agent crash offers the agent log, opened on the agent source, not the server log', async () => {
        mockLocal = true;
        await mount('The agent stopped unexpectedly. Its log is in /Users/alex/.gaia/agents/gaia/logs');
        expect(screen.queryByTestId('server-log')).toBeNull();
        expect(screen.getByText(t('logs.agentLog'))).toBeTruthy();
        await fireEvent.press(screen.getByTestId('agent-log'));
        expect(mockPush).toHaveBeenCalledWith({ pathname: '/logs', params: { source: 'agent' } });
    });

    it('orders the card: title, body, Details, Try again, Settings, then the server log on a local model', async () => {
        mockLocal = true;
        const { toJSON } = await mount('Failed to start the query run: Failed to load model Gemma: llama-server exited with code 1.');
        const ids = [...JSON.stringify(toJSON()).matchAll(/"testID":"(error-banner|failed-lead|try-again|open-settings-model|server-log)"/g)].map((m) => m[1]);
        expect(ids).toEqual(['error-banner', 'failed-lead', 'try-again', 'open-settings-model', 'server-log']);
        await fireEvent.press(screen.getByTestId('server-log'));
        expect(mockPush).toHaveBeenCalledWith('/logs');
    });

    it('no server log button on a remote model, and no Try again on an older reply', async () => {
        await mount('Failed to start the query run: Failed to load model Gemma: llama-server exited with code 1.', false);
        expect(screen.queryByTestId('server-log')).toBeNull();
        expect(screen.queryByTestId('try-again')).toBeNull();
    });
});
