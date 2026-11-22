// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { View } from 'react-native';

import type { StartScreen } from '@webui/types';

import { useSessionEnvironment } from '@/data';
import { FolderPicker } from '@/features/chat/session-panel/FolderPicker';
import { useT } from '@/i18n/useT';
import { Chip, Icon, Ltr, Pressable, Row, Sheet, Stack, Text, useTheme } from '@/ui';
import { Folder, Plus, X } from '@/ui/icons';

import { ChipMeasure, useChipCollapsed } from './ChipFitContext';
import { ControlChip } from './ControlChip';
import { useNextChatFolder } from './nextChatFolder';

/**
 * Where the new chat's agent works and, when the agent can be held to it, "Add a folder": the folder picked
 * waits here and is given to the chat as it is made, as on the desktop. GAIA's own folder is not named.
 */
export function FolderChip({ folder, initialPicking = false }: { folder: StartScreen['working_folder'] | undefined; initialPicking?: boolean }) {
    const t = useT();
    const { colors, radius, space } = useTheme();
    const iconOnly = useChipCollapsed('folder');
    const picked = useNextChatFolder((s) => s.path);
    const setPicked = useNextChatFolder((s) => s.set);
    const [picking, setPicking] = useState(initialPicking);
    if (!folder) return null;
    const named = !folder.gaia_folder;
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
    if (!folder.choosable) return chip;

    const pickedName = picked ? baseName(picked) : '';
    return (
        <Stack gap="xs">
            <Row gap="sm" wrap>
                {named ? chip : null}
                {picked ? (
                    <Pressable onPress={() => setPicked(null)} accessibilityLabel={t('folderChip.remove', { name: pickedName })} testID="folder-picked-clear">
                        <View
                            testID="folder-picked"
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                alignSelf: 'flex-start',
                                maxWidth: '100%',
                                minHeight: 32,
                                gap: space.xs,
                                paddingStart: 12,
                                paddingEnd: 8,
                                borderRadius: radius.full,
                                borderWidth: 1,
                                borderColor: colors.accentSolid,
                                backgroundColor: colors.accentDim,
                            }}
                        >
                            <Icon icon={Folder} size="sm" tone="accent" />
                            <View style={{ flexShrink: 1 }}>
                                <Text role="label" numberOfLines={1} compact dir="auto">
                                    {pickedName}
                                </Text>
                            </View>
                            <Icon icon={X} size="sm" tone="muted" />
                        </View>
                    </Pressable>
                ) : (
                    <Chip label={t('folderChip.add')} icon={Plus} onPress={() => setPicking(true)} testID="folder-add" />
                )}
            </Row>
            {picked ? (
                <Row>
                    <Ltr chip>{picked}</Ltr>
                </Row>
            ) : null}
            <Sheet open={picking} onClose={() => setPicking(false)}>
                {picking ? (
                    <FolderPicker
                        sessionId={null}
                        onClose={() => setPicking(false)}
                        onPick={(path) => {
                            setPicked(path);
                            setPicking(false);
                        }}
                    />
                ) : null}
            </Sheet>
        </Stack>
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
