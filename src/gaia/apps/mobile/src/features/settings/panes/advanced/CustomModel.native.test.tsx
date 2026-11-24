// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Settings } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { CustomModel, customModelRefused } from './CustomModel';

const t = translator('en');
const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const SETTINGS = { custom_model: null, model_status: null } as unknown as Settings;

describe('customModelRefused', () => {
    it('refuses a long or multi-line ID and accepts a normal one', () => {
        expect(customModelRefused('user.Qwen3-4B-GGUF')).toBe(false);
        expect(customModelRefused('a'.repeat(256))).toBe(false);
        expect(customModelRefused('a'.repeat(257))).toBe(true);
        expect(customModelRefused('one\ntwo')).toBe(true);
    });
});

describeNative('CustomModel', () => {
    it('says a refused ID in the app language and sends nothing', async () => {
        const client = createFakeClient({ settings: SETTINGS });
        const updateSettings = jest.spyOn(client, 'updateSettings');
        await render(
            <QueryClientProvider client={new QueryClient()}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <CustomModel settings={SETTINGS} />
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
        expect(screen.queryByTestId('advanced-custom-invalid')).toBeNull();
        await fireEvent.changeText(screen.getByTestId('advanced-custom-model'), 'a'.repeat(300));
        expect(screen.getByText(t('settings.advanced.customModelInvalid'))).toBeTruthy();
        await fireEvent.press(screen.getByTestId('advanced-custom-save'));
        expect(updateSettings).not.toHaveBeenCalled();
    });
});
