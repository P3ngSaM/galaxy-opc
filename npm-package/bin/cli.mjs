#!/usr/bin/env node
/**
 * 星环 Galaxy OPC — CLI 入口
 * 用法:
 *   npx galaxy-opc          # 安装并初始化（首次使用）
 *   npx galaxy-opc setup    # 重新配置 AI 模型
 *   npx galaxy-opc start    # 启动服务
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { execSync, spawn } from "node:child_process";
import crypto from "node:crypto";

// ─── 颜色工具 ───────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
  red: "\x1b[31m", blue: "\x1b[34m", gray: "\x1b[90m",
};
const bold   = (s) => `${c.bold}${s}${c.reset}`;
const cyan   = (s) => `${c.cyan}${s}${c.reset}`;
const green  = (s) => `${c.green}${s}${c.reset}`;
const yellow = (s) => `${c.yellow}${s}${c.reset}`;
const red    = (s) => `${c.red}${s}${c.reset}`;
const gray   = (s) => `${c.gray}${s}${c.reset}`;
const dim    = (s) => `${c.dim}${s}${c.reset}`;

// ─── readline 工具 ──────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));

async function askChoice(prompt, options) {
  while (true) {
    console.log(`\n${bold(prompt)}`);
    options.forEach((opt, i) => {
      const label = opt.recommended ? `${opt.label} ${dim("(推荐)")}` : opt.label;
      console.log(`  ${cyan(String(i + 1))}. ${label}`);
      if (opt.desc) console.log(`     ${gray(opt.desc)}`);
    });
    const ans = await ask(`\n请输入选项编号 [1-${options.length}]: `);
    const n = parseInt(ans);
    if (n >= 1 && n <= options.length) return n - 1;
    console.log(red("  无效选项，请重试"));
  }
}

async function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const ans = await ask(`${question} ${gray(hint)}: `);
  if (!ans) return defaultYes;
  return ans.toLowerCase().startsWith("y");
}

function separator(char = "─", len = 60) { console.log(gray(char.repeat(len))); }

// ─── 工具函数 ───────────────────────────────────────────────────────────────
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function readEnv(p) {
  if (!fs.existsSync(p)) return {};
  const env = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function writeEnv(p, envObj) {
  const lines = Object.entries(envObj)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(p, lines.join("\n") + "\n", "utf8");
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
    proc.on("error", reject);
  });
}

function checkTool(cmd) {
  try { execSync(`${cmd} --version`, { stdio: "ignore" }); return true; } catch { return false; }
}

function getOpenclawVersion() {
  try {
    const out = execSync("openclaw --version 2>&1", { encoding: "utf8" }).trim();
    return out || "已安装";
  } catch {
    return null;
  }
}

// ─── 路径常量 ───────────────────────────────────────────────────────────────
const HOME        = os.homedir();
const STATE_DIR   = path.join(HOME, ".openclaw");
const CONFIG_PATH = path.join(STATE_DIR, "openclaw.json");
const ENV_PATH    = path.join(STATE_DIR, ".env");

// ─── 命令路由 ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || "install";

if (command === "start") {
  await cmdStart();
} else if (command === "setup") {
  await cmdSetup();
} else {
  await cmdInstall();
}
rl.close();

// ─── install：安装 openclaw + 插件 + 配置 ───────────────────────────────────
async function cmdInstall() {
  console.clear();
  console.log(`
${bold(cyan("  ╔══════════════════════════════════════════════╗"))}
${bold(cyan("  ║"))}  ${bold("星环 Galaxy OPC")}  — 安装向导                   ${bold(cyan("║"))}
${bold(cyan("  ║"))}  ${dim("一人公司孵化与赋能平台")}                         ${bold(cyan("║"))}
${bold(cyan("  ╚══════════════════════════════════════════════╝"))}
`);

  // ── 步骤 1：环境检查 ────────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 1 / 4  环境检查"));
  separator();

  const [major] = process.versions.node.split(".").map(Number);
  if (major < 22) {
    console.error(red(`\n  ✗ 需要 Node.js >= 22，当前 v${process.versions.node}`));
    console.error(gray("  下载: https://nodejs.org/\n"));
    process.exit(1);
  }
  console.log(green(`  ✓ Node.js v${process.versions.node}`));

  // ── 步骤 2：安装 openclaw ────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 2 / 4  安装 OpenClaw 核心"));
  separator();

  const ocVersion = getOpenclawVersion();
  if (ocVersion) {
    console.log(green(`  ✓ OpenClaw 已安装 (${ocVersion})`));
  } else {
    console.log(dim("  正在安装 OpenClaw（首次安装约 80MB+，使用国内镜像加速）...\n"));
    // 临时覆盖 git url rewrite（有些机器把 https://github.com 重写到 ssh）
    let gitRewriteSet = false;
    try {
      execSync("git config --global url.https://github.com/.insteadOf git@github.com:", { stdio: "ignore" });
      gitRewriteSet = true;
    } catch { /* ignore */ }

    try {
      await runCommand("npm", [
        "install", "-g", "openclaw@latest",
        "--registry", "https://registry.npmmirror.com",
        "--git-protocol", "https",
      ]);
      console.log(green("\n  ✓ OpenClaw 安装完成"));
    } catch {
      console.error(red("\n  ✗ OpenClaw 安装失败，请手动运行:"));
      console.error(gray("    npm install -g openclaw@latest --registry https://registry.npmmirror.com\n"));
      process.exit(1);
    } finally {
      // 还原 git 配置
      if (gitRewriteSet) {
        try { execSync("git config --global --unset url.https://github.com/.insteadOf", { stdio: "ignore" }); } catch { /* ignore */ }
      }
    }
  }

  // ── 步骤 3：安装 OPC 插件 ────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 3 / 4  安装 OPC Platform 插件"));
  separator();

  const pluginInstallDir = path.join(STATE_DIR, "extensions", "galaxy-opc-plugin");
  if (fs.existsSync(pluginInstallDir)) {
    console.log(yellow(`  检测到插件已存在: ${pluginInstallDir}`));
    const update = await askYesNo("  更新到最新版本？", true);
    if (!update) {
      console.log(green("  ✓ 跳过，使用现有版本"));
    } else {
      await installPlugin();
    }
  } else {
    await installPlugin();
  }

  // ── 步骤 4：配置模型 ────────────────────────────────────────────────────
  await cmdSetup();
}

