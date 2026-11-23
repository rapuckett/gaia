// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useRouter } from 'expo-router';
import { Image, ScrollView, View, type ImageSourcePropType } from 'react-native';
import { useCallback, useMemo, useState } from 'react';

import { APP_NAME } from '@webui/utils/constants';
import { hiddenAutomatedCount } from '@webui/utils/sessionGrouping';

import { useDeleteSession, useMarkRead, useRenameSession, useSessions, useSessionSearch, useSetPinned, useSetupStatus } from '@/data';
import { ModelStatusPill } from '@/features/model';
import { openSettings } from '@/features/settings/openSettings';
import { useGateUnreachable } from '@/features/setup/gateUnreachable';
import { DownloadChip } from '@/features/setup/DownloadChip';
import { useDownloadQueue } from '@/features/settings/panes/model/downloadQueue';
import { chipView } from '@/features/setup/steps/downloadState';
import { NotificationsEntry } from '@/features/notifications';
import { GaiaApiError } from '@/api/errors';
import { describeErrorWith, describeHttpFailure, ltr, useT } from '@/i18n/useT';
import {
    Button,
    Chip,
    EmptyState,
    Icon,
    IconButton,
    ListRow,
    ListSkeleton,
    Notice,
    Row,
    Screen,
    SearchField,
    SectionHeader,
    SectionList,
    Stack,
    Spacer,
    StatusDot,
    Text,
} from '@/ui';
import { TITLE_MAX_FONT_SCALE, useLargeText } from '@/ui/theme/a11y';
import { CircleAlert, Ellipsis, EyeOff, Monitor, SquarePen, X } from '@/ui/icons';

import { ChatRowSheets, type RowSheet } from './ChatRowSheets';
import { declaredNavEntries, type NavEntry } from './navEntries';
import { SearchResultRow } from './SearchResultRow';
import { useShowAutomated } from './showAutomated';
import { useMarkReadWhenSeen } from './useMarkReadWhenSeen';
import { useNow } from './useNow';
import {
    buildChatSections,
    chatListState,
    rowFailure,
    rowText,
    searchedSessions,
    statusTone,
    type ChatRow,
    type ChatSection,
    type LiveRuns,
    type QueuedMessage,
    type RowErrorKind,
} from './chatList';

export interface ChatListError {
    kind: RowErrorKind;
    error: unknown;
}

export interface ChatDrawerContentProps {
    activeId?: string | null;
    /** Opens the chat; the drawer closes itself after the pick. */
    onSelect: (sessionId: string) => void;
    /** Shows the close button when given; a permanent sidebar has nothing to close. */
    onClose?: () => void;
    /** Shows a New chat button in the header when given. */
    onNewChat?: () => void;
    /** Route names the navigator declares; the section entries for the others stay hidden. */
    routeNames?: readonly string[];
    /** The section open now, so its entry is the only selected row. */
    activeRoute?: string | null;
    onOpenRoute?: (route: string) => void;
    /** Shows a Your PCs button in the header when given. */
    onPcs?: () => void;
    live?: LiveRuns;
    queues?: Readonly<Record<string, readonly QueuedMessage[]>>;
    /** The last failed row action, shown as an alert until the next one succeeds. */
    error?: ChatListError | null;
    /** Dev gallery only: opens with this search typed, or this row's sheet already open. */
    dev?: { query?: string; sheet?: { rowId: string; mode: RowSheet['mode'] } };
}

