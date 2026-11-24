// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { View } from 'react-native';

import type { ActiveModel, LocalModelStatus, PermissionMode, ScopeEntry, Session, SessionEnvironment } from '@/api/client.types';
import { sessionEnvironmentPath } from '@/api/constants';
import { useDeviceRefused } from '@/api/routeAccess';
import { useActiveModel, useEnvironmentActions, useLocalModelStatus, usePermissionMode, usePhoneAccess, useSession, useSessionEnvironment } from '@/data';
import { isFolderRefusal } from '@/features/files/folderRefusal';
import { isPcRefusal, PcOnlyNotice } from '@/features/settings/PcOnlyNotice';
import { useT, type Translate } from '@/i18n/useT';
import { Button, IconButton, Notice, Pressable, Row, Stack, Text } from '@/ui';
import { Cloud, Cpu, FileText, Folder, FolderPlus, Globe, Info, Monitor, ShieldAlert, ShieldCheck, Smartphone, X } from '@/ui/icons';
import { formatWindow } from '@webui/components/modelMeta';
import { isolate } from '@webui/i18n/registry';
import { environmentOffline } from '@webui/utils/sessionPanelSummary.core';

import { failureNoticeProps } from '../header/failureText';
import { COMPACT_ROW, CompactRow, InlineSegment, MiniSwitch, RowText } from './compact';
import { FolderPicker } from './FolderPicker';
import { PanelSection } from './PanelSection';
import { useSessionPanelStore } from './panelStore';
import type { SectionProps } from './sections';
import type { MessageKey } from '@webui/i18n/registry';

const SOURCE_LABEL: Record<ScopeEntry['source'], MessageKey> = {
    added: 'env.source.added',
    gaia_documents: 'env.source.gaia_documents',
    scratch: 'env.source.scratch',
    document: 'env.source.document',
    working_folder: 'env.source.working_folder',
    approved: 'env.source.approved',
    allowed_paths: 'env.source.allowed_paths',
};

const FILES_SHOWN = 3;

function baseName(path: string): string {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? path;
}


export function EnvironmentSection({ sessionId, live, promptWaiting }: SectionProps) {
    const t = useT();
    const { data: env, error } = useSessionEnvironment(sessionId, { enabled: true, live });
    return (
        <PanelSection id="environment" title={t('env.title')} summary={environmentOffline(env) ? t('env.offline') : null} divider={false}>
            <Stack>
                <RunsOn sessionId={sessionId} />
                <Folders sessionId={sessionId} env={env} error={error} />
                <Permission sessionId={sessionId} promptWaiting={promptWaiting} />
                <Internet sessionId={sessionId} env={env} />
                <PhoneAccess />
            </Stack>
        </PanelSection>
    );
}

