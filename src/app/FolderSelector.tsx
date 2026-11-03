"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function FolderSelector() {
  const [folderPath, setFolderPath] = useState<string>("");
  const [isElectron, setIsElectron] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setIsElectron(Boolean(window.electronAPI?.isElectron));
  }, []);

  const handleSubmit = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/movies", {
        method: "POST",
        body: JSON.stringify({ folderPath: trimmed }),
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        router.push("/movies-v2");
        return;
      }
      setError("目录保存失败，请重试");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickFolder = async () => {
    const selected = await window.electronAPI?.selectFolder();
    if (selected) {
      setFolderPath(selected);
      await handleSubmit(selected);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        {isElectron ? (
          <button
            type="button"
            onClick={() => void handlePickFolder()}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 p-3 text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            {submitting ? "正在保存…" : "选择影片文件夹"}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit(folderPath);
            }}
            className="flex flex-col space-y-4"
          >
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="请输入电影目录路径 (例如: D:/Movies)"
              className="border p-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-blue-500 p-2 text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
            >
              {submitting ? "正在保存…" : "确认路径"}
            </button>
          </form>
        )}
        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        {folderPath && !isElectron && <p className="text-center text-gray-600">当前选择的路径: {folderPath}</p>}
      </div>
    </div>
  );
}
