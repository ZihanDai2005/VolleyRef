export function showToastHint(message: string): void {
  const text = String(message || "").trim();
  if (!text) {
    return;
  }
  wx.showToast({ title: text, icon: "none", duration: 2600 });
}

export function showBlockHint(message: string): void {
  const text = String(message || "").trim();
  if (!text) {
    return;
  }
  wx.showModal({
    title: "提示",
    content: text,
    showCancel: false,
    confirmText: "知道了",
  });
}
