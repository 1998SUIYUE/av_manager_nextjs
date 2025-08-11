# 电影列表懒加载功能实现计划

## 1. 目标

创建一个新的电影展示页面，采用“懒加载”模式，以显著提升初始页面加载速度和用户体验。此实现将通过创建新文件来完成，不修改任何现有代码，以确保旧有功能的稳定性。

## 2. 核心策略

1.  **快速列表接口**：创建一个新的后端API，它只负责扫描文件系统并快速返回一个基础的电影文件列表，不包含任何需要网络抓取的元数据。
2.  **按需详情接口**：创建另一个新的后端API，它根据前端请求，为单个电影获取详细的元数据（封面、标题等），并利用现有缓存机制。
3.  **智能前端组件**：创建一个新的“智能”电影卡片组件，该组件在渲染后，自己负责调用详情接口来加载并显示自己的数据。
4.  **新路由页面**：创建一个新的页面路由 (`/movies-lazy`) 来承载新的懒加载功能。

## 3. 后端实现 (`/src/app/api`)

### 3.1. 文件: `src/app/api/movies-list/route.ts` (新)

*   **用途**: 提供一个快速、轻量级的电影文件列表。
*   **函数: `GET(request)`**
    *   **复用**: 调用 `getStoredDirectory()` 函数来获取电影目录。
    *   **复用**: 调用一个**简化版**的 `scanMovieDirectory()` 函数。
        *   此函数只进行文件系统扫描，构建并返回一个包含 `MovieFile` 基础信息的对象数组（`filename`, `path`, `absolutePath`, `size`, `code` 等）。
        *   **关键**: 此函数**不会**调用 `processMovieFiles` 或 `fetchCoverUrl`，从而避免任何耗时的网络操作。
    *   **输出**: 直接以JSON格式返回 `MovieFile[]` 数组。

### 3.2. 文件: `src/app/api/movie-details/[code]/route.ts` (新)

*   **用途**: 获取单个电影的详细元数据。URL将类似于 `/api/movie-details/ABC-123`。
*   **函数: `GET(request, { params })`**
    *   从 `params` 中解析出电影的 `code`。
    *   从 `request` 中获取 `baseUrl`。
    *   **复用缓存逻辑**: 
        1.  调用 `getCachedMovieMetadata(code)` 检查本地JSON缓存。
        2.  **如果缓存命中**: 立即返回缓存中的数据。
        3.  **如果缓存未命中**: 
            *   **复用**: 调用现有的 `fetchCoverUrl(code, baseUrl)` 函数。此函数已包含从DMM抓取、调用Javbus备用源、以及将结果存入缓存的完整逻辑。
            *   将 `fetchCoverUrl` 返回的结果作为API的响应输出。

## 4. 前端实现 (`/src`)

### 4.1. 文件: `src/components/MovieCardLazy.tsx` (新)

*   **用途**: 一个能自己获取数据的“智能”电影卡片。
*   **Props**: 接收一个基础的 `movie` 对象，至少包含 `{ code, filename, absolutePath }`。
*   **内部 State**:
    *   `details: MovieData | null`
    *   `isLoading: boolean`
    *   `error: string | null`
*   **核心逻辑: `useEffect` Hook**
    *   在组件首次渲染后触发。
    *   调用 `fetch(\`/api/movie-details/${props.movie.code}\`)`。
    *   根据请求的成功、失败来更新 `details`, `isLoading`, `error` 状态。
*   **渲染逻辑 (Render)**:
    *   当 `isLoading` 为 `true` 时，显示一个统一的占位骨架屏（例如一个灰色的方块加一个加载动画）。
    *   当 `error` 不为 `null` 时，显示一个错误提示。
    *   当 `details` 获取成功后，渲染电影的封面、标题等信息。这部分的UI代码可以直接从现有的 `MovieCard.tsx` 中复用。

### 4.2. 文件: `src/app/movies-lazy/page.tsx` (新)

*   **用途**: 新的懒加载电影展示页，可通过 `/movies-lazy` 访问。
*   **核心逻辑**:
    *   在页面加载时，调用 `/api/movies-list` 接口，快速获取基础电影列表，并存入 `movies` 状态。
    *   使用 `.map()` 方法遍历 `movies` 数组。
    *   为列表中的每一个 `movie` 对象，渲染一个 `<MovieCardLazy movie={movie} />` 组件。
*   **排序与筛选**:
    *   页面顶部的“排序”和“筛选”等UI控件将被保留。
    *   **注意**: 在初始版本中，这些功能只能基于已有的基础信息（如按文件名、文件大小排序）工作。基于元数据（如演员、评分）的筛选和排序功能，需要等所有卡片都加载完数据后才能精确实现，这部分可作为后续优化。
