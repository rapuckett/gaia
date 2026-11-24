// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { View } from 'react-native';

import { Disclosure, Text, useSheetScroll, type Tone } from '@/ui';

import { useSessionPanelStore, type PanelSectionId } from './panelStore';

export interface PanelSectionProps {
    id: PanelSectionId;
    title: string;
    /** One line shown beside the title while the section is collapsed. */
    summary?: string;
    summaryTone?: Tone;
    children: ReactNode;
}

/** A collapsible section of the session panel. The body mounts only while open, so a collapsed section fetches nothing. */
export function PanelSection({ id, title, summary, summaryTone = 'muted', children }: PanelSectionProps) {
    const open = useSessionPanelStore((s) => s.sections[id]);
    const setSection = useSessionPanelStore((s) => s.setSection);
    const request = useSessionPanelStore((s) => (s.scrollRequest?.id === id ? s.scrollRequest.seq : 0));
    const sheet = useSheetScroll();
    const box = useRef<ComponentRef<typeof View>>(null);
    useEffect(() => {
        if (request > 0) sheet?.scrollTo(box.current);
    }, [request, sheet]);
    return (
        <View ref={box} collapsable={false}>
        <Disclosure
            title={title}
            open={open}
            onToggle={() => setSection(id, !open)}
            trailing={
                !open && summary ? (
                    <Text role="caption" tone={summaryTone} numberOfLines={1}>
                        {summary}
                    </Text>
                ) : undefined
            }
            testID={`panel-section-${id}`}
            headerTestID={`panel-section-${id}-toggle`}
        >
            {children}
        </Disclosure>
        </View>
    );
}
