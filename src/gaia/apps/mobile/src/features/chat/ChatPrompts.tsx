// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { QuestionRequest } from '@/data';
import { QuestionCard, questionCardData } from '@/features/questions';

/**
 * Where a question (qst-cards) renders. The turn waits on it, so the live line says
 * "Waiting for you" meanwhile. Permission prompts sit above the composer instead.
 */
export function ChatPrompts({ sessionId, question }: { sessionId: string; question: QuestionRequest | null }) {
    const data = question ? questionCardData(sessionId, question) : null;
    return data ? <QuestionCard data={data} /> : null;
}
