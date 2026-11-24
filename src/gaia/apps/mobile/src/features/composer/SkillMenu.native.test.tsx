// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SkillInfo } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { UIProvider } from '@/ui';

import { Composer } from './Composer';
import { skillMenuHeight } from './SkillMenu';

const opts = { includeHiddenElements: true };
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const skill = (name: string, description: string): SkillInfo => ({ name, description, version: null, tier: null, tools: [], path: `/s/${name}`, always_on: false });
const SKILLS = [skill('summarize', 'Summarize a document. Keeps the key points.'), skill('coding', 'Write and fix code.'), skill('sql-help', 'Write queries.')];

function mount(client: ReturnType<typeof createFakeClient>, props: Partial<Parameters<typeof Composer>[0]> = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <UIProvider>
                <QueryClientProvider client={queryClient}>
                    <GaiaClientProvider client={client}>
                        <Composer onSend={() => undefined} {...props} />
                    </GaiaClientProvider>
                </QueryClientProvider>
            </UIProvider>
        </SafeAreaProvider>,
    );
}

const type = (text: string) => fireEvent.changeText(screen.getByTestId('composer-input', opts), text);

describeNative('the composer skill menu', () => {
    it('opens on "/", filters as you type and closes when the "/" goes', async () => {
        await mount(createFakeClient({ skills: { skills: SKILLS, invalid: {} } }));
        expect(screen.queryByTestId('skill-menu', opts)).toBeNull();
        await type('/');
        expect(await screen.findByText('Skills', opts)).toBeTruthy();
        expect(screen.getByText('/summarize', opts)).toBeTruthy();
        expect(screen.getByText('Summarize a document.', opts)).toBeTruthy();
        expect(screen.getByText('/coding', opts)).toBeTruthy();
        await type('/s');
        expect(screen.getByText('/summarize', opts)).toBeTruthy();
        expect(screen.getByText('/sql-help', opts)).toBeTruthy();
        expect(screen.queryByText('/coding', opts)).toBeNull();
        await type('');
        expect(screen.queryByTestId('skill-menu', opts)).toBeNull();
    });

    it('does not open for a "/" in the middle of a message', async () => {
        await mount(createFakeClient({ skills: { skills: SKILLS, invalid: {} } }));
        await type('see /sum');
        expect(screen.queryByTestId('skill-menu', opts)).toBeNull();
    });

    it('picking a skill puts "/name " in the field and closes the menu', async () => {
        await mount(createFakeClient({ skills: { skills: SKILLS, invalid: {} } }));
        await type('/co');
        await fireEvent.press(await screen.findByTestId('skill-menu-coding', opts));
        expect(screen.getByTestId('composer-input', opts).props.value).toBe('/coding ');
        expect(screen.queryByTestId('skill-menu', opts)).toBeNull();
    });

    it('says it is loading while the list is read', async () => {
        const base = createFakeClient({});
        await mount({ ...base, listSkills: () => new Promise<never>(() => undefined) });
        await type('/');
        expect(await screen.findByText('Loading skills…', opts)).toBeTruthy();
    });

    it('says why it failed', async () => {
        const base = createFakeClient({});
        await mount({ ...base, listSkills: () => Promise.reject(new Error('PC is asleep')) });
        await type('/');
        expect(await screen.findByText("Couldn't load your skills: PC is asleep", opts)).toBeTruthy();
    });

    it('shows nothing, and no explaining line, when the agent lists no skills (gaiacpp)', async () => {
        await mount(createFakeClient({ skills: { skills: [], invalid: {} } }));
        await type('/');
        await waitFor(() => expect(screen.queryByTestId('skill-menu', opts)).toBeNull());
        expect(screen.queryByText('Skills', opts)).toBeNull();
        expect(screen.queryByText('Loading skills…', opts)).toBeNull();
    });

    it('stays off a blocked composer', async () => {
        await mount(createFakeClient({ skills: { skills: SKILLS, invalid: {} } }), { value: '/', disabledReason: 'Read only' });
        expect(screen.queryByTestId('skill-menu', opts)).toBeNull();
    });
});

describe('the menu height', () => {
    it('never passes 240 or two fifths of the screen', () => {
        expect(skillMenuHeight(900)).toBe(240);
        expect(skillMenuHeight(400)).toBe(160);
        expect(skillMenuHeight(0)).toBe(0);
    });
});
