// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// GET /api/connectors sends key_store when the OS key store holds back a connector's secret.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../services/api';
import type { ConnectorRow } from '../../types';
import { ConnectorsSection } from '../ConnectorsSection';
import { DOWNLOAD_POLL_MS } from '../settings/ModelSettings';

vi.mock('../../services/api');
vi.mock('../../hooks/useConnectorsSSE', () => ({ useConnectorsSSE: () => {} }));

const mocked = vi.mocked(api);

function row(name: string, over: Partial<ConnectorRow> = {}): ConnectorRow {
    return {
        id: name.toLowerCase(), display_name: name, type: 'oauth_pkce', description: `${name} tools`, icon: null,
        category: 'general', tier: 'core', product_url: null, configured: false, configurable: true, enabled: true,
        mcp_env_keys: [], default_scopes: [], available_scopes: [], ...over,
    } as ConnectorRow;
}

const held = (state: 'waiting' | 'locked') => row('Google', { configured: null, key_store: state });
const LOCKED = 'The OS key store is locked, so GAIA can\'t read some of your connected accounts. They can\'t be used until it\'s unlocked.';

beforeEach(() => {
    vi.clearAllMocks();
    mocked.listAgentMcps.mockResolvedValue({ agent_mcps: [] });
    mocked.retryKeyStore.mockResolvedValue({ retrying: true });
});

describe('ConnectorsSection while the OS key store holds connectors back', () => {
    it('shows one locked notice, Try again retries and refetches, and the tile is plain', async () => {
        mocked.listConnectors.mockResolvedValueOnce({ connectors: [held('locked'), row('Microsoft')], key_store: 'locked' });
        mocked.listConnectors.mockResolvedValue({ connectors: [row('Google'), row('Microsoft')] });
        render(<ConnectorsSection />);
        expect(await screen.findByText(LOCKED)).toBeInTheDocument();

        const tile = screen.getByText('Not available until the key store is unlocked').closest('.connector-tile') as HTMLElement;
        expect(tile).toHaveTextContent('Google');
        expect(tile.querySelectorAll('button')).toHaveLength(0);

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(screen.queryByText(LOCKED)).not.toBeInTheDocument());
        expect(mocked.retryKeyStore).toHaveBeenCalledTimes(1);
        expect(mocked.listConnectors).toHaveBeenCalledTimes(2);
        expect(screen.queryByText('Not available until the key store is unlocked')).not.toBeInTheDocument();
    });

    it('shows a waiting notice with no button', async () => {
        mocked.listConnectors.mockResolvedValue({ connectors: [held('waiting')], key_store: 'waiting' });
        render(<ConnectorsSection />);
        expect(await screen.findByText('Waiting for the OS to allow reading your connected accounts.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
        expect(screen.queryByText(LOCKED)).not.toBeInTheDocument();
    });

    it('asks again while waiting and drops the notice once the prompt is answered', async () => {
        vi.useFakeTimers();
        try {
            mocked.listConnectors.mockResolvedValueOnce({ connectors: [held('waiting')], key_store: 'waiting' });
            mocked.listConnectors.mockResolvedValue({ connectors: [row('Google')] });
            render(<ConnectorsSection />);
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
            expect(screen.getByText('Waiting for the OS to allow reading your connected accounts.')).toBeInTheDocument();
            expect(mocked.listConnectors).toHaveBeenCalledTimes(1);
            await act(async () => { await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS); });
            expect(mocked.listConnectors).toHaveBeenCalledTimes(2);
            expect(screen.queryByText('Waiting for the OS to allow reading your connected accounts.')).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });
});
