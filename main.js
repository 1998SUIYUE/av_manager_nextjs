// --- Crash Reporter (Black Box) ---
const fs = require('fs');
console.log('[main] fs loaded');
const path = require('path');
console.log('[main] path loaded');

// 在所有代码之前定义一个获取用户数据路径的早期版本
const earlyGetUserDataPath = () => {
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  const execPathDir = path.dirname(process.execPath);
  let userDataPath;

  if (isDev) {
    userDataPath = path.join(__dirname, 'userData');
  } else {
    // For unpacked exe, userData is usually next to the exe
    userDataPath = path.join(execPathDir, 'userData');
  }
  console.log(`[earlyGetUserDataPath] isDev: ${isDev}`);
  console.log(`[earlyGetUserDataPath] process.execPath: ${process.execPath}`);
  console.log(`[earlyGetUserDataPath] __dirname: ${__dirname}`);
  console.log(`[earlyGetUserDataPath] Calculated userDataPath: ${userDataPath}`);
  return userDataPath;
};

// --- 添加早期测试写入文件 ---
try {
  const testUserDataPath = earlyGetUserDataPath();
  const testLogFilePath = path.join(testUserDataPath, 'startup_debug.log');
  if (!fs.existsSync(testUserDataPath)) {
    fs.mkdirSync(testUserDataPath, { recursive: true });
  }
  
  // 创建日志写入函数
  global.writeDebugLog = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(testLogFilePath, logMessage);
      console.log(message); // 同时输出到控制台
    } catch (e) {
      console.error('Failed to write debug log:', e.message);
      console.log(message); // 至少输出到控制台
    }
  };
  
  // 重写console.log来同时写入文件，只记录重要信息
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  
  console.log = (...args) => {
    const message = args.join(' ');
    // 只输出重要的日志
    if (message.includes('========') || 
        message.includes('✅') || 
        message.includes('❌') || 
        message.includes('🔄') || 
        message.includes('Ready') ||
        message.includes('服务器已就绪') ||
        message.includes('node_modules 存在') ||
        message.includes('找到服务器脚本') ||
        message.includes('进程退出')) {
      originalConsoleLog(...args);
      try {
        fs.appendFileSync(testLogFilePath, `[${new Date().toISOString()}] LOG: ${message}\n`);
      } catch (e) {
        // 忽略文件写入错误
      }
    }
  };
  
  console.error = (...args) => {
    const message = args.join(' ');
    originalConsoleError(...args);
    try {
      fs.appendFileSync(testLogFilePath, `[${new Date().toISOString()}] ERROR: ${message}\n`);
    } catch (e) {
      // 忽略文件写入错误
    }
  };
  
  fs.writeFileSync(testLogFilePath, `=== AV Manager 启动日志 ===\n启动时间: ${new Date().toISOString()}\n\n`);
  console.log(`[Early Startup] Debug log initialized: ${testLogFilePath}`);
  
  // 添加文件扫描功能
  function scanForVideoFiles(directoryPath, logFilePath) {
    const supportedExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
    const foundFiles = [];
    
    function writeLog(message) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] ${message}\n`;
      try {
        fs.appendFileSync(logFilePath, logMessage);
        console.log(`[FILE_SCAN] ${message}`);
      } catch (error) {
        console.error(`[FILE_SCAN] 写入日志失败:`, error);
      }
    }
    
    function scanDirectory(currentPath, depth = 0) {
      const indent = '  '.repeat(depth);
      
      try {
        // 检查目录权限
        fs.accessSync(currentPath, fs.constants.R_OK);
        writeLog(`${indent}📂 扫描目录: ${currentPath}`);
        
        const files = fs.readdirSync(currentPath);
        writeLog(`${indent}   发现 ${files.length} 个条目`);
        
        files.forEach(file => {
          const fullPath = path.join(currentPath, file);
          
          try {
            // 检查文件权限
            fs.accessSync(fullPath, fs.constants.R_OK);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
              // 完全递归扫描，不限制深度
              scanDirectory(fullPath, depth + 1);
            } else {
              const ext = path.extname(file).toLowerCase();
              if (supportedExtensions.includes(ext)) {
                const sizeInMB = (stat.size / (1024 * 1024)).toFixed(2);
                const sizeInGB = (stat.size / (1024 * 1024 * 1024)).toFixed(2);
                
                foundFiles.push({
                  filename: file,
                  path: currentPath,
                  fullPath: fullPath,
                  size: stat.size,
                  sizeInMB: sizeInMB,
                  sizeInGB: sizeInGB,
                  extension: ext,
                  modifiedAt: new Date(stat.mtime).toISOString()
                });
                
                writeLog(`${indent}   ✅ 找到视频文件: ${file}`);
                writeLog(`${indent}      路径: ${fullPath}`);
                writeLog(`${indent}      大小: ${sizeInGB}GB (${sizeInMB}MB)`);
                writeLog(`${indent}      修改时间: ${new Date(stat.mtime).toLocaleString()}`);
              }
            }
          } catch (fileError) {
            if (fileError.code === 'EACCES' || fileError.code === 'EPERM') {
              writeLog(`${indent}   ❌ 权限不足: ${file}`);
            } else if (fileError.code === 'ENOENT') {
              writeLog(`${indent}   ⚠️ 文件不存在: ${file}`);
            } else {
              writeLog(`${indent}   ❓ 文件错误: ${file} - ${fileError.message}`);
            }
          }
        });
      } catch (dirError) {
        if (dirError.code === 'EACCES' || dirError.code === 'EPERM') {
          writeLog(`${indent}❌ 目录权限不足: ${currentPath}`);
        } else if (dirError.code === 'ENOENT') {
          writeLog(`${indent}⚠️ 目录不存在: ${currentPath}`);
        } else {
          writeLog(`${indent}❓ 目录错误: ${currentPath} - ${dirError.message}`);
        }
      }
    }
    
    if (directoryPath && fs.existsSync(directoryPath)) {
      writeLog(`🔍 开始扫描目录: ${directoryPath}`);
      const startTime = Date.now();
      
      scanDirectory(directoryPath);
      
      const endTime = Date.now();
      const scanTime = endTime - startTime;
      
      writeLog(`📊 扫描完成统计:`);
      writeLog(`   ⏱️ 扫描耗时: ${scanTime}ms`);
      writeLog(`   📄 找到视频文件: ${foundFiles.length}个`);
      writeLog(`   📁 扫描目录: ${directoryPath}`);
      
      if (foundFiles.length > 0) {
        writeLog(`📋 视频文件列表:`);
        foundFiles.forEach((file, index) => {
          writeLog(`   ${index + 1}. ${file.filename} (${file.sizeInGB}GB)`);
        });
        
        // 按扩展名统计
        const extensionStats = foundFiles.reduce((acc, file) => {
          acc[file.extension] = (acc[file.extension] || 0) + 1;
          return acc;
        }, {});
        
        writeLog(`📈 文件类型统计:`);
        Object.entries(extensionStats).forEach(([ext, count]) => {
          writeLog(`   ${ext}: ${count}个`);
        });
        
        const totalSizeGB = foundFiles.reduce((sum, file) => sum + parseFloat(file.sizeInGB), 0);
        writeLog(`💾 总大小: ${totalSizeGB.toFixed(2)}GB`);
      } else {
        writeLog(`⚠️ 未找到任何视频文件`);
        writeLog(`支持的格式: ${supportedExtensions.join(', ')}`);
      }
    } else {
      writeLog(`❌ 扫描目录不存在或无法访问: ${directoryPath}`);
    }
    
    return foundFiles;
  }
  
  // 将扫描函数暴露给全局，以便其他地方调用
  global.scanForVideoFiles = scanForVideoFiles;
  global.debugLogPath = testLogFilePath;
  
  // 测试扫描功能 - 扫描一些常见目录
  function testScanCommonDirectories() {
    const commonDirectories = [
      'C:\\Users\\Public\\Videos',
      'D:\\',
      'E:\\',
      process.cwd(), // 当前工作目录
      path.join(require('os').homedir(), 'Videos'), // 用户视频目录
      path.join(require('os').homedir(), 'Desktop'), // 用户桌面
    ];
    
    writeLog(`🧪 开始测试扫描常见目录...`);
    
    commonDirectories.forEach(dir => {
      if (fs.existsSync(dir)) {
        writeLog(`📁 测试扫描目录: ${dir}`);
        try {
          // 只扫描第一层，避免过深
          const files = fs.readdirSync(dir);
          writeLog(`   发现 ${files.length} 个条目`);
          
          let videoCount = 0;
          files.slice(0, 20).forEach(file => { // 只检查前20个文件
            const fullPath = path.join(dir, file);
            try {
              const stat = fs.statSync(fullPath);
              if (!stat.isDirectory()) {
                const ext = path.extname(file).toLowerCase();
                if (['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext)) {
                  videoCount++;
                  const sizeInGB = (stat.size / (1024 * 1024 * 1024)).toFixed(2);
                  writeLog(`   ✅ 找到视频: ${file} (${sizeInGB}GB)`);
                }
              }
            } catch (fileError) {
              // 忽略单个文件错误
            }
          });
          
          if (videoCount === 0) {
            writeLog(`   ℹ️ 该目录未发现视频文件`);
          }
        } catch (error) {
          writeLog(`   ❌ 无法访问目录: ${error.message}`);
        }
      } else {
        writeLog(`   ⚠️ 目录不存在: ${dir}`);
      }
    });
    
    writeLog(`🧪 测试扫描完成`);
  }
  
  function writeLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(testLogFilePath, logMessage);
      console.log(`[MAIN_SCAN] ${message}`);
    } catch (error) {
      console.error(`[MAIN_SCAN] 写入日志失败:`, error);
    }
  }
  
  // 读取用户设置的电影目录并扫描
  function scanUserMovieDirectory() {
    try {
      const movieDirectoryPath = path.join(testUserDataPath, 'movie-directory.txt');
      
      if (fs.existsSync(movieDirectoryPath)) {
        const userDirectory = fs.readFileSync(movieDirectoryPath, 'utf-8').trim();
        
        if (userDirectory) {
          writeLog(`📁 读取到用户设置的电影目录: ${userDirectory}`);
          writeLog(`🔍 开始完整扫描用户目录...`);
          
          // 使用完整扫描功能扫描用户设置的目录
          const foundFiles = scanForVideoFiles(userDirectory, testLogFilePath);
          
          writeLog(`✅ 用户目录扫描完成，共找到 ${foundFiles.length} 个视频文件`);
        } else {
          writeLog(`⚠️ 用户尚未设置电影目录`);
          // 如果用户没有设置目录，则进行测试扫描
          testScanCommonDirectories();
        }
      } else {
        writeLog(`⚠️ 电影目录配置文件不存在: ${movieDirectoryPath}`);
        // 如果配置文件不存在，则进行测试扫描
        testScanCommonDirectories();
      }
    } catch (error) {
      writeLog(`❌ 读取用户电影目录失败: ${error.message}`);
      // 出错时进行测试扫描
      testScanCommonDirectories();
    }
  }
  
  // 延迟执行扫描，避免阻塞启动
  setTimeout(() => {
    try {
      scanUserMovieDirectory();
    } catch (error) {
      writeLog(`❌ 扫描失败: ${error.message}`);
    }
  }, 3000); // 3秒后执行
} catch (e) {
  console.error(`[Early Startup] Failed to setup debug log: ${e.message}`);
}
// --- 结束早期测试写入文件 ---

process.on('uncaughtException', (error) => {
  try {
    const userDataPath = earlyGetUserDataPath();
    const logFilePath = path.join(userDataPath, 'crash.log');
    
    // 确保目录存在
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    const errorMessage = `
--- CRASH REPORT ---
Timestamp: ${new Date().toISOString()}
Error: ${error.name}
Message: ${error.message}
Stack:
${error.stack}
--- END REPORT ---\n\n
`;
    
    fs.appendFileSync(logFilePath, errorMessage);
  } catch (logError) {
    console.error('Failed to write crash log:', logError);
    console.error('Original error:', error);
  }
  
  // 确保日志被写入后才退出
  process.exit(1);
});
// --- End of Crash Reporter ---

console.log('[main] Before Electron require');
const { app, BrowserWindow, ipcMain } = require('electron');
console.log('[main] Electron loaded');
const { spawn } = require('child_process');
console.log('[main] child_process loaded');
const http = require('http');
console.log('[main] http loaded');
const isDev = require('electron-is-dev');
console.log('[main] electron-is-dev loaded');
// const findFreePort = require('find-free-port'); // 移除有问题的依赖
console.log('[main] 跳过 find-free-port 加载');

let mainWindow = null;
let nextServer = null;
let serverPort;

// 使用内置模块的端口检查函数
async function findAvailablePort(startPort = 3000) {
  console.log(`[findAvailablePort] 开始查找可用端口，起始端口: ${startPort}`);
  
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      console.log(`[findAvailablePort] 检查端口 ${port}...`);
      
      // 使用内置 net 模块检查端口
      const net = require('net');
      const isPortFree = await new Promise((resolve) => {
        const server = net.createServer();
        
        server.listen(port, '127.0.0.1', () => {
          server.close(() => {
            console.log(`[findAvailablePort] ✅ 端口 ${port} 可用`);
            resolve(true);
          });
        });
        
        server.on('error', (err) => {
          console.log(`[findAvailablePort] ❌ 端口 ${port} 被占用: ${err.code}`);
          resolve(false);
        });
      });
      
      if (isPortFree) {
        console.log(`[findAvailablePort] 🎯 找到可用端口: ${port}`);
        return port;
      }
    } catch (error) {
      console.warn(`[findAvailablePort] 端口 ${port} 检查失败:`, error.message);
    }
  }
  
  // 如果都不可用，使用随机端口
  const randomPort = startPort + Math.floor(Math.random() * 1000);
  console.log(`[findAvailablePort] 🎲 使用随机端口: ${randomPort}`);
  return randomPort;
}

// 单实例锁定 - 防止多个程序实例同时运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[main] 应用已在运行，退出当前实例');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[main] 检测到第二个实例启动，聚焦到现有窗口');
    // 如果用户试图运行第二个实例，我们应该聚焦到现有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

// 获取用户数据目录（程序目录下）
function getUserDataPath() {
  console.log('[getUserDataPath] --- 开始获取用户数据路径 ---');
  console.log('[getUserDataPath] isDev:', isDev);
  console.log('[getUserDataPath] process.execPath:', process.execPath);
  console.log('[getUserDataPath] process.resourcesPath:', process.resourcesPath);
  console.log('[getUserDataPath] __dirname:', __dirname);

  if (isDev) {
    const userDataPath = path.join(__dirname, 'userData');
    console.log('[getUserDataPath] 开发模式下用户数据路径:', userDataPath);
    console.log('[getUserDataPath] --- 结束获取用户数据路径 ---');
    return userDataPath;
  }
  
  // 打包后的路径检测
  let programDir;
  
  // 检查是否是打包后的exe
  if (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe')) {
    // 真正的exe文件
    programDir = path.dirname(process.execPath);
    console.log('[getUserDataPath] 检测到exe文件，程序目录:', programDir);
  } else {
    // 可能是通过node运行的，或者其他打包形式
    programDir = process.resourcesPath ? path.dirname(process.resourcesPath) : path.dirname(process.execPath);
    console.log('[getUserDataPath] 未检测到exe文件，程序目录 (基于resourcesPath或execPath):', programDir);
  }
  
  const userDataPath = path.join(programDir, 'userData');
  console.log('[getUserDataPath] 最终计算的用户数据路径:', userDataPath);
  console.log('[getUserDataPath] --- 结束获取用户数据路径 ---');
  
  return userDataPath;
}

// 确保用户数据目录存在
function ensureUserDataDir() {
  const userDataPath = getUserDataPath();
  
  try {
    // 检查并创建用户数据目录
    if (!fs.existsSync(userDataPath)) {
      console.log(`[ensureUserDataDir] 创建用户数据目录: ${userDataPath}`);
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    // 测试目录写入权限
    const testFile = path.join(userDataPath, 'write_test.tmp');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`[ensureUserDataDir] 目录权限检查通过: ${userDataPath}`);
    
    // 确保图片缓存目录存在
    const imageCacheDir = path.join(userDataPath, 'image-cache');
    if (!fs.existsSync(imageCacheDir)) {
      console.log(`[ensureUserDataDir] 创建图片缓存目录: ${imageCacheDir}`);
      fs.mkdirSync(imageCacheDir, { recursive: true });
    }
    
  } catch (error) {
    console.error(`[ensureUserDataDir] 目录创建或权限检查失败:`, error);
    
    // 尝试使用系统临时目录作为备选
    const os = require('os');
    const fallbackPath = path.join(os.tmpdir(), 'AV-Manager-Data');
    
    try {
      if (!fs.existsSync(fallbackPath)) {
        fs.mkdirSync(fallbackPath, { recursive: true });
      }
      
      // 更新全局路径变量
      process.env.USER_DATA_PATH = fallbackPath;
      process.env.APP_CACHE_PATH = fallbackPath;
      
      console.log(`[ensureUserDataDir] 使用备选目录: ${fallbackPath}`);
      
      // 创建图片缓存目录
      const fallbackImageCache = path.join(fallbackPath, 'image-cache');
      if (!fs.existsSync(fallbackImageCache)) {
        fs.mkdirSync(fallbackImageCache, { recursive: true });
      }
      
    } catch (fallbackError) {
      console.error(`[ensureUserDataDir] 备选目录也失败:`, fallbackError);
      
      // 显示错误对话框
      const { dialog } = require('electron');
      dialog.showErrorBox(
        '权限错误', 
        `无法创建数据目录。请确保应用有足够的文件系统权限。\n\n原始路径: ${userDataPath}\n备选路径: ${fallbackPath}\n\n错误: ${error.message}`
      );
      
      throw new Error('无法创建用户数据目录');
    }
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
  console.log('[startNextServer] ========== 开始启动服务器 ==========');
  try {
    // 使用内置模块检查端口可用性
    console.log('[startNextServer] 🔍 开始端口分配...');
    let localServerPort = await findAvailablePort(3000);
    console.log(`[startNextServer] ✅ 分配端口: ${localServerPort}`);
    
    if (!localServerPort) {
      console.error('[startNextServer] ❌ 无法找到可用端口');
      throw new Error('无法找到可用端口');
    }
    
    console.log('[startNextServer] ✅ 端口查找完成，设置全局变量');
    // 设置全局变量
    serverPort = localServerPort;
    console.log('[startNextServer] 📝 全局 serverPort 已设置为:', serverPort);
    
    console.log('[startNextServer] 🔧 准备服务器环境变量...');
    const userDataPath = getUserDataPath();
    const serverEnv = {
      ...process.env,
      PORT: localServerPort.toString(),
      USER_DATA_PATH: userDataPath,
      APP_CACHE_PATH: userDataPath,
      IS_ELECTRON: 'true'
    };
    console.log('[startNextServer] ✅ 服务器环境变量准备完成');
    
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

    console.log(`[startNextServer] isDev: ${isDev}`);
    
    if (isDev) {
      console.log('[startNextServer] 进入开发模式分支');
      // 开发模式：启动 Next.js 开发服务器
      nextServer = spawn('npm', ['run', 'dev'], {
        stdio: 'inherit',
        shell: true,
        env: serverEnv
      });
      
      console.log('[startNextServer] 开发服务器已启动，等待就绪...');
      // 等待服务器启动
      await waitForServer(localServerPort);
      console.log('[startNextServer] 开发服务器就绪完成');
    } else {
      console.log('[startNextServer] 进入生产模式分支');
      // 生产模式：直接用 Node 运行 Next.js 的独立服务器
      console.log('[startNextServer] 生产模式启动');
      
      // 优先使用 extraResources 中的 standalone 目录
      const possiblePaths = [
        // extraResources 路径 (优先)
        path.join(process.resourcesPath, 'standalone', 'server.js'),
        // 标准 Electron 打包路径
        path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js'),
        // 直接在 app 目录下
        path.join(__dirname, '.next', 'standalone', 'server.js'),
        // 在 resources 下
        path.join(__dirname, 'resources', 'app', '.next', 'standalone', 'server.js'),
        // exe 目录下
        path.join(path.dirname(process.execPath), '.next', 'standalone', 'server.js'),
        path.join(path.dirname(process.execPath), 'resources', 'standalone', 'server.js')
      ];
      
      // 如果找不到 server.js，直接启动备用服务器
      console.log('[startNextServer] 🔍 开始查找 Next.js 服务器脚本...');
      console.log('[startNextServer] 📁 当前 __dirname:', __dirname);
      console.log('[startNextServer] 📁 process.resourcesPath:', process.resourcesPath);
      console.log('[startNextServer] 📁 process.execPath:', process.execPath);
      
      let serverScriptPath = null;
      for (const testPath of possiblePaths) {
        console.log(`[main] 检查路径: ${testPath}`);
        console.log(`[main] 路径是否存在: ${fs.existsSync(testPath)}`);
        if (fs.existsSync(testPath)) {
          serverScriptPath = testPath;
          console.log(`[main] ✅ 找到服务器脚本: ${serverScriptPath}`);
          break;
        } else {
          console.log(`[main] ❌ 路径不存在: ${testPath}`);
        }
      }
      
      if (!serverScriptPath) {
        console.error('[startNextServer] ❌ 找不到 Next.js 服务器脚本');
        console.error('[startNextServer] 🔍 尝试的路径:');
        possiblePaths.forEach(p => console.error(`[startNextServer]   ❌ ${p}`));
        
        // 立即启动备用服务器
        console.log('[startNextServer] 🚀 立即启动备用HTTP服务器...');
        try {
          await startFallbackServer(localServerPort, userDataPath);
          console.log('[startNextServer] ✅ 备用服务器启动成功，应用可用');
          return;
        } catch (fallbackError) {
          console.error('[startNextServer] ❌ 备用服务器启动失败:', fallbackError);
          throw new Error(`无法启动任何服务器: ${fallbackError.message}`);
        }
      }

      console.log('[startNextServer] ✅ 找到服务器脚本，使用 Node.js 直接启动...');
      console.log(`[startNextServer] 服务器脚本路径: ${serverScriptPath}`);
      console.log(`[startNextServer] 工作目录: ${path.dirname(serverScriptPath)}`);
      console.log(`[startNextServer] Node.js 路径: ${process.execPath}`);
      
      // 直接使用原始的 server.js，但设置正确的环境变量
      console.log(`[startNextServer] 使用原始 server.js 启动...`);
      
      // 检查 standalone 目录结构
      const standaloneDir = path.dirname(serverScriptPath);
      const nodeModulesPath = path.join(standaloneDir, 'node_modules');
      const packageJsonPath = path.join(standaloneDir, 'package.json');
      
      console.log(`[startNextServer] 检查 standalone 目录结构:`);
      console.log(`[startNextServer] - standalone 目录: ${standaloneDir}`);
      console.log(`[startNextServer] - node_modules 存在: ${fs.existsSync(nodeModulesPath)}`);
      console.log(`[startNextServer] - package.json 存在: ${fs.existsSync(packageJsonPath)}`);
      
      console.log('[startNextServer] 🚀 方案2：主进程集成 Next.js');
      
      // 方案2：在主进程中直接运行 Next.js，不使用子进程
      try {
        console.log('[startNextServer] 📦 尝试加载 Next.js 模块...');
        
        // 检查可能的 Next.js 路径
        const possibleNextPaths = [
          // 标准 node_modules 路径
          path.join(__dirname, 'node_modules', 'next'),
          // standalone 目录中的 Next.js
          path.join(standaloneDir, 'node_modules', 'next'),
          // app 目录中的 Next.js
          path.join(process.resourcesPath, 'app', 'node_modules', 'next'),
          // 相对路径
          'next'
        ];
        
        let nextModule = null;
        let nextPath = null;
        
        for (const testPath of possibleNextPaths) {
          try {
            console.log(`[startNextServer] 🔍 尝试加载 Next.js: ${testPath}`);
            nextModule = require(testPath);
            nextPath = testPath;
            console.log(`[startNextServer] ✅ 成功加载 Next.js: ${testPath}`);
            break;
          } catch (error) {
            console.log(`[startNextServer] ❌ 无法加载 Next.js: ${testPath} - ${error.message}`);
          }
        }
        
        if (!nextModule) {
          console.error('[startNextServer] ❌ 无法找到 Next.js 模块，启动备用服务器');
          await startFallbackServer(localServerPort, userDataPath);
          console.log('[startNextServer] ✅ 备用服务器已启动，应用可用');
          return;
        }
        
        console.log('[startNextServer] 🎯 使用主进程集成方式启动 Next.js');
        
        // 使用 standalone 目录作为应用目录
        const appDir = standaloneDir;
        console.log(`[startNextServer] 📁 使用应用目录: ${appDir}`);
        
        // 创建 Next.js 应用实例
        const app = nextModule({
          dev: false,
          dir: appDir,
          quiet: false,
          conf: {
            // 基本配置
            images: { unoptimized: true },
            output: 'standalone',
            assetPrefix: '',
            basePath: '',
            // 环境变量
            env: {
              IS_ELECTRON: 'true',
              USER_DATA_PATH: userDataPath,
              APP_CACHE_PATH: userDataPath
            }
          }
        });
        
        console.log('[startNextServer] 🔄 准备 Next.js 应用...');
        await app.prepare();
        console.log('[startNextServer] ✅ Next.js 应用准备完成');
        
        // 创建 HTTP 服务器
        const server = http.createServer((req, res) => {
          // 使用 Next.js 处理请求
          app.getRequestHandler()(req, res);
        });
        
        // 启动服务器
        console.log(`[startNextServer] 🚀 启动 HTTP 服务器在端口 ${localServerPort}...`);
        server.listen(localServerPort, '127.0.0.1', () => {
          console.log(`[startNextServer] ✅ Next.js 服务器成功启动在 http://127.0.0.1:${localServerPort}`);
        });
        
        // 保存服务器引用
        global.nextServerInstance = server;
        global.nextAppInstance = app;
        
        // 错误处理
        server.on('error', (error) => {
          console.error('[startNextServer] ❌ 服务器错误:', error);
          
          // 启动备用服务器
          setTimeout(async () => {
            try {
              await startFallbackServer(localServerPort, userDataPath);
              console.log('[startNextServer] ✅ 备用服务器已启动');
            } catch (fallbackError) {
              console.error('[startNextServer] ❌ 备用服务器启动失败:', fallbackError);
            }
          }, 1000);
        });
        
        console.log('[startNextServer] ✅ 方案2 Next.js 主进程集成完成');
        return; // 成功启动，直接返回
        
      } catch (error) {
        console.error('[startNextServer] ❌ 主进程集成失败:', error);
        console.log('[startNextServer] 🔄 回退到备用服务器...');
        
        await startFallbackServer(localServerPort, userDataPath);
        console.log('[startNextServer] ✅ 备用服务器已启动，应用可用');
        return;
      }
      
      // 注意：方案2已经在上面直接返回，下面的代码不会执行
    }
  } catch (error) {
    console.error('启动 Next.js 服务器失败:', error);
    
    // 显示用户友好的错误信息
    const { dialog } = require('electron');
    const errorMessage = `服务器启动失败: ${error.message}\n\n可能的原因:\n- 端口被占用\n- 应用文件损坏\n- 系统权限不足\n\n请尝试:\n1. 重启应用\n2. 重启电脑\n3. 重新安装应用`;
    
    dialog.showErrorBox('启动失败', errorMessage);
    app.quit();
  }
}

