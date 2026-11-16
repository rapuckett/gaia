// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import { Platform, View as MockBanner } from 'react-native';

import { AppBanner } from './AppBanner';

jest.mock('expo-router', () => ({ usePathname: jest.fn() }));
jest.mock('./ConnectionBanner', () => ({ ConnectionBanner: () => <MockBanner /> }));

const shown = async (path: string) => {
    (usePathname as jest.Mock).mockReturnValue(path);
    const view = await render(<AppBanner />);
    return view.toJSON() !== null;
};

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('AppBanner', () => {
    it('shows nothing on /dev routes, where no PC is behind the scene', async () => {
        expect(await shown('/dev/composer')).toBe(false);
        expect(await shown('/dev')).toBe(false);
    });

    it('shows the connection banner on every other route', async () => {
        expect(await shown('/')).toBe(true);
        expect(await shown('/developer-notes')).toBe(true);
    });
});
