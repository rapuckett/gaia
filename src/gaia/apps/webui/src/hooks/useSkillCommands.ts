// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/api';
import type { SkillInfo } from '../types';
import { rememberInstalledSkills } from '../utils/research';
import { isTypingSkillCommand, matchSkillCommands } from '../utils/skillCommands.core';

type Status = 'loading' | 'ready' | 'error';

export interface SkillCommands {
    /** Whether the list shows under the composer's text. */
    open: boolean;
    status: Status;
    error: string | null;
    /** Installed skills whose /name starts with what is typed. */
    matches: SkillInfo[];
    selected: number;
    select: (index: number) => void;
    /** Hide the list until the text changes. */
    dismiss: () => void;
}

/**
 * The skills a `/` command can run, for what the composer holds now.
 * Read fresh each time a `/` starts, so a skill added a moment ago is offered.
 */
export function useSkillCommands(value: string): SkillCommands {
    const typing = isTypingSkillCommand(value);
    const [skills, setSkills] = useState<SkillInfo[]>([]);
    const [status, setStatus] = useState<Status>('loading');
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState(0);
    const [dismissedAt, setDismissedAt] = useState<string | null>(null);

    useEffect(() => {
        if (!typing) return;
        let live = true;
        setStatus((s) => (s === 'ready' ? s : 'loading'));
        api.listSkills().then(
            (r) => {
                rememberInstalledSkills(r.skills.map((s) => s.name));
                if (!live) return;
                setSkills(r.skills);
                setStatus('ready');
                setError(null);
            },
            (e: unknown) => {
                if (!live) return;
                setStatus('error');
                setError(e instanceof Error ? e.message : String(e));
            },
        );
        return () => { live = false; };
    }, [typing]);

    useEffect(() => { setSelected(0); }, [value]);

    const matches = matchSkillCommands(skills, value);
    const open = typing && dismissedAt !== value && (status !== 'ready' || matches.length > 0);
    const select = useCallback((index: number) => setSelected(index), []);
    const dismiss = useCallback(() => setDismissedAt(value), [value]);

    return { open, status, error, matches, selected: Math.min(selected, Math.max(matches.length - 1, 0)), select, dismiss };
}
