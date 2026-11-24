// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useStartScreen } from '@/data';
import { AgentRecovery } from '@/features/new-chat/AgentRecovery';

/** Under a failed reply: when the chosen agent can't start, the same two fixes a new chat offers. Nothing when the agent is not the reason. */
export function ChatAgentRecovery({ onTryAgain }: { onTryAgain: () => void }) {
    const { data, dataUpdatedAt, refetch } = useStartScreen();
    const problem = data?.agent_problem ?? null;
    if (!problem) return null;
    return (
        <AgentRecovery
            problem={problem}
            answeredAt={dataUpdatedAt}
            onRetry={() => {
                void refetch();
                onTryAgain();
            }}
        />
    );
}
