// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { cardText } from '@webui/components/startCardText';
import { pickStarters } from '@webui/components/tryChips.core';
import type { MessageKey } from '@webui/i18n/registry';
import type { StartCard } from '@webui/types';
import { ArrowUpRight, History } from 'lucide-react-native';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { Chip, Row } from '@/ui';
import type { LucideIcon } from '@/ui/icons';
import { ChefHat, Code, FileText, ListChecks, Mail, Receipt, ScrollText, Search } from '@/ui/icons';

const EXAMPLE_ICONS: Record<MessageKey, LucideIcon> = {
    'cards.try.recipe': ChefHat,
    'cards.try.checklist': ListChecks,
    'cards.try.bill': Receipt,
} as Record<MessageKey, LucideIcon>;

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
    /** The tasks haven't arrived: the row holds its space, unseen, so the screen doesn't jump. */
    pending?: boolean;
    /** Skills already offered elsewhere on the screen (the documents brief), left out of the row. */
    leave?: string[];
}

export function TryChips({ cards, onPick, pending = false, leave }: TryChipsProps) {
    const t = useT();
    const { tasks, examples } = pickStarters(cards, leave);
    return (
        <View
            accessibilityRole="toolbar"
            accessibilityLabel={t('newChat.cardsLabel')}
            accessibilityElementsHidden={pending}
            importantForAccessibility={pending ? 'no-hide-descendants' : 'auto'}
            pointerEvents={pending ? 'none' : 'auto'}
            style={pending ? { opacity: 0 } : undefined}
            testID={pending ? 'try-chips-pending' : 'try-chips'}
        >
            <Row gap="sm" wrap>
                {tasks.map((card) => {
                    const { title } = cardText(card, t);
                    return (
                        <Chip
                            key={card.skill}
                            icon={CARD_ICONS[card.skill] ?? ArrowUpRight}
                            label={title}
                            accessibilityLabel={`${title}: ${card.prompt}`}
                            onPress={() => onPick(card.prompt)}
                            testID={`try-task-${card.skill}`}
                        />
                    );
                })}
                {examples.map(({ label, prompt }) => (
                    // Plain text for the box: no English gloss in brackets.
                    <Chip key={label} icon={EXAMPLE_ICONS[label]} label={t(label)} onPress={() => onPick(t.bare(prompt))} />
                ))}
            </Row>
        </View>
    );
}
