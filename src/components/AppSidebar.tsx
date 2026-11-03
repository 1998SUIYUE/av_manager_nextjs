"use client";

// 左侧应用侧栏（方案 C）：影片库 / 对战 / 外观 导航
import React from "react";

interface AppSidebarProps {
  onOpenDuel: () => void;
  onOpenAppearance: () => void;
  appearanceActive: boolean;
  onChangeDirectory: () => void;
}

function navBtnCls(active: boolean): string {
  return `flex h-10 w-10 items-center justify-center rounded-[10px] transition ${
    active
      ? "border border-accent/50 bg-accent/10 text-accent"
      : "text-muted hover:bg-white/[0.06] hover:text-ink"
  }`;
}

export default function AppSidebar({ onOpenDuel, onOpenAppearance, appearanceActive, onChangeDirectory }: AppSidebarProps) {
  return (
    <aside className="app-no-drag fixed inset-y-0 left-0 z-40 flex w-14 flex-col items-center gap-1.5 border-r border-line bg-[#0c0c0d] py-3">
      <img
        src="/icon.ico"
        alt="AV Manager"
        draggable={false}
        className="mb-1 h-8 w-8 rounded-lg object-contain"
        title="AV Manager"
      />
      <div className="mb-1 h-px w-7 bg-[rgba(255,255,255,0.08)]" />

      <button type="button" className={navBtnCls(true)} title="影片库（当前页面）" aria-current="page">
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 21h8M12 18v3" />
        </svg>
      </button>

      <button type="button" onClick={onOpenDuel} className={navBtnCls(false)} title="影片对战">
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 3h12l3 6-9 12L3 9z" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onOpenAppearance}
        aria-pressed={appearanceActive}
        className={navBtnCls(appearanceActive)}
        title="外观设置"
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" />
        </svg>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onChangeDirectory}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] text-muted transition hover:bg-white/[0.06] hover:text-ink"
        title="更改影片目录"
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M14 13h4M14 13l2-2M14 13l2 2" />
        </svg>
      </button>
    </aside>
  );
}
