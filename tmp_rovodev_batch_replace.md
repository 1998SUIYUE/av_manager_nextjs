# 批量替换 Logger 函数的说明

由于项目中有大量的 logger 函数调用需要替换，建议你使用以下方法：

## 方法1：使用 VS Code 全局替换

1. 在 VS Code 中按 `Ctrl+Shift+H` 打开全局替换
2. 逐个替换以下内容：

### 替换 import 语句：
```
查找: import { logWithTimestamp, warnWithTimestamp, errorWithTimestamp } from '@/utils/logger';
替换: import { devWithTimestamp } from '@/utils/logger';
```

```
查找: import { logWithTimestamp, errorWithTimestamp } from '@/utils/logger';
替换: import { devWithTimestamp } from '@/utils/logger';
```

```
查找: import { logWithTimestamp } from '@/utils/logger';
替换: import { devWithTimestamp } from '@/utils/logger';
```

### 替换函数调用：
```
查找: logWithTimestamp
替换: devWithTimestamp
```

```
查找: warnWithTimestamp
替换: devWithTimestamp
```

```
查找: errorWithTimestamp
替换: devWithTimestamp
```

## 方法2：使用命令行 (如果你有 sed 或类似工具)

```bash
# 在项目根目录执行
find src -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/logWithTimestamp/devWithTimestamp/g'
find src -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/warnWithTimestamp/devWithTimestamp/g'
find src -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/errorWithTimestamp/devWithTimestamp/g'
```

## 已经替换的文件：
- ✅ src/lib/movieMetadataCache.ts (import)
- ✅ src/app/api/movies/route.ts (import)
- ✅ src/app/api/image-proxy/route.ts (import)
- ✅ src/app/api/image-serve/[filename]/route.ts (import)
- ✅ src/app/image-cache/[filename]/route.ts (import)
- ✅ src/app/api/movies/rating/route.ts (import)

## 还需要替换的文件：
- src/lib/fileScanner.ts
- src/app/api/movies/delete-file/route.ts
- src/app/movies/page.tsx
- src/components/VideoPlayer.tsx
- src/app/api/movies/rating/route.optimized.ts
- src/app/api/video/stream/route.ts

建议使用 VS Code 的全局替换功能，这样最安全也最快速。