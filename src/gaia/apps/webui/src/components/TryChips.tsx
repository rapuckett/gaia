// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ArrowUpRight, ChefHat, Code, FileText, History, ListChecks, Mail, Receipt, ScrollText, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './StartCards.css';
import { cardText } from './startCardText';
import { useT } from '../i18n/useT';
import type { MessageKey } from '../i18n/registry';
import type { StartCard } from '../types';
import { TRY_EXAMPLE_KEYS, pickStarters } from './tryChips.core';

export { CARDS_SHOWN, STARTERS_SHOWN } from './tryChips.core';

interface TryExample {
    icon: LucideIcon;
    label: MessageKey;
    prompt: MessageKey;
}

const EXAMPLE_ICONS: readonly LucideIcon[] = [ChefHat, ListChecks, Receipt];

export const TRY_EXAMPLES: readonly TryExample[] = TRY_EXAMPLE_KEYS.map((keys, i) => ({ icon: EXAMPLE_ICONS[i], ...keys }));

const CARD_ICONS: Record<string, LucideIcon> = {
    'document-brief': FileText,
    'inbox-triage': Mail,
    'research-report': Search,
    coding: Code,
    summarize: ScrollText,
    'check-in': History,
};

interface TryChipsProps {
    /** Tasks for what this PC is set up to do (`/api/onboarding/start`). */
    cards?: StartCard[];
    /** Every pick fills the box to edit or send; none sends by itself. */
    onPick: (prompt: string) => void;
    disabled?: boolean;
    /** The tasks haven't arrived yet: hold the row's space, unseen, so the screen doesn't jump when they do. */
    pending?: boolean;
}

/** Up to three starters for an empty chat. */
export function TryChips({ cards = [], onPick, disabled, pending = false }: TryChipsProps) {
    const t = useT();
    const { tasks, examples: shown } = pickStarters(cards);
    const examples = shown.map((keys) => TRY_EXAMPLES.find((e) => e.label === keys.label)!);
    return (
        <div
            className={`try-chips${pending ? ' is-pending' : ''}`}
            role="group"
            aria-label={t('newChat.cardsLabel')}
            aria-hidden={pending || undefined}
            inert={pending || undefined}
        >
            {tasks.map((card) => {
                const Icon = CARD_ICONS[card.skill] ?? ArrowUpRight;
                const { title, note } = cardText(card, t);
                const prompt = card.needs_input ? `${card.prompt.trimEnd()}…` : card.prompt;
                return (
                    <button
                        key={card.skill}
                        type="button"
                        className="try-chip"
                        title={`${note}\n${prompt}`}
                        aria-label={`${title}: ${prompt}`}
                        onClick={() => onPick(card.prompt)}
                        disabled={disabled}
                    >
                        <Icon size={14} aria-hidden="true" />
                        {title}
                    </button>
                );
            })}
            {examples.map(({ icon: Icon, label: labelKey, prompt: promptKey }) => {
                const label = t(labelKey);
                // Plain text for the composer: no English gloss in brackets.
                const prompt = t.bare(promptKey);
                return (
                    <button
                        key={labelKey}
                        type="button"
                        className="try-chip"
                        title={prompt}
                        aria-label={`${label}: ${prompt}`}
                        onClick={() => onPick(prompt)}
                        disabled={disabled}
                    >
                        <Icon size={14} aria-hidden="true" />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
