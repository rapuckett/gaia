// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SkillInfo } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useResearchStore } from '@/state/research';
import { UIProvider } from '@/ui';

import { Composer } from './Composer';
import { ResearchChip, useResearch } from './ResearchChip';

const opts = { includeHiddenElements: true };
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const skill = (name: string): SkillInfo => ({ name, description: `Runs ${name}.`, version: null, tier: null, tools: [], path: `/s/${name}`, always_on: false });
const SKILLS = [skill('summarize'), skill('coding')];

function Harness({ onSend }: { onSend: (text: string) => void }) {
    const research = useResearch('chat-1');
    return <Composer onSend={onSend} wrap={research.wrap} placeholder={research.placeholder} leftControls={<ResearchChip sessionId="chat-1" />} />;
}

async function mount(onSend: (text: string) => void = () => undefined) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = createFakeClient({ skills: { skills: SKILLS, invalid: {} } });
    await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <UIProvider>
                <QueryClientProvider client={queryClient}>
                    <GaiaClientProvider client={client}>
                        <Harness onSend={onSend} />
                    </GaiaClientProvider>
                </QueryClientProvider>
            </UIProvider>
        </SafeAreaProvider>,
    );
}

const chip = () => screen.getByTestId('research-chip', opts);
const type = (text: string) => fireEvent.changeText(screen.getByTestId('composer-input', opts), text);

describeNative('the Research chip', () => {
    beforeEach(() => useResearchStore.setState({ research: {} }));

    it('toggles, and its hint reads the on or off title', async () => {
        await mount();
        expect(chip().props.accessibilityHint).toMatch(/^Research a topic:/);
        expect(screen.getByRole('switch', { name: 'Research', checked: false, ...opts })).toBeTruthy();
        await fireEvent.press(chip());
        expect(chip().props.accessibilityHint).toMatch(/^Research is on:/);
        expect(screen.getByRole('switch', { name: 'Research', checked: true, ...opts })).toBeTruthy();
        await fireEvent.press(chip());
        expect(screen.getByRole('switch', { name: 'Research', checked: false, ...opts })).toBeTruthy();
    });

    it('shows the research placeholder only while on', async () => {
        await mount();
        expect(screen.getByTestId('composer-input', opts).props.placeholder).not.toBe('What should GAIA research?');
        await fireEvent.press(chip());
        expect(screen.getByTestId('composer-input', opts).props.placeholder).toBe('What should GAIA research?');
    });

    it('sends plain text as a /research turn while on, and unchanged while off', async () => {
        const sent: string[] = [];
        await mount((text) => void sent.push(text));
        await type('EU AI Act');
        await fireEvent.press(screen.getByTestId('composer-send', opts));
        await fireEvent.press(chip());
        await type('EU AI Act');
        await fireEvent.press(screen.getByTestId('composer-send', opts));
        expect(sent).toEqual(['EU AI Act', '/research EU AI Act']);
    });

    it('sends an installed /skill command unchanged while on, picked from the menu too', async () => {
        const sent: string[] = [];
        await mount((text) => void sent.push(text));
        await fireEvent.press(chip());
        await type('/');
        expect(await screen.findByTestId('skill-menu-summarize', opts)).toBeTruthy();
        await fireEvent.press(screen.getByTestId('skill-menu-summarize', opts));
        expect(screen.getByTestId('composer-input', opts).props.value).toBe('/summarize ');
        await type('/summarize the notes');
        await fireEvent.press(screen.getByTestId('composer-send', opts));
        expect(sent).toEqual(['/summarize the notes']);
    });

    it('keeps the choice per chat and hands the new chat its choice with the first research turn', () => {
        const { setResearch, adoptDraft } = useResearchStore.getState();
        setResearch(null, true);
        adoptDraft('s1', 'Summarise this file');
        expect(useResearchStore.getState().research).toEqual({ '': true });
        adoptDraft('s2', '/research the EU AI Act');
        expect(useResearchStore.getState().research).toEqual({ s2: true });
    });
});
