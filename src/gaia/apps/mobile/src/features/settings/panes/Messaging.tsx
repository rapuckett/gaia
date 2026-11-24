// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Clipboard from 'expo-clipboard';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { keepTogether } from '@webui/i18n/registry';
import type { Translate } from '@webui/i18n/translator';

import type { DiscordState, DiscordStatus } from '@/api/client.types';
import { ENDPOINTS } from '@/api/constants';
import { GaiaApiError, GaiaError, GaiaNetworkError } from '@/api/errors';
import { useDeviceRefused } from '@/api/routeAccess';
import { useConnectDiscord, useDiscordAction, useDiscordStatus, type DiscordAction } from '@/data';
import { PcOnlyAction } from '@/features/logs/PcOnlyAction';
import { ConfirmSheet } from '@/features/setup/sheets/ConfirmSheet';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { openLinkFromPress } from '@/platform/openLink';
import { Badge, Button, Card, Disclosure, Divider, Ltr, Notice, Row, Spinner, Stack, StatusDot, Surface, Text, TextField } from '@/ui';
import { Check, Copy, ExternalLink, Link2, Play, Plug, RefreshCw, RotateCw, Square, Trash2, Zap, type LucideIcon } from '@/ui/icons';

import { isPcRefusal } from '../PcOnlyNotice';

// The PC serves the status and every button to an allowed phone. The pairing code comes only to the
// device that started that pairing, and the bot token only ever travels in the connect request's body.

/** Discord's own button names, as webui's MessagingSettings quotes them; isolated so the quotes and period stay in order in Arabic. */
const PORTAL = {
    newApp: keepTogether('New Application'),
    create: keepTogether('Create'),
    bot: keepTogether('Bot'),
    reset: keepTogether('Reset Token'),
    copy: keepTogether('Copy'),
    publicBot: keepTogether('Public Bot'),
    message: keepTogether('Message'),
    createOwn: keepTogether('Create My Own'),
    forFriends: keepTogether('For me and my friends'),
};

const PROBLEMS = new Set<DiscordState>(['error', 'taken_over', 'token_invalid', 'credentials_unavailable', 'conflict']);
const SHOW_DETAIL = new Set<DiscordState>(['error', 'credentials_unavailable']);

