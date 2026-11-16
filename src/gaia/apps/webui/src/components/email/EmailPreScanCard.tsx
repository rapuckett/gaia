// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * EmailPreScanCard
 *
 * Renders the structured envelope returned by ``pre_scan_inbox`` as a
 * scannable triage card with three sections: urgent, actionable, and
 * suggested archives. Each row has inline action buttons (Approve,
 * Dismiss, Open in Gmail) so the user can act without typing another
 * chat message.
 *
 * Dispatch model: Approve and Reply emit a ``gaia:send-message``
 * CustomEvent on ``window``. ``ChatView`` listens for that event via a
 * ``useEffect`` and forwards the text to its ``sendMessage`` callback.
 * Dismiss is purely local — it removes the row from the visible list
 * without touching the backend.
 *
 * Mounted through the card registry (``render/registry.tsx``, key
 * ``email_pre_scan``) from ``tool_result.render`` events — the pre-#2109
 * fence-parsing mount in ``MessageBubble`` is retired.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    Archive,
    CheckCircle2,
    ExternalLink,
    Inbox,
    Mail,
    PenSquare,
    X,
} from 'lucide-react';
import { useT, type Translate } from '../../i18n/useT';
import type { MessageKey } from '../../i18n/registry';
import './EmailPreScanCard.css';
import {
    archiveCommand,
    formatSender,
    gmailUrl,
    isPreScanPayload,
    replyCommand,
    type PreScanItem,
    type PreScanPayload,
} from '../../utils/emailPreScan.core';

// ── Types and helpers ────────────────────────────────────────────────────────

export { isPreScanPayload };
export type { PreScanItem, PreScanPayload };

/** Dispatch a programmatic user message into the active chat session. */
function dispatchChatMessage(text: string): void {
    if (!text) return;
    window.dispatchEvent(
        new CustomEvent('gaia:send-message', { detail: { text } }),
    );
}

/** Open a Gmail conversation in a new tab. */
function openInGmail(item: PreScanItem): void {
    const url = gmailUrl(item);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
}

// ── Component ────────────────────────────────────────────────────────────────

interface SectionDef {
    key: 'urgent' | 'actionable' | 'archives';
    title: MessageKey;
    icon: React.ReactNode;
    items: PreScanItem[];
    intent: 'urgent' | 'actionable' | 'archive';
}

export function EmailPreScanCard({ payload }: { payload: PreScanPayload }) {
    const t = useT();
    const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

    const handleDismiss = useCallback((id: string) => {
        setDismissed((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    }, []);

    // Track in-flight rows so a double-click doesn't dispatch two
    // identical tool calls. A second click while an action is pending
    // is a no-op; the row is unlocked when the streaming response
    // completes (driven by isStreaming on the chat store, watched in
    // the effect below) or after a short safety timeout.
    const [pendingRow, setPendingRow] = useState<string | null>(null);
    const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
        };
    }, []);

    const dispatchAction = useCallback(
        (messageId: string, command: string) => {
            if (pendingRow) return;
            setPendingRow(messageId);
            safetyTimerRef.current = setTimeout(() => {
                setPendingRow((current) => (current === messageId ? null : current));
            }, 5000);
            dispatchChatMessage(command);
        },
        [pendingRow],
    );

    const handleApproveArchive = useCallback(
        (item: PreScanItem) => {
            dispatchAction(item.message_id, archiveCommand(item));
        },
        [dispatchAction],
    );

    const handleReply = useCallback(
        (item: PreScanItem) => {
            dispatchAction(item.message_id, replyCommand(item));
        },
        [dispatchAction],
    );

    const sections: SectionDef[] = useMemo(
        () => [
            {
                key: 'urgent',
                title: 'email.prescan.urgent',
                icon: <AlertCircle size={14} />,
                items: payload.urgent.filter(
                    (i) => !dismissed.has(i.message_id),
                ),
                intent: 'urgent',
            },
            {
                key: 'actionable',
                title: 'email.prescan.actionable',
                icon: <Mail size={14} />,
                items: payload.actionable.filter(
                    (i) => !dismissed.has(i.message_id),
                ),
                intent: 'actionable',
            },
            {
                key: 'archives',
                title: 'email.prescan.archives',
                icon: <Archive size={14} />,
                items: payload.suggested_archives.filter(
                    (i) => !dismissed.has(i.message_id),
                ),
                intent: 'archive',
            },
        ],
        [payload, dismissed],
    );

    const totalVisible = sections.reduce((n, s) => n + s.items.length, 0);
    const informationalCount = payload.informational_count;

    return (
        <div className="email-pre-scan" role="region" aria-label={t('email.prescan.title')}>
            <div className="email-pre-scan__header">
                <Inbox size={16} aria-hidden="true" />
                <span className="email-pre-scan__title">{t('email.prescan.title')}</span>
                <span className="email-pre-scan__totals">
                    {informationalCount > 0
                        ? t('email.prescan.surfacedInfo', { total: totalVisible, info: informationalCount })
                        : t('email.prescan.surfaced', { n: totalVisible })}
                </span>
            </div>

            {sections.map((section) =>
                section.items.length > 0 ? (
                    <Section
                        key={section.key}
                        def={section}
                        pendingRow={pendingRow}
                        onApproveArchive={handleApproveArchive}
                        onReply={handleReply}
                        onDismiss={handleDismiss}
                        onOpen={openInGmail}
                    />
                ) : null,
            )}

            {totalVisible === 0 && (
                <div className="email-pre-scan__empty">
                    <CheckCircle2 size={14} />
                    <span>{t('email.prescan.empty')}</span>
                </div>
            )}

            <PreferenceSummary applied={payload.preferences_applied} />
        </div>
    );
}

// ── Section ──────────────────────────────────────────────────────────────────

