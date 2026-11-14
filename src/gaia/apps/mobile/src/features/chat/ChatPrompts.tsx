// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { QuestionRequest } from '@/data';

/**
 * Where a question (qst-cards) renders. The turn waits on it, so the live line says
 * "Waiting for you" meanwhile. Permission prompts sit above the composer instead.
 */
export function ChatPrompts(_props: { question: QuestionRequest | null }) {
    return null;
}
