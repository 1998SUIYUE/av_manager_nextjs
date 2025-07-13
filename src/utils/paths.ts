import path from 'path';
import os from 'os';

// 获取应用缓存路径
export function getAppCachePath(): string {
  // 检查是否在Electron环境中
  if (process.env.IS_ELECTRON === 'true') {
    // Electron环境：直接使用用户数据目录（确保一致性）
    console.log('[paths] Electron环境，缓存路径使用用户数据目录');
    return getUserDataPath();
  }
  
  // 优先使用环境变量（非Electron环境）
  if (process.env.APP_CACHE_PATH) {
    console.log('[paths] 使用环境变量 APP_CACHE_PATH:', process.env.APP_CACHE_PATH);
    return process.env.APP_CACHE_PATH;
  }
  
  // 非Electron环境 - 使用系统标准缓存位置
  const appName = 'AV-Manager';
  
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

// 获取用户数据路径（程序目录 - 用于配置文件）
export function getUserDataPath(): string {
  // 检查是否在Electron环境中
  if (process.env.IS_ELECTRON === 'true') {
    console.log('[paths] Electron环境检测');
    
    // 优先使用PORTABLE_EXECUTABLE_DIR（这是exe所在目录）
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      const userDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'userData');
      console.log('[paths] 使用PORTABLE_EXECUTABLE_DIR:', userDataPath);
      return userDataPath;
    }
    
    // 尝试使用ELECTRON_RESOURCES_PATH环境变量
    if (process.env.ELECTRON_RESOURCES_PATH) {
      const programDir = path.dirname(process.env.ELECTRON_RESOURCES_PATH);
      const userDataPath = path.join(programDir, 'userData');
      console.log('[paths] 从ELECTRON_RESOURCES_PATH推断用户数据路径:', userDataPath);
      return userDataPath;
    }
    
    // 尝试从process.execPath推断程序目录
    if (process.execPath && process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe')) {
      // 真正的exe文件
      const programDir = path.dirname(process.execPath);
      const userDataPath = path.join(programDir, 'userData');
      console.log('[paths] 从真实exe路径推断用户数据路径:', userDataPath);
      return userDataPath;
    }
    
    // 最后才使用环境变量USER_DATA_PATH（可能指向错误位置）
    if (process.env.USER_DATA_PATH) {
      console.log('[paths] 备用：使用环境变量 USER_DATA_PATH:', process.env.USER_DATA_PATH);
      return process.env.USER_DATA_PATH;
    }
    
    // 备用方案：使用process.cwd()
    console.warn('[paths] 使用process.cwd()作为备用方案');
    return path.join(process.cwd(), 'userData');
  }
  
  // 非Electron环境：优先使用环境变量
  if (process.env.USER_DATA_PATH) {
    console.log('[paths] 非Electron环境，使用环境变量 USER_DATA_PATH:', process.env.USER_DATA_PATH);
    return process.env.USER_DATA_PATH;
  }
  
  // 默认路径（开发环境）
  console.log('[paths] 开发环境，使用默认路径');
  return path.join(process.cwd(), 'userData');
}


// 获取电影目录配置文件路径（程序目录）
export function getMovieDirectoryPath(): string {
  return path.join(getUserDataPath(), 'movie-directory.txt');
}

// 获取电影元数据缓存文件路径（程序目录）
export function getMovieMetadataCachePath(): string {
  return path.join(getUserDataPath(), 'movie-metadata-cache.json');
}

// 获取图片缓存目录路径（程序目录）
export function getImageCachePath(): string {
  return path.join(getUserDataPath(), 'image-cache');
}