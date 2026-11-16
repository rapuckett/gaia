// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { Screen, Stack, UIProvider } from '@/ui';

import { AudioCard } from '../cards/AudioCard';
import { ConnectorRetry } from '../ConnectorRetry';

/** Developer gallery (`/dev/messages?state=`): the audio card, and the retry banner shown once a connector is signed in. */
export const CARD_SCENES = ['audio', 'audio-failed', 'connector-retry'] as const;
export type CardScene = (typeof CARD_SCENES)[number];

const AUDIO = {
    src: '/api/media/audio/piano-theme.wav',
    caption: 'A calm piano theme for the intro.',
    path: '/Users/avery/.gaia/media/audio/piano-theme.wav',
    duration_seconds: 83,
};

const GOOGLE = { id: 'google', display_name: 'Google', type: 'oauth_pkce', description: '', configured: true, configurable: true, enabled: true, account_id: 'avery@example.com', activations: {} };

export function CardScenes({ state }: { state: CardScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        const fake = createFakeClient({ connectors: [GOOGLE] as never });
        if (state !== 'audio-failed') return fake;
        return {
            ...fake,
            async getGeneratedAudio(): Promise<never> {
                throw new GaiaApiError(404, 'The file was not found on your PC.');
            },
        };
    });
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <Screen>
                        <Stack gap="md" paddingX="gutter" paddingY="md">
                            {state === 'connector-retry' ? (
                                <ConnectorRetry content="NOT_CONNECTED: Google is not currently connected." providers={['google']} onRetry={() => undefined} />
                            ) : (
                                <AudioCard data={AUDIO} />
                            )}
                        </Stack>
                    </Screen>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
