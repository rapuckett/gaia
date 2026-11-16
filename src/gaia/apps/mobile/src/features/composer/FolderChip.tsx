// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';

import type { StartScreen } from '@webui/types';

import { useSessionEnvironment } from '@/data';
import { useT } from '@/i18n/useT';
import { PcOnlyAction } from '@/features/logs/PcOnlyAction';
import { Icon, Row, Stack, Text } from '@/ui';
import { Folder, FolderPlus } from '@/ui/icons';

import { ChipMeasure, useChipCollapsed } from './ChipFitContext';
import { ControlChip } from './ControlChip';

/** Where the new chat's agent works. A phone can't give a chat a folder (the PC refuses it), so "Add a folder" says to do it on the PC. */
export function FolderChip({ folder }: { folder: StartScreen['working_folder'] | undefined }) {
    const t = useT();
    const iconOnly = useChipCollapsed('folder');
    if (!folder) return null;
    // GAIA's own folder is not named: a person never chose it.
    const named = !folder.gaia_folder;
    const addOnPc = folder.choosable ? (
        <PcOnlyAction label={t('folderChip.add')} icon={FolderPlus} note={t('folderChip.addHint')} detail={t('mobileApp.settings.pcOnly')} testID="folder-add" />
    ) : null;
    if (!named && addOnPc) return addOnPc;
    const where = folder.gaia_folder ? t('folderChip.worksInOwn', { path: folder.path }) : t('folderChip.worksIn', { path: folder.path });
    const name = named ? folder.name : t('folderChip.gaiaFolder');
    const content = (compact: boolean) => (
        <Row gap="xs">
            <Icon icon={Folder} size="sm" tone="secondary" label={compact ? where : undefined} />
            {compact ? null : (
                <Text role="label" tone="secondary" numberOfLines={1} compact dir="auto">
                    {name}
                </Text>
            )}
        </Row>
    );
    const chip = (
        <View testID="folder-chip" accessible accessibilityLabel={where} accessibilityHint={folder.choosable ? undefined : t('folderChip.ownFixedHint')} style={{ flexShrink: 0 }}>
            <ChipMeasure id="folder">{content(false)}</ChipMeasure>
            {content(iconOnly)}
        </View>
    );
    return addOnPc ? (
        <Stack gap="sm">
            {chip}
            {addOnPc}
        </Stack>
    ) : (
        chip
    );
}

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** The folder a chat started in, beside the model in its composer; tap to see the chat's folders. Hidden when there is none. */
export function SessionFolderChip({ sessionId, live, onOpen }: { sessionId: string; live?: boolean; onOpen: () => void }) {
    const t = useT();
    const env = useSessionEnvironment(sessionId, { enabled: true, live }).data;
    const folder = env?.folders.find((f) => f.source === 'working_folder');
    if (!folder) return null;
    const name = baseName(folder.path);
    return (
        <ControlChip
            label={name}
            icon={Folder}
            chip="folder"
            value="auto"
            onPress={onOpen}
            accessibilityLabel={t('folderChip.workingFolder', { name })}
            accessibilityHint={t('folderChip.worksIn', { path: folder.path })}
            testID="session-folder-chip"
        />
    );
}
