// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import * as api from '../services/api';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { FileDiff, TurnChanges } from '../types/changes';
import { requestErrorParam } from '../utils/requestErrors';
import { isolate, type MessageKey, type Param } from '../i18n/registry';
import { useT, type Translate } from '../i18n/useT';
import { DiffCard } from './render/DiffCard';

const CHANGE_LABEL: Record<FileDiff['change'], MessageKey> = {
    edited: 'chg.edited',
    created: 'chg.created',
    deleted: 'chg.deleted',
};

function note(file: FileDiff, t: Translate): string | undefined {
    const sizes = { before: isolate(String(file.before_size), 'ltr'), after: isolate(String(file.after_size), 'ltr') };
    if (file.too_large) return t('mobileApp.changes.tooLarge', sizes);
    if (file.binary) return t('mobileApp.changes.binary', sizes);
    if (file.truncated) return t('mobileApp.changes.truncated');
    return undefined;
}

/** What a turn did to each file, from the copies GAIA saved before and after it. */
export function ChangesReview({ sessionId, turn, onClose }: {
    sessionId: string;
    turn: TurnChanges;
    onClose: () => void;
}) {
    const t = useT();
    const [files, setFiles] = useState<FileDiff[] | null>(null);
    const [error, setError] = useState<Param | null>(null);
    useEscapeToClose(true, onClose);
    const dialogRef = useRef<HTMLDivElement>(null);
    useFocusTrap(dialogRef, true);

    useEffect(() => {
        let live = true;
        api.getTurnDiff(sessionId, turn.turn_id).then(
            (res) => { if (live) setFiles(res.files); },
            (err: unknown) => { if (live) setError(requestErrorParam(err)); },
        );
        return () => { live = false; };
    }, [sessionId, turn.turn_id]);

    // Portaled: opened from a message, a transformed ancestor would otherwise
    // clip the fixed backdrop to the chat column.
    return createPortal(
        <div ref={dialogRef} className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('chg.review')}>
            <div className="modal-panel changes-review" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{t('mobileApp.changes.reviewTitle')}</h3>
                    <button type="button" className="btn-icon" onClick={onClose} aria-label={t('sp.closeShort')}>
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body changes-review-body">
                    {error && (
                        <div className="settings-error" role="alert">
                            <p>{t('mobileApp.changes.loadFailedNoReason')}</p>
                            {typeof error === 'object' ? <p>{t(error.ref, error.params)}</p> : <p dir="ltr">{error}</p>}
                        </div>
                    )}
                    {!files && !error && (
                        <p className="changes-review-loading"><Loader2 size={13} className="spin" /> {t('mobileApp.changes.loading')}</p>
                    )}
                    {files?.map((file) => (
                        <section key={file.path} className="changes-review-file">
                            <DiffCard
                                data={{
                                    path: file.path,
                                    badge: t(CHANGE_LABEL[file.change]),
                                    note: note(file, t),
                                    unified: file.binary || file.too_large ? '' : file.unified,
                                }}
                            />
                        </section>
                    ))}
                    {turn.restored_at && (
                        <p className="settings-hint">{t('mobileApp.changes.wasUndone')}</p>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
