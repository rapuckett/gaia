// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';

import { useT } from '@/i18n/useT';
import { openLinkFromPress } from '@/platform/openLink';
import { Badge, Button, Card, Ltr, Notice, Row, Stack, Text } from '@/ui';
import { Check, Copy, ExternalLink } from '@/ui/icons';

import { openSettings } from '../openSettings';
import { SettingsAnchor } from '../targets';

const LINKS = [
    { key: 'settings.about.whatsNew', url: 'https://github.com/amd/gaia/releases' },
    { key: 'settings.about.docs', url: 'https://amd-gaia.ai/docs' },
    { key: 'settings.about.report', url: 'https://github.com/amd/gaia/issues/new/choose' },
    { key: 'settings.about.license', url: 'https://github.com/amd/gaia/blob/main/LICENSE.md' },
] as const;

function open(url: string) {
    openLinkFromPress(url);
}

const COPIED_MS = 2000;

/** The phone app's own version and the project's links. */
export default function About() {
    const t = useT();
    const version = Constants.expoConfig?.version;
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const copy = () => {
        setCopyError(null);
        Clipboard.setStringAsync(`GAIA v${version}`).then(
            () => {
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), COPIED_MS);
            },
            (error: unknown) => setCopyError(t('settings.about.copyFailed', { reason: error instanceof Error ? error.message : String(error) })),
        );
    };
    return (
        <SettingsAnchor name="pane">
            <Stack gap="lg" padding="lg">
                <Stack gap="xs">
                    <Row gap="sm" align="center">
                        {version ? (
                            <Text role="title" weight="semibold" accessibilityRole="header">
                                <Ltr>{`GAIA v${version}`}</Ltr>
                            </Text>
                        ) : null}
                        <Badge label={t.bare('mem.beta')} accessibilityLabel={t('mem.beta')} />
                    </Row>
                    <Text role="label" tone="secondary">{t('settings.advanced.about')}</Text>
                    {version ? (
                        <Row>
                            <Button variant="secondary" size="sm" iconEnd={copied ? Check : Copy} label={t(copied ? 'settings.about.copied' : 'settings.about.copy')} onPress={copy} />
                        </Row>
                    ) : null}
                    {copyError ? <Notice tone="danger" message={copyError} /> : null}
                </Stack>
                <Card>
                    <Stack gap="sm">
                        <Text role="ui" weight="medium">{t('settings.about.links')}</Text>
                        {LINKS.map((l) => (
                            <Row key={l.url}>
                                <Button variant="secondary" size="sm" iconEnd={ExternalLink} label={t(l.key)} onPress={() => open(l.url)} />
                            </Row>
                        ))}
                        <Text role="label" tone="secondary">{t('settings.about.reportHint')}</Text>
                        <Row>
                            <Button variant="ghost" size="sm" label={t('settings.about.reportWhere')} onPress={() => openSettings('privacy', 'report', 'about')} />
                        </Row>
                    </Stack>
                </Card>
            </Stack>
        </SettingsAnchor>
    );
}
