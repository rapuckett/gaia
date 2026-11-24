// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { Screen, Stack, UIProvider } from '@/ui';

import { AudioCard } from '../cards/AudioCard';
import { GuideCard } from '../cards/GuideCard';
import { GUIDE_WORKOUT } from './__fixtures__/messages';
import { ConnectorRetry } from '../ConnectorRetry';
import { ToolStepRow } from '../activity/ToolStepRow';
import { stepsFromEvents } from '../activity/stepsFromEvents';
import { translator } from '@/i18n/useT';
import type { StreamEvent } from '@/api/client.types';

/** Developer gallery (`/dev/messages?state=`): the audio card, the retry banner shown once a connector is signed in, and the guide card's unit switch (RC-12) and one-time tip (RC-18). */
export const CARD_SCENES = ['audio', 'audio-failed', 'connector-retry', 'guide-units', 'guide-tip', 'audio-music', 'audio-dictation', 'dictate-step'] as const;
export type CardScene = (typeof CARD_SCENES)[number];

const AUDIO = {
    src: '/api/media/audio/piano-theme.wav',
    caption: 'A calm piano theme for the intro.',
    path: '/Users/avery/.gaia/media/audio/piano-theme.wav',
    duration_seconds: 83,
};

const MUSIC = { ...AUDIO, saved_to: '/Users/avery/Music/GAIA/piano-theme.wav' };

const DICTATION = {
    src: '/api/media/audio/quarterly-report.wav',
    caption: 'Quarterly report, read aloud.',
    path: '/Users/avery/.gaia/media/audio/quarterly-report.wav',
    duration_seconds: 412,
    saved_to: '/Users/avery/Documents/quarterly-report.wav',
    script_path: '/Users/avery/Documents/quarterly-report.listen.txt',
};

const DICTATE_STEP = stepsFromEvents(
    [{ type: 'tool_start', tool: 'dictate_document', detail: 'path: quarterly-report.docx' } as StreamEvent],
    translator('en'),
)[0]!;

const RECIPE = {
    kind: 'guide',
    guideType: 'recipe',
    title: 'Banana bread',
    description: 'Moist, simple, and good for ripe bananas.',
    servings: 4,
    items: ['1 1/2 cups all-purpose flour', '2 tbsp butter, melted', '3 ripe bananas', '1/2 cup sugar', '2 large eggs'],
    steps: ['Heat the oven to 350°F and grease a loaf pan.', 'Mash the bananas, then stir in the butter, sugar and eggs.', 'Fold in the flour, pour into the pan and bake for 55 minutes.'],
    notes: 'Keeps for three days, wrapped.',
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
                            {state === 'guide-units' ? (
                                <GuideCard data={RECIPE} />
                            ) : state === 'guide-tip' ? (
                                <GuideCard data={GUIDE_WORKOUT} />
                            ) : state === 'connector-retry' ? (
                                <ConnectorRetry content="NOT_CONNECTED: Google is not currently connected." providers={['google']} onRetry={() => undefined} />
                            ) : state === 'audio-music' ? (
                                <AudioCard data={MUSIC} />
                            ) : state === 'audio-dictation' ? (
                                <AudioCard data={DICTATION} />
                            ) : state === 'dictate-step' ? (
                                <ToolStepRow step={DICTATE_STEP} now={DICTATE_STEP.timestamp + 4000} testID="dictate-step" />
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
