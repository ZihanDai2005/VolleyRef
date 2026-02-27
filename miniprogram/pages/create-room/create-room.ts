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

  parseInviteText(text: string): { roomId: string; password: string } | null {
    const raw = String(text || "");
    const roomMatch = raw.match(/裁判团队编号\s*[:：]?\s*(\d{6})/);
    const pwdMatch = raw.match(/密码\s*[:：]?\s*(\d{6})/);
    if (!roomMatch || !pwdMatch) {
      return null;
    }
    return {
      roomId: roomMatch[1],
      password: pwdMatch[1],
    };
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

  onPasteInviteAndJoin() {
    wx.getClipboardData({
      success: (res) => {
        const data = this.parseInviteText((res && (res as any).data) || "");
        if (!data) {
          showBlockHint("未识别到有效邀请信息，请先复制完整邀请文案");
          return;
        }
        this.setData({
          joinRoomId: data.roomId,
          joinPassword: data.password,
          joinRoomIdDots: this.getRemainingDots(data.roomId),
          joinPasswordDots: this.getRemainingDots(data.password),
        });
        this.onJoinRoomSubmit();
      },
      fail: () => {
        showBlockHint("读取剪贴板失败，请检查小程序剪贴板权限");
      },
    });
  },
});
