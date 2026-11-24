// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { StartCard } from '@webui/types';
import { UIProvider } from '@/ui';

import { TryChips } from './TryChips';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const card = (skill: string, title: string): StartCard => ({ skill, title, note: '', prompt: `${title} prompt`, needs_input: false });
const FIVE = ['a', 'b', 'c', 'd', 'e'].map((s) => card(s, `Task ${s}`));

const mount = (props: Partial<Parameters<typeof TryChips>[0]> = {}) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <UIProvider>
                <TryChips onPick={() => undefined} {...props} />
            </UIProvider>
        </SafeAreaProvider>,
    );

describeNative('TryChips', () => {
    it('shows two tasks and one example', async () => {
        await mount({ cards: FIVE.slice(0, 2) });
        expect(screen.getAllByText(/^(Task |Recipe)/)).toHaveLength(3);
        expect(screen.getByText('Recipe')).toBeTruthy();
    });

    it('shows three examples when the PC offers no tasks', async () => {
        await mount({ cards: [] });
        expect(screen.getAllByText(/^(Recipe|Checklist|Split a bill)$/)).toHaveLength(3);
    });

    it('caps five tasks at two plus one example', async () => {
        await mount({ cards: FIVE });
        expect(screen.queryByText('Task c')).toBeNull();
        expect(screen.getByText('Task b')).toBeTruthy();
        expect(screen.getByText('Recipe')).toBeTruthy();
    });

    it('holds its space unseen and out of reach while pending', async () => {
        await mount({ pending: true });
        const row = screen.getByTestId('try-chips-pending', { includeHiddenElements: true });
        expect(row.props.style).toMatchObject({ opacity: 0 });
        expect(row.props.pointerEvents).toBe('none');
    });

    it('hands the task prompt as sent to onPick', async () => {
        const onPick = jest.fn();
        await mount({ cards: FIVE, onPick });
        await fireEvent.press(screen.getByTestId('try-task-a'));
        expect(onPick).toHaveBeenCalledWith('Task a prompt');
    });
});
