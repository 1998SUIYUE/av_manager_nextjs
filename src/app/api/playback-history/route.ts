import { NextResponse } from "next/server";
import {
  getAllPlaybackHistory,
  getPlaybackHistory,
  recordPlaybackHistory,
  PlaybackEventType,
} from "@/lib/playbackHistoryCache";

function isPlaybackEventType(value: unknown): value is PlaybackEventType {
  return value === "start" || value === "progress" || value === "ended";
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const absolutePath = searchParams.get("path");

  if (absolutePath) {
    return NextResponse.json({ history: await getPlaybackHistory(absolutePath) });
  }

  const history = Array.from((await getAllPlaybackHistory()).values()).sort(
    (a, b) => b.lastPlayedAt - a.lastPlayedAt
  );
  return NextResponse.json({ history });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!isPlaybackEventType(body.event) || typeof body.absolutePath !== "string" || !body.absolutePath) {
      return NextResponse.json({ error: "缺少播放事件或文件路径" }, { status: 400 });
    }

    const history = await recordPlaybackHistory({
      event: body.event,
      absolutePath: body.absolutePath,
      filename: typeof body.filename === "string" ? body.filename : undefined,
      code: typeof body.code === "string" ? body.code : undefined,
      currentTime: typeof body.currentTime === "number" ? body.currentTime : undefined,
      duration: typeof body.duration === "number" ? body.duration : undefined,
    });

    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存播放历史失败" },
      { status: 500 }
    );
  }
}
