// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { scopeLabel } from '@webui/utils/connectorScopes';
import { isolate, ref } from '@webui/i18n/registry';
import { accountChoices, accountsOf, middleCut, showsAccountList } from '@webui/utils/connectorAccounts';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import type { AgentMcpServer, ConnectorKeyStore, ConnectorRow, UnavailableConnectorRow } from '@/api/client.types';
import { ENDPOINTS } from '@/api/constants';
import { useDeviceRefused } from '@/api/routeAccess';
import {
    CHECK_PROMPT_ACTION,
    useAgentMcps,
    useAgents,
    useChangeConnectorAccess,
    useConnectorActivations,
    useConfigureConnector,
    useConnectorChecks,
    useConnectorGrants,
    useConnectors,
    useConnectorServerAction,
    useRetryKeyStore,
    type ConnectorCheck,
} from '@/data';
import { ApproveOnPcNotice } from '@/features/devices/ApproveOnPcNotice';
import { useDevicePrompt } from '@/features/devices/devicePrompts';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { ChipButton } from '@/features/schedules/ChipButton';
import { isPcRefusal, PcOnlyNotice } from '@/features/settings/PcOnlyNotice';
import { SettingsGroup } from '@/features/skills/SettingsGroup';
import { failureNoticeProps } from '@/features/chat/header/failureText';
import { describeHttpFailure, useDirection, useT } from '@/i18n/useT';
import { openLinkFromPress } from '@/platform/openLink';
import {
    ActionSheet,
    Button,
    Disclosure,
    EmptyState,
    ErrorState,
    Icon,
    IconButton,
    Pressable,
    ListSkeleton,
    Notice,
    Row,
    Screen,
    Spinner,
    Stack,
    Surface,
    Switch,
    Text,
    TextField,
    Ltr,
    useTheme,
    PRESSABLE_MIN_SIZE,
} from '@/ui';
import { lineHeightOf } from '@/ui/text/Text';
import { ChevronDown, ChevronRight, CircleCheck, Ellipsis, ExternalLink, Pause, Play, Trash2 } from '@/ui/icons';

import {
    activatableAgents,
    flagshipAgentId,
    grantAgents,
    MCP_DEFAULT_GRANT_SCOPES,
    nextScopes,
    personalizeRoute,
    personalizeSourceKind,
    scopesForActivation,
    soleMcpAgent,
} from './connectorAccess';
import {
    agentMcpKey,
    connectorDescription,
    disconnectNotice,
    GOOGLE_CONNECTOR_ID,
    groupConnectors,
    isUnavailable,
    MCP_GUIDE_URL,
    SEARCH_ABOVE,
    setupForm,
    tileStatus,
    unavailableHint,
} from './connectorList';
import { BrowserSignInBlock } from './BrowserSignInBlock';
import { AddAccount, ConnectorAccountList } from './ConnectorAccounts';
import { useBrowserSignInAvailable } from './browserSignIn';
import { ConnectorSetupSheet } from './ConnectorSetupSheet';
import { OAuthClientLine } from './OAuthClientLine';
import { DeviceCodeSignIn } from './DeviceCodeSignIn';

type Translator = ReturnType<typeof useT>;

interface ConnectorsBodyProps {
    initialExpanded?: string;
    initialJustConnected?: string;
    /** The connector whose setup sheet starts open. */
    initialSheet?: string;
    initialChecks?: Record<string, ConnectorCheck>;
    /** Whether the screen is focused; the list is re-read during a key store prompt only then. */
    focused?: boolean;
}

export function ConnectorsScreen(props: ConnectorsBodyProps) {
    const t = useT();
    return (
        <Screen scroll header={<ScreenHeader title={t('settings.section.connectors')} />}>
            <ConnectorsBody {...props} />
        </Screen>
    );
}

