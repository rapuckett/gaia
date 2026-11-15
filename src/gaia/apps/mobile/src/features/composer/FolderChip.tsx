// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { StartScreen } from '@webui/types';

import { useT } from '@/i18n/useT';
import { Icon, Row, Text } from '@/ui';
import { Folder } from '@/ui/icons';

/** Where the new chat's agent works. Choosing another folder is done on the PC. */
export function FolderChip({ folder }: { folder: StartScreen['working_folder'] | undefined }) {
    const t = useT();
    if (!folder) return null;
    // GAIA's own folder is not named: a person never chose it.
    const named = !folder.gaia_folder;
    if (!named && folder.choosable) return null;
    const where = folder.gaia_folder ? t('folderChip.worksInOwn', { path: folder.path }) : t('folderChip.worksIn', { path: folder.path });
    return (
        <Row gap="xs" testID="folder-chip">
            <Icon icon={Folder} size="sm" tone="secondary" label={where} />
            <Text role="label" tone="secondary" numberOfLines={1} dir="auto">
                {named ? folder.name : t('folderChip.gaiaFolder')}
            </Text>
        </Row>
    );
}
