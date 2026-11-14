// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMemo, useState, type ReactNode } from 'react';

import type { AgentMcpServer, ConnectorRow, UnavailableConnectorRow } from '@/api/client.types';
import { useAgentMcps, useConnectors } from '@/data';
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
    Text,
    TextField,
    Ltr,
} from '@/ui';
import { ChevronDown, ChevronRight } from '@/ui/icons';

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
                    ) : null}
                </Stack>
            ) : null}
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
