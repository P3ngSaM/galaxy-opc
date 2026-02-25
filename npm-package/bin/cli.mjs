#!/usr/bin/env node
/**
 * 星环 Galaxy OPC — CLI 入口
 * 用法:
 *   npx galaxy-opc          # 安装并初始化
 *   galaxy-opc              # 全局安装后运行
 *   galaxy-opc setup        # 重新运行配置向导
 *   galaxy-opc start        # 启动服务
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { execSync, spawn } from "node:child_process";
import crypto from "node:crypto";

const REPO_GITHUB = "https://github.com/P3ngSaM/galaxy-opc.git";
const REPO_GITEE  = "https://gitee.com/peng-sam/galaxy-opc.git";
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), "galaxy-opc");

// 检测是否在国内网络（ping github 超时则走 Gitee）
async function detectRepoUrl() {
  return new Promise((resolve) => {
    const req = spawn("git", ["ls-remote", "--exit-code", "--heads", REPO_GITHUB, "main"], {
      stdio: "ignore",
      timeout: 6000,
    });
    const timer = setTimeout(() => { req.kill(); resolve(REPO_GITEE); }, 6000);
    req.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? REPO_GITHUB : REPO_GITEE);
    });
    req.on("error", () => { clearTimeout(timer); resolve(REPO_GITEE); });
  });
}

// ─── 颜色工具 ───────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
  red: "\x1b[31m", gray: "\x1b[90m",
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
    const proc = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
    proc.on("error", reject);
  });
}

function checkTool(cmd) {
  try { execSync(`${cmd} --version`, { stdio: "ignore" }); return true; } catch { return false; }
}

// ─── 环境检查 ───────────────────────────────────────────────────────────────
function checkNodeVersion() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 22) {
    console.error(red(`\n  需要 Node.js >= 22，当前版本 v${process.versions.node}`));
    console.error(gray("  下载: https://nodejs.org/\n"));
    process.exit(1);
  }
}

// ─── 命令路由 ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || "install";

if (command === "start") {
  await cmdStart();
} else if (command === "setup") {
  const installDir = await findInstallDir();
  await cmdSetup(installDir);
} else {
  // 默认：install + setup
  await cmdInstall();
}

rl.close();

// ─── install 命令：下载项目 + 运行 setup ────────────────────────────────────
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
  console.log(bold("  步骤 1 / 5  环境检查"));
  separator();

  checkNodeVersion();
  console.log(green(`  ✓ Node.js v${process.versions.node}`));

  if (!checkTool("git")) {
    console.error(red("\n  ✗ 未检测到 git，请先安装: https://git-scm.com/\n"));
    process.exit(1);
  }
  console.log(green("  ✓ git 已安装"));

  if (!checkTool("pnpm")) {
    console.log(yellow("  ! pnpm 未安装，正在自动安装..."));
    execSync("npm install -g pnpm", { stdio: "inherit" });
    console.log(green("  ✓ pnpm 安装完成"));
  } else {
    console.log(green("  ✓ pnpm 已安装"));
  }

  // ── 步骤 2：选择安装目录 ────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 2 / 5  选择安装目录"));
  separator();
  console.log(gray(`  默认目录: ${DEFAULT_INSTALL_DIR}`));
  const dirInput = await ask(`  安装到哪里？${gray("（直接回车使用默认）")}: `);
  const installDir = dirInput || DEFAULT_INSTALL_DIR;

  if (fs.existsSync(path.join(installDir, "openclaw"))) {
    console.log(yellow(`\n  检测到 ${installDir} 已存在项目文件`));
    const skip = await askYesNo("  跳过下载，直接进入配置？", true);
    if (skip) {
      await cmdSetup(installDir);
      return;
    }
  }

  // ── 步骤 3：下载项目 ────────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 3 / 5  下载项目"));
  separator();

  console.log(dim("  检测网络，自动选择最快下载源..."));
  const repoUrl = await detectRepoUrl();
  const repoSource = repoUrl.includes("gitee") ? "Gitee（国内加速）" : "GitHub";
  console.log(green(`  ✓ 使用 ${repoSource}`));
  console.log(dim(`  正在下载...\n`));

  ensureDir(installDir);
  try {
    await runCommand("git", ["clone", "--depth", "1", repoUrl, installDir]);
  } catch {
    // 目录非空时用 pull
    try {
      await runCommand("git", ["-C", installDir, "pull", "--depth", "1"]);
    } catch (e) {
      console.error(red(`\n  ✗ 下载失败: ${e.message}`));
      process.exit(1);
    }
  }
  console.log(green("\n  ✓ 项目下载完成"));

  // ── 步骤 4：安装依赖 ────────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 4 / 5  安装依赖"));
  separator();
  console.log(dim("  运行 pnpm install ...\n"));
  await runCommand("pnpm", ["install"], { cwd: path.join(installDir, "openclaw") });
  console.log(green("\n  ✓ 依赖安装完成"));

  // ── 步骤 5：配置模型 ────────────────────────────────────────────────────
  await cmdSetup(installDir);
}

// ─── setup 命令：配置 AI 模型 + 写入配置文件 ────────────────────────────────
async function cmdSetup(installDir) {
  const HOME = os.homedir();
  const STATE_DIR = path.join(HOME, ".openclaw");
  const CONFIG_PATH = path.join(STATE_DIR, "openclaw.json");
  const ENV_PATH = path.join(STATE_DIR, ".env");
  const OPENCLAW_DIR = path.join(installDir, "openclaw");

  separator();
  console.log(bold("  步骤 5 / 5  配置 AI 模型"));
  separator();

  ensureDir(STATE_DIR);
  let newConfig = readJson(CONFIG_PATH);
  let newEnv = readEnv(ENV_PATH);

  // 一级：国产 / 海外 / 跳过
  const regionIdx = await askChoice("选择 AI 模型地区", [
    { label: "国产模型", desc: "通义千问 / MiniMax / 豆包 / Kimi / 百度千帆 / DeepSeek", recommended: true },
    { label: "海外模型", desc: "OpenAI / Anthropic / OpenRouter" },
    { label: "稍后手动配置", desc: `编辑 ${CONFIG_PATH}` },
  ]);

  let defaultModel = null;

  if (regionIdx === 0) {
    const cnIdx = await askChoice("选择国产模型服务商", [
      { label: "通义千问 Qwen",      desc: "qwen-max / qwen-plus — 免费额度多，支持 OAuth 扫码", recommended: true },
      { label: "MiniMax",            desc: "MiniMax-M2.1 — 200K 上下文，支持 OAuth 扫码" },
      { label: "豆包 Doubao（火山引擎）", desc: "doubao-seed-1-8 / GLM-4.7 / Kimi-K2.5" },
      { label: "Kimi（Moonshot AI）", desc: "kimi-k2.5 — 256K 上下文" },
    ]);

    if (cnIdx === 0) {
      const m = await askChoice("Qwen 登录方式", [
        { label: "OAuth 扫码登录", desc: "浏览器扫码，无需 API Key", recommended: true },
        { label: "DashScope API Key", desc: "从 dashscope.aliyun.com 获取" },
      ]);
      if (m === 0) {
        console.log(gray("\n  浏览器即将打开，扫码登录通义千问...\n"));
        const doLogin = await askYesNo("  现在执行登录？", true);
        if (doLogin) {
          try {
            await runCommand("node", [path.join(OPENCLAW_DIR, "openclaw.mjs"), "models", "auth", "login", "--provider", "qwen-portal"], { cwd: OPENCLAW_DIR });
            console.log(green("\n  ✓ Qwen OAuth 登录成功"));
          } catch {
            console.log(yellow("\n  ! 登录失败，稍后可手动运行:"));
            console.log(gray(`    node ${path.join(OPENCLAW_DIR, "openclaw.mjs")} models auth login --provider qwen-portal`));
          }
        }
        defaultModel = "qwen-max";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "qwen-max", provider: "qwen-portal" } } });
      } else {
        const key = await ask("\n  请输入 DashScope API Key (sk-...): ");
        if (key) { newEnv["DASHSCOPE_API_KEY"] = key; defaultModel = "qwen-plus"; newConfig = deepMerge(newConfig, { agents: { defaults: { model: "qwen-plus" } } }); console.log(green("  ✓ 已保存")); }
      }
    } else if (cnIdx === 1) {
      const m = await askChoice("MiniMax 登录方式", [
        { label: "OAuth 扫码登录", desc: "浏览器扫码，无需 API Key", recommended: true },
        { label: "API Key", desc: "从 minimaxi.com 获取" },
      ]);
      if (m === 0) {
        const doLogin = await askYesNo("  现在执行 MiniMax 登录？", true);
        if (doLogin) {
          try {
            await runCommand("node", [path.join(OPENCLAW_DIR, "openclaw.mjs"), "models", "auth", "login", "--provider", "minimax"], { cwd: OPENCLAW_DIR });
            console.log(green("\n  ✓ MiniMax OAuth 登录成功"));
          } catch {
            console.log(yellow("\n  ! 登录失败，稍后可手动运行:"));
            console.log(gray(`    node ${path.join(OPENCLAW_DIR, "openclaw.mjs")} models auth login --provider minimax`));
          }
        }
        defaultModel = "MiniMax-M2.1";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "MiniMax-M2.1", provider: "minimax" } } });
      } else {
        const key = await ask("\n  请输入 MiniMax API Key: ");
        if (key) { newEnv["MINIMAX_API_KEY"] = key; defaultModel = "MiniMax-M2.1"; newConfig = deepMerge(newConfig, { agents: { defaults: { model: "MiniMax-M2.1" } } }); console.log(green("  ✓ 已保存")); }
      }
    } else if (cnIdx === 2) {
      const modelIdx = await askChoice("选择豆包模型", [
        { label: "doubao-seed-1-8（推荐）", desc: "256K 上下文，支持图片", recommended: true },
        { label: "GLM-4.7",               desc: "智谱 GLM，200K 上下文" },
        { label: "Kimi-K2.5（火山版）",   desc: "256K 上下文" },
      ]);
      const modelMap = ["doubao-seed-1-8-251228", "glm-4-7-251222", "kimi-k2-5-260127"];
      const key = await ask("\n  请输入火山引擎 API Key (从 console.volcengine.com 获取): ");
      if (key) { newEnv["VOLC_ACCESSKEY"] = key; defaultModel = modelMap[modelIdx]; newConfig = deepMerge(newConfig, { agents: { defaults: { model: defaultModel } } }); console.log(green("  ✓ 已保存")); }
    } else {
      const key = await ask("\n  请输入 Moonshot API Key (从 platform.moonshot.ai 获取): ");
      if (key) { newEnv["MOONSHOT_API_KEY"] = key; defaultModel = "kimi-k2.5"; newConfig = deepMerge(newConfig, { agents: { defaults: { model: "kimi-k2.5" } } }); console.log(green("  ✓ 已保存")); }
    }

    // 附加备用
    const addExtra = await askYesNo("\n  是否额外配置备用模型（DeepSeek / 百度千帆）？", false);
    if (addExtra) {
      const extraIdx = await askChoice("选择备用模型", [
        { label: "DeepSeek",   desc: "deepseek-chat — platform.deepseek.com" },
        { label: "百度千帆",   desc: "deepseek-v3 / ERNIE — qianfan.baidu.com" },
      ]);
      const key = await ask(`  请输入 ${extraIdx === 0 ? "DeepSeek" : "百度千帆"} API Key: `);
      if (key) { newEnv[extraIdx === 0 ? "DEEPSEEK_API_KEY" : "QIANFAN_API_KEY"] = key; console.log(green("  ✓ 已保存")); }
    }
  } else if (regionIdx === 1) {
    const intlIdx = await askChoice("选择海外模型", [
      { label: "OpenAI",     desc: "gpt-4o-mini", recommended: true },
      { label: "Anthropic",  desc: "claude-3-5-haiku-latest" },
      { label: "OpenRouter", desc: "聚合多家，一个 Key — openrouter.ai" },
    ]);
    const prompts = ["OpenAI API Key (sk-...)", "Anthropic API Key (sk-ant-...)", "OpenRouter API Key (sk-or-...)"];
    const envKeys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"];
    const models  = ["gpt-4o-mini", "claude-3-5-haiku-latest", "openai/gpt-4o-mini"];
    const key = await ask(`\n  请输入 ${prompts[intlIdx]}: `);
    if (key) { newEnv[envKeys[intlIdx]] = key; defaultModel = models[intlIdx]; newConfig = deepMerge(newConfig, { agents: { defaults: { model: defaultModel } } }); console.log(green("  ✓ 已保存")); }
  } else {
    console.log(yellow(`\n  已跳过，稍后手动编辑: ${gray(CONFIG_PATH)}`));
  }

  // Gateway Token + 插件路径
  if (!newEnv["OPENCLAW_GATEWAY_TOKEN"] || newEnv["OPENCLAW_GATEWAY_TOKEN"] === "change-me-to-a-long-random-token") {
    newEnv["OPENCLAW_GATEWAY_TOKEN"] = crypto.randomBytes(32).toString("hex");
    console.log(green("\n  ✓ 已自动生成 Gateway 访问令牌"));
  }

  newConfig = deepMerge(newConfig, {
    plugins: { load: { dirs: [path.join(OPENCLAW_DIR, "extensions", "opc-platform")] } },
  });

  writeJson(CONFIG_PATH, newConfig);
  writeEnv(ENV_PATH, newEnv);

  // ── 完成提示 ──────────────────────────────────────────────────────────────
  separator("═");
  console.log(`
  ${bold(green("安装完成！"))}

  启动命令:
    ${cyan(`cd ${path.join(installDir, "openclaw")} && npm start`)}

  管理后台:
    ${cyan("http://localhost:18789/opc/admin")}
`);
  if (defaultModel) console.log(`  当前模型: ${cyan(defaultModel)}\n`);
  separator("═");
}

// ─── start 命令 ──────────────────────────────────────────────────────────────
async function cmdStart() {
  const installDir = await findInstallDir();
  const openclawDir = path.join(installDir, "openclaw");
  if (!fs.existsSync(openclawDir)) {
    console.error(red("\n  ✗ 未找到项目，请先运行 npx galaxy-opc\n"));
    process.exit(1);
  }
  console.log(cyan("\n  启动星环 Galaxy OPC...\n"));
  await runCommand("node", ["scripts/run-node.mjs"], { cwd: openclawDir });
}

async function findInstallDir() {
  // 优先检查常见位置
  for (const dir of [DEFAULT_INSTALL_DIR, process.cwd()]) {
    if (fs.existsSync(path.join(dir, "openclaw"))) return dir;
  }
  const ans = await ask(`  请输入安装目录 ${gray(`(默认 ${DEFAULT_INSTALL_DIR})`)}: `);
  return ans || DEFAULT_INSTALL_DIR;
}