function Folders({ sessionId, env, error }: { sessionId: string; env: SessionEnvironment | undefined; error: unknown }) {
    const t = useT();
    const session = useSession(sessionId).data;
    const { addFolder, removeFolder } = useEnvironmentActions(sessionId);
    const refused = useDeviceRefused('POST', sessionEnvironmentPath(sessionId, 'folderRemove'));
    const addRefused = useDeviceRefused('POST', sessionEnvironmentPath(sessionId, 'folders'));
    const picking = useSessionPanelStore((s) => s.envPicking);
    const setPicking = useSessionPanelStore((s) => s.setEnvPicking);
    const envConfirm = useSessionPanelStore((s) => s.envConfirm);
    const setEnvConfirm = useSessionPanelStore((s) => s.setEnvConfirm);
    const confirming = envConfirm?.kind === 'remove' ? envConfirm.path : null;
    const [allFiles, setAllFiles] = useState(false);

    const locked = !env || !env.enforced;
    const label = env && !env.enforced ? t('env.reach') : t('env.readWrite');
    if (isPcRefusal(error)) return <PcOnlyNotice testID="environment-pc-only" />;
    const folders = env?.folders.filter((f) => f.kind === 'folder') ?? [];
    // The Documents section lists the chat's documents.
    const files = env?.folders.filter((f) => f.kind === 'file' && f.source !== 'document') ?? [];
    const shownFiles = allFiles ? files : files.slice(0, FILES_SHOWN);
    const confirm = (path: string) => {
        setEnvConfirm(null);
        removeFolder.mutate(path);
    };
    const row = (entry: ScopeEntry) => (
        <FolderRow
            key={entry.path}
            entry={entry}
            t={t}
            canRemove={entry.removable && !locked && !refused}
            busy={removeFolder.isPending}
            confirming={confirming === entry.path}
            onAsk={() => setEnvConfirm({ kind: 'remove', path: entry.path })}
            onCancel={() => setEnvConfirm(null)}
            onConfirm={() => confirm(entry.path)}
        />
    );
    return (
        <Stack gap="xs">
            {!env && !error ? <RowText tone="muted">{t('sp.checking')}</RowText> : null}
            {env && !env.enforced ? <Text role="caption" tone="muted">{t(session?.agent_type === 'gaia' ? 'env.flagshipScope' : 'env.agentScope')}</Text> : null}
            {error ? (
                <Notice
                    tone="danger"
                    {...failureNoticeProps(error, t, { withReason: 'env.foldersError', noReason: 'mobileApp.env.foldersErrorShort' })}
                    testID="environment-error"
                />
            ) : null}
            {env ? (
                <>
                    {env.folders.length === 0 ? <RowText tone="muted">{t('env.nothing')}</RowText> : null}
                    <Stack accessibilityRole="list" accessibilityLabel={label}>
                        {folders.map(row)}
                        {shownFiles.map(row)}
                    </Stack>
                    {files.length > FILES_SHOWN ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            label={allFiles ? t('env.fewerFiles') : t('env.allFiles', { n: files.length })}
                            onPress={() => setAllFiles((v) => !v)}
                        />
                    ) : null}
                    {env.removed.length > 0 ? (
                        <Text role="caption" tone="muted">
                            {t('env.removed', { names: isolate(env.removed.map(baseName).join(', '), 'ltr') })}
                        </Text>
                    ) : null}
                    {picking ? (
                        <FolderPicker
                            sessionId={sessionId}
                            busy={addFolder.isPending}
                            error={isPcRefusal(addFolder.error) && !isFolderRefusal(addFolder.error) ? undefined : addFolder.error}
                            onClose={() => setPicking(false)}
                            onPick={(path) => addFolder.mutate(path, { onSuccess: () => setPicking(false) })}
                        />
                    ) : !locked && !addRefused ? (
                        <Pressable
                            minSize={COMPACT_ROW}
                            accessibilityLabel={t('env.addFolder')}
                            onPress={() => {
                                addFolder.reset();
                                setPicking(true);
                            }}
                            testID="environment-add-folder"
                        >
                            <CompactRow icon={FolderPlus} interactive>
                                <RowText>{t('env.addFolder')}</RowText>
                            </CompactRow>
                        </Pressable>
                    ) : null}
                </>
            ) : null}
            {isPcRefusal(addFolder.error) && !isFolderRefusal(addFolder.error) ? <PcOnlyNotice testID="environment-add-pc-only" /> : null}
            {removeFolder.error ? (
                isPcRefusal(removeFolder.error) ? <PcOnlyNotice testID="environment-remove-pc-only" /> : <Notice tone="danger" {...failureNoticeProps(removeFolder.error, t, { withReason: 'mobileApp.env.removeFolderFailed', noReason: 'mobileApp.env.removeFolderFailedShort' })} testID="environment-remove-error" />
            ) : null}
        </Stack>
    );
}

interface FolderRowProps {
    entry: ScopeEntry;
    t: Translate;
    canRemove: boolean;
    busy: boolean;
    confirming: boolean;
    onAsk(): void;
    onCancel(): void;
    onConfirm(): void;
}

