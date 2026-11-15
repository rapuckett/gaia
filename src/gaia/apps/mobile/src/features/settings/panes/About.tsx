// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Constants from 'expo-constants';
import { Linking } from 'react-native';

import { useT } from '@/i18n/useT';
import { Badge, Button, Card, Ltr, Row, Stack, Text } from '@/ui';
import { ExternalLink } from '@/ui/icons';

import { SettingsAnchor } from '../targets';

const LINKS = [
    { key: 'mobileApp.about.whatsNew', url: 'https://github.com/amd/gaia/releases' },
    { key: 'mobileApp.about.docs', url: 'https://amd-gaia.ai/docs' },
    { key: 'mobileApp.about.report', url: 'https://github.com/amd/gaia/issues/new/choose' },
    { key: 'mobileApp.about.license', url: 'https://github.com/amd/gaia/blob/main/LICENSE.md' },
] as const;

function open(url: string) {
    Linking.openURL(url).catch((error: unknown) => console.error(`Opening ${url} failed`, error));
}

/** The phone app's own version and the project's links. */
export default function About() {
    const t = useT();
    const version = Constants.expoConfig?.version;
    return (
        <SettingsAnchor name="pane">
            <Stack gap="lg" padding="lg">
                <Stack gap="xs">
                    <Row gap="sm" align="center">
                        {version ? (
                            <Text role="title" weight="semibold">
                                <Ltr>{`GAIA v${version}`}</Ltr>
                            </Text>
                        ) : null}
                        <Badge label={t.bare('mem.beta')} />
                    </Row>
                    <Text role="label" tone="secondary">{t('settings.advanced.about')}</Text>
                </Stack>
                <Card>
                    <Stack gap="sm">
                        <Text role="ui" weight="medium">{t('mobileApp.about.links')}</Text>
                        {LINKS.map((l) => (
                            <Row key={l.url}>
                                <Button variant="secondary" size="sm" iconEnd={ExternalLink} label={t(l.key)} onPress={() => open(l.url)} />
                            </Row>
                        ))}
                    </Stack>
                </Card>
            </Stack>
        </SettingsAnchor>
    );
}