/** The connector list, for the screen and for the Settings pane. */
export function ConnectorsBody({ initialExpanded, initialJustConnected, initialSheet, initialChecks, focused = true }: ConnectorsBodyProps) {
    const t = useT();
    const connectors = useConnectors(focused);
    const agentMcps = useAgentMcps();
    const checks = useConnectorChecks(initialChecks);
    const [sheetFor, setSheetFor] = useState<string | null>(initialSheet ?? null);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState<string | null>(initialExpanded ?? null);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
    const [notice, setNotice] = useState<string | null>(null);
    const [justConnected, setJustConnected] = useState<string | null>(initialJustConnected ?? null);
    const [seen, setSeen] = useState<unknown>(null);
    const [seenConfigured, setSeenConfigured] = useState<Map<string, boolean | null> | null>(null);

    const rows = connectors.data?.connectors ?? [];
    const servers = agentMcps.data?.agent_mcps ?? [];
    const sheetRow = rows.find((c): c is ConnectorRow => !isUnavailable(c) && c.id === sheetFor);
    const sheetForm = sheetRow ? setupForm(sheetRow) : null;
    const q = query.trim();
    const groups = useMemo(() => groupConnectors(rows, query, t), [rows, query, t]);

    // A connector that turns connected while the list is open gets the one Personalize offer, and its tile opens unless another is being read.
    if (connectors.data && connectors.data !== seen) {
        const before = seenConfigured;
        const now = new Map<string, boolean | null>();
        for (const c of connectors.data.connectors) if ('configured' in c) now.set(c.id, c.configured);
        setSeen(connectors.data);
        setSeenConfigured(now);
        for (const c of connectors.data.connectors) {
            if (!('configured' in c)) continue;
            if (before && before.get(c.id) === false && c.configured) {
                setJustConnected(c.id);
                setExpanded((prev) => prev ?? c.id);
            } else if (!c.configured || ('enabled' in c && c.enabled === false)) {
                setJustConnected((prev) => (prev === c.id ? null : prev));
            }
        }
    }

    // Accounts opens once per visit for a held-back account; folding it then sticks through refetches.
    const [heldOpened, setHeldOpened] = useState(false);
    if (!heldOpened && groups.accounts.some((c) => !!c.key_store)) {
        setHeldOpened(true);
        setOpenGroups((prev) => ({ ...prev, accounts: true }));
    }

    const failure = connectors.error ?? agentMcps.error;
    const loading = connectors.isPending || agentMcps.isPending;
    const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));
    const groupOpen = (id: string, byDefault: boolean) => !!q || (openGroups[id] ?? byDefault);
    const setGroup = (id: string, byDefault: boolean) => () =>
        setOpenGroups((prev) => ({ ...prev, [id]: !(prev[id] ?? byDefault) }));
    const noMatch = !!q && groups.unavailable.length + groups.connected.length + groups.accounts.length + groups.servers.length === 0;

    function renderGroup(id: string, title: string, count: number, byDefault: boolean, hint: string | null, body: ReactNode) {
        if (count === 0) return null;
        return (
            <SettingsGroup
                key={id}
                title={title}
                hint={hint}
                count={count}
                open={groupOpen(id, byDefault)}
                onToggle={setGroup(id, byDefault)}
                headerTestID={`connectors-group-${id}`}
            >
                {body}
            </SettingsGroup>
        );
    }

    const tiles = (list: ConnectorRow[]) =>
        list.map((c) => (
            <ConnectorTile
                key={c.id}
                connector={c}
                expanded={expanded === c.id}
                onToggle={() => toggle(c.id)}
                onDisconnected={setNotice}
                justConnected={justConnected === c.id}
                onPersonalizeStarted={() => setJustConnected(null)}
                check={checks.checks[c.id]}
                onCheck={() => void checks.run(c.id)}
                onClearCheck={() => checks.clear(c.id)}
                onSetup={() => setSheetFor(c.id)}
            />
        ));

    return (
        <>
            <Stack gap="md" paddingX="lg" paddingY="md">
                <Text role="ui" tone="secondary">{t('settings.connectors.lede')}</Text>
                {notice ? <Notice tone="info" message={notice} /> : null}
                {failure ? (
                    <ErrorState
                        title={describeHttpFailure(failure, t).text}
                        detail={describeHttpFailure(failure, t).detail}
                        onRetry={() => {
                            void connectors.refetch();
                            void agentMcps.refetch();
                        }}
                    />
                ) : loading ? (
                    <ListSkeleton rows={6} />
                ) : (
                    <>
                        {connectors.data?.key_store ? (
                            <KeyStoreNotice state={connectors.data.key_store} onSettled={() => void connectors.refetch()} />
                        ) : null}
                        {rows.length > SEARCH_ABOVE ? (
                            <TextField
                                value={query}
                                onChangeText={setQuery}
                                placeholder={t.bare('settings.connectors.search')}
                                accessibilityLabel={t('settings.connectors.search')}
                            />
                        ) : null}
                        {rows.length === 0 ? <EmptyState title={t('settings.connectors.none')} /> : null}
                        {noMatch ? <Text tone="muted">{t('settings.connectors.noMatch')}</Text> : null}
                        {renderGroup(
                            'unavailable',
                            t('settings.connectors.unavailable'),
                            groups.unavailable.length,
                            true,
                            unavailableHint(groups.unavailable, t),
                            groups.unavailable.map((c) => <UnavailableTile key={c.id} connector={c} />),
                        )}
                        {renderGroup('connected', t('settings.connectors.connected'), groups.connected.length, true, null, tiles(groups.connected))}
                        {renderGroup(
                            'accounts',
                            t('settings.connectors.accounts'),
                            groups.accounts.length,
                            groups.nothingConnected,
                            t('settings.connectors.accountsHint'),
                            tiles(groups.accounts),
                        )}
                        {renderGroup(
                            'servers',
                            t('settings.connectors.servers'),
                            groups.servers.length,
                            false,
                            t('settings.connectors.serversHint'),
                            tiles(groups.servers),
                        )}
                        {!q
                            ? renderGroup(
                                  'agentServers',
                                  t('settings.connectors.agentServers'),
                                  servers.length,
                                  false,
                                  null,
                                  servers.map((s) => (
                                      <AgentMcpTile
                                          key={agentMcpKey(s)}
                                          server={s}
                                          expanded={expanded === agentMcpKey(s)}
                                          onToggle={() => toggle(agentMcpKey(s))}
                                      />
                                  )),
                              )
                            : null}
                    </>
                )}
                <Stack align="start">
                    <Button
                        size="sm"
                        variant="secondary"
                        label={t('mobileApp.connectors.mcpGuide')}
                        iconEnd={ExternalLink}
                        onPress={() => openLinkFromPress(MCP_GUIDE_URL)}
                        testID="connectors-mcp-guide"
                    />
                </Stack>
            </Stack>
            {sheetRow && sheetForm ? (
                <ConnectorSetupSheet
                    key={sheetRow.id}
                    connector={sheetRow}
                    form={sheetForm}
                    onClose={() => setSheetFor(null)}
                    onSaved={() => {
                        if (sheetForm !== 'mcp') return;
                        setSheetFor(null);
                        void checks.run(sheetRow.id);
                    }}
                />
            ) : null}
        </>
    );
}

