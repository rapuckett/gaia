// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { BackHandler, Keyboard, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { applyDirection } from '@/platform/direction';
import { pickLanguage, useLanguageSwitch } from '@/state/languageSwitch';
import { useLocaleStore } from '@/state/locale';
import { UIProvider } from '@/ui';
import { contentWidth } from '@/ui/tokens/space';

import { LanguageSwitchCover, LanguageSwitchHost } from './LanguageSwitchCover';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('@/platform/direction', () => ({ applyDirection: jest.fn(), layoutDirection: jest.fn(() => 'ltr') }));

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <UIProvider>{children}</UIProvider>
    </SafeAreaProvider>
);

let backHandlers: (() => boolean)[] = [];

beforeEach(() => {
    backHandlers = [];
    useLanguageSwitch.setState({ target: null, previousPick: null });
    useLocaleStore.setState({ locale: null, hydrated: true });
    jest.mocked(applyDirection).mockClear();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
        backHandlers.push(h as () => boolean);
        return { remove: () => void backHandlers.splice(backHandlers.indexOf(h as () => boolean), 1) };
    });
    jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

const mountHost = () => render(<LanguageSwitchHost />, { wrapper: wrap });

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('language switch cover', () => {
    it('covers the app after a direction-changing pick, not after a same-direction one', async () => {
        await mountHost();
        await act(async () => pickLanguage('en'));
        expect(screen.queryByTestId('language-switch-cover')).toBeNull();
        await act(async () => pickLanguage('ar'));
        expect(await screen.findByTestId('language-switch-cover')).toBeTruthy();
    });

    it('puts the keyboard away when it covers the app', async () => {
        const dismiss = jest.spyOn(Keyboard, 'dismiss');
        await mountHost();
        expect(dismiss).not.toHaveBeenCalled();
        await act(async () => pickLanguage('ar'));
        await screen.findByTestId('language-switch-cover');
        expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('words the cover in the target language, whichever way the switch goes', async () => {
        await mountHost();
        await act(async () => pickLanguage('ar'));
        expect((await screen.findAllByText(/أغلق GAIA/, { includeHiddenElements: true })).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/إلغاء/, { includeHiddenElements: true }).length).toBeGreaterThan(0);
    });

    it('Cancel restores the previous language and direction and removes the cover', async () => {
        useLocaleStore.setState({ locale: 'en' });
        await mountHost();
        await act(async () => pickLanguage('ar'));
        jest.mocked(applyDirection).mockClear();
        fireEvent.press(await screen.findByTestId('language-switch-cancel'));
        expect(useLocaleStore.getState().locale).toBe('en');
        expect(applyDirection).toHaveBeenCalledWith('ltr', 'en', true);
        await waitFor(() => expect(screen.queryByTestId('language-switch-cover')).toBeNull());
    });

    it('Cancel after following the phone goes back to following it', async () => {
        await mountHost();
        await act(async () => pickLanguage('ar'));
        fireEvent.press(await screen.findByTestId('language-switch-cancel'));
        expect(useLocaleStore.getState().locale).toBeNull();
    });

    it('pads the title and body by the screen gutter', async () => {
        await mountHost();
        await act(async () => pickLanguage('ar'));
        const content = await screen.findByTestId('language-switch-content');
        expect(StyleSheet.flatten(content.props.style)).toMatchObject({ paddingHorizontal: 16 });
    });

    it('caps its column at the flow width', async () => {
        await mountHost();
        await act(async () => pickLanguage('ar'));
        const cover = await screen.findByTestId('language-switch-cover');
        expect(within(cover).getByTestId('screen-content').props.dataSet).toEqual({ contentWidth: String(contentWidth.flow) });
    });

    it.each([
        ['en', 'ar', 'rtl'],
        ['ar', 'en', undefined],
    ])('with the UI in %s and the cover in %s, the Close label is pinned %s', async (ui, target, dir) => {
        jest.replaceProperty(Platform, 'OS', 'android');
        useLocaleStore.setState({ locale: ui });
        await render(<LanguageSwitchCover target={target} platform="android" />, { wrapper: wrap });
        const close = await screen.findByTestId('language-switch-close');
        const span = within(close).getByText(/Close/, { includeHiddenElements: true });
        const label = span.parent?.props.style && target === 'ar' ? span.parent : span;
        // Only a line with an English gloss is pinned; plain English follows the paragraph, never the UI's rtl.
        expect(StyleSheet.flatten(label.props.style).writingDirection).toBe(dir);
    });

    describe('on Android', () => {
        beforeEach(() => {
            jest.replaceProperty(Platform, 'OS', 'android');
        });

        it('system back is Cancel', async () => {
            await mountHost();
            await act(async () => pickLanguage('ar'));
            await screen.findByTestId('language-switch-cover');
            let handled = false;
            await act(async () => {
                handled = [...backHandlers].reverse().some((h) => h());
            });
            expect(handled).toBe(true);
            expect(screen.queryByTestId('language-switch-cover')).toBeNull();
            expect(useLocaleStore.getState().locale).toBeNull();
        });

        it('Close exits the app', async () => {
            await mountHost();
            await act(async () => pickLanguage('ar'));
            fireEvent.press(await screen.findByTestId('language-switch-close'));
            expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
        });
    });

    it('on iOS there is no Close button, only Cancel', async () => {
        jest.replaceProperty(Platform, 'OS', 'ios');
        await mountHost();
        await act(async () => pickLanguage('ar'));
        expect(await screen.findByTestId('language-switch-cancel')).toBeTruthy();
        expect(screen.queryByTestId('language-switch-close')).toBeNull();
        expect(backHandlers).toHaveLength(0);
    });
});
