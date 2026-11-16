// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File as DeviceFile, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export interface PickedFile {
    uri: string;
    name: string;
    mimeType?: string;
    size?: number;
    modified?: number;
    /** The bytes themselves, for a file that has no path on the device (a web paste). */
    blob?: Blob;
}

/** The name the web UI gives a pasted image that has none. */
function screenshotName(): string {
    return `screenshot-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
}

/** Files from a web paste event, as the web UI's composer takes them: any type, images named like a screenshot. */
export function pickedFromPaste(files: Blob[]): PickedFile[] {
    return files.map((f) => {
        const named = f as Blob & { name?: string; lastModified?: number };
        const isImage = f.type.startsWith('image/');
        return {
            uri: URL.createObjectURL(f),
            name: named.name || (isImage ? screenshotName() : 'file'),
            mimeType: f.type,
            size: f.size,
            modified: named.lastModified,
            blob: f,
        };
    });
}

/** Whether the clipboard holds an image a Paste action can attach. */
export async function clipboardHasImage(): Promise<boolean> {
    return Clipboard.hasImageAsync();
}

/** The image on the clipboard, saved to a file; an empty list when it has none. */
export async function pasteImage(): Promise<PickedFile[]> {
    const image = await Clipboard.getImageAsync({ format: 'png' });
    if (!image) return [];
    const name = screenshotName();
    const file = new DeviceFile(Paths.cache, name);
    file.create({ overwrite: true });
    await file.write(image.data.slice(image.data.indexOf(',') + 1), { encoding: 'base64' });
    return [{ uri: file.uri, name, mimeType: 'image/png' }];
}

/** Photos and videos from the library; an empty list when the person cancels. */
export async function pickPhotos(): Promise<PickedFile[]> {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true });
    if (result.canceled) return [];
    return result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName || a.uri.slice(a.uri.lastIndexOf('/') + 1),
        mimeType: a.mimeType,
        size: a.fileSize,
    }));
}

/** Thrown when the camera is off for GAIA, so the caller can say how to turn it on. */
export class CameraDeniedError extends Error {}

/** A photo from the camera; an empty list when the person cancels. */
export async function pickCamera(): Promise<PickedFile[]> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new CameraDeniedError('camera permission denied');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'] });
    if (result.canceled) return [];
    return result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName || a.uri.slice(a.uri.lastIndexOf('/') + 1),
        mimeType: a.mimeType,
        size: a.fileSize,
    }));
}

/** Files from the device's file picker; an empty list when the person cancels. */
export async function pickDocuments(): Promise<PickedFile[]> {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return [];
    return result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, modified: a.lastModified }));
}
