import { NextResponse } from "next/server";
import fs from "fs/promises";
import { getAppearancePath } from "@/utils/paths";
import { DEFAULT_APPEARANCE, parseAppearance } from "@/lib/appearance";

export async function GET() {
  try {
    const raw = await fs.readFile(getAppearancePath(), "utf-8");
    return NextResponse.json(parseAppearance(JSON.parse(raw)));
  } catch {
    // 文件不存在或损坏时回默认值，页面可正常渲染
    return NextResponse.json(DEFAULT_APPEARANCE);
  }
}

export async function POST(request: Request) {
  try {
    const settings = parseAppearance(await request.json());
    await fs.writeFile(getAppearancePath(), JSON.stringify(settings), "utf-8");
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存外观设置失败" },
      { status: 500 }
    );
  }
}
