# 方案二：Electron + 内嵌 Next.js 服务器 详细实施计划

## 项目概述
将现有的电影管理 Next.js 应用打包成独立的 Windows exe 文件，通过在 Electron 主进程中启动内嵌的 Next.js 服务器来实现。

## 技术架构

```
┌─────────────────────────────────────┐
│           Electron 主进程            │
├─────────────────────────────────────┤
│  1. 启动内嵌 Next.js 服务器          │
│  2. 检测可用端口                    │
│  3. 创建 BrowserWindow              │
│  4. 加载本地服务器地址               │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│        内嵌 Next.js 服务器           │
├─────────────────────────────────────┤
│  • 处理所有 API 请求                │
│  • 文件系统操作                    │
│  • 电影数据管理                    │
│  • 视频流服务                      │
└─────────────────────────────────────┘
```

## 实施步骤

### 第一阶段：环境准备和依赖配置

#### 1.1 安装额外依赖
```bash
# 开发依赖
npm install --save-dev electron-is-dev find-free-port cross-env

# 生产依赖（精简打包需要）
npm install --save next react react-dom

# 可选：如果需要更好的错误处理
npm install --save-dev electron-log
```

#### 1.2 修改 package.json 脚本
```json
{
  "scripts": {
    "electron:dev": "cross-env NODE_ENV=development electron .",
    "electron:pack": "electron-builder",
    "build:electron": "next build && electron-builder",
    "dist": "npm run build && npm run electron:pack"
  }
}
```

### 第二阶段：Electron 主进程重构

#### 2.1 创建新的 main.js
主要功能：
- 启动内嵌 Next.js 服务器
- 动态端口检测（避免冲突）
- 窗口管理
- 优雅关闭处理

#### 2.2 核心实现逻辑
```javascript
// 伪代码示例
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const findFreePort = require('find-free-port');
const path = require('path');

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

// 创建启动画面
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  splashWindow.loadFile('splash.html');
  return splashWindow;
}

// 更新启动进度
function updateProgress(message, percentage) {
  if (splashWindow) {
    splashWindow.webContents.send('update-progress', { message, percentage });
  }
}

async function startNextServer() {
  updateProgress('正在寻找可用端口...', 10);
  
  // 1. 寻找可用端口
  serverPort = await findFreePort(3000, 3100);
  
  updateProgress('正在启动服务器...', 30);
  
  // 2. 设置环境变量
  const env = {
    ...process.env,
    PORT: serverPort,
    NODE_ENV: isDev ? 'development' : 'production',
    USER_DATA_PATH: getUserDataPath()
  };
  
  // 3. 启动 Next.js 服务器
  const nextCommand = isDev ? 'npm run dev' : 'npm run start';
  nextServer = spawn(nextCommand, [], { env });
  
  updateProgress('等待服务器响应...', 60);
  
  // 4. 等待服务器启动
  await waitForServer(`http://localhost:${serverPort}`);
  
  updateProgress('服务器启动完成', 90);
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
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
    }, 500);
  });
}
```

### 第三阶段：Next.js 配置优化和路径处理

#### 3.1 修改 next.config.ts（处理路径差异）
```typescript
import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // 图片优化配置
  images: {
    unoptimized: true // Electron 环境必须关闭优化
  },
  
  // 输出配置
  output: 'standalone', // 有助于精简打包
  
  // 实验性功能
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  
  // Webpack 配置
  webpack: (config, { isServer }) => {
    // 客户端配置
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        path: false,
        os: false
      };
    }
    
    // 服务端配置 - 处理 Electron 环境
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'electron': 'commonjs electron'
      });
    }
    
    return config;
  },
  
  // 环境变量
  env: {
    IS_ELECTRON: 'true',
    USER_DATA_PATH: process.env.USER_DATA_PATH || path.join(process.cwd(), 'userData')
  }
};

export default nextConfig;
```

#### 3.2 创建路径工具函数
创建 `src/utils/paths.ts`：
```typescript
import path from 'path';

// 获取用户数据路径
export function getUserDataPath(): string {
  if (typeof window !== 'undefined') {
    // 客户端环境，通过 API 获取
    return '/api/user-data-path';
  }
  
  // 服务端环境
  const userDataPath = process.env.USER_DATA_PATH;
  if (userDataPath) {
    return userDataPath;
  }
  
  // 默认路径
  return path.join(process.cwd(), 'userData');
}

// 获取电影缓存路径
export function getMovieCachePath(): string {
  return path.join(getUserDataPath(), 'movie-cache');
}

// 获取评分数据路径
export function getRatingsPath(): string {
  return path.join(getUserDataPath(), 'ratings');
}

