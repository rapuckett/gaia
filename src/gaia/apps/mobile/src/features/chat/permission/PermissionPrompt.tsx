// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, useReducedMotion } from 'react-native-reanimated';

import { isolate, pluralKey } from '@webui/i18n/registry';
import type { GaiaNotification } from '@webui/types/agent';
import {
    alwaysScopeText,
    COMMAND_SUMMARY_TOOLS,
    EXACT_SUMMARY_TOOLS,
    formatCountdown,
    PATH_ACCESS_TOOL,
    permissionPromptText,
    PROJECT_TRUST_TOOL,
    PROMPT_CODE_PREVIEW_LINES,
    requiresFreshConsent,
    shortScope,
    splitCommandSummary,
    summarize,
} from '@webui/utils/permissionPrompts.core';

import { useT } from '@/i18n/useT';
import { Button, Icon, Notice, Pressable, Row, Stack, Surface, Text } from '@/ui';
import { ShieldQuestion } from '@/ui/icons';

import { useCountdown } from './useCountdown';

export type PermissionChoice = 'once' | 'always' | 'deny';

export interface PermissionPromptProps {
    prompt: GaiaNotification;
    /** Earlier allows of this same call; above zero, Always becomes the suggested answer. */
    repeats?: number;
    busy?: boolean;
    error?: string | null;
    fullAccessPending?: boolean;
    onAnswer(choice: PermissionChoice): void;
    onExpired?(): void;
}

// Width where the buttons may sit side by side.
const SIDE_BY_SIDE_MIN_WIDTH = 600;

const mark = (text: string): string => isolate(text, 'ltr');

/** Code or JSON, left to right and collapsed past the web's line count. */
function Collapsible({ text }: { text: string }) {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const lines = text.replace(/^\n+|\n+$/g, '').split('\n');
    const long = lines.length > PROMPT_CODE_PREVIEW_LINES;
    const shown = long && !expanded ? lines.slice(0, PROMPT_CODE_PREVIEW_LINES) : lines;
    return (
        <Stack gap="xs">
            <Surface tone="recessed" radius="sm" padding="sm" border>
                <Text role="caption" mono dir="ltr" selectable>
                    {shown.join('\n')}
                </Text>
            </Surface>
            {long ? (
                <Pressable
                    onPress={() => setExpanded((v) => !v)}
                    accessibilityState={{ expanded }}
                    accessibilityLabel={expanded ? t('prompt.showLess') : t('prompt.showAllLines', { n: lines.length })}
                >
                    <Text role="label" tone="accent" weight="medium">
                        {expanded ? t('prompt.showLess') : t('prompt.showAllLines', { n: lines.length })}
                    </Text>
                </Pressable>
            ) : null}
        </Stack>
    );
}

/** What the call does, in the order the web card shows it. */
function CallDetails({ prompt }: { prompt: GaiaNotification }) {
    const t = useT();
    const tool = prompt.tool ?? '';
    const args = prompt.toolArgs ?? {};
    const detail = summarize(prompt);
    const riskNote = typeof args._risk_note === 'string' ? args._risk_note : '';
    const folder = riskNote && typeof args.working_directory === 'string' ? args.working_directory : '';
    const code = typeof args.code === 'string' && args.code.trim() ? args.code : '';
    const exactText =
        typeof args._exact_text === 'string'
            ? args._exact_text
            : EXACT_SUMMARY_TOOLS.has(tool)
              ? (prompt.summary ?? '')
              : '';
    const hasArgs = Object.keys(args).length > 0;
    const relayed = !hasArgs && COMMAND_SUMMARY_TOOLS.has(tool) ? splitCommandSummary(prompt.summary ?? '') : null;
    // The question already names the path of a folder or trust prompt.
    const own = tool === PATH_ACCESS_TOOL || tool === PROJECT_TRUST_TOOL;
    const shownDetail = own ? '' : detail;
    // What the card already shows isn't repeated in the arguments.
    const rest = Object.fromEntries(
        Object.entries(args).filter(
            ([key, value]) =>
                key !== 'code' && !key.startsWith('_') && !(key === 'working_directory' && folder) && !(shownDetail && value === shownDetail),
        ),
    );
    const showArgs = !own && !exactText && Object.keys(rest).length > 0;
    const inFolder = (path: string) => (
        <Text role="caption" tone="secondary">
            {t.bare('prompt.in')} <Text mono>{mark(path)}</Text>
        </Text>
    );

    return (
        <Stack gap="sm">
            {shownDetail && riskNote ? <Collapsible text={shownDetail} /> : null}
            {shownDetail && !riskNote ? (
                <Text role="label" tone="secondary" mono dir="ltr">
                    {shownDetail}
                </Text>
            ) : null}
            {folder ? inFolder(folder) : null}
            {riskNote ? (
                <Text role="caption" tone="warning" accessibilityRole="text">
                    {riskNote}
                </Text>
            ) : null}
            {code ? <Collapsible text={code} /> : null}
            {exactText ? <Collapsible text={exactText} /> : null}
            {relayed ? <Collapsible text={relayed.command} /> : null}
            {relayed?.folder ? inFolder(relayed.folder) : null}
            {relayed?.extras ? (
                <Text role="caption" tone="secondary">
                    {relayed.extras}
                </Text>
            ) : null}
            {relayed?.note ? (
                <Text role="caption" tone="warning">
                    {relayed.note}
                </Text>
            ) : null}
            {!detail && !code && !exactText && !relayed && prompt.summary ? (
                <Text role="caption" tone="secondary">
                    {prompt.summary}
                </Text>
            ) : null}
            {showArgs ? <Collapsible text={JSON.stringify(rest, null, 2)} /> : null}
        </Stack>
    );
}

