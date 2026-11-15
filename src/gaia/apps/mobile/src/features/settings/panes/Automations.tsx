// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT } from '@/i18n/useT';
import { Notice, Stack, Text } from '@/ui';

import { SettingsAnchor } from '../targets';

// Every /api/automations route is PC-only, so the phone explains instead of listing.
export default function Automations() {
    const t = useT();
    return (
        <SettingsAnchor name="pane">
            <Stack gap="md" padding="lg">
                <Text role="ui" tone="secondary">{t('settings.automations.lede')}</Text>
                <Notice tone="info" message={t('mobileApp.settings.automations.body')} testID="automations-pc-only" />
            </Stack>
        </SettingsAnchor>
    );
}