// 获取配置文件路径
export function getConfigPath(): string {
  return path.join(getUserDataPath(), 'config.json');
}
```

#### 3.3 环境变量处理
创建 `.env.local` 文件：
```
# Electron 环境标识
NEXT_PUBLIC_IS_ELECTRON=true

# 开发环境特定配置
NEXT_PUBLIC_DEV_MODE=true

# API 基础路径
NEXT_PUBLIC_API_BASE_URL=http://localhost
```

#### 3.4 修改 API 路由以支持用户数据目录
需要修改所有涉及文件操作的 API 路由，使用新的路径函数。

示例修改 `src/app/api/movies/route.ts`：
```typescript
import { getUserDataPath, getMovieCachePath } from '@/utils/paths';
import path from 'path';
import fs from 'fs';

// 原来的代码可能直接使用相对路径
// const cacheFile = './movie-cache.json';

// 修改为使用用户数据目录
const cacheFile = path.join(getMovieCachePath(), 'movie-cache.json');

// 确保目录存在
const userDataPath = getUserDataPath();
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}
```

### 第四阶段：electron-builder 配置

#### 4.1 完善 package.json 中的 build 配置（精简打包）
```json
{
  "build": {
    "appId": "com.yourcompany.avmanager",
    "productName": "AV Manager",
    "directories": {
      "output": "dist",
      "buildResources": "build"
    },
    "files": [
      "main.js",
      "preload.js",
      ".next/**/*",
      "package.json",
      "public/**/*",
      "!node_modules/**/*"
    ],
    "extraResources": [
      {
        "from": "userData",
        "to": "userData"
      }
    ],
    "asarUnpack": [
      "node_modules/next/**/*",
      "node_modules/react/**/*",
      "node_modules/react-dom/**/*"
    ],
    "win": {
      "target": "portable",
      "icon": "build/icon.ico"
    },
    "portable": {
      "artifactName": "AV-Manager-Portable.exe"
    }
  }
}
```

### 第五阶段：启动画面和资源准备

#### 5.1 创建启动画面
创建 `splash.html` 文件：
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>AV Manager 启动中...</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            border-radius: 10px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .progress-container {
            width: 300px;
            height: 6px;
            background: rgba(255,255,255,0.3);
            border-radius: 3px;
            overflow: hidden;
            margin: 20px 0;
        }
        .progress-bar {
            height: 100%;
            background: white;
            width: 0%;
            transition: width 0.3s ease;
        }
        .status {
            font-size: 14px;
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="logo">🎬 AV Manager</div>
    <div class="status" id="status">正在初始化...</div>
    <div class="progress-container">
        <div class="progress-bar" id="progress"></div>
    </div>
    <script>
        const { ipcRenderer } = require('electron');
        
        ipcRenderer.on('update-progress', (event, data) => {
            document.getElementById('status').textContent = data.message;
            document.getElementById('progress').style.width = data.percentage + '%';
        });
    </script>
</body>
</html>
```

#### 5.2 创建 preload.js
```javascript
const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统操作
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  
  // 进度更新（仅用于启动画面）
  onProgressUpdate: (callback) => {
    ipcRenderer.on('update-progress', callback);
  }
});
```

#### 5.3 创建图标文件
- 创建 `build/` 目录
- 准备 `icon.ico` (256x256 像素)
- 准备 `icon.png` (512x512 像素)

#### 5.4 应用元数据
- 应用名称：AV Manager
- 版本号：从 package.json 读取
- 描述：电影管理应用

### 第六阶段：错误处理和优化

#### 6.1 启动错误处理
- 端口占用检测
- Next.js 服务器启动失败处理
- 网络连接检查

#### 6.2 关闭流程优化
- 优雅关闭 Next.js 服务器
- 清理临时文件
- 保存用户数据

#### 6.3 性能优化
- 预加载关键资源
- 启动画面（可选）
- 内存使用监控

## 预期问题和解决方案

### 问题1：端口冲突
**解决方案：** 使用 `find-free-port` 动态分配端口

### 问题2：文件路径问题
**解决方案：** 使用 `path.resolve()` 和 `__dirname` 处理相对路径

### 问题3：Node.js 模块在渲染进程中的使用
**解决方案：** 通过 IPC 通信或在主进程中处理文件操作

### 问题4：打包体积过大（精简打包策略）
**解决方案：** 
- 排除不必要的 node_modules
- 使用 `asarUnpack` 只包含必要的运行时依赖
- 启用压缩和优化选项
- 排除开发工具和测试文件
- 使用 webpack 的 tree-shaking 功能

