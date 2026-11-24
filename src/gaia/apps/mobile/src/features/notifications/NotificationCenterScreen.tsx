// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView as RNScrollView, useWindowDimensions, View, type AccessibilityActionEvent, type ScrollView } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { isolate } from '@webui/i18n/registry';
import type { GaiaNotification, NotificationType } from '@webui/types/agent';

import { useConfirmTool } from '@/data';
import { useApprovalArm } from '@/features/chat/permission/useApprovalArm';
import { describeHttpFailure, useDirection, useLocaleCode, useT } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';
import {
    clearNotifications,
    dismissNotification,
    FILTER_ORDER,
    markAllNotificationsRead,
    markNotificationRead,
    recordNotificationResponse,
    selectUnreadCount,
    selectVisible,
    setNotificationFilter,
    useNotificationStore,
} from '@/state/notifications';
import { usePermissionPromptStore } from '@/state/permissionPrompts';
import { Badge, Button, Chip, Divider, EmptyState, FirstLine, Icon, IconButton, Notice, Pressable, Row, Screen, Stack, Text, useTheme } from '@/ui';
import { useLargeText } from '@/ui/theme/a11y';
import { Bell, Check, CircleAlert, CircleCheck, Info, ShieldAlert, Trash2, TriangleAlert, X, type LucideIcon } from '@/ui/icons';

import { SettingsHeader } from '../settings/SettingsHeader';
import { FILTER_LABELS, notificationText, relativeTime } from './notificationText';

const ICONS: Record<NotificationType, { icon: LucideIcon; tone: 'accent' | 'warning' | 'danger' | 'success' | 'secondary' }> = {
    permission_request: { icon: ShieldAlert, tone: 'warning' },
    policy_alert: { icon: ShieldAlert, tone: 'warning' },
    security_alert: { icon: TriangleAlert, tone: 'danger' },
    status_change: { icon: CircleCheck, tone: 'success' },
    info: { icon: Info, tone: 'accent' },
    error: { icon: CircleAlert, tone: 'danger' },
};

/** The notification center: a pushed screen, opened from the bell in the drawer's footer. */
export function NotificationCenterScreen({ onBack, onOpenChat, receiptId }: { onBack: () => void; onOpenChat: (sessionId: string) => void; receiptId?: string }) {
    const t = useT();
    const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
    const { height: windowHeight } = useWindowDimensions();
    const [laidOut, setLaidOut] = useState<{ id: string; y: number; height: number } | null>(null);
    const items = useNotificationStore(useShallow(selectVisible));
    const filter = useNotificationStore((s) => s.filter);
    const unread = useNotificationStore(selectUnreadCount);
    const pending = useChatStreamStore(useShallow((s) => Object.values(s.turns).flatMap((turn) => turn.pendingPermission?.confirm_id ?? [])));
    const history = usePermissionPromptStore((s) => s.history);
    const now = useNow();
    const locale = useLocaleCode();
    const target = receiptId ? items.find((n) => n.type === 'policy_alert' && n.receiptId === receiptId) : undefined;
    const targetId = target?.id;

    // As the web UI does, center the receipt's notification once it has been laid out.
    useEffect(() => {
        if (!laidOut || laidOut.id !== targetId) return;
        scrollRef.current?.scrollTo({ y: Math.max(0, laidOut.y - (windowHeight - laidOut.height) / 2), animated: true });
    }, [laidOut, targetId, windowHeight]);

    return (
        <Screen
            scrollRef={scrollRef}
            header={
                <SettingsHeader
                    title={t('notifications.title')}
                    backLabel={t('setup.back')}
                    onBack={onBack}
                    titleEnd={unread > 0 ? <Badge shape="pill" label={String(unread)} tone="accent" /> : undefined}
                />
            }
            footer={
                items.length > 0 ? (
                    <Row gap="sm" justify="between">
                        <Button label={t.bare('notifications.markAllRead')} accessibilityLabel={t('notifications.markAllRead')} icon={Check} variant="secondary" size="sm" disabled={unread === 0} onPress={markAllNotificationsRead} testID="ntf-mark-all" />
                        <Button label={t('notifications.clear')} icon={Trash2} variant="danger" size="sm" onPress={clearNotifications} testID="ntf-clear" />
                    </Row>
                ) : undefined
            }
            footerDivider
            scroll
        >
            <FilterRow filter={filter} />
            {receiptId && !target ? (
                <Stack paddingX="gutter" paddingY="sm">
                    <Notice tone="warning" message={t('activity.policy.receiptUnavailable')} testID="ntf-receipt-missing" />
                </Stack>
            ) : null}
            {items.length === 0 ? (
                <EmptyState title={t('notifications.empty')} icon={Bell} />
            ) : (
                items.map((n) => (
                    <NotificationItem
                        key={n.id}
                        n={n}
                        now={now}
                        locale={locale}
                        waiting={pending.includes(n.confirmId ?? n.id)}
                        answered={n.response ?? history[n.sessionId ?? '']?.find((h) => h.id === n.id)?.response}
                        onOpenChat={onOpenChat}
                        onLaidOut={n.id === targetId ? (y, height) => setLaidOut({ id: n.id, y, height }) : undefined}
                    />
                ))
            )}
        </Screen>
    );
}

