// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform, useWindowDimensions, View, type AccessibilityActionEvent } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { cmdReading, decodedPowerShell } from '@webui/components/shownText';
import { isolate, pluralKey, type Say } from '@webui/i18n/registry';
import type { GaiaNotification } from '@webui/types/agent';
import {
    alwaysScopeWith,
    CODE_TOOLS,
    COMMAND_SUMMARY_TOOLS,
    EXACT_SUMMARY_TOOLS,
    formatCountdown,
    MAIL_ADDRESS_FIELDS,
    MAIL_FIELDS,
    type MailHeader,
    outsideFolderPath,
    PATH_ACCESS_TOOL,
    permissionPromptText,
    PROJECT_TRUST_TOOL,
    PROMPT_CODE_PREVIEW_LINES,
    requiresFreshConsent,
    SCRIPT_UNREADABLE,
    shortScope,
    shownArgs,
    shownField,
    shownScript,
    splitCommandSummary,
    splitMailHeader,
    summarizeField,
} from '@webui/utils/permissionPrompts.core';
import {
    calendarFacts,
    CALENDAR_WRITE_TOOLS,
    unseen,
    unseenCommand,
    unseenStrict,
    visibleCommand,
    visibleStrict,
    visibleText,
} from '@webui/utils/calendarApproval.core';
import { CHANGE_PREVIEW_LINES, fileChange, fileText, fileUnseen } from '@webui/utils/permissionChange.core';

import { useT } from '@/i18n/useT';
import { dirProp } from '@/platform/dirProp';
import { Button, Disclosure, HScroll, Icon, Notice, Pressable, Row, ScrollBox, Stack, Surface, Text, useTheme } from '@/ui';
import { ShieldQuestion } from '@/ui/icons';

import { useApprovalArm } from './useApprovalArm';
import { useCountdown } from './useCountdown';

export type PermissionChoice = 'once' | 'always' | 'deny';

export interface PermissionPromptProps {
    prompt: GaiaNotification;
    /** Earlier allows of this same call; above zero, Always becomes the suggested answer. */
    repeats?: number;
    busy?: boolean;
    error?: string | null;
    errorDetail?: string | null;
    fullAccessPending?: boolean;
    onAnswer(choice: PermissionChoice): void;
    onExpired?(): void;
    /** Set to the card's restart of its arm wait, for a parent whose layout can move the card (the chat's footer). */
    rearmRef?: { current: (() => void) | null };
}

// TalkBack's double tap arrives as this action (ACTION_CLICK), not as a press, so it is never held back by the arm wait.
const TALKBACK_ACTIVATE = [{ name: 'activate' }] as const;

// Width where the buttons may sit side by side.
const SIDE_BY_SIDE_MIN_WIDTH = 600;

// The body scrolls inside this share of the window, so Allow, Deny and the composer stay on screen.
const BODY_HEIGHT_SHARE = 0.35;
const MIN_BODY_HEIGHT = 96;

const mark = (text: string): string => isolate(text, 'ltr');
// Code first, then isolate: the isolate's own marks would otherwise show as codes.
const markName = (text: string): string => mark(visibleStrict(text));

type CodeTone = 'primary' | 'secondary' | 'success' | 'danger';

/** Code, a path or a diff: left to right and left-aligned in any UI language; a long line scrolls sideways inside the box. */
function CodeBox({ lines, testID }: { lines: { text: string; tone?: CodeTone }[]; testID?: string }) {
    const { colors } = useTheme();
    return (
        <Surface tone="recessed" radius="sm" padding="sm" border>
            <HScroll dir="ltr" hint hintBackground={colors.bgRecessed} testID={testID}>
                <View style={{ minWidth: '100%', direction: 'ltr' }} {...dirProp('ltr')}>
                    {lines.map((line, i) => (
                        <Text key={i} role="caption" mono dir="ltr" align="ltr" selectable tone={line.tone}>
                            {line.text}
                        </Text>
                    ))}
                </View>
            </HScroll>
        </Surface>
    );
}

