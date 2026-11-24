// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { useState } from 'react';

import { MAX_MESSAGE_CHARS } from '@webui/utils/messageLimits';

import { COMPOSER_MENU_STATES, ComposerMenusGallery, type ComposerMenuState } from '@/features/composer/ComposerMenusGallery';
import { Composer, type Attachments, FolderChip, PermissionChip, PrivateChip } from '@/features/composer';
import { ControlChip } from '@/features/composer/ControlChip';
import { HeldGallery } from '@/features/new-chat/HeldGallery';
import { NEW_CHAT_SCENES, NewChatScenes, type NewChatScene } from '@/features/new-chat/NewChatScenes';
import { useT } from '@/i18n/useT';
import { uploadRefusalText } from '@webui/utils/uploadErrors';
import { Divider, Screen, Stack, UIProvider } from '@/ui';
import { Cpu } from '@/ui/icons';

const fixture = (emptyFileError: string): Attachments['items'] => [
    { id: 'a', key: 'a', name: 'quarterly-report-final-v3.pdf', uri: '', isImage: false, isMedia: false, status: 'uploading', progress: 40 },
    { id: 'b', key: 'b', name: 'standup-recording.m4a', uri: '', isImage: false, isMedia: true, status: 'uploaded' },
    { id: 'c', key: 'c', name: 'notes.doc', uri: '', isImage: false, isMedia: false, status: 'failed', error: emptyFileError },
    { id: 'd', key: 'd', name: 'IMG_2041.jpg', uri: 'https://picsum.photos/id/237/48', isImage: true, isMedia: false, status: 'uploaded' },
];
const noop = () => {};
const attachmentsFixture = (emptyFileError: string): Attachments => ({
    items: fixture(emptyFileError),
    add: noop,
    addFailed: noop,
    remove: noop,
    clear: noop,
    uploading: true,
    hasUploaded: true,
    compose: (text) => text,
});

export default function ComposerGalleryRoute() {
    const t = useT();
    const { state } = useLocalSearchParams<{ state?: string }>();
    const [text, setText] = useState('');
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    if (state === 'blocked') {
        return (
            <UIProvider>
                <Screen scroll keyboard="avoid">
                    <Composer onSend={noop} disabledReason={t('chat.retiredReadOnly', { agent: 'chat' })} />
                </Screen>
            </UIProvider>
        );
    }
    if (state === 'held') return <HeldGallery />;
    if ((NEW_CHAT_SCENES as readonly string[]).includes(state ?? '')) return <NewChatScenes key={state} state={state as NewChatScene} />;
    if (state && (COMPOSER_MENU_STATES as readonly string[]).includes(state)) return <ComposerMenusGallery key={state} state={state as ComposerMenuState} />;
    const folder = { path: '/Users/avery/Projects/gaia', name: 'gaia-notes', gaia_folder: false, choosable: false };
    const chipRow = (running = false, value?: string) => (
        <Composer
            onSend={noop}
            onStop={noop}
            running={running}
            value={value}
            onChange={value === undefined ? undefined : noop}
            leftControls={
                <>
                    <FolderChip folder={folder} />
                    <PermissionChip mode="ask" onChange={noop} />
                    <PrivateChip on={false} onChange={noop} />
                </>
            }
            rightControls={<ControlChip chip="model" icon={Cpu} menu label="Gemma 4 E4B" testID="gallery-model-chip" />}
        />
    );
    return (
        <UIProvider>
            <Screen scroll keyboard="avoid">
                <Stack gap="md">
                    <Composer value={text} onChange={setText} onSend={noop} />
                    <Divider />
                    <Composer onSend={noop} attachments={attachmentsFixture(uploadRefusalText('empty_file', null, '', t))} />
                    <Divider />
                    <Composer onSend={noop} running onStop={noop} />
                    <Divider />
                    <Composer onSend={noop} starting />
                    <Divider />
                    {chipRow()}
                    <Divider />
                    <Stack maxWidth={320}>{chipRow()}</Stack>
                    <Divider />
                    {chipRow(true)}
                    <Divider />
                    {chipRow(true, 'Summarize it')}
                    <Divider />
                    <Stack maxWidth={360}>{chipRow(true, 'Summarize it')}</Stack>
                    <Divider />
                    <Stack maxWidth={340}>{chipRow(true, 'Summarize it')}</Stack>
                    <Divider />
                    <Composer onSend={noop} disabledReason={t('composer.starting')} />
                    <Divider />
                    <Composer value={'x'.repeat(MAX_MESSAGE_CHARS + 1)} onChange={noop} onSend={noop} />
                </Stack>
            </Screen>
        </UIProvider>
    );
}
