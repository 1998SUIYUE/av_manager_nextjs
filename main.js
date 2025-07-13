const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const findFreePort = require('find-free-port');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');

let mainWindow = null;
let splashWindow = null;
let nextServer = null;
let serverPort;

// 获取用户数据目录（程序目录下）
function getUserDataPath() {
  if (isDev) {
    return path.join(__dirname, 'userData');
  }
  // 打包后使用 app.getPath('userData') 或程序目录
  return path.join(path.dirname(process.execPath), 'userData');
}

// 确保用户数据目录存在
function ensureUserDataDir() {
  const userDataPath = getUserDataPath();
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  // 确保图片缓存目录存在
  const imageCacheDir = path.join(userDataPath, 'image-cache');
  if (!fs.existsSync(imageCacheDir)) {
    fs.mkdirSync(imageCacheDir, { recursive: true });
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile('splash.html');
  
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const startUrl = isDev 
    ? `http://localhost:${serverPort}` 
    : `http://localhost:${serverPort}`;
  
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow.show();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startNextServer() {
  try {
    const ports = await findFreePort(3000, 3100);
    serverPort = Array.isArray(ports) ? ports[0] : ports;
    
    if (isDev) {
      // 开发模式：启动 Next.js 开发服务器
      nextServer = spawn('npm', ['run', 'dev'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PORT: serverPort.toString() }
      });
      
      // 等待服务器启动
      await waitForServer(serverPort);
    } else {
      // 生产模式：启动 Next.js 生产服务器
      nextServer = spawn('npm', ['start'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PORT: serverPort.toString() }
      });
      
      // 等待服务器启动
      await waitForServer(serverPort);
    }
  } catch (error) {
    console.error('启动 Next.js 服务器失败:', error);
    app.quit();
  }
}

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    const checkServer = () => {
      const server = createServer();
      server.listen(port, 'localhost', () => {
        server.close();
        resolve();
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(); // 端口已被使用，说明服务器已启动
        } else {
          setTimeout(checkServer, 1000);
        }
      });
    };
    
    setTimeout(checkServer, 2000); // 给 Next.js 一些启动时间
  });
}

// IPC 处理程序
ipcMain.handle('get-user-data-path', () => {
  return getUserDataPath();
});

ipcMain.handle('select-folder', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('open-file', async (event, filePath) => {
  const { shell } = require('electron');
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(async () => {
  ensureUserDataDir();
  createSplashWindow();
  await startNextServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (nextServer && typeof nextServer.kill === 'function') {
      nextServer.kill();
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (nextServer && typeof nextServer.kill === 'function') {
    nextServer.kill();
  }
});