export function ChatDrawerContent({ activeId, onSelect, onClose, onNewChat, onPcs, routeNames = [], activeRoute, onOpenRoute, live, queues, error, dev }: ChatDrawerContentProps) {
    const t = useT();
    const sessions = useSessions();
    const now = useNow();
    const [text, setText] = useState(dev?.query ?? '');
    const [showAutomated, toggleAutomated] = useShowAutomated();
    const search = useSessionSearch(text, showAutomated);
    const entries = useMemo(() => declaredNavEntries(routeNames), [routeNames]);
    const q = text.trim();
    const open = useCallback((route: string) => {
        setText('');
        onOpenRoute?.(route);
    }, [onOpenRoute]);
    // Opening a chat or leaving the drawer ends the search.
    const select = useCallback((id: string) => {
        setText('');
        onSelect(id);
    }, [onSelect]);
    const close = useCallback(() => {
        setText('');
        onClose?.();
    }, [onClose]);
    const newChat = useCallback(() => {
        setText('');
        onNewChat?.();
    }, [onNewChat]);
    const hits = useMemo(
        () => new Map(search.query === q ? (search.data?.results ?? []).map((r) => [r.session_id, r]) : []),
        [search.query, search.data, q],
    );
    const shown = useMemo(
        () => (q ? searchedSessions(sessions.data?.sessions ?? [], q, hits) : (sessions.data?.sessions ?? [])),
        [sessions.data, q, hits],
    );
    const sections = useMemo(
        () => buildChatSections({ sessions: shown, activeId, live, queues, now, showAutomated }),
        [shown, activeId, live, queues, now, showAutomated],
    );
    const hiddenCount = hiddenAutomatedCount([...(sessions.data?.sessions ?? [])]);
    const state = chatListState(sessions, sections);
    const searchFailed = q !== '' && search.query === q && search.isError;
    const settled = search.settled || searchFailed;
    const rowCount = sections.reduce((n, s) => n + s.data.length, 0);

    const [failure, setFailure] = useState<ChatListError | null>(null);
    const [picked, setPicked] = useState<RowSheet | null>(null);
    const [devSheet, setDevSheet] = useState(dev?.sheet);
    const devRow = devSheet ? sections.flatMap((s) => s.data).find((r) => r.id === devSheet.rowId) : undefined;
    const target = picked ?? (devSheet && devRow ? { row: devRow, mode: devSheet.mode } : null);
    const setTarget = (next: RowSheet | null) => {
        setDevSheet(undefined);
        setPicked(next);
    };
    const outcome = (kind: RowErrorKind) => ({
        onSuccess: () => setFailure(null),
        onError: (e: unknown) => setFailure({ kind, error: e }),
    });
    const router = useRouter();
    const rename = useRenameSession();
    const setPinned = useSetPinned();
    const remove = useDeleteSession(activeId, () => router.replace('/'));
    const markRead = useMarkRead();
    const mutateRead = markRead.mutate;
    const markSeen = useCallback((id: string) => mutateRead(id, { onError: (e) => setFailure({ kind: 'markRead', error: e }) }), [mutateRead]);
    useMarkReadWhenSeen(activeId, sessions.data?.sessions.find((s) => s.id === activeId)?.unread, markSeen);
    const alert = failure ?? error;
    const largeText = useLargeText();
    const gateUnreachable = useGateUnreachable();

    // A typed query hides the nav rows so the match count and results sit under the field, above the keyboard.
    const navRows = q !== '' ? null : (
        <>
            {onNewChat ? (
                <View style={{ flexShrink: 0 }}>
                    <ListRow title={t('sidebar.newChat')} titleMaxScale={TITLE_MAX_FONT_SCALE} leading={<Icon icon={SquarePen} size="sm" tone="secondary" />} onPress={newChat} />
                </View>
            ) : null}
            {entries.filter((e) => !e.footer).map((e) => (
                <NavRow key={e.key} entry={e} active={activeRoute === e.route} onOpen={open} />
            ))}
        </>
    );
    const footerRows = (
        <View style={{ flexShrink: 0 }}>
            <DownloadChipRow onPress={() => { close(); openSettings('model'); }} />
            {entries.filter((e) => e.footer).map((e) => (
                <NavRow key={e.key} entry={e} active={activeRoute === e.route} onOpen={open} />
            ))}
            <View style={{ flexShrink: 0 }}>
                <NotificationsEntry active={activeRoute === 'notifications'} onOpen={() => open('notifications')} />
            </View>
            <ModelStatusPill />
        </View>
    );
    const notices = (
        <>
            {alert ? (
                <Stack paddingX="gutter" paddingY="xs">
                    <Notice tone="danger" {...rowFailure(alert.kind, alert.error, t)} />
                </Stack>
            ) : null}
            {state === 'loading' ? <ListSkeleton rows={8} /> : null}
            {state === 'error' ? <ListError error={sessions.error} unavailable={gateUnreachable} onRetry={() => void sessions.refetch()} /> : null}
            {state === 'empty' && q === '' ? <EmptyState title={t('sidebar.empty')} /> : null}
            {q !== '' && searchFailed ? (
                <Notice
                    tone="danger"
                    title={t('mobileApp.chats.searchFailedLabel')}
                    message={search.error instanceof GaiaApiError ? ltr(search.error.detail) : t.compose((say) => describeErrorWith(search.error, say))}
                />
            ) : null}
            {q !== '' && !searchFailed && settled && search.data?.truncated ? (
                <Notice tone="info" role="note" message={t('sidebar.searchCapped', { n: search.data.results.length })} />
            ) : null}
            {q !== '' && settled && rowCount > 0 ? (
                <Stack paddingX="lg" paddingY="xs">
                    <Text role="caption" tone="muted">{t.plural('sidebar.matchCount', rowCount)}</Text>
                </Stack>
            ) : null}
            {q !== '' && rowCount === 0 && state !== 'loading' && state !== 'error' ? (
                <EmptyState title={settled ? t('sidebar.noMatch') : t('sidebar.searching')} />
            ) : null}
        </>
    );
    const automated =
        hiddenCount > 0 ? (
            <Stack paddingX="lg" paddingY="sm">
                <Chip
                    label={showAutomated ? t('sidebar.hideBackground') : t.plural('sidebar.showBackground', hiddenCount)}
                    selected={showAutomated}
                    onPress={toggleAutomated}
                />
            </Stack>
        ) : null;
    // The rows above the chats scroll with them, so a short sidebar never squeezes rows into each other; at large text sizes the pinned footer scrolls too.
    const list =
        state === 'list' ? (
            <SectionList<ChatRow, ChatSection>
                sections={sections}
                automaticallyAdjustKeyboardInsets
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                keyExtractor={(row) => row.id}
                accessibilityLabel={t('sidebar.recent')}
                ListHeaderComponent={<>{navRows}{notices}</>}
                ListFooterComponent={<>{automated}{largeText ? footerRows : null}</>}
                renderSectionHeader={({ section }) => <SectionHeader title={t(section.titleKey)} />}
                renderItem={({ item }) =>
                    q ? (
                        <SearchResultRow
                            row={item}
                            query={q}
                            snippet={hits.get(item.id)?.field === 'message' ? hits.get(item.id)!.snippet : null}
                            onSelect={select}
                        />
                    ) : (
                        <ChatListRow row={item} onSelect={select} onMore={(row) => setTarget({ row, mode: 'menu' })} />
                    )
                }
            />
        ) : null;

    return (
        <Screen
            edges={['top', 'bottom', 'start']}
            banner={null}
            footerBleed
            header={<Header onClose={onClose ? close : undefined} onPcs={onPcs} />}
            footer={largeText ? undefined : footerRows}
        >
            <Stack paddingX="lg" paddingY="sm">
                <SearchField value={text} onChangeText={setText} placeholder={t.bare('sidebar.search')} accessibilityLabel={t('sidebar.search')} />
            </Stack>
            {list ?? (
                <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
                    {navRows}
                    {notices}
                    {automated}
                    {largeText ? footerRows : null}
                </ScrollView>
            )}
            <ChatRowSheets
                target={target}
                onTarget={setTarget}
                onRename={(id, title) => rename.mutate({ sessionId: id, title }, outcome('rename'))}
                onSetPinned={(id, pinned) => setPinned.mutate({ id, pinned }, outcome(pinned ? 'pin' : 'unpin'))}
                onDelete={(id) => remove.mutate(id, outcome('delete'))}
            />
        </Screen>
    );
}

