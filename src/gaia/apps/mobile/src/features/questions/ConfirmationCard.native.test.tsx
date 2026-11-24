// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ThemeProvider } from '@/ui';

import { ConfirmationCard, confirmationProps } from './ConfirmationCard';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('ConfirmationCard', () => {
    it('says the step did not run, with Dismiss and no Approve or Deny', async () => {
        const props = confirmationProps({ type: 'needs_confirmation', action: 'write_file', summary: 'notes.txt' })!;
        await render(<ConfirmationCard {...props} />, { wrapper: ThemeProvider });
        expect(screen.getByText('NOT RUN')).toBeTruthy();
        expect(screen.getByText('Writing file')).toBeTruthy();
        expect(screen.getByText('notes.txt')).toBeTruthy();
        expect(screen.getByText(/too old to ask for it here/)).toBeTruthy();
        expect(screen.getByText('Dismiss')).toBeTruthy();
        expect(screen.queryByText(/Approve|Allow|Deny/)).toBeNull();
    });

    it('collapses to "Not run: {step}" on Dismiss and tells the caller', async () => {
        const onDismiss = jest.fn();
        await render(<ConfirmationCard action="write_file" summary="notes.txt" onDismiss={onDismiss} />, { wrapper: ThemeProvider });
        await fireEvent.press(screen.getByText('Dismiss'));
        expect(screen.getByText('Not run: Writing file')).toBeTruthy();
        expect(screen.queryByText('Dismiss')).toBeNull();
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('names an unknown tool by its own words', async () => {
        await render(<ConfirmationCard action="frobnicate_widget" summary="x" />, { wrapper: ThemeProvider });
        expect(screen.getByText(/Using .*frobnicate widget/)).toBeTruthy();
    });

    it('is not a card for an event without an action or summary', () => {
        expect(confirmationProps({ type: 'needs_confirmation', action: 'write_file' })).toBeNull();
    });
});