/** Code or JSON, collapsed past the web's line count; `whole` shows every line, for text the person approves as it reads. */
function Collapsible({ text, limit = PROMPT_CODE_PREVIEW_LINES, whole, testID }: { text: string; limit?: number; whole?: boolean; testID?: string }) {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const lines = text.replace(/^\n+|\n+$/g, '').split('\n');
    const long = !whole && lines.length > limit;
    const shown = long && !expanded ? lines.slice(0, limit) : lines;
    return (
        <Stack gap="xs">
            <CodeBox lines={shown.map((text) => ({ text }))} testID={testID} />
            {long ? (
                <Pressable
                    onPress={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
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

/** The lines an edit changes, or the text a write saves, as they will land. */
function ChangePreview({ args }: { args: Record<string, unknown> }) {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const change = fileChange(args);
    if (!change) return null;
    const long = change.kind === 'edit' && change.lines.length > CHANGE_PREVIEW_LINES;
    const lines = change.kind === 'edit' ? (long && !expanded ? change.lines.slice(0, CHANGE_PREVIEW_LINES) : change.lines) : [];
    const more = t('prompt.showAllLines', { n: change.kind === 'edit' ? change.lines.length : 0 });
    return (
        <Stack gap="xs" testID="perm-change">
            <Text role="label" weight="medium">
                {t(change.kind === 'edit' ? 'prompt.willChange' : 'prompt.willWrite')}
            </Text>
            {change.kind === 'edit' ? (
                <Stack gap="xs">
                    <CodeBox
                        testID="perm-change-scroll"
                        lines={lines.map((line) => ({
                            text: fileText(line, true),
                            tone: line.startsWith('+') ? 'success' : line.startsWith('-') ? 'danger' : 'secondary',
                        }))}
                    />
                    {long ? (
                        <Button variant="secondary" size="sm" label={expanded ? t('prompt.showLess') : more} onPress={() => setExpanded((v) => !v)} />
                    ) : null}
                </Stack>
            ) : change.text ? (
                <Collapsible text={fileText(change.text, true)} limit={CHANGE_PREVIEW_LINES} />
            ) : (
                <Text role="caption" tone="secondary">
                    {t('prompt.emptyFile')}
                </Text>
            )}
        </Stack>
    );
}

/** Title, time, account and people of a calendar change, as the web card lists them. */
function CalendarDetails({ tool, args }: { tool: string; args: Record<string, unknown> }) {
    const t = useT();
    const { rows, peopleLabel, people } = calendarFacts(tool, args, t);
    const when = (v: (typeof rows)[number]['value']) =>
        v.kind === 'text' ? v.text : v.when.raw ?? (v.when.allDay ? `${v.when.text} (${t.bare('permission.calendar.allDay')})` : v.when.text);
    return (
        <Stack gap="xs" testID="perm-calendar">
            {rows.map(({ label, value }) => (
                <Stack key={label} gap="xs">
                    <Text role="caption" tone="muted">
                        {label}
                    </Text>
                    <Text role="label" dir="auto">
                        {when(value)}
                    </Text>
                </Stack>
            ))}
            <Text role="caption" tone="muted">
                {peopleLabel}
            </Text>
            {people.map((person) => (
                <Text key={person} role="label" dir="auto">
                    {person}
                </Text>
            ))}
        </Stack>
    );
}

/** An email's header lines under translated labels; every value stays exactly as it will be sent. */
function MailFacts({ header }: { header: MailHeader }) {
    const t = useT();
    const labels = new Map(MAIL_FIELDS);
    return (
        <Stack gap="xs" testID="perm-mail-header">
            {header.fields.map(([label, value], i) => {
                const key = labels.get(label);
                return (
                    <Stack key={i} gap="xs">
                        {key ? (
                            <Text role="caption" tone="muted">
                                {t(key)}
                            </Text>
                        ) : null}
                        <Text role="label" dir={MAIL_ADDRESS_FIELDS.has(label) ? 'ltr' : 'auto'}>
                            {value}
                        </Text>
                    </Stack>
                );
            })}
        </Stack>
    );
}

type CallWarning = { key: string; testID?: string; text: string };

/** What a call is, worked out once: the body shows it and the card pins its warnings above the buttons. */
function describeCall(prompt: GaiaNotification, t: ReturnType<typeof useT>) {
    const tool = prompt.tool ?? '';
    const args = prompt.toolArgs ?? {};
    const field = summarizeField(prompt);
    const detail = field.text;
    const riskNote = typeof args._risk_note === 'string' ? args._risk_note : '';
    const outsidePath = outsideFolderPath(riskNote);
    const folder = riskNote && typeof args.working_directory === 'string' ? args.working_directory : '';
    // A file is approved on its content too: the path alone does not say what runs.
    const script = shownScript(tool, args);
    const code = typeof args.code === 'string' && args.code.trim() ? args.code : script?.text?.trim() ? script.text : '';
    // GAIA screens a script's text but can't see what it does when it runs.
    const codeNote = (code || CODE_TOOLS.has(tool)) && !riskNote ? t('prompt.codeRisk') : '';
    // The script is on the card already; the raw arguments don't repeat it.
    const detailArgs = script ? Object.fromEntries(Object.entries(args).filter(([key]) => key !== '_script')) : args;
    const exactText =
        typeof args._exact_text === 'string'
            ? args._exact_text
            : EXACT_SUMMARY_TOOLS.has(tool)
              ? (prompt.summary ?? '')
              : '';
    const hasArgs = Object.keys(args).length > 0;
    const calendar = CALENDAR_WRITE_TOOLS.has(tool);
    const relayed = !hasArgs && COMMAND_SUMMARY_TOOLS.has(tool) ? splitCommandSummary(prompt.summary ?? '') : null;
    // Characters that don't show are shown as [U+XXXX]: the card is approved as it reads.
    const { shown, coded: detailCoded } = shownField(field.key, detail);
    const shownDetail = shown;
    const command = typeof args.command === 'string' ? args.command : relayed?.command ?? '';
    // What the command runs when its own text hides it: base64 PowerShell, cmd's ^ escapes.
    const decoded = command ? decodedPowerShell(command) : '';
    const reading = command.includes('^') ? cmdReading(command) : '';
    const hidden =
        detailCoded ||
        [code, relayed?.extras].some(unseen) ||
        [command, decoded].some(unseenCommand) ||
        [args.path, folder, relayed?.folder].some(unseenStrict);
    const mail = exactText ? splitMailHeader(exactText) : null;
    const change = fileChange(args);
    const changeUnseen = change
        ? change.kind === 'edit'
            ? fileUnseen(args.old_content) || fileUnseen(args.new_content)
            : fileUnseen(change.text)
        : false;
    const calendarUnseen = calendar && hasArgs ? calendarFacts(tool, args, t).unseenNote : '';
    // Notes the person must read before approving, in the order the body showed them.
    const warnings: CallWarning[] = [];
    if (riskNote) {
        warnings.push({ key: 'risk', text: outsidePath ? t('prompt.outsideFolders', { path: markName(outsidePath) }) : riskNote });
    }
    if (script?.hiddenLines) {
        warnings.push({
            key: 'script-more',
            testID: 'perm-script-more',
            text: t.plural('prompt.scriptMoreLines', script.hiddenLines, { n: script.hiddenLines }),
        });
    }
    if (script?.unreadable) {
        warnings.push({ key: 'script-unreadable', testID: 'perm-script-unreadable', text: t(SCRIPT_UNREADABLE[script.unreadable]) });
    }
    if (codeNote) warnings.push({ key: 'code-risk', testID: 'perm-code-risk', text: codeNote });
    if (hidden) warnings.push({ key: 'hidden', testID: 'perm-hidden-note', text: t('prompt.hiddenChars') });
    if (relayed?.note) warnings.push({ key: 'relayed', text: relayed.note });
    if (calendarUnseen) warnings.push({ key: 'calendar-unseen', testID: 'perm-calendar-unseen', text: calendarUnseen });
    if (changeUnseen) warnings.push({ key: 'change-unseen', testID: 'perm-change-unseen', text: t('prompt.unseenChars') });

    return {
        tool, args, detail, riskNote, folder, script, code, detailArgs, exactText, hasArgs, calendar, relayed,
        shownDetail, command, decoded, reading, mail, warnings, summary: prompt.summary,
    };
}

type CallFacts = ReturnType<typeof describeCall>;

/** The warnings, pinned just above the buttons so a long card can't scroll them out of view. */
function CallWarnings({ warnings }: { warnings: CallWarning[] }) {
    if (!warnings.length) return null;
    return (
        <Stack gap="xs" testID="perm-warnings">
            {warnings.map(({ key, testID, text }) => (
                <Text key={key} role="caption" tone="warning" testID={testID} accessibilityRole={key === 'risk' ? 'text' : undefined}>
                    {text}
                </Text>
            ))}
        </Stack>
    );
}

/** What the call does, in the order the web card shows it. */
function CallDetails({ facts, question }: { facts: CallFacts; question: string }) {
    const t = useT();
    const { tool, args, detail, riskNote, folder, script, code, detailArgs, exactText, hasArgs, calendar, relayed, shownDetail, command, decoded, reading, mail, summary } = facts;
    const [showArgs, setShowArgs] = useState(false);
    const inFolder = (path: string) => (
        <Text role="caption" tone="secondary">
            {t.bare('prompt.in')} <Text mono>{markName(path)}</Text>
        </Text>
    );

    return (
        <Stack gap="sm">
            {shownDetail && riskNote ? <Collapsible text={shownDetail} whole /> : null}
            {shownDetail && !riskNote ? (
                <View style={{ direction: 'ltr' }} {...dirProp('ltr')}>
                    <Text role="label" tone="secondary" mono dir="ltr" align="ltr">
                        {shownDetail}
                    </Text>
                </View>
            ) : null}
            {folder ? inFolder(folder) : null}
            {code ? <Collapsible text={visibleText(code, true)} /> : null}
            {script?.text != null && !script.text.trim() ? (
                <Text role="caption" tone="secondary" testID="perm-script-empty">
                    {t('prompt.scriptEmpty')}
                </Text>
            ) : null}
            {mail?.before ? <Collapsible text={mail.before} whole /> : null}
            {mail ? <MailFacts header={mail} /> : null}
            {exactText ? <Collapsible text={mail ? mail.body : exactText} whole testID="perm-exact-text" /> : null}
            {relayed ? <Collapsible text={visibleCommand(relayed.command)} whole /> : null}
            {decoded ? (
                <Text role="caption" tone="secondary">
                    {t('prompt.decodedCommand')}
                </Text>
            ) : null}
            {decoded ? <Collapsible text={visibleCommand(decoded)} whole testID="perm-decoded" /> : null}
            {reading && reading !== command ? (
                <Text role="caption" tone="secondary">
                    {t('prompt.cmdReading')}
                </Text>
            ) : null}
            {reading && reading !== command ? <Collapsible text={visibleCommand(reading)} whole testID="perm-cmd-reading" /> : null}
            {relayed?.folder ? inFolder(relayed.folder) : null}
            {relayed?.extras ? (
                <Text role="caption" tone="secondary">
                    {visibleText(relayed.extras, false)}
                </Text>
            ) : null}
            {calendar && hasArgs ? <CalendarDetails tool={tool} args={args} /> : null}
            {calendar && !hasArgs && summary ? <Collapsible text={summary} whole /> : null}
            {!detail && !code && !exactText && !relayed && !calendar && summary ? (
                <Text role="caption" tone="secondary">
                    {visibleText(summary, true)}
                </Text>
            ) : null}
            {requiresFreshConsent(tool) ? (
                <Text role="label" tone="secondary">
                    {question}
                </Text>
            ) : null}
            <ChangePreview args={args} />
            {hasArgs && !exactText ? (
                <Disclosure
                    title={t(fileChange(args) ? 'prompt.technicalDetails' : 'prompt.details')}
                    open={showArgs}
                    onToggle={() => setShowArgs((v) => !v)}
                    testID="perm-details"
                >
                    <Collapsible text={visibleText(JSON.stringify(shownArgs(detailArgs), null, 2), true)} />
                </Disclosure>
            ) : null}
        </Stack>
    );
}

/**
 * GAIA's permission question, inline above the composer. It is not dismissible and the
 * back gesture never answers it: only a button here does, and `busy` disables all of them.
 * A tap counts only once the card has sat still for APPROVAL_ARM_MS; a screen reader's activation counts at once.
 * The caller keys it by `prompt.id`, because the deadline and the arm wait are fixed when it mounts.
 */
export function PermissionPrompt({
    prompt,
    repeats = 0,
    busy = false,
    error = null,
    errorDetail = null,
    fullAccessPending = false,
    onAnswer,
    onExpired,
    rearmRef,
}: PermissionPromptProps) {
    const t = useT();
    const { width, height } = useWindowDimensions();
    // While the person types a queued message, only the heading and its answers fit above the keyboard.
    const typing = useKeyboardState((k) => k.isVisible);
    const reduced = useReducedMotion();
    const left = useCountdown(prompt.expiresAt, prompt.timeoutSeconds);
    const arm = useApprovalArm({ keyboard: true });
    useEffect(() => {
        if (!rearmRef) return undefined;
        rearmRef.current = arm.rearm;
        return () => {
            if (rearmRef.current === arm.rearm) rearmRef.current = null;
        };
    }, [rearmRef, arm.rearm]);
    const expired = left !== null && left <= 0;

    const expiredFired = useRef(false);
    useEffect(() => {
        if (!expired || expiredFired.current) return;
        expiredFired.current = true;
        onExpired?.();
    }, [expired, onExpired]);

    useEffect(() => {
        Keyboard.dismiss();
    }, [prompt.id]);

    const { heading, question } = permissionPromptText(prompt, t, markName);
    const facts = describeCall(prompt, t);
    useEffect(() => {
        AccessibilityInfo.announceForAccessibility(heading);
    }, [heading]);

    const scope = requiresFreshConsent(prompt.tool) ? undefined : prompt.alwaysScope;
    // A coded copy for the wording only; the answer and repeat count keep the raw scope.
    const shownScope = { ...prompt, alwaysScope: prompt.alwaysScope && visibleStrict(prompt.alwaysScope) };
    // Isolate the file or folder name so an LTR name can't reorder the Arabic around it.
    const scopeIn = (say: Say) =>
        alwaysScopeWith(shownScope, say, (name) => `\u2068${shortScope(` ${name}`).trim()}\u2069`) ??
        visibleStrict(prompt.alwaysLabel ?? scope ?? '');
    const suggestAlways = !!scope && repeats > 0;
    const allowLabel = t(
        prompt.tool === PROJECT_TRUST_TOOL ? 'prompt.trust.allow' : prompt.tool === PATH_ACCESS_TOOL ? 'prompt.allowForChat' : 'prompt.allowOnce',
    );
    const wide = width >= SIDE_BY_SIDE_MIN_WIDTH;
    const bodyMax = Math.max(MIN_BODY_HEIGHT, Math.round(height * BODY_HEIGHT_SHARE));

    // A tap that lands before the card settles was aimed at whatever was there before; it answers nothing.
    // A screen reader's activation is aimed by focus, so it answers at once: VoiceOver (and Full Keyboard Access)
    // through onAccessibilityTap, TalkBack through the standard activate action, which adds no custom action.
    const answerBy = (choice: PermissionChoice) => {
        const now = () => {
            if (!busy) onAnswer(choice);
        };
        return {
            disabled: busy,
            onPress: () => {
                if (arm.armed()) now();
            },
            ...(Platform.OS === 'ios' ? { onAccessibilityTap: now } : {}),
            ...(Platform.OS === 'android'
                ? {
                      accessibilityActions: TALKBACK_ACTIVATE,
                      onAccessibilityAction: (e: AccessibilityActionEvent) => {
                          if (e.nativeEvent.actionName === 'activate') now();
                      },
                  }
                : {}),
        };
    };

    const buttons = (
        <>
            <Button
                label={allowLabel}
                variant="primary"
                full={!wide}
                wrap
                {...answerBy('once')}
                testID="perm-allow"
            />
            {scope ? (
                <Button
                    label={t.compose((say) => say('prompt.alwaysAllow', { scope: shortScope(scopeIn(say)) }))}
                    // A lasting grant stays outlined even when suggested, as on the desktop: only the hint suggests it.
                    variant="secondary"
                    full={!wide}
                    wrap
                    {...answerBy('always')}
                    testID="perm-always"
                />
            ) : null}
            <Button label={t('prompt.deny')} variant="secondary" full={!wide} wrap {...answerBy('deny')} testID="perm-deny" />
        </>
    );

    // Fade only, so the buttons sit where they land from the first frame. No entering under reduced motion: its single
    // frame can be dropped on Android (Reanimated 4.7.1), leaving the view at opacity 0. The footer is pinned to the
    // bottom, so the card changing size (an error below the buttons, a rotation) moves them: that starts the wait again.
    return (
        <Animated.View entering={reduced ? undefined : FadeIn} exiting={FadeOut} onLayout={arm.rearm}>
            <Surface tone="card" radius="lg" padding="lg" border="accent" role="alertdialog" accessibilityLabel={heading} testID="perm-card">
                <Stack gap="md">
                    <Row gap="sm" align="start">
                        <Icon icon={ShieldQuestion} size="md" tone="accent" />
                        <Stack flex={1} gap="xs">
                            <Text role="ui" weight="semibold" accessibilityRole="header">
                                {heading}
                            </Text>
                        </Stack>
                    </Row>
                    {typing ? null : (
                        <ScrollBox maxHeight={bodyMax} hint testID="perm-details-scroll">
                            <View testID="perm-details-body">
                                <Stack gap="md">
                                    {fullAccessPending ? <Notice tone="info" message={t('perm.fullPendingNote')} testID="perm-full-pending" /> : null}
                                    <CallDetails facts={facts} question={question} />
                                    {suggestAlways && !expired ? (
                                        <Text role="caption" tone="secondary">
                                            {t.compose(
                                                (say) =>
                                                    `${say(pluralKey('prompt.repeated', repeats), { n: repeats })} ${say('prompt.alwaysHint', { scope: scopeIn(say) })}`,
                                            )}
                                        </Text>
                                    ) : null}
                                </Stack>
                            </View>
                        </ScrollBox>
                    )}
                    {expired ? (
                        <Text role="label" tone="secondary" testID="perm-expired">
                            {t('prompt.expired')}
                        </Text>
                    ) : (
                        <Stack gap="sm">
                            <CallWarnings warnings={facts.warnings} />
                            {wide ? (
                                <Row gap="sm" wrap>
                                    {buttons}
                                </Row>
                            ) : (
                                <Stack gap="sm">{buttons}</Stack>
                            )}
                            {left !== null && !typing ? (
                                <Text role="caption" tone="muted" testID="perm-timer">
                                    {t('countdown.left', { time: mark(formatCountdown(left)) })} {'·'} {t('prompt.timer')}
                                </Text>
                            ) : null}
                        </Stack>
                    )}
                    {error ? <Notice tone="danger" message={error} detail={errorDetail ?? undefined} /> : null}
                </Stack>
            </Surface>
        </Animated.View>
    );
}
