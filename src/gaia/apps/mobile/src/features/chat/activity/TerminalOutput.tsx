// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { CommandOutput } from '@webui/types';
import { isolate } from '@webui/i18n/registry';
import { countLines } from '@webui/utils/longContent';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { HScroll, Icon, Pressable, Row, Stack, Surface, Text } from '@/ui';
import { Check, Copy, Terminal } from '@/ui/icons';

import { expandLabel } from '../markdown/expandLabel';
import { terminalWindow } from './terminalText';

const COPIED_MS = 2000;

/** A command's output as plain, selectable text: never run and never rendered as markup. */
export function TerminalOutput({ output }: { output: CommandOutput }) {
    const t = useT();
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const text = [output.stdout, output.stderr].filter(Boolean).join('\n');
    const hasOutput = text.length > 0;
    const isError = output.returnCode !== 0 && !output.expectedExit;
    const view = terminalWindow(text, expanded);

    const copy = () => {
        Clipboard.setStringAsync(output.stdout || output.stderr || '').then(
            () => {
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), COPIED_MS);
            },
            (error: unknown) => console.error('Copying the command output to the clipboard failed', error),
        );
    };

    return (
        <Surface tone="recessed" radius="md" border>
            <Stack dir="ltr" gap="xs" testID="terminal-output">
                <Row dir="ltr" gap="sm" justify="between">
                    <Row dir="ltr" gap="xs" flex={1}>
                        <View style={{ flexShrink: 1, minWidth: 0 }}>
                            <Stack paddingX="md">
                                <Row dir="ltr" gap="xs">
                                    <Icon icon={Terminal} size="sm" tone="muted" />
                                    <View style={{ flexShrink: 1, minWidth: 0 }}>
                                        <Text role="caption" tone="muted" weight="medium">
                                            {t('activity.terminal')}
                                        </Text>
                                    </View>
                                </Row>
                            </Stack>
                        </View>
                        {output.returnCode !== 0 ? (
                            <View style={{ flexShrink: 0 }} testID="terminal-exit" accessible accessibilityLabel={t('activity.exit', { code: output.returnCode })}>
                                <Text role="caption" tone={isError ? 'danger' : 'muted'} numberOfLines={1}>
                                    {isolate(t.bare('activity.exit', { code: output.returnCode }), 'ltr')}
                                </Text>
                            </View>
                        ) : null}
                    </Row>
                    {hasOutput ? (
                        <Pressable onPress={copy} accessibilityLabel={copied ? t('msg.copiedAria') : t('activity.copyOutputAria')}>
                            <Stack paddingX="md">
                                <Row gap="xs" dir="ltr">
                                    <Icon icon={copied ? Check : Copy} size="sm" tone="secondary" />
                                    <Text role="caption" tone="secondary">
                                        {copied ? t('msg.copied') : t('activity.copyOutput')}
                                    </Text>
                                </Row>
                            </Stack>
                        </Pressable>
                    ) : null}
                </Row>
                <HScroll dir="ltr">
                    <Stack paddingX="md" paddingY="sm" gap="xs">
                        {output.command ? (
                            <Text role="label" mono selectable dir="ltr" align="ltr">
                                {`$ ${output.command}`}
                            </Text>
                        ) : null}
                        {hasOutput ? (
                            <Text role="label" mono selectable dir="ltr" align="ltr" tone={isError && !output.stdout ? 'danger' : 'secondary'} testID="terminal-text">
                                {view.text}
                            </Text>
                        ) : (
                            <Text role="caption" tone="muted">
                                {t('activity.noOutput')}
                            </Text>
                        )}
                    </Stack>
                </HScroll>
                {view.collapsible ? (
                    <Pressable
                        onPress={() => setExpanded((v) => !v)}
                        aria-expanded={expanded}
                        accessibilityLabel={expanded ? t('code.collapse') : expandLabel(t, countLines(text))}
                    >
                        <Stack paddingX="md" paddingY="xs">
                            <Text role="caption" tone="secondary">
                                {expanded ? t('code.collapse') : expandLabel(t, countLines(text))}
                            </Text>
                        </Stack>
                    </Pressable>
                ) : null}
                {output.truncated || view.capped ? (
                    <Stack paddingX="md" paddingY="xs">
                        <Text role="caption" tone="muted">
                            {t('activity.truncated')}
                        </Text>
                    </Stack>
                ) : null}
            </Stack>
        </Surface>
    );
}
