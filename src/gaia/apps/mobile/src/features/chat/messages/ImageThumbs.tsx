// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { Image, View } from 'react-native';

import { useT } from '@/i18n/useT';
import { Icon, Pressable, Row, Skeleton, useTheme } from '@/ui';
import { ImageOff } from '@/ui/icons';

import type { SentAttachment } from './attachedLinks';
import { ImageViewer } from './ImageViewer';
import { useUploadedImage } from './uploadedImage';

export const THUMB_SIZE = 88;

function Thumb({ image, onOpen }: { image: SentAttachment; onOpen: () => void }) {
    const t = useT();
    const { colors, radius } = useTheme();
    const state = useUploadedImage(image.url);
    const failed = state.status === 'failed';
    // A failed tile is heard as its name and the failure, never as a bare image.
    const a11y = failed
        ? { accessibilityLabel: image.name, accessibilityHint: t('mobileApp.render.imageFailed') }
        : { accessibilityLabel: t('msg.imageOpen', { name: image.name }) };
    return (
        <Pressable onPress={onOpen} accessibilityRole="button" {...a11y} minSize={THUMB_SIZE} testID="user-image-thumb">
            <View style={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}>
                {state.status === 'ready' ? (
                    <Image source={{ uri: state.image.uri }} resizeMode="cover" style={{ width: THUMB_SIZE, height: THUMB_SIZE }} accessibilityIgnoresInvertColors />
                ) : state.status === 'loading' ? (
                    <Skeleton height={THUMB_SIZE} />
                ) : (
                    <View testID="user-image-failed"><Icon icon={ImageOff} tone="muted" /></View>
                )}
            </View>
        </Pressable>
    );
}

/** The images a message carries, as small tiles that open full size. */
export function ImageThumbs({ images }: { images: readonly SentAttachment[] }) {
    const t = useT();
    const [open, setOpen] = useState<number | null>(null);
    if (images.length === 0) return null;
    return (
        <>
            <View accessibilityLabel={t('msg.images')} role="list" testID="user-image-strip">
                <Row gap="sm" wrap>
                    {images.map((image, i) => (
                        <Thumb key={`${image.url}-${i}`} image={image} onOpen={() => setOpen(i)} />
                    ))}
                </Row>
            </View>
            {open !== null ? <ImageViewer images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
        </>
    );
}
