// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';
import { devGalleryEnabled } from '@/features/dev/devGallery';

import { CARD_SCENES, CardScenes, type CardScene } from '@/features/chat/messages/CardScenes';
import { COMPARE_STATES, CompareGallery, type CompareState } from '@/features/chat/compare/CompareGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { MessagesGallery, type MessagesGalleryState } from '@/features/chat/messages/MessagesGallery';
import { FIXTURES } from '@/features/chat/messages/__fixtures__/messages';
import { SessionPanelGallery, type SessionPanelGalleryState } from '@/features/chat/session-panel/SessionPanelGallery';
import { TURN_SCENES, TurnScenes, type TurnScene } from '@/features/chat/messages/TurnScenes';
import { LIVE_SCENES, LiveScenes, type LiveScene } from '@/features/chat/messages/LiveScenes';
import { UIProvider } from '@/ui';

const OPEN_STATES = ['actions', 'delete', 'edit', 'drop', 'guided', 'guided-sets', 'prescan-dismissing', 'prescan-done'];
const PANEL_STATES = ['loaded', 'runsOnCpp', 'empty', 'error', 'notRunning', 'ctxMeasuring', 'ctxNormal', 'ctxEstimated', 'ctxFilling', 'ctxChat', 'ctxNoTurn', 'envFolders', 'envRemove', 'envOffline', 'envFullWaiting', 'envFull', 'envEmpty', 'chgList', 'chgConfirm', 'chgConflict', 'chgGit', 'chgGitPr', 'chgPending', 'chgError', 'chgReview', 'ansFull', 'ansPending', 'ansNoLive', 'ansLocal', 'ansError', 'outItems', 'outEmpty', 'envPick', 'envPickRefused'];

function isState(state?: string): state is MessagesGalleryState {
    return !!state && (state in FIXTURES || OPEN_STATES.includes(state));
}

export default function MessagesGalleryRoute() {
    const { state } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    if ((COMPARE_STATES as readonly string[]).includes(state ?? '')) return <KeyedScene sceneKey={state as string} scene={CompareGallery} props={{ state: state as CompareState }} />;
    if ((CARD_SCENES as readonly string[]).includes(state ?? '')) return <KeyedScene sceneKey={state as string} scene={CardScenes} props={{ state: state as CardScene }} />;
    if ((TURN_SCENES as readonly string[]).includes(state ?? '')) return <KeyedScene sceneKey={state as string} scene={TurnScenes} props={{ state: state as TurnScene }} />;
    if ((LIVE_SCENES as readonly string[]).includes(state ?? '')) return <KeyedScene sceneKey={state as string} scene={LiveScenes} props={{ state: state as LiveScene }} />;
    const panel = state?.startsWith('panel-') ? state.slice('panel-'.length) : undefined;
    if (panel && PANEL_STATES.includes(panel)) {
        return (
            <UIProvider>
                <SessionPanelGallery key={panel} state={panel as SessionPanelGalleryState} />
            </UIProvider>
        );
    }
    const fixture = isState(state) ? state : 'long';
    return (
        <UIProvider>
            <MessagesGallery key={fixture} state={fixture} />
        </UIProvider>
    );
}
