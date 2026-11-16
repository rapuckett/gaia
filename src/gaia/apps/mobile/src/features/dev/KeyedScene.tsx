// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ComponentType } from 'react';

/** Remounts a gallery scene when its key changes, so state built from the URL (fake client, query cache) starts over on a client-side link between scenes. */
export function KeyedScene<P extends object>({ sceneKey, scene: Scene, props }: { sceneKey: string; scene: ComponentType<P>; props: P }) {
    return <Scene key={sceneKey} {...props} />;
}
