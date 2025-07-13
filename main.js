const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const findFreePort = require('find-free-port');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');

let mainWindow = null;
let nextServer = null;
let serverPort;

// 获取用户数据目录（程序目录下）
function getUserDataPath() {
  if (isDev) {
    return path.join(__dirname, 'userData');
  }
  
  // 打包后的路径检测
  let programDir;
  
  // 检查是否是打包后的exe
  if (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe')) {
    // 真正的exe文件
    programDir = path.dirname(process.execPath);
  } else {
    // 可能是通过node运行的，尝试其他方法
    programDir = process.resourcesPath ? path.dirname(process.resourcesPath) : path.dirname(process.execPath);
  }
  
  const userDataPath = path.join(programDir, 'userData');
  console.log('[getUserDataPath] 程序目录:', programDir);
  console.log('[getUserDataPath] 用户数据路径:', userDataPath);
  
  return userDataPath;
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



function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true, // 直接显示窗口
    icon: path.join(__dirname, 'public', 'icon.ico'),
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
    
    const userDataPath = getUserDataPath();
    const serverEnv = {
      ...process.env,
      PORT: serverPort.toString(),
      USER_DATA_PATH: userDataPath,
      APP_CACHE_PATH: userDataPath,
      IS_ELECTRON: 'true'
    };
    
    // 确保所有路径相关的环境变量都传递给Next.js
    if (!isDev) {
      if (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe')) {
        serverEnv.PORTABLE_EXECUTABLE_DIR = path.dirname(process.execPath);
      }
      if (process.resourcesPath) {
        serverEnv.ELECTRON_RESOURCES_PATH = process.resourcesPath;
      }
    }
    
    console.log('[main] 启动Next.js服务器，传递的环境变量:');
    console.log('[main] PORT:', serverEnv.PORT);
    console.log('[main] USER_DATA_PATH:', serverEnv.USER_DATA_PATH);
    console.log('[main] APP_CACHE_PATH:', serverEnv.APP_CACHE_PATH);
    console.log('[main] IS_ELECTRON:', serverEnv.IS_ELECTRON);

    if (isDev) {
      // 开发模式：启动 Next.js 开发服务器
      nextServer = spawn('npm', ['run', 'dev'], {
        stdio: 'inherit',
        shell: true,
        env: serverEnv
      });
      
      // 等待服务器启动
      await waitForServer(serverPort);
    } else {
      // 生产模式：简化启动逻辑
      console.log('[main] 生产模式启动');
      console.log('[main] 检查文件存在性:');
      
      const nextStandaloneServerPath = path.join(__dirname, '.next', 'standalone', 'server.js');
      const packageJsonPath = path.join(__dirname, 'package.json');
      const standaloneServerPath = path.join(__dirname, 'standalone-server.js');
      
      console.log('[main] .next/standalone/server.js 存在:', fs.existsSync(nextStandaloneServerPath));
      console.log('[main] package.json 存在:', fs.existsSync(packageJsonPath));
      console.log('[main] standalone-server.js 存在:', fs.existsSync(standaloneServerPath));
      
      // 直接使用npm start，这是最可靠的方式
      console.log('[main] 使用 npm start 启动服务器');
      nextServer = spawn('npm', ['start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: serverEnv
      });
      
      // 监听输出
      nextServer.stdout.on('data', (data) => {
        console.log('[npm-stdout]', data.toString());
      });
      
      nextServer.stderr.on('data', (data) => {
        console.error('[npm-stderr]', data.toString());
      });
      
      nextServer.on('error', (error) => {
        console.error('[npm-error]', error);
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
    let attempts = 0;
    const maxAttempts = 30; // 最多等待30秒
    
    const checkServer = () => {
      attempts++;
      console.log(`[waitForServer] 尝试连接服务器 (${attempts}/${maxAttempts}) - 端口: ${port}`);
      
      if (attempts > maxAttempts) {
        console.error('[waitForServer] 服务器启动超时');
        reject(new Error('服务器启动超时'));
        return;
      }
      
      const server = createServer();
      server.listen(port, 'localhost', () => {
        console.log('[waitForServer] 服务器已启动');
        server.close();
        resolve();
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log('[waitForServer] 端口已被使用，服务器已启动');
          resolve(); // 端口已被使用，说明服务器已启动
        } else {
          console.log(`[waitForServer] 连接失败，1秒后重试: ${err.code}`);
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
  
  // 设置环境变量，让Next.js服务端知道正确的用户数据路径
  const userDataPath = getUserDataPath();
  process.env.USER_DATA_PATH = userDataPath;
  process.env.APP_CACHE_PATH = userDataPath;
  process.env.IS_ELECTRON = 'true';
  
  // 设置额外的环境变量帮助路径检测
  if (!isDev) {
    if (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe')) {
      process.env.PORTABLE_EXECUTABLE_DIR = path.dirname(process.execPath);
    }
    if (process.resourcesPath) {
      process.env.ELECTRON_RESOURCES_PATH = process.resourcesPath;
    }
  }
  
  console.log('[main] Electron主进程路径信息:');
  console.log('[main] isDev:', isDev);
  console.log('[main] __dirname:', __dirname);
  console.log('[main] process.execPath:', process.execPath);
  console.log('[main] 计算出的用户数据路径:', userDataPath);
  console.log('[main] 设置的环境变量 USER_DATA_PATH:', process.env.USER_DATA_PATH);
  
  await startNextServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
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
    console.log('Attempting to kill Next.js server process...');
    nextServer.kill();
    nextServer = null;
  }
});