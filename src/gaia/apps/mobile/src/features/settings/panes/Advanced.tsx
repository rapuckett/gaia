// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { LogsCard } from '@/features/logs';
import { Stack } from '@/ui';

import { SettingsAnchor } from '../targets';

/** Settings > Advanced. Only Logs is here so far; the rest of the web's cards arrive with their own tasks. */
export default function Advanced() {
    return (
        <SettingsAnchor name="pane">
            <Stack gap="lg" paddingX="lg" paddingY="md">
                <SettingsAnchor name="logs">
                    <LogsCard />
                </SettingsAnchor>
            </Stack>
        </SettingsAnchor>
    );
}