/** The desktop's `.connector-tile`: a bordered row that opens a detail panel under a rule. */
function Tile({ header, open, children, overlays }: { header: ReactNode; open?: boolean; children?: ReactNode; overlays?: ReactNode }) {
    const { colors, space } = useTheme();
    return (
        <Surface tone="secondary" radius="md" border>
            {header}
            {open ? (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.borderLight, paddingHorizontal: space.lg, paddingVertical: space.lg }}>
                    {children}
                </View>
            ) : null}
            {overlays}
        </Surface>
    );
}

/** `plain`: a header that stands in for a pressable one, read as one piece of text and kept at the pressable's height. */
function TileHeader({ name, trailing, onPress, open, menu, plain }: { name: string; trailing?: ReactNode; onPress?: () => void; open?: boolean; menu?: ReactNode; plain?: boolean }) {
    const { space } = useTheme();
    const body = (
        <View
            accessible={plain || undefined}
            style={[{ paddingHorizontal: space.lg, paddingVertical: space.md }, plain ? { minHeight: PRESSABLE_MIN_SIZE, justifyContent: 'center' } : null]}
        >
            <Row gap="sm" justify="between" align="start">
                <Row gap="sm" wrap flex={1}>
                    <Text role="ui" weight="semibold" dir="auto">{name}</Text>
                    {trailing}
                </Row>
                {onPress ? <Chevron open={!!open} /> : null}
            </Row>
        </View>
    );
    const main = onPress ? (
        <Pressable onPress={onPress} accessibilityLabel={name} aria-expanded={!!open}>
            {body}
        </Pressable>
    ) : (
        body
    );
    if (!menu) return main;
    return (
        <Row>
            <View style={{ flex: 1 }}>{main}</View>
            <View style={{ paddingEnd: space.sm }}>{menu}</View>
        </Row>
    );
}

/** An outlined pill: the type tag (`.connector-tile-type`) and the paused tag (`.connector-status.disabled`). */
function Pill({ label, bordered = true }: { label: string; bordered?: boolean }) {
    const { colors, radius } = useTheme();
    return (
        <View
            style={{
                backgroundColor: colors.bgTertiary,
                borderColor: colors.borderLight,
                borderWidth: bordered ? 1 : 0,
                borderRadius: radius.full,
                paddingHorizontal: 8,
                paddingVertical: 1,
            }}
        >
            <Text role="caption" tone="muted" numberOfLines={1}>{label}</Text>
        </View>
    );
}

function UnavailableTile({ connector }: { connector: UnavailableConnectorRow }) {
    const t = useT();
    return <Tile header={<TileHeader name={connector.display_name} trailing={<Pill label={t('settings.connectors.unavailableStatus')} />} />} />;
}

/**
 * The one notice for connectors the PC's key store held back: its prompt still open, or refused with Try again,
 * as Settings → Model's key notice offers. The list is read again once Try again settles.
 */
function KeyStoreNotice({ state, onSettled }: { state: ConnectorKeyStore; onSettled: () => void }) {
    const t = useT();
    const retry = useRetryKeyStore();
    const storePrompt = useDevicePrompt({ kind: 'keyStore', action: 'keyStoreRetry' });
    const retryRefused = useDeviceRefused('POST', ENDPOINTS.providersKeyStoreRetry);
    const [failed, setFailed] = useState<{ text: string; detail?: string } | null>(null);

    // The request stays open while the PC's unlock prompt waits; the notice follows the PC's events meanwhile.
    const onRetryStore = () => {
        setFailed(null);
        storePrompt.begin();
        retry.mutate(undefined, {
            onSuccess: () => storePrompt.settle(),
            onError: (err) => {
                if (!storePrompt.report(err)) setFailed(describeHttpFailure(err, t));
            },
            onSettled,
        });
    };

    if (state === 'waiting') {
        return (
            <Notice
                tone="info"
                role="status"
                title={t('mobileApp.approveOnPc.title')}
                message={t('mobileApp.approveOnPc.keyStore')}
                testID="connectors-key-store-waiting"
            />
        );
    }
    return (
        <Stack gap="sm">
            <Notice
                tone="warning"
                message={t('mobileApp.connectors.keyStore.locked')}
                action={retryRefused || retry.isPending || storePrompt.hideAction ? undefined : { label: t('settings.key.unlockAgain'), onPress: onRetryStore }}
                testID="connectors-key-store-locked"
            />
            {!retryRefused ? <ApproveOnPcNotice kind="keyStore" action="keyStoreRetry" onRetry={onRetryStore} /> : null}
            {failed ? <Notice tone="danger" message={failed.text} detail={failed.detail} testID="connectors-key-store-failed" /> : null}
        </Stack>
    );
}

