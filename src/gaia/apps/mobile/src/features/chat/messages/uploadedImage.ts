// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useEffect, useState } from 'react';

import { useConnectionStore } from '@/state/connection';

import { fetchPcImage, type ImageState, type LoadedImage } from '../cards/generatedImage';

const UPLOAD_PATH = /^\/api\/files\/uploads\/(?!\.{1,2}$)[^/?#\\]+$/;
const CACHE_LIMIT = 16;

export type UploadedImageLoader = (path: string) => Promise<LoadedImage>;

/** Dev scenes and tests swap in a loader; the app reads from the paired PC. */
export const UploadedImageLoaderContext = createContext<UploadedImageLoader | null>(null);

const cache = new Map<string, Promise<LoadedImage>>();

function load(key: string, read: () => Promise<LoadedImage>): Promise<LoadedImage> {
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = read();
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    return pending;
}

/** An image the person attached, read from the PC; the thumbnail and the viewer share one read. */
export function useUploadedImage(path: string): ImageState {
    const loader = useContext(UploadedImageLoaderContext);
    const connection = useConnectionStore((s) => s.connection);
    const baseUrl = connection?.baseUrl;
    const token = connection?.token;
    const key = `${loader ? 'loader' : baseUrl}|${token}|${path}`;
    const [loaded, setLoaded] = useState<{ key: string; state: ImageState } | null>(null);
    const valid = UPLOAD_PATH.test(path);
    useEffect(() => {
        if (!valid || (!loader && !baseUrl)) return;
        let live = true;
        load(key, () => (loader ? loader(path) : fetchPcImage(baseUrl as string, token, path))).then(
            (image) => live && setLoaded({ key, state: { status: 'ready', image } }),
            (e: unknown) => {
                console.error(`Loading the attached image ${path} failed`, e);
                if (live) setLoaded({ key, state: { status: 'failed', error: e instanceof Error ? e.message : String(e) } });
            },
        );
        return () => {
            live = false;
        };
    }, [valid, loader, baseUrl, token, key, path]);
    if (!valid) return { status: 'failed', error: 'Not an attached image' };
    if (!loader && !baseUrl) return { status: 'failed', error: 'No PC is paired. Pair this phone with GAIA first.' };
    return loaded?.key === key ? loaded.state : { status: 'loading' };
}
