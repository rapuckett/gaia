// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { GaiaApiError } from '@/api/errors';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LinkPreview } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { useDeviceRefused } from '@/api/routeAccess';
import { GaiaClientProvider } from '@/data';
import { glossParts, isolate, translate } from '@webui/i18n/registry';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { AddSkillsSheet } from './AddSkillsSheet';

jest.mock('@/api/routeAccess', () => ({ ...jest.requireActual('@/api/routeAccess'), useDeviceRefused: jest.fn(() => false) }));
const refused = useDeviceRefused as jest.Mock;
beforeEach(() => refused.mockReturnValue(false));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const FRAME = { frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function wrapper(client: ReturnType<typeof createFakeClient>) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={FRAME}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return Wrapper;
}
async function readLink(link: string) {
    fireEvent.changeText(await screen.findByLabelText('Link to a skill or skills library'), link);
    await waitFor(() => expect(screen.getByLabelText('Link to a skill or skills library').props.value).toBe(link));
    fireEvent.press(screen.getByText('Read'));
}

const PREVIEW: LinkPreview = {
    link: 'https://github.com/acme/skills',
    source: 'acme/skills',
    pin: 'abc',
    warning: 'Only add skills from people you trust.',
    skills: [
        { name: 'docs-lookup', description: 'Look up docs.', path: 'docs-lookup', has_code: true, permissions: [], permissions_unreadable: false, verdict: 'REVIEW', findings: [], installed: false, update: false },
    ] as unknown as LinkPreview['skills'],
};

