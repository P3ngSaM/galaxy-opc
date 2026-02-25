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

const PLUGIN_REPO_GITHUB = "https://github.com/P3ngSaM/galaxy-opc.git";
const PLUGIN_REPO_GITEE  = "https://gitee.com/peng-sam/galaxy-opc.git";
const PLUGIN_DIR_NAME    = "opc-platform";

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

// 检测国内网络，自动选择 Gitee 或 GitHub
async function detectRepoUrl() {
  return new Promise((resolve) => {
    const req = spawn("git", ["ls-remote", "--exit-code", "--heads", PLUGIN_REPO_GITHUB, "main"], {
      stdio: "ignore", timeout: 5000,
    });
    const timer = setTimeout(() => { req.kill(); resolve(PLUGIN_REPO_GITEE); }, 5000);
    req.on("close", (code) => { clearTimeout(timer); resolve(code === 0 ? PLUGIN_REPO_GITHUB : PLUGIN_REPO_GITEE); });
    req.on("error", () => { clearTimeout(timer); resolve(PLUGIN_REPO_GITEE); });
  });
}

// ─── 路径常量 ───────────────────────────────────────────────────────────────
const HOME       = os.homedir();
const STATE_DIR  = path.join(HOME, ".openclaw");
const CONFIG_PATH = path.join(STATE_DIR, "openclaw.json");
const ENV_PATH   = path.join(STATE_DIR, ".env");
// 插件存放在 ~/.openclaw/extensions/opc-platform
const PLUGIN_INSTALL_DIR = path.join(STATE_DIR, "extensions", PLUGIN_DIR_NAME);

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

  if (!checkTool("git")) {
    console.error(red("\n  ✗ 未检测到 git，请先安装: https://git-scm.com/\n"));
    process.exit(1);
  }
  console.log(green("  ✓ git 已安装"));

  // ── 步骤 2：安装 openclaw ────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 2 / 4  安装 OpenClaw 核心"));
  separator();

  const ocVersion = getOpenclawVersion();
  if (ocVersion) {
    console.log(green(`  ✓ OpenClaw 已安装 (${ocVersion})`));
  } else {
    console.log(dim("  正在安装 OpenClaw（官方核心，约 10MB）...\n"));
    try {
      await runCommand("npm", ["install", "-g", "openclaw@latest"]);
      console.log(green("\n  ✓ OpenClaw 安装完成"));
    } catch {
      console.error(red("\n  ✗ OpenClaw 安装失败，请手动运行:"));
      console.error(gray("    npm install -g openclaw@latest\n"));
      process.exit(1);
    }
  }

  // ── 步骤 3：安装 OPC 插件 ────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 3 / 4  安装 OPC Platform 插件"));
  separator();

  if (fs.existsSync(PLUGIN_INSTALL_DIR)) {
    console.log(yellow(`  检测到插件已存在: ${PLUGIN_INSTALL_DIR}`));
    const update = await askYesNo("  更新到最新版本？", true);
    if (!update) {
      console.log(green("  ✓ 跳过，使用现有版本"));
    } else {
      await downloadPlugin();
    }
  } else {
    await downloadPlugin();
  }

  // 安装插件依赖
  console.log(dim("\n  安装插件依赖...\n"));
  try {
    await runCommand("npm", ["install", "--prefix", PLUGIN_INSTALL_DIR, "--omit=dev"]);
    console.log(green("  ✓ 插件依赖安装完成"));
  } catch {
    console.log(yellow("  ! 插件依赖安装失败，部分功能可能受影响"));
  }

  // ── 步骤 4：配置模型 ────────────────────────────────────────────────────
  await cmdSetup();
}

async function downloadPlugin() {
  const tmpDir = path.join(os.tmpdir(), `galaxy-opc-${Date.now()}`);

  console.log(dim("  检测网络，选择最快下载源..."));
  const repoUrl = await detectRepoUrl();
  const source = repoUrl.includes("gitee") ? "Gitee（国内加速）" : "GitHub";
  console.log(green(`  ✓ 使用 ${source}`));
  console.log(dim("  正在下载插件...\n"));

  try {
    await runCommand("git", ["clone", "--depth", "1", repoUrl, tmpDir]);
  } catch (e) {
    console.error(red(`\n  ✗ 下载失败: ${e.message}`));
    process.exit(1);
  }

  // 把 extensions/opc-platform 复制到 ~/.openclaw/extensions/opc-platform
  const srcPlugin = path.join(tmpDir, "extensions", PLUGIN_DIR_NAME);
  if (!fs.existsSync(srcPlugin)) {
    console.error(red(`\n  ✗ 插件目录不存在: ${srcPlugin}`));
    process.exit(1);
  }

  ensureDir(path.join(STATE_DIR, "extensions"));
  if (fs.existsSync(PLUGIN_INSTALL_DIR)) {
    fs.rmSync(PLUGIN_INSTALL_DIR, { recursive: true, force: true });
  }
  fs.cpSync(srcPlugin, PLUGIN_INSTALL_DIR, { recursive: true,
    filter: (src) => !src.includes("node_modules") && !src.includes(".git"),
  });

  // 清理临时目录
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(green(`  ✓ 插件已安装到 ${PLUGIN_INSTALL_DIR}`));
}

