// /movies-v2 外观设置（对齐 MARGIN 扩展的设置语义）
// - bg: { mode, intensity } ↔ MARGIN 的 bg:{mode,shader,intensity}（shader 用 CSS 极光近似复刻）
// - columns: 0 = 自动（同 MARGIN 的 cols:0），4/6 为固定每行列数
// - 持久化在服务端 userData/appearance.json，与浏览器、访问端口、服务重启解耦
//   （原 localStorage 方案在换端口/换浏览器/清理型环境下会丢设置，已废弃）

export type BgMode = "off" | "aurora" | "image";
export type ColumnSetting = 0 | 4 | 6;

export interface AppearanceSettings {
  bgMode: BgMode;
  bgIntensity: number; // 0 ~ 1，默认 0.6（同 MARGIN 默认值）
  bgImageUrl: string; // 用户自填的图片 URL，或本地上传压缩后的 dataURL
  columns: ColumnSetting;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  bgMode: "aurora",
  bgIntensity: 0.6,
  bgImageUrl: "",
  columns: 0,
};

export function parseAppearance(input: unknown): AppearanceSettings {
  const parsed = (input ?? {}) as Partial<AppearanceSettings>;
  const bgMode: BgMode =
    parsed.bgMode === "off" || parsed.bgMode === "aurora" || parsed.bgMode === "image"
      ? parsed.bgMode
      : DEFAULT_APPEARANCE.bgMode;
  const columns: ColumnSetting = parsed.columns === 4 || parsed.columns === 6 ? parsed.columns : 0;
  return {
    bgMode,
    bgIntensity:
      typeof parsed.bgIntensity === "number"
        ? Math.min(1, Math.max(0, parsed.bgIntensity))
        : DEFAULT_APPEARANCE.bgIntensity,
    bgImageUrl: typeof parsed.bgImageUrl === "string" ? parsed.bgImageUrl : "",
    columns,
  };
}

export async function fetchAppearance(): Promise<AppearanceSettings> {
  const response = await fetch("/api/appearance");
  if (!response.ok) throw new Error("读取外观设置失败");
  return parseAppearance(await response.json());
}

export async function saveAppearance(settings: AppearanceSettings): Promise<boolean> {
  try {
    const response = await fetch("/api/appearance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    return response.ok;
  } catch {
    return false;
  }
}
