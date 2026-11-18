// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useEffect } from 'react';
import { BackHandler, Keyboard, Platform, StyleSheet, View } from 'react-native';

import { getLocale, ref, type MessageKey } from '@webui/i18n/registry';

import { DirectionOverride, translator } from '@/i18n/useT';
import { useLanguageSwitch } from '@/state/languageSwitch';
import { useSystemSwitch } from '@/state/systemLanguage';
import { Button, Screen, Stack, Text, useBackStep } from '@/ui';

export type CoverPlatform = 'android' | 'ios';

const LANGUAGE_NAME: Record<string, MessageKey> = {
    ar: 'mobileApp.settings.languageSwitch.language.ar',
    en: 'mobileApp.settings.languageSwitch.language.en',
};

/** Dev scenes only: shows the cover for this language on this platform, whatever the device is. */
export const SeedLanguageSwitch = createContext<{ target: string; platform: CoverPlatform; system?: boolean } | null>(null);

interface CoverProps {
    target: string;
    platform: CoverPlatform;
    /** Absent for a switch made in system Settings, which can't be undone from here. */
    onCancel?: () => void;
}

/** Full-screen: the layout flips only after a restart, so until then the half-mirrored app must not show. Worded in the language being switched to. */
export function LanguageSwitchCover({ target, platform, onCancel }: CoverProps) {
    // The pick has already changed the UI language, but the words are the target's whichever way it went.
    const t = translator(target);
    const name = LANGUAGE_NAME[target];
    if (!name) throw new Error(`No language name for "${target}"; add mobileApp.settings.languageSwitch.language.${target} to en.ts and ar.ts.`);
    const dir = getLocale(target).meta.dir;
    const android = platform === 'android';
    const language = ref(name);
    // A keyboard left up would sit over the cover and take Back first.
    useEffect(() => Keyboard.dismiss(), []);
    return (
        <View style={StyleSheet.absoluteFill} testID="language-switch-cover" accessibilityViewIsModal>
            <Screen
                width="flow"
                banner={null}
                footer={
                    <DirectionOverride.Provider value={dir}>
                    <Stack gap="sm">
                        {android ? (
                            <Button
                                full
                                variant="primary"
                                label={t('mobileApp.settings.languageSwitch.close')}
                                onPress={() => BackHandler.exitApp()}
                                testID="language-switch-close"
                            />
                        ) : null}
                        {onCancel ? (
                            <Button full label={t('mobileApp.settings.languageSwitch.cancel')} onPress={onCancel} testID="language-switch-cancel" />
                        ) : null}
                    </Stack>
                    </DirectionOverride.Provider>
                }
            >
                <DirectionOverride.Provider value={dir}>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Stack gap="md" paddingX="gutter" testID="language-switch-content">
                        <Text role="title" weight="semibold" align="center" accessibilityRole="header">
                            {t(android ? 'mobileApp.settings.languageSwitch.androidTitle' : 'mobileApp.settings.languageSwitch.iosTitle', { language })}
                        </Text>
                        <Text tone="secondary" align="center">
                            {t(android ? 'mobileApp.settings.languageSwitch.androidBody' : 'mobileApp.settings.languageSwitch.iosBody', { language })}
                        </Text>
                    </Stack>
                </View>
                </DirectionOverride.Provider>
            </Screen>
        </View>
    );
}

/** Android back on the cover is Cancel, or Close when there is no Cancel: the newest handler runs first, so it beats the screens beneath. */
function AndroidBack({ onCancel }: { onCancel?: () => void }) {
    useBackStep(() => {
        if (onCancel) onCancel();
        else BackHandler.exitApp();
        return true;
    });
    return null;
}

/** At the root, above navigation. Shows the cover for a pending direction-changing pick, or a dev scene's seed. */
export function LanguageSwitchHost() {
    const seed = useContext(SeedLanguageSwitch);
    const target = useLanguageSwitch((s) => s.target);
    const cancel = useLanguageSwitch((s) => s.cancel);
    const systemTarget = useSystemSwitch((s) => s.target);
    const shown = seed?.target ?? target ?? systemTarget;
    if (!shown) return null;
    const platform = seed?.platform ?? (Platform.OS === 'android' ? 'android' : 'ios');
    const systemChange = seed ? seed.system === true : target === null;
    const onCancel = systemChange ? undefined : cancel;
    return (
        <>
            {platform === 'android' && !seed ? <AndroidBack onCancel={onCancel} /> : null}
            <LanguageSwitchCover target={shown} platform={platform} onCancel={onCancel} />
        </>
    );
}