/** The chat list's failure, list-sized: it scrolls with the rows and is never clipped. While the main pane already says the PC is unreachable, one muted line with no retry. */
function ListError({ error, unavailable, onRetry }: { error: unknown; unavailable: boolean; onRetry: () => void }) {
    const t = useT();
    const failure = unavailable ? { text: t('mobileApp.chats.listUnavailable'), detail: undefined } : describeHttpFailure(error, t);
    return (
        <Stack paddingX="lg" paddingY="sm" gap="sm" align="start">
            <Row gap="sm" align="start">
                {unavailable ? null : <Icon icon={CircleAlert} size="sm" tone="danger" />}
                <Stack flex={1} gap="xs">
                    <Text role="label" tone="muted" accessibilityRole={unavailable ? undefined : 'alert'}>{failure.text}</Text>
                    {failure.detail ? <Text role="caption" tone="muted" dir="ltr">{failure.detail}</Text> : null}
                </Stack>
            </Row>
            {unavailable ? null : <Button size="sm" label={t('msg.tryAgain')} onPress={onRetry} />}
        </Stack>
    );
}

// The same mark as the web sidebar's brand.
const gaiaRobot: ImageSourcePropType = require('@webui/assets/gaia-robot.png');

/** The download progress chip above the footer; nothing, not even its padding, while no download runs. */
function DownloadChipRow({ onPress }: { onPress: () => void }) {
    const status = useSetupStatus();
    const queued = useDownloadQueue((s) => s.queue.length);
    const started = useDownloadQueue((s) => s.started);
    if (!chipView(status.data, queued, started)) return null;
    return (
        <Stack paddingX="lg" paddingY="xs">
            <DownloadChip onPress={onPress} />
        </Stack>
    );
}

