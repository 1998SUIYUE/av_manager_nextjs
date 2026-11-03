// 自动探测本地代理，供抓取影片信息/图片的外部请求使用。
// 探测顺序：
//   1. 环境变量 HTTPS_PROXY / HTTP_PROXY / ALL_PROXY
//   2. Windows 系统代理（注册表 ProxyEnable + ProxyServer，Clash/v2rayN 等开启系统代理时会写入）
//   3. 探测常见本地代理端口（9890/7890/7897/10809/1080），连通后发一次真实请求验证可用性
// 都不存在 → 返回 undefined（直连）。
// 结果缓存 5 分钟；请求失败可调 resetProxyAgent() 立即重新探测。

import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";
import net from "net";
import { execFile } from "child_process";
import { devWithTimestamp } from "@/utils/logger";

const COMMON_PROXY_PORTS = [9890, 7890, 7897, 10809, 1080];
const DETECT_TTL_MS = 5 * 60 * 1000;

type ProxyAgents = { httpsAgent?: HttpsProxyAgent<string>; httpAgent?: HttpsProxyAgent<string> };

let cache: { agents: ProxyAgents; detectedAt: number } | null = null;

function normalizeProxyUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `http://${value}`;
}

function readEnvProxy(): string | null {
  const raw =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    "";
  return normalizeProxyUrl(raw);
}

function execRegQuery(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("reg", args, { timeout: 3000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout || "");
    });
  });
}

// Windows 系统代理：ProxyEnable=1 时读 ProxyServer（形如 "127.0.0.1:9890" 或 "http=...;https=..."）
async function readSystemProxy(): Promise<string | null> {
  if (process.platform !== "win32") return null;
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  try {
    const enableOut = await execRegQuery(["query", key, "/v", "ProxyEnable"]);
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/.test(enableOut.replace(/\r/g, ""))) return null;

    const serverOut = await execRegQuery(["query", key, "/v", "ProxyServer"]);
    const match = serverOut.replace(/\r/g, "").match(/ProxyServer\s+REG_SZ\s+(\S+)/);
    if (!match) return null;

    const raw = match[1];
    if (raw.includes("=")) {
      const parts = raw.split(";").map((item) => item.trim());
      const httpsPart = parts.find((item) => /^https=/i.test(item));
      const httpPart = parts.find((item) => /^http=/i.test(item));
      const chosen = (httpsPart || httpPart || "").split("=")[1];
      return normalizeProxyUrl(chosen || "");
    }
    return normalizeProxyUrl(raw);
  } catch {
    return null;
  }
}

function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1", timeout: 400 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

// 端口连通不代表是 HTTP 代理，发一次真实请求验证
async function validateProxy(proxyUrl: string): Promise<boolean> {
  try {
    const agent = new HttpsProxyAgent(proxyUrl);
    await axios.get("https://www.gstatic.com/generate_204", {
      httpsAgent: agent,
      httpAgent: agent,
      timeout: 4000,
      maxRedirects: 2,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    return true;
  } catch {
    return false;
  }
}

async function detectProxyUrl(): Promise<string | null> {
  const fromEnv = readEnvProxy();
  if (fromEnv) return fromEnv;

  const fromRegistry = await readSystemProxy();
  if (fromRegistry) return fromRegistry;

  for (const port of COMMON_PROXY_PORTS) {
    if (await probePort(port)) {
      const candidate = `http://127.0.0.1:${port}`;
      if (await validateProxy(candidate)) {
        devWithTimestamp(`[proxy] 探测到本地代理端口: ${port}`);
        return candidate;
      }
    }
  }
  return null;
}

export async function getProxyAgent(): Promise<HttpsProxyAgent<string> | undefined> {
  if (cache && Date.now() - cache.detectedAt < DETECT_TTL_MS) {
    return cache.agents.httpsAgent;
  }

  const proxyUrl = await detectProxyUrl();
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  cache = { agents: { httpsAgent: agent, httpAgent: agent }, detectedAt: Date.now() };
  devWithTimestamp(`[proxy] 使用代理: ${proxyUrl || "直连（未检测到代理）"}`);
  return agent;
}

export function resetProxyAgent(): void {
  cache = null;
}

// axios 配置片段：有代理时返回 agent，无代理时返回空对象（直连）
export async function axiosProxyOptions(): Promise<ProxyAgents> {
  const agent = await getProxyAgent();
  return agent ? { httpsAgent: agent, httpAgent: agent } : {};
}
