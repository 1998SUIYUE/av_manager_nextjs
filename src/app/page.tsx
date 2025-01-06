"use client";
import FolderSelector from "./FolderSelector";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function checkDirectory() {
      try {
        const response = await fetch("/api/movies", { method: "PUT" });
        // console.log("put response:", response);
        if (response.ok) {
          router.push("/movies");
        }
      } catch (error) {
        console.error("Error checking movie directory:", error);
      }
    }
    checkDirectory();
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold"> Movie Scanner</h1>
      <FolderSelector />
    </div>
  );
}
