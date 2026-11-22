// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT } from '@/i18n/useT';
import { Button, Sheet, Stack, Text } from '@/ui';

export interface PushExplainerProps {
    open: boolean;
    onAllow: () => void;
    onLater: () => void;
}

/** Design's explainer before the OS prompt: what push does and that a chat's words stay encrypted. */
export function PushExplainer({ open, onAllow, onLater }: PushExplainerProps) {
    const t = useT();
    return (
        <Sheet
            open={open}
            onClose={onLater}
            title={t('mobileApp.push.ask.title')}
            footer={
                <Stack gap="sm">
                    <Button variant="primary" label={t('mobileApp.push.ask.allow')} onPress={onAllow} testID="push-ask-allow" />
                    <Button variant="ghost" label={t('mobileApp.push.ask.later')} onPress={onLater} testID="push-ask-later" />
                </Stack>
            }
        >
            <Text role="body">{t('mobileApp.push.ask.body')}</Text>
        </Sheet>
    );
}