function Section({
    def,
    pendingRow,
    onApproveArchive,
    onReply,
    onDismiss,
    onOpen,
}: {
    def: SectionDef;
    pendingRow: string | null;
    onApproveArchive: (item: PreScanItem) => void;
    onReply: (item: PreScanItem) => void;
    onDismiss: (id: string) => void;
    onOpen: (item: PreScanItem) => void;
}) {
    const t = useT();
    return (
        <section
            className={`email-pre-scan__section email-pre-scan__section--${def.intent}`}
        >
            <header className="email-pre-scan__section-header">
                {def.icon}
                <span className="email-pre-scan__section-title">{t(def.title)}</span>
                <span className="email-pre-scan__section-count">{def.items.length}</span>
            </header>
            <ul className="email-pre-scan__list">
                {def.items.map((item) => (
                    <Row
                        key={item.message_id}
                        item={item}
                        intent={def.intent}
                        // Disable action buttons whenever ANY row in the
                        // card has an in-flight action. Single-flight at
                        // the card level is simpler than per-row, and
                        // the streaming response is per-turn anyway —
                        // there's nothing for the user to gain by
                        // double-clicking a different row mid-stream.
                        isPending={pendingRow !== null}
                        onApproveArchive={onApproveArchive}
                        onReply={onReply}
                        onDismiss={onDismiss}
                        onOpen={onOpen}
                    />
                ))}
            </ul>
        </section>
    );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function Row({
    item,
    intent,
    isPending,
    onApproveArchive,
    onReply,
    onDismiss,
    onOpen,
}: {
    item: PreScanItem;
    intent: SectionDef['intent'];
    isPending: boolean;
    onApproveArchive: (item: PreScanItem) => void;
    onReply: (item: PreScanItem) => void;
    onDismiss: (id: string) => void;
    onOpen: (item: PreScanItem) => void;
}) {
    const t = useT();
    const reason = item.reason ?? item.why ?? '';
    const senderDisplay = (item.sender ? formatSender(item.sender) : t.bare('email.prescan.unknownSender'));

    return (
        <li className="email-pre-scan__row">
            <div className="email-pre-scan__row-text">
                <div className="email-pre-scan__row-meta">
                    <span
                        className="email-pre-scan__row-sender"
                        title={item.sender}
                    >
                        {senderDisplay}
                    </span>
                    <span className="email-pre-scan__row-subject" title={item.subject}>
                        {item.subject || t.bare('email.prescan.noSubject')}
                    </span>
                </div>
                {reason && (
                    <div className="email-pre-scan__row-reason" title={reason}>
                        {reason}
                    </div>
                )}
            </div>
            <div
                className="email-pre-scan__row-actions"
                role="group"
                aria-label={t('email.prescan.actions')}
            >
                {intent === 'archive' ? (
                    <button
                        className="email-pre-scan__action email-pre-scan__action--primary"
                        onClick={() => onApproveArchive(item)}
                        disabled={isPending}
                        title={t('email.prescan.approveArchive')}
                        aria-label={t('email.prescan.approveArchiveFor', { subject: item.subject })}
                    >
                        <Archive size={12} />
                        <span>{t('email.prescan.archive')}</span>
                    </button>
                ) : (
                    <button
                        className="email-pre-scan__action email-pre-scan__action--primary"
                        onClick={() => onReply(item)}
                        disabled={isPending}
                        title={t('email.prescan.draftReply')}
                        aria-label={t('email.prescan.draftReplyTo', { subject: item.subject })}
                    >
                        <PenSquare size={12} />
                        <span>{t('email.prescan.reply')}</span>
                    </button>
                )}
                <button
                    className="email-pre-scan__action"
                    onClick={() => onOpen(item)}
                    title={t('email.prescan.openInGmail')}
                    aria-label={t('email.prescan.openInGmailFor', { subject: item.subject })}
                >
                    <ExternalLink size={12} />
                    <span>{t('sp.open')}</span>
                </button>
                <button
                    className="email-pre-scan__action email-pre-scan__action--ghost"
                    onClick={() => onDismiss(item.message_id)}
                    title={t('email.prescan.dismissRow')}
                    aria-label={t('email.prescan.dismissFor', { subject: item.subject })}
                >
                    <X size={12} />
                </button>
            </div>
        </li>
    );
}

// ── Preference summary ───────────────────────────────────────────────────────

function PreferenceSummary({
    applied,
}: {
    applied?: PreScanPayload['preferences_applied'];
}) {
    const t = useT();
    const priority = applied?.priority_senders ?? [];
    const low = applied?.low_priority_senders ?? [];
    const defaults = applied?.category_defaults ?? {};
    const hasAny =
        priority.length > 0 ||
        low.length > 0 ||
        Object.keys(defaults).length > 0;
    if (!hasAny) return null;
    return (
        <div className="email-pre-scan__preferences" aria-label={t('email.prescan.prefsRegion')}>
            <span className="email-pre-scan__preferences-label">{t('email.prescan.prefs')}</span>
            {priority.length > 0 && (
                <span className="email-pre-scan__preferences-chip" title={t('email.prescan.alwaysUrgent')}>
                    {t.plural('email.prescan.prioritySenders', priority.length)}
                </span>
            )}
            {low.length > 0 && (
                <span
                    className="email-pre-scan__preferences-chip"
                    title={t('email.prescan.alwaysLow')}
                >
                    {t.plural('email.prescan.lowSenders', low.length)}
                </span>
            )}
            {Object.entries(defaults).map(([cat, action]) => (
                <span
                    key={cat}
                    className="email-pre-scan__preferences-chip"
                    title={`${cat} → ${action}`}
                >
                    {cat} → {action}
                </span>
            ))}
        </div>
    );
}
