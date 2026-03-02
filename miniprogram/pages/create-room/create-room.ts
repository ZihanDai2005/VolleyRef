import { isRoomIdBlockedAsync, reserveRoomIdAsync } from "../../utils/room-service";
import { showBlockHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

Page({
  data: {
    createBtnFx: false,
    joinBtnFx: false,
  },
  themeOff: null as null | (() => void),

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

  async allocateRoomId(clientId: string): Promise<string> {
    let attempts = 0;
    while (attempts < 5000) {
      const roomId = this.generateRoomId();
      attempts += 1;
      if (await isRoomIdBlockedAsync(roomId)) {
        continue;
      }
      if (await reserveRoomIdAsync(roomId, clientId)) {
        return roomId;
      }
    }
    return "";
  },

  async onCreateRoomSubmit() {
    const clientId = getApp<IAppOption>().globalData.clientId;

    const roomId = await this.allocateRoomId(clientId);
    if (!roomId) {
      showBlockHint("系统繁忙，请稍后重试");
      return;
    }

    wx.navigateTo({
      url: "/pages/room/room?roomId=" + roomId + "&create=1",
    });
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