function FolderRow({ entry, t, canRemove, busy, confirming, onAsk, onCancel, onConfirm }: FolderRowProps) {
    const name = entry.name || baseName(entry.path);
    const source = t(SOURCE_LABEL[entry.source]);
    // A folder's path says which one it is; a file's row shows where it came from.
    const detail = entry.kind === 'folder' ? entry.path : source;
    return (
        <CompactRow
            icon={entry.kind === 'folder' ? Folder : FileText}
            interactive
            testID={`environment-folder-${entry.path}`}
            end={
                canRemove ? (
                    <IconButton
                        icon={X}
                        size="sm"
                        variant="ghost"
                        label={t('env.remove', { path: isolate(entry.path, 'ltr') })}
                        disabled={busy}
                        onPress={onAsk}
                        testID={`environment-remove-${entry.path}`}
                    />
                ) : null
            }
            below={
                confirming ? (
                    <Stack gap="sm">
                        <Text>{t('mobileApp.env.removeConfirm', { name: isolate(name, 'ltr') })}</Text>
                        <Row gap="sm" stack>
                            <Button label={t('docs.remove')} variant="danger" size="sm" onPress={onConfirm} testID="environment-remove-confirm" />
                            <Button label={t('sp.cancel')} variant="ghost" size="sm" onPress={onCancel} />
                        </Row>
                    </Stack>
                ) : null
            }
        >
            <Stack accessibilityLabel={`${name}. ${source} · ${entry.path}`}>
                <Row gap="sm">
                    <Text role="label" weight="medium" numberOfLines={1}>
                        {isolate(name, 'ltr')}
                    </Text>
                    <Stack flex={1}>
                        <Text role="caption" tone="muted" dir="ltr" align="ltr" numberOfLines={1} ellipsize="middle">
                            {isolate(detail, 'ltr')}
                        </Text>
                    </Stack>
                </Row>
            </Stack>
        </CompactRow>
    );
}

function Internet({ sessionId, env }: { sessionId: string; env: SessionEnvironment | undefined }) {
    const t = useT();
    const { setInternet } = useEnvironmentActions(sessionId);
    const refused = useDeviceRefused('PUT', sessionEnvironmentPath(sessionId, 'internet'));
    if (!env) return null;
    const state = env.internet ? t('env.on') : t('env.off');
    const plain = refused || isPcRefusal(setInternet.error) || !env.internet_enforced;
    return (
        <CompactRow
            icon={Globe}
            interactive={!plain}
            accessibilityLabel={`${t('env.internet')}: ${state}`}
            end={
                plain ? (
                    <RowText tone="muted">{state}</RowText>
                ) : (
                    <Row gap="sm">
                        <RowText tone="muted">{state}</RowText>
                        <MiniSwitch
                            value={env.internet}
                            onValueChange={(on) => setInternet.mutate(on)}
                            disabled={setInternet.isPending}
                            label={`${t('env.internetFor')}. ${env.internet ? t('env.on') : t('env.offBlocked')}`}
                            testID="environment-internet"
                        />
                    </Row>
                )
            }
            below={
                refused || isPcRefusal(setInternet.error) ? (
                    <PcOnlyNotice testID="environment-internet-pc-only" />
                ) : setInternet.error ? (
                    <Notice tone="danger" {...failureNoticeProps(setInternet.error, t, { withReason: 'mobileApp.env.internetFailed', noReason: 'mobileApp.env.internetFailedShort' })} testID="environment-internet-error" />
                ) : null
            }
        >
            <RowText>{t('env.internet')}</RowText>
        </CompactRow>
    );
}

/** The PC's phone access, read from the PC. Turning it on or off is only possible there, so the phone shows it without a switch. */
function PhoneAccess() {
    const t = useT();
    const status = usePhoneAccess();
    const state = status.data ? (status.data.active ? t('env.on') : t('env.off')) : status.isPending ? t('sp.checking') : t('env.notKnownYet');
    return (
        <CompactRow icon={Smartphone} accessibilityLabel={`${t('env.phone')}: ${state}`} end={<RowText tone="muted">{state}</RowText>} testID="environment-phone-access">
            <RowText>{t('env.phone')}</RowText>
        </CompactRow>
    );
}

