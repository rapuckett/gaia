// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isFastAgent } from '@webui/utils/agentRecovery.core';

import { useSettings } from '@/data';
import { openSettings } from '@/features/settings/openSettings';
import { useT } from '@/i18n/useT';
import { Feather } from '@/ui/icons';

import { ControlChip } from './ControlChip';

/** Says so while the Fast and light agent answers; the default agent shows nothing. Tap to open its setting. */
export function AgentChip() {
    const t = useT();
    const settings = useSettings();
    if (!isFastAgent(settings.data?.flagship_agent)) return null;
    return (
        <ControlChip
            label={t.bare('composer.agentFast')}
            accessibilityLabel={t('composer.agentFast')}
            accessibilityHint={t('composer.agentFastTitle')}
            icon={Feather}
            chip="agent"
            onPress={() => openSettings('model')}
            testID="agent-chip"
        />
    );
}
