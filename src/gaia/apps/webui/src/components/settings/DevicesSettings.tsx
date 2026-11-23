// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Hourglass } from 'lucide-react';
import QRCode from 'qrcode';
import { useT } from '../../i18n/useT';
import type { Translate } from '../../i18n/translator';
import { pluralKey, ref, type MessageKey, type MessageRef } from '../../i18n/registry';
import { ApiError } from '../../services/api';
import {
    allowDevice,
    closeDevicePairing,
    openDevicePairing,
    removeDevice,
    getDeviceChanges,
    resetDevicePairing,
    startAwayRoute,
    startDeviceListener,
    stopAwayRoute,
    stopDeviceListener,
    type DeviceChange,
    type DevicePairingOffer,
    type PairedDevice,
} from '../../services/devicesApi';
import { useDeviceStore } from '../../stores/deviceStore';
import { formatCountdown } from '../../utils/permissionPrompts.core';
import { log } from '../../utils/logger';
import { pairingLink } from '../../utils/pairingLink';
import { MarkedText, markLtr } from '../MarkedText';
import { ConfirmSheet } from '../setup/ConfirmSheet';
import { SettingsDisclosure } from './SettingsDisclosure';
import './DevicesSettings.css';

const REASON_KEYS = {
    expired: 'settings.devices.reason.expired',
    used: 'settings.devices.reason.used',
    wrong: 'settings.devices.reason.wrong',
    closed: 'settings.devices.reason.closed',
    rate_limited: 'settings.devices.reason.rateLimited',
} as const;

const ROUTE_ERROR_KEYS = {
    no_tailscale_address: 'settings.devices.tailnetMissing',
} as const;

const PLATFORM_KEYS = {
    ios: 'settings.devices.platform.ios',
    ipados: 'settings.devices.platform.ipados',
    android: 'settings.devices.platform.android',
} as const;

/** Each change kind the server sends: its message, and the params that message fills in. */
const CHANGE_KINDS = {
    providerKeySet: ['settings.devices.change.providerKeySet', ['provider']],
    providerKeyRemoved: ['settings.devices.change.providerKeyRemoved', ['provider']],
    gatewayChanged: ['settings.devices.change.gatewayChanged', ['provider']],
    localOnlyOff: ['settings.devices.change.localOnlyOff', []],
    localOnlyOn: ['settings.devices.change.localOnlyOn', []],
    agentInstalled: ['settings.devices.change.agentInstalled', []],
    npuMemlockFixed: ['settings.devices.change.npuMemlockFixed', []],
    folderAdded: ['settings.devices.change.folderAdded', ['folder']],
    imageSettingsChanged: ['settings.devices.change.imageSettingsChanged', ['model']],
    folderRemoved: ['settings.devices.change.folderRemoved', ['folder']],
    skillAdded: ['settings.devices.change.skillAdded', ['name']],
    skillAddedCode: ['settings.devices.change.skillAddedCode', ['name']],
    connectorSetup: ['settings.devices.change.connectorSetup', ['connector']],
    discordPaired: ['settings.devices.change.discordPaired', ['account']],
    memoryWiped: ['settings.devices.change.memoryWiped', []],
    profileScanOn: ['settings.devices.change.profileScanOn', []],
    profileScanOff: ['settings.devices.change.profileScanOff', []],
    pairingClosed: ['settings.devices.change.pairingClosed', []],
    chatPermissionsAsk: ['settings.devices.change.chatPermissionsAsk', []],
    chatPermissionsFull: ['settings.devices.change.chatPermissionsFull', []],
    connectorRemoved: ['settings.devices.change.connectorRemoved', ['connector']],
    gitCommitted: ['settings.devices.change.gitCommitted', ['folder']],
    gitPullRequest: ['settings.devices.change.gitPullRequest', ['folder']],
    goalApproved: ['settings.devices.change.goalApproved', []],
    goalRejected: ['settings.devices.change.goalRejected', []],
    scheduleCreated: ['settings.devices.change.scheduleCreated', ['name']],
    scheduleResumed: ['settings.devices.change.scheduleResumed', ['name']],
    scheduleRun: ['settings.devices.change.scheduleRun', ['name']],
    spendingAllowedMonth: ['settings.devices.change.spendingAllowedMonth', []],
    spendingLimitCleared: ['settings.devices.change.spendingLimitCleared', []],
    spendingLimitSet: ['settings.devices.change.spendingLimitSet', ['limit']],
    undoLimitsChanged: ['settings.devices.change.undoLimitsChanged', ['days', 'mb']],
} as const satisfies Record<string, readonly [MessageKey, readonly string[]]>;