// 备用静态文件服务器
async function startFallbackServer(port, userDataPath) {
  console.log(`[fallbackServer] ========== 启动备用服务器 ==========`);
  console.log(`[fallbackServer] 端口: ${port}`);
  console.log(`[fallbackServer] 用户数据路径: ${userDataPath}`);
  
  return new Promise((resolve, reject) => {
    try {
      // 直接使用基本HTTP服务器，不依赖express
      console.log(`[fallbackServer] 🔄 创建基本HTTP服务器...`);
      const server = http.createServer((req, res) => {
        console.log(`[fallbackServer] 📥 收到请求: ${req.method} ${req.url}`);
        
        // 处理不同的路由
        if (req.url === '/api/movies' && req.method === 'GET') {
          // 电影API
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ 
            message: '备用模式下，电影功能暂时不可用',
            status: 'fallback_mode',
            movies: []
          }));
        } else if (req.url.startsWith('/api/')) {
          // 其他API
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ 
            message: '备用模式下，此API暂时不可用',
            status: 'fallback_mode'
          }));
        } else {
          // 主页面
          res.writeHead(200, { 
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>AV Manager - 备用模式</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                  .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                  .header { text-align: center; margin-bottom: 30px; }
                  .status { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
                  .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
                  .info-card { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; }
                  .btn { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
                  .btn:hover { background: #0056b3; }
                  .btn:disabled { background: #6c757d; cursor: not-allowed; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>🎬 AV Manager</h1>
                    <p>电影管理系统 - 备用模式</p>
                  </div>
                  
                  <div class="status">
                    <h3>⚠️ 当前状态：备用模式</h3>
                    <p>应用正在备用模式下运行。完整功能暂时不可用，但系统正常运行。</p>
                  </div>
                  
                  <div class="info-grid">
                    <div class="info-card">
                      <h4>📊 系统信息</h4>
                      <p>服务器端口: ${port}</p>
                      <p>启动时间: ${new Date().toLocaleString()}</p>
                      <p>模式: 备用HTTP服务器</p>
                    </div>
                    
                    <div class="info-card">
                      <h4>🔧 可用功能</h4>
                      <p>✅ 基本界面显示</p>
                      <p>✅ 系统状态监控</p>
                      <p>❌ 电影扫描功能</p>
                      <p>❌ 文件管理功能</p>
                    </div>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <button class="btn" onclick="location.reload()">🔄 刷新页面</button>
                    <button class="btn" onclick="checkStatus()">📊 检查状态</button>
                    <button class="btn" disabled>🎬 电影管理 (不可用)</button>
                  </div>
                  
                  <div id="status-result" style="margin-top: 20px;"></div>
                  
                  <div style="text-align: center; margin-top: 30px; color: #666; font-size: 14px;">
                    <p>如需完整功能，请重新安装应用程序或联系技术支持。</p>
                  </div>
                </div>
                
                <script>
                  function checkStatus() {
                    fetch('/api/status')
                      .then(response => response.json())
                      .then(data => {
                        document.getElementById('status-result').innerHTML = 
                          '<div class="status"><h4>状态检查结果</h4><pre>' + 
                          JSON.stringify(data, null, 2) + '</pre></div>';
                      })
                      .catch(error => {
                        document.getElementById('status-result').innerHTML = 
                          '<div class="status" style="background: #f8d7da; border-color: #f5c6cb;"><h4>检查失败</h4><p>' + 
                          error.message + '</p></div>';
                      });
                  }
                  
                  // 每30秒自动检查一次状态
                  setInterval(() => {
                    console.log('自动状态检查...');
                  }, 30000);
                </script>
              </body>
            </html>
          `);
        }
        console.log(`[fallbackServer] 📤 响应已发送给: ${req.url}`);
      });
      
      console.log(`[fallbackServer] 🔄 尝试监听端口 ${port}...`);
      server.listen(port, '127.0.0.1', () => {
        console.log(`[fallbackServer] ✅ 基本HTTP服务器成功启动在 127.0.0.1:${port}`);
        resolve(server);
      });
      
      server.on('error', (error) => {
        console.error(`[fallbackServer] ❌ 服务器启动失败:`, error);
        console.error(`[fallbackServer] 错误详情: ${error.message}`);
        console.error(`[fallbackServer] 错误代码: ${error.code}`);
        reject(error);
      });
      
    } catch (error) {
      console.error(`[fallbackServer] ❌ 创建服务器失败:`, error);
      console.error(`[fallbackServer] 错误堆栈:`, error.stack);
      reject(error);
    }
  });
}

function waitForServer(port) {
  console.log(`[waitForServer] ========== 等待服务器就绪 ==========`);
  console.log(`[waitForServer] 目标端口: ${port}`);
  console.log(`[waitForServer] 目标地址: http://localhost:${port}`);
  
  return new Promise((resolve, reject) => {
    const maxAttempts = 60; // 最多等待60秒
    let attempts = 0;
    const startTime = Date.now();

    const checkServer = () => {
      attempts++;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      // 每次都输出尝试信息
      console.log(`[waitForServer] 🔄 尝试 ${attempts}/${maxAttempts} - http://localhost:${port} [${elapsed}s]`);

      if (attempts > maxAttempts) {
        const errorMsg = `服务器启动超时 (${elapsed}秒)。可能原因：端口${port}被占用或服务器启动失败`;
        console.error(`[waitForServer] ❌ 超时: ${errorMsg}`);
        return reject(new Error(errorMsg));
      }

      // 设置请求超时
      console.log(`[waitForServer] 📡 发送HTTP请求到 http://localhost:${port}`);
      const req = http.get(`http://localhost:${port}`, { timeout: 3000 }, (res) => {
        console.log(`[waitForServer] 📥 收到响应，状态码: ${res.statusCode}`);
        // 任何成功的响应（2xx-3xx）都表示服务器已准备好
        if (res.statusCode >= 200 && res.statusCode < 400) {
          console.log(`[waitForServer] ✅ 服务器已就绪！状态码: ${res.statusCode}，耗时: ${elapsed}秒`);
          resolve();
        } else {
          console.log(`[waitForServer] ⚠️ 异常状态码: ${res.statusCode}，1秒后重试`);
          setTimeout(checkServer, 1000);
        }
      });

      req.on('error', (err) => {
        console.log(`[waitForServer] ❌ 连接错误 (${attempts}次): ${err.message} (${err.code})`);
        setTimeout(checkServer, 1000);
      });

      req.on('timeout', () => {
        console.log(`[waitForServer] ⏰ 请求超时，1秒后重试`);
        req.destroy();
        setTimeout(checkServer, 1000);
      });

      req.end();
    };

    // 首次检查前给予服务器一些启动时间
    console.log(`[waitForServer] ⏳ 等待3秒后开始检查服务器...`);
    setTimeout(checkServer, 3000);
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
  console.log('[main] --- app.whenReady() 开始 ---');
  console.log('[main] 当前工作目录:', process.cwd());
  console.log('[main] __dirname:', __dirname);
  console.log('[main] process.execPath:', process.execPath);
  console.log('[main] process.resourcesPath:', process.resourcesPath);
  
  // 添加详细的路径调试信息
  try {
    global.writeDebugLog('========== 详细路径调试开始 ==========');
    global.writeDebugLog(`当前时间: ${new Date().toISOString()}`);
    global.writeDebugLog(`isDev: ${isDev}`);
    global.writeDebugLog(`process.execPath: ${process.execPath}`);
    global.writeDebugLog(`process.resourcesPath: ${process.resourcesPath}`);
    global.writeDebugLog(`__dirname: ${__dirname}`);
    global.writeDebugLog(`process.cwd(): ${process.cwd()}`);
    global.writeDebugLog(`process.platform: ${process.platform}`);
    
    // 检查环境变量
    global.writeDebugLog('--- 环境变量检查 ---');
    global.writeDebugLog(`NODE_ENV: ${process.env.NODE_ENV}`);
    global.writeDebugLog(`IS_ELECTRON: ${process.env.IS_ELECTRON}`);
    global.writeDebugLog(`USER_DATA_PATH: ${process.env.USER_DATA_PATH}`);
    global.writeDebugLog(`PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR}`);
    global.writeDebugLog(`ELECTRON_RESOURCES_PATH: ${process.env.ELECTRON_RESOURCES_PATH}`);
    
    // 检查关键路径是否存在
    global.writeDebugLog('--- 关键路径存在性检查 ---');
    const pathsToCheck = [
      { name: 'process.execPath', path: process.execPath },
      { name: 'process.resourcesPath', path: process.resourcesPath },
      { name: '__dirname', path: __dirname },
      { name: 'execPath目录', path: path.dirname(process.execPath) },
      { name: 'execPath目录/userData', path: path.join(path.dirname(process.execPath), 'userData') },
      { name: '__dirname/userData', path: path.join(__dirname, 'userData') }
    ];
    
    pathsToCheck.forEach(item => {
      if (item.path) {
        global.writeDebugLog(`${item.name} (${item.path}) 存在: ${fs.existsSync(item.path)}`);
      }
    });
    
    // 详细检查 getUserDataPath 的计算过程
    global.writeDebugLog('--- getUserDataPath 详细计算过程 ---');
    let calculatedPath;
    
    if (isDev) {
      calculatedPath = path.join(__dirname, 'userData');
      global.writeDebugLog(`开发模式 - 计算路径: ${calculatedPath}`);
    } else {
      let programDir;
      if (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe')) {
        programDir = path.dirname(process.execPath);
        global.writeDebugLog(`生产模式 - 检测到真实exe文件`);
        global.writeDebugLog(`生产模式 - exe目录: ${programDir}`);
      } else {
        programDir = process.resourcesPath ? path.dirname(process.resourcesPath) : path.dirname(process.execPath);
        global.writeDebugLog(`生产模式 - 未检测到真实exe，使用resourcesPath或execPath`);
        global.writeDebugLog(`生产模式 - 程序目录: ${programDir}`);
      }
      calculatedPath = path.join(programDir, 'userData');
      global.writeDebugLog(`生产模式 - 最终计算路径: ${calculatedPath}`);
    }
    
    global.writeDebugLog(`getUserDataPath 最终结果: ${calculatedPath}`);
    global.writeDebugLog(`计算路径是否存在: ${fs.existsSync(calculatedPath)}`);
    
    // 检查 movie-directory.txt 文件
    const movieDirFile = path.join(calculatedPath, 'movie-directory.txt');
    global.writeDebugLog('--- movie-directory.txt 详细检查 ---');
    global.writeDebugLog(`movie-directory.txt 完整路径: ${movieDirFile}`);
    global.writeDebugLog(`文件是否存在: ${fs.existsSync(movieDirFile)}`);
    
    if (fs.existsSync(movieDirFile)) {
      try {
        const content = fs.readFileSync(movieDirFile, 'utf-8');
        global.writeDebugLog(`文件内容: "${content}"`);
        global.writeDebugLog(`内容长度: ${content.length}`);
        global.writeDebugLog(`去空格后内容: "${content.trim()}"`);
        global.writeDebugLog(`内容是否为空: ${content.trim() === ''}`);
        
        // 检查配置的视频目录
        const configuredDir = content.trim();
        if (configuredDir) {
          global.writeDebugLog(`--- 配置的视频目录检查 ---`);
          global.writeDebugLog(`配置的目录路径: ${configuredDir}`);
          global.writeDebugLog(`配置目录是否存在: ${fs.existsSync(configuredDir)}`);
          
          if (fs.existsSync(configuredDir)) {
            try {
              const files = fs.readdirSync(configuredDir);
              global.writeDebugLog(`目录中总文件数: ${files.length}`);
              
              const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
              const videoFiles = files.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return videoExtensions.includes(ext);
              });
              global.writeDebugLog(`视频文件数量: ${videoFiles.length}`);
              
              if (videoFiles.length > 0) {
                global.writeDebugLog(`前5个视频文件:`);
                videoFiles.slice(0, 5).forEach((file, index) => {
                  const fullPath = path.join(configuredDir, file);
                  const stats = fs.statSync(fullPath);
                  const sizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);
                  global.writeDebugLog(`  ${index + 1}. ${file} (${sizeGB}GB)`);
                });
              }
              
              // 检查大文件（>100MB）
              const largeFiles = files.filter(f => {
                try {
                  const fullPath = path.join(configuredDir, f);
                  const stats = fs.statSync(fullPath);
                  const ext = path.extname(f).toLowerCase();
                  return videoExtensions.includes(ext) && stats.size > 100 * 1024 * 1024;
                } catch {
                  return false;
                }
              });
              global.writeDebugLog(`大于100MB的视频文件数量: ${largeFiles.length}`);
              
            } catch (readError) {
              global.writeDebugLog(`读取配置目录失败: ${readError.message}`);
            }
          }
        }
      } catch (readError) {
        global.writeDebugLog(`读取movie-directory.txt失败: ${readError.message}`);
      }
    } else {
      global.writeDebugLog(`movie-directory.txt 文件不存在！`);
      // 检查父目录是否存在
      const parentDir = path.dirname(movieDirFile);
      global.writeDebugLog(`父目录 ${parentDir} 是否存在: ${fs.existsSync(parentDir)}`);
    }
    
    global.writeDebugLog('========== 详细路径调试结束 ==========');
  } catch (debugError) {
    global.writeDebugLog(`路径调试过程出错: ${debugError.message}`);
  }
  
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
      console.log('[main] 设置环境变量 PORTABLE_EXECUTABLE_DIR:', process.env.PORTABLE_EXECUTABLE_DIR);
    }
    if (process.resourcesPath) {
      process.env.ELECTRON_RESOURCES_PATH = process.resourcesPath;
      console.log('[main] 设置环境变量 ELECTRON_RESOURCES_PATH:', process.env.ELECTRON_RESOURCES_PATH);
    }
  }
  
  console.log('[main] Electron主进程路径信息:');
  console.log('[main] isDev:', isDev);
  console.log('[main] __dirname:', __dirname);
  console.log('[main] process.execPath:', process.execPath);
  console.log('[main] process.resourcesPath:', process.resourcesPath);
  console.log('[main] 计算出的用户数据路径:', userDataPath);
  console.log('[main] 设置的环境变量 USER_DATA_PATH:', process.env.USER_DATA_PATH);
  console.log('[main] 设置的环境变量 APP_CACHE_PATH:', process.env.APP_CACHE_PATH);
  console.log('[main] 设置的环境变量 IS_ELECTRON:', process.env.IS_ELECTRON);
  
  await startNextServer();
  createWindow();
  console.log('[main] --- app.whenReady() 结束 ---');
});

// 通过端口杀死进程的函数
function killServerByPort(port) {
  console.log(`[killServer] 🔍 查找占用端口 ${port} 的进程...`);
  
  try {
    // 使用 netstat 查找占用端口的进程
    const { execSync } = require('child_process');
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    
    console.log(`[killServer] 📋 端口 ${port} 占用情况:`, result.trim());
    
    // 解析输出，提取PID
    const lines = result.trim().split('\n');
    const pids = new Set();
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const pid = parseInt(parts[parts.length - 1]);
        if (pid && !isNaN(pid)) {
          pids.add(pid);
        }
      }
    }
    
    console.log(`[killServer] 🎯 找到占用端口的进程PIDs:`, Array.from(pids));
    
    // 杀死所有占用端口的进程
    let killedCount = 0;
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
        console.log(`[killServer] 🛑 已杀死进程 PID: ${pid}`);
        killedCount++;
      } catch (error) {
        console.log(`[killServer] ❌ 杀死进程 ${pid} 失败:`, error.message);
      }
    }
    
    return killedCount > 0;
  } catch (error) {
    console.log(`[killServer] ❌ 查找端口占用失败:`, error.message);
    return false;
  }
}