### 问题5：首次启动慢
**解决方案：**
- 添加启动画面
- 预编译 Next.js 应用
- 缓存机制

## 测试计划

### 开发环境测试
1. `npm run electron:dev` - 开发模式测试
2. 功能完整性测试
3. 性能基准测试

### 生产环境测试
1. `npm run build:electron` - 生产构建测试
2. 安装包测试
3. 不同 Windows 版本兼容性测试

### 用户体验测试
1. 启动时间测试
2. 内存使用测试
3. 功能稳定性测试

## 预期结果

### 文件结构
```
dist/
├── win-unpacked/           # 未打包的应用文件
│   ├── AV Manager.exe     # 主执行文件
│   ├── resources/         # 应用资源
│   ├── userData/          # 用户数据目录
│   │   ├── movie-cache/   # 电影缓存
│   │   ├── ratings/       # 评分数据
│   │   └── config.json    # 用户配置
│   └── ...
└── AV Manager Setup.exe   # 安装程序
```

### 性能指标
- 启动时间：< 8秒
- 内存使用：< 150MB
- 安装包大小：< 200MB（精简打包）

## 风险评估

### 高风险
- Next.js API 路由在打包环境中的兼容性
- 文件系统权限问题

### 中风险
- 打包体积控制
- 启动性能优化

### 低风险
- UI 兼容性
- 基础功能实现

## 详细实施步骤清单

### 准备阶段（30分钟）
- [ ] 安装必要依赖：`npm install --save-dev electron-is-dev find-free-port cross-env`
- [ ] 创建 `build/` 目录和图标文件
- [ ] 备份当前的 `main.js` 和 `package.json`

### 第一步：创建启动画面（45分钟）
- [ ] 创建 `splash.html` 文件
- [ ] 创建 `preload.js` 文件
- [ ] 测试启动画面显示

### 第二步：重构 main.js（90分钟）
- [ ] 添加动态端口检测
- [ ] 实现启动进度更新
- [ ] 添加用户数据目录处理
- [ ] 实现优雅关闭

### 第三步：修改 Next.js 配置（60分钟）
- [ ] 更新 `next.config.ts`
- [ ] 创建 `src/utils/paths.ts`
- [ ] 修改环境变量配置

### 第四步：修改 API 路由（120分钟）
- [ ] 更新所有文件操作相关的 API
- [ ] 测试路径处理功能
- [ ] 确保开发环境正常工作

### 第五步：配置精简打包（90分钟）
- [ ] 更新 `package.json` 的 build 配置
- [ ] 配置 `asarUnpack` 选项
- [ ] 设置便携版打包

### 第六步：测试和优化（180分钟）
- [ ] 开发环境测试
- [ ] 生产构建测试
- [ ] 性能优化
- [ ] 错误处理完善

**总计：约10小时**

## 精简打包详细策略

### 依赖分析
```bash
# 分析当前依赖大小
npm install -g webpack-bundle-analyzer
npx webpack-bundle-analyzer .next/static/chunks/*.js

# 查看哪些依赖最大
npm ls --depth=0 --long
```

### 排除策略
```json
{
  "build": {
    "files": [
      "main.js",
      "preload.js", 
      "splash.html",
      ".next/**/*",
      "package.json",
      "public/**/*",
      "!node_modules/**/*",
      "!src/**/*",
      "!.git/**/*",
      "!*.md",
      "!.eslintrc.json",
      "!tsconfig.json"
    ],
    "asarUnpack": [
      "node_modules/next/dist/server/**/*",
      "node_modules/react/**/*",
      "node_modules/react-dom/**/*",
      "node_modules/styled-jsx/**/*"
    ]
  }
}
```

### 运行时依赖优化
只打包运行时必需的依赖：
- next（服务器运行）
- react + react-dom（UI 渲染）
- styled-jsx（样式）
- 你的业务依赖（axios, cheerio, playwright）

排除的依赖：
- TypeScript 编译器
- ESLint 相关
- 开发工具
- 测试框架

## 后续优化方向

1. **自动更新机制** - 使用 `electron-updater`
2. **安全性增强** - 代码签名、内容安全策略
3. **多平台支持** - macOS、Linux 版本
4. **性能监控** - 集成错误报告和性能分析
5. **用户体验** - 启动画面、托盘图标、快捷键

---

## 讨论要点

1. **端口策略**：你希望固定端口还是动态分配？
2. **启动体验**：是否需要启动画面？
3. **安装方式**：便携版还是安装版？
4. **图标设计**：是否有现成的图标资源？
5. **错误处理**：用户遇到问题时的反馈机制？

请告诉我你对这个方案的看法，以及是否有需要调整的地方！