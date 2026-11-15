// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement, lazy, Suspense, useRef } from 'react';
import type { ComponentRef, ComponentType } from 'react';
import type { ScrollView } from 'react-native';

import { useT } from '@/i18n/useT';
import { Button, ErrorState, LoadingState, Screen, Stack } from '@/ui';
import { ArrowLeft } from '@/ui/icons';

import { isSectionId, SETTINGS_SECTIONS, type SectionId } from './sections';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import { SettingsHeader } from './SettingsHeader';
import { SettingsTargets } from './targets';

const lazyPanes = new Map<SectionId, ComponentType>();

function paneFor(id: SectionId): ComponentType {
    let pane = lazyPanes.get(id);
    if (!pane) {
        pane = lazy(SETTINGS_SECTIONS[id].load);
        lazyPanes.set(id, pane);
    }
    return pane;
}

// A static web export is not a dev bundle, so the crash demo is also switchable at build time.
const CRASH_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_SETTINGS_CRASH === '1';

function Crash(): never {
    throw new Error('Forced settings crash (?crash=1)');
}

export function SettingsSectionScreen() {
    const t = useT();
    const router = useRouter();
    const queryClient = useQueryClient();
    const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
    const params = useLocalSearchParams<{ section: string; target?: string; from?: string; crash?: string }>();

    const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
    if (!isSectionId(params.section)) {
        return (
            <Screen header={<SettingsHeader title={t('settings.title')} backLabel={t('setup.back')} onBack={goBack} />}>
                <ErrorState title={t('errorBoundary.title')} message={String(params.section)} />
            </Screen>
        );
    }

    const section = params.section;
    const pane = createElement(CRASH_ENABLED && params.crash === '1' ? Crash : paneFor(section));
    const from = isSectionId(params.from) && params.target ? params.from : null;

    return (
        <Screen
            scroll
            scrollRef={scrollRef}
            header={
                <>
                    <SettingsHeader title={t(SETTINGS_SECTIONS[section].titleKey)} backLabel={t('setup.back')} onBack={goBack} />
                    {from ? (
                        <Stack paddingX="lg" align="start">
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={ArrowLeft}
                                label={t.compose((say) => say('settings.backTo', { section: say(SETTINGS_SECTIONS[from].titleKey) }))}
                                onPress={() => router.replace({ pathname: '/settings/[section]', params: { section: from } })}
                            />
                        </Stack>
                    ) : null}
                </>
            }
        >
            <SettingsTargets key={`${section}:${params.target ?? ''}`} section={section} target={params.target} scrollRef={scrollRef}>
                <SectionErrorBoundary key={section} area={`settings.${section}`} onReload={() => void queryClient.resetQueries()}>
                    <Suspense fallback={<LoadingState title={t('settings.loading')} />}>
                        {pane}
                    </Suspense>
                </SectionErrorBoundary>
            </SettingsTargets>
        </Screen>
    );
}
