// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { cleanToolCallContent } from '@webui/utils/toolCallContent';
import remarkWindowsPaths from '@webui/utils/remarkWindowsPaths';
import { remarkSoftBreaks } from '@webui/utils/remarkSoftBreaks';

// The same plugins, in the same order, as the web UI's answer renderer.
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWindowsPaths).use(remarkSoftBreaks);

/** The answer's Markdown tree, after the tool-call JSON and think tags are cleaned out. */
export function parseAnswer(text: string, streaming: boolean): Root {
    const cleaned = cleanToolCallContent(text, streaming);
    return processor.runSync(processor.parse(cleaned), { value: cleaned }) as Root;
}
