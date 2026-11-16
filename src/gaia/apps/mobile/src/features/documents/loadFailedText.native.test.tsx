// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { translator } from '@/i18n/useT';
import { useLocaleStore } from '@/state/locale';
import { Text, ThemeProvider } from '@/ui';

import { loadFailedText } from './loadFailedText';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

beforeEach(() => useLocaleStore.getState().setLocale('ar'));
afterEach(() => useLocaleStore.getState().setLocale(null));

describeNative('the Arabic load failure on screen', () => {
    it('puts the English gloss on its own line, so a wrapped English reason never sits beside it', async () => {
        const detail = 'The PC didn’t answer.';
        await render(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ThemeProvider>
                    <Text testID="failed">{loadFailedText(translator('ar'), new GaiaApiError(500, detail))}</Text>
                </ThemeProvider>
            </SafeAreaProvider>,
        );
        const [own, gloss] = screen.getByTestId('failed').props.children as [string, { props: { children: string } }];
        expect(own.endsWith(`${detail}\u2069\u2069\n`)).toBe(true);
        expect(gloss.props.children).toContain(`(Couldn't load your documents: \u2068${detail}\u2069)`);
    });
});
