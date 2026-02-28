/**
 * 星环OPC中心 — opc_media 新媒体运营工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json, toolError } from "../utils/tool-helper.js";

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
  Type.Object({
    action: Type.Literal("generate_content_brief"),
    company_id: Type.String({ description: "公司 ID" }),
    platform: Type.String({ description: "目标平台: 微信公众号/小红书/抖音/微博/知乎/B站" }),
    topic: Type.String({ description: "主题关键词" }),
  }),
  Type.Object({
    action: Type.Literal("submit_for_review"),
    content_id: Type.String({ description: "内容 ID" }),
  }),
  Type.Object({
    action: Type.Literal("approve_content"),
    content_id: Type.String({ description: "内容 ID" }),
    approved: Type.Boolean({ description: "是否通过: true=通过, false=需修改" }),
    review_notes: Type.Optional(Type.String({ description: "审批备注/修改意见" })),
    reviewer: Type.Optional(Type.String({ description: "审批人" })),
  }),
  Type.Object({
    action: Type.Literal("content_analytics"),
    company_id: Type.String({ description: "公司 ID" }),
    month: Type.Optional(Type.String({ description: "月份 (YYYY-MM)，默认当月" })),
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
        "update_content(更新内容), content_calendar(发布日历), platform_guide(平台指南), " +
        "delete_content(删除内容), generate_content_brief(AI内容策划摘要), " +
        "submit_for_review(提交审批), approve_content(审批内容), content_analytics(内容分析)",
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
              const updated = db.queryOne("SELECT * FROM opc_media_content WHERE id = ?", p.content_id);
              if (!updated) return toolError("内容不存在", "RECORD_NOT_FOUND");
              return json(updated);
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
                return toolError(`无此平台指南，可用: ${Object.keys(PLATFORM_GUIDES).join(", ")}`, "INVALID_INPUT");
              }
              return json({ platform: p.platform, ...guide });
            }

            case "delete_content": {
              db.execute("DELETE FROM opc_media_content WHERE id = ?", p.content_id);
              return json({ ok: true });
            }

            case "generate_content_brief": {
              // 获取公司信息
              const company = db.queryOne("SELECT * FROM opc_companies WHERE id = ?", p.company_id) as Record<string, unknown> | null;
              if (!company) return toolError(`公司 ${p.company_id} 不存在`, "COMPANY_NOT_FOUND");

              // 获取 OPB Canvas
              const canvas = db.queryOne("SELECT * FROM opc_opb_canvas WHERE company_id = ?", p.company_id) as Record<string, unknown> | null;

              // 获取平台指南
              const guide = PLATFORM_GUIDES[p.platform];

              const brief = {
                ok: true,
                platform: p.platform,
                topic: p.topic,
                company_info: {
                  name: company.name,
                  industry: company.industry,
                  description: company.description,
                },
                canvas_highlights: canvas ? {
                  value_proposition: canvas.solution || canvas.unique_value,
                  target_customer: canvas.target_customer,
                  pain_point: canvas.pain_point,
                } : null,
                platform_guide: guide ?? null,
                content_strategy: {
                  title_suggestions: [
                    `${p.topic} — 一人企业的实战经验分享`,
                    `关于${p.topic}，你需要知道的3件事`,
                    `${company.industry}行业 ${p.topic} 深度解析`,
                  ],
                  outline: [
                    "1. 引入：痛点/现象描述（引起共鸣）",
                    "2. 分析：为什么会这样（专业视角）",
                    "3. 解决方案：具体可操作的方法",
                    "4. 案例/数据：增加可信度",
                    "5. 总结 + 行动号召（引导互动）",
                  ],
                  keywords: [p.topic, company.industry as string, "一人企业", "创业"],
                  hashtags: guide ? [`#${p.topic}`, `#${company.industry}`, "#一人企业", "#创业干货"] : [`#${p.topic}`],
                  platform_tips: guide ? guide.tips : [],
                  best_publish_time: guide ? guide.best_time : "建议工作日晚间 20-22 点",
                  format_recommendation: guide ? guide.format : "图文内容",
                },
              };

              return json(brief);
            }

            case "submit_for_review": {
              const content = db.queryOne("SELECT * FROM opc_media_content WHERE id = ?", p.content_id) as Record<string, unknown> | null;
              if (!content) return toolError("内容不存在", "RECORD_NOT_FOUND");
              db.execute(
                "UPDATE opc_media_content SET status = 'pending_review', updated_at = ? WHERE id = ?",
                new Date().toISOString(), p.content_id,
              );
              return json(db.queryOne("SELECT * FROM opc_media_content WHERE id = ?", p.content_id));
            }

            case "approve_content": {
              const content = db.queryOne("SELECT * FROM opc_media_content WHERE id = ?", p.content_id) as Record<string, unknown> | null;
              if (!content) return toolError("内容不存在", "RECORD_NOT_FOUND");

              const now = new Date().toISOString();
              if (p.approved) {
                db.execute(
                  "UPDATE opc_media_content SET status = 'approved', reviewer = ?, review_notes = ?, approved_at = ?, updated_at = ? WHERE id = ?",
                  p.reviewer ?? "", p.review_notes ?? "", now, now, p.content_id,
                );
              } else {
                db.execute(
                  "UPDATE opc_media_content SET status = 'revision_needed', reviewer = ?, review_notes = ?, updated_at = ? WHERE id = ?",
                  p.reviewer ?? "", p.review_notes ?? "", now, p.content_id,
                );
              }

              return json(db.queryOne("SELECT * FROM opc_media_content WHERE id = ?", p.content_id));
            }

            case "content_analytics": {
              const month = p.month ?? new Date().toISOString().slice(0, 7);

              const total = (db.queryOne(
                "SELECT COUNT(*) as cnt FROM opc_media_content WHERE company_id = ? AND created_at LIKE ?",
                p.company_id, month + "%",
              ) as { cnt: number }).cnt;

              const published = (db.queryOne(
                "SELECT COUNT(*) as cnt FROM opc_media_content WHERE company_id = ? AND status = 'published' AND published_date LIKE ?",
                p.company_id, month + "%",
              ) as { cnt: number }).cnt;

              const byPlatform = db.query(
                "SELECT platform, COUNT(*) as cnt FROM opc_media_content WHERE company_id = ? AND created_at LIKE ? GROUP BY platform",
                p.company_id, month + "%",
              );

              const byStatus = db.query(
                "SELECT status, COUNT(*) as cnt FROM opc_media_content WHERE company_id = ? AND created_at LIKE ? GROUP BY status",
                p.company_id, month + "%",
              );

              // 汇总互动指标
              const allMetrics = db.query(
                "SELECT metrics FROM opc_media_content WHERE company_id = ? AND status = 'published' AND published_date LIKE ?",
                p.company_id, month + "%",
              ) as { metrics: string }[];

              let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
              for (const row of allMetrics) {
                try {
                  const m = JSON.parse(row.metrics);
                  totalViews += m.views ?? 0;
                  totalLikes += m.likes ?? 0;
                  totalComments += m.comments ?? 0;
                  totalShares += m.shares ?? 0;
                } catch { /* skip */ }
              }

              return json({
                ok: true,
                month,
                total_content: total,
                published_count: published,
                by_platform: byPlatform,
                by_status: byStatus,
                engagement: { views: totalViews, likes: totalLikes, comments: totalComments, shares: totalShares },
              });
            }

            default:
              return toolError(`未知操作: ${(p as { action: string }).action}`, "UNKNOWN_ACTION");
          }
        } catch (err) {
          return toolError(err instanceof Error ? err.message : String(err), "DB_ERROR");
        }
      },
    },
    { name: "opc_media" },
  );

  api.logger.info("opc: 已注册 opc_media 工具");
}
