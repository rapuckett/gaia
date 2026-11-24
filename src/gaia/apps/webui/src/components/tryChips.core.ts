// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { MessageKey } from '../i18n/registry';
import type { StartCard } from '../types';

/** Starters in one row: the backend's tasks first, then examples to fill it. */
export const STARTERS_SHOWN = 3;
/** Backend tasks shown, so at least one starter still ends in a card. */
export const CARDS_SHOWN = 2;

export interface TryExampleKeys {
    label: MessageKey;
    prompt: MessageKey;
}

/** Examples that each end in a different kind of card, none needing the web; the first is shown most. */
export const TRY_EXAMPLE_KEYS: readonly TryExampleKeys[] = [
    { label: 'cards.try.recipe', prompt: 'cards.try.recipePrompt' },
    { label: 'cards.try.checklist', prompt: 'cards.try.checklistPrompt' },
    { label: 'cards.try.bill', prompt: 'cards.try.billPrompt' },
];

/** The row: up to two of this PC's tasks, then examples to make three. `leave` names tasks already offered elsewhere on the screen. */
export function pickStarters(cards: readonly StartCard[] = [], leave: readonly string[] = []): { tasks: StartCard[]; examples: TryExampleKeys[] } {
    const tasks = cards.filter((c) => !leave.includes(c.skill)).slice(0, CARDS_SHOWN);
    return { tasks, examples: TRY_EXAMPLE_KEYS.slice(0, STARTERS_SHOWN - tasks.length) as TryExampleKeys[] };
}

/** A pick goes after the typed text on a new line; trying another replaces the last one. */
export function withStarter(text: string, previous: string, prompt: string): string {
    const typed = (previous && text.endsWith(previous) ? text.slice(0, -previous.length) : text).trimEnd();
    return typed ? `${typed}\n\n${prompt}` : prompt;
}
