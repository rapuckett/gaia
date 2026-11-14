// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from "react";

import { useLocalModelStatus } from "@/data";
import { ModelStatusSheet } from "@/features/model/ModelStatusSheet";
import { pillText } from "@/features/model/modelStatusText";
import { useT } from "@/i18n/useT";
import { Chip } from "@/ui";
import { Cloud, Cpu } from "@/ui/icons";

/** The model the next message runs on and where it runs; tap for the model's state. */
export function ModelChip() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data } = useLocalModelStatus(open);
  const pill = pillText(data, t);
  return (
    <>
      <Chip
        label={pill.name ?? pill.text}
        icon={pill.remote ? Cloud : Cpu}
        onPress={() => setOpen(true)}
        testID="model-chip"
      />
      <ModelStatusSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
