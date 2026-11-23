import { defineConfig } from "vitest/config";

// The Worker uses only Web-standard globals (Request, Response, crypto.subtle,
// fetch), so tests run in plain Node against a D1 backed by node:sqlite with the
// real migrations applied (test/d1.ts). @cloudflare/vitest-pool-workers is not
// used: its latest release still requires vitest 4.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "threads",
  },
});
