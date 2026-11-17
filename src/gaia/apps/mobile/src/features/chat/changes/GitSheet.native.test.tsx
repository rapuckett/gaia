// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";

import type { GitRepo } from "@/api/client.types";
import { translator } from "@/i18n/useT";
import { ThemeProvider } from "@/ui";
import { SheetHost } from "@/ui/overlays/SheetHost";
import { isolate } from "@webui/i18n/registry";

import { GitSheet } from "./GitSheet";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const repo = {
  root: "/Users/me/work/gaia",
  branch: "main",
  remote: "git@github.com:me/gaia.git",
  files: ["src/a.ts"],
  uncommitted: ["src/a.ts", "docs/b.md"],
  ignored: [],
  draft: { title: "Update", body: "" },
} as unknown as GitRepo;

const t = translator("en");

(Platform.OS === "web" ? describe.skip : describe)("GitSheet paths", () => {
  it.each([
    ["commit", "git-sheet-root", repo.root],
    ["pr", "git-sheet-root", repo.remote!],
  ] as const)(
    "%s keeps the path out of the sentence, on its own left-to-right line",
    async (kind, id, path) => {
      await render(
        <ThemeProvider>
          <SheetHost>
            <GitSheet
              kind={kind}
              repo={repo}
              onClose={() => {}}
              onRun={async () => ""}
              onDone={() => {}}
            />
          </SheetHost>
        </ThemeProvider>,
      );
      const note = t(
        kind === "commit"
          ? "mobileApp.changes.git.commitNote"
          : "mobileApp.changes.git.prNote",
        { branch: isolate("main", "ltr") },
      );
      expect(await screen.findByText(note, { exact: false })).toBeTruthy();
      expect(note).not.toContain(path);
      const line = screen.getByTestId(id);
      expect(StyleSheet.flatten(line.props.style).writingDirection).toBe("ltr");
      expect(screen.getByText(path)).toBe(line);
    },
  );

  it("lists the files on their own left-to-right line", async () => {
    await render(
      <ThemeProvider>
        <SheetHost>
          <GitSheet
            kind="commit"
            repo={repo}
            onClose={() => {}}
            onRun={async () => ""}
            onDone={() => {}}
          />
        </SheetHost>
      </ThemeProvider>,
    );
    await screen.findByTestId("git-sheet-files");
    expect(
      StyleSheet.flatten(screen.getByTestId("git-sheet-files").props.style)
        .writingDirection,
    ).toBe("ltr");
    expect(screen.getByTestId("git-sheet-files").props.children).toBe(
      "src/a.ts, docs/b.md",
    );
  });
});
