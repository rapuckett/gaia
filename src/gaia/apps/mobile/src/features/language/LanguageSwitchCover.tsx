// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';

import { ref, type MessageKey } from '@webui/i18n/registry';

import { translator } from '@/i18n/useT';
import { useLanguageSwitch } from '@/state/languageSwitch';
import { Button, Screen, Stack, Text, useBackStep } from '@/ui';

export type CoverPlatform = 'android' | 'ios';

const LANGUAGE_NAME: Record<string, MessageKey> = {
    ar: 'mobileApp.settings.languageSwitch.language.ar',
    en: 'mobileApp.settings.languageSwitch.language.en',
};

/** Dev scenes only: shows the cover for this language on this platform, whatever the device is. */
export const SeedLanguageSwitch = createContext<{ target: string; platform: CoverPlatform } | null>(null);

interface CoverProps {
    target: string;
    platform: CoverPlatform;
    onCancel: () => void;
}

/** Full-screen: the layout flips only after a restart, so until then the half-mirrored app must not show. Worded in the language being switched to. */
export function LanguageSwitchCover({ target, platform, onCancel }: CoverProps) {
    // The pick has already changed the UI language, but the words are the target's whichever way it went.
    const t = translator(target);
    const name = LANGUAGE_NAME[target];
    if (!name) throw new Error(`No language name for "${target}"; add mobileApp.settings.languageSwitch.language.${target} to en.ts and ar.ts.`);
    const android = platform === 'android';
    const language = ref(name);
    return (
        <View style={StyleSheet.absoluteFill} testID="language-switch-cover" accessibilityViewIsModal>
            <Screen
                banner={null}
                footer={
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
                        <Button full label={t('mobileApp.settings.languageSwitch.cancel')} onPress={onCancel} testID="language-switch-cancel" />
                    </Stack>
                }
            >
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Stack gap="md">
                        <Text role="title" weight="semibold" align="center" accessibilityRole="header">
                            {t(android ? 'mobileApp.settings.languageSwitch.androidTitle' : 'mobileApp.settings.languageSwitch.iosTitle', { language })}
                        </Text>
                        <Text tone="secondary" align="center">
                            {t(android ? 'mobileApp.settings.languageSwitch.androidBody' : 'mobileApp.settings.languageSwitch.iosBody', { language })}
                        </Text>
                    </Stack>
                </View>
            </Screen>
        </View>
    );
}

/** Android back on the cover is Cancel: the newest handler runs first, so it beats the screens beneath. */
function AndroidBack({ onCancel }: { onCancel: () => void }) {
    useBackStep(() => {
        onCancel();
        return true;
    });
    return null;
}

/** At the root, above navigation. Shows the cover for a pending direction-changing pick, or a dev scene's seed. */
export function LanguageSwitchHost() {
    const seed = useContext(SeedLanguageSwitch);
    const target = useLanguageSwitch((s) => s.target);
    const cancel = useLanguageSwitch((s) => s.cancel);
    const shown = seed?.target ?? target;
    if (!shown) return null;
    const platform = seed?.platform ?? (Platform.OS === 'android' ? 'android' : 'ios');
    return (
        <>
            {platform === 'android' && !seed ? <AndroidBack onCancel={cancel} /> : null}
            <LanguageSwitchCover target={shown} platform={platform} onCancel={cancel} />
        </>
    );
}
