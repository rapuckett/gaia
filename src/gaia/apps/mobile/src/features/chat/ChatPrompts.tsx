// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { PermissionRequest, QuestionRequest } from '@/data';

/**
 * Where a permission prompt (prm-prompt) and a question (qst-cards) render. The
 * turn waits on them, so the live line says "Waiting for you" meanwhile.
 */
export function ChatPrompts(_props: { permission: PermissionRequest | null; question: QuestionRequest | null }) {
    return null;
}
