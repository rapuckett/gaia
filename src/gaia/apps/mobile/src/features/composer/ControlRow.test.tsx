// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, type ReactNode } from 'react';
import { createRoot, type TestNode } from 'test-renderer';

import { translator } from '@webui/i18n/translator';

import { ICON_ONLY_WIDTH } from './chipRoom';
import { Composer } from './Composer';
import { ContextMeter } from './ContextMeter';
import { ControlChip } from './ControlChip';
import { PrivateChip } from './PrivateChip';

let mockLocale: 'ar' | 'en' = 'ar';
jest.mock('@/i18n/useT', () => ({ useT: () => jest.requireActual('@webui/i18n/translator').translator(mockLocale) }));
jest.mock('react-native', () => ({ View: 'View', Platform: { OS: 'ios' } }));
jest.mock('@/ui/icons', () => ({ ArrowUp: 'ArrowUp', Square: 'Square', ChevronDown: 'ChevronDown', Eye: 'Eye', EyeOff: 'EyeOff', Check: 'Check' }));
jest.mock('./AttachButton', () => ({ AttachButton: 'AttachButton' }));
jest.mock('./pickFiles', () => ({ pickedFromPaste: jest.fn() }));
jest.mock('./AttachmentChips', () => ({ AttachmentChips: 'AttachmentChips' }));
jest.mock('@/ui', () => {
    const { createElement: mockElement } = jest.requireActual('react');
    const host = (type: string) => (props: Record<string, unknown>) => mockElement(type, props, props.children as ReactNode);
    return {
        Button: host('Button'),
        IconButton: host('IconButton'),
        Notice: host('Notice'),
        TextField: host('TextField'),
        Row: host('Row'),
        Stack: host('Stack'),
        Surface: host('Surface'),
        Icon: host('Icon'),
        ListRow: host('ListRow'),
        Ltr: host('Ltr'),
        Pressable: host('Pressable'),
        Sheet: host('Sheet'),
        Text: host('Text'),
        useTheme: () => ({ colors: {}, radius: {} }),
    };
});

type Root = ReturnType<typeof createRoot>;
const find = (r: Root, testID: string) => r.container.queryAll((i) => i.props.testID === testID)[0];
const style = (n: { props: { style?: unknown } }) => n.props.style as Record<string, unknown>;

