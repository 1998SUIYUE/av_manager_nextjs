const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const findFreePort = require('find-free-port');
const path = require('path');
const fs = require('fs');

let mainWindow;
let splashWindow;
let nextServer;
let serverPort;

// 获取用户数据目录（程序目录下）
function getUserDataPath() {
  if (isDev) {
    return path.join(__dirname, 'userData');
  }
  return path.join(process.resourcesPath, 'userData');
}

// 获取应用缓存路径（系统标准位置）
function getAppCachePath() {
  const appName = 'AV-Manager';
  const os = require('os');
  
  if (process.platform === 'win32') {
    // Windows: C:\Users\用户名\AppData\Local\AV-Manager
    return path.join(os.homedir(), 'AppData', 'Local', appName);
  } else if (process.platform === 'darwin') {
    // macOS: ~/Library/Caches/AV-Manager
    return path.join(os.homedir(), 'Library', 'Caches', appName);
  } else {
    // Linux: ~/.cache/AV-Manager
    return path.join(os.homedir(), '.cache', appName);
  }
}

// 确保用户数据目录存在
function ensureUserDataDir() {
  // 1. 确保程序目录下的用户数据目录存在（配置文件）
  const userDataPath = getUserDataPath();
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  // 2. 创建图片缓存目录
  const imageCacheDir = path.join(userDataPath, 'image-cache');
  if (!fs.existsSync(imageCacheDir)) {
    fs.mkdirSync(imageCacheDir, { recursive: true });
  }
}

// 创建启动画面
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  splashWindow.loadFile('splash.html');
  return splashWindow;
}

// 更新启动进度
function updateProgress(message, percentage) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('update-progress', { message, percentage });
  }
}

// 等待服务器启动
function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function check() {
      const http = require('http');
      const urlParts = new URL(url);
      
      const req = http.request({
        hostname: urlParts.hostname,
        port: urlParts.port,
        path: '/',
        method: 'GET',
        timeout: 1000
      }, (res) => {
        resolve();
      });
      
      req.on('error', () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Server startup timeout'));
        } else {
          setTimeout(check, 1000);
        }
      });
      
      req.end();
    }
    
    check();
  });
}

async function startNextServer() {
  updateProgress('正在寻找可用端口...', 10);
  
  try {
    // 1. 寻找可用端口
    const ports = await findFreePort(3000, 3100);
    serverPort = Array.isArray(ports) ? ports[0] : ports;
    
    updateProgress('正在启动服务器...', 30);
    
    // 2. 设置环境变量
    const env = {
      ...process.env,
      PORT: serverPort.toString(),
      NODE_ENV: isDev ? 'development' : 'production',
      USER_DATA_PATH: getUserDataPath(),
      APP_CACHE_PATH: getAppCachePath()
    };
    
    // 3. 启动 Next.js 服务器
    const nextCommand = isDev ? 'npm' : 'npm';
    const nextArgs = isDev ? ['run', 'dev'] : ['run', 'start'];
    
    nextServer = spawn(nextCommand, nextArgs, { 
      env,
      cwd: __dirname,
      stdio: isDev ? 'inherit' : 'pipe'
    });
    
    updateProgress('等待服务器响应...', 60);
    
    // 4. 等待服务器启动
    await waitForServer(`http://localhost:${serverPort}`);
    
    updateProgress('服务器启动完成', 90);
  } catch (error) {
    console.error('Failed to start Next.js server:', error);
    updateProgress('启动失败', 0);
    throw error;
  }
}

function createWindow() {
  updateProgress('正在创建应用窗口...', 95);
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false, // 先隐藏，等加载完成再显示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  mainWindow.loadURL(`http://localhost:${serverPort}`);
  
  // 窗口加载完成后显示主窗口，关闭启动画面
  mainWindow.once('ready-to-show', () => {
    updateProgress('启动完成', 100);
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
    }, 500);
  });
  
  // 主窗口关闭时的处理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 处理（如果需要的话可以保留）
ipcMain.handle('get-user-data-path', () => {
  return getUserDataPath();
});

ipcMain.handle('get-app-cache-path', () => {
  return getAppCachePath();
});

// 应用启动
app.whenReady().then(async () => {
  try {
    // 确保用户数据目录存在
    ensureUserDataDir();
    
    // 创建启动画面
    createSplashWindow();
    
    // 启动 Next.js 服务器
    await startNextServer();
    
    // 创建主窗口
    createWindow();
  } catch (error) {
    console.error('Application startup failed:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // 关闭 Next.js 服务器
  if (nextServer) {
    nextServer.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 应用退出时清理
app.on('before-quit', () => {
  if (nextServer) {
    nextServer.kill();
  }
});