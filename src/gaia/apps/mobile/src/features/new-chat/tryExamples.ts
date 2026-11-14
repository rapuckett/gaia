// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { MessageKey } from '@webui/i18n/registry';

// One example per card the flagship can draw, in the web UI's order (TryChips.tsx).
export const TRY_EXAMPLES: readonly { label: MessageKey; prompt: MessageKey }[] = [
    { label: 'cards.try.recipe', prompt: 'cards.try.recipePrompt' },
    { label: 'cards.try.workout', prompt: 'cards.try.workoutPrompt' },
    { label: 'cards.try.howTo', prompt: 'cards.try.howToPrompt' },
    { label: 'cards.try.checklist', prompt: 'cards.try.checklistPrompt' },
    { label: 'cards.try.trip', prompt: 'cards.try.tripPrompt' },
    { label: 'cards.try.bill', prompt: 'cards.try.billPrompt' },
    { label: 'cards.try.loan', prompt: 'cards.try.loanPrompt' },
];

// An example goes after the typed text on a new line; trying another replaces the last one.
export function withExample(text: string, previous: string, prompt: string): string {
    const typed = (previous && text.endsWith(previous) ? text.slice(0, -previous.length) : text).trimEnd();
    return typed ? `${typed}\n\n${prompt}` : prompt;
}