const FADE_STEPS = [0.15, 0.35, 0.55, 0.75, 0.9];

/** One scrolling row of filter chips: a fade marks more to the side, and the selected chip is kept in view. */
function FilterRow({ filter }: { filter: NotificationType | null }) {
    const t = useT();
    const { colors, space } = useTheme();
    const dir = useDirection();
    const ref = useRef<ComponentRef<typeof RNScrollView>>(null);
    const xs = useRef<Record<string, number>>({});
    const [box, setBox] = useState({ view: 0, content: 0 });
    const [offset, setOffset] = useState(0);
    const key = filter ?? 'all';
    const more = box.content > box.view + 1 && offset < box.content - box.view - 1;
    const reveal = () => {
        const x = xs.current[key];
        if (x !== undefined && dir === 'ltr') ref.current?.scrollTo({ x: Math.max(0, x - space.gutter), animated: true });
    };
    useEffect(reveal, [key, box.content]); // eslint-disable-line react-hooks/exhaustive-deps
    const chip = (id: string, label: string, kind: NotificationType | null) => (
        <View key={id} onLayout={(e) => { xs.current[id] = e.nativeEvent.layout.x; if (id === key) reveal(); }}>
            <Chip role="tab" label={label} selected={filter === kind} onPress={() => setNotificationFilter(kind)} testID={`ntf-filter-${id}`} />
        </View>
    );
    return (
        <View>
            <RNScrollView
                ref={ref}
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityRole="tablist"
                contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.gutter, paddingVertical: space.sm }}
                onLayout={(e) => setBox((b) => ({ ...b, view: e.nativeEvent.layout.width }))}
                onContentSizeChange={(w) => setBox((b) => ({ ...b, content: w }))}
                onScroll={(e) => setOffset(e.nativeEvent.contentOffset.x)}
                scrollEventThrottle={64}
                testID="ntf-filters"
            >
                {chip('all', t('notifications.filter.all'), null)}
                {FILTER_ORDER.map((kind) => chip(kind, t(FILTER_LABELS[kind]), kind))}
            </RNScrollView>
            {more ? (
                <View pointerEvents="none" testID="ntf-filters-fade" style={{ position: 'absolute', end: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
                    {(dir === 'ltr' ? FADE_STEPS : [...FADE_STEPS].reverse()).map((o, i) => (
                        <View key={i} style={{ width: 6, backgroundColor: colors.bgPrimary, opacity: o }} />
                    ))}
                </View>
            ) : null}
        </View>
    );
}

function useNow(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, []);
    return now;
}

interface ItemProps {
    n: GaiaNotification;
    now: number;
    locale: string;
    /** The chat's turn is still blocked on this approval. */
    waiting: boolean;
    answered: GaiaNotification['response'];
    onOpenChat: (sessionId: string) => void;
    onLaidOut?: (y: number, height: number) => void;
}