describe('composer control row in Arabic', () => {
    it('shows the chip label in Arabic only and keeps the bilingual text for screen readers', async () => {
        const r = createRoot();
        await act(async () => r.render(<PrivateChip on={false} onChange={() => undefined} />));
        const label = r.container.queryAll((i) => i.type === 'Text')[0];
        expect(label.props.children).toBe(translator('ar').bare('composer.memoryOn'));
        expect(String(label.props.children)).not.toMatch(/[A-Za-z]/);
        expect(String(find(r, 'private-chip').props.accessibilityLabel)).toMatch(/[A-Za-z]/);
    });

    it('forces a model chip label left to right only when it is a model id, never the fallback word', async () => {
        const dirs: Array<unknown> = [];
        for (const value of ['ltr', undefined] as const) {
            const r = createRoot();
            await act(async () =>
                r.render(<ControlChip label="Gemma" chip="model" icon={'Cpu' as never} value={value} testID="c" />),
            );
            dirs.push(r.container.queryAll((n) => n.type === 'Text')[0].props.dir);
        }
        expect(dirs).toEqual(['ltr', undefined]);
    });

    // react-native-web renders View as a DOM node the style assertions can't read.
    (typeof document === 'undefined' ? it : it.skip)('lets the chips shrink while Attach and Send keep their size', async () => {
        const r = createRoot();
        await act(async () =>
            r.render(<Composer onSend={() => undefined} leftControls={<PrivateChip on={false} onChange={() => undefined} />} />),
        );
        expect(style(find(r, 'composer-controls'))).toMatchObject({ flexShrink: 1, minWidth: 0 });
        expect(style(find(r, 'composer-actions'))).toMatchObject({ flexShrink: 0 });
        expect(JSON.stringify(style(find(r, 'composer-controls')))).not.toMatch(/left|right/i);
    });

    // Same as above: the web project renders View as a DOM node.
    // Each chip keeps an off-screen full-width copy (one Text) beside the shown one.
    (typeof document === 'undefined' ? it.each : it.skip.each)(['en', 'ar'] as const)('shows the chip as its icon alone when its measured label does not fit, keeping the label for screen readers (%s)', async (locale) => {
        mockLocale = locale;
        const r = createRoot();
        await act(async () =>
            r.render(<Composer onSend={() => undefined} leftControls={<PrivateChip on={false} onChange={() => undefined} />} />),
        );
        const labels = () => r.container.queryAll((i) => i.type === 'Text');
        const layout = (width: number) => find(r, 'composer-controls').props.onLayout({ nativeEvent: { layout: { width } } });
        const measure = r.container.queryAll((i) => typeof i.props.onLayout === 'function' && i.props.testID !== 'composer-controls')[0];
        await act(async () => measure.props.onLayout({ nativeEvent: { layout: { width: 120 } } }));
        await act(async () => layout(340));
        expect(labels()).toHaveLength(2);
        await act(async () => layout(60));
        expect(labels()).toHaveLength(1);
        // The icon alone takes less room than its 44-wide touch target, so the model's name gets the rest.
        const chip = find(r, 'private-chip');
        expect(chip.props.inline).toBe(true);
        expect(style(chip.children[0] as never)).toMatchObject({ width: ICON_ONLY_WIDTH });
        expect(String(find(r, 'private-chip').props.accessibilityLabel).length).toBeGreaterThan(3);
        mockLocale = 'ar';
    });

    // Widths as logged on web (en, 390 px): no context reading yet, so the meter is "Context –".
    // The meter's last collapse step remounted its measures, and the unmount's 0 width undid the collapse.
    (typeof document === 'undefined' ? it : it.skip)('collapses to the measured web widths and keeps the model name at 390 px', async () => {
        mockLocale = 'en';
        const widths: Record<string, number> = { permission: 65, meter: 106, meterWord: 0, model: 135, place: 182 };
        const r = createRoot();
        await act(async () =>
            r.render(
                <Composer
                    onSend={() => undefined}
                    leftControls={<ControlChip label="Ask" chip="permission" icon={'Shield' as never} menu testID="permission-chip" />}
                    rightControls={
                        <>
                            <ContextMeter usage={null} unavailable="No reading yet" />
                            <ControlChip label="Gemma 4 E4B" place="Local" chip="model" icon={'Cpu' as never} value="ltr" menu testID="model-chip" />
                        </>
                    }
                />,
            ),
        );
        const text = (n: TestNode): string => (typeof n === 'string' ? n : n.children.map(text).join(''));
        const idOf = (n: TestNode) => {
            const t = text(n);
            return t.includes('·') ? 'place' : t.includes('Gemma') ? 'model' : t.includes('Ask') ? 'permission' : t ? 'meter' : 'meterWord';
        };
        const measures = () => r.container.queryAll((i) => typeof i.props.onLayout === 'function' && (i.parent?.props.style as { position?: string } | undefined)?.position === 'absolute');
        expect(measures().map(idOf).sort()).toEqual(Object.keys(widths).sort());
        for (const m of measures()) await act(async () => m.props.onLayout({ nativeEvent: { layout: { width: widths[idOf(m)] } } }));
        await act(async () => find(r, 'composer-controls').props.onLayout({ nativeEvent: { layout: { width: 228 } } }));

        expect(find(r, 'context-meter')).toBeUndefined();
        expect(find(r, 'permission-chip').props.inline).toBe(true);
        const shown = find(r, 'model-chip').queryAll((i) => i.type === 'Text');
        expect(shown.map(text)).toEqual(['Gemma 4 E4B']);
        mockLocale = 'ar';
    });
});
