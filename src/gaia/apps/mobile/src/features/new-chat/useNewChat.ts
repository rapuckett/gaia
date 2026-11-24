// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { AgentProblem, StartScreen } from '@webui/types';

import { useStartScreen } from '@/data';
import { folderRefusalNotice } from '@/features/files/folderRefusal';
import { describeDetail, describeHttpFailure, useT } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';
import type { Translate } from '@/i18n/useT';

import { createFirstSend, type FirstSendDeps } from './firstSend';

// How often the start screen is asked for again while the assistant is unavailable.
export const START_RETRY_MS = 15_000;

export type NewChatDeps = Pick<FirstSendDeps, 'createSession' | 'deliver' | 'flush' | 'queueHeld' | 'takeHeld'>;

export function useFirstSend(deps: NewChatDeps, initialText: string) {
    const t = useT();
    const flowDeps = (): FirstSendDeps => ({
        ...deps,
        describeError: (err) => (folderRefusalNotice(err, t) ?? describeHttpFailure(err, t)).text,
        describeDetail: (err) => (folderRefusalNotice(err, t) ?? describeHttpFailure(err, t)).detail,
        firstNotSent: t('newChat.firstNotSent'),
    });
    // The controller owns the box text, so it must outlive re-renders.
    const [send] = useState(() => createFirstSend(flowDeps(), initialText));
    useEffect(() => {
        send.setDeps(flowDeps());
    });
    const state = useSyncExternalStore(send.subscribe, send.getState);
    const waiting = state.waiting;
    const turn = useChatStreamStore((s) => (waiting ? s.turns[waiting] : undefined));
    useEffect(() => {
        if (waiting) send.observe(turn);
    }, [waiting, turn, send]);
    return { state, setText: send.setText, submit: send.submit };
}

// Why the assistant is unavailable, or null: a failed read, else the reason the agent reported.
// The chosen agent failing to start has its own card, which a failed re-read leaves up, so it is not said here too.
export function assistantProblem(error: unknown, data: StartScreen | undefined, t: Translate): string | null {
    if (data?.agent_problem) return null;
    if (error) return describeDetail(error, t);
    return data?.skills_error ?? null;
}

// The agent the person chose is why GAIA didn't start, as last answered, or null.
export function agentProblem(data: StartScreen | undefined): AgentProblem | null {
    return data?.agent_problem ?? null;
}

// While a reason is on screen, asks again every 15 s, only while the app is in the foreground.
export function useAssistantNotice() {
    const t = useT();
    const query = useStartScreen();
    const problem = assistantProblem(query.error, query.data, t);
    const agent = agentProblem(query.data);
    const showing = problem !== null || agent !== null;
    const { refetch } = query;
    useEffect(() => {
        if (!showing) return undefined;
        const timer = setInterval(() => {
            if (AppState.currentState === 'active') void refetch();
        }, START_RETRY_MS);
        return () => clearInterval(timer);
    }, [showing, refetch]);
    return { problem, agentProblem: agent, answeredAt: query.dataUpdatedAt, retry: () => void refetch() };
}
