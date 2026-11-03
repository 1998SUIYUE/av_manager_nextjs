"use client";

// 外观设置面板：视觉复刻 MARGIN 扩展的 popup（衬线标题 + mono 大字距小标 + 发丝线行 + seg 分段控件）
import React, { useRef, useState } from "react";
import type { AppearanceSettings, BgMode, ColumnSetting } from "@/lib/appearance";

interface AppearancePanelProps {
  settings: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
  onClose: () => void;
}

const BG_MODES: Array<{ value: BgMode; label: string }> = [
  { value: "off", label: "关" },
  { value: "aurora", label: "极光" },
  { value: "image", label: "图片" },
];

const COLUMN_OPTIONS: Array<{ value: ColumnSetting; label: string }> = [
  { value: 0, label: "自动" },
  { value: 6, label: "6 列" },
  { value: 4, label: "4 列" },
];

// 背景图直传服务端（/api/appearance/bg），原图保存、不做任何压缩，
// 像素级等同桌面壁纸（旧的 localStorage dataURL 压缩方案已废弃）
async function uploadBackground(file: File): Promise<string> {
  const response = await fetch("/api/appearance/bg", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || !data?.url) {
    throw new Error(data?.error || "上传失败");
  }
  return data.url;
}

export default function AppearancePanel({ settings, onChange, onClose }: AppearancePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setNotice(null);
    try {
      const url = await uploadBackground(file);
      onChange({ bgMode: "image", bgImageUrl: url });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片上传失败，请换一张试试");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="关闭外观设置"
        onClick={onClose}
        className="fixed inset-0 z-[55] cursor-default"
      />
      <aside className="hair glass fixed right-4 top-4 z-[60] w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl p-5">
        <h2 className="font-serif text-xl tracking-wide text-ink">外观</h2>
        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
          Appearance · Margin Style
        </div>

        {/* 背景 */}
        <div className="mt-4 border-t border-line pt-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink">背景</span>
            <Seg options={BG_MODES} value={settings.bgMode} onSelect={(v) => onChange({ bgMode: v })} />
          </div>

          {settings.bgMode === "image" && (
            <div className="mt-3 space-y-2">
              <input
                type="url"
                value={settings.bgImageUrl.startsWith("data:") ? "" : settings.bgImageUrl}
                onChange={(e) => onChange({ bgImageUrl: e.target.value })}
                placeholder="粘贴图片链接 https://…"
                className="hair h-9 w-full rounded-lg bg-white/[0.05] px-3 text-xs text-ink outline-none transition placeholder:text-faint focus:border-accent/60"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                  className="hair h-9 flex-1 rounded-lg bg-chip text-xs text-ink transition hover:border-accent/50 hover:text-accent disabled:opacity-50"
                >
                  {importing ? "处理中…" : "上传本地图片"}
                </button>
                {settings.bgImageUrl && (
                  <button
                    type="button"
                    onClick={() => onChange({ bgImageUrl: "" })}
                    className="hair h-9 rounded-lg bg-chip px-3 text-xs text-muted transition hover:text-danger"
                  >
                    清除
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              {notice && <div className="text-[11px] text-danger">{notice}</div>}
            </div>
          )}

          {settings.bgMode !== "off" && (
            <div className="mt-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted">浓度</span>
                <span className="font-mono text-xs text-ink">{Math.round(settings.bgIntensity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.bgIntensity * 100)}
                onChange={(e) => onChange({ bgIntensity: Number(e.target.value) / 100 })}
                className="mt-1.5 w-full accent-[#00aeec]"
                aria-label="背景浓度"
              />
            </div>
          )}
        </div>

        {/* 每行列数 */}
        <div className="mt-3.5 border-t border-line pt-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink">每行影片数</span>
            <Seg
              options={COLUMN_OPTIONS}
              value={settings.columns}
              onSelect={(v) => onChange({ columns: v })}
            />
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-faint">
            {settings.columns === 0 ? "AUTO · 按窗口宽度自适应" : `固定每行 ${settings.columns} 个（窄屏自动降级）`}
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-3 font-mono text-[10px] leading-4 text-faint">
          设置与背景图保存在服务端 · 背景原图不压缩
        </div>
      </aside>
    </>
  );
}

function Seg<T extends string | number>({
  options,
  value,
  onSelect,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="seg flex shrink-0 rounded-[10px] bg-chip p-[3px]">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onSelect(option.value)}
          className={`rounded-[7px] px-2.5 py-1 text-xs transition ${
            value === option.value
              ? "bg-white/[0.12] text-ink shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
              : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
