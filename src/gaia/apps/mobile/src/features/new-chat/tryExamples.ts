// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { MessageKey } from '@webui/i18n/registry';

import type { LucideIcon } from '@/ui/icons';
import { ChefHat, ListChecks, Receipt } from '@/ui/icons';

// One example per card the flagship can draw, in the web UI's order (TryChips.tsx).
export const TRY_EXAMPLES: readonly { icon: LucideIcon; label: MessageKey; prompt: MessageKey }[] = [
    { icon: ChefHat, label: 'cards.try.recipe', prompt: 'cards.try.recipePrompt' },
    { icon: ListChecks, label: 'cards.try.checklist', prompt: 'cards.try.checklistPrompt' },
    { icon: Receipt, label: 'cards.try.bill', prompt: 'cards.try.billPrompt' },
];

// An example goes after the typed text on a new line; trying another replaces the last one.
export function withExample(text: string, previous: string, prompt: string): string {
    const typed = (previous && text.endsWith(previous) ? text.slice(0, -previous.length) : text).trimEnd();
    return typed ? `${typed}\n\n${prompt}` : prompt;
}
