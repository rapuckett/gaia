// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { groupUntracked, untrackedWarning } from '@webui/utils/untrackedWork';

import type { TurnChanges as Turn } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { useTurnChanges, useUndoTurn } from '@/data';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { Button, Notice, Row, Stack, Text } from '@/ui';

import { ChangesReview } from './ChangesReview';
import { loadFailure, undoneText, untrackedNotice } from './changesText';

type Phase = 'idle' | 'confirm' | 'working' | 'conflict' | 'done';

/** "Review changes" and "Undo this turn" under an answer whose turn changed files. `reportError` is false on all but one answer, so a failed listing is said once. */
export function TurnChanges({ sessionId, messageId, reportError = true }: { sessionId: string; messageId: number; reportError?: boolean }) {
    const listing = useTurnChanges(sessionId);
    const turn = listing.data?.find((candidate) => candidate.message_id === messageId);
    if (listing.isError) return reportError ? <LoadError error={listing.error} /> : null;
    if (!turn || (turn.files.length === 0 && !turn.incomplete)) return null;
    return <TurnChangesRow sessionId={sessionId} turn={turn} />;
}

function LoadError({ error }: { error: unknown }) {
    const t = useT();
    const failure = loadFailure(error, t, { withReason: 'turnChanges.loadError', noReason: 'turnChanges.loadErrorNoReason' });
    return (
        <Stack paddingY="xs">
            <Notice tone="warning" role="note" message={failure.text} detail={failure.detail} testID="turn-changes-load-error" />
        </Stack>
    );
}

function TurnChangesRow({ sessionId, turn }: { sessionId: string; turn: Turn }) {
    const t = useT();
    const undoTurn = useUndoTurn(sessionId);
    const [phase, setPhase] = useState<Phase>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const [detail, setDetail] = useState<string | undefined>(undefined);
    const [reviewing, setReviewing] = useState(false);

    const count = turn.files.length;
    const undone = Boolean(turn.restored_at);
    const groups = groupUntracked(turn.untracked, t);

    const undo = async (force: boolean) => {
        setPhase('working');
        setMessage(null);
        setDetail(undefined);
        try {
            const result = await undoTurn(turn.turn_id, force);
            setMessage(undoneText(result, t));
            setPhase('done');
        } catch (err) {
            const conflict = err instanceof GaiaApiError && err.status === 409 && err.body?.status === 'conflict';
            if (conflict) {
                setMessage(t('mobileApp.changes.undoTurnConflict'));
                setDetail((err as GaiaApiError).detail);
            } else {
                const split = describeHttpFailure(err, t);
                setMessage(split.text);
                setDetail(split.detail);
            }
            setPhase(conflict ? 'conflict' : 'idle');
        }
    };

    return (
        <Stack gap="xs" paddingY="xs" testID="turn-changes">
            {count > 0 ? (
                <Stack gap="xs">
                    <Text role="caption" tone="secondary" dir="auto">
                        {t.plural('mobileApp.changes.summary', count)}
                        {undone ? ` · ${t('mobileApp.changes.undone')}` : ''}
                    </Text>
                    <Row gap="sm" wrap stack>
                        <Button size="sm" variant="secondary" label={t('chg.review')} onPress={() => setReviewing(true)} testID="turn-changes-review" />
                        {!undone && phase !== 'confirm' && phase !== 'conflict' ? (
                            <Button
                                size="sm"
                                variant="secondary"
                                label={phase === 'working' ? t('chg.undoing') : t('mobileApp.changes.undo')}
                                busy={phase === 'working'}
                                disabled={phase === 'working'}
                                onPress={() => setPhase('confirm')}
                                testID="turn-changes-undo"
                            />
                        ) : null}
                    </Row>
                    {phase === 'confirm' ? (
                        <Stack gap="sm">
                            <Text role="caption" dir="auto">
                                {t.plural('mobileApp.changes.confirm', count)}
                            </Text>
                            <Row gap="sm" wrap stack>
                                <Button size="sm" variant="primary" label={t('mobileApp.changes.confirmYes')} onPress={() => void undo(false)} testID="turn-changes-confirm" />
                                <Button size="sm" variant="secondary" label={t('mobileApp.changes.cancel')} onPress={() => setPhase('idle')} testID="turn-changes-cancel" />
                            </Row>
                        </Stack>
                    ) : null}
                </Stack>
            ) : null}
            {turn.incomplete ? (
                <Notice tone="warning" role="note" {...untrackedNotice(untrackedWarning(turn.untracked, { also: count > 0 }, t), groups)} testID="turn-changes-untracked" />
            ) : null}
            {message ? (
                <Notice
                    tone={phase === 'done' ? 'success' : 'danger'}
                    message={message}
                    detail={detail}
                    testID="turn-changes-message"
                />
            ) : null}
            {phase === 'conflict' ? (
                <Row gap="sm" wrap stack>
                    <Button size="sm" variant="danger" label={t('chg.undoAnyway')} onPress={() => void undo(true)} testID="turn-changes-force" />
                    <Button
                        size="sm"
                        variant="secondary"
                        label={t('chg.keep')}
                        onPress={() => {
                            setPhase('idle');
                            setMessage(null);
                            setDetail(undefined);
                        }}
                        testID="turn-changes-keep"
                    />
                </Row>
            ) : null}
            {reviewing ? <ChangesReview sessionId={sessionId} turn={turn} onClose={() => setReviewing(false)} /> : null}
        </Stack>
    );
}
