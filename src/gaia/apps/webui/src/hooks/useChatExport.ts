// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/api';
import { log } from '../utils/logger';
import { isolate } from '../i18n/registry';
import { useT } from '../i18n/useT';

/** Download the chat as Markdown, with a plain-language error when that fails. */
export function useChatExport(sessionId: string, title: string | undefined) {
    const t = useT();
    const [exportError, setExportError] = useState<string | null>(null);

    useEffect(() => {
        setExportError(null);
    }, [sessionId]);

    const clearExportError = useCallback(() => setExportError(null), []);

    const exportChat = useCallback(async () => {
        setExportError(null);
        try {
            const data = await api.exportSession(sessionId);
            const blob = new Blob([data.content], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Sanitize title for use as filename: remove path separators and special chars
            const safeTitle = (title || 'chat').replace(/[/\\:*?"<>|]/g, '_').slice(0, 100);
            a.download = `${safeTitle}.md`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            log.chat.error('Export failed', err);
            setExportError(err instanceof api.ApiError
                ? t('chat.exportHttp', { http: isolate(`HTTP ${err.httpStatus}`, 'ltr') })
                : t('chat.exportUnreachable'));
        }
    }, [sessionId, title, t]);

    return { exportChat, exportError, clearExportError };
}
