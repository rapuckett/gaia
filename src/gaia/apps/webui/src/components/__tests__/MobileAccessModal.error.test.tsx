// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileAccessModal } from '../MobileAccessModal';
import { tEn } from '../../i18n/translator';

vi.mock('../../services/api');

describe('MobileAccessModal when the tunnel cannot start', () => {
    it('says why, and offers no QR code or scan steps that cannot work', () => {
        render(<MobileAccessModal isOpen onClose={vi.fn()} error="ngrok is not installed." />);
        expect(screen.getByText(tEn('mobile.startFailed'))).toBeInTheDocument();
        expect(screen.getByText('ngrok is not installed.')).toBeInTheDocument();
        expect(screen.queryByText(tEn('mobile.stepScan'))).toBeNull();
        expect(screen.queryByText(/Failed to connect/)).toBeNull();
    });
});
