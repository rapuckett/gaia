// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import type { ScrollView } from 'react-native';

import { GaiaClientProvider } from '@/data';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { seedDevicePrompt } from '@/features/devices/devicePrompts';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { LanguageSwitchHost, SeedLanguageSwitch } from '@/features/language/LanguageSwitchCover';
import { SeedSkillsAdd } from '@/features/skills';
import { SeedConfirmFullAccess } from '@/features/settings/panes/Permissions';
import { SeedAutomationRemove } from '@/features/settings/panes/Automations';
import { SeedOwnServer } from '@/features/settings/panes/advanced/LemonadeTarget';
import { SeedDiscord, SeedJustPaired } from '@/features/settings/panes/Messaging';
import { SeedAgentCompare } from '@/features/settings/panes/model/AgentChoice';
import { SeedCheckPending, SeedCustomReport } from '@/features/settings/panes/model/AddCustomModel';
import { SeedAddedModel, SeedModelSearch } from '@/features/settings/panes/model/ModelList';
import { SeedOpenDetails } from '@/features/settings/panes/model/ModelRow';
import { SeedProviderKey } from '@/features/settings/panes/model/ProviderKey';
import { SectionErrorBoundary } from '@/features/settings/SectionErrorBoundary';
import { BackToSection } from '@/features/settings/SettingsSectionScreen';
import { SETTINGS_SECTIONS } from '@/features/settings/sections';
import { SETTINGS_SCENES, settingsSceneClient, type SettingsScene } from '@/features/settings/devScenes';
import { SettingsTargets } from '@/features/settings/targets';
import { Screen, ScreenBannerProvider, Stack, Text, UIProvider, useAppearance } from '@/ui';
import { DEFAULT_CUSTOM } from '@webui/utils/palette.core';

function Thrower(): never {
    throw new Error('Forced settings crash (dev scene)');
}

function SettingsView({ found }: { found: SettingsScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => settingsSceneClient(found));
    useState(() => {
        if (found.prompt) seedDevicePrompt(found.prompt.kind, found.prompt.action, found.prompt.state, found.prompt.note);
    });
    // Palette only, so a scene that saved a custom one doesn't leak into the next; the color scheme stays as it was.
    const wanted = useMemo(() => found.appearance ?? { palette: 'default' as const, custom: DEFAULT_CUSTOM }, [found]);
    const seeded = useAppearance(
        (s) => s.palette === wanted.palette && s.custom.accent === wanted.custom.accent && s.custom.base === wanted.custom.base,
    );
    useLayoutEffect(() => {
        useAppearance.setState(wanted);
    }, [wanted]);
    const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
    const Pane = SETTINGS_SECTIONS[found.section].pane;
    if (!seeded) return null;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <Screen scroll scrollRef={scrollRef} header={found.from ? <BackToSection from={found.from} /> : undefined}>
                            <SettingsTargets section={found.section} target={found.target} scrollRef={scrollRef}>
                                <SeedProviderKey.Provider value={found.keyEntry ?? null}>
                                <SeedOwnServer.Provider value={found.ownServer ?? null}>
                                <SeedAddedModel.Provider value={found.addedModel ?? null}>
                                    <SeedModelSearch.Provider value={found.search ?? ''}>
                                        <SeedOpenDetails.Provider value={found.openDetails ?? null}>
                                            <SeedJustPaired.Provider value={!!found.justPaired}>
                                            <SeedDiscord.Provider value={found.discord ?? null}>
                                                <SeedCheckPending.Provider value={found.checkPending ?? null}>
                                                <SeedCustomReport.Provider value={found.customReport ?? null}>
                                                    <SeedAutomationRemove.Provider value={found.confirmRemove ?? null}>
                                                        <SeedConfirmFullAccess.Provider value={!!found.confirmFullAccess}>
                                                        <SeedSkillsAdd.Provider value={found.skillsAdd ?? false}>
                                                            <SeedAgentCompare.Provider value={!!found.agentCompareOpen}>
                                                            {found.crash ? (
                                                                <SectionErrorBoundary area={`settings.${found.section}`} onReload={() => void queryClient.resetQueries()}>
                                                                    <Thrower />
                                                                </SectionErrorBoundary>
                                                            ) : (
                                                                <Pane provider={found.provider ?? 'local'} />
                                                            )}
                                                            </SeedAgentCompare.Provider>
                                                        </SeedSkillsAdd.Provider>
                                                        </SeedConfirmFullAccess.Provider>
                                                    </SeedAutomationRemove.Provider>
                                                </SeedCustomReport.Provider>
                                                </SeedCheckPending.Provider>
                                            </SeedDiscord.Provider>
                                            </SeedJustPaired.Provider>
                                        </SeedOpenDetails.Provider>
                                    </SeedModelSearch.Provider>
                                </SeedAddedModel.Provider>
                                </SeedOwnServer.Provider>
                                </SeedProviderKey.Provider>
                            </SettingsTargets>
                        </Screen>
                        <SeedLanguageSwitch.Provider value={found.languageSwitch ? { target: found.languageSwitchTo ?? 'ar', platform: found.languageSwitch, system: found.languageSwitchSystem } : null}>
                            <LanguageSwitchHost />
                        </SeedLanguageSwitch.Provider>
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}

/** The real Setup and Model settings panes on a fake PC; `?state=<name>` (see SETTINGS_SCENES). */
export default function SettingsGalleryRoute() {
    const { state = 'gpu-adjustable' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const found = SETTINGS_SCENES[state];
    if (!found) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No settings scene "${state}"`}</Text>
                        {Object.keys(SETTINGS_SCENES).map((key) => <Text key={key}>{key}</Text>)}
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return <KeyedScene sceneKey={state} scene={SettingsView} props={{ found }} />;
}
