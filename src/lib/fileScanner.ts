import fs from 'fs';
import path from 'path';

export interface MovieFile {
  filename: string;
  path: string;
  absolutePath: string;
  size: number;
  sizeInGB: number;
  extension: string;
  title?: string;
  year?: string;
  modifiedAt: number;
  code?: string; // 番号
  coverUrl?: string; // 封面图片URL
}

export function scanMovieDirectory(directoryPath: string): MovieFile[] {
  const movieFiles: MovieFile[] = [];
  const supportedExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

  function scanDirectory(currentPath: string) {
    const files = fs.readdirSync(currentPath);

    console.log(`扫描目录: ${currentPath}`);
    console.log(`总文件数: ${files.length}`);

    files.forEach(file => {
      const fullPath = path.join(currentPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          const fileStats = fs.statSync(fullPath);
          const sizeInGB = fileStats.size / (1024 * 1024 * 1024);

          const parsedInfo = parseMovieFilename(file);
          
          const movieFile: MovieFile = {
            filename: file,
            path: currentPath,
            absolutePath: path.resolve(fullPath),
            size: fileStats.size,
            sizeInGB: Number(sizeInGB.toFixed(1)),
            extension: ext,
            title: parsedInfo.title,
            year: parsedInfo.year,
            code: parsedInfo.code,
            coverUrl: parsedInfo.coverUrl,
            modifiedAt: stat.mtimeMs
          };

          movieFiles.push(movieFile);
        }
      }
    });
  }

  scanDirectory(directoryPath);

  console.log(`总电影文件数: ${movieFiles.length}`);

  return movieFiles;
}

// 解析电影文件名
export function parseMovieFilename(filename: string): { 
  title: string; 
  year?: string; 
  code?: string; 
  coverUrl?: string 
} {
  const nameWithoutExt = path.basename(filename, path.extname(filename));
  
  // 正则匹配番号 如 ABC-123, CARIB-123, Tokyo-Hot-n1234
  const codeRegex = /([A-Z]+-\d+|[A-Z]+-[A-Z]+-\d+)/i;
  const codeMatch = nameWithoutExt.match(codeRegex);
  
  const code = codeMatch ? codeMatch[1].toUpperCase() : undefined;
  
  // 生成封面图片URL（以 javbus 为例）
  const coverUrl = code 
    ? `https://images.javbus.com/cover/${code}.jpg` 
    : undefined;

  // 尝试提取年份
  const yearMatch = nameWithoutExt.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : undefined;

  // 使用番号作为标题
  const title = code || nameWithoutExt;

  return { 
    title, 
    year, 
    code, 
    coverUrl 
  };
}
