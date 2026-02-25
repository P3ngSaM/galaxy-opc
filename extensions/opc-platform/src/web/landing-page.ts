/**
 * 星环OPC中心 — 产品官网/文档页
 *
 * 路由: /opc/home/*
 * 纯静态 HTML 单页，展示产品功能和安装指南
 */

import type { ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const MODULES = [
  { icon: "&#127970;", name: "核心管理", tool: "opc_core", desc: "公司注册、AI员工创建、客户关系、交易记录", phase: 1 },
  { icon: "&#128176;", name: "财税管理", tool: "opc_finance", desc: "发票管理、增值税/所得税计算、纳税申报、税务日历", phase: 2 },
  { icon: "&#9878;", name: "法务合同", tool: "opc_legal", desc: "合同全生命周期、风险评估、到期提醒", phase: 2 },
  { icon: "&#128101;", name: "人力资源", tool: "opc_hr", desc: "员工档案、薪资核算、社保公积金、入离职管理", phase: 2 },
  { icon: "&#128247;", name: "新媒体运营", tool: "opc_media", desc: "内容创建、多平台发布、排期管理、数据分析", phase: 2 },
  { icon: "&#128203;", name: "项目管理", tool: "opc_project", desc: "项目规划、任务分配、进度追踪、预算管控", phase: 2 },
  { icon: "&#128200;", name: "投融资", tool: "opc_investment", desc: "融资轮次、投资人管理、股权结构(Cap Table)、估值历史", phase: 3 },
  { icon: "&#128722;", name: "服务采购", tool: "opc_procurement", desc: "服务项目管理、采购订单、费用分类统计", phase: 3 },
  { icon: "&#127942;", name: "生命周期", tool: "opc_lifecycle", desc: "里程碑管理、大事记、时间线、公司综合报告", phase: 3 },
  { icon: "&#128202;", name: "运营监控", tool: "opc_monitoring", desc: "指标记录、告警管理、KPI看板、跨表数据聚合", phase: 3 },
];

function buildLandingHtml(): string {
  const moduleCards = MODULES.map(m =>
    `<div class="module-card">
      <div class="module-icon">${m.icon}</div>
      <h3>${m.name}</h3>
      <p class="module-desc">${m.desc}</p>
      <span class="module-phase">Phase ${m.phase}</span>
      <code class="module-tool">${m.tool}</code>
    </div>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>星环OPC中心 — 一人公司 AI 管家</title>
<style>
  :root {
    --primary: #6366f1;
    --primary-dark: #4338ca;
    --text: #1e293b;
    --text-light: #64748b;
    --bg: #ffffff;
    --bg-alt: #f8fafc;
    --border: #e2e8f0;
    --radius: 12px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif;
    color: var(--text); line-height: 1.6;
  }

  /* Hero */
  .hero {
    background: linear-gradient(135deg, #312e81 0%, #4338ca 50%, #6366f1 100%);
    color: #fff; text-align: center; padding: 80px 24px 64px;
  }
  .hero h1 { font-size: 48px; font-weight: 800; margin-bottom: 12px; }
  .hero .subtitle { font-size: 22px; opacity: 0.9; margin-bottom: 8px; }
  .hero .tagline { font-size: 16px; opacity: 0.7; margin-bottom: 32px; }
  .hero .cta {
    display: inline-block; padding: 14px 36px; background: #fff; color: var(--primary-dark);
    font-size: 16px; font-weight: 600; border-radius: 9999px; text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .hero .cta:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); }

  /* Section */
  .section { max-width: 1100px; margin: 0 auto; padding: 64px 24px; }
  .section h2 {
    font-size: 28px; font-weight: 700; text-align: center; margin-bottom: 12px;
  }
  .section .section-desc {
    text-align: center; color: var(--text-light); font-size: 15px; margin-bottom: 40px;
  }

  /* Modules Grid */
  .modules-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 20px;
  }
  .module-card {
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 24px; transition: transform 0.2s, box-shadow 0.2s;
  }
  .module-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.08); }
  .module-icon { font-size: 32px; margin-bottom: 12px; }
  .module-card h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
  .module-desc { font-size: 13px; color: var(--text-light); line-height: 1.5; margin-bottom: 12px; }
  .module-phase {
    display: inline-block; padding: 2px 8px; border-radius: 9999px;
    font-size: 11px; font-weight: 500; background: #ede9fe; color: #5b21b6;
  }
  .module-tool {
    display: inline-block; margin-left: 6px; padding: 2px 6px; border-radius: 4px;
    font-size: 11px; background: #f1f5f9; color: var(--text-light);
  }

  /* Install */
  .install-bg { background: var(--bg-alt); }
  .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
  .step {
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px;
  }
  .step-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; background: var(--primary); color: #fff;
    border-radius: 50%; font-size: 14px; font-weight: 700; margin-bottom: 12px;
  }
  .step h3 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
  .step p { font-size: 13px; color: var(--text-light); }
  .step pre {
    background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 8px;
    font-size: 12px; line-height: 1.6; overflow-x: auto; margin-top: 12px;
  }

  /* Examples */
  .examples { display: flex; flex-direction: column; gap: 16px; }
  .example {
    background: var(--bg-alt); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 20px;
  }
  .example .q {
    font-weight: 600; font-size: 14px; color: var(--primary-dark); margin-bottom: 8px;
  }
  .example .a { font-size: 13px; color: var(--text-light); }

  /* Footer */
  .footer {
    background: #1e293b; color: rgba(255,255,255,0.6); text-align: center;
    padding: 32px 24px; font-size: 13px;
  }
  .footer strong { color: #fff; }

  @media (max-width: 640px) {
    .hero h1 { font-size: 32px; }
    .hero .subtitle { font-size: 18px; }
    .modules-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<!-- Hero -->
<section class="hero">
  <h1>星环OPC中心</h1>
  <div class="subtitle">一人公司 AI 管家</div>
  <div class="tagline">10 大 AI 工具模块 &middot; 覆盖公司全生命周期 &middot; 零代码接入</div>
  <a class="cta" href="/opc/admin">进入管理后台</a>
</section>

<!-- Modules -->
<section class="section">
  <h2>功能一览</h2>
  <p class="section-desc">从公司注册到融资退出，AI 员工全程代办</p>
  <div class="modules-grid">
    ${moduleCards}
  </div>
</section>

<!-- Install -->
<section class="section install-bg">
  <h2>快速开始</h2>
  <p class="section-desc">三步接入，即刻拥有 AI 公司管家</p>
  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <h3>下载插件</h3>
      <p>将 opc-platform 插件放入 extensions 目录</p>
      <pre>extensions/
  opc-platform/
    index.ts
    package.json
    openclaw.plugin.json</pre>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <h3>配置启用</h3>
      <p>在 openclaw.json 中启用插件</p>
      <pre>{
  "plugins": {
    "opc-platform": {
      "enabled": true,
      "config": {
        "dbPath": "~/.openclaw/opc/opc.db"
      }
    }
  }
}</pre>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <h3>启动使用</h3>
      <p>启动 Gateway，通过对话即可使用全部功能</p>
      <pre>pnpm build && pnpm start

# 访问管理后台
http://localhost:18789/opc/admin

# 访问产品官网
http://localhost:18789/opc/home</pre>
    </div>
  </div>
</section>

<!-- Examples -->
<section class="section">
  <h2>使用示例</h2>
  <p class="section-desc">自然语言驱动，像和助理对话一样管理公司</p>
  <div class="examples">
    <div class="example">
      <div class="q">"帮我注册一家科技公司，注册资金10万"</div>
      <div class="a">AI 调用 opc_core 创建公司记录，自动生成唯一 ID，设置行业和注册资本</div>
    </div>
    <div class="example">
      <div class="q">"给客户A开一张5万元的服务费发票"</div>
      <div class="a">AI 调用 opc_finance 创建销项发票，自动计算 6% 增值税，生成含税总额</div>
    </div>
    <div class="example">
      <div class="q">"查看当前股权结构"</div>
      <div class="a">AI 调用 opc_investment cap_table，聚合所有投资人股权，计算创始人剩余比例</div>
    </div>
    <div class="example">
      <div class="q">"生成公司综合报告"</div>
      <div class="a">AI 调用 opc_lifecycle generate_report，聚合财务/团队/项目/合同/融资等全景数据</div>
    </div>
    <div class="example">
      <div class="q">"查看这个月的KPI"</div>
      <div class="a">AI 调用 opc_monitoring kpi_summary，跨表聚合收入/员工/项目/合同/告警数据</div>
    </div>
  </div>
</section>

<!-- Footer -->
<footer class="footer">
  <strong>星环OPC中心</strong> v0.3.0 &mdash; Phase 3 业务闭环
  <br>基于 OpenClaw 插件架构 &middot; 零核心代码修改
</footer>

</body>
</html>`;
}

export function registerLandingPage(api: OpenClawPluginApi): void {
  api.registerHttpHandler(async (req, res) => {
    const rawUrl = req.url ?? "";
    const urlObj = new URL(rawUrl, "http://localhost");
    const pathname = urlObj.pathname;

    if (!pathname.startsWith("/opc/home")) {
      return false;
    }

    sendHtml(res, buildLandingHtml());
    return true;
  });

  api.logger.info("opc: 已注册产品官网 (/opc/home)");
}
