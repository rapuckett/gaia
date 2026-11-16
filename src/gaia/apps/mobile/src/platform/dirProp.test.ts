// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';
import { dirProp } from './dirProp';

describe('dirProp', () => {
    it('sets react-native-web locale on web only', () => {
        expect(dirProp('rtl')).toEqual(Platform.OS === 'web' ? { dir: 'rtl' } : {});
        expect(dirProp('ltr')).toEqual(Platform.OS === 'web' ? { dir: 'ltr' } : {});
    });
});
