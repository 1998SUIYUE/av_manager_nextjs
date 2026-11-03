import { NextResponse } from "next/server";
import { devWithTimestamp } from "@/utils/logger";
import { deleteMovieFiles } from "@/lib/movieDeletion";

export async function DELETE(request: Request) {
  try {
    const { filePaths } = await request.json();

    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      devWithTimestamp("[API - DELETE-BATCH] 未提供文件路径列表");
      return NextResponse.json({ error: "未提供文件路径列表" }, { status: 400 });
    }

    devWithTimestamp(`[API - DELETE-BATCH] 收到批量删除请求，共 ${filePaths.length} 个文件`);

    const results = await deleteMovieFiles(filePaths.map((p: string) => decodeURIComponent(p)));

    const succeeded = results.filter((r) => r.status === "deleted").length;
    const failed = results.length - succeeded;
    devWithTimestamp(`[API - DELETE-BATCH] 批量删除完成: 成功 ${succeeded}, 失败 ${failed}`);

    return NextResponse.json({
      results,
      summary: {
        requested: filePaths.length,
        succeeded,
        failed,
      },
    });
  } catch (error) {
    devWithTimestamp("[API - DELETE-BATCH] 批量删除时发生错误:", error);
    return NextResponse.json({ error: "批量删除时发生错误" }, { status: 500 });
  }
}
