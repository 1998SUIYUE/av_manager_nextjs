const fs = require('fs');
const path = require('path');

// 获取用户数据目录路径的函数（复制自 paths.ts）
function getUserDataPath() {
  // 直接使用当前目录下的 userData 文件夹
  return path.join(process.cwd(), 'userData');
}

// 获取缓存文件路径
function getMovieMetadataCachePath() {
  const userDataPath = getUserDataPath();
  return path.join(userDataPath, 'movie-metadata-cache.json');
}

// 获取目录路径
function getMovieDirectoryPath() {
  const userDataPath = getUserDataPath();
  return path.join(userDataPath, 'movie-directory.txt');
}

// 解析电影文件名获取番号
function parseMovieCode(filename) {
  const nameWithoutExt = path.basename(filename, path.extname(filename));
  const matchResult = nameWithoutExt.match(/([a-zA-Z]{2,5}-\d{2,5})/i);
  return matchResult ? matchResult[1].toUpperCase() : null;
}

// 扫描目录获取所有mp4文件
function scanForMp4Files(directoryPath) {
  const mp4Files = [];
  const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm"];
  const FILE_SIZE_THRESHOLD = 100 * 1024 * 1024; // 100MB

  function scanDirectory(currentPath) {
    try {
      const files = fs.readdirSync(currentPath);
      
      files.forEach(file => {
        const fullPath = path.join(currentPath, file);
        try {
          const stats = fs.statSync(fullPath);
          
          if (stats.isDirectory()) {
            scanDirectory(fullPath);
          } else {
            const ext = path.extname(file).toLowerCase();
            if (VIDEO_EXTENSIONS.includes(ext) && stats.size >= FILE_SIZE_THRESHOLD) {
              const code = parseMovieCode(file);
              mp4Files.push({
                filename: file,
                path: fullPath,
                code: code,
                size: stats.size,
                sizeInGB: Number((stats.size / (1024 * 1024 * 1024)).toFixed(2))
              });
            }
          }
        } catch (fileError) {
          console.log(`处理文件 ${file} 时发生错误:`, fileError.message);
        }
      });
    } catch (dirError) {
      console.log(`扫描目录 ${currentPath} 时发生错误:`, dirError.message);
    }
  }

  scanDirectory(directoryPath);
  return mp4Files;
}