const MODE_NOTE: Record<PermissionMode, MessageKey> = {
    ask: 'perm.askNote',
    full_access: 'perm.fullNote',
};

/** The chat's permission mode, shared with the composer's chip through the same query. */
function Permission({ sessionId, promptWaiting }: { sessionId: string; promptWaiting?: boolean }) {
    const t = useT();
    const { mode, set } = usePermissionMode(sessionId);
    const confirming = useSessionPanelStore((s) => s.envConfirm?.kind === 'full');
    const setEnvConfirm = useSessionPanelStore((s) => s.setEnvConfirm);
    const [showNote, setShowNote] = useState(false);
    const choose = (next: PermissionMode) => {
        // Full access turns on only from "Turn it on", so a stray tap can't grant it.
        if (next === 'full_access') setEnvConfirm({ kind: 'full' });
        else set.mutate(next);
    };
    return (
        <CompactRow
            icon={mode === 'full_access' ? ShieldAlert : ShieldCheck}
            interactive
            end={
                mode ? (
                    <InlineSegment
                        accessibilityLabel={t('env.permission')}
                        options={[
                            { value: 'ask', label: t.bare('env.ask'), accessibilityLabel: t('env.ask') },
                            { value: 'full_access', label: t.bare('perm.full'), accessibilityLabel: t('perm.full') },
                        ]}
                        value={mode}
                        onChange={(v) => choose(v === 'full_access' ? 'full_access' : 'ask')}
                    />
                ) : set.error ? null : (
                    <RowText tone="muted">{t('sp.checking')}</RowText>
                )
            }
            below={
                <>
                    {mode && showNote ? <Text role="caption" tone="muted">{t(MODE_NOTE[mode])}</Text> : null}
                    {mode === 'full_access' && promptWaiting ? (
                        <View accessibilityLiveRegion="polite" testID="environment-full-pending">
                            <Text role="caption" tone="muted">{t('perm.fullPendingNote')}</Text>
                        </View>
                    ) : null}
                    {confirming ? (
                        <Stack gap="sm">
                            <Notice tone="warning" message={t('mobileApp.env.fullAccessWarn')} />
                            <Row gap="sm" stack>
                                <Button
                                    label={t('env.turnOn')}
                                    size="sm"
                                    variant="danger"
                                    onPress={() => {
                                        setEnvConfirm(null);
                                        set.mutate('full_access');
                                    }}
                                    testID="environment-full-access-confirm"
                                />
                                <Button label={t('sp.cancel')} size="sm" variant="ghost" onPress={() => setEnvConfirm(null)} />
                            </Row>
                        </Stack>
                    ) : null}
                    {set.error ? (isPcRefusal(set.error) ? <PcOnlyNotice testID="environment-mode-pc-only" /> : <Notice tone="danger" {...failureNoticeProps(set.error, t, { withReason: 'mobileApp.env.modeFailed', noReason: 'mobileApp.env.modeFailedShort' })} testID="environment-mode-error" />) : null}
                </>
            }
        >
            <Row gap="xs">
                <RowText>{t('env.permissionShort')}</RowText>
                {mode ? <IconButton icon={Info} size="sm" variant="ghost" label={t('env.aboutPermission')} onPress={() => setShowNote((v) => !v)} /> : null}
            </Row>
        </CompactRow>
    );
}

interface Place {
    remote: boolean;
    name: string | null;
    description: string | null;
}

/** Where this chat is answered: a cloud provider the chat or the picked model names, this PC, or unknown. */
function placeOf(session: Session | undefined, active: ActiveModel | undefined): Place | null {
    const pickIsStale = !!session?.effective_model && !!active?.model && session.effective_model !== active.model;
    if (active?.remote && !(pickIsStale && session?.inference_remote !== undefined && session?.inference_remote !== null)) {
        return { remote: true, name: active.provider_name ?? null, description: null };
    }
    if (session?.inference_remote === true) return { remote: true, name: session.inference_provider_name ?? null, description: session.inference_description ?? null };
    if (session?.inference_remote === false) return { remote: false, name: null, description: null };
    if (!session && active?.inference_remote === false) return { remote: false, name: null, description: null };
    return null;
}

