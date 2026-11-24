// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isFastAgent } from '@webui/utils/agentRecovery.core';

import { useSettings } from '@/data';
import { openSettings } from '@/features/settings/openSettings';
import { useT } from '@/i18n/useT';
import { Chip } from '@/ui';
import { Feather } from '@/ui/icons';

import { ControlChip } from './ControlChip';

/** Says so while the Fast and light agent answers; the default agent shows nothing. Tap to open its setting. `line` is the new chat's labelled form at the end of the folder line; the default is the open chat's icon-only-when-tight chip. */
export function AgentChip({ line = false }: { line?: boolean }) {
    const t = useT();
    const settings = useSettings();
    if (!isFastAgent(settings.data?.flagship_agent)) return null;
    if (line) {
        return (
            <Chip
                label={t.bare('composer.agentFast')}
                accessibilityLabel={t('composer.agentFast')}
                hint={t('composer.agentFastTitle')}
                icon={Feather}
                onPress={() => openSettings('model')}
                testID="agent-line"
            />
        );
    }
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