function StatusText({ connector, check, t }: { connector: ConnectorRow; check?: ConnectorCheck; t: Translator }) {
    const status = tileStatus(connector);
    // A server that won't start is not working, whatever was saved for it.
    if (status.kind === 'connected' && check?.state === 'failed' && !check.slow) {
        return <Text role="label" tone="danger">{t('settings.connectors.notWorking')}</Text>;
    }
    switch (status.kind) {
        case 'connected':
            return (
                // Shrinks inside the header, so a long address is cut instead of running into the gutter.
                <View style={{ flexShrink: 1, minWidth: 0, maxWidth: '100%' }}>
                    <Row gap="xs">
                        <Icon icon={CircleCheck} size="sm" tone="success" />
                        <View style={{ flexShrink: 1, minWidth: 0 }}>
                            {status.accountId ? (
                                <Text role="label" tone="success" numberOfLines={1} largeLines={1} ellipsize="middle" accessibilityLabel={status.accountId}>
                                    <Ltr>{middleCut(status.accountId, 40)}</Ltr>
                                </Text>
                            ) : (
                                <Text role="label" tone="success" numberOfLines={1}>{t('settings.connectors.connected')}</Text>
                            )}
                        </View>
                    </Row>
                </View>
            );
        case 'accounts':
            return (
                <Row gap="sm" wrap>
                    <Row gap="xs">
                        {status.problem ? null : <Icon icon={CircleCheck} size="sm" tone="success" />}
                        <Text role="label" tone="success">{t.plural('settings.connectors.accountCount', status.count, { n: isolate(String(status.count), 'ltr') })}</Text>
                    </Row>
                    {status.problem ? <Text role="label" tone="danger">{t(`settings.connectors.${status.problem}`)}</Text> : null}
                </Row>
            );
        case 'attention':
            return <Text role="label" tone="danger">{t(`settings.connectors.${status.problem}`)}</Text>;
        case 'paused':
            return <Pill label={t('settings.connectors.paused')} />;
        case 'setupRequired':
            return <Text role="label" tone="muted">{t('settings.connectors.setupRequired')}</Text>;
        case 'heldBack':
            return <Text role="label" tone="muted" testID={`connector-held-back-${connector.id}`}>{t('settings.connectors.tile.heldBack')}</Text>;
        default:
            return null;
    }
}

/** Centered on the title's first line, so a row that wraps keeps it beside the name. */
function Chevron({ open }: { open: boolean }) {
    const { type } = useTheme();
    const { fontScale } = useWindowDimensions();
    const rtl = useDirection() === 'rtl';
    const line = lineHeightOf(type.ui, 'ui', rtl) * fontScale;
    return (
        <View style={{ minHeight: line, justifyContent: 'center' }} testID="tile-chevron">
            <Icon icon={open ? ChevronDown : ChevronRight} size="sm" tone="muted" />
        </View>
    );
}

