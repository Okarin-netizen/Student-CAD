// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// この端末で AR が使えるか、どの方法で使うかを調べる。2026-11-20 追加。
//
//   quickLook … iPad・iPhone(Safari・Chrome など)。Apple の「AR クイックルック」で USDZ を開く
//   webxr     … Android の Chrome など。ブラウザの WebXR でカメラの映像に立体を重ねる
//   none      … Chromebook・Windows など、AR が使えない端末

export type ArMethod = "quickLook" | "webxr" | "none";

/** AR クイックルックが使えるか(<a rel="ar"> がわかるブラウザか) */
export function supportsQuickLook(): boolean {
  if (typeof document === "undefined") return false;
  const a = document.createElement("a");
  return a.relList?.supports?.("ar") === true;
}

/** WebXR の AR(immersive-ar)が使えるか */
export async function supportsWebXrAr(): Promise<boolean> {
  const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
  if (!xr || !window.isSecureContext) return false;
  try {
    return await xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

/** この端末で使う AR の方法。iPad を先に見る(iPad の WebXR は AR に使えないため) */
export async function detectArMethod(): Promise<ArMethod> {
  if (supportsQuickLook()) return "quickLook";
  if (await supportsWebXrAr()) return "webxr";
  return "none";
}
