import { getRoomAsync, verifyRoomPasswordAsync } from "../../utils/room-service";
import { showBlockHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";
import { saveLastRoomEntry } from "../../utils/last-room-entry";
import { buildJoinSharePath, buildShareCardTitle, normalizeShareDigits, SHARE_IMAGE_URL, showMiniProgramShareMenu } from "../../utils/share";

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

  onLoad(query: Record<string, string>) {
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
    showMiniProgramShareMenu();
    if (!this.themeBound) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
        wx.setNavigationBarTitle({ title: "" });
      });
      this.themeBound = true;
    }
    this.tryAutoJoinFromShareQuery(query);
  },

  onShow() {
    showMiniProgramShareMenu();
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

  tryAutoJoinFromShareQuery(query: Record<string, string>) {
    const roomId = normalizeShareDigits(query && query.roomId);
    const password = normalizeShareDigits((query && query.password) || (query && query.pwd));
    const auto = String((query && query.auto) || "1") !== "0";
    if (!roomId || !password) {
      return;
    }
    this.setData({
      joinRoomId: roomId,
      joinPassword: password,
      joinRoomIdSpaced: roomId.split("").join(" "),
      joinPasswordSpaced: password.split("").join(" "),
    });
    if (!auto) {
      return;
    }
    setTimeout(() => {
      if (!this.joining) {
        void this.onJoinRoomSubmit();
      }
    }, 40);
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
      const target = room.status === "result" ? "result" : room.status === "match" ? "match" : "create-room";
      if (target === "result") {
        saveLastRoomEntry(roomId, password);
        wx.reLaunch({ url: "/pages/result/result?roomId=" + roomId });
        return;
      }
      const url = "/pages/" + target + "/" + target + "?roomId=" + roomId;
      if (target === "match") {
        saveLastRoomEntry(roomId, password);
      }
      wx.redirectTo({
        url: url,
        fail: () => {
          wx.reLaunch({ url: url });
        },
      });
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

  onShareAppMessage() {
    const roomId = String(this.data.joinRoomId || "");
    const password = String(this.data.joinPassword || "");
    const hasInvitePayload = /^\d{6}$/.test(roomId) && /^\d{6}$/.test(password);
    return {
      title: buildShareCardTitle(hasInvitePayload),
      path: hasInvitePayload ? buildJoinSharePath(roomId, password) : "/pages/home/home",
      imageUrl: SHARE_IMAGE_URL,
    };
  },
});
