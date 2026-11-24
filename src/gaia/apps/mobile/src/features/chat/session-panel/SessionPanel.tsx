// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { useChatStream, useMessages } from '@/data';
import { useT } from '@/i18n/useT';
import { usePermissionPrompt } from '../permission/usePermissionPrompt';
import { Sheet, Stack, Text } from '@/ui';

import { AgentInfoSection } from './AgentInfoSection';
import { AnswerSection } from './AnswerSection';
import { ChangesSection } from './ChangesSection';
import { ContextSection } from './ContextSection';
import { EnvironmentSection } from './EnvironmentSection';
import { CommandsSection, DocumentsSection, FocusBar, PlanSection, ScheduleSection } from './FocusSections';
import { OutputsSection } from './OutputsSection';
import { DETAILS_HEADING } from './sections';
import { SessionInfoSection } from './SessionInfoSection';
import { SkillsSection } from './SkillsSection';
import { useSessionFocus } from './useSessionFocus';

export interface SessionPanelProps {
    sessionId: string;
    open: boolean;
    onClose: () => void;
    /** The sheet draws in the app's sheet host, outside the caller's providers; the dev gallery re-wraps the body here. */
    wrap?: (body: ReactNode) => ReactNode;
}

/** The chat's side panel as a sheet over the chat: what this chat has used and what its agent can do. */
export function SessionPanel({ sessionId, open, onClose, wrap }: SessionPanelProps) {
    const t = useT();
    return (
        <Sheet open={open} onClose={onClose} title={t('sp.title')}>
            {wrap ? wrap(<PanelBody sessionId={sessionId} close={onClose} />) : <PanelBody sessionId={sessionId} close={onClose} />}
        </Sheet>
    );
}

export function PanelBody({ sessionId, close }: { sessionId: string; close: () => void }) {
    const t = useT();
    const { height } = useWindowDimensions();
    const live = useChatStream(sessionId).status !== 'idle';
    const promptWaiting = usePermissionPrompt(sessionId) !== null;
    const messages = useMessages(sessionId).data?.messages;
    const focus = useSessionFocus(sessionId, live);
    const props = { sessionId, live, promptWaiting, close };
    // Coding leads with what changed; other chats with what they read and made. One key, so moving keeps its state.
    const changes = <ChangesSection key="changes" {...props} />;
    return (
        <Stack gap="md" paddingY="sm" minHeight={height * 0.6}>
            <FocusBar facets={focus.facets} />
            <EnvironmentSection {...props} />
            <PlanSection plan={focus.plan} />
            <ScheduleSection schedules={focus.schedules} close={close} />
            {focus.coding ? changes : null}
            <CommandsSection commands={focus.commands} close={close} />
            <DocumentsSection documents={focus.documents} messages={messages ?? []} />
            {focus.showAnswer ? <AnswerSection {...props} /> : null}
            <OutputsSection {...props} />
            {focus.coding ? null : changes}
            <SkillsSection {...props} />
            <Text role="caption" weight="semibold" tone="muted" accessibilityRole="header">
                {t(DETAILS_HEADING)}
            </Text>
            <ContextSection {...props} />
            <AgentInfoSection {...props} />
            <SessionInfoSection sessionId={sessionId} />
        </Stack>
    );
}