async function installPlugin() {
  // 清理可能残留的旧插件路径配置，否则 openclaw 会因路径不存在而拒绝启动
  // 清理所有可能导致 openclaw 启动失败的残留插件配置
  const cfg = readJson(CONFIG_PATH);
  if (cfg.plugins) {
    delete cfg.plugins.load;
    delete cfg.plugins.installs;
    delete cfg.plugins.entries;
    writeJson(CONFIG_PATH, cfg);
    console.log(dim("  已清理旧插件配置"));
  }

  console.log(dim("  正在通过 OpenClaw 安装插件...\n"));
  try {
    await runCommand("openclaw", ["plugins", "install", "galaxy-opc-plugin"]);
    console.log(green("\n  ✓ 插件安装完成"));
  } catch (e) {
    console.error(red(`\n  ✗ 插件安装失败: ${e.message}`));
    console.error(gray("  请手动运行: openclaw plugins install galaxy-opc-plugin\n"));
    process.exit(1);
  }

  // better-sqlite3 是 native 模块，需要针对当前 Node.js 版本编译
  const pluginDir = path.join(STATE_DIR, "extensions", "galaxy-opc-plugin");
  if (fs.existsSync(pluginDir)) {
    console.log(dim("\n  编译原生模块（better-sqlite3）...\n"));
    try {
      await runCommand("npm", ["rebuild", "better-sqlite3", "--prefix", pluginDir]);
      console.log(green("  ✓ 原生模块编译完成"));
    } catch {
      console.log(yellow("  ! 原生模块编译失败，请手动执行:"));
      console.log(gray(`    cd ${pluginDir} && npm rebuild better-sqlite3`));
    }
  }
}

