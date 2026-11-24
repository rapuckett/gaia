// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { ThemeProvider } from '../theme/ThemeProvider';
import { Button } from './Button';

const wrap = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('Button screen-reader activation', () => {
    it('hands VoiceOver and TalkBack activation to the native view, apart from onPress', async () => {
        const onPress = jest.fn();
        const onAccessibilityTap = jest.fn();
        const onAccessibilityAction = jest.fn();
        await render(
            <Button
                label="Allow once"
                onPress={onPress}
                onAccessibilityTap={onAccessibilityTap}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={onAccessibilityAction}
                testID="b"
            />,
            { wrapper: wrap },
        );
        const target = screen.getByTestId('b');
        expect(target.props.onAccessibilityTap).toBe(onAccessibilityTap);
        expect(target.props.accessibilityActions).toEqual([{ name: 'activate' }]);
        expect(target.props.onAccessibilityAction).toBe(onAccessibilityAction);
        await fireEvent(target, 'accessibilityTap');
        await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
        expect(onAccessibilityTap).toHaveBeenCalledTimes(1);
        expect(onAccessibilityAction).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
    });

    it('sets no screen-reader actions unless asked', async () => {
        await render(<Button label="Deny" onPress={jest.fn()} testID="b" />, { wrapper: wrap });
        const target = screen.getByTestId('b');
        expect(target.props.accessibilityActions).toBeUndefined();
        expect(target.props.onAccessibilityTap).toBeUndefined();
    });
});