function Header({ onClose, onPcs }: { onClose?: () => void; onPcs?: () => void }) {
    const t = useT();
    const largeText = useLargeText();
    const brand = (
        <>
            <Image source={gaiaRobot} accessible={false} style={{ width: 22, height: 22 }} />
            <Stack flex={1}>
                <Text role="title" weight="semibold">{APP_NAME}</Text>
            </Stack>
        </>
    );
    const buttons = (
        <>
            {onPcs ? <IconButton icon={Monitor} label={t('mobileApp.pairing.pcs.title')} onPress={onPcs} testID="pcs-drawer-button" /> : null}
            {onClose ? <IconButton icon={X} label={t('sidebar.collapse')} onPress={onClose} /> : null}
        </>
    );
    // At large text sizes the name gets its own line, so three buttons beside it don't break it mid-word.
    if (largeText) {
        return (
            <Stack paddingX="lg" paddingY="sm" gap="xs" accessibilityRole="header">
                <Row gap="sm">
                    <Spacer />
                    {buttons}
                </Row>
                <Row gap="sm">{brand}</Row>
            </Stack>
        );
    }
    return (
        <Stack paddingX="lg" paddingY="sm">
            <Row gap="sm" accessibilityRole="header">
                {brand}
                {buttons}
            </Row>
        </Stack>
    );
}

function NavRow({ entry, active, onOpen }: { entry: NavEntry; active: boolean; onOpen: (route: string) => void }) {
    const t = useT();
    return (
        <View style={{ flexShrink: 0 }}>
            <ListRow
                title={t(entry.labelKey)}
                titleMaxScale={TITLE_MAX_FONT_SCALE}
                selected={active}
                leading={<Icon icon={entry.icon} size="sm" tone="secondary" />}
                onPress={() => onOpen(entry.route)}
            />
        </View>
    );
}

function ChatListRow({ row, onSelect, onMore }: { row: ChatRow; onSelect: (sessionId: string) => void; onMore: (row: ChatRow) => void }) {
    const t = useT();
    const text = rowText(row, t);
    return (
        <ListRow
            title={row.title}
            titleLargeLines={2}
            emphasized={row.unread}
            selected={row.active}
            accessibilityLabel={text.aria}
            onPress={() => onSelect(row.id)}
            onLongPress={() => onMore(row)}
            trailing={<IconButton icon={Ellipsis} size="sm" label={t('row.moreActions', { title: row.title })} onPress={() => onMore(row)} />}
            leading={
                <Row gap="xs">
                    {row.dot && text.status ? <StatusDot tone={statusTone(row.dot)} label={text.status} /> : null}
                    {row.private ? <Icon icon={EyeOff} size="sm" label={t('row.private')} /> : null}
                </Row>
            }
            subtitle={text.note ?? undefined}
            subtitleTone={text.noteFailed ? 'danger' : undefined}
        />
    );
}
