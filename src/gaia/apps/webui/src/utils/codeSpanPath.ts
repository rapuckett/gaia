// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The file an inline-code span names, when the whole span is one absolute path. */

import { WIN_PATH_ONLY_RE } from './windowsPaths';

// `/` and one segment that doesn't start with a space or `/`; `//host` and `~/x` aren't paths here.
const POSIX_PATH_ONLY_RE = /^\/[^/\s][^\0\r\n]*$/;
// A bare span must start at a real top-level folder, so a route like `/api/chat/send` or a `/help` command stays code.
const POSIX_ROOT_RE = /^\/(?:Applications|Library|System|Users|Volumes|etc|home|media|mnt|opt|private|root|srv|tmp|usr|var)(?:\/|$)/;
const FILE_URL_RE = /^file:\/\/\/([^?#]*)(?:[?#].*)?$/i;

/**
 * The path `text` names: a Windows path, a POSIX absolute path under a top-level
 * folder (`/Users`, `/home`, `/etc`...), or a `file:///` URL decoded to its path
 * (`file:///C:/x` to `C:/x`). Null for anything else, including a bare `/`, `~/x`,
 * other URLs, a `file://host/` URL and text with a newline.
 */
export function filePathOfCodeSpan(raw: string): string | null {
    const text = raw.trim();
    if (!text || /[\r\n]/.test(text)) return null;
    if (WIN_PATH_ONLY_RE.test(text)) return text;
    const url = FILE_URL_RE.exec(text);
    if (!url) return POSIX_PATH_ONLY_RE.test(text) && POSIX_ROOT_RE.test(text) ? text : null;
    let path: string;
    try {
        path = decodeURIComponent(`/${url[1]}`);
    } catch {
        return null; // A malformed escape: not a path, so the span stays code.
    }
    if (/^\/[A-Za-z]:[\\/]/.test(path)) return WIN_PATH_ONLY_RE.test(path.slice(1)) ? path.slice(1) : null;
    return POSIX_PATH_ONLY_RE.test(path) ? path : null;
}
