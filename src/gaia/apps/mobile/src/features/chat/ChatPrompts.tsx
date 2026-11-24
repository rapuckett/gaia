// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ConfirmationRequest, QuestionRequest } from '@/data';
import { ConfirmationCard, confirmationProps, QuestionCard, questionCardData } from '@/features/questions';
import { Stack } from '@/ui';

/**
 * Where a question (qst-cards) or an approval-needed card renders. The turn waits on a question, so
 * the live line says "Waiting for you" meanwhile. Permission prompts sit above the composer instead.
 */
export function ChatPrompts({
    sessionId,
    question,
    confirmation,
}: {
    sessionId: string;
    question: QuestionRequest | null;
    confirmation?: ConfirmationRequest | null;
}) {
    const data = question ? questionCardData(sessionId, question) : null;
    const card = confirmation ? confirmationProps(confirmation) : null;
    if (!data && !card) return null;
    return (
        <Stack paddingX="gutter" gap="md">
            {data ? <QuestionCard data={data} /> : null}
            {card ? <ConfirmationCard {...card} /> : null}
        </Stack>
    );
}
