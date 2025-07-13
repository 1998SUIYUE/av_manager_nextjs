import path from 'path';
import os from 'os';

// 获取应用缓存路径（系统标准位置）
export function getAppCachePath(): string {
  // 优先使用环境变量
  if (process.env.APP_CACHE_PATH) {
    return process.env.APP_CACHE_PATH;
  }
  
  // 服务端环境 - 使用系统标准缓存位置
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
  // 优先使用环境变量
  if (process.env.USER_DATA_PATH) {
    return process.env.USER_DATA_PATH;
  }
  
  // 默认路径（开发环境）
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