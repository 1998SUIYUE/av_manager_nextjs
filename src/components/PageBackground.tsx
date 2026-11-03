"use client";

// 页面背景层：复刻 MARGIN 的 #margin-bg（fixed 全屏、pointer-events:none、垫在最底层）
// - aurora：纯 CSS 渐变光斑近似复刻 MARGIN 的 WebGPU 极光 shader，无任何图片引用
// - image：使用用户运行时自填/上传的图片（URL 或 dataURL），叠深色纱保证前景可读
import React from "react";
import type { BgMode } from "@/lib/appearance";

interface PageBackgroundProps {
  mode: BgMode;
  intensity: number; // 0 ~ 1
  imageUrl: string;
}

export default function PageBackground({ mode, intensity, imageUrl }: PageBackgroundProps) {
  if (mode === "off") return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
      {mode === "image" && imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: 0.3 + 0.7 * intensity }}
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-canvas/85 via-canvas/40 to-canvas/90" />
        </>
      ) : (
        <div className="aurora" style={{ opacity: intensity }}>
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
          <span className="blob b4" />
          <div className="veil" />
        </div>
      )}
    </div>
  );
}
