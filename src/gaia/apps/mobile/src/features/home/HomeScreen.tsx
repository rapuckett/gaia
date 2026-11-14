// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { useT } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { Screen, Text } from '@/ui';

export function HomeScreen() {
    const t = useT();
    const connection = useConnectionStore((s) => s.connection);
    return (
        <Screen header={<ScreenHeader />}>
            {connection === null ? <Text>{t('mobileApp.notConnected')}</Text> : null}
        </Screen>
    );
}