const CHANGES_PAGE = 20;
const CHANGES_ALL = 200;
const warnedKinds = new Set<string>();

const GPU_MEMORY_ACTIONS = {
    gpuMemoryApply: 'settings.devices.change.gpuMemoryApply',
    gpuMemoryRevert: 'settings.devices.change.gpuMemoryRevert',
} as const;

const DISCORD_ACTIONS = {
    start: 'settings.devices.change.discord.start',
    takeOver: 'settings.devices.change.discord.takeOver',
    stop: 'settings.devices.change.discord.stop',
    restart: 'settings.devices.change.discord.restart',
    forgetAlways: 'settings.devices.change.discord.forgetAlways',
    connect: 'settings.devices.change.discord.connect',
    pair: 'settings.devices.change.discord.pair',
    disconnect: 'settings.devices.change.discord.disconnect',
} as const;

/** True the first time an id is seen, so each unknown kind logs once. */
function firstSight(id: string): boolean {
    if (warnedKinds.has(id)) return false;
    warnedKinds.add(id);
    return true;
}

const present = (v: unknown): v is string | number => (typeof v === 'string' && v !== '') || typeof v === 'number';

/** A change's label: its params are values, each kept left to right; a kind or variant this app lacks reads as a generic change. */
function changeWhat(c: DeviceChange): { what: MessageRef; unknownKind?: string } {
    const generic = { what: ref('settings.devices.change.unknown'), unknownKind: c.kind };
    const p = c.params ?? {};
    const val = (name: string): string => markLtr(String(p[name]));
    const missing = (name: string) => {
        log.ui.error(`A device change of kind ${c.kind} came without ${name}`);
        return generic;
    };
    const connectorAgent = (key: MessageKey) => {
        if (!present(p.connector)) return missing('connector');
        const agent = present(p.agent) ? p.agent : p.agent_id;
        if (!present(agent)) return missing('agent');
        return { what: ref(key, { agent: markLtr(String(agent)), connector: val('connector') }) };
    };
    switch (c.kind) {
        case 'connectorGrant':
            return connectorAgent(p.granted === false ? 'settings.devices.change.connectorGrantRemoved' : 'settings.devices.change.connectorGrant');
        case 'connectorActivation':
            if (typeof p.active !== 'boolean') return missing('active');
            return connectorAgent(p.active ? 'settings.devices.change.connectorActivation' : 'settings.devices.change.connectorDeactivation');
        case 'connectorEnable':
        case 'connectorDisable':
            if (!present(p.connector)) return missing('connector');
            return { what: ref(c.kind === 'connectorEnable' ? 'settings.devices.change.connectorEnable' : 'settings.devices.change.connectorDisable', { connector: val('connector') }) };
        case 'discordControl': {
            const key = typeof p.action === 'string' && Object.prototype.hasOwnProperty.call(DISCORD_ACTIONS, p.action)
                ? DISCORD_ACTIONS[p.action as keyof typeof DISCORD_ACTIONS] : undefined;
            if (!key) {
                if (firstSight(`discordControl:${String(p.action)}`)) log.ui.warn(`A Discord device change with an action this app has no label for: ${String(p.action)}`);
                return generic;
            }
            return { what: ref(key) };
        }
        case 'gpuMemoryChanged': {
            const key = typeof p.action === 'string' && Object.prototype.hasOwnProperty.call(GPU_MEMORY_ACTIONS, p.action)
                ? GPU_MEMORY_ACTIONS[p.action as keyof typeof GPU_MEMORY_ACTIONS] : undefined;
            if (!key) {
                if (firstSight(`gpuMemoryChanged:${String(p.action)}`)) log.ui.warn(`A GPU memory change with an action this app has no label for: ${String(p.action)}`);
                return generic;
            }
            return { what: ref(key) };
        }
        case 'memoryCommit': {
            const count = p.count;
            if (typeof count !== 'number' || !Number.isFinite(count)) return missing('count');
            if (p.source !== 'discovery' && p.source !== 'inference') {
                if (firstSight(`memoryCommit:${String(p.source)}`)) log.ui.warn(`A memory change with a source this app has no label for: ${String(p.source)}`);
                return generic;
            }
            const base = p.source === 'discovery' ? 'settings.devices.change.memoryCommitDiscovery' : 'settings.devices.change.memoryCommitInference';
            return { what: ref(pluralKey(base, count), { count: markLtr(String(count)) }) };
        }
        case 'permissionsDefault':
            if (p.mode === 'ask') return { what: ref('settings.devices.change.permissionsDefaultAsk') };
            if (p.mode === 'full_access') return { what: ref('settings.devices.change.permissionsDefaultFull') };
            if (present(p.mode) && firstSight(`permissionsDefault:${String(p.mode)}`)) log.ui.warn(`A permission change with a mode this app has no label for: ${String(p.mode)}`);
            return { what: ref('settings.devices.change.permissionsDefault') };
        case 'serverTarget':
            return { what: ref(p.mode === 'gaia' ? 'settings.devices.change.serverTargetGaia' : 'settings.devices.change.serverTarget') };
        case 'deviceRemoved':
            return present(p.device)
                ? { what: ref('settings.devices.change.deviceRemoved', { device: val('device') }) }
                : { what: ref('settings.devices.change.deviceRemovedUnnamed') };
    }
    if (!(c.kind in CHANGE_KINDS)) {
        if (firstSight(c.kind)) log.ui.warn(`A device change of a kind this app has no label for: ${c.kind}`);
        return generic;
    }
    const [key, names] = CHANGE_KINDS[c.kind as keyof typeof CHANGE_KINDS] as readonly [MessageKey, readonly string[]];
    const params: Record<string, string> = {};
    for (const name of names) {
        const value = p[name];
        if (value === null || value === undefined) return missing(name);
        params[name] = markLtr(String(value));
    }
    return { what: ref(key, params) };
}