// 通过PID杀死进程的函数
function killServerByPID() {
  const pidFilePath = path.join(getUserDataPath(), 'server.pid');
  let targetPID = null;
  
  // 优先使用内存中的PID
  if (global.nextServerPID) {
    targetPID = global.nextServerPID;
    console.log('[killServer] 🎯 使用内存中的PID:', targetPID);
  } 
  // 其次从文件读取PID
  else if (fs.existsSync(pidFilePath)) {
    try {
      targetPID = parseInt(fs.readFileSync(pidFilePath, 'utf8').trim());
      console.log('[killServer] 📄 从文件读取PID:', targetPID);
    } catch (error) {
      console.log('[killServer] ❌ 读取PID文件失败:', error.message);
    }
  }
  
  if (targetPID) {
    try {
      // 检查进程是否存在
      process.kill(targetPID, 0); // 0信号用于检查进程是否存在
      console.log('[killServer] ✅ 找到目标进程，PID:', targetPID);
      
      // 强制杀死进程
      process.kill(targetPID, 'SIGKILL');
      console.log('[killServer] 🛑 已杀死服务器进程，PID:', targetPID);
      
      // 清理PID文件
      if (fs.existsSync(pidFilePath)) {
        fs.unlinkSync(pidFilePath);
        console.log('[killServer] 🗑️ 已清理PID文件');
      }
      
      // 清理全局变量
      global.nextServerPID = null;
      
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.log('[killServer] ℹ️ 进程已不存在，PID:', targetPID);
      } else {
        console.log('[killServer] ❌ 杀死进程失败:', error.message);
      }
      
      // 清理无效的PID文件
      if (fs.existsSync(pidFilePath)) {
        fs.unlinkSync(pidFilePath);
      }
      global.nextServerPID = null;
    }
  } else {
    console.log('[killServer] ⚠️ 未找到服务器PID');
  }
  
  return false;
}

