// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Settings > Phones and tablets: the pairing code never outlives its window, and the section stays hidden while pairing is off. */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevicesSettings } from '../DevicesSettings';
import { useDeviceStore } from '../../../stores/deviceStore';
import { useChatStore } from '../../../stores/chatStore';
import { pairingLink } from '../../../utils/pairingLink';
import type { DeviceAccessStatus, DevicePairingOffer } from '../../../services/devicesApi';

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AAAA' } }));

const STATUS: DeviceAccessStatus = {
    listening: true, port: 4243, error_code: null, error_detail: null, pairing_open: false, pairing_expires_at: null,
    idle_expiry_days: 90, pending_expiry_minutes: 10, failed_redemptions: [],
};
const OFFER: DevicePairingOffer = {
    v: 1, name: 'PC', pc_id: 'pc-1', origins: ['https://192.168.1.10:4243'], pin: 'a'.repeat(64),
    invite: 'invitation', exp: Math.floor(Date.now() / 1000) + 600,
};

let replies: Record<string, { status?: number; body: unknown }>;

beforeEach(() => {
    document.documentElement.style.setProperty('--text-primary', '#111111');
    document.documentElement.style.setProperty('--bg-primary', '#FFFFFF');
    useDeviceStore.setState({ available: null, status: null, devices: [], loadError: null });
    replies = {
        'GET /devices/status': { body: STATUS },
        'GET /devices': { body: { devices: [] } },
        'POST /devices/pairing': { body: OFFER },
    };
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${new URL(input, 'http://localhost').pathname.replace(/^\/api/, '')}`;
        const reply = replies[key];
        if (!reply) throw new Error(`no route for ${key}`);
        return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
    }));
});

afterEach(() => vi.unstubAllGlobals());

describe('DevicesSettings', () => {
    it('clears the pairing code the moment the window closes, as it does on the first pairing', async () => {
        render(<DevicesSettings />);
        replies['GET /devices/status'] = { body: { ...STATUS, pairing_open: true } };
        fireEvent.click(await screen.findByRole('button', { name: 'Pair a phone or tablet' }));
        expect(await screen.findByAltText('Pairing code for the GAIA app')).toBeInTheDocument();

        // A device paired: the backend closed the window and the PC's event stream refreshed the state.
        replies['GET /devices/status'] = { body: STATUS };
        await act(() => useDeviceStore.getState().refresh());
        await waitFor(() => expect(screen.queryByAltText('Pairing code for the GAIA app')).not.toBeInTheDocument());
    });

    it('reads a pending device countdown as time left, not a clock time', async () => {
        const expires_at = new Date(Date.now() + 5 * 60_000 + 5_000).toISOString();
        replies['GET /devices'] = { body: { devices: [{ id: 'd1', name: 'Phone', platform: 'ios', status: 'pending', created_at: new Date().toISOString(), expires_at }] } };
        render(<DevicesSettings />);
        expect(await screen.findByText(/5:0\d/)).toBeInTheDocument();
        expect(document.querySelector('.perm-card-timer')).toHaveTextContent(/5:0\d left/);
    });

    it('marks pairing unavailable on a 403, which hides the section and the indicator', async () => {
        replies['GET /devices/status'] = { status: 403, body: { detail: 'Device pairing is off.' } };
        await useDeviceStore.getState().refresh();
        expect(useDeviceStore.getState()).toMatchObject({ available: false, status: null, loadError: null });
    });

    it('copies the pairing link and says so, or shows why it could not', async () => {
        const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        render(<DevicesSettings />);
        replies['GET /devices/status'] = { body: { ...STATUS, pairing_open: true } };
        fireEvent.click(await screen.findByRole('button', { name: 'Pair a phone or tablet' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Copy pairing link' }));
        expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
        expect(writeText).toHaveBeenCalledWith(pairingLink(OFFER));

        fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
        expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't copy the link");
    });

    it('turns the Tailscale route on from the PC and says why it can\'t when Tailscale is off', async () => {
        const off = { kind: 'tailnet' as const, on: false, origin: null, error_code: null };
        replies['GET /devices/status'] = { body: { ...STATUS, routes: [off] } };
        replies['POST /devices/routes/tailnet'] = { status: 409, body: { detail: { code: 'no_tailscale_address', message: 'no address' } } };
        render(<DevicesSettings />);
        const toggle = await screen.findByRole('switch', { name: 'Also allow from my Tailscale network' });
        replies['GET /devices/status'] = { body: { ...STATUS, routes: [{ ...off, error_code: 'no_tailscale_address' }] } };
        fireEvent.click(toggle);
        expect(await screen.findByText("Tailscale isn't running on this PC. Start Tailscale and sign in, then turn this on again.")).toBeInTheDocument();
        expect(toggle).not.toBeChecked();

        const on = { ...off, on: true, origin: 'https://100.101.102.103:4243' };
        replies['POST /devices/routes/tailnet'] = { body: { ...STATUS, routes: [on] } };
        replies['GET /devices/status'] = { body: { ...STATUS, routes: [on] } };
        fireEvent.click(toggle);
        await waitFor(() => expect(toggle).toBeChecked());
        expect(toggle).toHaveAccessibleDescription(/through Tailscale, at .*100\.101\.102\.103/);
    });

    it('shows a listener waiting for the home network as on, with why, and turning it off stops the wait', async () => {
        const off = { ...STATUS, listening: false };
        const waiting = { ...off, waiting_for_home: true, error_code: 'no_home_network' as const, error_detail: 'This PC has no IPv4 default route.' };
        replies['GET /devices/status'] = { body: waiting };
        replies['DELETE /devices/listener'] = { body: off };
        render(<DevicesSettings />);
        const toggle = await screen.findByRole('switch', { name: 'Allow paired devices to connect' });
        expect(toggle).toBeChecked();
        expect(screen.getByRole('status')).toHaveTextContent('Waiting for your home network…');
        expect(screen.getByRole('status')).toHaveTextContent("This PC isn't on your home network yet.");
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        replies['GET /devices/status'] = { body: off };
        fireEvent.click(toggle);
        await waitFor(() => expect(toggle).not.toBeChecked());
        expect(screen.queryByText('Waiting for your home network…')).not.toBeInTheDocument();
    });

    it('glosses the paired-at line once in Arabic, with no nested gloss', async () => {
        useChatStore.setState({ locale: 'ar' });
        const created_at = new Date(Date.now() - 60_000).toISOString();
        replies['GET /devices'] = { body: { devices: [{ id: 'd1', name: 'Phone', platform: 'ios', status: 'pending', created_at, expires_at: null }] } };
        render(<DevicesSettings />);
        await screen.findByText('Phone');
        const line = document.querySelector('.devices-row .settings-hint')!.textContent!;
        expect(line).not.toContain('((');
        expect(line.match(/iPhone/g)).toHaveLength(2);
        expect(line.match(/Paired/g)).toHaveLength(1);
        useChatStore.setState({ locale: 'en' });
    });

    const PAIRED = { id: 'd1', name: 'Pixel', platform: 'android', status: 'allowed', created_at: new Date().toISOString(), last_seen_at: null, changes_count: 2 };

    it('reads what a device changed when its section opens, and shows a kind it does not know as a generic change', async () => {
        const at = new Date(Date.now() - 5 * 60_000).toISOString();
        replies['GET /devices'] = { body: { devices: [PAIRED] } };
        replies['GET /devices/d1/changes'] = { body: { total: 2, changes: [
            { id: 'c1', kind: 'providerKeySet', params: { provider: 'OpenAI' }, at },
            { id: 'c2', kind: 'teleportCat', params: {}, at },
        ] } };
        render(<DevicesSettings />);
        fireEvent.click(await screen.findByText('Changes made from this device (2)'));
        await screen.findByText('teleportCat');
        const rows = Array.from(document.querySelectorAll('.devices-change'), (li) => li.textContent);
        expect(rows[0]).toMatch(/^Changed the .*OpenAI.* key · 5m ago$/);
        expect(rows[1]).toMatch(/^Changed a setting · 5m agoteleportCat$/);
        expect(screen.getByText('teleportCat')).toBeInTheDocument();
    });

    it.each([
        ['connectorGrant', { agent: 'GAIA', connector: 'Gmail', granted: false }, /^Stopped .*GAIA.* from using .*Gmail.* · 5m ago$/],
        ['connectorGrant', { agent_id: 'gaia', connector: 'Gmail', granted: true }, /^Let .*gaia.* use .*Gmail.* · 5m ago$/],
        ['connectorActivation', { agent: 'GAIA', connector: 'Gmail', active: false }, /^Turned off .*Gmail.* for .*GAIA.* · 5m ago$/],
        ['discordControl', { action: 'stop' }, /^Stopped the Discord bot · 5m ago$/],
        ['memoryCommit', { source: 'discovery', count: 1 }, /^Saved 1 item from scanning this PC to memory · 5m ago$/],
        ['memoryCommit', { source: 'discovery', count: 3 }, /^Saved .*3.* items from scanning this PC to memory · 5m ago$/],
        ['serverTarget', { mode: 'gaia' }, /^Switched GAIA back to its own model server · 5m ago$/],
        ['deviceRemoved', { device: 'Tab', device_id: 'x' }, /^Removed the paired device .*Tab.* · 5m ago$/],
        ['deviceRemoved', { device_id: 'x' }, /^Removed a paired device · 5m ago$/],
    ])('names the %s change from its params (%j)', async (kind, params, expected) => {
        const at = new Date(Date.now() - 5 * 60_000).toISOString();
        replies['GET /devices'] = { body: { devices: [PAIRED] } };
        replies['GET /devices/d1/changes'] = { body: { total: 1, changes: [{ id: 'c1', kind, params, at }] } };
        render(<DevicesSettings />);
        fireEvent.click(await screen.findByText('Changes made from this device (2)'));
        await waitFor(() => expect(document.querySelector('.devices-change')).not.toBeNull());
        const text = document.querySelector('.devices-change')!.textContent!;
        expect(text).toMatch(expected);
        expect(text).not.toContain('undefined');
    });

    it('shows an unknown Discord action as a generic change', async () => {
        const at = new Date(Date.now() - 5 * 60_000).toISOString();
        replies['GET /devices'] = { body: { devices: [PAIRED] } };
        replies['GET /devices/d1/changes'] = { body: { total: 1, changes: [{ id: 'c1', kind: 'discordControl', params: { action: 'explode' }, at }] } };
        render(<DevicesSettings />);
        fireEvent.click(await screen.findByText('Changes made from this device (2)'));
        await screen.findByText('discordControl');
        expect(document.querySelector('.devices-change')!.textContent).toMatch(/^Changed a setting · 5m ago/);
    });

    it('mentions the changes that stay in the remove confirmation only when the device made some', async () => {
        replies['GET /devices'] = { body: { devices: [PAIRED, { ...PAIRED, id: 'd2', name: 'Tab', changes_count: 0 }] } };
        render(<DevicesSettings />);
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Pixel' }));
        expect(await screen.findByText(/It made 2 changes that stay after it's removed/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Tab' }));
        await screen.findByText(/It can't reach GAIA on this PC anymore/);
        expect(screen.queryByText(/that stay after it's removed/)).not.toBeInTheDocument();
    });
});