function ConnectorTile({
    connector,
    expanded,
    onToggle,
    onDisconnected,
    justConnected,
    onPersonalizeStarted,
    check,
    onCheck,
    onClearCheck,
    onSetup,
}: {
    connector: ConnectorRow;
    expanded: boolean;
    onToggle: () => void;
    onDisconnected: (notice: string | null) => void;
    justConnected: boolean;
    onPersonalizeStarted: () => void;
    check?: ConnectorCheck;
    onCheck: () => void;
    onClearCheck: () => void;
    onSetup: () => void;
}) {
    const t = useT();
    const [menuOpen, setMenuOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Addresses the PC found when a plain disconnect was refused for having several: removed only once the person agrees.
    const [removeAll, setRemoveAll] = useState<string[] | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string; detail?: string } | null>(null);
    const action = useConnectorServerAction(connector.id, (outcome) => onDisconnected(disconnectNotice(outcome, connector, t)));
    const configure = useConfigureConnector();
    const google = connector.id === GOOGLE_CONNECTOR_ID;
    const browserSignIn = useBrowserSignInAvailable();
    const server = connector.type === 'mcp_server';
    const paused = connector.enabled === false;
    const form = setupForm(connector);
    const accounts = accountsOf(connector);
    const hasAccounts = accounts.length > 0;
    const accountList = showsAccountList(connector);
    // Held back by the PC's key store: neither connected nor not, so no status and no actions until it is read.
    const unread = !!connector.key_store;
    const checkPrompt = useDevicePrompt({ kind: 'keyStore', action: CHECK_PROMPT_ACTION });
    // The prompt's state is shared by every Check; only the tile whose check raised it hides its button, as a locked store's Try again does.
    const checkOnPc = (checkPrompt.hideAction && (check?.state === 'checking' || check?.state === 'prompt')) || check?.state === 'locked';

    // A result shown inside the tile opens it, so a menu pick is never silent.
    function show(next: { tone: 'info' | 'danger'; text: string; detail?: string }) {
        setMessage(next);
        if (!expanded) onToggle();
    }
    const refuse = (detailKey: 'connectPcOnly' | 'enablePcOnly') =>
        show({ tone: 'info', text: `${t('mobileApp.pcOnly.refusal')} ${t(`mobileApp.connectors.${detailKey}`)}` });
    const connectChip = (
        <ChipButton
            label={t.bare('settings.key.connect')}
            accessibilityLabel={t('settings.key.connect')}
            variant="accent"
            onPress={() => refuse('connectPcOnly')}
        />
    );
    function run(kind: 'disable' | 'disconnect' | 'disconnectAll') {
        setMessage(null);
        onClearCheck();
        if (kind !== 'disable') onDisconnected(null);
        action.mutate(kind, {
            onError: (e) => {
                const choices = kind === 'disconnect' ? accountChoices(e) : null;
                if (choices) return setRemoveAll(choices);
                if (isPcRefusal(e)) return show({ tone: 'info', text: t('mobileApp.settings.pcOnly') });
                const { text, detail } = describeHttpFailure(e, t);
                show({ tone: 'danger', text, detail });
            },
        });
    }
    // A server with no keys connects at once, then gets checked as one saved with keys does.
    async function connectKeyless() {
        setMessage(null);
        setConnecting(true);
        try {
            await configure(connector.id, {});
        } catch (e) {
            if (isPcRefusal(e)) show({ tone: 'info', text: t('mobileApp.settings.pcOnly') });
            else show({ tone: 'danger', ...describeHttpFailure(e, t) });
            return;
        } finally {
            setConnecting(false);
        }
        onCheck();
    }
    const messageNotice = message ? <Notice tone={message.tone} message={message.text} detail={message.detail} /> : null;
    const setupButton = (
        <Stack align="start">
            <Button
                size="sm"
                variant="primary"
                wrap
                label={t('connectCard.setUp', { name: connector.display_name })}
                onPress={onSetup}
                testID={`connector-start-setup-${connector.id}`}
            />
        </Stack>
    );
    const clientRow = form === 'oauthClient' ? <OAuthClientRow connector={connector} onChange={onSetup} /> : null;

    return (
        <Tile
            open={expanded && !unread}
            header={
                <TileHeader
                    name={connector.display_name}
                    onPress={unread ? undefined : onToggle}
                    plain={unread}
                    open={expanded}
                    menu={
                        server && connector.configured ? (
                            <IconButton
                                icon={Ellipsis}
                                size="sm"
                                label={t('settings.connectors.actions')}
                                testID={`connector-actions-${connector.id}`}
                                disabled={action.isPending}
                                onPress={() => setMenuOpen(true)}
                            />
                        ) : undefined
                    }
                    trailing={
                        <>
                            {connector.configured ? <Pill label={connector.type === 'oauth_pkce' ? 'OAuth' : 'MCP'} /> : null}
                            <StatusText connector={connector} check={server ? check : undefined} t={t} />
                        </>
                    }
                />
            }
            overlays={
                <>
                    {server ? (
                        <ActionSheet
                            open={menuOpen}
                            onClose={() => setMenuOpen(false)}
                            title={connector.display_name}
                            actions={[
                                paused
                                    ? { label: t('settings.connectors.enable'), icon: Play, onPress: () => refuse('enablePcOnly') }
                                    : { label: t('settings.connectors.disable'), icon: Pause, onPress: () => run('disable') },
                                { label: t('settings.connectors.disconnect'), icon: Trash2, destructive: true, onPress: () => setConfirmOpen(true) },
                            ]}
                        />
                    ) : null}
                    <ActionSheet
                        open={confirmOpen}
                        onClose={() => setConfirmOpen(false)}
                        title={t('mobileApp.connectors.disconnectConfirm', {
                            name: connector.account_id ? `${connector.display_name} (${connector.account_id})` : connector.display_name,
                        })}
                        actions={[{ label: t('settings.connectors.disconnect'), icon: Trash2, destructive: true, testID: 'connector-disconnect-confirm', onPress: () => run('disconnect') }]}
                    />
                    <ActionSheet
                        open={removeAll !== null}
                        onClose={() => setRemoveAll(null)}
                        title={t('settings.connectors.disconnectAllAsk', { n: removeAll?.length ?? 0, name: connector.display_name })}
                        message={`${(removeAll ?? []).map((address) => isolate(address, 'ltr')).join('\n')}\n\n${t('settings.connectors.disconnectAllBody')}`}
                        actions={[{ label: t('settings.connectors.disconnectAll'), icon: Trash2, destructive: true, testID: 'connector-disconnect-all-confirm', onPress: () => run('disconnectAll') }]}
                    />
                </>
            }
        >
            <Stack gap="sm">
                <Text role="label" tone="secondary">{connectorDescription(t, connector)}</Text>
                {unread ? null : !connector.configured && !hasAccounts ? (
                    form === 'oauthSetup' ? (
                        setupButton
                    ) : google ? (
                        <>
                            {browserSignIn ? <BrowserSignInBlock connector={connector} /> : <Notice tone="info" message={t('mobileApp.connectors.googlePcOnly')} />}
                            {clientRow}
                        </>
                    ) : server ? (
                        <>
                            <Row gap="sm" wrap>
                                <ChipButton
                                    label={t.bare('settings.key.connect')}
                                    accessibilityLabel={t('settings.key.connect')}
                                    variant="accent"
                                    disabled={connecting}
                                    onPress={form === 'mcp' ? onSetup : () => void connectKeyless()}
                                    testID={`connector-connect-${connector.id}`}
                                />
                            </Row>
                            <CheckStatus connector={connector} check={check} onCheck={onCheck} />
                            {messageNotice}
                        </>
                    ) : (
                        <>
                            {connector.supports_device_code ? (
                                <DeviceCodeSignIn connector={connector} leading={connectChip} />
                            ) : (
                                <Row gap="sm" wrap>
                                    {connectChip}
                                </Row>
                            )}
                            {clientRow}
                            {messageNotice}
                        </>
                    )
                ) : (
                    <>
                        {accountList ? null : (
                            <Row gap="sm" wrap>
                                {server && !paused && !checkOnPc ? (
                                    <Button
                                        size="sm"
                                        label={t('settings.connectors.check')}
                                        accessibilityLabel={t('settings.connectors.check')}
                                        disabled={action.isPending || check?.state === 'checking'}
                                        onPress={onCheck}
                                        testID={`connector-check-${connector.id}`}
                                    />
                                ) : null}
                                {form === 'mcp' ? (
                                    <Button
                                        size="sm"
                                        label={t('mobileApp.connectors.editSetup')}
                                        accessibilityLabel={t('mobileApp.connectors.editSetup')}
                                        onPress={onSetup}
                                        testID={`connector-edit-${connector.id}`}
                                    />
                                ) : null}
                                <Button
                                    size="sm"
                                    label={t('settings.connectors.disconnect')}
                                    accessibilityLabel={t('settings.connectors.disconnect')}
                                    variant="danger"
                                    testID={`connector-disconnect-${connector.id}`}
                                    disabled={action.isPending}
                                    onPress={() => setConfirmOpen(true)}
                                />
                            </Row>
                        )}
                        {accountList ? <ConnectorAccountList connector={connector} /> : null}
                        {hasAccounts ? <AddAccount connector={connector} /> : null}
                        {server ? <CheckStatus connector={connector} check={check} onCheck={onCheck} /> : null}
                        {clientRow}
                        {messageNotice}
                        <ConnectorAccess
                            connector={connector}
                            offer={justConnected}
                            onPersonalizeStarted={onPersonalizeStarted}
                            serverSwitch={
                                server
                                    ? {
                                          busy: action.isPending,
                                          onDisable: () => run('disable'),
                                          onEnableRefused: () => refuse('enablePcOnly'),
                                      }
                                    : undefined
                            }
                        />
                    </>
                )}
            </Stack>
        </Tile>
    );
}

