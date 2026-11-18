// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform } from 'react-native';

import { deviceLanguageCode, deviceLocaleCode } from '@/i18n/useT';

import { appLanguageSetting, type AppLanguageSetting } from '../../modules/gaia-app-language';
import { pickLanguage, useLanguageSwitch } from './languageSwitch';
import { hydrateLocale, useLocaleStore } from './locale';
import { checkSystemLanguage, resetSystemLanguageCheck, useSystemSwitch } from './systemLanguage';

jest.mock('../../modules/gaia-app-language', () => ({ appLanguageSetting: jest.fn(() => null) }));
jest.mock('@/i18n/useT', () => ({
    ...jest.requireActual('@/i18n/useT'),
    deviceLocaleCode: jest.fn(() => 'en'),
    deviceLanguageCode: jest.fn(() => 'en'),
}));

/** The phone's per-app language, held as the native module would. */
function perAppSetting(initial: string | null = null) {
    let tag = initial;
    const setting = {
        supported: true,
        get: jest.fn(() => tag),
        set: jest.fn((next: string | null) => {
            tag = next;
        }),
    } satisfies AppLanguageSetting;
    jest.mocked(appLanguageSetting).mockReturnValue(setting);
    return setting;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(appLanguageSetting).mockReturnValue(null);
    jest.mocked(deviceLocaleCode).mockReturnValue('en');
    jest.mocked(deviceLanguageCode).mockReturnValue('en');
    useLocaleStore.setState({ locale: null, hydrated: true });
    useLanguageSwitch.setState({ target: null, previousPick: null });
    resetSystemLanguageCheck();
});

afterEach(() => jest.restoreAllMocks());

describeNative('the language pick lives in the per-app setting', () => {
    describe.each(['ios', 'android'] as const)('on %s with a per-app language', (os) => {
        beforeEach(() => jest.replaceProperty(Platform, 'OS', os));

        it('a pick writes that one language tag, following the phone clears it, and nothing is stored by the app', async () => {
            const setting = perAppSetting();
            pickLanguage('ar');
            expect(setting.set).toHaveBeenLastCalledWith('ar');
            useLocaleStore.getState().setLocale(null);
            expect(setting.set).toHaveBeenLastCalledWith(null);
            await flush();
            expect(await AsyncStorage.getItem('gaia.locale')).toBeNull();
        });

        it('a launch reads the pick back from the per-app setting', async () => {
            perAppSetting('ar-EG');
            useLocaleStore.setState({ locale: null, hydrated: false });
            await hydrateLocale();
            expect(useLocaleStore.getState()).toMatchObject({ locale: 'ar', hydrated: true });
        });

        it('moves a stored pick into the per-app setting once, then forgets it', async () => {
            const setting = perAppSetting();
            await AsyncStorage.setItem('gaia.locale', 'ar');
            useLocaleStore.setState({ locale: null, hydrated: false });
            await hydrateLocale();
            expect(setting.set.mock.calls).toEqual([['ar']]);
            expect(await AsyncStorage.getItem('gaia.locale')).toBeNull();
            expect(useLocaleStore.getState().locale).toBe('ar');

            useLocaleStore.setState({ locale: null, hydrated: false });
            await hydrateLocale();
            expect(setting.set).toHaveBeenCalledTimes(1);
            expect(useLocaleStore.getState().locale).toBe('ar');
        });

        it('Cancel on the cover puts the previous per-app language back', () => {
            const setting = perAppSetting('en');
            useLocaleStore.setState({ locale: 'en' });
            pickLanguage('ar');
            expect(useLanguageSwitch.getState().target).toBe('ar');
            useLanguageSwitch.getState().cancel();
            expect(setting.set.mock.calls).toEqual([['ar'], ['en']]);
            expect(useLocaleStore.getState().locale).toBe('en');
        });

        it('Cancel after following the phone clears the per-app language again', () => {
            const setting = perAppSetting();
            pickLanguage('ar');
            useLanguageSwitch.getState().cancel();
            expect(setting.set.mock.calls).toEqual([['ar'], [null]]);
        });
    });

    it('Android: a stored pick the phone has since replaced in system Settings is dropped, not moved', async () => {
        jest.replaceProperty(Platform, 'OS', 'android');
        const setting = perAppSetting('ar');
        await AsyncStorage.multiSet([
            ['gaia.locale', 'en'],
            ['gaia.deviceLocale', 'en'],
        ]);
        useLocaleStore.setState({ locale: null, hydrated: false });
        await hydrateLocale();
        expect(setting.set).not.toHaveBeenCalled();
        expect(await AsyncStorage.getItem('gaia.locale')).toBeNull();
        expect(useLocaleStore.getState().locale).toBe('ar');
    });

    it('Android below 13 keeps the pick in the app', async () => {
        jest.replaceProperty(Platform, 'OS', 'android');
        pickLanguage('ar');
        await flush();
        expect(await AsyncStorage.getItem('gaia.locale')).toBe('ar');
        useLocaleStore.setState({ locale: null, hydrated: false });
        await hydrateLocale();
        expect(useLocaleStore.getState().locale).toBe('ar');
    });
});

