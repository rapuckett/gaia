// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useWindowDimensions, View, type AccessibilityActionEvent, type ScrollView } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import type { GaiaNotification, NotificationType } from '@webui/types/agent';

import { useConfirmTool } from '@/data';
import { describeHttpFailure, useLocaleCode, useT } from '@/i18n/useT';
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
import { Badge, Button, Chip, Divider, EmptyState, FirstLine, Icon, IconButton, Notice, Pressable, Row, Screen, Stack, StatusDot, Text } from '@/ui';
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
                    <Stack>
                        <Row gap="sm" stack>
                            <Stack flex={1}>
                                <Button label={t.bare('notifications.markAllRead')} accessibilityLabel={t('notifications.markAllRead')} icon={Check} variant="secondary" full disabled={unread === 0} onPress={markAllNotificationsRead} testID="ntf-mark-all" />
                            </Stack>
                            <Stack flex={1}>
                                <Button label={t('notifications.clear')} icon={Trash2} variant="secondary" full onPress={clearNotifications} testID="ntf-clear" />
                            </Stack>
                        </Row>
                    </Stack>
                ) : undefined
            }
            scroll
        >
            <Stack paddingX="gutter" paddingY="sm">
                <Row gap="sm" wrap accessibilityRole="tablist">
                    <Chip label={t('notifications.filter.all')} selected={filter === null} onPress={() => setNotificationFilter(null)} />
                    {FILTER_ORDER.map((kind) => (
                        <Chip key={kind} label={t(FILTER_LABELS[kind])} selected={filter === kind} onPress={() => setNotificationFilter(kind)} />
                    ))}
                </Row>
            </Stack>
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
    const { icon, tone } = ICONS[n.type];
    const { title, message } = useMemo(() => notificationText(n, t), [n, t]);
    const approval = n.type === 'permission_request';
    const failed = confirm.isError ? describeHttpFailure(confirm.error, t) : null;
    // At large text sizes the time goes under the agent's name, which it would otherwise squeeze to nothing.
    const largeText = useLargeText();
    const time = <Text role="caption" tone="muted">{relativeTime(n.timestamp, now, t, locale)}</Text>;

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

    return (
        <View testID={`ntf-${n.id}`} onLayout={onLaidOut ? (e) => onLaidOut(e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}>
            <Divider />
            <Pressable
                onPress={open}
                accessibilityLabel={[n.read ? null : t('row.unread'), title, message].filter(Boolean).join('. ')}
                accessibilityActions={actions}
                onAccessibilityAction={onAction}
            >
                <Stack gap="xs" paddingX="lg" paddingY="md">
                    <Row gap="sm" align={largeText ? 'start' : 'center'}>
                        {!n.read ? (
                            <FirstLine role="label">
                                <StatusDot tone="attention" label={t('sidebar.notificationsUnread', { n: 1 })} />
                            </FirstLine>
                        ) : null}
                        <FirstLine role="label">
                            <Icon icon={icon} size="sm" tone={tone} />
                        </FirstLine>
                        <Stack flex={1}>
                            <Text role="label" weight="semibold" numberOfLines={1}>{n.agentName}</Text>
                            {largeText ? time : null}
                        </Stack>
                        {largeText ? null : time}
                        <IconButton icon={X} size="sm" label={t('notifications.dismiss')} onPress={() => dismissNotification(n.id)} />
                    </Row>
                    <Text role="ui" weight="semibold">{title}</Text>
                    <Text role="ui" tone="secondary">{message}</Text>
                    {n.type === 'policy_alert' ? <PolicyDetails n={n} /> : null}
                    {canAnswer ? (
                        <Row gap="sm" stack>
                            <Stack flex={1}>
                                <Button label={t('notifications.approve')} icon={Check} full disabled={confirm.isPending} onPress={() => answer(true)} testID="ntf-approve" />
                            </Stack>
                            <Stack flex={1}>
                                <Button label={t('notifications.deny')} icon={X} variant="danger" full disabled={confirm.isPending} onPress={() => answer(false)} testID="ntf-deny" />
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
        <Row gap="xs" wrap>
            <Text role="caption" tone="muted">{label}:</Text>
            <Text role="caption" mono>{value}</Text>
        </Row>
    );
    return (
        <Stack gap="xs">
            {n.tool ? line(t('activity.policy.tool'), n.tool) : null}
            {n.reason ? (
                <Stack>
                    <Text role="caption" tone="muted">{t('notifications.reason')}:</Text>
                    <Text role="caption" tone="muted" dir="ltr">{n.reason}</Text>
                </Stack>
            ) : null}
            {n.ruleIds && n.ruleIds.length > 0 ? line(t('activity.policy.rules'), n.ruleIds.join(', ')) : null}
            {n.policyVersion ? line(t('activity.policy.policy'), n.policyVersion) : null}
            {n.receiptId ? line(t('activity.policy.receipt'), n.receiptId) : (
                <Text role="caption" tone="muted">{t('activity.policy.receipt')}: {t('activity.policy.receiptUnavailable')}</Text>
            )}
        </Stack>
    );
}
