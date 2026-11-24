// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { useT } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { EmptyState, Screen } from '@/ui';

export function HomeScreen() {
    const t = useT();
    const connection = useConnectionStore((s) => s.connection);
    if (connection === null) {
        return (
            <Screen width="flow">
                <EmptyState title={t('mobileApp.notConnected')} />
            </Screen>
        );
    }
    return <Screen header={<ScreenHeader />} />;
}