/** Lemonade ids compare case-insensitively, with or without the `user.` prefix. */
function sameModel(a: string, b: string): boolean {
    const norm = (id: string) => id.toLowerCase().replace(/^user\./, '');
    return norm(a) === norm(b);
}

function RunsOn({ sessionId }: { sessionId: string }) {
    const t = useT();
    const session = useSession(sessionId);
    const active = useActiveModel();
    const place = placeOf(session.data, active.data);
    const local = useLocalModelStatus(false);
    const runs = t('env.runsOn');
    if (place?.remote) {
        const text = t('env.cloudPlace', { name: place.name ?? t('ctx.cloud') });
        return (
            <CompactRow icon={Cloud} accessibilityLabel={`${runs}: ${text}`} below={place.description ? <Text role="caption" tone="muted">{place.description}</Text> : null}>
                <RowText>{text}</RowText>
            </CompactRow>
        );
    }
    if (!place) {
        const text = session.isPending || active.isPending ? t('sp.checking') : t('env.notKnownYet');
        return (
            <CompactRow icon={Monitor} accessibilityLabel={`${runs}: ${text}`}>
                <RowText tone="muted">{text}</RowText>
            </CompactRow>
        );
    }
    return <LocalPlace status={local.data} error={local.error} chatModel={session.data?.effective_model || active.data?.model || null} t={t} />;
}

function LocalPlace({ status, error, chatModel, t }: { status: LocalModelStatus | undefined; error: unknown; chatModel: string | null; t: Translate }) {
    // The server may have another chat's model loaded; describe it only when it is this chat's.
    const other = !!(status?.model && chatModel && !sameModel(status.model, chatModel));
    const memory = other ? null : status?.memory;
    const device = !other && status?.placement?.label ? ` · ${status.placement.label}` : '';
    const place = `${t('mobileApp.env.yourPc')}${device}`;
    const modelName = !other && status?.display_name ? `${status.display_name}${status.state !== 'loaded' ? ` · ${status.state}` : ''}` : null;
    const window = !other && status?.ctx_size ? t('settings.ctx.tokens', { size: formatWindow(status.ctx_size) }) : null;
    const memoryText = memory
        ? [
              memory.model_gb != null ? t('env.inUse', { gb: memory.model_gb.toFixed(1) }) : t('env.inUseUnknown'),
              memory.free_gb != null ? t('env.free', { gb: memory.free_gb.toFixed(1) }) : null,
          ]
              .filter(Boolean)
              .join(' · ')
        : null;
    return (
        <Stack>
            <CompactRow icon={Monitor} accessibilityLabel={`${t('env.runsOn')}: ${place}`}>
                <RowText>{place}</RowText>
            </CompactRow>
            {other ? (
                <CompactRow icon={Cpu}>
                    <RowText tone="muted">{t('env.notLoaded', { model: isolate(chatModel!, 'ltr') })}</RowText>
                </CompactRow>
            ) : modelName ? (
                <CompactRow
                    icon={Cpu}
                    accessibilityLabel={[modelName, window, memoryText].filter(Boolean).join(', ')}
                    end={window ? <RowText tone="muted">{isolate(window, 'ltr')}</RowText> : null}
                >
                    <RowText>{isolate(modelName, 'ltr')}</RowText>
                </CompactRow>
            ) : null}
            {error ? <Notice tone="danger" {...failureNoticeProps(error, t, { withReason: 'mobileApp.env.statusError', noReason: 'mobileApp.env.statusErrorShort' })} testID="environment-status-error" /> : status?.error ? <Notice tone="danger" message={status.error} /> : null}
            {!status && !error ? <RowText tone="muted">{t('sp.checking')}</RowText> : null}
        </Stack>
    );
}
