// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { FileDiff, TurnChanges } from '@/api/client.types';
import { useTurnDiff } from '@/data';
import { useT, type Translate } from '@/i18n/useT';
import { ErrorState, LoadingState, Sheet, Stack, Text } from '@/ui';

import { DiffCard } from '../cards/DiffCard';
import { loadFailure } from './changesText';

export function noteOf(file: FileDiff, t: Translate): string | undefined {
    const sizes = { before: file.before_size, after: file.after_size };
    if (file.too_large) return t('mobileApp.changes.tooLarge', sizes);
    if (file.binary) return t('mobileApp.changes.binary', sizes);
    if (file.truncated) return t('mobileApp.changes.truncated');
    return undefined;
}

/** What a turn did to each file, from the copies GAIA saved before and after it. */
export function ChangesReview({ sessionId, turn, onClose }: { sessionId: string; turn: TurnChanges; onClose: () => void }) {
    const t = useT();
    const diff = useTurnDiff(sessionId, turn.turn_id);
    const failure = diff.isError ? loadFailure(diff.error, t, { withReason: 'mobileApp.changes.loadFailed', noReason: 'mobileApp.changes.loadFailedNoReason' }) : null;
    const label = { edited: t('chg.edited'), created: t('chg.created'), deleted: t('chg.deleted') };
    return (
        <Sheet open onClose={onClose} title={t('mobileApp.changes.reviewTitle')}>
            <Stack gap="md" paddingX="lg" paddingY="md">
                {failure ? (
                    <ErrorState title={failure.text} detail={failure.detail} onRetry={() => void diff.refetch()} />
                ) : !diff.data ? (
                    <LoadingState title={t('mobileApp.changes.loading')} />
                ) : (
                    diff.data.map((file) => (
                        <DiffCard
                            key={file.path}
                            data={{
                                path: file.path,
                                badge: label[file.change],
                                note: noteOf(file, t),
                                unified: file.binary || file.too_large ? '' : file.unified,
                            }}
                        />
                    ))
                )}
                {turn.restored_at ? (
                    <Text role="caption" tone="secondary" dir="auto">
                        {t('mobileApp.changes.wasUndone')}
                    </Text>
                ) : null}
            </Stack>
        </Sheet>
    );
}
