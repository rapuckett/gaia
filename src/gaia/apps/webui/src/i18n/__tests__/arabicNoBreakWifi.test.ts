// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { ar } from '../locales/ar';

describe('Arabic local-network strings', () => {
  it('write Wi-Fi with a non-breaking hyphen so it never splits across lines', () => {
    const entries = Object.entries(ar.messages).filter(([key]) => key.startsWith('mobileApp.localNetwork.'));
    const withWifi = entries.filter(([, value]) => /Wi.Fi/.test(String(value)));
    expect(withWifi.length).toBeGreaterThan(0);
    for (const [key, value] of withWifi) {
      expect({ key, ok: String(value).includes('Wi‑Fi') && !String(value).includes('Wi-Fi') }).toEqual({ key, ok: true });
    }
  });
});
