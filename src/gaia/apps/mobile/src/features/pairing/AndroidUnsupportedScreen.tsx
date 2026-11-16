// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT } from '@/i18n/useT';
import { Icon, Screen, Stack, Text } from '@/ui';
import { Smartphone } from '@/ui/icons';

/** Shown in place of pairing on Android, which has no pinned transport to a PC yet. */
export function AndroidUnsupportedScreen() {
    const t = useT();
    return (
        <Screen banner={null} scroll>
            <Stack flex={1} gap="lg" paddingX="gutter" justify="center" maxWidth={560} self="center">
                <Stack align="center">
                    <Icon icon={Smartphone} size="lg" tone="accent" />
                </Stack>
                <Text role="title" weight="semibold" align="center">
                    {t('mobileApp.android.title')}
                </Text>
                <Text role="body" tone="secondary" align="center">
                    {t('mobileApp.android.body')}
                </Text>
            </Stack>
        </Screen>
    );
}
