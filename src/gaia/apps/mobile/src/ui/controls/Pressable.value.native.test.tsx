// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, Text } from 'react-native';

import { ThemeProvider } from '../theme/ThemeProvider';
import { Pressable } from './Pressable';

const wrap = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('Pressable accessibilityValue', () => {
    it('forwards the value to the native view', async () => {
        await render(
            <Pressable accessibilityLabel="Plan" accessibilityValue={{ text: '3 of 3' }} onPress={() => {}}>
                <Text>Plan</Text>
            </Pressable>,
            { wrapper: wrap },
        );
        expect(screen.getByLabelText('Plan').props.accessibilityValue).toEqual({ text: '3 of 3' });
    });
});