// ─── setup：配置 AI 模型 + 写入 openclaw.json ───────────────────────────────
async function cmdSetup() {
  separator();
  console.log(bold("  步骤 4 / 4  配置 AI 模型"));
  separator();

  ensureDir(STATE_DIR);
  let newConfig = readJson(CONFIG_PATH);
  let newEnv    = readEnv(ENV_PATH);

  // 注册插件路径（plugins.load.paths 是 openclaw 识别的正确 key）
  const existingPaths = newConfig.plugins?.load?.paths ?? [];
  const mergedPaths = Array.from(new Set([...existingPaths, PLUGIN_INSTALL_DIR]));
  newConfig = deepMerge(newConfig, {
    plugins: { load: { paths: mergedPaths } },
  });

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
        defaultModel = "qwen-max";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "qwen-max", provider: "qwen-portal" } } });
      } else {
        const key = await ask("\n  请输入 DashScope API Key (sk-...): ");
        if (key) { newEnv["DASHSCOPE_API_KEY"] = key; defaultModel = "qwen-plus"; newConfig = deepMerge(newConfig, { agents: { defaults: { model: "qwen-plus" } } }); console.log(green("  ✓ 已保存")); }
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
        defaultModel = "MiniMax-M2.1";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "MiniMax-M2.1", provider: "minimax" } } });
      } else {
        const key = await ask("\n  请输入 MiniMax API Key: ");
        if (key) { newEnv["MINIMAX_API_KEY"] = key; defaultModel = "MiniMax-M2.1"; newConfig = deepMerge(newConfig, { agents: { defaults: { model: "MiniMax-M2.1" } } }); console.log(green("  ✓ 已保存")); }
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
      if (key) { newEnv["VOLC_ACCESSKEY"] = key; defaultModel = modelMap[modelIdx]; newConfig = deepMerge(newConfig, { agents: { defaults: { model: defaultModel } } }); console.log(green("  ✓ 已保存")); }
    } else if (cnIdx === 3) {
      // Kimi
      const key = await ask("\n  请输入 Moonshot API Key (platform.moonshot.ai): ");
      if (key) { newEnv["MOONSHOT_API_KEY"] = key; defaultModel = "kimi-k2.5"; newConfig = deepMerge(newConfig, { agents: { defaults: { model: "kimi-k2.5" } } }); console.log(green("  ✓ 已保存")); }
    } else {
      // DeepSeek
      const key = await ask("\n  请输入 DeepSeek API Key (platform.deepseek.com): ");
      if (key) { newEnv["DEEPSEEK_API_KEY"] = key; defaultModel = "deepseek-chat"; newConfig = deepMerge(newConfig, { agents: { defaults: { model: "deepseek-chat" } } }); console.log(green("  ✓ 已保存")); }
    }

  } else if (regionIdx === 1) {
    const intlIdx = await askChoice("选择海外模型", [
      { label: "OpenAI",     desc: "gpt-4o-mini", recommended: true },
      { label: "Anthropic",  desc: "claude-3-5-haiku-latest" },
      { label: "OpenRouter", desc: "聚合多家，一个 Key — openrouter.ai" },
    ]);
    const cfgs = [
      { env: "OPENAI_API_KEY",     model: "gpt-4o-mini",              prompt: "OpenAI API Key (sk-...)" },
      { env: "ANTHROPIC_API_KEY",  model: "claude-3-5-haiku-latest",  prompt: "Anthropic API Key (sk-ant-...)" },
      { env: "OPENROUTER_API_KEY", model: "openai/gpt-4o-mini",       prompt: "OpenRouter API Key (sk-or-...)" },
    ];
    const cfg = cfgs[intlIdx];
    const key = await ask(`\n  请输入 ${cfg.prompt}: `);
    if (key) { newEnv[cfg.env] = key; defaultModel = cfg.model; newConfig = deepMerge(newConfig, { agents: { defaults: { model: defaultModel } } }); console.log(green("  ✓ 已保存")); }
  } else {
    console.log(yellow(`\n  已跳过，稍后手动编辑: ${gray(CONFIG_PATH)}`));
  }

  // Gateway Token
  if (!newEnv["OPENCLAW_GATEWAY_TOKEN"] || newEnv["OPENCLAW_GATEWAY_TOKEN"] === "change-me-to-a-long-random-token") {
    newEnv["OPENCLAW_GATEWAY_TOKEN"] = crypto.randomBytes(32).toString("hex");
    console.log(green("\n  ✓ 已自动生成 Gateway 访问令牌"));
  }

  writeJson(CONFIG_PATH, newConfig);
  writeEnv(ENV_PATH, newEnv);

  // ── 完成 ──────────────────────────────────────────────────────────────────
  separator("═");
  console.log(`
  ${bold(green("安装完成！"))}

  启动命令:
    ${cyan("openclaw gateway")}

  管理后台:
    ${cyan("http://localhost:18789/opc/admin")}

  后台驻守（开机自启）:
    ${cyan("openclaw onboard --install-daemon")}
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
