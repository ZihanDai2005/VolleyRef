export type SafePadResult = {
  safePadTop: string;
  safePadRight: string;
  safePadBottom: string;
  safePadLeft: string;
  sideInset: number;
  windowWidth: number;
  windowHeight: number;
  safeAreaAvailable: boolean;
  safeEdges: [number, number, number, number];
  insetEdges: [number, number, number, number];
};

export function computeLandscapeSafePad(wxLike: typeof wx): SafePadResult {
  const info: any = (wxLike as any).getWindowInfo ? (wxLike as any).getWindowInfo() : wxLike.getSystemInfoSync();
  const safe = info && info.safeArea;
  const windowWidth = Number(info && info.windowWidth) || Number(info && info.screenWidth) || 0;
  const windowHeight = Number(info && info.windowHeight) || Number(info && info.screenHeight) || 0;
  if (!safe || !windowWidth || !windowHeight) {
    const minSideInset = 25;
    return {
      safePadTop: "10px",
      safePadRight: String(minSideInset) + "px",
      safePadBottom: "25px",
      safePadLeft: String(minSideInset) + "px",
      sideInset: minSideInset,
      windowWidth,
      windowHeight,
      safeAreaAvailable: false,
      safeEdges: [0, 0, 0, 0],
      insetEdges: [0, 0, 0, 0],
    };
  }

  const insetTop = Math.max(0, Number(safe.top) || 0);
  const insetLeft = Math.max(0, Number(safe.left) || 0);
  const insetRight = Math.max(0, windowWidth - (Number(safe.right) || windowWidth));
  const insetBottom = Math.max(0, windowHeight - (Number(safe.bottom) || windowHeight));
  // 优先使用左右安全边距；若机型上报左右为 0，则回退使用 top/bottom（横屏下刘海常体现在这两个值）。
  const sideInsetRaw = Math.max(insetLeft, insetRight) || Math.max(insetTop, insetBottom);
  const minSideInset = 25;
  const sideInset = Math.max(minSideInset, sideInsetRaw);

  return {
    safePadTop: "10px",
    safePadRight: String(sideInset) + "px",
    safePadBottom: "25px",
    safePadLeft: String(sideInset) + "px",
    sideInset,
    windowWidth,
    windowHeight,
    safeAreaAvailable: true,
    safeEdges: [Number(safe.top) || 0, Number(safe.left) || 0, Number(safe.right) || 0, Number(safe.bottom) || 0],
    insetEdges: [insetTop, insetLeft, insetRight, insetBottom],
  };
}
