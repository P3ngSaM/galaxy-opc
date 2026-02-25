/**
 * 星环OPC中心 — 数据库表结构定义
 */

export const OPC_TABLES = {
  companies: `
    CREATE TABLE IF NOT EXISTS opc_companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT NOT NULL DEFAULT '',
      owner_name TEXT NOT NULL,
      owner_contact TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      registered_capital REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  employees: `
    CREATE TABLE IF NOT EXISTS opc_employees (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'general',
      skills TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  transactions: `
    CREATE TABLE IF NOT EXISTS opc_transactions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      amount REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      counterparty TEXT NOT NULL DEFAULT '',
      transaction_date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  contacts: `
    CREATE TABLE IF NOT EXISTS opc_contacts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      company_name TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      last_contact_date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,
  // ── Phase 2 表 ────────────────────────────────────────────

  invoices: `
    CREATE TABLE IF NOT EXISTS opc_invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'sales',
      counterparty TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      issue_date TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  tax_filings: `
    CREATE TABLE IF NOT EXISTS opc_tax_filings (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      period TEXT NOT NULL,
      tax_type TEXT NOT NULL DEFAULT 'vat',
      revenue REAL NOT NULL DEFAULT 0,
      deductible REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT NOT NULL DEFAULT '',
      filed_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  contracts: `
    CREATE TABLE IF NOT EXISTS opc_contracts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      title TEXT NOT NULL,
      counterparty TEXT NOT NULL DEFAULT '',
      contract_type TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      key_terms TEXT NOT NULL DEFAULT '',
      risk_notes TEXT NOT NULL DEFAULT '',
      reminder_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  hr_records: `
    CREATE TABLE IF NOT EXISTS opc_hr_records (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      position TEXT NOT NULL DEFAULT '',
      salary REAL NOT NULL DEFAULT 0,
      social_insurance REAL NOT NULL DEFAULT 0,
      housing_fund REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      contract_type TEXT NOT NULL DEFAULT 'full_time',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  media_content: `
    CREATE TABLE IF NOT EXISTS opc_media_content (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      title TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'article',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_date TEXT NOT NULL DEFAULT '',
      published_date TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      metrics TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  projects: `
    CREATE TABLE IF NOT EXISTS opc_projects (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planning',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      budget REAL NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  tasks: `
    CREATE TABLE IF NOT EXISTS opc_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assignee TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'todo',
      due_date TEXT NOT NULL DEFAULT '',
      hours_estimated REAL NOT NULL DEFAULT 0,
      hours_actual REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES opc_projects(id),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  // ── Phase 3 表 ────────────────────────────────────────────

  investment_rounds: `
    CREATE TABLE IF NOT EXISTS opc_investment_rounds (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      round_name TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      valuation_pre REAL NOT NULL DEFAULT 0,
      valuation_post REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planning',
      lead_investor TEXT NOT NULL DEFAULT '',
      close_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  investors: `
    CREATE TABLE IF NOT EXISTS opc_investors (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'individual',
      amount REAL NOT NULL DEFAULT 0,
      equity_percent REAL NOT NULL DEFAULT 0,
      contact TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (round_id) REFERENCES opc_investment_rounds(id),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  services: `
    CREATE TABLE IF NOT EXISTS opc_services (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      unit_price REAL NOT NULL DEFAULT 0,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  procurement_orders: `
    CREATE TABLE IF NOT EXISTS opc_procurement_orders (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL DEFAULT '',
      company_id TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      order_date TEXT NOT NULL DEFAULT (date('now')),
      delivery_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  milestones: `
    CREATE TABLE IF NOT EXISTS opc_milestones (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'business',
      target_date TEXT NOT NULL DEFAULT '',
      completed_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  lifecycle_events: `
    CREATE TABLE IF NOT EXISTS opc_lifecycle_events (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      event_date TEXT NOT NULL DEFAULT (date('now')),
      impact TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  metrics: `
    CREATE TABLE IF NOT EXISTS opc_metrics (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  alerts: `
    CREATE TABLE IF NOT EXISTS opc_alerts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      message TEXT NOT NULL DEFAULT '',
      resolved_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  tool_config: `
    CREATE TABLE IF NOT EXISTS opc_tool_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `,

  // ── 资金闭环关键业务表 ─────────────────────────────────────

  acquisition_cases: `
    CREATE TABLE IF NOT EXISTS opc_acquisition_cases (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      acquirer_id TEXT NOT NULL DEFAULT '',
      case_type TEXT NOT NULL DEFAULT 'acquisition',
      status TEXT NOT NULL DEFAULT 'evaluating',
      trigger_reason TEXT NOT NULL DEFAULT '',
      acquisition_price REAL NOT NULL DEFAULT 0,
      loss_amount REAL NOT NULL DEFAULT 0,
      tax_deduction REAL NOT NULL DEFAULT 0,
      initiated_date TEXT NOT NULL DEFAULT (date('now')),
      closed_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  asset_packages: `
    CREATE TABLE IF NOT EXISTS opc_asset_packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'assembling',
      total_valuation REAL NOT NULL DEFAULT 0,
      company_count INTEGER NOT NULL DEFAULT 0,
      sci_tech_certified INTEGER NOT NULL DEFAULT 0,
      assembled_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  asset_package_items: `
    CREATE TABLE IF NOT EXISTS opc_asset_package_items (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      acquisition_case_id TEXT NOT NULL DEFAULT '',
      valuation REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (package_id) REFERENCES opc_asset_packages(id),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  ct_transfers: `
    CREATE TABLE IF NOT EXISTS opc_ct_transfers (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      ct_company TEXT NOT NULL DEFAULT '',
      transfer_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'negotiating',
      sci_loan_target REAL NOT NULL DEFAULT 0,
      sci_loan_actual REAL NOT NULL DEFAULT 0,
      transfer_date TEXT NOT NULL DEFAULT '',
      loan_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (package_id) REFERENCES opc_asset_packages(id)
    )
  `,

  financing_fees: `
    CREATE TABLE IF NOT EXISTS opc_financing_fees (
      id TEXT PRIMARY KEY,
      transfer_id TEXT NOT NULL,
      fee_rate REAL NOT NULL DEFAULT 0,
      fee_amount REAL NOT NULL DEFAULT 0,
      base_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      invoiced INTEGER NOT NULL DEFAULT 0,
      paid_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (transfer_id) REFERENCES opc_ct_transfers(id)
    )
  `,

  // ── AI 员工岗位配置表 ─────────────────────────────────────

  staff_config: `
    CREATE TABLE IF NOT EXISTS opc_staff_config (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      role TEXT NOT NULL,
      role_name TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      system_prompt TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, role),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,

  // ── OPB 画布表 ───────────────────────────────────────────────

  opb_canvas: `
    CREATE TABLE IF NOT EXISTS opc_opb_canvas (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL UNIQUE,
      track TEXT NOT NULL DEFAULT '',
      target_customer TEXT NOT NULL DEFAULT '',
      pain_point TEXT NOT NULL DEFAULT '',
      solution TEXT NOT NULL DEFAULT '',
      unique_value TEXT NOT NULL DEFAULT '',
      channels TEXT NOT NULL DEFAULT '',
      revenue_model TEXT NOT NULL DEFAULT '',
      cost_structure TEXT NOT NULL DEFAULT '',
      key_resources TEXT NOT NULL DEFAULT '',
      key_activities TEXT NOT NULL DEFAULT '',
      key_partners TEXT NOT NULL DEFAULT '',
      unfair_advantage TEXT NOT NULL DEFAULT '',
      metrics TEXT NOT NULL DEFAULT '',
      non_compete TEXT NOT NULL DEFAULT '',
      scaling_strategy TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES opc_companies(id)
    )
  `,
} as const;

export const OPC_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_employees_company ON opc_employees(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_transactions_company ON opc_transactions(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_transactions_date ON opc_transactions(transaction_date)",
  "CREATE INDEX IF NOT EXISTS idx_transactions_type ON opc_transactions(type)",
  "CREATE INDEX IF NOT EXISTS idx_contacts_company ON opc_contacts(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_companies_status ON opc_companies(status)",
  // Phase 2
  "CREATE INDEX IF NOT EXISTS idx_invoices_company ON opc_invoices(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_invoices_status ON opc_invoices(status)",
  "CREATE INDEX IF NOT EXISTS idx_tax_filings_company ON opc_tax_filings(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_tax_filings_period ON opc_tax_filings(period)",
  "CREATE INDEX IF NOT EXISTS idx_contracts_company ON opc_contracts(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_contracts_status ON opc_contracts(status)",
  "CREATE INDEX IF NOT EXISTS idx_hr_records_company ON opc_hr_records(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_media_content_company ON opc_media_content(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_media_content_status ON opc_media_content(status)",
  "CREATE INDEX IF NOT EXISTS idx_projects_company ON opc_projects(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_project ON opc_tasks(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_company ON opc_tasks(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_status ON opc_tasks(status)",
  // Phase 3
  "CREATE INDEX IF NOT EXISTS idx_investment_rounds_company ON opc_investment_rounds(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_investment_rounds_status ON opc_investment_rounds(status)",
  "CREATE INDEX IF NOT EXISTS idx_investors_round ON opc_investors(round_id)",
  "CREATE INDEX IF NOT EXISTS idx_investors_company ON opc_investors(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_services_company ON opc_services(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_services_status ON opc_services(status)",
  "CREATE INDEX IF NOT EXISTS idx_procurement_orders_company ON opc_procurement_orders(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_procurement_orders_status ON opc_procurement_orders(status)",
  "CREATE INDEX IF NOT EXISTS idx_milestones_company ON opc_milestones(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_milestones_status ON opc_milestones(status)",
  "CREATE INDEX IF NOT EXISTS idx_lifecycle_events_company ON opc_lifecycle_events(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_lifecycle_events_date ON opc_lifecycle_events(event_date)",
  "CREATE INDEX IF NOT EXISTS idx_metrics_company ON opc_metrics(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_alerts_company ON opc_alerts(company_id)",
  // 资金闭环表索引
  "CREATE INDEX IF NOT EXISTS idx_acquisition_cases_company ON opc_acquisition_cases(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_acquisition_cases_status ON opc_acquisition_cases(status)",
  "CREATE INDEX IF NOT EXISTS idx_asset_packages_status ON opc_asset_packages(status)",
  "CREATE INDEX IF NOT EXISTS idx_asset_package_items_package ON opc_asset_package_items(package_id)",
  "CREATE INDEX IF NOT EXISTS idx_asset_package_items_company ON opc_asset_package_items(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_ct_transfers_package ON opc_ct_transfers(package_id)",
  "CREATE INDEX IF NOT EXISTS idx_ct_transfers_status ON opc_ct_transfers(status)",
  "CREATE INDEX IF NOT EXISTS idx_financing_fees_transfer ON opc_financing_fees(transfer_id)",
  "CREATE INDEX IF NOT EXISTS idx_financing_fees_status ON opc_financing_fees(status)",
  "CREATE INDEX IF NOT EXISTS idx_staff_config_company ON opc_staff_config(company_id)",
  // OPB Canvas
  "CREATE INDEX IF NOT EXISTS idx_opb_canvas_company ON opc_opb_canvas(company_id)",
];
