// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Message } from '@/api/client.types';

let nextId = 1;
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 13, 14, minutes, 9)).toISOString();
const msg = (role: 'user' | 'assistant', content: string, minutes: number): Message => ({
    id: nextId++,
    session_id: 'dev',
    role,
    content,
    created_at: at(minutes),
    rag_sources: null,
});

const LONG_USER = Array.from(
    { length: 40 },
    (_, i) => `Log line ${i + 1}: the nightly job copied 12 files and skipped 3 that were already there.`,
).join('\n');

const ANSWER = 'Here is what I found.\n\n- The job ran at **02:00**\n- It copied 12 files\n- 3 were skipped because they already existed';
const ARABIC_ANSWER = 'هذا ما وجدته.\n\n- بدأت المهمة في **02:00**\n- نسخت 12 ملفاً\n- تم تخطي 3 لأنها موجودة';

const SHORT = [
    msg('user', 'What did the nightly job do?', 0),
    msg('assistant', ANSWER, 1),
    msg('user', 'ما الذي فعلته المهمة الليلية؟', 2),
    msg('assistant', ARABIC_ANSWER, 3),
];

const MANY = Array.from({ length: 12 }, (_, i) => [
    msg('user', `Question ${i + 1}: how many files did run ${i + 1} copy?`, i * 2),
    msg('assistant', `Run ${i + 1} copied ${i + 4} files.`, i * 2 + 1),
]).flat();

export type MessagesFixture = 'loading' | 'long' | 'many' | 'streaming';

export const FIXTURES: Record<MessagesFixture, { messages: Message[]; live?: Message }> = {
    loading: { messages: [] },
    long: { messages: [...SHORT.slice(0, 2), msg('user', LONG_USER, 4), msg('assistant', ANSWER, 5)] },
    many: { messages: MANY },
    streaming: {
        messages: SHORT,
        live: { ...msg('assistant', 'Counting the files in', 6), id: -1 },
    },
};