describeNative('system Settings on Android', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

    it('with a per-app language the pick follows it, and the phone-language sync never runs', async () => {
        const setting = perAppSetting('en');
        useLocaleStore.setState({ locale: 'en' });
        await AsyncStorage.setItem('gaia.deviceLocale', 'en');
        jest.mocked(deviceLanguageCode).mockReturnValue('ar');
        jest.mocked(deviceLocaleCode).mockReturnValue('ar');
        setting.set('ar');
        setting.set.mockClear();
        await checkSystemLanguage();
        expect(useLocaleStore.getState().locale).toBe('ar');
        expect(setting.set).not.toHaveBeenCalled();
        expect(await AsyncStorage.getItem('gaia.deviceLocale')).toBe('en');
        expect(useSystemSwitch.getState().target).toBe('ar');
    });

    it('below 13 the phone-language sync still clears an older pick', async () => {
        useLocaleStore.setState({ locale: 'en' });
        await AsyncStorage.setItem('gaia.deviceLocale', 'en');
        jest.mocked(deviceLanguageCode).mockReturnValue('ar');
        jest.mocked(deviceLocaleCode).mockReturnValue('ar');
        await checkSystemLanguage();
        expect(useLocaleStore.getState().locale).toBeNull();
        expect(await AsyncStorage.getItem('gaia.deviceLocale')).toBe('ar');
    });
});

describeNative('direction flags at pick time', () => {
    it('Android forces the picked direction before the restart', () => {
        jest.replaceProperty(Platform, 'OS', 'android');
        perAppSetting();
        const allow = jest.spyOn(I18nManager, 'allowRTL');
        const force = jest.spyOn(I18nManager, 'forceRTL');
        pickLanguage('ar');
        expect(allow).toHaveBeenLastCalledWith(true);
        expect(force).toHaveBeenLastCalledWith(true);
        pickLanguage('en');
        expect(allow).toHaveBeenLastCalledWith(false);
        expect(force).toHaveBeenLastCalledWith(false);
    });

    it('iOS lays out by the per-app language it now holds, so the flags follow it rather than force', () => {
        jest.replaceProperty(Platform, 'OS', 'ios');
        const setting = perAppSetting();
        const allow = jest.spyOn(I18nManager, 'allowRTL');
        const force = jest.spyOn(I18nManager, 'forceRTL');
        pickLanguage('ar');
        expect(setting.set).toHaveBeenLastCalledWith('ar');
        expect(allow).toHaveBeenLastCalledWith(true);
        expect(force).toHaveBeenLastCalledWith(false);
    });

    it('iOS without the per-app module forces the pick as before', () => {
        jest.replaceProperty(Platform, 'OS', 'ios');
        const force = jest.spyOn(I18nManager, 'forceRTL');
        pickLanguage('ar');
        expect(force).toHaveBeenLastCalledWith(true);
    });
});
