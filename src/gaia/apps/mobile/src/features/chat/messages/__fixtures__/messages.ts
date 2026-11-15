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

const withCards = (m: Message, cards: NonNullable<Message['cards']>): Message => ({ ...m, cards });

// A card whose payload throws when read, to show the error boundary.
const THROWING = {
    columns: ['Name'],
    get rows(): never {
        throw new Error('fixture: card payload threw');
    },
};

const CARDS = [
    msg('user', 'Summarize last week\'s runs as cards.', 0),
    withCards(msg('assistant', 'Cards first, then the answer text. Run 3 was the slowest.', 1), [
        {
            render: 'table',
            data: {
                title: 'Nightly runs',
                columns: ['Run', 'Started', 'Files copied', 'Skipped', 'Duration (s)', 'Status'],
                rows: [
                    ['Run 1', '2026-11-08 02:00', 12, 3, 41.5, 'ok'],
                    ['Run 2', '2026-11-09 02:00', 15, 0, 38.2, 'ok'],
                    ['Run 3', '2026-11-10 02:00', 1204, 17, 912, 'slow'],
                ],
            },
        },
        {
            render: 'key_value',
            data: {
                title: 'Run 3',
                items: [
                    { key: 'Source', value: 'C:\\Users\\me\\Documents\\Projects\\Quarterly reports 2026\\drafts' },
                    { key: 'Files copied', value: 1204 },
                    { key: 'Notes', value: 'Copied everything again because the index was missing, so the job took far longer than the others.' },
                    { key: 'Verified', value: true },
                    { key: 'Error', value: null },
                ],
            },
        },
        { render: 'list', data: { title: 'Next steps', ordered: true, items: ['Rebuild the index', 'Re-run the job', 'Check the disk'] } },
        { render: 'list', data: { title: 'خطوات تالية', items: ['إعادة بناء الفهرس', 'إعادة تشغيل المهمة'] } },
    ]),
];

const BAD_CARDS = [
    msg('user', 'Show me the broken cards.', 0),
    withCards(msg('assistant', 'The answer text still shows below the cards.', 1), [
        { render: 'table', data: { title: 'Missing its columns', rows: [[1, 2]] } },
        { render: 'chart', data: { series: [1, 2, 3] } },
        { render: 'table', data: THROWING },
        { render: 'list', data: { items: ['Still fine'] } },
    ]),
];

export type MessagesFixture = 'badCards' | 'cards' | 'loading' | 'long' | 'many' | 'short' | 'streaming';

export const FIXTURES: Record<MessagesFixture, { messages: Message[]; live?: Message }> = {
    badCards: { messages: BAD_CARDS },
    cards: { messages: CARDS },
    loading: { messages: [] },
    long: { messages: [...SHORT.slice(0, 2), msg('user', LONG_USER, 4), msg('assistant', ANSWER, 5)] },
    many: { messages: MANY },
    short: { messages: SHORT },
    streaming: {
        messages: SHORT,
        live: { ...msg('assistant', 'Counting the files in', 6), id: -1 },
    },
};
