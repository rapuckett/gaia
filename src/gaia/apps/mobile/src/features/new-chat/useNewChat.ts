// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { StartScreen } from '@webui/types';

import { describeError, useT } from '@/i18n/useT';

import { createFirstSend, type FirstSendDeps } from './firstSend';
import { createStartScreenLoader, START_RETRY_MS } from './startScreen';

export type NewChatDeps = Pick<FirstSendDeps, 'createSession' | 'deliver' | 'queueHeld'>;

export function useFirstSend(deps: NewChatDeps, initialText: string) {
    const t = useT();
    const flowDeps = (): FirstSendDeps => ({
        ...deps,
        describeError: (err) => describeError(err, t),
        firstNotSent: t('newChat.firstNotSent'),
    });
    // The controller owns the box text, so it must outlive re-renders.
    const [send] = useState(() => createFirstSend(flowDeps(), initialText));
    useEffect(() => {
        send.setDeps(flowDeps());
    });
    const state = useSyncExternalStore(send.subscribe, send.getState);
    return { state, setText: send.setText, submit: send.submit };
}

// Loads the start screen; while it reports a reason, asks again every 15 s, only while the app is in the foreground.
export function useStartScreen(fetchStart: () => Promise<StartScreen>) {
    const t = useT();
    const loader = useMemo(
        () => createStartScreenLoader(fetchStart, (err) => describeError(err, t)),
        // One loader per mount; the fetcher is stable for the connection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );
    const state = useSyncExternalStore(loader.subscribe, loader.getState);
    useEffect(() => {
        void loader.load();
        return loader.dispose;
    }, [loader]);
    const failing = state.error !== null;
    useEffect(() => {
        if (!failing) return;
        const tick = () => {
            if (AppState.currentState === 'active') void loader.load(true);
        };
        const timer = setInterval(tick, START_RETRY_MS);
        return () => clearInterval(timer);
    }, [failing, loader]);
    return { error: state.error, retry: () => loader.load() };
}
