/**
 * 星环OPC中心 — 数据库版本迁移
 */

import type Database from "better-sqlite3";

export type Migration = {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
};

export const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema — companies, employees, transactions, contacts",
    up(_db) {
      // Tables and indexes are created in initializeDatabase.
      // This migration exists as the baseline version marker.
    },
  },
  {
    version: 2,
    description: "Phase 3 — investment, procurement, lifecycle, monitoring, tool_config",
    up(_db) {
      // Tables and indexes are created in initializeDatabase via OPC_TABLES/OPC_INDEXES.
      // This migration exists as the Phase 3 version marker.
    },
  },
  {
    version: 3,
    description: "OPB Canvas — one-person business canvas table",
    up(_db) {
      // opc_opb_canvas table is created in initializeDatabase via OPC_TABLES/OPC_INDEXES.
      // This migration exists as the OPB Canvas version marker.
    },
  },
];

/**
 * Run pending migrations up to the latest version.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opc_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare("SELECT version FROM opc_migrations")
      .all()
      .map((row) => (row as { version: number }).version),
  );

  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    m.up(db);
    db.prepare("INSERT INTO opc_migrations (version, description) VALUES (?, ?)").run(
      m.version,
      m.description,
    );
  }
}
