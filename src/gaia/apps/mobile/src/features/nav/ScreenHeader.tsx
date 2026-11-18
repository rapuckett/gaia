// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import type { DrawerNavigationProp } from 'expo-router/drawer';
import { useNavigation } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { useT } from '@/i18n/useT';
import { IconButton, Row, Spacer, Stack, Text } from '@/ui';
import { useLargeText } from '@/ui/theme/a11y';
import { Menu } from '@/ui/icons';

import { useDrawerPresent } from './AppNavigator';
import { PERMANENT_DRAWER_MIN_WIDTH } from './navigation';

export function useIsPermanentDrawer(): boolean {
    return useWindowDimensions().width >= PERMANENT_DRAWER_MIN_WIDTH;
}

/**
 * The page header: the hamburger that opens the chat drawer (hidden while it is permanent), then the title.
 * `titleNode` replaces the title text; `end` holds actions at the reading end.
 * At large text sizes the title gets a line of its own under the buttons, up to two lines.
 */
export function ScreenHeader({ title, titleNode, end }: { title?: string; titleNode?: ReactNode; end?: ReactNode }) {
    const t = useT();
    const navigation = useNavigation<DrawerNavigationProp<Record<string, object | undefined>>>();
    const permanent = useIsPermanentDrawer();
    const drawerPresent = useDrawerPresent();
    const largeText = useLargeText();
    const menu = permanent || !drawerPresent ? null : <IconButton icon={Menu} variant="raised" label={t('sidebar.open')} onPress={() => navigation.openDrawer()} />;
    const titleText = title ? <Text role="title" weight="semibold" numberOfLines={1} largeLines={2}>{title}</Text> : null;
    if (largeText && (titleNode || titleText)) {
        return (
            <Stack paddingX="lg" paddingY="sm" gap="xs" accessibilityRole="header">
                {menu || end ? (
                    <Row gap="sm">
                        {menu}
                        <Spacer />
                        {end}
                    </Row>
                ) : null}
                {titleNode ?? titleText}
            </Stack>
        );
    }
    return (
        <Stack paddingX="lg" paddingY="sm">
            <Row gap="sm" accessibilityRole="header">
                {menu}
                {titleNode ? (
                    <Stack flex={1}>{titleNode}</Stack>
                ) : title ? (
                    <Stack flex={1}>{titleText}</Stack>
                ) : (
                    <Stack flex={end ? 1 : undefined} />
                )}
                {end}
            </Row>
        </Stack>
    );
}