describeNative('AddSkillsSheet', () => {
    it('hands the link to the PC, with no add control, when the PC keeps the add to itself', async () => {
        refused.mockReturnValue(true);
        const client = createFakeClient({ linkPreview: () => PREVIEW });
        await render(<AddSkillsSheet open onClose={() => {}} />, { wrapper: wrapper(client) });
        await readLink(PREVIEW.link);
        await screen.findByText('docs-lookup');
        expect(screen.getByText('Add these on your PC')).toBeTruthy();
        expect(screen.getByText('Share the link')).toBeTruthy();
        expect(screen.queryByText(/^Add \d/)).toBeNull();
    });

    it('keeps a code skill unpickable until the opt-in is ticked, and sends allow_code only then', async () => {
        const adds: unknown[] = [];
        const preview = { ...PREVIEW, skills: [...PREVIEW.skills, { ...(PREVIEW.skills[0] as object), name: 'notes', path: 'notes', has_code: false, verdict: 'ALLOW' }] as unknown as LinkPreview['skills'] };
        const client = createFakeClient({
            linkPreview: () => preview,
            linkAdd: (r) => {
                adds.push(r);
                return { added: r.names.map((name) => ({ name, updated: false, verdict: 'ALLOW', has_code: false, findings: [] })), failed: { other: 'Already installed elsewhere.' } };
            },
        });
        await render(<AddSkillsSheet open onClose={() => {}} />, { wrapper: wrapper(client) });
        await readLink(PREVIEW.link);
        await screen.findByText('docs-lookup');

        expect(screen.getByTestId('skills-link-pick-docs-lookup').props.accessibilityState?.disabled).toBe(true);
        fireEvent.press(screen.getByText('Add 1'));
        await screen.findByText(/^Added .*notes.*\.$/);
        expect(adds).toEqual([{ url: PREVIEW.link, names: ['notes'], pin: 'abc', allowCode: false }]);
        expect(screen.queryByText('Add skills that run code?')).toBeNull();
        expect(screen.getByText('1 not added')).toBeTruthy();
    });

    it('lets a code skill be picked once the opt-in is ticked, and sends allow_code', async () => {
        const adds: unknown[] = [];
        const client = createFakeClient({
            linkPreview: () => PREVIEW,
            linkAdd: (r) => {
                adds.push(r);
                return { added: [{ name: 'docs-lookup', updated: false, verdict: 'REVIEW', has_code: true, findings: [] }], failed: {} };
            },
        });
        await render(<AddSkillsSheet open onClose={() => {}} />, { wrapper: wrapper(client) });
        await readLink(PREVIEW.link);
        await screen.findByText('docs-lookup');

        fireEvent.press(screen.getByTestId('skills-link-include-code'));
        await waitFor(() => expect(screen.getByTestId('skills-link-pick-docs-lookup').props.accessibilityState?.disabled).toBe(false));
        fireEvent.press(screen.getByTestId('skills-link-pick-docs-lookup'));
        fireEvent.press(await screen.findByText('Add 1'));
        await screen.findByText('Add skills that run code?');
        expect(adds).toEqual([]);
        fireEvent.press(screen.getByText('Add with code'));
        await screen.findByText(/^Added .*docs-lookup.*\.$/);
        expect(adds).toEqual([{ url: PREVIEW.link, names: ['docs-lookup'], pin: 'abc', allowCode: true }]);
    });

    it('sends nothing when the code confirm is cancelled', async () => {
        const adds: unknown[] = [];
        const client = createFakeClient({ linkPreview: () => PREVIEW, linkAdd: (r) => { adds.push(r); return { added: [], failed: {} }; } });
        await render(<AddSkillsSheet open onClose={() => {}} />, { wrapper: wrapper(client) });
        await readLink(PREVIEW.link);
        await screen.findByText('docs-lookup');
        fireEvent.press(screen.getByTestId('skills-link-include-code'));
        await waitFor(() => expect(screen.getByTestId('skills-link-pick-docs-lookup').props.accessibilityState?.disabled).toBe(false));
        fireEvent.press(screen.getByTestId('skills-link-pick-docs-lookup'));
        fireEvent.press(await screen.findByText('Add 1'));
        await screen.findByText('Add skills that run code?');
        fireEvent.press(screen.getByTestId('confirm-cancel'));
        await waitFor(() => expect(screen.queryByText('Add with code')).toBeNull());
        expect(adds).toEqual([]);
    });

    it('offers a skill installed from this same link again as an update, and leaves one installed elsewhere alone', async () => {
        const base = PREVIEW.skills[0] as object;
        const preview = {
            ...PREVIEW,
            skills: [
                { ...base, name: 'same-link', path: 'same-link', has_code: false, verdict: 'ALLOW', installed: true, update: true },
                { ...base, name: 'elsewhere', path: 'elsewhere', has_code: false, verdict: 'ALLOW', installed: true, update: false },
            ] as unknown as LinkPreview['skills'],
        };
        const client = createFakeClient({ linkPreview: () => preview });
        await render(<AddSkillsSheet open onClose={() => {}} />, { wrapper: wrapper(client) });
        await readLink(PREVIEW.link);
        await screen.findByText('same-link');
        expect(screen.getByText('Add 1')).toBeTruthy();
        expect(screen.getByTestId('skills-link-pick-same-link').props.accessibilityState?.disabled).toBeFalsy();
        expect(screen.getByTestId('skills-link-pick-elsewhere').props.accessibilityState?.disabled).toBe(true);
    });

    it('gives the sheet body a stable test id', async () => {
        const client = createFakeClient({ linkPreview: () => PREVIEW });
        await render(<AddSkillsSheet open onClose={() => {}} />, { wrapper: wrapper(client) });
        expect(await screen.findByTestId('add-skills-scroll')).toBeTruthy();
    });

    it('turns to the PC when it refuses the add', async () => {
        const client = createFakeClient({
            linkPreview: () => ({ ...PREVIEW, skills: [{ ...(PREVIEW.skills[0] as object), has_code: false }] as unknown as LinkPreview['skills'] }),
            linkAdd: () => {
                throw new GaiaApiError(403, 'Do this on the PC.');
            },
        });
        await render(<AddSkillsSheet open onClose={() => {}} />, { wrapper: wrapper(client) });
        await readLink(PREVIEW.link);
        await screen.findByText('docs-lookup');
        fireEvent.press(await screen.findByText('Add 1'));
        expect(await screen.findByText('Add these on your PC')).toBeTruthy();
    });

    it('writes the Arabic hint once, with one English gloss and no doubled period', () => {
        const hint = translate('ar', 'mobileApp.skills.linkHint', { github: 'GitHub', repo: 'owner/repo', skills: 'skills.sh', https: 'https', zip: '.zip' });
        expect(glossParts(hint)?.filter((p) => p.gloss)).toHaveLength(1);
        expect(hint).not.toContain('..');
    });

    it('isolates every Arabic value and never ends the sentence next to the .zip island', () => {
        const zip = isolate('.zip', 'ltr');
        const hint = translate('ar', 'mobileApp.skills.linkHint', { github: isolate('GitHub', 'ltr'), repo: isolate('owner/repo', 'ltr'), skills: isolate('skills.sh', 'ltr'), https: isolate('https', 'ltr'), zip });
        const placeholder = translate('ar', 'mobileApp.skills.linkPlaceholder', { github: isolate('GitHub', 'ltr'), skills: isolate('skills.sh', 'ltr'), zip });
        for (const full of [hint, placeholder]) {
            const text = (glossParts(full)?.filter((p) => !p.gloss).map((p) => p.text).join('') ?? full);
            expect(text).toContain(zip);
            expect(text.replace(zip, '')).not.toContain('.zip');
            expect(text).not.toContain(`${zip}.`);
        }
        expect(hint).toContain(isolate('https', 'ltr'));
        expect(placeholder).toContain(isolate('skills.sh', 'ltr'));
    });

    it("keeps the PC's reason off the suggested-libraries sentence, on its own left-to-right line", async () => {
        const client = {
            ...createFakeClient(),
            listFeaturedSkillLibraries: async () => {
                throw new GaiaApiError(500, 'index offline');
            },
        };
        await render(<AddSkillsSheet open onClose={() => {}} />, { wrapper: wrapper(client) });
        const sentence = await screen.findByText('Could not load suggested libraries.');
        expect(sentence.props.children).not.toContain('index offline');
        expect(StyleSheet.flatten(screen.getByText('500 index offline').props.style)).toMatchObject({ writingDirection: 'ltr' });
    });
});
