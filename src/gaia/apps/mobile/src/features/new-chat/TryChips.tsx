// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { Chip, Row } from '@/ui';

import { TRY_EXAMPLES } from './tryExamples';

// Everyday asks that come back as cards; a pick fills the box to edit or send.
export function TryChips({ onPick }: { onPick: (prompt: string) => void }) {
    const t = useT();
    return (
        <View accessibilityRole="toolbar" accessibilityLabel={t('newChat.cardsLabel')}>
            <Row gap="sm" wrap>
                {TRY_EXAMPLES.map(({ icon, label, prompt }) => (
                    // Plain text for the box: no English gloss in brackets.
                    <Chip key={label} icon={icon} label={t(label)} onPress={() => onPick(t.bare(prompt))} />
                ))}
            </Row>
        </View>
    );
}
