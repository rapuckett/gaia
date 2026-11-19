// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Info } from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { useT } from '../i18n/useT';
import { ref, type MessageKey, type MessageRef } from '../i18n/registry';
import { log } from '../utils/logger';
import { MarkedText } from './MarkedText';
import './ConnectionBanner.css';

const ACTION_KEYS: Record<string, MessageKey> = {
    gpuMemoryApply: 'devices.promptAction.gpuMemoryApply',
    gpuMemoryRevert: 'devices.promptAction.gpuMemoryRevert',
    npuMemlockFix: 'devices.promptAction.npuMemlockFix',
};

const warned = new Set<string>();

function actionRef(action: string): MessageRef | null {
    const key = ACTION_KEYS[action];
    if (key) return ref(key);
    if (!warned.has(action)) {
        warned.add(action);
        log.ui.warn(`A device asked for administrator permission with an action this app has no label for: ${action}`);
    }
    return null;
}

/** Says which paired device raised the system prompt now open on this PC, one banner per prompt, newest on top. */
export function DevicePromptBanner() {
    const t = useT();
    const prompts = useDeviceStore((s) => s.prompts);
    const devices = useDeviceStore((s) => s.devices);
    return (
        <>
            {prompts.map((p) => {
                const device = devices.find((d) => d.id === p.deviceId);
                if (!device) return null;
                let text: string;
                if (p.kind === 'keyStore') {
                    text = t('devices.promptBanner.keyStore', { device: device.name });
                } else {
                    const action = actionRef(p.action);
                    text = action
                        ? t('devices.promptBanner.admin', { device: device.name, action })
                        : t('devices.promptBanner.adminGeneric', { device: device.name });
                }
                return (
                    <div key={`${p.deviceId}-${p.kind}-${p.action}`} className="connection-banner connection-banner--init" role="status" data-testid="device-prompt-banner">
                        <div className="connection-banner__icon"><Info size={16} aria-hidden="true" /></div>
                        <div className="connection-banner__text" dir="auto"><MarkedText text={text} /></div>
                    </div>
                );
            })}
        </>
    );
}