/** The OAuth client the PC uses for this connector, by its ID only, and the way to change it. */
function OAuthClientRow({ connector, onChange }: { connector: ConnectorRow; onChange: () => void }) {
    const t = useT();
    return (
        <Stack gap="xs">
            <Text role="label" weight="semibold" tone="muted">{t('settings.connectors.client')}</Text>
            <OAuthClientLine connector={connector} />
            <Row gap="sm" wrap>
                <ChipButton
                    label={t.bare('mobileApp.connectors.changeClient')}
                    accessibilityLabel={t('mobileApp.connectors.changeClient')}
                    onPress={onChange}
                    testID={`connector-client-${connector.id}`}
                />
            </Row>
        </Stack>
    );
}

/** The desktop's Check line: starting, started, too slow, or didn't start with the server's own output behind Details. */
function CheckStatus({ connector, check, onCheck }: { connector: ConnectorRow; check?: ConnectorCheck; onCheck: () => void }) {
    const t = useT();
    const prompt = useDevicePrompt({ kind: 'keyStore', action: CHECK_PROMPT_ACTION });
    const [details, setDetails] = useState(false);
    if (!check) return null;
    const name = connector.display_name;
    switch (check.state) {
        case 'prompt':
            return <ApproveOnPcNotice kind="keyStore" action={CHECK_PROMPT_ACTION} onRetry={onCheck} />;
        case 'checking':
            // The PC's prompt stands in for the spinner once it is up.
            if (prompt.state !== 'idle' && prompt.state !== 'approved') return <ApproveOnPcNotice kind="keyStore" action={CHECK_PROMPT_ACTION} onRetry={onCheck} />;
            return (
                <View accessibilityLiveRegion="polite" testID={`connector-check-status-${connector.id}`}>
                    <Row gap="sm">
                        <Spinner size="sm" />
                        <Text role="label" tone="secondary">{t('settings.connectors.checking', { name })}</Text>
                    </Row>
                </View>
            );
        case 'ok':
            return <Notice tone="success" role="status" message={t('settings.connectors.checkOk', { name })} testID={`connector-check-status-${connector.id}`} />;
        case 'failed':
            return (
                <Stack gap="xs" testID={`connector-check-status-${connector.id}`}>
                    <Notice
                        tone="danger"
                        message={
                            check.slow
                                ? t('settings.connectors.checkSlow', { name })
                                : (connector.mcp_env_keys ?? []).length === 0
                                  ? t('settings.connectors.checkFailed', { name })
                                  : t('settings.connectors.checkFailedKey', { name })
                        }
                    />
                    {check.detail ? (
                        <Disclosure title={t('settings.connectors.checkDetails')} open={details} onToggle={() => setDetails((v) => !v)}>
                            <Text role="caption" tone="muted" dir="ltr" align="ltr" mono>
                                {check.detail}
                            </Text>
                        </Disclosure>
                    ) : null}
                </Stack>
            );
        case 'locked':
            return (
                <Notice
                    tone="warning"
                    message={t('settings.key.storeLocked')}
                    detail={check.detail}
                    action={{ label: t('settings.key.unlockAgain'), onPress: onCheck }}
                    testID={`connector-check-status-${connector.id}`}
                />
            );
        case 'error': {
            if (isPcRefusal(check.error)) return <PcOnlyNotice testID={`connector-check-status-${connector.id}`} />;
            const { text, detail } = describeHttpFailure(check.error, t);
            return <Notice tone="danger" message={text} detail={detail} testID={`connector-check-status-${connector.id}`} />;
        }
    }
}

