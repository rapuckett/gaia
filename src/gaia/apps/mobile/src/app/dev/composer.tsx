// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect } from 'expo-router';
import { useState } from 'react';

import { MAX_MESSAGE_CHARS } from '@webui/utils/messageLimits';

import { Composer } from '@/features/composer';
import { useT } from '@/i18n/useT';
import { Divider, Screen, Stack, UIProvider } from '@/ui';

export default function ComposerGalleryRoute() {
    const t = useT();
    const [text, setText] = useState('');
    if (!__DEV__) return <Redirect href="/" />;
    const noop = () => {};
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
                    <Composer onSend={noop} disabledReason={t('composer.starting')} />
                    <Divider />
                    <Composer value={'x'.repeat(MAX_MESSAGE_CHARS + 1)} onChange={noop} onSend={noop} />
                </Stack>
            </Screen>
        </UIProvider>
    );
}