// ─── setup：配置 AI 模型 + 写入 openclaw.json ───────────────────────────────
async function cmdSetup() {
  separator();
  console.log(bold("  步骤 4 / 4  配置 AI 模型"));
  separator();

  ensureDir(STATE_DIR);
  let newConfig = readJson(CONFIG_PATH);
  let newEnv    = readEnv(ENV_PATH);

  // gateway.mode 必须设置否则无法启动
  newConfig = deepMerge(newConfig, {
    gateway: { mode: "local" },
  });

  // 清理残留的旧插件路径（由旧版向导写入，openclaw 会因路径/entry不存在报错）
  if (newConfig.plugins) {
    delete newConfig.plugins.load;
    delete newConfig.plugins.installs;
    delete newConfig.plugins.entries;
  }

  const regionIdx = await askChoice("选择 AI 模型地区", [
    { label: "国产模型", desc: "通义千问 / MiniMax / 豆包 / Kimi / DeepSeek", recommended: true },
    { label: "海外模型", desc: "OpenAI / Anthropic / OpenRouter" },
    { label: "稍后手动配置", desc: `编辑 ${CONFIG_PATH}` },
  ]);

  let defaultModel = null;

  if (regionIdx === 0) {
    const cnIdx = await askChoice("选择国产模型", [
      { label: "通义千问 Qwen",          desc: "qwen-max — 免费额度多，支持 OAuth 扫码", recommended: true },
      { label: "MiniMax",               desc: "MiniMax-M2.1 — 200K 上下文，支持 OAuth 扫码" },
      { label: "豆包 Doubao（火山引擎）", desc: "doubao-seed-1-8 / GLM-4.7 / Kimi-K2.5" },
      { label: "Kimi（Moonshot AI）",    desc: "kimi-k2.5 — 256K 上下文" },
      { label: "DeepSeek",              desc: "deepseek-chat — platform.deepseek.com" },
    ]);

    if (cnIdx === 0) {
      // Qwen OAuth or API Key
      const m = await askChoice("Qwen 登录方式", [
        { label: "OAuth 扫码登录", desc: "浏览器扫码，无需 API Key", recommended: true },
        { label: "DashScope API Key", desc: "从 dashscope.aliyun.com 获取" },
      ]);
      if (m === 0) {
        console.log(gray("\n  浏览器即将打开，扫码登录通义千问...\n"));
        const doLogin = await askYesNo("  现在执行登录？", true);
        if (doLogin) {
          try {
            await runCommand("openclaw", ["models", "auth", "login", "--provider", "qwen-portal"]);
            console.log(green("\n  ✓ Qwen OAuth 登录成功"));
          } catch {
            console.log(yellow("\n  ! 稍后可手动运行: openclaw models auth login --provider qwen-portal"));
          }
        }
        defaultModel = "qwen-portal/qwen-max";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: { primary: "qwen-portal/qwen-max" } } } });
      } else {
        const key = await ask("\n  请输入 DashScope API Key (sk-...): ");
        if (key) {
          newEnv["DASHSCOPE_API_KEY"] = key;
          defaultModel = "dashscope/qwen-plus";
          newConfig = deepMerge(newConfig, {
            models: { providers: { dashscope: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: key, api: "openai-completions", models: [{ id: "qwen-plus", name: "Qwen Plus", contextWindow: 128000, maxTokens: 8192 }] } } },
            agents: { defaults: { model: { primary: "dashscope/qwen-plus" } } },
          });
          console.log(green("  ✓ 已保存"));
        }
      }
    } else if (cnIdx === 1) {
      // MiniMax
      const m = await askChoice("MiniMax 登录方式", [
        { label: "OAuth 扫码登录", desc: "浏览器扫码，无需 API Key", recommended: true },
        { label: "API Key", desc: "从 minimaxi.com 获取" },
      ]);
      if (m === 0) {
        const doLogin = await askYesNo("  现在执行 MiniMax 登录？", true);
        if (doLogin) {
          try {
            await runCommand("openclaw", ["models", "auth", "login", "--provider", "minimax"]);
            console.log(green("\n  ✓ MiniMax OAuth 登录成功"));
          } catch {
            console.log(yellow("\n  ! 稍后可手动运行: openclaw models auth login --provider minimax"));
          }
        }
        defaultModel = "minimax/MiniMax-M2.5";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: { primary: "minimax/MiniMax-M2.5" } } } });
      } else {
        const key = await ask("\n  请输入 MiniMax API Key: ");
        if (key) {
          newEnv["MINIMAX_API_KEY"] = key;
          defaultModel = "minimax/MiniMax-M2.5";
          newConfig = deepMerge(newConfig, {
            models: { providers: { minimax: { baseUrl: "https://api.minimax.chat/v1", apiKey: key, api: "openai-completions", models: [{ id: "MiniMax-M2.5", name: "MiniMax M2.5", contextWindow: 200000, maxTokens: 16384 }] } } },
            agents: { defaults: { model: { primary: "minimax/MiniMax-M2.5" } } },
          });
          console.log(green("  ✓ 已保存"));
        }
      }
    } else if (cnIdx === 2) {
      // Doubao
      const modelIdx = await askChoice("选择豆包模型", [
        { label: "doubao-seed-1-8（推荐）", desc: "256K 上下文，支持图片", recommended: true },
        { label: "GLM-4.7",               desc: "智谱 GLM，200K 上下文" },
        { label: "Kimi-K2.5（火山版）",   desc: "256K 上下文" },
      ]);
      const modelMap = ["doubao-seed-1-8-251228", "glm-4-7-251222", "kimi-k2-5-260127"];
      const key = await ask("\n  请输入火山引擎 API Key (console.volcengine.com): ");
      if (key) {
        newEnv["VOLC_ACCESSKEY"] = key;
        defaultModel = `volcengine/${modelMap[modelIdx]}`;
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: { primary: defaultModel } } } });
        console.log(green("  ✓ 已保存"));
      }
    } else if (cnIdx === 3) {
      // Kimi
      const key = await ask("\n  请输入 Moonshot API Key (platform.moonshot.ai): ");
      if (key) {
        newEnv["MOONSHOT_API_KEY"] = key;
        defaultModel = "moonshot/moonshot-v1-8k";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: { primary: defaultModel } } } });
        console.log(green("  ✓ 已保存"));
      }
    } else {
      // DeepSeek
      const key = await ask("\n  请输入 DeepSeek API Key (platform.deepseek.com): ");
      if (key) {
        newEnv["DEEPSEEK_API_KEY"] = key;
        defaultModel = "deepseek/deepseek-chat";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: { primary: defaultModel } } } });
        console.log(green("  ✓ 已保存"));
      }
    }

  } else if (regionIdx === 1) {
    const intlIdx = await askChoice("选择海外模型", [
      { label: "OpenAI",     desc: "gpt-4o-mini", recommended: true },
      { label: "Anthropic",  desc: "claude-3-5-haiku-latest" },
      { label: "OpenRouter", desc: "聚合多家，一个 Key — openrouter.ai" },
    ]);
    const cfgs = [
      { env: "OPENAI_API_KEY",     model: "openai/gpt-4o-mini",             prompt: "OpenAI API Key (sk-...)" },
      { env: "ANTHROPIC_API_KEY",  model: "anthropic/claude-3-5-haiku-latest", prompt: "Anthropic API Key (sk-ant-...)" },
      { env: "OPENROUTER_API_KEY", model: "openrouter/openai/gpt-4o-mini",  prompt: "OpenRouter API Key (sk-or-...)" },
    ];
    const cfg = cfgs[intlIdx];
    const key = await ask(`\n  请输入 ${cfg.prompt}: `);
    if (key) {
      newEnv[cfg.env] = key;
      defaultModel = cfg.model;
      newConfig = deepMerge(newConfig, { agents: { defaults: { model: { primary: defaultModel } } } });
      console.log(green("  ✓ 已保存"));
    }
  } else {
    console.log(yellow(`\n  已跳过，稍后手动编辑: ${gray(CONFIG_PATH)}`));
  }

  // Gateway Token — 写入 openclaw.json（openclaw 从这里读取鉴权 token）
  const existingToken = newConfig.gateway?.auth?.token;
  const gatewayToken = (existingToken && existingToken !== "change-me-to-a-long-random-token")
    ? existingToken
    : crypto.randomBytes(16).toString("hex");
  newConfig = deepMerge(newConfig, {
    gateway: { auth: { mode: "token", token: gatewayToken } },
  });
  if (!existingToken || existingToken === "change-me-to-a-long-random-token") {
    console.log(green("\n  ✓ 已自动生成 Gateway 访问令牌"));
  }

  writeJson(CONFIG_PATH, newConfig);
  writeEnv(ENV_PATH, newEnv);

  // ── 完成 ──────────────────────────────────────────────────────────────────
  separator("═");
  console.log(`
  ${bold(green("安装完成！"))}

  ${bold("启动命令:")}
    ${cyan("openclaw gateway")}

  ${bold("启动后访问:")}
    对话界面:  ${cyan("http://localhost:18789")}
    管理后台:  ${cyan(`http://localhost:18789/opc/admin?token=${gatewayToken}`)}

  ${bold("后台驻守（开机自启）:")}
    ${cyan("openclaw onboard --install-daemon")}

  ${dim("提示：插件在 gateway 启动时自动加载，无需额外操作。")}
`);
  if (defaultModel) console.log(`  当前模型: ${cyan(defaultModel)}\n`);
  separator("═");
}

// ─── start 命令 ──────────────────────────────────────────────────────────────
async function cmdStart() {
  const ocVersion = getOpenclawVersion();
  if (!ocVersion) {
    console.error(red("\n  ✗ 未找到 openclaw，请先运行 npx galaxy-opc\n"));
    process.exit(1);
  }
  console.log(cyan("\n  启动星环 Galaxy OPC...\n"));
  await runCommand("openclaw", ["gateway"]);
}
