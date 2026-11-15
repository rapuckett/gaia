// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { SetupPlan, SetupRunStatus, SetupTest, StartCard } from '@webui/types';

export interface ReadyView {
    /** The model GAIA answers with, as the run set it up; null when the run named none. */
    answering: string | null;
    cloud: boolean;
    /** Jobs whose test failed on an extra that doesn't stop GAIA being ready. */
    failedJobs: SetupTest['job'][];
    /** Models the run left on the server's list, not downloaded. */
    notDownloaded: string[];
}

export function readyView(run: SetupRunStatus | null, plan: SetupPlan | undefined): ReadyView {
    const names = new Map((plan?.catalog ?? []).map((e) => [e.id, e.name]));
    return {
        answering: run?.chat_model ?? (plan && !plan.decided_after_server ? plan.chat_model.id : null),
        cloud: !!run?.skip_chat_model,
        failedJobs: (run?.tests ?? []).filter((r) => r.state === 'failed').map((r) => r.job),
        notDownloaded: (run?.models ?? []).filter((m) => m.state === 'skipped').map((m) => names.get(m.id) ?? m.id),
    };
}

/** A first run has no earlier chat to pick up, so "Check in" waits for one. */
export function starterCards(cards: StartCard[] | undefined): StartCard[] {
    return (cards ?? []).filter((c) => c.skill !== 'check-in');
}
