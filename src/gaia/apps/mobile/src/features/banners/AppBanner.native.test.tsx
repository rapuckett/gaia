// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import { Platform, View as MockBanner } from 'react-native';

import { AppBanner } from './AppBanner';

jest.mock('expo-router', () => ({ usePathname: jest.fn() }));
jest.mock('./ConnectionBanner', () => ({ ConnectionBanner: ({ hideServerDown }: { hideServerDown?: boolean }) => <MockBanner testID={hideServerDown ? 'hides-server-down' : 'plain'} /> }));

const shown = async (path: string) => {
    (usePathname as jest.Mock).mockReturnValue(path);
    const view = await render(<AppBanner />);
    return view.toJSON() !== null;
};
const hides = async (path: string) => {
    (usePathname as jest.Mock).mockReturnValue(path);
    const view = await render(<AppBanner />);
    return !!view.queryByTestId('hides-server-down');
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

    it('keeps the server-down card off every Settings route, and only those', async () => {
        expect(await hides('/settings')).toBe(true);
        expect(await hides('/settings/model')).toBe(true);
        expect(await hides('/')).toBe(false);
        expect(await hides('/chat/abc')).toBe(false);
        expect(await hides('/settingsish')).toBe(false);
    });
});
