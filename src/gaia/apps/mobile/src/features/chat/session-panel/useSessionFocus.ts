// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import {
    commandsRun,
    finishedPlan,
    focusFacets,
    isCodeFile,
    livePlan,
    sameFile,
    sitesContacted,
    turnHasDetails,
    type ChatDocument,
    type SessionFocus,
} from '@webui/utils/sessionFocus.core';

import { useCapabilities, useChatStream, useDocuments, useMessages, useSchedules, useSession, useSessionChanges, useSessionEnvironment } from '@/data';
import { useT } from '@/i18n/useT';

import { stepsFromEvents } from '../activity/stepsFromEvents';
import { answerState, turnSummaryOf } from './turnSummary';

/** What the chat is doing, read from its saved messages, schedules, documents and file changes the way the Agent UI reads it. */
export function useSessionFocus(sessionId: string, live: boolean): SessionFocus {
    const t = useT();
    const session = useSession(sessionId).data;
    const saved = useMessages(sessionId).data?.messages;
    const env = useSessionEnvironment(sessionId, { enabled: true, live }).data;
    const library = useDocuments().data?.documents;
    const allSchedules = useSchedules().data?.schedules;
    const changes = useSessionChanges(sessionId, live).data;
    const skillNames = useCapabilities(sessionId, { enabled: true, live }).data?.skills;
    const events = useChatStream(sessionId).events;

    return useMemo(() => {
        // A saved reply carries its summary snake_case; the web's readers look for `turnSummary`.
        const messages = (saved ?? []).map((m) => ({ ...m, turnSummary: turnSummaryOf(m) }));
        const documents: ChatDocument[] = (env?.folders ?? [])
            .filter((f) => f.kind === 'file' && f.source === 'document')
            .map((entry) => ({ entry, doc: (library?.find((d) => sameFile(d.filepath, entry.path)) ?? null) as ChatDocument['doc'] }));
        const schedules = (allSchedules ?? []).filter((s) => s.session_id === sessionId && s.status !== 'cancelled');
        const steps = live ? stepsFromEvents(events, t) : [];
        const plan = (live ? livePlan(steps) : null) ?? finishedPlan(messages);
        const commands = commandsRun(messages, steps);
        const answer = answerState(messages, live);
        const showAnswer = answer?.kind === 'turn' && !!answer.summary && turnHasDetails(answer.summary);
        const files = changes?.files ?? [];
        const { facets, coding } = focusFacets({
            agentType: session?.agent_type,
            sessionKind: session?.kind,
            schedules,
            commands,
            documents: documents.length,
            plan,
            sites: sitesContacted(messages),
            showAnswer,
            changedFiles: files.length,
            changedCode: files.filter((f) => isCodeFile(f.path)).length,
            skills: (skillNames ?? []).map((s) => s.name),
        });
        return { facets, documents, schedules, plan, commands, coding, showAnswer };
    }, [allSchedules, changes, env, events, library, live, saved, session?.agent_type, session?.kind, sessionId, skillNames, t]);
}