type ChangesState =
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'ready'; changes: DeviceChange[]; total: number };

/** What one device changed on this PC, read when the section opens. */
function DeviceChanges({ device, now }: { device: PairedDevice; now: number }) {
    const t = useT();
    const [opened, setOpened] = useState(false);
    const [limit, setLimit] = useState(CHANGES_PAGE);
    const [state, setState] = useState<ChangesState>({ phase: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const count = device.changes_count ?? 0;

    useEffect(() => {
        if (!opened) return;
        let live = true;
        getDeviceChanges(device.id, limit)
            .then((list) => { if (live) setState({ phase: 'ready', changes: list.changes, total: list.total }); })
            .catch((err: unknown) => {
                log.api.error('Reading what a device changed failed', err);
                if (live) setState({ phase: 'error', message: errorText(err) });
            });
        return () => { live = false; };
    }, [opened, device.id, limit, attempt, count]);

    return (
        <div className="devices-changes">
            <SettingsDisclosure title={t('settings.devices.changesTitle', { n: count })} onToggle={(open) => { if (open) setOpened(true); }}>
                {state.phase === 'loading' && <p className="settings-hint" role="status">{t('settings.loading')}</p>}
                {state.phase === 'error' && (
                    <div className="settings-field">
                        <p className="settings-error" role="alert">{t('settings.devices.changesLoadFailed', { error: state.message })}</p>
                        <div className="settings-row">
                            <button type="button" className="btn-secondary" onClick={() => { setState({ phase: 'loading' }); setAttempt((n) => n + 1); }}>
                                {t('settings.devices.changesRetry')}
                            </button>
                        </div>
                    </div>
                )}
                {state.phase === 'ready' && state.changes.length === 0 && <p className="settings-hint">{t('settings.devices.changesNone')}</p>}
                {state.phase === 'ready' && state.changes.length > 0 && (
                    <>
                        <ul className="devices-list devices-change-list">
                            {state.changes.map((c) => {
                                const { what, unknownKind } = changeWhat(c);
                                return (
                                    <li key={c.id} className="devices-change">
                                        <span><MarkedText text={t('settings.devices.changeRow', { what, when: ago(c.at, now) })} /></span>
                                        {unknownKind && <span className="settings-hint devices-change-kind"><bdi dir="ltr">{unknownKind}</bdi></span>}
                                    </li>
                                );
                            })}
                        </ul>
                        {state.total > state.changes.length && limit < CHANGES_ALL && (
                            <div className="settings-row">
                                <button type="button" className="btn-secondary" onClick={() => { setState({ phase: 'loading' }); setLimit(CHANGES_ALL); }}>
                                    {t('settings.devices.changesShowAll')}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </SettingsDisclosure>
        </div>
    );
}

function errorText(err: unknown): string {
    if (err instanceof ApiError) return err.detail || err.message;
    return err instanceof Error ? err.message : String(err);
}

/** A code from the API the catalog doesn't map is contract drift: show it raw and say so in the log. */
function mapped<K extends string>(table: Record<K, string>, code: string, t: Translate, what: string): string {
    if (code in table) return t(table[code as K] as MessageKey);
    log.ui.error(`Unmapped device ${what} from the API: ${code}`);
    return code;
}

/** Like `mapped`, but a ref for a `t()` param, so the outer sentence glosses it once. */
function mappedRef<K extends string>(table: Record<K, string>, code: string, what: string): MessageRef | string {
    if (code in table) return ref(table[code as K] as MessageKey);
    log.ui.error(`Unmapped device ${what} from the API: ${code}`);
    return code;
}

export const platformName = (platform: string) => mappedRef(PLATFORM_KEYS, platform, 'platform');

function ago(iso: string, now: number): MessageRef {
    const secs = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
    if (secs < 60) return ref('time.justNow');
    const mins = Math.floor(secs / 60);
    if (mins < 60) return ref('time.minutesAgo', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return ref('time.hoursAgo', { n: hrs });
    return ref('time.daysAgo', { n: Math.floor(hrs / 24) });
}

const secondsLeft = (deadlineMs: number, now: number) => Math.max(0, Math.ceil((deadlineMs - now) / 1000));

function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [active]);
    return now;
}

/** The pairing code as a QR image, the theme's ink on its paper, as Mobile access draws its code. */
function PairingQr({ offer }: { offer: DevicePairingOffer }) {
    const t = useT();
    const [src, setSrc] = useState<string | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        // The raster needs literal colors: read the tokens as they resolve now.
        const css = getComputedStyle(document.documentElement);
        const ink = css.getPropertyValue('--text-primary').trim();
        const paper = css.getPropertyValue('--bg-primary').trim();
        if (!ink || !paper) {
            log.ui.error('Pairing QR code skipped: --text-primary/--bg-primary did not resolve; styles/index.css must load first.');
            setFailed('--text-primary/--bg-primary');
            return;
        }
        QRCode.toDataURL(JSON.stringify(offer), { width: 200, margin: 2, color: { dark: ink, light: paper } })
            .then((url: string) => { if (live) setSrc(url); })
            .catch((err: unknown) => {
                log.ui.error('Pairing QR code could not be drawn', err);
                if (live) setFailed(errorText(err));
            });
        return () => { live = false; };
    }, [offer]);
    if (failed) return <p className="settings-error" role="alert">{failed}</p>;
    return <div className="devices-qr">{src && <img src={src} width={200} height={200} alt={t('settings.devices.qrAlt')} />}</div>;
}

type Confirm = { kind: 'remove'; device: PairedDevice } | { kind: 'reset' };

/** Settings > Phones and tablets: let paired devices connect over the home network, pair, allow and remove them. */
export function DevicesSettings() {
    const t = useT();
    const { status, devices, loadError, refresh, setStatus } = useDeviceStore();
    const [offer, setOffer] = useState<DevicePairingOffer | null>(null);
    const [expired, setExpired] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<Confirm | null>(null);
    const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

    useEffect(() => { void refresh(); }, [refresh]);

    const pending = devices.filter((d) => d.status === 'pending');
    const allowed = devices.filter((d) => d.status === 'allowed');
    const now = useNow(offer !== null || pending.length > 0);
    const listening = status?.listening === true;
    // Left on before this PC had a home network: the switch stays on, and the backend starts it on its own.
    const waiting = status?.waiting_for_home === true;

    // The window closes on the first pairing (or on the PC's Cancel): the code must vanish with it.
    useEffect(() => {
        if (offer && status && !status.pairing_open) setOffer(null);
    }, [offer, status]);
    useEffect(() => {
        if (offer && secondsLeft(offer.exp * 1000, now) === 0) {
            setOffer(null);
            setExpired(true);
        }
    }, [offer, now]);

    // A copied or failed notice belongs to one code.
    useEffect(() => setCopied(null), [offer]);
    useEffect(() => {
        if (copied !== 'ok') return;
        const timer = setTimeout(() => setCopied(null), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    const act = useCallback(async (run: () => Promise<unknown>) => {
        setBusy(true);
        setActionError(null);
        try {
            await run();
        } catch (err) {
            log.ui.error('Device action failed', err);
            setActionError(errorText(err));
        } finally {
            setBusy(false);
            await refresh();
        }
    }, [refresh]);

    const tailnet = status?.routes?.find((r) => r.kind === 'tailnet');
    const toggleTailnet = () => act(async () => {
        setStatus(await (tailnet?.on ? stopAwayRoute('tailnet') : startAwayRoute('tailnet')));
    });

    useEffect(() => {
        if (!waiting) return;
        const timer = setInterval(() => void refresh(), 5000);
        return () => clearInterval(timer);
    }, [waiting, refresh]);

    const toggle = () => act(async () => {
        if (listening) setOffer(null);
        setStatus(await (listening || waiting ? stopDeviceListener() : startDeviceListener()));
    });
    const pair = () => act(async () => {
        setExpired(false);
        const opened = await openDevicePairing();
        // In the same render as the code, or the closed-window effect clears it before the refresh lands.
        if (status) setStatus({ ...status, pairing_open: true, pairing_expires_at: new Date(opened.exp * 1000).toISOString() });
        setOffer(opened);
    });
    const copyLink = (current: DevicePairingOffer) => {
        navigator.clipboard.writeText(pairingLink(current)).then(
            () => setCopied('ok'),
            (err: unknown) => {
                log.ui.error('Pairing link could not be copied', err);
                setCopied('failed');
            },
        );
    };
    const cancelPairing = () => act(async () => {
        setOffer(null);
        setStatus(await closeDevicePairing());
    });

    if (!status) {
        return (
            <div className="settings-pane">
                <h2 className="settings-pane-title">{t('settings.section.devices')}</h2>
                {loadError ? <p className="settings-error" role="alert">{loadError}</p> : <p className="settings-hint">{t('settings.loading')}</p>}
            </div>
        );
    }

    const connectLabel = t('settings.devices.connect');
    const listenError = waiting ? null : status.error_code === 'port_in_use'
        ? t('settings.devices.portInUse', { port: markLtr(String(status.port)) })
        : status.error_code ? t('settings.devices.listenFailed', { detail: status.error_detail ?? status.error_code }) : null;
    const failed = status.failed_redemptions ?? [];

    return (
        <div className="settings-pane devices-pane">
            <h2 className="settings-pane-title">{t('settings.section.devices')}</h2>
            <p className="settings-pane-lede">{t('settings.devices.lede')}</p>

            <section className="settings-card" aria-label={connectLabel}>
                <div>
                    <label className="setting-row">
                        <strong>{connectLabel}</strong>
                        <span className="toggle-switch">
                            <input
                                type="checkbox"
                                role="switch"
                                checked={listening || waiting}
                                aria-describedby="devices-connect-hint"
                                onChange={() => void toggle()}
                                aria-busy={busy}
                            />
                            <span className="toggle-track" />
                        </span>
                    </label>
                    <p className="settings-hint" id="devices-connect-hint">{t('settings.devices.connectHint')}</p>
                </div>
                {waiting && (
                    <div className="devices-waiting" role="status">
                        <Hourglass size={16} aria-hidden="true" className="devices-row-icon" />
                        <div>
                            <p className="settings-note">{t('settings.devices.waitingForHome')}</p>
                            <p className="settings-hint">{t('settings.devices.waitingForHomeHint')}</p>
                        </div>
                    </div>
                )}
                {listenError && <p className="settings-error" role="alert"><MarkedText text={listenError} /></p>}
                {tailnet && (
                    <div>
                        <label className="setting-row">
                            <strong>{t('settings.devices.tailnet')}</strong>
                            <span className="toggle-switch">
                                <input
                                    type="checkbox"
                                    role="switch"
                                    checked={tailnet.on}
                                    disabled={!listening}
                                    aria-describedby="devices-tailnet-hint"
                                    onChange={() => void toggleTailnet()}
                                    aria-busy={busy}
                                />
                                <span className="toggle-track" />
                            </span>
                        </label>
                        <p className="settings-hint" id="devices-tailnet-hint">
                            {tailnet.on && tailnet.origin
                                ? <MarkedText text={t('settings.devices.tailnetOnHint', { address: markLtr(new URL(tailnet.origin).hostname) })} />
                                : t('settings.devices.tailnetHint')}
                        </p>
                        {tailnet.error_code && (
                            <p className="settings-error" role="alert">{mapped(ROUTE_ERROR_KEYS, tailnet.error_code, t, 'route error')}</p>
                        )}
                    </div>
                )}
            </section>

            <section className="settings-card" aria-label={t('settings.devices.pair')}>
                {!offer && (
                    <div className="settings-field">
                        <div className="settings-row">
                            <button type="button" className="btn-primary" disabled={!listening || busy} onClick={() => void pair()}>
                                {expired ? t('settings.devices.newCode') : t('settings.devices.pair')}
                            </button>
                        </div>
                        {expired && <p className="settings-hint" role="status">{t('settings.devices.expired')}</p>}
                        {!listening && !waiting && <p className="settings-hint">{t('settings.devices.pairOffHint', { label: connectLabel })}</p>}
                    </div>
                )}
                {offer && (
                    <div className="devices-pairing">
                        <PairingQr offer={offer} />
                        <div className="settings-field">
                            <p className="settings-note">{t('settings.devices.scan')}</p>
                            <p className="settings-hint">
                                <MarkedText text={t('settings.devices.expiresIn', { time: markLtr(formatCountdown(secondsLeft(offer.exp * 1000, now))) })} />
                            </p>
                            <div className="settings-row">
                                <button type="button" className="btn-secondary" onClick={() => copyLink(offer)}>
                                    {copied === 'ok' ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                                    {copied === 'ok' ? t('settings.messaging.copied') : t('settings.devices.copyLink')}
                                </button>
                                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void cancelPairing()}>
                                    {t('settings.devices.cancel')}
                                </button>
                            </div>
                            <p className="settings-hint">
                                <MarkedText text={t('settings.devices.linkHint', { time: markLtr(formatCountdown(secondsLeft(offer.exp * 1000, now))) })} />
                            </p>
                            {copied === 'failed' && <p className="settings-error" role="alert">{t('settings.devices.copyLinkFailed')}</p>}
                        </div>
                    </div>
                )}
            </section>

            {pending.length > 0 && (
                <section className="settings-card" aria-labelledby="devices-waiting-title">
                    <h3 className="settings-label" id="devices-waiting-title">{t('settings.devices.waitingTitle')}</h3>
                    <ul className="devices-list" role="status">
                        {pending.map((d) => (
                            <li key={d.id} className="devices-row" data-device-id={d.id}>
                                <Hourglass size={16} aria-hidden="true" className="devices-row-icon" />
                                <div className="devices-row-text">
                                    <span className="devices-name"><bdi>{d.name}</bdi></span>
                                    <span className="settings-hint">
                                        {t('settings.devices.pairedAt', { platform: platformName(d.platform), when: ago(d.created_at, now) })}
                                        {d.expires_at && (
                                            <> · <span className="perm-card-timer" title={t('prompt.timer')}><MarkedText text={t('countdown.left', { time: markLtr(formatCountdown(secondsLeft(Date.parse(d.expires_at), now))) })} /></span></>
                                        )}
                                    </span>
                                </div>
                                <div className="devices-row-actions">
                                    <button type="button" className="btn-primary" disabled={busy} aria-label={t('settings.devices.allowAria', { name: d.name })} onClick={() => void act(() => allowDevice(d.id))}>
                                        {t('settings.devices.allow')}
                                    </button>
                                    <button type="button" className="btn-secondary" disabled={busy} aria-label={t('settings.devices.denyAria', { name: d.name })} onClick={() => void act(() => removeDevice(d.id))}>
                                        {t('settings.devices.deny')}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <p className="settings-hint">{t('settings.devices.waitingHint')}</p>
                </section>
            )}

            <section className="settings-card" aria-labelledby="devices-paired-title">
                <h3 className="settings-label" id="devices-paired-title">{t('settings.devices.pairedTitle')}</h3>
                {allowed.length === 0 ? (
                    <p className="settings-hint">{t('settings.devices.none')}</p>
                ) : (
                    <ul className="devices-list">
                        {allowed.map((d) => (
                            <li key={d.id} className="devices-row" data-device-id={d.id}>
                                <div className="devices-row-text">
                                    <span className="devices-name"><bdi>{d.name}</bdi></span>
                                    <span className="settings-hint">
                                        {d.last_seen_at
                                            ? t('settings.devices.lastConnected', { platform: platformName(d.platform), when: ago(d.last_seen_at, now) })
                                            : t('settings.devices.neverConnected', { platform: platformName(d.platform) })}
                                    </span>
                                </div>
                                <div className="devices-row-actions">
                                    <button type="button" className="btn-secondary" disabled={busy} aria-label={t('settings.devices.removeAria', { name: d.name })} onClick={() => setConfirm({ kind: 'remove', device: d })}>
                                        {t('settings.devices.remove')}
                                    </button>
                                </div>
                                <DeviceChanges device={d} now={now} />
                            </li>
                        ))}
                    </ul>
                )}
                {allowed.length > 0 && !listening && <p className="settings-hint">{t('settings.devices.offHint', { label: connectLabel })}</p>}
                <p className="settings-hint">{t.plural('settings.devices.autoRemove', status.idle_expiry_days)}</p>
            </section>

            {failed.length > 0 && (
                <section className="settings-card" aria-labelledby="devices-failed-title">
                    <h3 className="settings-label" id="devices-failed-title">{t('settings.devices.failedTitle')}</h3>
                    <ul className="devices-list">
                        {failed.map((f) => (
                            <li key={`${f.at}-${f.address}-${f.reason}`} className="devices-failed">
                                <AlertTriangle size={14} aria-hidden="true" />
                                <span>
                                    <MarkedText text={t('settings.devices.failedRow', {
                                        when: ago(f.at, now),
                                        reason: mappedRef(REASON_KEYS, f.reason, 'failure reason'),
                                        address: markLtr(f.address),
                                    })} />
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="settings-card" aria-label={t('settings.devices.reset')}>
                <div className="settings-row">
                    <button type="button" className="btn-danger" disabled={busy} onClick={() => setConfirm({ kind: 'reset' })}>
                        {t('settings.devices.reset')}
                    </button>
                </div>
                <p className="settings-hint">{t('settings.devices.resetHint')}</p>
            </section>

            {actionError && <p className="settings-error" role="alert">{actionError}</p>}
            <p className="settings-note">{t('settings.devices.browserNote', { label: t('sidebar.mobileAccess') })}</p>

            {confirm?.kind === 'remove' && (
                <ConfirmSheet
                    title={t('settings.devices.removeTitle', { name: confirm.device.name })}
                    confirmLabel={t('settings.devices.remove')}
                    cancelLabel={t('settings.devices.cancel')}
                    danger
                    busy={busy}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => void act(() => removeDevice(confirm.device.id)).then(() => setConfirm(null))}
                >
                    <span>{t('settings.devices.removeBody')}</span>
                    {(confirm.device.changes_count ?? 0) > 0 && (
                        <span>{t.plural('settings.devices.removeHasChanges', confirm.device.changes_count ?? 0)}</span>
                    )}
                </ConfirmSheet>
            )}
            {confirm?.kind === 'reset' && (
                <ConfirmSheet
                    title={t('settings.devices.resetTitle')}
                    confirmLabel={t('settings.devices.resetYes')}
                    cancelLabel={t('settings.devices.cancel')}
                    danger
                    busy={busy}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => void act(async () => { setOffer(null); setStatus(await resetDevicePairing()); }).then(() => setConfirm(null))}
                >
                    {t('settings.devices.resetBody')}
                </ConfirmSheet>
            )}
        </div>
    );
}
