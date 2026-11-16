// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { describeError, useT, type Translate } from '@/i18n/useT';
import { ActionSheet, IconButton } from '@/ui';
import { Camera, ClipboardPaste, FileText, Image, Plus } from '@/ui/icons';

import { CameraDeniedError, clipboardHasImage, pasteImage, pickCamera, pickDocuments, pickPhotos, type PickedFile } from './pickFiles';

/** Attaches the clipboard image; a clipboard or cache failure shows as a failed chip, as the camera does. */
export function attachPasted(onPick: (files: PickedFile[]) => void, onError: (name: string, message: string) => void, t: Translate): Promise<void> {
    return pasteImage().then(onPick, (err: unknown) => onError(t('mobileApp.composer.attachPaste'), describeError(err, t)));
}

/** The + button: a menu to attach a photo or a file. */
export function AttachButton({ onPick, onError, disabled, initialOpen = false, showPaste = false }: { onPick(files: PickedFile[]): void; onError(name: string, message: string): void; disabled?: boolean; initialOpen?: boolean; showPaste?: boolean }) {
    const t = useT();
    const [open, setOpen] = useState(initialOpen);
    const [canPaste, setCanPaste] = useState(false);
    // Asked when the menu opens, so Paste shows only while the clipboard holds an image.
    useEffect(() => {
        if (!open) return;
        let live = true;
        void clipboardHasImage().then((has) => live && setCanPaste(has), () => live && setCanPaste(false));
        return () => {
            live = false;
        };
    }, [open]);
    return (
        <>
            <IconButton
                icon={Plus}
                label={t('composer.attach')}
                onPress={() => setOpen(true)}
                disabled={disabled}
                testID="composer-attach"
            />
            <ActionSheet
                open={open}
                onClose={() => setOpen(false)}
                title={t('composer.attach')}
                actions={[
                    {
                        label: t('mobileApp.composer.attachCamera'),
                        icon: Camera,
                        onPress: () =>
                            void pickCamera().then(onPick, (err: unknown) => {
                                if (!(err instanceof CameraDeniedError)) throw err;
                                onError(t('mobileApp.composer.attachCamera'), t('mobileApp.composer.cameraOff'));
                            }),
                    },
                    { label: t('composer.attachPhoto'), icon: Image, onPress: () => void pickPhotos().then(onPick) },
                    { label: t('composer.attachFile'), icon: FileText, onPress: () => void pickDocuments().then(onPick) },
                    ...(canPaste || showPaste ? [{ label: t('mobileApp.composer.attachPaste'), icon: ClipboardPaste, onPress: () => void attachPasted(onPick, onError, t) }] : []),
                ]}
            />
        </>
    );
}
