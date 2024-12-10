![示例图片](public/exmple.png)
# 项目名称
这是一个用于管理电影的 Next.js 应用程序，旨在提供一个用户友好的界面来浏览、搜索和管理电影信息。

## 使用方法

1. 克隆这个仓库：
   ```bash
   git clone https://github.com/1998SUIYUE/av_manager_nextjs.git
   ```

2. 进入项目目录：
   ```bash
   cd av_manager_nextjs
   ```

3. 安装依赖：
   ```bash
   npm install
   ```

4. 运行开发服务器：
   ```bash
   npm run dev
   ```

5. 打开浏览器访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## 注意事项
第一次打开时会获取电影数据，请耐心等待。
在网页播放的时候,点击视频左上角的文件名会删除本地文件,这是为了快速删除不喜欢的文件.如果影响你的使用，可以在文件中删除这个功能。
在my-nextjs-app\src\components\VideoPlayer.tsx搜索onClick={openInExplorer}并注释掉即可