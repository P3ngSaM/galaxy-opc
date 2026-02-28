/**
 * 星环OPC中心 — opc_project 项目管理工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json, toolError } from "../utils/tool-helper.js";

const ProjectSchema = Type.Union([
  Type.Object({
    action: Type.Literal("create_project"),
    company_id: Type.String({ description: "公司 ID" }),
    name: Type.String({ description: "项目名称" }),
    description: Type.Optional(Type.String({ description: "项目描述" })),
    start_date: Type.Optional(Type.String({ description: "开始日期 (YYYY-MM-DD)" })),
    end_date: Type.Optional(Type.String({ description: "截止日期 (YYYY-MM-DD)" })),
    budget: Type.Optional(Type.Number({ description: "预算（元）" })),
  }),
  Type.Object({
    action: Type.Literal("list_projects"),
    company_id: Type.String({ description: "公司 ID" }),
    status: Type.Optional(Type.String({ description: "按状态筛选: planning/active/paused/completed/cancelled" })),
  }),
  Type.Object({
    action: Type.Literal("update_project"),
    project_id: Type.String({ description: "项目 ID" }),
    status: Type.Optional(Type.String({ description: "新状态" })),
    spent: Type.Optional(Type.Number({ description: "已花费金额" })),
    end_date: Type.Optional(Type.String({ description: "新截止日期" })),
    description: Type.Optional(Type.String({ description: "新描述" })),
  }),
  Type.Object({
    action: Type.Literal("add_task"),
    project_id: Type.String({ description: "项目 ID" }),
    company_id: Type.String({ description: "公司 ID" }),
    title: Type.String({ description: "任务标题" }),
    description: Type.Optional(Type.String({ description: "任务描述" })),
    assignee: Type.Optional(Type.String({ description: "负责人" })),
    priority: Type.Optional(Type.String({ description: "优先级: low/medium/high/urgent" })),
    due_date: Type.Optional(Type.String({ description: "截止日期 (YYYY-MM-DD)" })),
    hours_estimated: Type.Optional(Type.Number({ description: "预估工时（小时）" })),
  }),
  Type.Object({
    action: Type.Literal("list_tasks"),
    project_id: Type.String({ description: "项目 ID" }),
    status: Type.Optional(Type.String({ description: "按状态筛选: todo/in_progress/review/done" })),
  }),
  Type.Object({
    action: Type.Literal("update_task"),
    task_id: Type.String({ description: "任务 ID" }),
    status: Type.Optional(Type.String({ description: "新状态: todo/in_progress/review/done" })),
    hours_actual: Type.Optional(Type.Number({ description: "实际工时（小时）" })),
    assignee: Type.Optional(Type.String({ description: "新负责人" })),
    priority: Type.Optional(Type.String({ description: "新优先级" })),
    due_date: Type.Optional(Type.String({ description: "新截止日期" })),
  }),
  Type.Object({
    action: Type.Literal("project_summary"),
    project_id: Type.String({ description: "项目 ID" }),
  }),
  Type.Object({
    action: Type.Literal("kanban"),
    project_id: Type.String({ description: "项目 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_project"),
    project_id: Type.String({ description: "项目 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_task"),
    task_id: Type.String({ description: "任务 ID" }),
  }),
]);

type ProjectParams = Static<typeof ProjectSchema>;

export function registerProjectTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_project",
      label: "OPC 项目管理",
      description:
        "项目管理工具。操作: create_project(创建项目), list_projects(项目列表), " +
        "update_project(更新项目), add_task(添加任务), list_tasks(任务列表), " +
        "update_task(更新任务), project_summary(项目概况), kanban(看板视图), delete_project(删除项目及其任务), delete_task(删除任务)",
      parameters: ProjectSchema,
      async execute(_toolCallId, params) {
        const p = params as ProjectParams;
        try {
          switch (p.action) {
            case "create_project": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_projects (id, company_id, name, description, status, start_date, end_date, budget, spent, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'planning', ?, ?, ?, 0, ?, ?)`,
                id, p.company_id, p.name, p.description ?? "",
                p.start_date ?? now.slice(0, 10), p.end_date ?? "",
                p.budget ?? 0, now, now,
              );
              return json(db.queryOne("SELECT * FROM opc_projects WHERE id = ?", id));
            }

            case "list_projects": {
              let sql = "SELECT * FROM opc_projects WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "update_project": {
              const fields: string[] = [];
              const values: unknown[] = [];
              if (p.status) { fields.push("status = ?"); values.push(p.status); }
              if (p.spent !== undefined) { fields.push("spent = ?"); values.push(p.spent); }
              if (p.end_date) { fields.push("end_date = ?"); values.push(p.end_date); }
              if (p.description) { fields.push("description = ?"); values.push(p.description); }
              fields.push("updated_at = ?"); values.push(new Date().toISOString());
              values.push(p.project_id);
              db.execute(`UPDATE opc_projects SET ${fields.join(", ")} WHERE id = ?`, ...values);
              const updated = db.queryOne("SELECT * FROM opc_projects WHERE id = ?", p.project_id);
              if (!updated) return toolError("项目不存在", "RECORD_NOT_FOUND");
              return json(updated);
            }

            case "add_task": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_tasks (id, project_id, company_id, title, description, assignee, priority, status, due_date, hours_estimated, hours_actual, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, 0, ?, ?)`,
                id, p.project_id, p.company_id, p.title, p.description ?? "",
                p.assignee ?? "", p.priority ?? "medium",
                p.due_date ?? "", p.hours_estimated ?? 0, now, now,
              );
              return json(db.queryOne("SELECT * FROM opc_tasks WHERE id = ?", id));
            }

            case "list_tasks": {
              let sql = "SELECT * FROM opc_tasks WHERE project_id = ?";
              const params2: unknown[] = [p.project_id];
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, due_date";
              return json(db.query(sql, ...params2));
            }

            case "update_task": {
              const fields: string[] = [];
              const values: unknown[] = [];
              if (p.status) { fields.push("status = ?"); values.push(p.status); }
              if (p.hours_actual !== undefined) { fields.push("hours_actual = ?"); values.push(p.hours_actual); }
              if (p.assignee) { fields.push("assignee = ?"); values.push(p.assignee); }
              if (p.priority) { fields.push("priority = ?"); values.push(p.priority); }
              if (p.due_date) { fields.push("due_date = ?"); values.push(p.due_date); }
              fields.push("updated_at = ?"); values.push(new Date().toISOString());
              values.push(p.task_id);
              db.execute(`UPDATE opc_tasks SET ${fields.join(", ")} WHERE id = ?`, ...values);
              const updatedTask = db.queryOne("SELECT * FROM opc_tasks WHERE id = ?", p.task_id);
              if (!updatedTask) return toolError("任务不存在", "RECORD_NOT_FOUND");
              return json(updatedTask);
            }

            case "project_summary": {
              const project = db.queryOne("SELECT * FROM opc_projects WHERE id = ?", p.project_id);
              if (!project) return toolError("项目不存在", "RECORD_NOT_FOUND");
              const tasks = db.query("SELECT status, COUNT(*) as count, SUM(hours_estimated) as est, SUM(hours_actual) as actual FROM opc_tasks WHERE project_id = ? GROUP BY status", p.project_id);
              const overdue = db.query(
                "SELECT * FROM opc_tasks WHERE project_id = ? AND status != 'done' AND due_date != '' AND due_date < date('now')",
                p.project_id,
              );
              return json({ project, task_stats: tasks, overdue_tasks: overdue });
            }

            case "kanban": {
              const todo = db.query("SELECT * FROM opc_tasks WHERE project_id = ? AND status = 'todo' ORDER BY priority", p.project_id);
              const inProgress = db.query("SELECT * FROM opc_tasks WHERE project_id = ? AND status = 'in_progress' ORDER BY priority", p.project_id);
              const review = db.query("SELECT * FROM opc_tasks WHERE project_id = ? AND status = 'review' ORDER BY priority", p.project_id);
              const done = db.query("SELECT * FROM opc_tasks WHERE project_id = ? AND status = 'done' ORDER BY updated_at DESC LIMIT 10", p.project_id);
              return json({ todo, in_progress: inProgress, review, done });
            }

            case "delete_project": {
              db.execute("DELETE FROM opc_tasks WHERE project_id = ?", p.project_id);
              db.execute("DELETE FROM opc_projects WHERE id = ?", p.project_id);
              return json({ ok: true });
            }

            case "delete_task": {
              db.execute("DELETE FROM opc_tasks WHERE id = ?", p.task_id);
              return json({ ok: true });
            }

            default:
              return toolError(`未知操作: ${(p as { action: string }).action}`, "UNKNOWN_ACTION");
          }
        } catch (err) {
          return toolError(err instanceof Error ? err.message : String(err), "DB_ERROR");
        }
      },
    },
    { name: "opc_project" },
  );

  api.logger.info("opc: 已注册 opc_project 工具");
}
