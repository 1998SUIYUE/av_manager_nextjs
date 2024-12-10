import { useState } from 'react';
import { redirect } from 'next/navigation';


export default function FolderSelector() {
  const [folderPath, setFolderPath] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 发送请求到 /api/movies
    const response = await fetch('/api/movies', {
      method: 'POST',
      body: JSON.stringify({ folderPath }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      // 等待2秒
      // await new Promise((resolve) => setTimeout(resolve, 2000));
      redirect('/movies'); // 暂时注释掉重定向，以便查看响应数据
    } else {
      console.error('Error saving folder:', response.statusText);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md">
        <div className="flex flex-col space-y-4">
          <input
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="请输入文件夹路径 (例如: D:/Movies)"
            className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          />
          <button
            type="submit"
            className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition-colors"
          >
            确认路径
          </button>
        </div>
      </form>
      {folderPath && (
        <p className="mt-4 text-gray-600">
          当前选择的路径: {folderPath}
        </p>
      )}
    </div>
  );
}
