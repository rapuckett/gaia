// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { INITIAL_ROUTE } from './navigation';

/** The drawer screen holding the library stack: documents, files and file-preview. */
export const LIBRARY_ROUTE = '(library)';

/** The drawer's route names as the menu knows them: the library group stands for its documents page. */
export function menuRouteNames(names: readonly string[]): string[] {
    return names.map((n) => (n === LIBRARY_ROUTE ? 'documents' : n));
}

// Expo Router renders only the screens a layout declares.
export const ROUTES = [INITIAL_ROUTE, 'new', 'connectors', 'schedules', 'settings', LIBRARY_ROUTE, 'logs', 'notifications', 'skills', 'memory', 'pair', 'pair/manual', 'pair/pcs', 'chat/[id]', 'dev/approve-on-pc', 'dev/ui', 'dev/ui-lists', 'dev/boot', 'dev/chat', 'dev/composer', 'dev/connect-code', 'dev/connectors', 'dev/documents', 'dev/drawer', 'dev/file-preview', 'dev/files', 'dev/forms', 'dev/logs', 'dev/markdown', 'dev/memory-gallery', 'dev/messages', 'dev/pairing', 'dev/model-server', 'dev/notifications', 'dev/permission', 'dev/push', 'dev/schedules', 'dev/settings', 'dev/setup'];

/** The menu entry a path lights up: the browser and the preview belong to Documents. */
export function activeMenuRoute(pathname: string): string | null {
    const first = pathname.split('/')[1] || null;
    return first === 'files' || first === 'file-preview' ? 'documents' : first;
}
