// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render } from '@testing-library/react-native';
import { useState } from 'react';

import { KeyedScene } from './KeyedScene';

/** Owns state built from its prop on first mount, as a gallery scene's fake client does; records what it built. */
function recordingScene(built: string[]) {
    return function Scene({ picked }: { picked: string }) {
        useState(() => built.push(picked));
        return null;
    };
}

describe('KeyedScene', () => {
    it('rebuilds a scene that owns state built from its prop when the key changes', async () => {
        const built: string[] = [];
        const Scene = recordingScene(built);
        const view = await render(<KeyedScene sceneKey="loading" scene={Scene} props={{ picked: 'loading' }} />);
        await view.rerender(<KeyedScene sceneKey="table" scene={Scene} props={{ picked: 'table' }} />);
        expect(built).toEqual(['loading', 'table']);
    });

    it('keeps a scene mounted while the key stays the same', async () => {
        const built: string[] = [];
        const Scene = recordingScene(built);
        const view = await render(<KeyedScene sceneKey="a" scene={Scene} props={{ picked: 'a' }} />);
        await view.rerender(<KeyedScene sceneKey="a" scene={Scene} props={{ picked: 'b' }} />);
        expect(built).toEqual(['a']);
    });
});