app.on('window-all-closed', () => {
  console.log('[main] 🔄 所有窗口已关闭，清理资源...');
  
  // 首先通过端口杀死所有相关进程
  const portKilled = killServerByPort(serverPort || 3000);
  
  // 然后通过PID杀死进程（如果还有的话）
  const pidKilled = killServerByPID();
  
  // 最后尝试传统方式
  if (!portKilled && !pidKilled && nextServer && !nextServer.killed) {
    console.log('[main] 🔄 端口和PID方式都失败，尝试传统方式关闭进程...');
    try {
      nextServer.kill('SIGKILL');
      nextServer = null;
      console.log('[main] ✅ 传统方式关闭成功');
    } catch (error) {
      console.log('[main] ❌ 传统方式也失败:', error.message);
    }
  }
  
  console.log('[main] 🔚 AV Manager 应用正常退出');
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 应用退出前清理
app.on('before-quit', (event) => {
  console.log('[main] 🔄 应用即将退出，清理资源...');
  
  if (nextServer && !nextServer.killed) {
    console.log('[main] 🛑 关闭 Next.js 服务器进程...');
    
    // 立即尝试优雅关闭
    nextServer.kill('SIGTERM');
    
    // 设置一个标志，防止重复关闭
    nextServer._isClosing = true;
    
    // 给进程一些时间优雅关闭
    setTimeout(() => {
      if (nextServer && !nextServer.killed && nextServer._isClosing) {
        console.log('[main] ⚡ 强制关闭 Next.js 服务器进程...');
        nextServer.kill('SIGKILL');
        nextServer = null;
      }
      console.log('[main] 🔚 AV Manager 应用退出完成');
    }, 1000); // 减少等待时间到1秒
  } else {
    console.log('[main] 🔚 AV Manager 应用退出完成');
  }
});

// 处理进程退出信号
process.on('SIGINT', () => {
  console.log('[main] 🔄 收到 SIGINT 信号，清理资源...');
  if (nextServer && !nextServer.killed) {
    nextServer.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[main] 🔄 收到 SIGTERM 信号，清理资源...');
  if (nextServer && !nextServer.killed) {
    nextServer.kill('SIGTERM');
  }
  process.exit(0);
});

