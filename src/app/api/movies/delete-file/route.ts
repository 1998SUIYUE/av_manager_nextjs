import { NextResponse } from "next/server";
import { devWithTimestamp } from "@/utils/logger";
import { deleteMovieFile, MovieDeletionError } from "@/lib/movieDeletion";

export async function DELETE(request: Request) {
  try {
    const { filePath } = await request.json();

    if (!filePath) {
      devWithTimestamp("[API - DELETE] 未提供文件路径");
      return NextResponse.json({ error: "未提供文件路径" }, { status: 400 });
    }

    devWithTimestamp(`[API - DELETE] 尝试删除文件: ${filePath}`);

    const decodedFilePath = decodeURIComponent(filePath);
    devWithTimestamp(`[API - DELETE] 解码后的文件路径: ${decodedFilePath}`);

    const result = await deleteMovieFile(decodedFilePath);

    if (result.method === "bitcomet") {
      devWithTimestamp(`[API - DELETE] BitComet 任务及文件删除成功`);
      return NextResponse.json({
        message: "BitComet 任务及对应文件删除成功",
        task: {
          id: result.taskId,
          name: result.taskName,
        },
        status: "deleted",
      });
    }

    return NextResponse.json({ message: "文件删除成功" });
  } catch (error) {
    if (error instanceof MovieDeletionError) {
      devWithTimestamp(`[API - DELETE] 删除失败: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    devWithTimestamp("[API - DELETE] 删除文件时发生错误:", error);
    return NextResponse.json({ error: "删除文件时发生错误" }, { status: 500 });
  }
}
