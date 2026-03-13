import { getRoomAsync, isRoomIdBlockedAsync, reserveRoomIdAsync, verifyRoomPasswordAsync } from "../../utils/room-service";
import { showBlockHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";
import { clearLastRoomEntry, readLastRoomEntry } from "../../utils/last-room-entry";

Page({
  data: {
    createBtnFx: false,
    joinBtnFx: false,
    quickResumeVisible: false,
    quickResumeRoomId: "",
    quickResumeTitle: "",
    quickResumeSubtitle: "",
    quickResumeBusy: false,
    customNavTop: "10px",
    customNavOffset: "54px",
  },
  themeOff: null as null | (() => void),
  creating: false as boolean,
  quickResumeCheckToken: 0 as number,

  onLoad() {
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
        wx.setNavigationBarTitle({ title: "" });
        this.syncCustomNavTop();
      });
    }
  },

  onShow() {
    wx.hideLoading({
      fail: () => {},
    });
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
    [80, 220, 420, 1000].forEach((delay) => {
      setTimeout(() => {
        this.syncCustomNavTop();
      }, delay);
    });
    void this.refreshQuickResumeEntry();
  },

  onUnload() {
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
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
        // Align custom 44px nav row to the capsule center.
        navTop = menu.top - (44 - menu.height) / 2;
      }
    } catch (_e) {}
    const roundedTop = Math.max(0, Math.round(navTop));
    this.setData({
      customNavTop: String(roundedTop) + "px",
      customNavOffset: String(roundedTop + 44) + "px",
    });
  },

  generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  async reserveWithTimeout(roomId: string, clientId: string, timeoutMs = 2000): Promise<boolean> {
    try {
      const result = await Promise.race<boolean>([
        reserveRoomIdAsync(roomId, clientId),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
      ]);
      return !!result;
    } catch (e) {
      return false;
    }
  },

  async allocateRoomId(clientId: string): Promise<string> {
    const deadline = Date.now() + 12000;
    let attempts = 0;
    while (attempts < 120 && Date.now() < deadline) {
      const roomId = this.generateRoomId();
      attempts += 1;
      if (await this.reserveWithTimeout(roomId, clientId)) {
        return roomId;
      }
      // Only do an extra blocked check when reserve failed, to avoid doubled request cost.
      if (await isRoomIdBlockedAsync(roomId)) {
        continue;
      }
    }
    return "";
  },

  async onCreateRoomSubmit() {
    if (this.creating) {
      return;
    }
    this.creating = true;
    wx.showLoading({ title: "初始化中", mask: true });
    const clientId = getApp<IAppOption>().globalData.clientId;
    try {
      const roomId = await this.allocateRoomId(clientId);
      if (!roomId) {
        showBlockHint("系统繁忙，请重试");
        return;
      }
      wx.navigateTo({
        url: "/pages/create-room/create-room?roomId=" + roomId + "&create=1",
      });
    } finally {
      this.creating = false;
      wx.hideLoading();
    }
  },

  onCreateEntryTap() {
    this.setData({ createBtnFx: true });
    setTimeout(() => {
      this.setData({ createBtnFx: false });
      this.onCreateRoomSubmit();
    }, 150);
  },

  onJoinEntryTap() {
    this.setData({ joinBtnFx: true });
    setTimeout(() => {
      this.setData({ joinBtnFx: false });
      this.onGoJoinPage();
    }, 150);
  },

  onGoJoinPage() {
    wx.navigateTo({ url: "/pages/join-match/join-match" });
  },

  async refreshQuickResumeEntry() {
    const token = ++this.quickResumeCheckToken;
    const cached = readLastRoomEntry();
    if (!cached) {
      this.setData({
        quickResumeVisible: false,
        quickResumeRoomId: "",
        quickResumeTitle: "",
        quickResumeSubtitle: "",
      });
      return;
    }
    try {
      const check = await verifyRoomPasswordAsync(cached.roomId, cached.password);
      if (token !== this.quickResumeCheckToken) {
        return;
      }
      if (!check.ok) {
        clearLastRoomEntry();
        this.setData({
          quickResumeVisible: false,
          quickResumeRoomId: "",
          quickResumeTitle: "",
          quickResumeSubtitle: "",
        });
        return;
      }
      const room = await getRoomAsync(cached.roomId);
      if (token !== this.quickResumeCheckToken) {
        return;
      }
      const status = room && room.status === "result" ? "result" : room && room.status === "match" ? "match" : "";
      if (!room || !status) {
        clearLastRoomEntry();
        this.setData({
          quickResumeVisible: false,
          quickResumeRoomId: "",
          quickResumeTitle: "",
          quickResumeSubtitle: "",
        });
        return;
      }
      const teamAName = String((room.teamA && room.teamA.name) || "甲");
      const teamBName = String((room.teamB && room.teamB.name) || "乙");
      this.setData({
        quickResumeVisible: true,
        quickResumeRoomId: cached.roomId,
        quickResumeTitle: status === "result" ? "返回上次比赛结果" : "继续上次比赛",
        quickResumeSubtitle: "裁判团队 " + cached.roomId + " · " + teamAName + " vs " + teamBName,
      });
    } catch (_e) {
      if (token !== this.quickResumeCheckToken) {
        return;
      }
      this.setData({
        quickResumeVisible: false,
      });
    }
  },

  async onQuickResumeTap() {
    if (this.data.quickResumeBusy || this.creating) {
      return;
    }
    const cached = readLastRoomEntry();
    if (!cached) {
      this.setData({ quickResumeVisible: false });
      return;
    }
    this.setData({ quickResumeBusy: true });
    wx.showLoading({
      title: "进入中",
      mask: true,
    });
    try {
      const check = await verifyRoomPasswordAsync(cached.roomId, cached.password);
      if (!check.ok) {
        clearLastRoomEntry();
        this.setData({
          quickResumeVisible: false,
          quickResumeRoomId: "",
          quickResumeTitle: "",
          quickResumeSubtitle: "",
        });
        showBlockHint((check && check.message) || "该房间不可进入");
        return;
      }
      const room = await getRoomAsync(cached.roomId);
      const status = room && room.status === "result" ? "result" : room && room.status === "match" ? "match" : "";
      if (!room || !status) {
        clearLastRoomEntry();
        this.setData({
          quickResumeVisible: false,
          quickResumeRoomId: "",
          quickResumeTitle: "",
          quickResumeSubtitle: "",
        });
        showBlockHint((check && check.message) || "该房间不可进入");
        return;
      }
      const url =
        status === "result"
          ? "/pages/result/result?roomId=" + cached.roomId
          : "/pages/match/match?roomId=" + cached.roomId;
      wx.reLaunch({ url });
    } finally {
      wx.hideLoading({
        fail: () => {},
      });
      this.setData({ quickResumeBusy: false });
    }
  },
});
