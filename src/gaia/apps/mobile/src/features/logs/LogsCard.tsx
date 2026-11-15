// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useRouter } from 'expo-router';

import { useT } from '@/i18n/useT';
import { Button, Card, Stack, Text } from '@/ui';
import { ScrollText } from '@/ui/icons';

/** Settings > Advanced > Logs: the web's card, opening the phone's read-only logs screen. */
export function LogsCard() {
    const t = useT();
    const router = useRouter();
    return (
        <Card padding="lg">
            <Stack gap="sm">
                <Text role="ui" weight="semibold">{t('logs.title')}</Text>
                <Text role="caption" tone="muted">{t('logs.settingsHint')}</Text>
                <Button label={t('logs.view')} icon={ScrollText} onPress={() => router.push('/logs')} testID="advanced-view-logs" />
            </Stack>
        </Card>
    );
}
