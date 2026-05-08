import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FolderSelector() {
  const [folderPath, setFolderPath] = useState<string>("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const response = await fetch("/api/movies", {
      method: "POST",
      body: JSON.stringify({ folderPath }),
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      router.push("/movies-lazy");
      return;
    }

    console.error("Error saving folder:", response.statusText);
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md">
        <div className="flex flex-col space-y-4">
          <input
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="请输入电影目录路径 (例如: D:/Movies)"
            className="border p-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          />
          <button
            type="submit"
            className="rounded bg-blue-500 p-2 text-white transition-colors hover:bg-blue-600"
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
