// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { PushExplainer } from './PushExplainer';
import { PushSettingsRowView } from './PushSettingsRow';
import type { PushRowState } from './pushStore';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
            <SheetHost>{children}</SheetHost>
        </ThemeProvider>
    </SafeAreaProvider>
);

const row = (state: PushRowState, refusal: string | null = null) =>
    render(<PushSettingsRowView state={state} refusal={refusal} onTurnOn={jest.fn()} onOpenSettings={jest.fn()} />, { wrapper });

describeNative('the push settings row accessibility', () => {
    it.each<[PushRowState, string | null]>([
        ['unavailable', null],
        ['not_asked', null],
        ['on', null],
        ['blocked', null],
        ['unreachable', null],
    ])('%s: it has one heading, and any button is named, a button and 44 pt', async (state) => {
        await row(state);
        expect(walk().filter((n) => n.props.accessibilityRole === 'header')).toHaveLength(1);
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
        expect(list.length).toBe(state === 'not_asked' || state === 'blocked' ? 1 : 0);
    });

    it('the heading precedes the state sentence, which precedes the button', async () => {
        await row('not_asked');
        const order = walk().map((n) => n.props.testID ?? n.props.accessibilityRole);
        expect(order.indexOf('header')).toBeLessThan(order.indexOf('push-row-turn-on'));
        expect(touchables()[0]!.name).toBe(t('mobileApp.push.ask.allow'));
    });

    it('a PC that refuses the phone is an assertive alert, with its own words as detail', async () => {
        await row('on', 'Device limit reached');
        const refused = screen.getByTestId('push-row-pc-refused');
        expect(refused.props.accessibilityLiveRegion).toBe('assertive');
        expect(refused.props.accessibilityRole).toBe('alert');
        expect(JSON.stringify(refused)).toContain('Device limit reached');
    });

    it('an unreachable relay is announced as a warning alert', async () => {
        await row('unreachable');
        expect(walk().some((n) => n.props.accessibilityRole === 'alert' && n.props.accessibilityLiveRegion === 'assertive')).toBe(true);
    });
});

describeNative('the push explainer accessibility', () => {
    const show = (open = true) => render(<PushExplainer open={open} onAllow={jest.fn()} onLater={jest.fn()} />, { wrapper });

    it('is a modal sheet with a heading, and both answers are named full-width buttons', async () => {
        await show();
        await screen.findByTestId('push-ask-allow');
        const nodes = walk();
        expect(nodes.some((n) => n.props.accessibilityViewIsModal === true)).toBe(true);
        expect(nodes.findIndex((n) => n.props.accessibilityRole === 'header')).toBeLessThan(nodes.findIndex((n) => n.props.testID === 'push-ask-allow'));
        const answers = touchables().filter((x) => /^push-ask-/.test(x.testID ?? ''));
        expect(answers.map((a) => a.name)).toEqual([t('mobileApp.push.ask.allow'), t('mobileApp.push.ask.later')]);
        expect(unnamed(answers)).toEqual([]);
        expect(tooSmall(answers)).toEqual([]);
    });

    it('the explanation is read before the buttons', async () => {
        await show();
        await screen.findByTestId('push-ask-allow');
        const text = walk().findIndex((n) => (n.children ?? []).some((c) => c === t('mobileApp.push.ask.body')));
        expect(text).toBeGreaterThanOrEqual(0);
        expect(text).toBeLessThan(walk().findIndex((n) => n.props.testID === 'push-ask-allow'));
    });

    it('closed, it leaves nothing for a screen reader to land on', async () => {
        await show(false);
        expect(touchables().filter((x) => /^push-ask-/.test(x.testID ?? ''))).toEqual([]);
    });
});
