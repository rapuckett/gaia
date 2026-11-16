// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { tEn, translator } from '@webui/i18n/translator';
import { providerNotice } from '@webui/utils/providerText';
import { uploadRefusalText } from '@webui/utils/uploadErrors';

import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { PolicyAlert } from './activity/PolicyAlert';
import { HistoryNotice } from './HistoryNotice';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const TEXT = "Older messages are now out of the model's view (6 turns).";
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('history notice', () => {
    it('keeps the PC English text centered, left-to-right and off the screen sides', async () => {
        const { toJSON } = await render(
            <ThemeProvider>
                <HistoryNotice text={TEXT} />
            </ThemeProvider>,
        );
        expect(screen.getByText(TEXT).props.style).toEqual(expect.objectContaining({ writingDirection: 'ltr', textAlign: 'center' }));
        expect(JSON.stringify(toJSON())).toMatch(/"paddingHorizontal":16/);
    });
});

describeNative('policy reason in Arabic', () => {
    afterEach(() => useLocaleStore.getState().setLocale(null));

    it('keeps the server English left-to-right, aligned to the UI start', async () => {
        useLocaleStore.getState().setLocale('ar');
        await render(
            <ThemeProvider>
                <PolicyAlert step={{ tool: 'delete_file', reason: 'Deleting files is restricted.' } as never} />
            </ThemeProvider>,
        );
        const style = screen.getByText('Deleting files is restricted.').props.style;
        expect(style).toEqual(expect.objectContaining({ writingDirection: 'ltr' }));
        expect(style.textAlign).toBeDefined();
    });
});

describe('Arabic text the dev scenes show', () => {
    const ar = translator('ar');

    it('reads the empty-file refusal from the catalog', () => {
        const text = uploadRefusalText('empty_file', null, '', ar);
        expect(text).toBe(ar('composer.upload.empty'));
        expect(text).not.toBe(tEn('composer.upload.empty'));
    });

    it('translates the cloud consent sentence when the server sends the catalog English', () => {
        const text = providerNotice(ar, { id: 'fireworks', privacy_notice: tEn('providers.fireworks.notice') });
        expect(text).toBe(ar('providers.fireworks.notice'));
    });
});
