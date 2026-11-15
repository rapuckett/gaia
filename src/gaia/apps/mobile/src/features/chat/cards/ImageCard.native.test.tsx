// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { RenderCard } from './RenderCard';

jest.mock('@/platform/fetch', () => ({ platformFetch: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const t = translator('en');
const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const show = (src: string) =>
    render(
        <ThemeProvider>
            <RenderCard render="image" data={{ src, alt: 'A pixel' }} />
        </ThemeProvider>,
    );

describeNative('image card', () => {
    it.each(['https://example.com/a.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'file:///etc/passwd', '/api/media/image/../x.png'])(
        'refuses %s without drawing an image',
        async (src) => {
            await show(src);
            expect(screen.getByText(t('render.invalidPayload', { render: 'image' }))).toBeTruthy();
            expect(screen.queryByTestId('card-image-img')).toBeNull();
        },
    );

    it('draws an allowed data URL', async () => {
        await show(PIXEL);
        expect(screen.getByTestId('card-image-img').props.source).toEqual({ uri: PIXEL });
        expect(screen.queryByText(t('render.invalidPayload', { render: 'image' }))).toBeNull();
    });
});
