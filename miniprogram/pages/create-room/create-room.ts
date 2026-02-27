import {
  getRoom,
  heartbeatRoom,
  isRoomIdBlocked,
  reserveRoomId,
  verifyRoomPassword,
} from "../../utils/room-service";
import { showBlockHint } from "../../utils/hint";
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

  allocateRoomId(clientId: string): string {
    let attempts = 0;
    while (attempts < 5000) {
      const roomId = this.generateRoomId();
      attempts += 1;
      if (isRoomIdBlocked(roomId)) {
        continue;
      }
      if (reserveRoomId(roomId, clientId)) {
        return roomId;
      }
    }
    return "";
  },

  onCreateRoomSubmit() {
    const clientId = getApp<IAppOption>().globalData.clientId;
    const password = this.data.createPassword.trim();

    if (password.length !== 6) {
      showBlockHint("请输入6位数字密码");
      return;
    }

    const roomId = this.allocateRoomId(clientId);
    if (!roomId) {
      showBlockHint("系统繁忙，请稍后重试");
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
      showBlockHint("请输入6位房间号");
      return;
    }
    if (password.length !== 6) {
      showBlockHint("请输入6位数字密码");
      return;
    }

    const check = verifyRoomPassword(roomId, password);
    if (!check.ok) {
      showBlockHint(check.message);
      return;
    }

    heartbeatRoom(roomId, clientId);
    const room = getRoom(roomId);
    if (!room) {
      showBlockHint("房间不存在");
      return;
    }
    const target = room.status === "match" ? "match" : "room";
    wx.navigateTo({ url: "/pages/" + target + "/" + target + "?roomId=" + roomId });
  },
});
