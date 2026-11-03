// AV Manager 桌面壳：启动内置 Next standalone 服务并加载窗口
// - 开发模式：若 127.0.0.1:3000 已有服务（next dev），直接开窗口连上去
// - 打包模式：自动挑空闲端口，spawn standalone server.js（ELECTRON_RUN_AS_NODE 使
//   Electron 的 node 二进制以纯 Node 模式运行），等待就绪后开窗口
// - 数据目录固定在 %APPDATA%/AV Manager/userData（安装到 Program Files 也可写）
const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const net = require("net");
const http = require("http");
const path = require("path");
const fs = require("fs");

const DEV_URL = "http://127.0.0.1:3000";
const PORT_SCAN_START = 3000;
// 首次启动可能被杀毒软件全量扫描拖慢，放宽到 120s
const SERVER_READY_TIMEOUT_MS = 120 * 1000;

let serverProcess = null;
let mainWindow = null;
let serverLogPath = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function probePortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function pickFreePort(startPort) {
  let port = startPort;
  // 最多向后探测 20 个端口，全部占用则放弃
  for (let i = 0; i < 20; i++) {
    if (await probePortFree(port)) return port;
    port += 1;
  }
  throw new Error(`无可用端口（${startPort} - ${port}）`);
}

function httpOk(url, timeoutMs) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await httpOk(url, 1500)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`服务启动超时：${url}`);
}

function logServer(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    if (serverLogPath) fs.appendFileSync(serverLogPath, line, "utf-8");
  } catch {}
  console.error(line);
}

function getServerBase() {
  // 打包后 standalone 位于 resources/app；开发态直接用仓库内 .next/standalone
  return app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..", ".next", "standalone");
}

function startServer(port) {
  const serverBase = getServerBase();
  const serverJs = path.join(serverBase, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`未找到服务入口：${serverJs}，请先执行 npm run build && npm run pack:standalone`);
  }

  const dataRoot = app.getPath("userData"); // %APPDATA%/AV Manager
  fs.mkdirSync(dataRoot, { recursive: true });
  serverLogPath = path.join(dataRoot, "server.log");
  logServer(`启动服务：port=${port}, entry=${serverJs}, dataRoot=${dataRoot}`);

  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: dataRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      USER_DATA_PATH: path.join(dataRoot, "userData"),
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (chunk) => logServer(`[stdout] ${chunk}`));
  serverProcess.stderr.on("data", (chunk) => logServer(`[stderr] ${chunk}`));
  serverProcess.on("error", (error) => {
    logServer(`spawn 失败：${error.message}`);
  });
  serverProcess.on("exit", (code) => {
    logServer(`服务进程退出：code=${code}`);
    serverProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "AV Manager",
        `后台服务已退出（code ${code}）。详情见日志：${path.join(dataRoot, "server.log")}`
      );
      app.quit();
    }
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function createWindow(url, iconPath) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#111112",
    autoHideMenuBar: true,
    title: "AV Manager",
    icon: iconPath,
    show: false,
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const iconPath = path.join(getServerBase(), "public", "icon.ico");

  try {
    // 开发模式：仅未打包时，若 3000 端口已有活着的 next dev 就直接连。
    // 打包模式一律走端口探测，防止 3000 被无关程序占用时误连。
    if (!app.isPackaged && (await httpOk(DEV_URL, 1200))) {
      createWindow(DEV_URL, iconPath);
      return;
    }

    const port = await pickFreePort(PORT_SCAN_START);
    const url = `http://127.0.0.1:${port}`;
    startServer(port);
    await waitForServer(url, SERVER_READY_TIMEOUT_MS);
    createWindow(url, iconPath);
  } catch (error) {
    stopServer();
    const logHint = serverLogPath ? `\n日志：${serverLogPath}` : "";
    dialog.showErrorBox("AV Manager", `启动失败：${error instanceof Error ? error.message : String(error)}${logHint}`);
    app.quit();
  }
});

app.on("before-quit", stopServer);
app.on("window-all-closed", () => {
  stopServer();
  app.quit();
});
