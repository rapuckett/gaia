// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { Button, Icon, IconButton, Row, Text, useTheme } from '@/ui';
import { TriangleAlert, X } from '@/ui/icons';
import { useLargeText } from '@/ui/theme/a11y';

import type { Banner } from './pickBanner';

/**
 * The one card for "the model server isn't answering" on the chat and home screens: the cause, one
 * Check again and, only while setup isn't done, Open setup inside the same card.
 */
export function ServerDownCard({
    banner,
    onDismiss,
    onCheckAgain,
    onOpenSetup,
}: {
    banner: Banner;
    onDismiss: () => void;
    onCheckAgain: () => void;
    onOpenSetup?: () => void;
}) {
    const t = useT();
    const { colors, radius, space } = useTheme();
    const largeText = useLargeText();
    const detail = banner.detail ?? banner.command;
    return (
        <View
            accessibilityRole="alert"
            style={{ backgroundColor: colors.accentYellowDim, borderColor: colors.accentYellow, borderWidth: 1, borderRadius: radius.md, padding: space.md }}
        >
            <Row gap="md" align="start">
                <Icon icon={TriangleAlert} size="md" tone="warning" />
                <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                    <Text role="ui" weight="semibold">{banner.title}</Text>
                    {banner.message ? <Text role="label" tone="secondary">{banner.message}</Text> : null}
                    {detail ? <Text role="caption" tone="muted" dir="ltr">{detail}</Text> : null}
                    <Row gap="sm" wrap>
                        <Button variant="secondary" label={t('settings.key.checkAgain')} onPress={onCheckAgain} full={largeText} shrink={false} testID="server-down-banner-check" />
                        {onOpenSetup ? <Button variant="ghost" label={t('setup.serverDown.setup')} onPress={onOpenSetup} full={largeText} shrink={false} testID="server-down-banner-setup" /> : null}
                    </Row>
                </View>
                <IconButton icon={X} size="sm" label={t('banner.dismiss')} onPress={onDismiss} />
            </Row>
        </View>
    );
}
