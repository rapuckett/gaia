// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fetch as expoFetch } from 'expo/fetch';

import type { FetchLike } from './fetch.types';

export const platformFetch: FetchLike = (url, init) => expoFetch(url, init);
