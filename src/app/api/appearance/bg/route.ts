import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getUserDataPath } from "@/utils/paths";

// 背景原图存取：不做任何压缩，桌面壁纸级清晰度
// POST 上传原图（body = 原始图片字节），GET 读取

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

const MAX_BYTES = 25 * 1024 * 1024;

function findBgFile(files: string[]): string | undefined {
  return files.find((name) => /^bg-image\.(jpe?g|png|webp|gif|avif)$/i.test(name));
}

export async function GET() {
  const dir = getUserDataPath();
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  const file = findBgFile(files);
  if (!file) {
    return NextResponse.json({ error: "尚未上传背景图" }, { status: 404 });
  }

  const buffer = await fs.readFile(path.join(dir, file));
  const ext = file.split(".").pop()!.toLowerCase();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream",
      // URL 带 ?v= 时间戳，重传即自动换 URL 破缓存
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function POST(request: Request) {
  const rawType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = EXT_BY_CONTENT_TYPE[rawType];
  if (!ext) {
    return NextResponse.json({ error: "仅支持 jpg / png / webp / gif / avif 图片" }, { status: 400 });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: "图片内容为空" }, { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: "图片超过 25MB 限制" }, { status: 413 });
  }

  const dir = getUserDataPath();
  await fs.mkdir(dir, { recursive: true });

  // 清掉旧扩展名的背景文件，只保留当前这张
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    files.filter((name) => /^bg-image\./i.test(name)).map((name) => fs.unlink(path.join(dir, name)).catch(() => {}))
  );

  await fs.writeFile(path.join(dir, `bg-image.${ext}`), buffer);
  return NextResponse.json({ url: `/api/appearance/bg?v=${Date.now()}` });
}
