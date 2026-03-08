import { getRoomAsync, verifyRoomPasswordAsync } from "../../utils/room-service";
import { showBlockHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

const JOIN_ROOM_KEY = "room";
const JOIN_PASSWORD_KEY = "password";

Page({
  data: {
    joinRoomId: "",
    joinPassword: "",
    joinRoomIdSpaced: "",
    joinPasswordSpaced: "",
    activeInput: "",
    focusRoomInput: false,
    focusPasswordInput: false,
    joinBtnFx: false,
    customNavTop: "10px",
    customNavOffset: "54px",
  },
  themeOff() {},
  themeBound: false,
  joining: false as boolean,

  onLoad() {
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
    if (!this.themeBound) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
        wx.setNavigationBarTitle({ title: "" });
      });
      this.themeBound = true;
    }
  },

  onShow() {
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
  },

  onUnload() {
    if (this.themeBound) {
      this.themeOff();
      this.themeOff = () => {};
      this.themeBound = false;
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
    } catch (e) {}
    const roundedTop = Math.max(0, Math.round(navTop));
    this.setData({
      customNavTop: String(roundedTop) + "px",
      customNavOffset: String(roundedTop + 44) + "px",
    });
  },

  onBackTap() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: "/pages/home/home" });
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
    if (this.data.activeInput && this.data.activeInput !== JOIN_ROOM_KEY) {
      return;
    }
    this.setJoinFocusTarget(JOIN_ROOM_KEY);
  },

  onPasswordInputFocus() {
    if (this.data.activeInput && this.data.activeInput !== JOIN_PASSWORD_KEY) {
      return;
    }
    this.setJoinFocusTarget(JOIN_PASSWORD_KEY);
  },

  onAnyInputBlur(e: WechatMiniprogram.InputBlur) {
    const inputKey = String(((e.currentTarget || {}).dataset as { inputKey?: string }).inputKey || "");
    this.deferClearJoinFocus(inputKey);
  },

  onRoomWrapTap() {
    this.setJoinFocusTarget(JOIN_ROOM_KEY);
  },

  onPasswordWrapTap() {
    this.setJoinFocusTarget(JOIN_PASSWORD_KEY);
  },

  setJoinFocusTarget(target: string) {
    const nextRoomFocus = target === JOIN_ROOM_KEY;
    const nextPasswordFocus = target === JOIN_PASSWORD_KEY;
    if (
      this.data.activeInput === target &&
      this.data.focusRoomInput === nextRoomFocus &&
      this.data.focusPasswordInput === nextPasswordFocus
    ) {
      return;
    }
    this.setData({
      activeInput: target,
      focusRoomInput: nextRoomFocus,
      focusPasswordInput: nextPasswordFocus,
    });
  },

  deferClearJoinFocus(inputKey: string) {
    if (!inputKey) {
      return;
    }
    setTimeout(() => {
      if (this.data.activeInput !== inputKey) {
        return;
      }
      this.setData({
        activeInput: "",
        focusRoomInput: false,
        focusPasswordInput: false,
      });
    }, 0);
  },

  onJoinBlankTap() {
    if (!this.data.activeInput && !this.data.focusRoomInput && !this.data.focusPasswordInput) {
      return;
    }
    this.setData({
      activeInput: "",
      focusRoomInput: false,
      focusPasswordInput: false,
    });
    wx.hideKeyboard({
      fail: () => {},
    });
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

  async onJoinRoomSubmit() {
    if (this.joining) {
      return;
    }
    this.setData({
      activeInput: "",
      focusRoomInput: false,
      focusPasswordInput: false,
    });
    wx.hideKeyboard({
      fail: () => {},
    });
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
    this.joining = true;
    wx.showLoading({
      title: "加入中",
      mask: true,
    });
    try {
      const check = await verifyRoomPasswordAsync(roomId, password);
      if (!check.ok) {
        showBlockHint(check.message);
        return;
      }

      const room = await getRoomAsync(roomId);
      if (!room) {
        showBlockHint("房间不存在");
        return;
      }
      const target = room.status === "result" ? "result" : room.status === "match" ? "match" : "room";
      if (target === "result") {
        wx.reLaunch({ url: "/pages/result/result?roomId=" + roomId });
        return;
      }
      wx.navigateTo({ url: "/pages/" + target + "/" + target + "?roomId=" + roomId });
    } finally {
      this.joining = false;
      wx.hideLoading({
        fail: () => {},
      });
    }
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
      success: (res: any) => {
        const data = this.parseInviteText((res && res.data) || "");
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
