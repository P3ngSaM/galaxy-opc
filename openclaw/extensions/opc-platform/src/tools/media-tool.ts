/**
 * 星环OPC中心 — opc_media 新媒体运营工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json } from "../utils/tool-helper.js";

const MediaSchema = Type.Union([
  Type.Object({
    action: Type.Literal("create_content"),
    company_id: Type.String({ description: "公司 ID" }),
    title: Type.String({ description: "内容标题" }),
    platform: Type.String({ description: "平台: 微信公众号/小红书/抖音/微博/知乎/B站/其他" }),
    content_type: Type.Optional(Type.String({ description: "类型: article/short_video/image/live/other" })),
    content: Type.Optional(Type.String({ description: "内容正文/脚本" })),
    scheduled_date: Type.Optional(Type.String({ description: "计划发布日期 (YYYY-MM-DD)" })),
    tags: Type.Optional(Type.String({ description: "标签，JSON 数组" })),
  }),
  Type.Object({
    action: Type.Literal("list_content"),
    company_id: Type.String({ description: "公司 ID" }),
    platform: Type.Optional(Type.String({ description: "按平台筛选" })),
    status: Type.Optional(Type.String({ description: "按状态筛选: draft/scheduled/published/archived" })),
  }),
  Type.Object({
    action: Type.Literal("update_content"),
    content_id: Type.String({ description: "内容 ID" }),
    title: Type.Optional(Type.String({ description: "新标题" })),
    content: Type.Optional(Type.String({ description: "新内容" })),
    status: Type.Optional(Type.String({ description: "新状态" })),
    published_date: Type.Optional(Type.String({ description: "实际发布日期" })),
    metrics: Type.Optional(Type.String({ description: "数据指标 JSON，如 {\"views\":1000,\"likes\":50}" })),
  }),
  Type.Object({
    action: Type.Literal("content_calendar"),
    company_id: Type.String({ description: "公司 ID" }),
    month: Type.Optional(Type.String({ description: "月份 (YYYY-MM)，默认当月" })),
  }),
  Type.Object({
    action: Type.Literal("platform_guide"),
    platform: Type.String({ description: "平台名称" }),
  }),
  Type.Object({
    action: Type.Literal("delete_content"),
    content_id: Type.String({ description: "内容 ID" }),
  }),
]);

type MediaParams = Static<typeof MediaSchema>;

const PLATFORM_GUIDES: Record<string, { format: string; best_time: string; tips: string[] }> = {
  "微信公众号": {
    format: "图文文章 800-2000字，配图 3-6 张",
    best_time: "早 7-9 点，中午 12-13 点，晚 20-22 点",
    tips: ["标题控制在 20 字以内", "开头 3 行决定打开率", "文末引导关注/转发", "排版简洁，段落短"],
  },
  "小红书": {
    format: "图文笔记 300-800字，封面图决定点击率",
    best_time: "中午 12-14 点，晚 19-22 点",
    tips: ["标题加 emoji 提升点击", "首图要有冲击力", "内容要有干货/教程价值", "标签 10-15 个"],
  },
  "抖音": {
    format: "短视频 15-60秒，竖屏 9:16",
    best_time: "中午 12-13 点，晚 18-22 点",
    tips: ["前 3 秒要抓注意力", "字幕必须加", "选热门 BGM", "每条视频一个核心信息"],
  },
  "微博": {
    format: "文字 140字内 + 配图/视频",
    best_time: "工作日 10-12 点，20-23 点",
    tips: ["蹭热点要快", "话题标签要用", "互动性内容效果好", "长文用头条文章"],
  },
  "知乎": {
    format: "长文回答 1000-3000字，专业深度内容",
    best_time: "工作日 10-12 点，20-22 点",
    tips: ["选高关注问题回答", "开头要有结论", "引用数据增加可信度", "专栏文章沉淀内容"],
  },
  "B站": {
    format: "中长视频 3-15分钟，横屏 16:9",
    best_time: "周末全天，工作日 18-23 点",
    tips: ["封面标题要有信息量", "内容节奏要快", "弹幕互动很重要", "系列化内容涨粉快"],
  },
};

export function registerMediaTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_media",
      label: "OPC 新媒体运营",
      description:
        "新媒体运营工具。操作: create_content(创建内容), list_content(内容列表), " +
        "update_content(更新内容), content_calendar(发布日历), platform_guide(平台指南), delete_content(删除内容)",
      parameters: MediaSchema,
      async execute(_toolCallId, params) {
        const p = params as MediaParams;
        try {
          switch (p.action) {
            case "create_content": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_media_content (id, company_id, title, platform, content_type, content, status, scheduled_date, tags, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                id, p.company_id, p.title, p.platform,
                p.content_type ?? "article", p.content ?? "",
                p.scheduled_date ? "scheduled" : "draft",
                p.scheduled_date ?? "", p.tags ?? "[]", now, now,
              );
              return json(db.queryOne("SELECT * FROM opc_media_content WHERE id = ?", id));
            }

            case "list_content": {
              let sql = "SELECT * FROM opc_media_content WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.platform) { sql += " AND platform = ?"; params2.push(p.platform); }
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "update_content": {
              const fields: string[] = [];
              const values: unknown[] = [];
              if (p.title) { fields.push("title = ?"); values.push(p.title); }
              if (p.content) { fields.push("content = ?"); values.push(p.content); }
              if (p.status) { fields.push("status = ?"); values.push(p.status); }
              if (p.published_date) { fields.push("published_date = ?"); values.push(p.published_date); }
              if (p.metrics) { fields.push("metrics = ?"); values.push(p.metrics); }
              fields.push("updated_at = ?"); values.push(new Date().toISOString());
              values.push(p.content_id);
              db.execute(`UPDATE opc_media_content SET ${fields.join(", ")} WHERE id = ?`, ...values);
              return json(db.queryOne("SELECT * FROM opc_media_content WHERE id = ?", p.content_id) ?? { error: "内容不存在" });
            }

            case "content_calendar": {
              const month = p.month ?? new Date().toISOString().slice(0, 7);
              const scheduled = db.query(
                "SELECT * FROM opc_media_content WHERE company_id = ? AND scheduled_date LIKE ? ORDER BY scheduled_date",
                p.company_id, month + "%",
              );
              const published = db.query(
                "SELECT * FROM opc_media_content WHERE company_id = ? AND published_date LIKE ? ORDER BY published_date",
                p.company_id, month + "%",
              );
              return json({ month, scheduled, published });
            }

            case "platform_guide": {
              const guide = PLATFORM_GUIDES[p.platform];
              if (!guide) {
                return json({ error: `无此平台指南，可用: ${Object.keys(PLATFORM_GUIDES).join(", ")}` });
              }
              return json({ platform: p.platform, ...guide });
            }

            case "delete_content": {
              db.execute("DELETE FROM opc_media_content WHERE id = ?", p.content_id);
              return json({ ok: true });
            }

            default:
              return json({ error: `未知操作: ${(p as { action: string }).action}` });
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "opc_media" },
  );

  api.logger.info("opc: 已注册 opc_media 工具");
}