interface ServerSwitch {
    busy: boolean;
    onDisable: () => void;
    onEnableRefused: () => void;
}

function ConnectorAccess({ connector, serverSwitch, offer, onPersonalizeStarted }: { connector: ConnectorRow; serverSwitch?: ServerSwitch; offer: boolean; onPersonalizeStarted: () => void }) {
    const t = useT();
    const agents = useAgents();
    const grants = useConnectorGrants(connector.id, true);
    const activations = useConnectorActivations(connector.id, true);
    const change = useChangeConnectorAccess(connector.id);

    const failure = agents.error ?? grants.error ?? activations.error;
    if (failure) return <Notice tone="danger" message={describeHttpFailure(failure, t).text} detail={describeHttpFailure(failure, t).detail} />;
    if (!agents.data || !grants.data || !activations.data) return null;

    const list = agents.data.agents;
    const granted = grants.data.grants;
    const active = activations.data.activations;
    const busy = change.isPending;
    const sole = soleMcpAgent(list, connector);
    const perScope = sole ? [] : grantAgents(list, connector.id);
    const perAgent = sole ? [] : activatableAgents(list, connector);

    return (
        <Stack gap="sm">
            {connector.enabled !== false ? <PersonalizeOffer connector={connector} offer={offer} onStarted={onPersonalizeStarted} /> : null}
            {sole ? (
                <Switch
                    label={t('settings.connectors.agentCanUse', { agent: sole.name, name: connector.display_name })}
                    description={connector.enabled === false ? t('settings.connectors.disabledHelp') : undefined}
                    value={connector.enabled !== false && !!active[sole.namespaced_agent_id]}
                    disabled={busy || connector.enabled === false}
                    onValueChange={(on) =>
                        change.mutate(
                            on
                                ? {
                                      kind: 'activate',
                                      agentId: sole.namespaced_agent_id,
                                      scopes: granted[sole.namespaced_agent_id]?.length ? undefined : [...MCP_DEFAULT_GRANT_SCOPES],
                                  }
                                : { kind: 'deactivate', agentId: sole.namespaced_agent_id },
                        )
                    }
                />
            ) : null}
            {perScope.length > 0 ? (
                <Stack gap="xs">
                    <Text role="label" weight="semibold" tone="muted">{t('settings.connectors.grants')}</Text>
                    {perScope.map((agent) => {
                        const held = granted[agent.namespaced_agent_id] ?? [];
                        const scopes = agent.required_connections?.find((rc) => rc.connector_id === connector.id)?.scopes ?? [];
                        return (
                            <Surface key={agent.namespaced_agent_id} tone="secondary" radius="sm" border padding="md">
                              <Stack gap="xs">
                                <Text role="label" weight="semibold">{agent.name}</Text>
                                {scopes.map((scope) => (
                                    <Switch
                                        key={scope}
                                        label={scopeLabel(scope, t)}
                                        value={held.includes(scope)}
                                        disabled={busy}
                                        onValueChange={(on) =>
                                            change.mutate({
                                                kind: 'grant',
                                                agentId: agent.namespaced_agent_id,
                                                scopes: nextScopes(held, scope, on),
                                            })
                                        }
                                    />
                                ))}
                              </Stack>
                            </Surface>
                        );
                    })}
                </Stack>
            ) : null}
            {perAgent.length > 0 ? (
                <Stack gap="xs">
                    <Text role="label" weight="semibold" tone="muted">{t('settings.connectors.activeFor')}</Text>
                    {perAgent.map((agent) => {
                        const on = !!active[agent.namespaced_agent_id];
                        return (
                            <Switch
                                key={agent.namespaced_agent_id}
                                label={agent.name}
                                description={t(on ? 'settings.connectors.toolsVisible' : 'settings.connectors.toolsHidden', {
                                    name: connector.display_name,
                                })}
                                value={on}
                                disabled={busy}
                                onValueChange={(next) =>
                                    change.mutate(
                                        next
                                            ? {
                                                  kind: 'activate',
                                                  agentId: agent.namespaced_agent_id,
                                                  scopes: scopesForActivation(agent, connector.id, granted[agent.namespaced_agent_id] ?? []),
                                              }
                                            : { kind: 'deactivate', agentId: agent.namespaced_agent_id },
                                    )
                                }
                            />
                        );
                    })}
                </Stack>
            ) : null}
            {serverSwitch && !sole ? (
                <Switch
                    label={t(connector.enabled === false ? 'settings.connectors.enableServer' : 'settings.connectors.disableServer')}
                    description={connector.enabled === false ? t('settings.connectors.disabledHelp') : undefined}
                    value={connector.enabled !== false}
                    disabled={serverSwitch.busy}
                    onValueChange={(on) => (on ? serverSwitch.onEnableRefused() : serverSwitch.onDisable())}
                />
            ) : null}
            {change.error ? <Notice tone="danger" message={describeHttpFailure(change.error, t).text} detail={describeHttpFailure(change.error, t).detail} /> : null}
        </Stack>
    );
}

