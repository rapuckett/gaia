// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * A D1Database backed by Node's built-in SQLite with every migration applied,
 * so tests run the Worker's real SQL. Covers only the D1 surface the Worker
 * uses: prepare/bind/first/all/run and batch.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Loaded at runtime: the bundler does not know node:sqlite as a built-in.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

type Value = string | number | null | bigint | Uint8Array;

export interface TestDb {
  db: D1Database;
  query<T>(sql: string, ...args: Value[]): T[];
}

export function memoryD1(): TestDb {
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(dir, f), "utf8"));
  }

  const exec = (sql: string, args: Value[]) => {
    const st = sqlite.prepare(sql);
    if (/\bRETURNING\b|^\s*SELECT/i.test(sql)) return { results: st.all(...args), changes: 0 };
    const r = st.run(...args);
    return { results: [], changes: Number(r.changes) };
  };
  const result = (r: { results: unknown[]; changes: number }) => ({
    results: r.results,
    success: true,
    meta: { changes: r.changes },
  });

  const stmt = (sql: string, args: Value[] = []) => ({
    sql,
    args,
    bind: (...a: unknown[]) => stmt(sql, a as Value[]),
    first: async <T>() => (sqlite.prepare(sql).get(...args) as T | undefined) ?? null,
    all: async () => result(exec(sql, args)),
    run: async () => result(exec(sql, args)),
  });

  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: { sql: string; args: Value[] }[]) => {
      sqlite.exec("BEGIN");
      try {
        const out = list.map((s) => result(exec(s.sql, s.args)));
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;

  return { db, query: <T>(sql: string, ...args: Value[]) => sqlite.prepare(sql).all(...args) as T[] };
}