/**
 * GAIA's permission question, inline above the composer. It is not dismissible and the
 * back gesture never answers it: only a button here does, and `busy` disables all of them.
 * The caller keys it by `prompt.id`, because the deadline is fixed when it mounts.
 */
export function PermissionPrompt({
    prompt,
    repeats = 0,
    busy = false,
    error = null,
    fullAccessPending = false,
    onAnswer,
    onExpired,
}: PermissionPromptProps) {
    const t = useT();
    const { width } = useWindowDimensions();
    const reduced = useReducedMotion();
    const left = useCountdown(prompt.expiresAt, prompt.timeoutSeconds);
    const expired = left !== null && left <= 0;

    const expiredFired = useRef(false);
    useEffect(() => {
        if (!expired || expiredFired.current) return;
        expiredFired.current = true;
        onExpired?.();
    }, [expired, onExpired]);

    const { heading, question } = permissionPromptText(prompt, t, mark);
    useEffect(() => {
        AccessibilityInfo.announceForAccessibility(heading);
    }, [heading]);

    const scope = requiresFreshConsent(prompt.tool) ? undefined : prompt.alwaysScope;
    const scopeText = alwaysScopeText(prompt, t) ?? prompt.alwaysLabel ?? scope ?? '';
    const suggestAlways = !!scope && repeats > 0;
    const allowLabel = t(
        prompt.tool === PROJECT_TRUST_TOOL ? 'prompt.trust.allow' : prompt.tool === PATH_ACCESS_TOOL ? 'prompt.allowForChat' : 'prompt.allowOnce',
    );
    const wide = width >= SIDE_BY_SIDE_MIN_WIDTH;

    const buttons = (
        <>
            <Button
                label={allowLabel}
                variant={suggestAlways ? 'secondary' : 'primary'}
                full={!wide}
                wrap
                disabled={busy}
                onPress={() => onAnswer('once')}
                testID="perm-allow"
            />
            {scope ? (
                <Button
                    label={t('prompt.alwaysAllow', { scope: shortScope(scopeText) })}
                    variant={suggestAlways ? 'primary' : 'secondary'}
                    full={!wide}
                    wrap
                    disabled={busy}
                    onPress={() => onAnswer('always')}
                    testID="perm-always"
                />
            ) : null}
            <Button label={t('prompt.deny')} variant="secondary" full={!wide} wrap disabled={busy} onPress={() => onAnswer('deny')} testID="perm-deny" />
        </>
    );

    return (
        <Animated.View entering={reduced ? FadeIn : FadeInDown} exiting={reduced ? FadeOut : FadeOutDown}>
            <Surface tone="card" radius="lg" padding="lg" border="accent" role="alertdialog" accessibilityLabel={heading} testID="perm-card">
                <Stack gap="md">
                    <Row gap="sm" align="start">
                        <Icon icon={ShieldQuestion} size="md" tone="accent" />
                        <Stack flex={1} gap="xs">
                            <Text role="ui" weight="semibold" accessibilityRole="header">
                                {heading}
                            </Text>
                            <Text role="label" tone="secondary">
                                {question}
                            </Text>
                        </Stack>
                    </Row>
                    <CallDetails prompt={prompt} />
                    {fullAccessPending ? <Notice tone="info" message={t('perm.fullPendingNote')} testID="perm-full-pending" /> : null}
                    {suggestAlways && !expired ? (
                        <Text role="caption" tone="secondary">
                            {t.compose(
                                (say) =>
                                    `${say(pluralKey('prompt.repeated', repeats), { n: repeats })} ${say('prompt.alwaysHint', { scope: scopeText })}`,
                            )}
                        </Text>
                    ) : null}
                    {expired ? (
                        <Text role="label" tone="secondary" testID="perm-expired">
                            {t('prompt.expired')}
                        </Text>
                    ) : (
                        <Stack gap="sm">
                            {wide ? (
                                <Row gap="sm" wrap>
                                    {buttons}
                                </Row>
                            ) : (
                                <Stack gap="sm">{buttons}</Stack>
                            )}
                            {left !== null ? (
                                <Text role="caption" tone="muted" testID="perm-timer">
                                    {isolate(formatCountdown(left), 'ltr')} {'·'} {t('prompt.timer')}
                                </Text>
                            ) : null}
                        </Stack>
                    )}
                    {error ? <Notice tone="danger" message={error} /> : null}
                </Stack>
            </Surface>
        </Animated.View>
    );
}
