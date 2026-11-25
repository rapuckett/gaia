// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelContextSize } from '../ModelContextSize';
import * as api from '../../../services/api';
import { announce } from '../../../test/announcerMock';
import type { ContextChoice } from '../../../types';

vi.mock('../../../services/api');
vi.mock('../../../components/LiveAnnouncer', () => import('../../../test/announcerMock'));

const mockedApi = vi.mocked(api);

const VIEW: ContextChoice = {
    model: 'm', display_name: 'Gemma', chosen: null, automatic: 65536, min: 8192, max_fit: 131072,
    options: [32768, 65536], loaded_ctx: null, memory_source: 'RAM', note: null, reload: null,
};

describe('ModelContextSize', () => {
    beforeEach(() => {
        announce.mockClear();
        mockedApi.getContextChoice.mockResolvedValue(VIEW);
    });

    it('announces the saved size after a change', async () => {
        mockedApi.setContextChoice.mockResolvedValue({ ...VIEW, chosen: 32768 });
        render(<ModelContextSize model="m" />);
        fireEvent.change(await screen.findByLabelText('Context size'), { target: { value: '32768' } });

        await waitFor(() => expect(announce).toHaveBeenCalledExactlyOnceWith('Saved. It applies the next time this model loads.'));
        expect(screen.getByText('Saved. It applies the next time this model loads.')).not.toHaveAttribute('role');
    });
});
