// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act } from 'react';
import { Platform, type AccessibilityActionEvent } from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import { createRoot } from 'test-renderer';

import type { GaiaNotification } from '@webui/types/agent';
import { APPROVAL_ARM_MS } from '@webui/utils/permissionPrompts.core';

import { PermissionPrompt } from './PermissionPrompt';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface ButtonSeen {
    onPress: () => void;
    onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
    onAccessibilityTap?: () => void;
    accessibilityActions?: readonly { name: string }[];
    variant?: string;
}
const buttons: Record<string, ButtonSeen> = {};
const mockMotion = { reduced: true, entering: [] as unknown[], onLayout: undefined as (() => void) | undefined };

jest.mock('react-native-reanimated', () => {
    const { View } = jest.requireActual('react-native');
    return {
        __esModule: true,
        default: {
            View: (p: { entering?: unknown; onLayout?: () => void }) => {
                mockMotion.entering.push(p.entering);
                mockMotion.onLayout = p.onLayout;
                return <View {...p} />;
            },
        },
        FadeIn: 'FadeIn',
        FadeInDown: 'FadeInDown',
        FadeOut: 'FadeOut',
        FadeOutDown: 'FadeOutDown',
        useReducedMotion: () => mockMotion.reduced,
    };
});
jest.mock('@/ui', () => {
    const { Text: RNText, View: RNView } = jest.requireActual('react-native');
    const Pass = ({ children }: { children?: unknown }) => children ?? null;
    return {
        Button: (p: { label: string } & ButtonSeen) => {
            buttons[p.label] = p;
            return null;
        },
        Disclosure: ({ children }: { children?: unknown }) => children ?? null,
        HScroll: Pass,
        Icon: () => null,
        Notice: ({ message, testID }: { message: string; testID?: string }) => <RNText testID={testID}>{message}</RNText>,
        Pressable: Pass,
        Row: Pass,
        ScrollBox: ({ children, testID }: { children?: unknown; testID?: string }) => <RNView testID={testID}>{children}</RNView>,
        Stack: Pass,
        Surface: Pass,
        Text: RNText,
        useTheme: () => ({ space: { xl: 24 }, colors: {} }),
    };
});
jest.mock('@/ui/icons', () => ({ ShieldQuestion: () => null }));

function prompt(fields: Partial<GaiaNotification>): GaiaNotification {
    return {
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
        tool: 'write_file',
        toolLabel: 'writing file',
        alwaysScope: 'write_file on notes.txt',
        timeoutSeconds: 30,
        ...fields,
    };
}

async function mount(p: GaiaNotification, onAnswer = jest.fn(), onExpired = jest.fn()) {
    for (const k of Object.keys(buttons)) delete buttons[k];
    const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
    await act(async () => {
        r.render(<PermissionPrompt prompt={p} onAnswer={onAnswer} onExpired={onExpired} />);
    });
    const scrolled = () => {
        const find = (node: unknown): unknown => {
            if (!node || typeof node !== 'object') return null;
            const n = node as { props?: { testID?: string }; children?: unknown[] };
            if (n.props?.testID === 'perm-details-scroll') return n;
            for (const c of Array.isArray(n.children) ? n.children : []) {
                const hit = find(c);
                if (hit) return hit;
            }
            return null;
        };
        const root = r.container.toJSON();
        return JSON.stringify(find(Array.isArray(root) ? { children: root } : root));
    };
    const layout = () => act(() => mockMotion.onLayout?.());
    return { onAnswer, onExpired, shown: () => JSON.stringify(r.container.toJSON()), scrolled, layout };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.useRealTimers();
    mockMotion.reduced = true;
});

const settle = () =>
    act(() => {
        jest.advanceTimersByTime(APPROVAL_ARM_MS);
    });
const alwaysLabel = () => Object.keys(buttons).find((label) => label.startsWith('Always allow'))!;
// VoiceOver activates through onAccessibilityTap, TalkBack through the standard activate action.
const activate = (label: string) =>
    act(() => {
        if (Platform.OS === 'ios') buttons[label].onAccessibilityTap?.();
        else buttons[label].onAccessibilityAction?.({ nativeEvent: { actionName: 'activate' } } as AccessibilityActionEvent);
    });

