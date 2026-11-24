// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { GaiaNotification } from '@webui/types/agent';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { indexOfText, tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';

import { DocsBar } from './header/DocsBar';
import { PermissionPrompt } from './permission/PermissionPrompt';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/' }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>{children}</ThemeProvider>
        </SafeAreaProvider>
    </QueryClientProvider>
);

const prompt = (fields: Partial<GaiaNotification> = {}): GaiaNotification => ({
    id: 'p1',
    type: 'permission_request',
    agentId: 'gaia',
    agentName: 'GAIA',
    title: '',
    message: '',
    timestamp: 0,
    read: false,
    dismissed: false,
    priority: 'high',
    tool: 'run_python',
    toolLabel: 'running Python',
    alwaysScope: 'run_python',
    timeoutSeconds: 30,
    toolArgs: { code: 'print(1)' },
    ...fields,
});

describeNative('PermissionPrompt accessibility', () => {
    afterEach(() => jest.restoreAllMocks());

    it('every control is named, has a role and holds 44 pt', async () => {
        await render(<PermissionPrompt prompt={prompt()} onAnswer={jest.fn()} />, { wrapper: wrap });
        const list = touchables();
        expect(list.map((t) => t.testID).filter(Boolean)).toEqual(expect.arrayContaining(['perm-allow', 'perm-always', 'perm-deny']));
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
    });

    it('the card is a dialog named by its heading, and the heading is announced', async () => {
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        await render(<PermissionPrompt prompt={prompt()} onAnswer={jest.fn()} />, { wrapper: wrap });
        const heading = walk().find((n) => n.props.accessibilityRole === 'header');
        expect(heading).toBeTruthy();
        const card = screen.getByTestId('perm-card');
        expect(card.props.accessibilityLabel).toBeTruthy();
        expect(announce).toHaveBeenCalledWith(card.props.accessibilityLabel);
    });

    it('reads the heading, then the body, then the pinned warnings, then the buttons', async () => {
        await render(<PermissionPrompt prompt={prompt()} onAnswer={jest.fn()} />, { wrapper: wrap });
        const order = walk().map((n) => n.props.testID as string | undefined);
        const at = (id: string) => order.indexOf(id);
        const heading = walk().findIndex((n) => n.props.accessibilityRole === 'header');
        expect(heading).toBeGreaterThanOrEqual(0);
        expect(at('perm-card')).toBeLessThan(heading);
        expect(heading).toBeLessThan(at('perm-details-body'));
        expect(at('perm-details-body')).toBeLessThan(at('perm-warnings'));
        expect(at('perm-warnings')).toBeLessThan(at('perm-allow'));
        expect(at('perm-allow')).toBeLessThan(at('perm-deny'));
        expect(at('perm-deny')).toBeLessThan(at('perm-timer'));
    });

    it('a busy card disables all three answers and says so', async () => {
        await render(<PermissionPrompt prompt={prompt()} busy onAnswer={jest.fn()} />, { wrapper: wrap });
        const answers = touchables().filter((t) => ['perm-allow', 'perm-always', 'perm-deny'].includes(t.testID ?? ''));
        expect(answers).toHaveLength(3);
        for (const a of answers) expect(a.disabled).toBe(true);
    });

    it('the Details disclosure exposes expanded and flips it', async () => {
        await render(<PermissionPrompt prompt={prompt({ tool: 'write_file', alwaysScope: 'write_file', toolArgs: { path: 'a.txt', content: 'hi' } })} onAnswer={jest.fn()} />, { wrapper: wrap });
        const details = () => touchables().find((t) => t.expanded !== undefined && !/lines/i.test(t.name));
        expect(details()).toBeTruthy();
        expect(details()!.expanded).toBe(false);
        await fireEvent.press(screen.getByText(details()!.name));
        expect(details()!.expanded).toBe(true);
    });

    it('a failed answer arrives as an assertive alert', async () => {
        await render(<PermissionPrompt prompt={prompt()} error="The PC did not answer" onAnswer={jest.fn()} />, { wrapper: wrap });
        const alert = walk().find((n) => n.props.accessibilityLiveRegion === 'assertive');
        expect(alert).toBeTruthy();
        expect(alert!.props.accessibilityRole).toBe('alert');
    });

    it('an expired card drops the answers and says why in text', async () => {
        await render(<PermissionPrompt prompt={prompt({ expiresAt: Date.now() - 1000 })} onAnswer={jest.fn()} />, { wrapper: wrap });
        expect(touchables().map((t) => t.testID)).not.toContain('perm-allow');
        expect(indexOfText(/./)).toBeGreaterThanOrEqual(0);
        expect(screen.getByTestId('perm-expired')).toBeTruthy();
    });
});

const SESSION = {
    id: 'chat-1', title: 'A chat', created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z', model: '', system_prompt: null, message_count: 0,
    document_ids: ['a', 'b', 'c', 'd'],
};
const docOf = (id: string, filename: string, indexing_status = 'complete') => ({ id, filename, filepath: `/d/${filename}`, file_size: 10, chunk_count: 1, indexed_at: '2026-11-14T00:00:00Z', indexing_status });

describeNative('DocsBar accessibility', () => {
    const mount = async (onManage?: () => void) => {
        const client = createFakeClient({
            sessions: [SESSION],
            documents: { documents: [docOf('a', 'a.pdf'), docOf('b', 'b.pdf'), docOf('c', 'c.pdf'), docOf('d', 'd.pdf', 'failed')], total: 4, total_chunks: 4, total_size_bytes: 40 } as never,
        });
        const wrapped = ({ children }: { children: ReactNode }) => wrap({ children: <GaiaClientProvider client={client}>{children}</GaiaClientProvider> });
        await render(<DocsBar sessionId="chat-1" onFailed={jest.fn()} onManage={onManage} />, { wrapper: wrapped });
        await screen.findByTestId('docs-bar');
    };

    it('names the remove, more and manage controls, with roles and 44 pt', async () => {
        await mount(jest.fn());
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(list.filter((t) => /^Remove|remove/i.test(t.name)).length).toBeGreaterThanOrEqual(3);
        expect(list.some((t) => t.testID === 'docs-manage')).toBe(true);
        // The file-name pills do nothing when pressed, so they are text, not targets.
        expect(tooSmall(list.filter((t) => t.role !== 'text'))).toEqual([]);
    });

    it('a file-name pill is text, not a button that does nothing', async () => {
        await mount();
        const pills = touchables().filter((t) => t.minHeight === 32);
        expect(pills.length).toBeGreaterThanOrEqual(3);
        for (const p of pills) expect(p.role).toBe('text');
    });

    it('the summary line is one readable element', async () => {
        await mount();
        const summary = walk().find((n) => n.props.accessibilityLabel && /document|file/i.test(String(n.props.accessibilityLabel)) && n.props.accessible !== false);
        expect(summary).toBeTruthy();
    });
});
