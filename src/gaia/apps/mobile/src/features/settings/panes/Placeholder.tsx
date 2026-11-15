// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT } from '@/i18n/useT';
import { EmptyState } from '@/ui';

import { SETTINGS_SECTIONS } from '../sections';
import { SettingsAnchor, useSettingsSection } from '../targets';

/** Every section's pane until its set-* task replaces the registry entry. */
export default function Placeholder() {
    const t = useT();
    const section = useSettingsSection();
    return (
        <SettingsAnchor name="pane">
            <EmptyState title={t(SETTINGS_SECTIONS[section].titleKey)} message={t('mobileApp.settings.comingSoon')} />
        </SettingsAnchor>
    );
}
