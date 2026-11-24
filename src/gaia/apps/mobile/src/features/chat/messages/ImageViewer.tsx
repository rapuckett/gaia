// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useRef } from 'react';
import { Image, Modal, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isolate } from '@webui/i18n/registry';
import { useDirection, useT } from '@/i18n/useT';
import { IconButton, Notice, Spinner, Text, useTheme } from '@/ui';
import { ChevronLeft, ChevronRight, X } from '@/ui/icons';

import type { SentAttachment } from './attachedLinks';
import { useUploadedImage } from './uploadedImage';

const SWIPE_DISTANCE = 48;

export interface ImageViewerProps {
    images: readonly SentAttachment[];
    index: number;
    onIndex: (index: number) => void;
    onClose: () => void;
}

function Stage({ image, width, height }: { image: SentAttachment; width: number; height: number }) {
    const t = useT();
    const state = useUploadedImage(image.url);
    if (state.status === 'loading') return <Spinner />;
    if (state.status === 'failed') {
        return (
            <View style={{ padding: 24 }}>
                <Notice tone="danger" title={t('mobileApp.render.imageFailed')} message={state.error} />
            </View>
        );
    }
    return <Image source={{ uri: state.image.uri }} accessibilityLabel={image.name} resizeMode="contain" style={{ width, height }} testID="image-viewer-img" />;
}

/** One image fitted to the screen over the chat; swipe or use the arrows to step through the message's other images. Android back closes it. */
export function ImageViewer({ images, index, onIndex, onClose }: ImageViewerProps) {
    const t = useT();
    const rtl = useDirection() === 'rtl';
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const touchStart = useRef<number | null>(null);
    const image = images[index];
    const many = images.length > 1;
    if (!image) return null;

    const step = (by: number) => onIndex((index + by + images.length) % images.length);
    // The layout runs right to left in Arabic, so the next image is the one to the left.
    const onTouchEnd = (x: number) => {
        const from = touchStart.current;
        touchStart.current = null;
        if (!many || from === null || Math.abs(x - from) < SWIPE_DISTANCE) return;
        step((x < from) !== rtl ? 1 : -1);
    };
    const count = t('imageViewer.count', { n: index + 1, total: images.length });
    const bar = { position: 'absolute', start: 0, end: 0, paddingHorizontal: 12 } as const;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
            <View
                style={{ flex: 1, backgroundColor: colors.bgCode }}
                accessibilityViewIsModal
                aria-modal
                accessibilityLabel={t('imageViewer.dialog')}
                testID="image-viewer"
            >
                <View
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                    onTouchStart={(e) => {
                        touchStart.current = e.nativeEvent.pageX;
                    }}
                    onTouchEnd={(e) => onTouchEnd(e.nativeEvent.pageX)}
                    testID="image-viewer-stage"
                >
                    <Stage key={image.url} image={image} width={width} height={height - insets.top - insets.bottom - 160} />
                </View>
                <View style={{ ...bar, top: insets.top + 8, flexDirection: 'row', justifyContent: 'flex-start' }}>
                    <IconButton icon={X} label={t('imageViewer.close')} variant="filled" onPress={onClose} testID="image-viewer-close" />
                </View>
                {many ? (
                    <View style={{ ...bar, top: height / 2 - 24, flexDirection: 'row', justifyContent: 'space-between' }} pointerEvents="box-none">
                        <IconButton icon={rtl ? ChevronRight : ChevronLeft} label={t('imageViewer.prev')} variant="filled" onPress={() => step(-1)} testID="image-viewer-prev" />
                        <IconButton icon={rtl ? ChevronLeft : ChevronRight} label={t('imageViewer.next')} variant="filled" onPress={() => step(1)} testID="image-viewer-next" />
                    </View>
                ) : null}
                <View style={{ ...bar, bottom: insets.bottom + 16, alignItems: 'center' }} pointerEvents="none">
                    <Text role="label" tone="secondary" numberOfLines={1} dir="ltr" testID="image-viewer-caption">
                        {many ? `${isolate(image.name, 'ltr')} · ${isolate(count, 'ltr')}` : isolate(image.name, 'ltr')}
                    </Text>
                </View>
            </View>
        </Modal>
    );
}
