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
  {
    version: 4,
    description: "Proactive intelligence — insights, celebrations, company_stage, briefings",
    up(_db) {
      // Tables (opc_insights, opc_celebrations, opc_company_stage, opc_briefings)
      // and indexes are created in initializeDatabase via OPC_TABLES/OPC_INDEXES.
      // This migration exists as the proactive intelligence version marker.
    },
  },
  {
    version: 5,
    description: "Staff tasks — AI employee work tracking and delegation",
    up(_db) {
      // opc_staff_tasks table created in initializeDatabase via OPC_TABLES/OPC_INDEXES.
    },
  },
  {
    version: 6,
    description: "Add direction column to contracts for business workflow engine",
    up(db) {
      // 检查 direction 列是否已存在（新库由 schema.ts 创建时已包含）
      const cols = db.pragma("table_info(opc_contracts)") as { name: string }[];
      if (!cols.some(c => c.name === "direction")) {
        db.exec("ALTER TABLE opc_contracts ADD COLUMN direction TEXT NOT NULL DEFAULT 'sales'");
      }
    },
  },
  {
    version: 7,
    description: "Add unique constraint on contacts (company_id, name) to prevent duplicates",
    up(db) {
      // 先清理已有重复数据（保留最早创建的那条）
      db.exec(`
        DELETE FROM opc_contacts WHERE rowid NOT IN (
          SELECT MIN(rowid) FROM opc_contacts GROUP BY company_id, name
        )
      `);
      // CREATE UNIQUE INDEX 本身是幂等的（IF NOT EXISTS）
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_name ON opc_contacts(company_id, name)");
    },
  },
  {
    version: 8,
    description: "Add task_type and schedule columns to staff_tasks for automated execution",
    up(db) {
      const cols = db.pragma("table_info(opc_staff_tasks)") as { name: string }[];
      if (!cols.some(c => c.name === "task_type")) {
        db.exec("ALTER TABLE opc_staff_tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'manual'");
      }
      if (!cols.some(c => c.name === "schedule")) {
        db.exec("ALTER TABLE opc_staff_tasks ADD COLUMN schedule TEXT NOT NULL DEFAULT 'on_demand'");
      }
    },
  },
  {
    version: 9,
    description: "Add session_key column to staff_tasks for subagent tracking",
    up(db) {
      const cols = db.pragma("table_info(opc_staff_tasks)") as { name: string }[];
      if (!cols.some(c => c.name === "session_key")) {
        db.exec("ALTER TABLE opc_staff_tasks ADD COLUMN session_key TEXT NOT NULL DEFAULT ''");
      }
      db.exec("CREATE INDEX IF NOT EXISTS idx_staff_tasks_session_key ON opc_staff_tasks(session_key)");
    },
  },
  {
    version: 10,
    description: "CRM pipeline — add pipeline_stage, follow_up_date, deal_value, source to contacts + interactions table",
    up(db) {
      const cols = db.pragma("table_info(opc_contacts)") as { name: string }[];
      if (!cols.some(c => c.name === "pipeline_stage")) {
        db.exec("ALTER TABLE opc_contacts ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'lead'");
      }
      if (!cols.some(c => c.name === "follow_up_date")) {
        db.exec("ALTER TABLE opc_contacts ADD COLUMN follow_up_date TEXT NOT NULL DEFAULT ''");
      }
      if (!cols.some(c => c.name === "deal_value")) {
        db.exec("ALTER TABLE opc_contacts ADD COLUMN deal_value REAL NOT NULL DEFAULT 0");
      }
      if (!cols.some(c => c.name === "source")) {
        db.exec("ALTER TABLE opc_contacts ADD COLUMN source TEXT NOT NULL DEFAULT ''");
      }
      // opc_contact_interactions table created in initializeDatabase via OPC_TABLES
      db.exec("CREATE INDEX IF NOT EXISTS idx_interactions_contact ON opc_contact_interactions(contact_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_follow_up ON opc_contacts(follow_up_date)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_pipeline ON opc_contacts(pipeline_stage)");
    },
  },
  {
    version: 11,
    description: "Document generation — opc_documents table",
    up(_db) {
      // opc_documents table created in initializeDatabase via OPC_TABLES
    },
  },
  {
    version: 12,
    description: "Invoice enhancements — due_date column + invoice_items table",
    up(db) {
      const cols = db.pragma("table_info(opc_invoices)") as { name: string }[];
      if (!cols.some(c => c.name === "due_date")) {
        db.exec("ALTER TABLE opc_invoices ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
      }
      // opc_invoice_items table created in initializeDatabase via OPC_TABLES
      db.exec("CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON opc_invoice_items(invoice_id)");
    },
  },
  {
    version: 13,
    description: "Content publishing — reviewer, review_notes, approved_at columns on media_content",
    up(db) {
      const cols = db.pragma("table_info(opc_media_content)") as { name: string }[];
      if (!cols.some(c => c.name === "reviewer")) {
        db.exec("ALTER TABLE opc_media_content ADD COLUMN reviewer TEXT NOT NULL DEFAULT ''");
      }
      if (!cols.some(c => c.name === "review_notes")) {
        db.exec("ALTER TABLE opc_media_content ADD COLUMN review_notes TEXT NOT NULL DEFAULT ''");
      }
      if (!cols.some(c => c.name === "approved_at")) {
        db.exec("ALTER TABLE opc_media_content ADD COLUMN approved_at TEXT NOT NULL DEFAULT ''");
      }
    },
  },
  {
    version: 14,
    description: "Financial reporting — financial_periods and payments tables for advanced analysis",
    up(_db) {
      // opc_financial_periods and opc_payments tables created in initializeDatabase via OPC_TABLES
      // Indexes created via OPC_INDEXES
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