function PersonalizeOffer({ connector, offer, onStarted }: { connector: ConnectorRow; offer: boolean; onStarted: () => void }) {
    const t = useT();
    const router = useRouter();
    const agents = useAgents();
    const change = useChangeConnectorAccess(connector.id);
    const activateRefused = useDeviceRefused('PUT', ENDPOINTS.connectorActivation);
    const pcOnly = connector.type === 'mcp_server' && activateRefused;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
    const kind = personalizeSourceKind(connector.id);
    const source = kind
        ? ref(`settings.connectors.personalize.source.${kind}`)
        : ref('settings.connectors.personalize.source.other', { name: connector.display_name });

    async function start() {
        setBusy(true);
        setError(null);
        try {
            if (connector.type === 'mcp_server') {
                const flagship = flagshipAgentId(agents.data?.agents ?? []);
                if (!flagship) {
                    setError({ message: t('settings.connectors.personalize.noAgent', { name: connector.display_name }) });
                    return;
                }
                if (!connector.activations?.[flagship]) {
                    await change.mutateAsync({ kind: 'activate', agentId: flagship, scopes: [...MCP_DEFAULT_GRANT_SCOPES] });
                }
            }
            onStarted();
            router.push(personalizeRoute(connector));
        } catch (e) {
            setError(failureNoticeProps(e, t, { withReason: 'settings.connectors.personalize.failed', noReason: 'mobileApp.connectors.personalizeFailedShort' }));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Stack gap="xs">
            <Text role="label" tone="secondary">
                {t(offer ? 'settings.connectors.personalize.offer' : 'settings.connectors.personalize.tile', { source, name: connector.display_name })}
            </Text>
            {pcOnly ? (
                <PcOnlyNotice testID={`personalize-pc-only-${connector.id}`} />
            ) : (
                <Stack align="start">
                    <Button
                        size="sm"
                        variant={offer ? 'primary' : 'secondary'}
                        wrap
                        label={t('settings.connectors.personalize.button')}
                        busy={busy}
                        onPress={() => void start()}
                        testID={`personalize-${connector.id}`}
                    />
                </Stack>
            )}
            {error ? <Notice tone="danger" message={error.message} detail={error.detail} /> : null}
        </Stack>
    );
}

function AgentMcpTile({ server, expanded, onToggle }: { server: AgentMcpServer; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    const command = [server.command, ...server.args].join(' ');
    return (
        <Tile
            open={expanded}
            header={
                <TileHeader
                    name={server.server_name}
                    onPress={onToggle}
                    open={expanded}
                    trailing={
                        <>
                            <Pill label={server.disabled ? t('settings.connectors.paused') : t('settings.connectors.active')} />
                            <Pill label={t('settings.connectors.readOnly')} />
                        </>
                    }
                />
            }
        >
            <Stack gap="xs">
                <Text role="label" tone="secondary">{t('settings.connectors.via', { name: server.agent_name })}</Text>
                {command ? <Ltr>{command}</Ltr> : null}
                <Ltr>{server.config_path}</Ltr>
                <Text role="label" tone="muted">{t('settings.connectors.editConfig')}</Text>
            </Stack>
        </Tile>
    );
}
