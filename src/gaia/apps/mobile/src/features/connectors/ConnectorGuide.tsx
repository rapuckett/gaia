// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
import { CONNECTOR_GUIDES, guideLinkHref } from '@webui/utils/connectorGuide.core';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { openLinkFromPress } from '@/platform/openLink';
import { Button, Row, Stack, Text, useTheme } from '@/ui';
import { ExternalLink } from '@/ui/icons';

const BADGE = 24;

/** The desktop's numbered setup steps (`ConnectorGuide`): a title, one line and one button to the exact page per step, ending at the form below. */
export function ConnectorGuide({ connectorId, setupUrl }: { connectorId: string; setupUrl?: string | null }) {
    const t = useT();
    const { colors, radius } = useTheme();
    const steps = CONNECTOR_GUIDES[connectorId];
    if (!steps) return null;
    return (
        <Stack gap="md" accessibilityRole="list" testID={`connector-guide-${connectorId}`}>
            {steps.map((step, i) => {
                const href = guideLinkHref(step, setupUrl);
                return (
                    <Row key={step.title} gap="md" align="start" testID={`connector-guide-step-${i + 1}`}>
                        <View
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            style={{ width: BADGE, height: BADGE, borderRadius: radius.full, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Text role="caption" tone="secondary">{isolate(String(i + 1), 'ltr')}</Text>
                        </View>
                        <Stack gap="xs" flex={1}>
                            <Text role="ui" weight="semibold">{t(step.title)}</Text>
                            {step.body ? <Text role="label" tone="secondary">{t(step.body)}</Text> : null}
                            {step.link && href ? (
                                <Stack align="start">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        wrap
                                        label={t(step.link.label)}
                                        iconEnd={ExternalLink}
                                        onPress={() => openLinkFromPress(href)}
                                        testID={`connector-guide-link-${i + 1}`}
                                    />
                                </Stack>
                            ) : null}
                        </Stack>
                    </Row>
                );
            })}
        </Stack>
    );
}
