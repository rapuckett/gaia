// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { UIProvider } from '@/ui';

import { createFakePairingService } from './fakePairingService';
import { PAIR_AGAIN_MS, usePairAgain } from './pairedPcs';
import { PairingGate } from './PairingGate';
import { PinMismatchScreen } from './PinMismatchScreen';
import { setPairingService } from './registry';
import type { PairedPc, PcRecheck } from './service';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const OFFICE: PairedPc = { id: 'office', name: 'Office PC', connection: { baseUrl: 'https://192.168.1.20:4243', pcId: 'office', pinned: true } };
const DEN: PairedPc = { id: 'den', name: 'Den PC', connection: { baseUrl: 'https://192.168.1.30:4243', pcId: 'den', pinned: true } };

// The certificate-changed screen as SetupGate shows it, inside the gate that swaps in pairing once no PC is in use.
function PairAgainScreen({ onKnown, deadlineMs }: { onKnown: () => void; deadlineMs?: number }) {
    const pairAgain = usePairAgain(onKnown, deadlineMs);
    return (
        <PinMismatchScreen
            onPairAgain={pairAgain.run}
            checking={pairAgain.state === 'checking'}
            unreachablePc={pairAgain.state === 'unreachable' ? pairAgain.pcName : null}
        />
    );
}

async function show(recheck: (pcId: string, signal?: AbortSignal) => Promise<PcRecheck>, onKnown = jest.fn(), deadlineMs?: number) {
    const asked = jest.fn(recheck);
    const service = createFakePairingService({ paired: [OFFICE, DEN], recheck: asked });
    const forget = jest.spyOn(service, 'forget');
    setPairingService(service);
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient()}>
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <UIProvider>{children}</UIProvider>
            </SafeAreaProvider>
        </QueryClientProvider>
    );
    await render(
        <PairingGate>
            <PairAgainScreen onKnown={onKnown} deadlineMs={deadlineMs} />
        </PairingGate>,
        { wrapper },
    );
    return { service, forget, onKnown, asked };
}

const never = () => new Promise<PcRecheck>(() => undefined);

describeNative('"Pair again" after a certificate change', () => {
    beforeEach(() => {
        useConnectionStore.setState({ connection: null, restored: true, removedFrom: null, forgottenPc: null });
        useConnectionStore.getState().setConnection(OFFICE.connection);
    });
    afterEach(() => {
        setPairingService(null);
        jest.restoreAllMocks();
    });

    it('shows it is checking in the frame of the tap, and a second tap asks nothing more', async () => {
        let answer: (value: PcRecheck) => void = () => undefined;
        const { asked } = await show(() => new Promise<PcRecheck>((resolve) => (answer = resolve)));
        // The PC hasn't answered, so all that can show is what the tap itself set.
        await act(async () => {
            fireEvent.press(screen.getByTestId('pair-again'));
        });
        const button = screen.getByTestId('pair-again');
        expect(within(button).getByText(t('mobileApp.pairing.again.busy'))).toBeTruthy();
        expect(button.props.accessibilityState?.busy || button.props['aria-busy']).toBe(true);
        await act(async () => {
            fireEvent.press(screen.getByTestId('pair-again'));
        });
        expect(asked).toHaveBeenCalledTimes(1);
        await act(async () => answer({ state: 'unreachable' }));
    });

    it('reconnects when the PC still knows this phone, and forgets nothing', async () => {
        const { forget, onKnown } = await show(async () => ({ state: 'known' }));
        await act(async () => {
            fireEvent.press(screen.getByTestId('pair-again'));
        });
        expect(onKnown).toHaveBeenCalledTimes(1);
        expect(forget).not.toHaveBeenCalled();
        expect(useConnectionStore.getState().connection?.pcId).toBe('office');
        expect(within(screen.getByTestId('pair-again')).getByText(t('mobileApp.pairing.pinMismatch.action'))).toBeTruthy();
    });

    it('keeps everything when the PC can\'t be reached, and offers Try again', async () => {
        const { forget, service } = await show(async () => ({ state: 'unreachable' }));
        await act(async () => {
            fireEvent.press(screen.getByTestId('pair-again'));
        });
        expect(screen.getByText(t('mobileApp.pairing.again.unreachable', { pc: 'Office PC' }))).toBeTruthy();
        expect(screen.getByText(t('mobileApp.pairing.off.retry'))).toBeTruthy();
        expect(forget).not.toHaveBeenCalled();
        expect(useConnectionStore.getState().connection?.pcId).toBe('office');
        expect((await service.list()).map((pc) => pc.id)).toEqual(['office', 'den']);
    });

    it('gives up as unreachable when the PC gives no answer in time, canceling the question', async () => {
        expect(PAIR_AGAIN_MS).toBe(10_000);
        let asked: AbortSignal | undefined;
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { forget } = await show(
            (_pcId, signal) => {
                asked = signal;
                return never();
            },
            jest.fn(),
            50,
        );
        await act(async () => {
            fireEvent.press(screen.getByTestId('pair-again'));
        });
        expect(screen.getByText(t('mobileApp.pairing.again.busy'))).toBeTruthy();
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });
        expect(screen.getByText(t('mobileApp.pairing.again.unreachable', { pc: 'Office PC' }))).toBeTruthy();
        expect(asked?.aborted).toBe(true);
        expect(forget).not.toHaveBeenCalled();
    });

    it('says the PC no longer knows this phone on How to pair, then forgets it, and picks no other PC', async () => {
        let noticeShownFirst: boolean | null = null;
        const { forget, service } = await show(async () => ({ state: 'unknown' }));
        forget.mockImplementation(async (pcId) => {
            noticeShownFirst = screen.queryByTestId('pairing-forgotten') !== null;
            const pcs = await service.list();
            pcs.splice(pcs.findIndex((pc) => pc.id === pcId), 1);
        });
        await act(async () => {
            fireEvent.press(screen.getByTestId('pair-again'));
        });

        expect(screen.getByText(t('mobileApp.pairing.how.title'))).toBeTruthy();
        expect(screen.getByText(t('mobileApp.pairing.again.forgottenTitle', { pc: 'Office PC' }))).toBeTruthy();
        expect(screen.getByText(t('mobileApp.pairing.again.forgottenBody'))).toBeTruthy();
        expect(forget).toHaveBeenCalledTimes(1);
        expect(forget).toHaveBeenCalledWith('office');
        expect(noticeShownFirst).toBe(true);

        // The other PC is offered, not chosen.
        expect(useConnectionStore.getState().connection).toBeNull();
        expect(screen.getByText('Den PC')).toBeTruthy();
        expect(screen.queryByText('Office PC')).toBeNull();
        await act(async () => {
            fireEvent.press(screen.getByTestId('pairing-use-den'));
        });
        expect(useConnectionStore.getState().connection?.pcId).toBe('den');
    });
});
