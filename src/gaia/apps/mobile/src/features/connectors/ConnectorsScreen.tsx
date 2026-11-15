// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { scopeLabel } from '@webui/utils/connectorScopes';
import { ref } from '@webui/i18n/registry';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';

import type { AgentMcpServer, ConnectorRow, UnavailableConnectorRow } from '@/api/client.types';
import {
    useAgentMcps,
    useAgents,
    useChangeConnectorAccess,
    useConnectorActivations,
    useConnectorGrants,
    useConnectors,
} from '@/data';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeError, useT } from '@/i18n/useT';
import {
    Badge,
    Button,
    Disclosure,
    EmptyState,
    ErrorState,
    Icon,
    ListRow,
    ListSkeleton,
    Notice,
    Row,
    Screen,
    Stack,
    Switch,
    Text,
    TextField,
    Ltr,
} from '@/ui';
import { ChevronDown, ChevronRight } from '@/ui/icons';

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
    GOOGLE_CONNECTOR_ID,
    groupConnectors,
    SEARCH_ABOVE,
    tileStatus,
    unavailableHint,
} from './connectorList';

type Translator = ReturnType<typeof useT>;

export function ConnectorsScreen() {
    const t = useT();
    const connectors = useConnectors();
    const agentMcps = useAgentMcps();
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

    const rows = connectors.data?.connectors ?? [];
    const servers = agentMcps.data?.agent_mcps ?? [];
    const q = query.trim();
    const groups = useMemo(() => groupConnectors(rows, query, t), [rows, query, t]);

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
            <Disclosure
                key={id}
                title={title}
                open={groupOpen(id, byDefault)}
                onToggle={setGroup(id, byDefault)}
                trailing={<Badge label={String(count)} />}
            >
                <Stack gap="xs">
                    {hint ? <Text role="caption" tone="muted">{hint}</Text> : null}
                    {body}
                </Stack>
            </Disclosure>
        );
    }

    const tiles = (list: ConnectorRow[]) =>
        list.map((c) => <ConnectorTile key={c.id} connector={c} expanded={expanded === c.id} onToggle={() => toggle(c.id)} />);

    return (
        <Screen scroll header={<ScreenHeader title={t('settings.section.connectors')} />}>
            <Stack gap="md" paddingX="lg" paddingY="md">
                <Text tone="secondary">{t('settings.connectors.lede')}</Text>
                {failure ? (
                    <ErrorState
                        title={describeError(failure, t)}
                        onRetry={() => {
                            void connectors.refetch();
                            void agentMcps.refetch();
                        }}
                    />
                ) : loading ? (
                    <ListSkeleton rows={6} />
                ) : (
                    <>
                        {rows.length > SEARCH_ABOVE ? (
                            <TextField
                                value={query}
                                onChangeText={setQuery}
                                placeholder={t('settings.connectors.search')}
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
            </Stack>
        </Screen>
    );
}

function UnavailableTile({ connector }: { connector: UnavailableConnectorRow }) {
    const t = useT();
    return (
        <ListRow
            title={connector.display_name}
            trailing={<Text role="caption" tone="danger">{t('settings.connectors.unavailableStatus')}</Text>}
        />
    );
}

function StatusText({ connector, t }: { connector: ConnectorRow; t: Translator }) {
    const status = tileStatus(connector);
    switch (status.kind) {
        case 'connected':
            return (
                <Text role="caption" tone="success" numberOfLines={1}>
                    {status.accountId ? <Ltr>{status.accountId}</Ltr> : t('settings.connectors.connected')}
                </Text>
            );
        case 'paused':
            return <Text role="caption" tone="muted">{t('settings.connectors.paused')}</Text>;
        case 'setupRequired':
            return <Text role="caption" tone="muted">{t('settings.connectors.setupRequired')}</Text>;
        default:
            return null;
    }
}

function Chevron({ open }: { open: boolean }) {
    return <Icon icon={open ? ChevronDown : ChevronRight} size="sm" tone="muted" />;
}

function ConnectorTile({ connector, expanded, onToggle }: { connector: ConnectorRow; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    const [asked, setAsked] = useState(false);
    const google = connector.id === GOOGLE_CONNECTOR_ID;
    return (
        <Stack>
            <ListRow
                title={connector.display_name}
                onPress={onToggle}
                accessibilityLabel={connector.display_name}
                trailing={
                    <Row gap="sm">
                        {connector.configured ? <Badge label={connector.type === 'oauth_pkce' ? 'OAuth' : 'MCP'} /> : null}
                        <StatusText connector={connector} t={t} />
                        <Chevron open={expanded} />
                    </Row>
                }
            />
            {expanded ? (
                <Stack gap="sm" paddingX="lg" paddingY="sm">
                    <Text role="caption" tone="secondary">{connectorDescription(t, connector)}</Text>
                    {!connector.configured ? (
                        google ? (
                            <Notice tone="info" message={t('mobileApp.connectors.googlePcOnly')} />
                        ) : (
                            <>
                                <Button label={t('settings.key.connect')} onPress={() => setAsked(true)} variant="secondary" size="sm" />
                                {asked ? <Notice tone="info" message={t('mobileApp.connectors.comingLater')} /> : null}
                            </>
                        )
                    ) : (
                        <ConnectorAccess connector={connector} />
                    )}
                </Stack>
            ) : null}
        </Stack>
    );
}

function ConnectorAccess({ connector }: { connector: ConnectorRow }) {
    const t = useT();
    const agents = useAgents();
    const grants = useConnectorGrants(connector.id, true);
    const activations = useConnectorActivations(connector.id, true);
    const change = useChangeConnectorAccess(connector.id);

    const failure = agents.error ?? grants.error ?? activations.error;
    if (failure) return <Notice tone="danger" message={describeError(failure, t)} />;
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
            {connector.enabled !== false ? <PersonalizeOffer connector={connector} /> : null}
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
                    <Text role="ui" weight="medium">{t('settings.connectors.grants')}</Text>
                    {perScope.map((agent) => {
                        const held = granted[agent.namespaced_agent_id] ?? [];
                        const scopes = agent.required_connections?.find((rc) => rc.connector_id === connector.id)?.scopes ?? [];
                        return (
                            <Stack key={agent.namespaced_agent_id} gap="xs">
                                <Text role="caption" tone="secondary">{agent.name}</Text>
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
                        );
                    })}
                </Stack>
            ) : null}
            {perAgent.length > 0 ? (
                <Stack gap="xs">
                    <Text role="ui" weight="medium">{t('settings.connectors.activeFor')}</Text>
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
            {change.error ? <Notice tone="danger" message={describeError(change.error, t)} /> : null}
        </Stack>
    );
}

function PersonalizeOffer({ connector }: { connector: ConnectorRow }) {
    const t = useT();
    const router = useRouter();
    const agents = useAgents();
    const change = useChangeConnectorAccess(connector.id);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
                if (!flagship) throw new Error(t('settings.connectors.personalize.noAgent', { name: connector.display_name }));
                if (!connector.activations?.[flagship]) {
                    await change.mutateAsync({ kind: 'activate', agentId: flagship, scopes: [...MCP_DEFAULT_GRANT_SCOPES] });
                }
            }
            router.push(personalizeRoute(connector));
        } catch (e) {
            setError(t('settings.connectors.personalize.failed', { error: describeError(e, t) }));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Stack gap="xs">
            <Text role="caption" tone="secondary">
                {t('settings.connectors.personalize.tile', { source, name: connector.display_name })}
            </Text>
            <Button label={t('settings.connectors.personalize.button')} onPress={() => void start()} variant="secondary" size="sm" disabled={busy} />
            {error ? <Notice tone="danger" message={error} /> : null}
        </Stack>
    );
}

function AgentMcpTile({ server, expanded, onToggle }: { server: AgentMcpServer; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    const command = [server.command, ...server.args].join(' ');
    return (
        <Stack>
            <ListRow
                title={server.server_name}
                subtitle={t('settings.connectors.via', { name: server.agent_name })}
                onPress={onToggle}
                trailing={
                    <Row gap="sm">
                        <Badge
                            label={server.disabled ? t('settings.connectors.paused') : t('settings.connectors.active')}
                            tone={server.disabled ? 'neutral' : 'success'}
                        />
                        <Badge label={t('settings.connectors.readOnly')} />
                        <Chevron open={expanded} />
                    </Row>
                }
            />
            {expanded ? (
                <Stack gap="xs" paddingX="lg" paddingY="sm">
                    {command ? <Ltr>{command}</Ltr> : null}
                    <Ltr>{server.config_path}</Ltr>
                    <Text role="caption" tone="muted">{t('settings.connectors.editConfig')}</Text>
                </Stack>
            ) : null}
        </Stack>
    );
}
