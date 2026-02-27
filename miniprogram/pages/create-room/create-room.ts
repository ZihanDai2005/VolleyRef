import {
  getRoom,
  heartbeatRoom,
  isRoomIdBlocked,
  reserveRoomId,
  verifyRoomPassword,
} from "../../utils/room-service";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

Page({
  data: {
    createPassword: "",
    joinRoomId: "",
    joinPassword: "",
    createPasswordDots: "••••••",
    joinRoomIdDots: "••••••",
    joinPasswordDots: "••••••",
  },
  themeOff: null as null | (() => void),

  onLoad() {
    this.applyNavigationTheme();
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
      });
    }
  },

  onShow() {
    this.applyNavigationTheme();
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

  getRemainingDots(value: string) {
    return "•".repeat(Math.max(0, 6 - value.length));
  },

  onJoinRoomIdInput(e: WechatMiniprogram.Input) {
    const value = e.detail.value.replace(/\D/g, "").slice(0, 6);
    this.setData({
      joinRoomId: value,
      joinRoomIdDots: this.getRemainingDots(value),
    });
  },

  onCreatePasswordInput(e: WechatMiniprogram.Input) {
    const value = (e.detail.value || "").replace(/\D/g, "").slice(0, 6);
    this.setData({
      createPassword: value,
      createPasswordDots: this.getRemainingDots(value),
    });
  },

  onJoinPasswordInput(e: WechatMiniprogram.Input) {
    const value = (e.detail.value || "").replace(/\D/g, "").slice(0, 6);
    this.setData({
      joinPassword: value,
      joinPasswordDots: this.getRemainingDots(value),
    });
  },

  generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  generateAvailableRoomId() {
    let attempts = 0;
    let roomId = this.generateRoomId();
    while (isRoomIdBlocked(roomId) && attempts < 1000) {
      roomId = this.generateRoomId();
      attempts += 1;
    }
    return roomId;
  },

  onCreateRoomSubmit() {
    const clientId = getApp<IAppOption>().globalData.clientId;
    const roomId = this.generateAvailableRoomId();
    const password = this.data.createPassword.trim();

    if (password.length !== 6) {
      wx.showToast({ title: "请输入6位数字密码", icon: "none" });
      return;
    }

    if (!reserveRoomId(roomId, clientId)) {
      wx.showToast({ title: "编号分配冲突，请重试", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "/pages/room/room?roomId=" + roomId + "&create=1&password=" + password,
    });
  },

  onJoinRoomSubmit() {
    const clientId = getApp<IAppOption>().globalData.clientId;
    const roomId = this.data.joinRoomId.trim();
    const password = this.data.joinPassword.trim();

    if (roomId.length !== 6) {
      wx.showToast({ title: "请输入6位房间号", icon: "none" });
      return;
    }
    if (password.length !== 6) {
      wx.showToast({ title: "请输入6位数字密码", icon: "none" });
      return;
    }

    const check = verifyRoomPassword(roomId, password);
    if (!check.ok) {
      wx.showToast({ title: check.message, icon: "none" });
      return;
    }

    heartbeatRoom(roomId, clientId);
    const room = getRoom(roomId);
    if (!room) {
      wx.showToast({ title: "房间不存在", icon: "none" });
      return;
    }
    const target = room.status === "match" ? "match" : "room";
    wx.navigateTo({ url: "/pages/" + target + "/" + target + "?roomId=" + roomId });
  },
});
