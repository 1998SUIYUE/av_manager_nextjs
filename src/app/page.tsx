"use client";
import FolderSelector from "./FolderSelector";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    // 带 ?change=1 = 用户主动来更改目录，跳过自动重定向
    const changing = new URLSearchParams(window.location.search).has("change");
    setIsChanging(changing);
    if (changing) return;

    async function checkDirectory() {
      try {
        const response = await fetch("/api/movies", { method: "PUT" });
        if (response.ok) {
          router.push("/movies-v2");
        }
      } catch (error) {
        console.error("Error checking movie directory:", error);
      }
    }
    checkDirectory();
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold">{isChanging ? "更改影片目录" : "Movie Scanner"}</h1>
      <FolderSelector />
    </div>
  );
}
