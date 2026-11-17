// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

export interface SentAttachment {
    name: string;
    url: string;
    isImage: boolean;
}

const LINK = /^(!?)\[([^\]]*)\]\((\/api\/files\/uploads\/[^)\s]+)\)$/;

/** Splits the upload links `composeWithLinks` appends from the words the person wrote. */
export function splitAttachmentLinks(content: string): { text: string; files: SentAttachment[] } {
    const lines = content.split('\n');
    const files: SentAttachment[] = [];
    while (lines.length > 0) {
        const m = LINK.exec(lines[lines.length - 1].trim());
        if (!m) break;
        files.unshift({ name: m[2], url: m[3], isImage: m[1] === '!' });
        lines.pop();
    }
    if (files.length === 0) return { text: content, files };
    return { text: lines.join('\n').trim(), files };
}
