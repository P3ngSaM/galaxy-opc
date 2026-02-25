#!/usr/bin/env node
/**
 * 星环 Galaxy OPC — 首次启动配置向导
 * 用法: node setup.mjs
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { execSync, spawn } from "node:child_process";
import crypto from "node:crypto";

// ─── 颜色工具 ───────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};
const bold = (s) => `${c.bold}${s}${c.reset}`;
const cyan = (s) => `${c.cyan}${s}${c.reset}`;
const green = (s) => `${c.green}${s}${c.reset}`;
const yellow = (s) => `${c.yellow}${s}${c.reset}`;
const red = (s) => `${c.red}${s}${c.reset}`;
const gray = (s) => `${c.gray}${s}${c.reset}`;
const dim = (s) => `${c.dim}${s}${c.reset}`;

// ─── readline 工具 ──────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

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

// ─── 路径常量 ───────────────────────────────────────────────────────────────
const HOME = os.homedir();
const STATE_DIR = path.join(HOME, ".openclaw");
const CONFIG_PATH = path.join(STATE_DIR, "openclaw.json");
const ENV_PATH = path.join(STATE_DIR, ".env");
const OPENCLAW_DIR = path.join(import.meta.dirname, "openclaw");

// ─── 工具函数 ───────────────────────────────────────────────────────────────
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function readEnv(p) {
  if (!fs.existsSync(p)) return {};
  const lines = fs.readFileSync(p, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
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

function separator(char = "─", len = 60) {
  console.log(gray(char.repeat(len)));
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

function checkPnpm() {
  try {
    execSync("pnpm --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkGit() {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit", ...options });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`命令退出码 ${code}: ${cmd} ${args.join(" ")}`));
    });
    proc.on("error", reject);
  });
}

// ─── 主流程 ─────────────────────────────────────────────────────────────────
async function main() {
  // 封面
  console.clear();
  console.log(`
${bold(cyan("  ╔══════════════════════════════════════════════╗"))}
${bold(cyan("  ║"))}  ${bold("星环 Galaxy OPC")}  — 首次配置向导               ${bold(cyan("║"))}
${bold(cyan("  ║"))}  ${dim("一人公司孵化与赋能平台")}                         ${bold(cyan("║"))}
${bold(cyan("  ╚══════════════════════════════════════════════╝"))}
`);

  // ── 步骤 1：环境检查 ──────────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 1 / 4  环境检查"));
  separator();

  checkNodeVersion();
  console.log(green(`  ✓ Node.js v${process.versions.node}`));

  const hasPnpm = checkPnpm();
  if (!hasPnpm) {
    console.log(yellow("  ! pnpm 未安装，正在自动安装..."));
    try {
      execSync("npm install -g pnpm", { stdio: "inherit" });
      console.log(green("  ✓ pnpm 安装完成"));
    } catch {
      console.error(red("  ✗ pnpm 安装失败，请手动执行: npm install -g pnpm"));
      process.exit(1);
    }
  } else {
    console.log(green("  ✓ pnpm 已安装"));
  }

  const hasGit = checkGit();
  if (!hasGit) {
    console.log(yellow("  ! git 未检测到 (GitHub 安装 Skills 功能将不可用)"));
  } else {
    console.log(green("  ✓ git 已安装"));
  }

  if (!fs.existsSync(OPENCLAW_DIR)) {
    console.error(red(`\n  ✗ 找不到 openclaw/ 目录`));
    console.error(gray(`  预期位置: ${OPENCLAW_DIR}`));
    console.error(gray("  请确保在项目根目录运行此脚本\n"));
    process.exit(1);
  }
  console.log(green("  ✓ openclaw/ 目录存在"));

  // ── 步骤 2：安装依赖 ──────────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 2 / 4  安装项目依赖"));
  separator();

  const nodeModulesExists = fs.existsSync(path.join(OPENCLAW_DIR, "node_modules"));
  if (nodeModulesExists) {
    const skip = await askYesNo("  检测到 node_modules 已存在，跳过安装？", true);
    if (!skip) {
      console.log(dim("\n  运行 pnpm install ...\n"));
      await runCommand("pnpm", ["install"], { cwd: OPENCLAW_DIR });
    } else {
      console.log(green("  ✓ 跳过安装"));
    }
  } else {
    console.log(dim("\n  运行 pnpm install ...\n"));
    await runCommand("pnpm", ["install"], { cwd: OPENCLAW_DIR });
  }
  console.log(green("\n  ✓ 依赖安装完成"));

  // ── 步骤 3：AI 模型配置 ───────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 3 / 4  配置 AI 模型"));
  separator();

  // 读取已有配置
  ensureDir(STATE_DIR);
  const existingConfig = readJson(CONFIG_PATH);
  const existingEnv = readEnv(ENV_PATH);

  // 一级菜单：国产 vs 海外 vs 跳过
  const regionIdx = await askChoice("选择 AI 模型地区", [
    { label: "国产模型", desc: "通义千问 / MiniMax / 豆包 / Kimi / 百度千帆 / DeepSeek", recommended: true },
    { label: "海外模型", desc: "OpenAI / Anthropic / OpenRouter" },
    { label: "稍后手动配置", desc: `手动编辑 ${CONFIG_PATH}` },
  ]);

  let modelProvider = null;
  let defaultModel = null;
  let newEnv = { ...existingEnv };
  let newConfig = { ...existingConfig };

  if (regionIdx === 0) {
    // ── 国产模型 ──────────────────────────────────────────────────────────────
    const cnIdx = await askChoice("选择国产模型服务商", [
      { label: "通义千问 Qwen", desc: "qwen-max / qwen-plus — 免费额度多，支持 OAuth 扫码", recommended: true },
      { label: "MiniMax", desc: "MiniMax-M2.1 — 200K 上下文，支持 OAuth 扫码" },
      { label: "豆包 Doubao（火山引擎）", desc: "doubao-seed-1-8 / GLM-4.7 / Kimi-K2.5" },
      { label: "Kimi（Moonshot AI）", desc: "kimi-k2.5 — 256K 上下文" },
    ]);

    if (cnIdx === 0) {
      // Qwen
      modelProvider = "qwen-portal";
      const loginMethod = await askChoice("Qwen 登录方式", [
        { label: "OAuth 扫码登录", desc: "浏览器扫码，无需 API Key", recommended: true },
        { label: "DashScope API Key", desc: "从 dashscope.aliyun.com 获取" },
      ]);
      if (loginMethod === 0) {
        console.log(`\n  ${yellow("即将运行:")} ${cyan("openclaw models auth login --provider qwen-portal")}`);
        console.log(gray("  浏览器会自动打开，扫码登录通义千问账号...\n"));
        const doLogin = await askYesNo("  现在执行登录？", true);
        if (doLogin) {
          try {
            await runCommand(
              "node",
              [path.join(OPENCLAW_DIR, "openclaw.mjs"), "models", "auth", "login", "--provider", "qwen-portal"],
              { cwd: OPENCLAW_DIR },
            );
            console.log(green("\n  ✓ Qwen OAuth 登录成功"));
          } catch {
            console.log(yellow("\n  ! 登录失败，稍后可手动运行:"));
            console.log(gray("    node openclaw/openclaw.mjs models auth login --provider qwen-portal"));
          }
        }
        defaultModel = "qwen-max";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "qwen-max", provider: "qwen-portal" } } });
      } else {
        const apiKey = await ask("\n  请输入 DashScope API Key (sk-...): ");
        if (apiKey) {
          newEnv["DASHSCOPE_API_KEY"] = apiKey;
          defaultModel = "qwen-plus";
          newConfig = deepMerge(newConfig, { agents: { defaults: { model: "qwen-plus" } } });
          console.log(green("  ✓ API Key 已保存"));
        }
      }
    } else if (cnIdx === 1) {
      // MiniMax
      modelProvider = "minimax";
      const loginMethod = await askChoice("MiniMax 登录方式", [
        { label: "OAuth 扫码登录", desc: "浏览器扫码，无需 API Key", recommended: true },
        { label: "API Key", desc: "从 minimaxi.com 获取" },
      ]);
      if (loginMethod === 0) {
        console.log(`\n  ${yellow("即将运行:")} ${cyan("openclaw models auth login --provider minimax")}`);
        console.log(gray("  浏览器会自动打开，完成 MiniMax 登录...\n"));
        const doLogin = await askYesNo("  现在执行登录？", true);
        if (doLogin) {
          try {
            await runCommand(
              "node",
              [path.join(OPENCLAW_DIR, "openclaw.mjs"), "models", "auth", "login", "--provider", "minimax"],
              { cwd: OPENCLAW_DIR },
            );
            console.log(green("\n  ✓ MiniMax OAuth 登录成功"));
          } catch {
            console.log(yellow("\n  ! 登录失败，稍后可手动运行:"));
            console.log(gray("    node openclaw/openclaw.mjs models auth login --provider minimax"));
          }
        }
        defaultModel = "MiniMax-M2.1";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "MiniMax-M2.1", provider: "minimax" } } });
      } else {
        const apiKey = await ask("\n  请输入 MiniMax API Key: ");
        if (apiKey) {
          newEnv["MINIMAX_API_KEY"] = apiKey;
          defaultModel = "MiniMax-M2.1";
          newConfig = deepMerge(newConfig, { agents: { defaults: { model: "MiniMax-M2.1" } } });
          console.log(green("  ✓ API Key 已保存"));
        }
      }
    } else if (cnIdx === 2) {
      // Doubao / 火山引擎
      modelProvider = "volcengine";
      const modelChoice = await askChoice("选择豆包模型", [
        { label: "doubao-seed-1-8（推荐）", desc: "256K 上下文，支持图片", recommended: true },
        { label: "GLM-4.7", desc: "智谱 GLM，200K 上下文" },
        { label: "Kimi-K2.5（火山版）", desc: "256K 上下文" },
      ]);
      const modelMap = ["doubao-seed-1-8-251228", "glm-4-7-251222", "kimi-k2-5-260127"];
      const apiKey = await ask("\n  请输入火山引擎 API Key (从 console.volcengine.com 获取): ");
      if (apiKey) {
        newEnv["VOLC_ACCESSKEY"] = apiKey;
        defaultModel = modelMap[modelChoice];
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: defaultModel } } });
        console.log(green("  ✓ API Key 已保存"));
      }
    } else if (cnIdx === 3) {
      // Kimi / Moonshot
      modelProvider = "moonshot";
      console.log(gray("\n  获取 API Key: https://platform.moonshot.ai/console/api-keys"));
      const apiKey = await ask("  请输入 Moonshot API Key: ");
      if (apiKey) {
        newEnv["MOONSHOT_API_KEY"] = apiKey;
        defaultModel = "kimi-k2.5";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "kimi-k2.5" } } });
        console.log(green("  ✓ API Key 已保存"));
      }
    }

    // 附加：是否也配置 DeepSeek / 百度千帆
    const addExtra = await askYesNo("\n  是否额外配置一个备用模型（DeepSeek / 百度千帆）？", false);
    if (addExtra) {
      const extraIdx = await askChoice("选择备用模型", [
        { label: "DeepSeek", desc: "deepseek-chat / deepseek-reasoner — platform.deepseek.com" },
        { label: "百度千帆", desc: "deepseek-v3 / ERNIE 系列 — qianfan.baidu.com" },
      ]);
      if (extraIdx === 0) {
        const key = await ask("  请输入 DeepSeek API Key: ");
        if (key) {
          newEnv["DEEPSEEK_API_KEY"] = key;
          console.log(green("  ✓ DeepSeek API Key 已保存"));
        }
      } else {
        const key = await ask("  请输入百度千帆 API Key: ");
        if (key) {
          newEnv["QIANFAN_API_KEY"] = key;
          console.log(green("  ✓ 百度千帆 API Key 已保存"));
        }
      }
    }
  } else if (regionIdx === 1) {
    // ── 海外模型 ──────────────────────────────────────────────────────────────
    const intlIdx = await askChoice("选择海外模型服务商", [
      { label: "OpenAI", desc: "gpt-4o / gpt-4o-mini", recommended: true },
      { label: "Anthropic", desc: "claude-3-5-haiku-latest" },
      { label: "OpenRouter", desc: "聚合多家模型，一个 Key 访问所有 — openrouter.ai" },
    ]);
    if (intlIdx === 0) {
      const apiKey = await ask("\n  请输入 OpenAI API Key (sk-...): ");
      if (apiKey) {
        newEnv["OPENAI_API_KEY"] = apiKey;
        defaultModel = "gpt-4o-mini";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "gpt-4o-mini" } } });
        console.log(green("  ✓ API Key 已保存"));
      }
    } else if (intlIdx === 1) {
      const apiKey = await ask("\n  请输入 Anthropic API Key (sk-ant-...): ");
      if (apiKey) {
        newEnv["ANTHROPIC_API_KEY"] = apiKey;
        defaultModel = "claude-3-5-haiku-latest";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: "claude-3-5-haiku-latest" } } });
        console.log(green("  ✓ API Key 已保存"));
      }
    } else {
      const apiKey = await ask("\n  请输入 OpenRouter API Key (sk-or-...): ");
      if (apiKey) {
        newEnv["OPENROUTER_API_KEY"] = apiKey;
        defaultModel = "openai/gpt-4o-mini";
        newConfig = deepMerge(newConfig, { agents: { defaults: { model: defaultModel } } });
        console.log(green("  ✓ API Key 已保存"));
      }
    }
  } else {
    console.log(yellow("\n  已跳过模型配置，稍后手动编辑:"));
    console.log(gray(`    ${CONFIG_PATH}`));
  }

  // ── 步骤 4：基础配置 ──────────────────────────────────────────────────────
  separator();
  console.log(bold("  步骤 4 / 4  基础配置"));
  separator();

  // Gateway token
  let gatewayToken = newEnv["OPENCLAW_GATEWAY_TOKEN"];
  if (!gatewayToken || gatewayToken === "change-me-to-a-long-random-token") {
    gatewayToken = crypto.randomBytes(32).toString("hex");
    newEnv["OPENCLAW_GATEWAY_TOKEN"] = gatewayToken;
    console.log(green("  ✓ 已自动生成 Gateway 访问令牌"));
  } else {
    console.log(green("  ✓ Gateway 令牌已存在，保持不变"));
  }

  // 写入插件配置
  newConfig = deepMerge(newConfig, {
    plugins: {
      load: {
        dirs: [path.join(OPENCLAW_DIR, "extensions", "opc-platform")],
      },
    },
  });

  // 端口提示
  console.log(`\n  管理后台地址: ${cyan("http://localhost:18789/opc/admin")}`);
  console.log(gray("  (启动后在浏览器中打开)"));

  // ── 写入文件 ──────────────────────────────────────────────────────────────
  writeJson(CONFIG_PATH, newConfig);
  writeEnv(ENV_PATH, newEnv);

  console.log(`\n  ${green("✓")} 配置文件已写入: ${gray(CONFIG_PATH)}`);
  console.log(`  ${green("✓")} 环境变量已写入: ${gray(ENV_PATH)}`);

  // ── 完成提示 ──────────────────────────────────────────────────────────────
  separator("═");
  console.log(`
  ${bold(green("配置完成！"))}

  启动命令:
    ${cyan("cd openclaw && npm start")}

  或者开发模式（跳过消息渠道）:
    ${cyan("cd openclaw && npm run gateway:dev")}

  管理后台:
    ${cyan("http://localhost:18789/opc/admin")}
`);
  if (defaultModel) {
    console.log(`  当前模型: ${cyan(defaultModel)}`);
    console.log(gray("  可在管理后台 → 工具管理 中调整各模块配置\n"));
  }
  separator("═");

  rl.close();
}

// ─── 深合并工具 ─────────────────────────────────────────────────────────────
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ─── 入口 ────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error(red(`\n  错误: ${err.message}\n`));
  rl.close();
  process.exit(1);
});