describe('PermissionPrompt entrance', () => {
    it('ignores every tap until the card has been still for the arm wait, then answers', async () => {
        const { onAnswer } = await mount(prompt({}));
        for (const label of [alwaysLabel(), 'Allow once', 'Deny']) act(() => buttons[label].onPress());
        act(() => {
            jest.advanceTimersByTime(APPROVAL_ARM_MS - 1);
        });
        for (const label of [alwaysLabel(), 'Allow once', 'Deny']) act(() => buttons[label].onPress());
        expect(onAnswer).not.toHaveBeenCalled();
        act(() => {
            jest.advanceTimersByTime(1);
        });
        act(() => buttons['Allow once'].onPress());
        expect(onAnswer.mock.calls).toEqual([['once']]);
    });

    it('takes a screen reader activation at once, on every answer', async () => {
        const { onAnswer } = await mount(prompt({}));
        for (const label of ['Allow once', alwaysLabel(), 'Deny']) {
            if (Platform.OS === 'ios') {
                // No custom action: VoiceOver would list an untranslated "activate" under Actions.
                expect(buttons[label].accessibilityActions).toBeUndefined();
                expect(buttons[label].onAccessibilityTap).toBeDefined();
            } else {
                expect(buttons[label].accessibilityActions).toEqual([{ name: 'activate' }]);
                expect(buttons[label].onAccessibilityTap).toBeUndefined();
            }
            activate(label);
        }
        expect(onAnswer.mock.calls).toEqual([['once'], ['always'], ['deny']]);
    });

    it('answers nothing while busy, by tap or screen reader', async () => {
        const onAnswer = jest.fn();
        for (const k of Object.keys(buttons)) delete buttons[k];
        const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
        await act(async () => {
            r.render(<PermissionPrompt prompt={prompt({})} busy onAnswer={onAnswer} />);
        });
        settle();
        act(() => buttons['Allow once'].onPress());
        activate(alwaysLabel());
        expect(onAnswer).not.toHaveBeenCalled();
    });

    it('starts the wait again when the keyboard moves the footer or the card changes size', async () => {
        const listeners = jest.mocked(KeyboardEvents.addListener);
        listeners.mockClear();
        const { onAnswer, layout } = await mount(prompt({}));
        expect(listeners.mock.calls.map(([name]) => name).sort()).toEqual(['keyboardDidHide', 'keyboardDidShow', 'keyboardWillHide', 'keyboardWillShow']);
        settle();
        const willHide = listeners.mock.calls.find(([name]) => name === 'keyboardWillHide')![1];
        act(() => willHide({} as never));
        act(() => buttons['Allow once'].onPress());
        settle();
        layout();
        act(() => buttons[alwaysLabel()].onPress());
        expect(onAnswer).not.toHaveBeenCalled();
        settle();
        act(() => buttons[alwaysLabel()].onPress());
        expect(onAnswer.mock.calls).toEqual([['always']]);
    });

    it('arms a prompt that replaces an armed one afresh, and still expires one never answered', async () => {
        const onAnswer = jest.fn();
        const onExpired = jest.fn();
        const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
        const show = (p: GaiaNotification) => <PermissionPrompt key={p.id} prompt={p} onAnswer={onAnswer} onExpired={onExpired} />;
        await act(async () => {
            r.render(show(prompt({ id: 'p1' })));
        });
        settle();
        await act(async () => {
            r.render(show(prompt({ id: 'p2', timeoutSeconds: 2 })));
        });
        act(() => buttons['Allow once'].onPress());
        expect(onAnswer).not.toHaveBeenCalled();
        await act(async () => {
            jest.advanceTimersByTime(3000);
        });
        expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it('keeps Always allow outlined and Allow once filled, even when Always is suggested', async () => {
        for (const k of Object.keys(buttons)) delete buttons[k];
        const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
        await act(async () => {
            r.render(<PermissionPrompt prompt={prompt({})} repeats={2} onAnswer={jest.fn()} />);
        });
        expect(JSON.stringify(r.container.toJSON())).toContain('allowed this 2 times');
        expect([buttons['Allow once'].variant, buttons[alwaysLabel()].variant, buttons.Deny.variant]).toEqual(['primary', 'secondary', 'secondary']);
    });

    it('fades in without sliding, and appears at once under reduced motion', async () => {
        mockMotion.reduced = false;
        mockMotion.entering.length = 0;
        await mount(prompt({}));
        expect(mockMotion.entering).toContain('FadeIn');
        expect(mockMotion.entering).not.toContain('FadeInDown');
        mockMotion.reduced = true;
        mockMotion.entering.length = 0;
        await mount(prompt({}));
        expect(mockMotion.entering.every((e) => e === undefined)).toBe(true);
    });
});

describe('PermissionPrompt', () => {
    it('answers once or deny, and offers Always only when the call may be remembered', async () => {
        const { onAnswer } = await mount(prompt({}));
        settle();
        act(() => buttons['Allow once'].onPress());
        act(() => buttons.Deny.onPress());
        expect(onAnswer.mock.calls).toEqual([['once'], ['deny']]);
        expect(Object.keys(buttons).some((label) => label.startsWith('Always allow'))).toBe(true);
        act(() => buttons[Object.keys(buttons).find((label) => label.startsWith('Always allow'))!].onPress());
        expect(onAnswer).toHaveBeenLastCalledWith('always');

        await mount(prompt({ tool: 'allow_path_access', toolArgs: { path: '/x', kind: 'folder' } }));
        expect(Object.keys(buttons).some((label) => label.startsWith('Always allow'))).toBe(false);
        expect(buttons['Allow for this chat']).toBeDefined();
    });

    it('hides the buttons at the deadline and reports it once', async () => {
        const { onExpired, shown } = await mount(prompt({ timeoutSeconds: 3 }));
        expect(shown()).toContain('3s');
        expect(shown()).toContain(' left');
        await act(async () => {
            jest.advanceTimersByTime(5000);
        });
        expect(shown()).toContain('Timed out with no answer');
        expect(onExpired).toHaveBeenCalledTimes(1);
        await act(async () => {
            jest.advanceTimersByTime(5000);
        });
        expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it('picks the preview by tool: a saved file, a changed file, a calendar event', async () => {
        const write = await mount(prompt({ toolArgs: { file_path: 'a.txt', content: 'hello' } }));
        expect(write.shown()).toContain('What will be saved');
        expect(write.shown()).toContain('hello');

        const edit = await mount(prompt({ toolArgs: { file_path: 'a.txt', old_content: 'one\n', new_content: 'two\n' } }));
        expect(edit.shown()).toContain('What will change');
        expect(edit.shown()).toContain('-one');
        expect(edit.shown()).toContain('+two');

        const event = await mount(
            prompt({
                tool: 'calendar/create_calendar_event',
                toolArgs: { title: 'Lunch', start: '2026-11-20', end: '2026-11-20', notify_attendees: [] },
            }),
        );
        expect(event.shown()).toContain('Lunch');
        expect(event.shown()).toContain('Nobody is notified');
        expect(event.shown()).not.toContain('What will be saved');
    });

    it('adds no pad under the body (the scroll box keeps the chevron off the text) and sets no cutting height', async () => {
        const { shown } = await mount(
            prompt({ toolArgs: { file_path: 'a.txt', old_content: 'one\n', new_content: 'two\nan added line\n' } }),
        );
        const tree = shown();
        expect(tree).toContain('"testID":"perm-details-body"');
        expect(tree).not.toContain('paddingBottom');
        expect(tree).not.toContain('maxHeight');
        expect(tree).not.toContain('"height"');
    });

    it('puts the full-access note first in the scrolling body, above the call details', async () => {
        const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
        await act(async () => {
            r.render(<PermissionPrompt prompt={prompt({})} fullAccessPending onAnswer={jest.fn()} />);
        });
        const tree = JSON.stringify(r.container.toJSON());
        expect(tree.indexOf('perm-details-body')).toBeGreaterThan(-1);
        expect(tree.indexOf('perm-details-body')).toBeLessThan(tree.indexOf('perm-full-pending'));
    });
});

describe('PermissionPrompt shows what will really run', () => {
    const ISOLATES = /[\u2066-\u2069]/g;

    it.each([
        ['a zero-width joiner', 'inv\u200doice.txt', 'inv[U+200D]oice.txt', '\u200d'],
        ['an emoji and its variation selector', '❤\ufe0f.txt', '❤[U+FE0F].txt', '\ufe0f'],
    ])('codes %s in a file name, with the hidden-characters note', async (_, name, coded, raw) => {
        const { shown } = await mount(prompt({ toolArgs: { file_path: `/home/u/${name}`, content: 'x' } }));
        expect(shown()).toContain(`/home/u/${coded}`);
        expect(shown()).not.toContain(raw);
        expect(shown()).toContain('perm-hidden-note');
    });

    it('pins the hidden-characters note outside the scrolling body', async () => {
        const { shown, scrolled } = await mount(prompt({ toolArgs: { file_path: '/home/u/inv\u200doice.txt', content: 'x' } }));
        expect(shown()).toContain('perm-hidden-note');
        expect(scrolled()).not.toContain('perm-hidden-note');
    });

    it('keeps an emoji and its variation selector in a search query, which reads as prose', async () => {
        const { shown } = await mount(prompt({ tool: 'web_search', toolLabel: undefined, alwaysScope: undefined, toolArgs: { query: 'I ❤\ufe0f cats' } }));
        expect(shown()).toContain('I ❤\ufe0f cats');
        expect(shown()).not.toContain('perm-hidden-note');
    });

    it('folds CRLF in a command to LF and codes nothing for it', async () => {
        const { shown } = await mount(prompt({ tool: 'run_shell_command', toolLabel: undefined, alwaysScope: undefined, toolArgs: { command: 'echo a\r\necho b' } }));
        expect(shown()).toContain('echo a\\necho b');
        expect(shown()).not.toContain('[U+000D]');
        expect(shown()).not.toContain('\\r');
        expect(shown()).not.toContain('perm-hidden-note');
    });

    it('codes a joiner in a command and in its Always allow label, keeping the raw scope for the answer', async () => {
        const p = prompt({ tool: 'run_shell_command', toolLabel: undefined, alwaysScope: 'gi\u200dt status', toolArgs: { command: 'gi\u200dt status' } });
        const { shown, onAnswer } = await mount(p);
        settle();
        expect(shown()).toContain('gi[U+200D]t status');
        expect(shown()).not.toContain('\u200d');
        const always = Object.keys(buttons).find((label) => label.replace(ISOLATES, '').startsWith('Always allow'))!;
        expect(always.replace(ISOLATES, '')).toBe('Always allow gi[U+200D]t status in this chat');
        act(() => buttons[always].onPress());
        expect(onAnswer).toHaveBeenLastCalledWith('always');
        expect(p.alwaysScope).toBe('gi\u200dt status');
    });

    it('codes the path in the question before isolating it', async () => {
        const { shown } = await mount(prompt({ tool: 'allow_path_access', toolArgs: { path: '/x/inv\u200doice.txt', kind: 'file' } }));
        expect(shown()).toContain('/x/inv[U+200D]oice.txt');
        expect(shown()).not.toMatch(/\[U\+206[6-9]\]/);
        expect(shown()).toContain('perm-hidden-note');
    });
});

describe('PermissionPrompt shows what code and commands really do', () => {
    const utf16Base64 = (text: string) => btoa([...text].map((c) => String.fromCharCode(c.charCodeAt(0), 0)).join(''));
    const shell = (command: string) => prompt({ tool: 'run_shell_command', toolLabel: undefined, alwaysScope: undefined, toolArgs: { command } });

    it("shows the line an encoded PowerShell command runs, and cmd's reading of ^ escapes", async () => {
        const encoded = await mount(shell(`powershell -EncodedCommand ${utf16Base64('Remove-Item x')}`));
        expect(encoded.shown()).toContain('The encoded part runs this:');
        expect(encoded.shown()).toContain('Remove-Item x');

        const escaped = await mount(shell('de^l x'));
        expect(escaped.shown()).toContain('Windows reads it as:');
        expect(escaped.shown()).toContain('del x');
    });

    it('shows a long decoded command whole, with no Show all', async () => {
        const lines = Array.from({ length: 20 }, (_, i) => `Write-Output line${i + 1}`).join('\n');
        const { shown } = await mount(shell(`powershell -EncodedCommand ${utf16Base64(lines)}`));
        expect(shown()).toContain('line20');
        expect(shown()).not.toContain('Show all');
    });

    it("says why a script can't be shown, keeps it out of the raw arguments, and notes the code risk", async () => {
        const { shown } = await mount(
            prompt({ tool: 'execute_python_file', toolLabel: undefined, alwaysScope: undefined, toolArgs: { file_path: '/home/u/run.py', _script: { unreadable: 'not_text' } } }),
        );
        expect(shown()).toContain("This file isn't text, so its code can't be shown.");
        expect(shown()).toContain('perm-code-risk');
        expect(shown()).not.toContain('_script');
    });

    it('notes the code risk on a code tool and shows its emoji as written', async () => {
        const code = 'print("\u{1F468}\u200d\u{1F469}\u200d\u{1F467} ❤\ufe0f")';
        const { shown } = await mount(prompt({ tool: 'run_python', toolLabel: undefined, alwaysScope: undefined, toolArgs: { code } }));
        expect(shown()).toContain('\u{1F468}\u200d\u{1F469}\u200d\u{1F467} ❤\ufe0f');
        expect(shown()).toContain('perm-code-risk');
        expect(shown()).not.toContain('perm-hidden-note');
    });

    it('pins the code-risk note outside the scrolling body of a long code card', async () => {
        const code = Array.from({ length: 30 }, (_, i) => `print(${i})`).join('\n');
        const { shown, scrolled } = await mount(prompt({ tool: 'run_python', toolLabel: undefined, alwaysScope: undefined, toolArgs: { code } }));
        expect(scrolled()).toContain('perm-details-body');
        expect(shown()).toContain('perm-code-risk');
        expect(scrolled()).not.toContain('perm-code-risk');
    });

    it("shows a mail's header fields apart from its body", async () => {
        const { shown } = await mount(
            prompt({ tool: 'send_now', toolLabel: undefined, alwaysScope: undefined, toolArgs: { _exact_text: 'To: ada@example.com\nSubject: Lunch\n\nSee you at noon.' } }),
        );
        expect(shown()).toContain('ada@example.com');
        expect(shown()).toContain('See you at noon.');
        expect(shown()).not.toContain('Subject: Lunch');
    });
    const lines20 = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');

    it('shows the question only for fresh-consent tools, after the details', async () => {
        const path = await mount(prompt({ tool: 'allow_path_access', toolArgs: { path: '/x/notes', kind: 'folder' } }));
        const write = await mount(prompt({ toolArgs: { file_path: 'a.txt', content: 'hello' } }));
        const order = path.shown();
        expect(order).toContain('Allow it for this chat?');
        expect(order.indexOf('/x/notes')).toBeLessThan(order.indexOf('Allow it for this chat?'));
        expect(write.shown()).not.toContain('GAIA needs your OK');
        const share = await mount(prompt({ tool: 'share_engineering_context', alwaysScope: undefined, toolArgs: {} }));
        expect(share.shown()).toContain('GAIA needs your OK');
    });

    it('shows a long mail body and a relayed command whole, with no show-more link', async () => {
        const mail = await mount(prompt({ tool: 'send_now', toolLabel: undefined, alwaysScope: undefined, toolArgs: { _exact_text: `To: ada@example.com\nSubject: Lunch\n\n${lines20}` } }));
        const cmd = await mount(prompt({ tool: 'run_shell_command', toolLabel: undefined, alwaysScope: undefined, summary: lines20 }));
        for (const { shown } of [mail, cmd]) {
            expect(shown()).toContain('line 1"');
            expect(shown()).toContain('line 20');
            expect(shown()).not.toMatch(/Show (all|more|less)/i);
        }
    });

    it('shows the path of a path-access prompt as a line of its own', async () => {
        const { shown } = await mount(prompt({ tool: 'allow_path_access', toolArgs: { path: '/x/notes', kind: 'folder' } }));
        expect(shown().split('/x/notes').length - 1).toBeGreaterThanOrEqual(2);
    });
});
