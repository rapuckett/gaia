// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { createFakeClient } from '@/api/fake';
import { GaiaApiError } from '@/api/errors';
import { GaiaClientProvider } from '@/data';
import { FIXTURES } from '@/features/chat/messages/__fixtures__/messages';
import { MessageListView } from '@/features/chat/messages/MessageList';
import { Screen } from '@/ui';

import { useSessionPanelStore } from './panelStore';
import { SessionPanel } from './SessionPanel';

/** Developer gallery: the session panel open over a chat, with Skills and Agent info in each state. */
export type SessionPanelGalleryState = 'loaded' | 'empty' | 'error' | 'notRunning';

const TOOLS = [
    {
        name: 'search_web',
        description: 'Search the web and return the top results.\nSecond line is not shown.',
        category: 'agent',
    },
    {
        name: 'read_file',
        description: 'Read a text file from the working folder.',
        category: 'file_io',
    },
    {
        name: 'gmail_search',
        description: 'Find mail in the connected Gmail account.',
        category: 'mcp',
    },
    { name: 'coding', description: 'Write and run code', category: 'skill' },
];

export function SessionPanelGallery({ state }: { state: SessionPanelGalleryState }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const client = useMemo(() => {
        const base = createFakeClient({
            capabilities:
                state === 'loaded'
                    ? {
                          dev: {
                              session_id: 'dev',
                              agent_type: 'gaia',
                              tools: TOOLS,
                              skills: [
                                  { name: 'coding', how: 'model' },
                                  { name: 'file-ops', how: 'auto' },
                                  { name: 'memory', how: 'always' },
                              ],
                          },
                      }
                    : state === 'empty'
                      ? {
                            dev: {
                                session_id: 'dev',
                                agent_type: 'gaia',
                                tools: [],
                                skills: [],
                            },
                        }
                      : undefined,
        });
        if (state === 'error') {
            base.getCapabilities = async () => {
                throw new GaiaApiError(500, 'The agent stopped responding');
            };
        }
        return base;
    }, [state]);
    useEffect(() => {
        useSessionPanelStore.getState().setSection('skills', true);
        useSessionPanelStore.getState().setSection('tools', true);
    }, []);
    return (
        <>
            <Screen>
                <MessageListView messages={FIXTURES.short.messages} />
            </Screen>
            <SessionPanel
                sessionId="dev"
                open
                onClose={() => undefined}
                wrap={(body) => (
                    <QueryClientProvider client={queryClient}>
                        <GaiaClientProvider client={client}>{body}</GaiaClientProvider>
                    </QueryClientProvider>
                )}
            />
        </>
    );
}
