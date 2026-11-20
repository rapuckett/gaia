// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';

import { useT } from '@/i18n/useT';
import { Button, Sheet, Stack, Text } from '@/ui';

/** The host and port of a typed address, as the PC will dial it; the text as typed when it names no scheme. */
export function serverHost(url: string): string {
    const typed = url.trim();
    const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/?#]+)/i.exec(typed);
    return m ? m[1]! : typed;
}

/**
 * Asked before GAIA on the PC points at a server the phone names. Its "Use this server" is the only press that
 * sends the switch confirmed: the PC refuses a phone's switch that isn't.
 */
export function OwnServerConfirm({ url, open, onClose, onConfirm }: { url: string; open: boolean; onClose: () => void; onConfirm: () => void }) {
    const t = useT();
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t('mobileApp.server.confirm.title')}
            footer={
                <Stack gap="sm">
                    <Button label={t('settings.server.use')} variant="primary" full onPress={onConfirm} testID="own-server-confirm" />
                    <Button label={t('mobileApp.server.confirm.cancel')} variant="secondary" full onPress={onClose} testID="own-server-cancel" />
                </Stack>
            }
        >
            <Stack gap="md">
                <Text role="body">{t('mobileApp.server.confirm.body')}</Text>
                <Stack gap="xs">
                    <Text role="caption" tone="secondary">
                        {t('settings.server.address')}
                    </Text>
                    <Text role="body" selectable testID="own-server-confirm-host">
                        {isolate(serverHost(url), 'ltr')}
                    </Text>
                </Stack>
            </Stack>
        </Sheet>
    );
}
