import { isRoomIdBlockedAsync, reserveRoomIdAsync } from "../../utils/room-service";
import { showBlockHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

Page({
  data: {
    createBtnFx: false,
    joinBtnFx: false,
  },
  themeOff: null as null | (() => void),
  creating: false as boolean,

  onLoad() {
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
        wx.setNavigationBarTitle({ title: "" });
      });
    }
  },

  onShow() {
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
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
});
