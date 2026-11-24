// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The session panel's reading of the chat; the rules live in sessionFocus.core so the phone shares them. */

import { useMemo } from 'react';
import { railState } from '../SideRail';
import { useChatStore } from '../../stores/chatStore';
import { useScheduleStore } from '../../stores/scheduleStore';
import { useSessionPanelStore } from '../../stores/sessionPanelStore';
import { useSessionEnvironment } from '../../hooks/useSessionEnvironment';
import type { Message } from '../../types';
import {
    commandsRun, finishedPlan, focusFacets, livePlan, sameFile, sitesContacted, turnHasDetails,
    type ChatDocument, type SessionFocus,
} from '../../utils/sessionFocus.core';

export * from '../../utils/sessionFocus.core';

export function useSessionFocus(sessionId: string, messages: Message[], busy: boolean): SessionFocus {
    const session = useChatStore((s) => s.sessions.find((x) => x.id === sessionId));
    const library = useChatStore((s) => s.documents);
    const steps = useChatStore((s) => s.agentSteps);
    const allSchedules = useScheduleStore((s) => s.schedules);
    const signals = useSessionPanelStore((s) => s.signals[sessionId]);
    const { env } = useSessionEnvironment(sessionId);

    return useMemo(() => {
        const documents: ChatDocument[] = (env?.folders ?? [])
            .filter((f) => f.kind === 'file' && f.source === 'document')
            .map((entry) => ({ entry, doc: library.find((d) => sameFile(d.filepath, entry.path)) ?? null }));
        const schedules = allSchedules.filter((s) => s.session_id === sessionId && s.status !== 'cancelled');
        // Busy also covers comparing two answers, when no turn is streaming: the last plan stays.
        const plan = (busy ? livePlan(steps) : null) ?? finishedPlan(messages);
        const commands = commandsRun(messages, busy ? steps : []);
        const answer = railState(messages, busy);
        // A turn that used nothing but the local model has nothing to report.
        const showAnswer = answer?.kind === 'turn' && !!answer.turn.turnSummary && turnHasDetails(answer.turn.turnSummary);
        const { facets, coding } = focusFacets({
            agentType: session?.agent_type,
            sessionKind: session?.kind,
            schedules,
            commands,
            documents: documents.length,
            plan,
            sites: sitesContacted(messages),
            showAnswer,
            changedFiles: signals?.changedFiles ?? 0,
            changedCode: signals?.changedCode ?? 0,
            skills: signals?.skills ?? [],
        });
        return { facets, documents, schedules, plan, commands, coding, showAnswer };
    }, [allSchedules, busy, env, library, messages, session?.agent_type, session?.kind, sessionId, signals, steps]);
}
