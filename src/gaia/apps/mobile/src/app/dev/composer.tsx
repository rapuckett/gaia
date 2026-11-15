// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect } from 'expo-router';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { useState } from 'react';

import { MAX_MESSAGE_CHARS } from '@webui/utils/messageLimits';

import { Composer, FolderChip, PermissionChip, PrivateChip } from '@/features/composer';
import { ControlChip } from '@/features/composer/ControlChip';
import { useT } from '@/i18n/useT';
import { Divider, Screen, Stack, UIProvider } from '@/ui';
import { Cpu } from '@/ui/icons';

export default function ComposerGalleryRoute() {
    const t = useT();
    const [text, setText] = useState('');
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const noop = () => {};
    const folder = { path: '/Users/rich/Projects/gaia', name: 'gaia-notes', gaia_folder: false, choosable: false };
    const chipRow = (
        <Composer
            onSend={noop}
            leftControls={
                <>
                    <FolderChip folder={folder} />
                    <PermissionChip mode="ask" onChange={noop} />
                    <PrivateChip on={false} onChange={noop} />
                </>
            }
            rightControls={<ControlChip chip="model" icon={Cpu} menu label="Qwen3.6-35B-A3B-GGUF" testID="gallery-model-chip" />}
        />
    );
    return (
        <UIProvider>
            <Screen scroll keyboard="avoid">
                <Stack gap="md">
                    <Composer value={text} onChange={setText} onSend={noop} />
                    <Divider />
                    <Composer onSend={noop} running onStop={noop} />
                    <Divider />
                    <Composer onSend={noop} starting />
                    <Divider />
                    {chipRow}
                    <Divider />
                    <Stack maxWidth={320}>{chipRow}</Stack>
                    <Divider />
                    <Composer onSend={noop} disabledReason={t('composer.starting')} />
                    <Divider />
                    <Composer value={'x'.repeat(MAX_MESSAGE_CHARS + 1)} onChange={noop} onSend={noop} />
                </Stack>
            </Screen>
        </UIProvider>
    );
}
