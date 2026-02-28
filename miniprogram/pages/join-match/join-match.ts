import { getRoom, heartbeatRoom, verifyRoomPassword } from "../../utils/room-service";
import { showBlockHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

Page({
  data: {
    joinRoomId: "",
    joinPassword: "",
    joinRoomIdSpaced: "",
    joinPasswordSpaced: "",
    activeInput: "" as "" | "room" | "password",
    focusRoomInput: false,
    focusPasswordInput: false,
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

  onJoinRoomIdInput(e: WechatMiniprogram.Input) {
    const value = (e.detail.value || "").replace(/\D/g, "").slice(0, 6);
    this.setData({
      joinRoomId: value,
      joinRoomIdSpaced: value.split("").join(" "),
    });
  },

  onJoinPasswordInput(e: WechatMiniprogram.Input) {
    const value = (e.detail.value || "").replace(/\D/g, "").slice(0, 6);
    this.setData({
      joinPassword: value,
      joinPasswordSpaced: value.split("").join(" "),
    });
  },

  onRoomInputFocus() {
    this.setData({ activeInput: "room", focusRoomInput: true, focusPasswordInput: false });
  },

  onPasswordInputFocus() {
    this.setData({ activeInput: "password", focusPasswordInput: true, focusRoomInput: false });
  },

  onAnyInputBlur() {
    this.setData({ activeInput: "", focusRoomInput: false, focusPasswordInput: false });
  },

  onRoomWrapTap() {
    this.setData({ activeInput: "room", focusRoomInput: true, focusPasswordInput: false });
  },

  onPasswordWrapTap() {
    this.setData({ activeInput: "password", focusPasswordInput: true, focusRoomInput: false });
  },

  parseInviteText(text: string): { roomId: string; password: string } | null {
    const raw = String(text || "");
    const roomMatch = raw.match(/(?:裁判团队编号|房间号码)\s*[:：]?\s*(\d{6})/);
    const pwdMatch = raw.match(/密码\s*[:：]?\s*(\d{6})/);
    if (!roomMatch || !pwdMatch) {
      return null;
    }
    return {
      roomId: roomMatch[1],
      password: pwdMatch[1],
    };
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

  onContinueTap() {
    this.setData({ joinBtnFx: true });
    setTimeout(() => {
      this.setData({ joinBtnFx: false });
      this.onJoinRoomSubmit();
    }, 150);
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
          joinRoomIdSpaced: data.roomId.split("").join(" "),
          joinPasswordSpaced: data.password.split("").join(" "),
        });
        this.onJoinRoomSubmit();
      },
      fail: () => {
        showBlockHint("读取剪贴板失败，请检查小程序剪贴板权限");
      },
    });
  },
});