async function compareData() {
  console.log('🔍 开始比对 movie-metadata-cache 和 mp4_list 数据...\n');

  try {
    // 1. 读取缓存数据
    const cachePath = getMovieMetadataCachePath();
    console.log(`📁 缓存文件路径: ${cachePath}`);
    
    let cacheData = [];
    if (fs.existsSync(cachePath)) {
      try {
        const cacheContent = fs.readFileSync(cachePath, 'utf-8');
        cacheData = JSON.parse(cacheContent);
        console.log(`✅ 缓存中找到 ${cacheData.length} 条记录`);
      } catch (error) {
        console.log('❌ 读取缓存文件时发生错误:', error.message);
        return;
      }
    } else {
      console.log('❌ 缓存文件不存在');
      return;
    }

    // 2. 读取目录路径
    const dirPath = getMovieDirectoryPath();
    console.log(`📁 目录配置文件路径: ${dirPath}`);
    
    if (!fs.existsSync(dirPath)) {
      console.log('❌ 目录配置文件不存在');
      return;
    }

    const movieDirectory = fs.readFileSync(dirPath, 'utf-8').trim().replace(/['"]/g, "");
    console.log(`📂 电影目录: ${movieDirectory}`);

    if (!movieDirectory || !fs.existsSync(movieDirectory)) {
      console.log('❌ 电影目录不存在或未配置');
      return;
    }

    // 3. 扫描实际文件
    console.log('\n🔍 开始扫描实际文件...');
    const mp4Files = scanForMp4Files(movieDirectory);
    console.log(`✅ 实际文件中找到 ${mp4Files.length} 个视频文件`);

    // 4. 创建比对数据结构
    const cacheCodeSet = new Set();
    const cacheByCode = new Map();
    
    cacheData.forEach(item => {
      if (item.code) {
        cacheCodeSet.add(item.code.toUpperCase());
        cacheByCode.set(item.code.toUpperCase(), item);
      }
    });

    const fileCodeSet = new Set();
    const filesByCode = new Map();
    
    mp4Files.forEach(file => {
      if (file.code) {
        fileCodeSet.add(file.code.toUpperCase());
        if (!filesByCode.has(file.code.toUpperCase())) {
          filesByCode.set(file.code.toUpperCase(), []);
        }
        filesByCode.get(file.code.toUpperCase()).push(file);
      }
    });

    // 5. 分析差异
    console.log('\n📊 数据比对结果:');
    console.log('='.repeat(50));
    
    // 在缓存中但不在文件中的（可能是已删除的文件）
    const inCacheNotInFiles = [];
    cacheCodeSet.forEach(code => {
      if (!fileCodeSet.has(code)) {
        inCacheNotInFiles.push({
          code: code,
          cacheData: cacheByCode.get(code)
        });
      }
    });

    // 在文件中但不在缓存中的（遗漏的数据）
    const inFilesNotInCache = [];
    fileCodeSet.forEach(code => {
      if (!cacheCodeSet.has(code)) {
        inFilesNotInCache.push({
          code: code,
          files: filesByCode.get(code)
        });
      }
    });

    // 输出结果
    console.log(`📈 统计信息:`);
    console.log(`   缓存中的番号数量: ${cacheCodeSet.size}`);
    console.log(`   实际文件番号数量: ${fileCodeSet.size}`);
    console.log(`   共同番号数量: ${cacheCodeSet.size - inCacheNotInFiles.length}`);
    
    console.log(`\n❌ 在缓存中但文件已不存在的番号 (${inCacheNotInFiles.length}个):`);
    if (inCacheNotInFiles.length > 0) {
      inCacheNotInFiles.forEach(item => {
        console.log(`   ${item.code} - ${item.cacheData.title || 'N/A'} (${item.cacheData.actress || 'N/A'})`);
      });
    } else {
      console.log('   无');
    }

    console.log(`\n🔍 在文件中但缓存中遗漏的番号 (${inFilesNotInCache.length}个):`);
    if (inFilesNotInCache.length > 0) {
      inFilesNotInCache.forEach(item => {
        console.log(`   ${item.code}:`);
        item.files.forEach(file => {
          console.log(`     - ${file.filename} (${file.sizeInGB}GB)`);
        });
      });
    } else {
      console.log('   无');
    }

    // 检查没有番号的文件
    const filesWithoutCode = mp4Files.filter(file => !file.code);
    console.log(`\n📝 没有番号的文件 (${filesWithoutCode.length}个):`);
    if (filesWithoutCode.length > 0) {
      filesWithoutCode.forEach(file => { // 显示所有没有番号的文件
        console.log(`   ${file.filename} (${file.sizeInGB}GB)`);
        console.log(`     路径: ${file.path}`);
      });
    } else {
      console.log('   无');
    }

    // 检查重复的番号
    const codeCount = new Map();
    mp4Files.forEach(file => {
      if (file.code) {
        const count = codeCount.get(file.code) || 0;
        codeCount.set(file.code, count + 1);
      }
    });

    const duplicateCodes = [];
    codeCount.forEach((count, code) => {
      if (count > 1) {
        duplicateCodes.push({ code, count });
      }
    });

    console.log(`\n🔄 重复的番号 (${duplicateCodes.length}个):`);
    if (duplicateCodes.length > 0) {
      duplicateCodes.forEach(item => {
        console.log(`   ${item.code} - 出现 ${item.count} 次`);
        const duplicateFiles = mp4Files.filter(file => file.code === item.code);
        duplicateFiles.forEach(file => {
          console.log(`     - ${file.filename} (${file.sizeInGB}GB)`);
        });
      });
    } else {
      console.log('   无');
    }

    // 详细统计
    console.log(`\n📊 详细统计:`);
    console.log(`   总视频文件数: ${mp4Files.length}`);
    console.log(`   有番号的文件数: ${mp4Files.filter(file => file.code).length}`);
    console.log(`   没有番号的文件数: ${filesWithoutCode.length}`);
    console.log(`   唯一番号数量: ${fileCodeSet.size}`);
    console.log(`   重复番号数量: ${duplicateCodes.length}`);
    
    // 验证计算
    const hasCodeCount = mp4Files.filter(file => file.code).length;
    const expectedUniqueCount = hasCodeCount - duplicateCodes.reduce((sum, item) => sum + (item.count - 1), 0);
    console.log(`   预期唯一番号数量: ${expectedUniqueCount} (有番号文件数 - 重复数)`);
    
    if (expectedUniqueCount !== fileCodeSet.size) {
      console.log(`   ⚠️  计算不匹配！可能存在数据问题`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ 比对完成！');

  } catch (error) {
    console.error('❌ 比对过程中发生错误:', error);
  }
}

// 运行比对
compareData();