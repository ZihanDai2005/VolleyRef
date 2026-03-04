import { getRoomAsync } from "../../utils/room-service";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

Page({
  data: {
    roomId: "",
    customNavTop: "10px",
    customNavOffset: "54px",
    clearCountdownText: "",
  },
  themeOff: null as null | (() => void),
  countdownTimer: 0 as number,
  resultExpireAt: 0 as number,

  onLoad(query: Record<string, string>) {
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
        wx.setNavigationBarTitle({ title: "" });
      });
    }
    const roomId = String((query && query.roomId) || "");
    if (!roomId) {
      wx.reLaunch({ url: "/pages/home/home" });
      return;
    }
    this.setData({ roomId });
    this.ensureRoom(roomId);
  },

  onShow() {
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
    this.startCountdown();
  },

  onHide() {
    this.stopCountdown();
  },

  onUnload() {
    this.stopCountdown();
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
  },

  async ensureRoom(roomId: string) {
    const room = await getRoomAsync(roomId);
    if (!room) {
      wx.showModal({
        title: "房间已失效",
        content: "该裁判团队不存在或已过期，请返回首页。",
        showCancel: false,
        confirmText: "返回首页",
        success: () => {
          wx.reLaunch({ url: "/pages/home/home" });
        },
      });
      return;
    }
    if (room.status !== "result") {
      wx.redirectTo({ url: "/pages/match/match?roomId=" + roomId });
      return;
    }
    this.resultExpireAt = Math.max(0, Number((room as any).resultExpireAt || 0));
    this.refreshCountdownText();
  },

  applyNavigationTheme() {
    applyNavigationBarTheme();
  },

  syncCustomNavTop() {
    const sys = wx.getSystemInfoSync();
    const fallback = Number(sys.statusBarHeight || 0) + 6;
    let navTop = fallback;
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (
        menu &&
        typeof menu.top === "number" &&
        typeof menu.height === "number" &&
        menu.top >= 0 &&
        menu.height > 0
      ) {
        navTop = menu.top - (44 - menu.height) / 2;
      }
    } catch (e) {}
    const roundedTop = Math.max(0, Math.round(navTop));
    this.setData({
      customNavTop: String(roundedTop) + "px",
      customNavOffset: String(roundedTop + 44) + "px",
    });
  },

  onBackTap() {
    wx.reLaunch({ url: "/pages/home/home" });
  },

  startCountdown() {
    this.stopCountdown();
    this.refreshCountdownText();
    this.countdownTimer = setInterval(() => {
      this.refreshCountdownText();
    }, 30000) as unknown as number;
  },

  stopCountdown() {
    if (!this.countdownTimer) {
      return;
    }
    clearInterval(this.countdownTimer);
    this.countdownTimer = 0;
  },

  refreshCountdownText() {
    const expireAt = Math.max(0, Number(this.resultExpireAt || 0));
    if (!expireAt) {
      this.setData({ clearCountdownText: "" });
      return;
    }
    const remainMs = Math.max(0, expireAt - Date.now());
    const remainMin = Math.ceil(remainMs / 60000);
    const hours = Math.floor(remainMin / 60);
    const mins = remainMin % 60;
    const text =
      hours > 0
        ? "距离数据清除 剩余" + String(hours) + "小时" + String(mins) + "分钟"
        : "距离数据清除 剩余" + String(remainMin) + "分钟";
    this.setData({ clearCountdownText: text });
  },
});
