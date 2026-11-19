// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { stripIsolates } from '@webui/i18n/registry';

import { translator } from '@/i18n/useT';

import { changeText } from './changeText';

const t = translator('en');
const text = (kind: string, params: Record<string, string | number | boolean> = {}) => stripIsolates(changeText({ id: 'x', kind, params, at: '2026-11-18T00:00:00Z' }, t).title).replace(/ /g, ' ');

describe('changeText', () => {
    it.each([
        ['connectorGrant', { agent: 'GAIA', connector: 'Gmail' }, 'Let GAIA use Gmail'],
        ['connectorGrant', { agent: 'GAIA', connector: 'Gmail', granted: false }, 'Stopped GAIA from using Gmail'],
        ['connectorActivation', { agent: 'GAIA', connector: 'Gmail', active: true }, 'Turned on Gmail for GAIA'],
        ['connectorActivation', { agent: 'GAIA', connector: 'Gmail', active: false }, 'Turned off Gmail for GAIA'],
        ['connectorEnable', { connector: 'GitHub' }, 'Turned on GitHub'],
        ['connectorDisable', { connector: 'GitHub' }, 'Turned off GitHub'],
        ['discordControl', { action: 'start' }, 'Started the Discord bot'],
        ['discordControl', { action: 'forgetAlways' }, "Cleared the Discord bot's always-allow approvals"],
        ['memoryCommit', { source: 'discovery', count: 1 }, 'Saved 1 item from scanning your PC to memory'],
        ['memoryCommit', { source: 'discovery', count: 12 }, 'Saved 12 items from scanning your PC to memory'],
        ['memoryCommit', { source: 'inference', count: 1 }, 'Saved 1 insight about you to memory'],
        ['memoryCommit', { source: 'inference', count: 3 }, 'Saved 3 insights about you to memory'],
        ['serverTarget', { mode: 'gaia' }, 'Switched GAIA back to its own model server'],
        ['serverTarget', {}, 'Pointed GAIA at a different model server'],
        ['deviceRemoved', { device: 'Pixel 9' }, 'Removed the paired device Pixel 9'],
        ['deviceRemoved', {}, 'Removed a paired device'],
        ['pairingClosed', {}, 'Closed pairing to new devices'],
        ['profileScanOn', {}, 'Turned on System discovery'],
        ['profileScanOff', {}, 'Turned off System discovery'],
    ])('%s %j reads "%s"', (kind, params, expected) => {
        expect(text(kind, params)).toBe(expected);
    });

    it('reads a variant it cannot word as a generic change', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(text('discordControl', { action: 'nope' })).toBe('Changed a setting');
        warn.mockRestore();
    });
});
