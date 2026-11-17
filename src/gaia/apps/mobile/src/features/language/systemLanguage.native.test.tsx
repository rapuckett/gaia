// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { BackHandler, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { deviceLocaleCode } from '@/i18n/useT';
import { layoutDirection } from '@/platform/direction';
import { useLanguageSwitch } from '@/state/languageSwitch';
import { useLocaleStore } from '@/state/locale';
import { checkSystemLanguage, resetSystemLanguageCheck } from '@/state/systemLanguage';
import { UIProvider } from '@/ui';

import { LanguageSwitchHost } from './LanguageSwitchCover';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('@/platform/direction', () => ({ applyDirection: jest.fn(), layoutDirection: jest.fn(() => 'ltr') }));
jest.mock('@/i18n/useT', () => ({ ...jest.requireActual('@/i18n/useT'), deviceLocaleCode: jest.fn(() => 'en') }));

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <UIProvider>{children}</UIProvider>
    </SafeAreaProvider>
);

let backHandlers: (() => boolean)[] = [];

beforeEach(async () => {
    backHandlers = [];
    await AsyncStorage.clear();
    resetSystemLanguageCheck();
    useLanguageSwitch.setState({ target: null, previousPick: null });
    useLocaleStore.setState({ locale: null, hydrated: true });
    jest.mocked(deviceLocaleCode).mockReturnValue('en');
    jest.mocked(layoutDirection).mockReturnValue('ltr');
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
        backHandlers.push(h as () => boolean);
        return { remove: () => void backHandlers.splice(backHandlers.indexOf(h as () => boolean), 1) };
    });
    jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

/** The phone is now Arabic while the layout is still left to right. */
function phoneSwitchedToArabic() {
    jest.mocked(deviceLocaleCode).mockReturnValue('ar');
}

describeNative('system language change', () => {
    describe('on Android', () => {
        beforeEach(() => {
            jest.replaceProperty(Platform, 'OS', 'android');
        });

        it('a direction mismatch shows the cover with Close and no Cancel; back exits', async () => {
            await AsyncStorage.setItem('gaia.deviceLocale', 'en');
            phoneSwitchedToArabic();
            await render(<LanguageSwitchHost />, { wrapper: wrap });
            await act(async () => checkSystemLanguage());
            expect(await screen.findByTestId('language-switch-cover')).toBeTruthy();
            expect(screen.getByTestId('language-switch-close')).toBeTruthy();
            expect(screen.queryByTestId('language-switch-cancel')).toBeNull();
            let handled = false;
            await act(async () => {
                handled = [...backHandlers].reverse().some((h) => h());
            });
            expect(handled).toBe(true);
            expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
        });

        it('Close exits the app', async () => {
            phoneSwitchedToArabic();
            await render(<LanguageSwitchHost />, { wrapper: wrap });
            await act(async () => checkSystemLanguage());
            fireEvent.press(await screen.findByTestId('language-switch-close'));
            expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
        });

        it('a language that matches the layout shows nothing', async () => {
            await render(<LanguageSwitchHost />, { wrapper: wrap });
            await act(async () => checkSystemLanguage());
            expect(screen.queryByTestId('language-switch-cover')).toBeNull();
        });

        it('a language the phone changed replaces an older in-app pick', async () => {
            await AsyncStorage.setItem('gaia.deviceLocale', 'en');
            useLocaleStore.setState({ locale: 'en' });
            phoneSwitchedToArabic();
            await act(async () => checkSystemLanguage());
            expect(useLocaleStore.getState().locale).toBeNull();
            expect(await AsyncStorage.getItem('gaia.deviceLocale')).toBe('ar');
        });

        it('keeps the in-app pick when the phone did not change', async () => {
            await AsyncStorage.setItem('gaia.deviceLocale', 'en');
            useLocaleStore.setState({ locale: 'ar' });
            jest.mocked(layoutDirection).mockReturnValue('rtl');
            await act(async () => checkSystemLanguage());
            expect(useLocaleStore.getState().locale).toBe('ar');
        });

        it('a mismatch that survives a cold start logs an error and shows no cover; a match clears the marker', async () => {
            const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
            await AsyncStorage.setItem('gaia.deviceLocale', 'ar');
            await AsyncStorage.setItem('gaia.systemSwitchShown', 'ar');
            phoneSwitchedToArabic();
            await render(<LanguageSwitchHost />, { wrapper: wrap });
            await act(async () => checkSystemLanguage());
            expect(screen.queryByTestId('language-switch-cover')).toBeNull();
            expect(error).toHaveBeenCalledTimes(1);
            await act(async () => checkSystemLanguage());
            expect(screen.queryByTestId('language-switch-cover')).toBeNull();
            expect(error).toHaveBeenCalledTimes(1);
            jest.mocked(layoutDirection).mockReturnValue('rtl');
            await act(async () => checkSystemLanguage());
            expect(await AsyncStorage.getItem('gaia.systemSwitchShown')).toBeNull();
        });

        it('leaves an in-app pick to its own cover', async () => {
            phoneSwitchedToArabic();
            useLanguageSwitch.setState({ target: 'ar', previousPick: null });
            await render(<LanguageSwitchHost />, { wrapper: wrap });
            await act(async () => checkSystemLanguage());
            expect(await screen.findByTestId('language-switch-cancel')).toBeTruthy();
        });
    });

    it('iOS shows no cover', async () => {
        jest.replaceProperty(Platform, 'OS', 'ios');
        phoneSwitchedToArabic();
        await render(<LanguageSwitchHost />, { wrapper: wrap });
        await act(async () => checkSystemLanguage());
        expect(screen.queryByTestId('language-switch-cover')).toBeNull();
    });
});
