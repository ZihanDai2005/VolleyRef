import {
  getRoom,
  heartbeatRoom,
  verifyRoomPassword,
} from "../../utils/room-service";

Page({
  data: {
    createRoomId: "",
    createPassword: "",
    joinRoomId: "",
    joinPassword: "",
    createRoomIdDots: "••••••",
    createPasswordDots: "••••••",
    joinRoomIdDots: "••••••",
    joinPasswordDots: "••••••",
  },

  getRemainingDots(value: string) {
    return "•".repeat(Math.max(0, 6 - value.length));
  },

  onCreateRoomIdInput(e: WechatMiniprogram.Input) {
    const value = e.detail.value.replace(/\D/g, "").slice(0, 6);
    this.setData({
      createRoomId: value,
      createRoomIdDots: this.getRemainingDots(value),
    });
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

  onCreateRoomSubmit() {
    const roomId = this.data.createRoomId.trim();
    const password = this.data.createPassword.trim();

    if (roomId.length !== 6) {
      wx.showToast({ title: "请输入6位房间号", icon: "none" });
      return;
    }

    if (roomId && getRoom(roomId)) {
      wx.showToast({ title: "房间号已存在", icon: "none" });
      return;
    }

    if (password.length !== 6) {
      wx.showToast({ title: "请输入6位数字密码", icon: "none" });
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
