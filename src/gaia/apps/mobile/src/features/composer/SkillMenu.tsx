// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useWindowDimensions, View } from 'react-native';

import { firstSentence, isTypingSkillCommand, matchSkillCommands } from '@webui/utils/skillCommands.core';

import { useSkills } from '@/data/skills';
import { ltr, plainOr, serverText, useT } from '@/i18n/useT';
import { List, ListRow, Row, Spinner, Stack, Surface, Text } from '@/ui';

/** The menu's tallest size, and the share of the screen it may take, so it never covers the field. */
const MAX_HEIGHT = 240;
const SCREEN_SHARE = 0.4;

export function skillMenuHeight(windowHeight: number): number {
    return Math.floor(Math.min(MAX_HEIGHT, windowHeight * SCREEN_SHARE));
}

interface SkillMenuProps {
    /** What the composer holds now. */
    value: string;
    onPick(name: string): void;
}

/** Renders nothing unless the text is a "/" and part of a skill name, so no skills read happens before. */
export function SkillMenu({ value, onPick }: SkillMenuProps) {
    if (!isTypingSkillCommand(value)) return null;
    return <OpenSkillMenu value={value} onPick={onPick} />;
}

function OpenSkillMenu({ value, onPick }: SkillMenuProps) {
    const t = useT();
    const { height } = useWindowDimensions();
    const skills = useSkills({ fresh: true });
    const matches = matchSkillCommands(skills.data?.skills ?? [], value);
    const maxHeight = skillMenuHeight(height);

    if (!skills.data && (skills.isError || skills.isPending)) {
        const failed = skills.isError;
        const failureDetail = failed ? serverText(skills.error) : undefined;
        return (
            <Surface tone="card" border radius="lg" padding="md" testID="skill-menu">
                <Row gap="sm">
                    {failed ? null : <Spinner />}
                    <Text role="caption" tone={failed ? 'danger' : 'muted'} accessibilityRole={failed ? 'alert' : undefined}>
                        {failed ? plainOr(t, 'composer.skillsFailed', {}, skills.error) : t('composer.skillsLoading')}
                    </Text>
                </Row>
                {failed && failureDetail ? (
                    <Text role="caption" tone="muted" selectable>
                        {ltr(failureDetail)}
                    </Text>
                ) : null}
            </Surface>
        );
    }
    if (matches.length === 0) return null;
    return (
        <Surface tone="card" border radius="lg" testID="skill-menu">
            <View style={{ maxHeight }}>
                <Stack paddingX="md" paddingY="sm">
                    <Text role="caption" tone="muted" weight="semibold" accessibilityRole="header">
                        {t('composer.skillsTitle')}
                    </Text>
                </Stack>
                <List
                    data={matches}
                    keyExtractor={(skill) => skill.name}
                    renderItem={({ item }) => (
                        <ListRow
                            title={`/${item.name}`}
                            subtitle={firstSentence(item.description)}
                            subtitleLines={2}
                            onPress={() => onPick(item.name)}
                            testID={`skill-menu-${item.name}`}
                        />
                    )}
                />
            </View>
        </Surface>
    );
}
