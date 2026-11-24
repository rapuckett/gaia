// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo } from 'react';

import { withResearchCommand } from '@webui/utils/research';

import { useSkills } from '@/data/skills';
import { useT } from '@/i18n/useT';
import { NEW_CHAT_RESEARCH, useResearchStore } from '@/state/research';
import { Telescope } from '@/ui/icons';

import { ControlChip } from './ControlChip';

/** Research mode for a chat (null: the new-chat screen), the placeholder it asks for, and `wrap` for each outgoing message. */
export function useResearch(sessionId: string | null) {
    const t = useT();
    const on = useResearchStore((s) => !!s.research[sessionId ?? NEW_CHAT_RESEARCH]);
    // A `/<skill>` command runs its skill rather than being researched, so the skill names are read while research is on.
    const skills = useSkills({ enabled: on });
    const names = useMemo(() => new Set((skills.data?.skills ?? []).map((s) => s.name)), [skills.data]);
    const wrap = useCallback((text: string) => withResearchCommand(text, on, names), [on, names]);
    return { on, wrap, placeholder: on ? t('composer.researchPlaceholder') : undefined };
}

/** Composer toggle: while on, each message is sent as a `/research` turn. Icon only on a phone; the hint says what it does. */
export function ResearchChip({ sessionId, disabled }: { sessionId: string | null; disabled?: boolean }) {
    const t = useT();
    const on = useResearchStore((s) => !!s.research[sessionId ?? NEW_CHAT_RESEARCH]);
    const setResearch = useResearchStore((s) => s.setResearch);
    return (
        <ControlChip
            label={t.bare('composer.research')}
            icon={Telescope}
            chip="research"
            active={on}
            disabled={disabled}
            onPress={() => setResearch(sessionId, !on)}
            accessibilityLabel={t('composer.research')}
            accessibilityHint={on ? t('composer.researchOnTitle') : t('composer.researchOffTitle')}
            testID="research-chip"
        />
    );
}