/** "ABCD2345" as "ABCD-2345", as webui's formatPairingCode; the bot accepts either. */
function formatCode(code: string): string {
    return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function open(url: string) {
    openLinkFromPress(url);
}

function LinkButton({ url, label, primary, accessibilityLabel }: { url: string; label: string; primary?: boolean; accessibilityLabel?: string }) {
    return <Button variant={primary ? 'primary' : 'secondary'} size="sm" iconEnd={ExternalLink} label={label} accessibilityLabel={accessibilityLabel} onPress={() => open(url)} wrap />;
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
    return (
        <Row gap="md" align="start">
            <Badge shape="pill" label={String(n)} />
            <Stack gap="sm" flex={1}>
                <Text role="label" weight="semibold" accessibilityRole="header">
                    {title}
                </Text>
                {children}
            </Stack>
        </Row>
    );
}

function Hint({ children, tone = 'secondary' }: { children: ReactNode; tone?: 'secondary' | 'muted' }) {
    return (
        <Text role="label" tone={tone}>
            {children}
        </Text>
    );
}

function PcOnly() {
    const t = useT();
    return <Notice tone="info" message={t('mobileApp.settings.pcOnly')} testID="messaging-pc-only" />;
}

/** A button the web shows here; the PC does it, so the phone explains on press. */
function PcAction({ id, label, icon, note }: { id: string; label: string; icon: LucideIcon; note?: string }) {
    const t = useT();
    return <PcOnlyAction label={label} icon={icon} note={note} detail={t('mobileApp.settings.pcOnly')} testID={`messaging-${id}`} />;
}

function Pitch() {
    const t = useT();
    return (
        <Stack gap="sm">
            <Text role="body">{t('mobileApp.settings.messaging.pitch')}</Text>
            <Hint>{t('settings.messaging.onlyYou')}</Hint>
        </Stack>
    );
}

function CreateBotStep({ portalUrl }: { portalUrl?: string }) {
    const t = useT();
    return (
        <Step n={1} title={t('settings.messaging.step1.title')}>
            <Stack gap="xs">
                <Hint>{`1. ${t('settings.messaging.step1.a', { label: PORTAL.newApp })}`}</Hint>
                <Hint>{`2. ${t('settings.messaging.step1.b', { label: PORTAL.create })}`}</Hint>
                <Hint>{`3. ${t('settings.messaging.step1.c', { label: PORTAL.bot })}`}</Hint>
                <Hint>{`4. ${t('settings.messaging.step1.d', { reset: PORTAL.reset, copy: PORTAL.copy })}`}</Hint>
            </Stack>
            <Hint>{t('settings.messaging.step1.noIntents')}</Hint>
            {portalUrl ? <LinkButton url={portalUrl} label={t('settings.messaging.openPortal')} /> : null}
        </Step>
    );
}

function AddBotStep({ inviteUrl }: { inviteUrl?: string }) {
    const t = useT();
    return (
        <Step n={3} title={t('settings.messaging.step3.title')}>
            <Hint>{t('settings.messaging.step3.why')}</Hint>
            <Hint>{t('settings.messaging.step3.how', { own: PORTAL.createOwn, friends: PORTAL.forFriends })}</Hint>
            {inviteUrl ? <LinkButton url={inviteUrl} label={t('settings.messaging.openInvite')} /> : null}
            <Hint tone="muted">{t('settings.messaging.step3.safe')}</Hint>
        </Step>
    );
}

/** Keyed by the code, so a new code starts with Copy again. */
function PairingCode({ code }: { code: string }) {
    const t = useT();
    const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
    const copy = () => Clipboard.setStringAsync(code).then(() => setCopied('ok'), () => setCopied('failed'));
    return (
        <Stack gap="sm">
            <Row>
                <Surface tone="recessed" border radius="md" padding="md">
                    <Text role="title" mono weight="semibold" selectable testID="messaging-pairing-code">
                        <Ltr>{formatCode(code)}</Ltr>
                    </Text>
                </Surface>
            </Row>
            <Row>
                <Button
                    size="sm"
                    icon={copied === 'ok' ? Check : Copy}
                    label={t(copied === 'ok' ? 'settings.messaging.copied' : 'settings.messaging.copy')}
                    onPress={() => void copy()}
                    testID="messaging-copy-code"
                />
            </Row>
            {copied === 'failed' ? <Notice tone="danger" message={t('settings.messaging.copyFailed')} /> : null}
        </Stack>
    );
}

function DmStep({ s }: { s?: DiscordStatus }) {
    const t = useT();
    return (
        <Step n={4} title={t('settings.messaging.step4.title')}>
            {s ? (
                s.pairing_code ? (
                    <PairingCode key={s.pairing_code} code={s.pairing_code} />
                ) : (
                    <Row gap="sm">
                        <Spinner size="sm" />
                        <Hint>{t('settings.messaging.waitingCode')}</Hint>
                    </Row>
                )
            ) : null}
            {s?.bot_profile_url ? <LinkButton url={s.bot_profile_url} label={t('settings.messaging.openBot')} /> : null}
            <Hint>{t('settings.messaging.step4.hint', { label: PORTAL.message })}</Hint>
            <Hint tone="muted">{t('settings.messaging.step4.onlyYou')}</Hint>
        </Step>
    );
}

/** The PC refused the read: the pitch, the refusal, and the steps to follow at the PC. */
function Refused() {
    const t = useT();
    return (
        <Stack gap="md">
            <Pitch />
            <PcOnly />
            <Text role="label" weight="semibold" tone="secondary" accessibilityRole="header">
                {t('mobileApp.settings.messaging.howTo')}
            </Text>
            <Stack gap="lg">
                <CreateBotStep />
                <Step n={2} title={t('settings.messaging.step2.title')}>
                    <PcAction id="connect" label={t('settings.messaging.connect')} icon={Plug} note={t('settings.messaging.connectingHint')} />
                </Step>
                <AddBotStep />
                <DmStep />
            </Stack>
        </Stack>
    );
}

function explainKey(s: DiscordStatus) {
    switch (s.state) {
        case 'stopped':
            return s.autostart ? 'mobileApp.settings.messaging.crashed' : 'settings.messaging.state.stopped';
        case 'error':
            return 'settings.messaging.state.error';
        case 'taken_over':
            return 'settings.messaging.state.takenOver';
        case 'token_invalid':
            return 'settings.messaging.state.tokenInvalid';
        case 'credentials_unavailable':
            return 'mobileApp.settings.messaging.credentials';
        case 'conflict':
            return 'settings.messaging.state.conflict';
        default:
            return null;
    }
}

const ANSWERING_KEYS = {
    stop: 'settings.messaging.stop',
    restart: 'settings.messaging.restart',
    pair: 'settings.messaging.pairOther',
} as const;

function fixKey(s: DiscordStatus) {
    switch (s.state) {
        case 'stopped':
        case 'error':
            return 'settings.messaging.start';
        case 'credentials_unavailable':
            return 'settings.messaging.retry';
        case 'taken_over':
            return 'settings.messaging.takeOver';
        default:
            return null;
    }
}

/** Dev scenes only: opens the status with the just-paired line showing. */
export const SeedJustPaired = createContext(false);

/** Dev scenes only: fixture text typed into the token field (and Connect pressed when `submit`), the public-bot tip, the disconnect question already up, or the PC having refused this phone's buttons. */
export const SeedDiscord = createContext<{ typed?: string; submit?: boolean; botPublic?: boolean; confirmDisconnect?: boolean; refused?: boolean } | null>(null);

type Busy = DiscordAction | 'connect' | null;

/** Step 2: the token lives only in this field until it is sent, and the field clears on every send. */
function TokenStep({ busy, refused, onConnect }: { busy: Busy; refused: boolean; onConnect: (token: string) => void }) {
    const t = useT();
    const seed = useContext(SeedDiscord);
    const [token, setToken] = useState(seed?.typed ?? '');
    const submit = () => {
        const typed = token.trim();
        setToken('');
        if (typed && busy === null) onConnect(typed);
    };
    const seededSubmit = useRef(!!seed?.submit);
    useEffect(() => {
        if (!seededSubmit.current) return;
        seededSubmit.current = false;
        submit();
        // Once, on arrival, for a dev scene.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (refused) {
        return (
            <Step n={2} title={t('settings.messaging.step2.title')}>
                <PcAction id="connect" label={t('settings.messaging.connect')} icon={Plug} note={t('settings.messaging.connectingHint')} />
            </Step>
        );
    }
    const connecting = busy === 'connect';
    return (
        <Step n={2} title={t('settings.messaging.step2.title')}>
            <Row gap="sm" align="center" stack>
                <Stack flex={1}>
                    <TextField
                        value={token}
                        onChangeText={setToken}
                        placeholder={t.bare('settings.messaging.tokenPlaceholder')}
                        accessibilityLabel={t('settings.messaging.tokenLabel')}
                        accessibilityHint={t('settings.messaging.tokenPlaceholder')}
                        secret
                        disabled={busy !== null}
                        returnKeyType="done"
                        onSubmitEditing={submit}
                        testID="messaging-token"
                    />
                </Stack>
                <Button
                    variant="primary"
                    label={t(connecting ? 'settings.messaging.connecting' : 'settings.messaging.connect')}
                    busy={connecting}
                    disabled={busy !== null || !token.trim()}
                    onPress={submit}
                    testID="messaging-connect"
                />
            </Row>
            {connecting ? <Hint>{t('settings.messaging.connectingHint')}</Hint> : null}
        </Step>
    );
}

/** The bridge as the PC answered, with its buttons; a button the PC refuses this phone keeps the PC-only pattern. */
function StatusView({ s }: { s: DiscordStatus }) {
    const t = useT();
    const seed = useContext(SeedDiscord);
    const action = useDiscordAction();
    const connector = useConnectDiscord();
    const [detailOpen, setDetailOpen] = useState(false);
    const wasPairing = useRef(false);
    const [justPaired, setJustPaired] = useState(useContext(SeedJustPaired));
    const [botPublic, setBotPublic] = useState(!!seed?.botPublic);
    const [confirmDisconnect, setConfirmDisconnect] = useState(!!seed?.confirmDisconnect);
    const [pcRefused, setPcRefused] = useState(!!seed?.refused);
    const [failure, setFailure] = useState<{ text: string; detail?: string } | null>(null);
    useEffect(() => {
        if (wasPairing.current && s.paired && s.state === 'connected') setJustPaired(true);
        wasPairing.current = s.state === 'pairing';
    }, [s.paired, s.state]);

    const routeRefused: Record<DiscordAction | 'connect', boolean> = {
        connect: useDeviceRefused('POST', ENDPOINTS.messagingDiscordConnect),
        start: useDeviceRefused('POST', ENDPOINTS.messagingDiscordStart),
        takeOver: useDeviceRefused('POST', ENDPOINTS.messagingDiscordStart),
        stop: useDeviceRefused('POST', ENDPOINTS.messagingDiscordStop),
        restart: useDeviceRefused('POST', ENDPOINTS.messagingDiscordRestart),
        forgetAlways: useDeviceRefused('POST', ENDPOINTS.messagingDiscordForgetAlways),
        pair: useDeviceRefused('POST', ENDPOINTS.messagingDiscordPair),
        disconnect: useDeviceRefused('POST', ENDPOINTS.messagingDiscordDisconnect),
    };
    const refused = (what: DiscordAction | 'connect') => pcRefused || routeRefused[what];
    const busy: Busy = connector.isPending ? 'connect' : action.isPending ? (action.variables ?? null) : null;

    // The PC's own words go on the detail line under our sentence; a typed token never reaches them.
    const failed = (err: unknown) => {
        if (isPcRefusal(err)) {
            setPcRefused(true);
            return;
        }
        setFailure(describeHttpFailure(err, t));
    };

    const run = (what: DiscordAction) => {
        setFailure(null);
        setJustPaired(false);
        action.mutate(what, { onError: failed });
    };

    const connect = (token: string) => {
        setFailure(null);
        connector.connect(token).then((r) => setBotPublic(r.connect.bot_public), failed);
    };

    const needsToken = !s.connected || s.state === 'token_invalid' || s.state === 'conflict';
    const pairing = s.connected && !needsToken && (s.state === 'pairing' || (s.state === 'connected' && !s.paired));
    const answering = s.connected && s.paired && s.state === 'connected';
    // A start blocks until the bridge reports in, and the status still reads stopped meanwhile.
    const starting = s.state === 'starting' || busy === 'start' || busy === 'takeOver';
    const fix = fixKey(s);
    const fixAction: DiscordAction = s.state === 'taken_over' ? 'takeOver' : 'start';
    const fixRefused = fix !== null && refused(fixAction);
    const explain = s.state === 'stopped' && s.autostart && !fixRefused ? 'settings.messaging.state.crashed' : explainKey(s);
    const problem = PROBLEMS.has(s.state) || (s.state === 'stopped' && s.autostart);
    const fixIcon = fix === 'settings.messaging.takeOver' ? Zap : fix === 'settings.messaging.retry' ? RefreshCw : Play;
    const anyRefused = pcRefused || Object.values(routeRefused).some(Boolean);

    return (
        <Stack gap="md">
            {!s.connected ? <Pitch /> : null}

            {explain && s.connected && !starting ? (
                <Stack gap="xs">
                    <Notice tone={problem ? 'warning' : 'info'} message={t(explain)} testID="messaging-state" />
                    {fix === null ? null : fixRefused ? (
                        <PcAction id="fix" label={t(fix)} icon={fixIcon} />
                    ) : (
                        <Row>
                            <Button variant="primary" icon={fixIcon} label={t(fix)} disabled={busy !== null} onPress={() => run(fixAction)} testID="messaging-fix" />
                        </Row>
                    )}
                    {SHOW_DETAIL.has(s.state) && s.detail ? (
                        <Disclosure title={t('mobileApp.settings.privacy.details')} open={detailOpen} onToggle={() => setDetailOpen((o) => !o)}>
                            <Text role="label" tone="secondary" dir="auto" selectable>
                                {s.detail}
                            </Text>
                        </Disclosure>
                    ) : null}
                </Stack>
            ) : null}
            {!s.connected && s.state === 'conflict' ? <Notice tone="warning" message={t('settings.messaging.state.conflict')} /> : null}

            {s.connected && starting ? (
                <Row gap="sm">
                    <Spinner size="sm" />
                    <Hint>{t('settings.messaging.starting')}</Hint>
                </Row>
            ) : null}

            {needsToken ? (
                <Stack gap="lg">
                    <CreateBotStep portalUrl={s.portal_url} />
                    <TokenStep busy={busy} refused={refused('connect')} onConnect={connect} />
                </Stack>
            ) : null}

            {pairing ? (
                <Stack gap="lg">
                    <Hint>{t('settings.messaging.pairingLede')}</Hint>
                    <AddBotStep inviteUrl={s.invite_url} />
                    <DmStep s={s} />
                    {botPublic && s.bot_page_url ? (
                        <Stack gap="xs">
                            <Notice tone="info" message={t('settings.messaging.publicTip', { label: PORTAL.publicBot })} testID="messaging-public-tip" />
                            <Row>
                                <LinkButton url={s.bot_page_url} label={t('settings.messaging.openBotPage')} />
                            </Row>
                        </Stack>
                    ) : null}
                    {s.state === 'connected' && !s.paired ? (
                        refused('pair') ? (
                            <PcAction id="show-code" label={t('settings.messaging.showCode')} icon={Link2} />
                        ) : (
                            <Row>
                                <Button variant="primary" icon={Link2} label={t('settings.messaging.showCode')} busy={busy === 'pair'} disabled={busy !== null} onPress={() => run('pair')} testID="messaging-show-code" />
                            </Row>
                        )
                    ) : null}
                </Stack>
            ) : null}

            {answering ? (
                <Stack gap="sm">
                    {justPaired ? (
                        <Text role="label" tone="success" accessibilityRole="alert">
                            {t('settings.messaging.paired')}
                        </Text>
                    ) : null}
                    <Row gap="sm" align="start">
                        <StatusDot tone="success" label={t('settings.messaging.paired')} />
                        <Stack gap="xs" flex={1}>
                            <Text role="ui" weight="semibold">
                                {t('settings.messaging.answering', { owner: s.owner_name, bot: s.bot_name })}
                            </Text>
                            {s.model ? (
                                <Text role="caption" tone="secondary">
                                    <Ltr>{s.model}</Ltr>
                                </Text>
                            ) : null}
                        </Stack>
                    </Row>
                    <Hint>{t('mobileApp.settings.messaging.answeringHint')}</Hint>
                    <Row gap="sm" wrap>
                        {s.bot_profile_url ? (
                            <LinkButton url={s.bot_profile_url} label={t.bare('settings.messaging.openInDiscord')} accessibilityLabel={t('settings.messaging.openInDiscord')} primary />
                        ) : null}
                        {(['stop', 'restart', 'pair'] as const).map((what) =>
                            refused(what) ? null : (
                                <Button
                                    key={what}
                                    size="sm"
                                    label={t.bare(ANSWERING_KEYS[what])}
                                    accessibilityLabel={t(ANSWERING_KEYS[what])}
                                    busy={busy === what}
                                    disabled={busy !== null}
                                    onPress={() => run(what)}
                                    testID={`messaging-${what}`}
                                />
                            ),
                        )}
                    </Row>
                    {refused('stop') ? <PcAction id="stop" label={t('settings.messaging.stop')} icon={Square} /> : null}
                    {refused('restart') ? <PcAction id="restart" label={t('settings.messaging.restart')} icon={RotateCw} /> : null}
                    {refused('pair') ? <PcAction id="pair-other" label={t('settings.messaging.pairOther')} icon={Link2} /> : null}
                </Stack>
            ) : null}

            {s.connected && s.always_allowed.length > 0 ? (
                <Stack gap="xs">
                    <Text role="label">{t('settings.messaging.alwaysAllowed')}</Text>
                    {s.always_allowed.map((label) => (
                        <Text key={label} role="label" tone="secondary" dir="auto">
                            {`• ${label}`}
                        </Text>
                    ))}
                    {refused('forgetAlways') ? (
                        <PcAction id="forget-always" label={t('settings.messaging.forgetAlways')} icon={RefreshCw} />
                    ) : (
                        <Row>
                            <Button
                                size="sm"
                                label={t('settings.messaging.forgetAlways')}
                                busy={busy === 'forgetAlways'}
                                disabled={busy !== null}
                                onPress={() => run('forgetAlways')}
                                testID="messaging-forget-always"
                            />
                        </Row>
                    )}
                </Stack>
            ) : null}

            {failure ? <Notice tone="danger" message={failure.text} detail={failure.detail} testID="messaging-action-failed" /> : null}

            {s.connected ? (
                refused('disconnect') ? (
                    <PcAction
                        id="disconnect"
                        label={t('settings.messaging.disconnect')}
                        icon={Trash2}
                        note={t('settings.messaging.disconnectBody')}
                    />
                ) : (
                    <Stack gap="md">
                        <Divider />
                        <Row>
                            <Button
                                variant="danger"
                                label={t('settings.messaging.disconnect')}
                                busy={busy === 'disconnect'}
                                disabled={busy !== null}
                                onPress={() => setConfirmDisconnect(true)}
                                testID="messaging-disconnect"
                            />
                        </Row>
                    </Stack>
                )
            ) : null}

            {anyRefused ? <PcOnly /> : null}

            <ConfirmSheet
                open={confirmDisconnect && s.connected}
                title={t('settings.messaging.disconnectTitle')}
                body={[t('settings.messaging.disconnectBody')]}
                confirmLabel={t('settings.messaging.disconnect')}
                cancelLabel={t('settings.messaging.cancel')}
                danger
                onConfirm={() => {
                    setConfirmDisconnect(false);
                    run('disconnect');
                }}
                onCancel={() => setConfirmDisconnect(false)}
            />
        </Stack>
    );
}

/** The load failure as one sentence; an unreachable PC is named, never its address. */
function loadFailedText(t: Translate, error: unknown): string {
    return t.compose((say) => {
        const inner =
            error instanceof GaiaNetworkError
                ? say('mobileApp.pairing.off.title')
                : error instanceof GaiaError
                  ? say(error.messageKey, error.params)
                  : error instanceof Error
                    ? error.message
                    : String(error);
        return say('settings.messaging.loadFailed', { error: inner });
    });
}

/** Settings > Messaging: the Discord bridge GAIA answers through, set up and run from the phone where the PC allows it. */
export default function Messaging() {
    const t = useT();
    const readRefused = useDeviceRefused('GET', ENDPOINTS.messagingDiscord);
    const status = useDiscordStatus(!readRefused);
    const refused = readRefused || (status.error instanceof GaiaApiError && status.error.status === 403);
    const s = status.data;

    return (
        <Stack gap="lg" padding="lg">
            <Card accessibilityLabel={t('settings.messaging.discord')}>
                <Stack gap="md">
                    <Row gap="sm" justify="between" wrap>
                        <Text role="ui" weight="semibold" accessibilityRole="header">
                            {t('settings.messaging.discord')}
                        </Text>
                        {s?.connected && s.bot_name ? (
                            <Text role="label" tone="secondary">
                                {t('settings.messaging.botIs')} <Text dir="auto">{s.bot_name}</Text>
                            </Text>
                        ) : null}
                    </Row>
                    {s ? (
                        <StatusView s={s} />
                    ) : refused ? (
                        <Refused />
                    ) : status.error ? (
                        <Notice
                            tone="danger"
                            message={loadFailedText(t, status.error)}
                            action={{ label: t('settings.messaging.retry'), onPress: () => void status.refetch() }}
                            testID="messaging-load-failed"
                        />
                    ) : (
                        <Row gap="sm">
                            <Spinner size="sm" />
                            <Hint>{t('settings.loading')}</Hint>
                        </Row>
                    )}
                </Stack>
            </Card>
        </Stack>
    );
}
