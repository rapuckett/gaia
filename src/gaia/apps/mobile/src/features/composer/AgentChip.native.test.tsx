// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Settings } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { openSettings } from '@/features/settings/openSettings';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { AgentChip } from './AgentChip';

jest.mock('@/features/settings/openSettings', () => ({ openSettings: jest.fn() }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');
const SETTINGS = {
    custom_model: null, model_status: null, context_size: null, dynamic_tools: false, dynamic_tools_locked: false,
    agent_mode: 'manual', network_policy: 'cloud_allowed', flagship_agent: 'gaiapy', gaiacpp_available: true,
} as Settings;

const show = (agent: Settings['flagship_agent']) =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={createFakeClient({ settings: { ...SETTINGS, flagship_agent: agent } })}>
                <ThemeProvider>
                    <AgentChip />
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );

describeNative('the Fast and light chip', () => {
    it('shows while gaiacpp is the agent, with its title as the hint, and opens the model settings', async () => {
        await show('gaiacpp');
        const chip = await screen.findByTestId('agent-chip');
        expect(chip.props.accessibilityHint).toBe(t('composer.agentFastTitle'));
        await fireEvent.press(chip);
        expect(openSettings).toHaveBeenCalledWith('model');
    });

    it('shows nothing for the default agent', async () => {
        await show('gaiapy');
        await screen.findByTestId('agent-chip').then(
            () => {
                throw new Error('the chip showed for gaiapy');
            },
            () => undefined,
        );
        expect(screen.queryByTestId('agent-chip')).toBeNull();
    });
});