function NotificationItem({ n, now, locale, waiting, answered, onOpenChat, onLaidOut }: ItemProps) {
    const t = useT();
    const confirm = useConfirmTool();
    const arm = useApprovalArm();
    const { icon, tone } = ICONS[n.type];
    const { title, message } = useMemo(() => notificationText(n, t), [n, t]);
    const approval = n.type === 'permission_request';
    const failed = confirm.isError ? describeHttpFailure(confirm.error, t) : null;
    // At large text sizes the time goes under the agent's name, which it would otherwise squeeze to nothing.
    const largeText = useLargeText();
    const { colors } = useTheme();
    const meta = (
        <Row gap="xs">
            <Text role="caption" tone="muted">{relativeTime(n.timestamp, now, t, locale)}</Text>
            {n.read ? null : <View testID={`ntf-unread-${n.id}`} accessible={false} importantForAccessibility="no" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentSolid }} />}
        </Row>
    );

    const answer = (approved: boolean) => {
        if (!n.sessionId) return;
        confirm.mutate(
            { session_id: n.sessionId, approved, always: false, confirm_id: n.confirmId },
            { onSuccess: () => recordNotificationResponse(n.id, approved ? 'allow' : 'deny') },
        );
    };
    const open = () => {
        markNotificationRead(n.id);
        if (n.sessionId && !approval) onOpenChat(n.sessionId);
    };

    // iOS reads the row as one element and hides the buttons inside it, so each is also an action on the row.
    const canAnswer = approval && !answered && waiting;
    const actions = [
        { name: 'dismiss', label: t('notifications.dismiss') },
        ...(canAnswer ? [{ name: 'approve', label: t('notifications.approve') }, { name: 'deny', label: t('notifications.deny') }] : []),
    ];
    const onAction = (e: AccessibilityActionEvent) => {
        const name = e.nativeEvent.actionName;
        if (name === 'dismiss') dismissNotification(n.id);
        else if (name === 'approve') answer(true);
        else if (name === 'deny') answer(false);
    };

    // A row arriving above, or this row's buttons appearing, moves Approve and Deny: their taps wait again.
    return (
        <View
            testID={`ntf-${n.id}`}
            onLayout={(e) => {
                arm.rearm();
                onLaidOut?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height);
            }}
        >
            <Divider />
            <Pressable
                onPress={open}
                accessibilityLabel={[n.read ? null : t('row.unread'), title, message].filter(Boolean).join('. ')}
                accessibilityActions={actions}
                onAccessibilityAction={onAction}
            >
                <Stack gap="xs" paddingX="lg" paddingY="md">
                    <Row gap="sm" align={largeText ? 'start' : 'center'}>
                        <FirstLine role="caption">
                            <Icon icon={icon} size="sm" tone={tone} />
                        </FirstLine>
                        <Stack flex={1}>
                            <Text role="caption" tone="muted" numberOfLines={1}>{n.agentName}</Text>
                            {largeText ? meta : null}
                        </Stack>
                        {largeText ? null : meta}
                        <IconButton icon={X} size="sm" label={t('notifications.dismiss')} onPress={() => dismissNotification(n.id)} />
                    </Row>
                    <Text role="ui" weight={n.read ? 'regular' : 'semibold'} testID={`ntf-title-${n.id}`}>{title}</Text>
                    <Text role="label" tone="secondary">{message}</Text>
                    {n.type === 'policy_alert' ? <PolicyDetails n={n} /> : null}
                    {canAnswer ? (
                        <Row gap="sm" stack>
                            <Stack flex={1}>
                                <Button label={t('notifications.approve')} icon={Check} full disabled={confirm.isPending} onPress={() => arm.armed() && answer(true)} testID="ntf-approve" />
                            </Stack>
                            <Stack flex={1}>
                                <Button label={t('notifications.deny')} icon={X} variant="danger" full disabled={confirm.isPending} onPress={() => arm.armed() && answer(false)} testID="ntf-deny" />
                            </Stack>
                        </Row>
                    ) : null}
                    {approval && answered ? (
                        <Badge label={answered === 'allow' ? t('notifications.approved') : t('notifications.denied')} tone={answered === 'allow' ? 'success' : 'danger'} />
                    ) : null}
                    {approval && !answered && !waiting ? <Text role="caption" tone="muted">{t('prompt.expired')}</Text> : null}
                    {failed ? <Notice tone="danger" message={failed.text} detail={failed.detail} /> : null}
                </Stack>
            </Pressable>
        </View>
    );
}

function PolicyDetails({ n }: { n: GaiaNotification }) {
    const t = useT();
    const line = (label: string, value: string) => (
        <Row gap="sm" wrap>
            <Text role="caption" tone="muted">{label}</Text>
            <Text role="caption" code>{value}</Text>
        </Row>
    );
    return (
        <Stack gap="xs">
            {n.tool ? line(t('activity.policy.tool'), n.tool) : null}
            {n.reason ? <Text role="caption" tone="muted">{t('notifications.reason')}: {isolate(n.reason, 'ltr')}</Text> : null}
            {n.ruleIds && n.ruleIds.length > 0 ? line(t('activity.policy.rules'), n.ruleIds.join(', ')) : null}
            {n.policyVersion ? line(t('activity.policy.policy'), n.policyVersion) : null}
            {n.receiptId ? line(t('activity.policy.receipt'), n.receiptId) : (
                <Text role="caption" tone="muted">{t('activity.policy.receiptUnavailable')}</Text>
            )}
        </Stack>
    );
}
