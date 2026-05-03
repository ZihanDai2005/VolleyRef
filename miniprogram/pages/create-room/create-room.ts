import {
  createRoomAsync,
  getRoomAsync,
  hasRoomLock,
  updateRoomAsync,
  heartbeatRoomAsync,
  leaveRoomAsync,
  hasRoomLockAsync,
  reserveRoomId,
  reserveRoomIdAsync,
  releaseRoomIdAsync,
  subscribeRoomWatch,
  TEAM_COLOR_OPTIONS,
} from "../../utils/room-service";
import { showBlockHint, showToastHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";
import { getMainOrderForTeam, type MainPosition, type TeamCode } from "../../utils/lineup-order";
import { saveLastRoomEntry } from "../../utils/last-room-entry";
import { buildJoinSharePath, buildShareCardTitle, SHARE_IMAGE_URL, showMiniProgramShareMenu } from "../../utils/share";

type Position = "I" | "II" | "III" | "IV" | "V" | "VI" | "L1" | "L2";
type PlayerSlot = { pos: Position; number: string };
type DisplayPlayerSlot = PlayerSlot & { index: number; inputKey: string };
type MatchModeOption = {
  label: string;
  sets: number;
  wins: number;
  maxScore: number;
  tiebreakScore: number;
};
type MatchModeChar = {
  char: string;
  kind: "digit" | "text";
  offsetY: number;
};
type SetupCaptainOption = {
  label: string;
  value: "yes" | "no";
};

const MATCH_MODE_OPTIONS: MatchModeOption[] = [
  { label: "5局3胜", sets: 5, wins: 3, maxScore: 25, tiebreakScore: 15 },
  { label: "3局2胜", sets: 3, wins: 2, maxScore: 25, tiebreakScore: 15 },
  { label: "1局1胜（15分）", sets: 1, wins: 1, maxScore: 15, tiebreakScore: 15 },
  { label: "1局1胜（25分）", sets: 1, wins: 1, maxScore: 25, tiebreakScore: 25 },
];
const SETUP_CAPTAIN_OPTIONS: SetupCaptainOption[] = [
  { label: "是", value: "yes" },
  { label: "否", value: "no" },
];
const MATCH_MODE_CHAR_OFFSET_Y: Record<string, number> = {
  局: 2,
  胜: 2,
  分: 2,
  "（": 1,
  "）": 1,
};

const PLAYER_INDEX_BY_POS: Record<Position, number> = {
  I: 0,
  II: 1,
  III: 2,
  IV: 3,
  V: 4,
  VI: 5,
  L1: 6,
  L2: 7,
};
const PASSWORD_FOCUS_KEY = "__password__";
const ROOM_MATCH_TTL_MS = 6 * 60 * 60 * 1000;
const TEAM_NAME_MAX_LENGTH = 8;

function createInitialPlayers(): PlayerSlot[] {
  return [
    { pos: "I", number: "?" },
    { pos: "II", number: "?" },
    { pos: "III", number: "?" },
    { pos: "IV", number: "?" },
    { pos: "V", number: "?" },
    { pos: "VI", number: "?" },
    { pos: "L1", number: "?" },
    { pos: "L2", number: "?" },
  ];
}

function normalizeLiberoSlots(players: PlayerSlot[]): PlayerSlot[] {
  const next = players.slice();
  const l1 = next[6];
  const l2 = next[7];
  if (!l1 || !l2) {
    return next;
  }
  const l1No = normalizeNumberInput(l1.number);
  const l2No = normalizeNumberInput(l2.number);
  if ((!l1No || l1No === "?") && l2No && l2No !== "?") {
    next[6] = { pos: l1.pos, number: l2No };
    next[7] = { pos: l2.pos, number: "?" };
  }
  return next;
}

function buildMainGrid(players: PlayerSlot[], order: MainPosition[], team: TeamCode): DisplayPlayerSlot[][] {
  const byPos: Record<string, PlayerSlot> = {};
  players.forEach(function (p) {
    byPos[p.pos] = p;
  });
  const ordered = order.map(function (pos) {
    const slot = byPos[pos] || { pos: pos, number: "?" };
    return {
      pos: slot.pos,
      number: slot.number,
      index: PLAYER_INDEX_BY_POS[pos],
      inputKey: team + "-" + String(PLAYER_INDEX_BY_POS[pos]),
    };
  });
  return [ordered.slice(0, 2), ordered.slice(2, 4), ordered.slice(4, 6)];
}

function buildLibero(players: PlayerSlot[], team: TeamCode): DisplayPlayerSlot[] {
  const byPos: Record<string, PlayerSlot> = {};
  players.forEach(function (p) {
    byPos[p.pos] = p;
  });
  return (["L1", "L2"] as Position[]).map(function (pos) {
    const slot = byPos[pos] || { pos: pos, number: "?" };
    return {
      pos: slot.pos,
      number: slot.number,
      index: PLAYER_INDEX_BY_POS[pos],
      inputKey: team + "-" + String(PLAYER_INDEX_BY_POS[pos]),
    };
  });
}

function getMatchModeIndexBySettings(
  sets: number,
  wins: number,
  maxScore: number,
  tiebreakScore: number
): number {
  const exactIdx = MATCH_MODE_OPTIONS.findIndex(function (item) {
    return (
      item.sets === sets &&
      item.wins === wins &&
      item.maxScore === maxScore &&
      item.tiebreakScore === tiebreakScore
    );
  });
  if (exactIdx >= 0) {
    return exactIdx;
  }
  if (sets === 5 && wins === 3) {
    return 0;
  }
  if (sets === 3 && wins === 2) {
    return 1;
  }
  if (sets === 1 && wins === 1) {
    return maxScore >= 25 ? 3 : 2;
  }
  return 0;
}

function buildMatchModeChars(label: string): MatchModeChar[] {
  return Array.from(String(label || "")).map(function (char) {
    const isDigit = /[0-9]/.test(char);
    return {
      char: char,
      kind: isDigit ? "digit" : "text",
      offsetY: isDigit ? 0 : MATCH_MODE_CHAR_OFFSET_Y[char] || 0,
    };
  });
}

function isCaptainSetupEnabledByIndex(index: number): boolean {
  const option = SETUP_CAPTAIN_OPTIONS[Math.max(0, Math.min(SETUP_CAPTAIN_OPTIONS.length - 1, Number(index) || 0))];
  return !option || option.value !== "no";
}

function validateTeamPlayers(players: PlayerSlot[], teamName: string): string | null {
  const main = players.slice(0, 6);
  const missingMain = main.find(function (p) {
    return !p.number || p.number === "?";
  });
  if (missingMain) {
    return teamName + "队 " + missingMain.pos + " 位置未填写号码";
  }

  const numbers = players
    .map(function (p) {
      return p.number.trim();
    })
    .filter(function (n) {
      return n && n !== "?";
    });
  const uniq = new Set(numbers);
  if (uniq.size !== numbers.length) {
    return teamName + "队存在重复号码";
  }
  return null;
}

function normalizeNumberInput(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 2);
  if (!digits) {
    return "";
  }
  return String(Number(digits));
}

function getStringLength(value: string): number {
  return Array.from(String(value || "")).length;
}

function sliceStringByLength(value: string, maxLength: number): string {
  return Array.from(String(value || "")).slice(0, maxLength).join("");
}

function getTeamNameError(teamANameRaw: string, teamBNameRaw: string): string | null {
  const teamAName = String(teamANameRaw || "").trim();
  const teamBName = String(teamBNameRaw || "").trim();
  if (getStringLength(teamAName) > TEAM_NAME_MAX_LENGTH) {
    return "团队名称最多8个字";
  }
  if (getStringLength(teamBName) > TEAM_NAME_MAX_LENGTH) {
    return "团队名称最多8个字";
  }
  if (teamAName && teamBName && teamAName === teamBName) {
    return "甲乙队名称不能相同";
  }
  return null;
}

function getTeamNameWhitespaceOnlyError(teamANameRaw: string, teamBNameRaw: string): string | null {
  const rawA = String(teamANameRaw || "");
  const rawB = String(teamBNameRaw || "");
  if (rawA.length > 0 && rawA.trim().length === 0) {
    return "甲队名称不能仅为空格";
  }
  if (rawB.length > 0 && rawB.trim().length === 0) {
    return "乙队名称不能仅为空格";
  }
  return null;
}

function hexToRgbString(hex: string): string {
  const value = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return "138, 135, 208";
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r + ", " + g + ", " + b;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(fallback), Math.max(200, Number(timeoutMs) || 0));
      }),
    ]);
  } catch (e) {
    return fallback;
  }
}

Page({
  data: {
    roomId: "",
    roomIdSpaced: "",
    roomPasswordSpaced: "",
    inviteShareReady: false,
    focusCreatePasswordInput: false,
    participantCount: 0,
    roomPassword: "",
    createMode: false,
    createCommitted: false,
    editMode: false,
    matchModes: MATCH_MODE_OPTIONS,
    matchModeIndex: 0,
    matchModeChars: buildMatchModeChars(MATCH_MODE_OPTIONS[0].label),
    setupCaptainOptions: SETUP_CAPTAIN_OPTIONS,
    setupCaptainIndex: 0,
    passwordFocused: false,
    teamANameFocused: false,
    teamBNameFocused: false,
    activeCreateInputKey: "",
    teamAName: "",
    teamBName: "",
    teamACaptainNo: "",
    teamBCaptainNo: "",
    servingTeam: "A" as TeamCode,
    teamASide: "A" as TeamCode,
    teamAColor: TEAM_COLOR_OPTIONS[0].value,
    teamBColor: TEAM_COLOR_OPTIONS[1].value,
    teamARGB: hexToRgbString(TEAM_COLOR_OPTIONS[0].value),
    teamBRGB: hexToRgbString(TEAM_COLOR_OPTIONS[1].value),
    servePulseTeam: "" as "" | TeamCode,
    sidePulse: false,
    colorOptions: TEAM_COLOR_OPTIONS,
    teamAPlayers: [] as PlayerSlot[],
    teamBPlayers: [] as PlayerSlot[],
    teamAMainGrid: [] as DisplayPlayerSlot[][],
    teamALibero: [] as DisplayPlayerSlot[],
    teamBMainGrid: [] as DisplayPlayerSlot[][],
    teamBLibero: [] as DisplayPlayerSlot[],
    showCaptainPicker: false,
    captainPickerTitle: "",
    captainPickerTeam: "A" as TeamCode,
    captainPickerMainGrid: [] as DisplayPlayerSlot[][],
    captainPickerLibero: [] as DisplayPlayerSlot[],
    captainPickerSelectedNo: "",
    updatedAt: 0,
    createInviteBtnFx: false,
    createContinueBtnFx: false,
    customNavTop: "10px",
    customNavOffset: "54px",
  },

  pollTimer: 0 as number,
  heartbeatTimer: 0 as number,
  roomWatchOff: null as null | (() => void),
  themeOff: null as null | (() => void),
  captainPickerResolver: null as null | ((value: string | null) => void),
  saveInFlight: false as boolean,
  roomLoadInFlight: false as boolean,
  roomLoadPending: false as boolean,
  roomLoadPendingForce: false as boolean,
  pageActive: false as boolean,
  statusRouteRedirecting: false as boolean,
  roomIdReassigning: false as boolean,

  isCreateRoomPageTop(): boolean {
    const pages = getCurrentPages();
    const top = pages.length ? pages[pages.length - 1] : null;
    const route = String((top && (top as any).route) || "");
    return route === "pages/create-room/create-room";
  },

  enterMatchPage(roomId: string) {
    const id = String(roomId || "");
    if (!id) {
      return;
    }
    const url = "/pages/match/match?roomId=" + id;
    wx.redirectTo({
      url: url,
      fail: () => {
        wx.reLaunch({ url: url });
      },
    });
  },

  onLoad(query: Record<string, string>) {
    this.pageActive = true;
    this.statusRouteRedirecting = false;
    this.roomLoadInFlight = false;
    this.roomLoadPending = false;
    this.roomLoadPendingForce = false;
    this.applyNavigationTheme();
    this.syncCustomNavTop();
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
      });
    }
    const roomId = query.roomId || "";
    if (!roomId) {
      showBlockHint("房间号无效");
      return;
    }
    const createMode = query.create === "1";
    const editMode = query.edit === "1";
    if (createMode) {
      wx.setNavigationBarTitle({ title: "" });
    }
    this.setData({ roomId: roomId, editMode: editMode, createMode: createMode });
    if (createMode) {
      const initialA = createInitialPlayers();
      const initialB = createInitialPlayers();
      this.setData({
        roomIdSpaced: roomId.split("").join(" "),
        participantCount: 0,
        roomPassword: "",
        roomPasswordSpaced: "",
        inviteShareReady: false,
        teamAName: "",
        teamBName: "",
        teamACaptainNo: "",
        teamBCaptainNo: "",
        servingTeam: "A",
        teamASide: "A",
        teamAColor: TEAM_COLOR_OPTIONS[0].value,
        teamBColor: TEAM_COLOR_OPTIONS[1].value,
        teamARGB: hexToRgbString(TEAM_COLOR_OPTIONS[0].value),
        teamBRGB: hexToRgbString(TEAM_COLOR_OPTIONS[1].value),
        teamAPlayers: initialA,
        teamBPlayers: initialB,
        teamAMainGrid: buildMainGrid(initialA, getMainOrderForTeam("A", "A"), "A"),
        teamALibero: buildLibero(initialA, "A"),
        teamBMainGrid: buildMainGrid(initialB, getMainOrderForTeam("B", "A"), "B"),
        teamBLibero: buildLibero(initialB, "B"),
        matchModeChars: buildMatchModeChars(MATCH_MODE_OPTIONS[0].label),
      });
      return;
    }
    this.loadRoom(roomId, true);
  },

  onShow() {
    this.pageActive = true;
    this.statusRouteRedirecting = false;
    showMiniProgramShareMenu();
    this.applyNavigationTheme();
    this.syncCustomNavTop();
    if (this.data.createMode) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (roomId) {
      this.loadRoom(roomId, false);
    }
  },

  onHide() {
    this.pageActive = false;
    this.roomLoadPendingForce = false;
    this.stopRoomWatch();
    this.stopPolling();
    this.stopHeartbeat();
  },

  onUnload() {
    this.pageActive = false;
    this.roomLoadPending = false;
    this.roomLoadInFlight = false;
    this.roomLoadPendingForce = false;
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
    this.stopRoomWatch();
    this.stopPolling();
    this.stopHeartbeat();
    if (this.data.createMode) {
      if (!this.data.createCommitted) {
        const clientId = getApp<IAppOption>().globalData.clientId;
        releaseRoomIdAsync(this.data.roomId, clientId);
      }
      if (this.captainPickerResolver) {
        this.captainPickerResolver(null);
        this.captainPickerResolver = null;
      }
      return;
    }
    const roomId = this.data.roomId;
    const clientId = getApp<IAppOption>().globalData.clientId;
    leaveRoomAsync(roomId, clientId);
    if (this.captainPickerResolver) {
      this.captainPickerResolver(null);
      this.captainPickerResolver = null;
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

  isInviteShareReady(roomIdRaw: unknown, passwordRaw: unknown): boolean {
    const roomId = String(roomIdRaw || "").trim();
    const password = String(passwordRaw || "").trim();
    return /^\d{6}$/.test(roomId) && /^\d{6}$/.test(password);
  },

  onBackTap() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: "/pages/home/home" });
  },

  onRoomIdInfoTap() {
    wx.showModal({
      title: "裁判团队编号说明",
      content:
        "裁判团队编号由系统自动分配，不可修改。编号自进入比赛页开始生效，可用于邀请其他用户加入比赛，未进入比赛页就退出或房间创建6小时后将自动回收，全场比赛结束起比赛数据将保留24小时后清除，不可恢复。",
      showCancel: false,
      confirmText: "我知道了",
    });
  },

  generateRoomIdCandidate(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  async reserveRoomIdWithTimeout(roomId: string, clientId: string, timeoutMs = 2500): Promise<boolean> {
    try {
      const result = await Promise.race<boolean>([
        reserveRoomIdAsync(roomId, clientId),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), Math.max(300, Number(timeoutMs) || 0));
        }),
      ]);
      return !!result;
    } catch (_e) {
      return false;
    }
  },

  async allocateReplacementRoomId(clientId: string): Promise<string> {
    const deadline = Date.now() + 12000;
    let attempts = 0;
    while (attempts < 120 && Date.now() < deadline) {
      const candidate = this.generateRoomIdCandidate();
      attempts += 1;
      if (await this.reserveRoomIdWithTimeout(candidate, clientId, 2500)) {
        return candidate;
      }
    }
    return "";
  },

  async reassignExpiredRoomId(clientId: string) {
    if (this.roomIdReassigning) {
      return;
    }
    this.roomIdReassigning = true;
    const oldRoomId = String(this.data.roomId || "");
    wx.showLoading({
      title: "重新分配中",
      mask: true,
    });
    try {
      if (oldRoomId) {
        await releaseRoomIdAsync(oldRoomId, clientId);
      }
      const newRoomId = await this.allocateReplacementRoomId(clientId);
      if (!newRoomId) {
        showBlockHint("房间号分配失败，请稍后重试");
        return;
      }
      this.setData({
        roomId: newRoomId,
        roomIdSpaced: newRoomId.split("").join(" "),
      });
      showToastHint("已重新分配房间号");
    } finally {
      wx.hideLoading({
        fail: () => {},
      });
      this.roomIdReassigning = false;
    }
  },

  handleRoomClosed() {
    wx.showModal({
      title: "房间已关闭",
      content: "该裁判团队已超时关闭或不存在，请重新创建或加入有效团队。",
      showCancel: false,
      confirmText: "返回首页",
      success: () => {
        wx.reLaunch({ url: "/pages/home/home" });
      },
    });
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      const roomId = this.data.roomId;
      if (!roomId) {
        return;
      }
      this.loadRoom(roomId, false);
    }, 3000) as unknown as number;
  },

  stopPolling() {
    if (!this.pollTimer) {
      return;
    }
    clearInterval(this.pollTimer);
    this.pollTimer = 0;
  },

  startRoomWatch() {
    if (this.roomWatchOff) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    this.roomWatchOff = subscribeRoomWatch(roomId, () => {
      this.loadRoom(roomId, false);
    });
  },

  stopRoomWatch() {
    if (!this.roomWatchOff) {
      return;
    }
    this.roomWatchOff();
    this.roomWatchOff = null;
  },

  startHeartbeat() {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 5000) as unknown as number;
  },

  stopHeartbeat() {
    if (!this.heartbeatTimer) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
  },

  sendHeartbeat() {
    const roomId = this.data.roomId;
    if (!roomId) {
      return;
    }
    const clientId = getApp<IAppOption>().globalData.clientId;
    heartbeatRoomAsync(roomId, clientId)
      .then((count) => {
        if (typeof count === "number" && count > 0 && count !== this.data.participantCount) {
          this.setData({ participantCount: count });
        }
      })
      .catch(() => {});
  },

  async loadRoom(roomId: string, force: boolean) {
    if (!roomId || !this.pageActive) {
      return;
    }
    if (this.roomLoadInFlight) {
      this.roomLoadPending = true;
      this.roomLoadPendingForce = this.roomLoadPendingForce || !!force;
      return;
    }
    this.roomLoadInFlight = true;
    try {
      const room = await getRoomAsync(roomId);
      if (!room) {
        if (force) {
          this.handleRoomClosed();
        }
        return;
      }
      const currentUpdatedAt = Number(this.data.updatedAt || 0);
      const incomingUpdatedAt = Number(room.updatedAt || 0);
      if (!force && incomingUpdatedAt < currentUpdatedAt) {
        return;
      }

      if (room.status === "result" && !this.data.editMode) {
        if (!this.pageActive || !this.isCreateRoomPageTop()) {
          return;
        }
        if (!this.statusRouteRedirecting) {
          this.statusRouteRedirecting = true;
          wx.reLaunch({
            url: "/pages/result/result?roomId=" + roomId,
            fail: () => {
              this.statusRouteRedirecting = false;
            },
          });
        }
        return;
      }

      if (room.status === "match" && !this.data.editMode) {
        if (!this.pageActive || !this.isCreateRoomPageTop()) {
          return;
        }
        if (!this.statusRouteRedirecting) {
          this.statusRouteRedirecting = true;
          wx.redirectTo({
            url: "/pages/match/match?roomId=" + roomId,
            fail: () => {
              this.statusRouteRedirecting = false;
              wx.reLaunch({ url: "/pages/match/match?roomId=" + roomId });
            },
          });
        }
        return;
      }

      if (!force && incomingUpdatedAt === currentUpdatedAt) {
        this.setData({ participantCount: Object.keys((room as any).participants || {}).length });
        return;
      }

      const teamAPlayers = room.teamA.players;
      const teamBPlayers = room.teamB.players;
      this.setData({
        roomIdSpaced: roomId.split("").join(" "),
        participantCount: Object.keys((room as any).participants || {}).length,
        roomPassword: room.password,
        roomPasswordSpaced: String(room.password || "").split("").join(" "),
        inviteShareReady: this.isInviteShareReady(roomId, room.password),
        matchModeIndex: getMatchModeIndexBySettings(
          room.settings.sets,
          room.settings.wins,
          room.settings.maxScore,
          room.settings.tiebreakScore
        ),
        matchModeChars: buildMatchModeChars(
          (MATCH_MODE_OPTIONS[
            getMatchModeIndexBySettings(
              room.settings.sets,
              room.settings.wins,
              room.settings.maxScore,
              room.settings.tiebreakScore
            )
          ] || MATCH_MODE_OPTIONS[0]).label
        ),
        setupCaptainIndex: room.settings && (room.settings as { captainEnabled?: boolean }).captainEnabled === false ? 1 : 0,
        teamAName: room.teamA.name,
        teamBName: room.teamB.name,
        teamACaptainNo: String((room.teamA as any).captainNo || ""),
        teamBCaptainNo: String((room.teamB as any).captainNo || ""),
        servingTeam: room.match.servingTeam === "B" ? "B" : "A",
        teamASide: room.match.isSwapped ? "B" : "A",
        teamAColor: room.teamA.color || TEAM_COLOR_OPTIONS[0].value,
        teamBColor: room.teamB.color || TEAM_COLOR_OPTIONS[1].value,
        teamARGB: hexToRgbString(room.teamA.color || TEAM_COLOR_OPTIONS[0].value),
        teamBRGB: hexToRgbString(room.teamB.color || TEAM_COLOR_OPTIONS[1].value),
        teamAPlayers: teamAPlayers,
        teamBPlayers: teamBPlayers,
        teamAMainGrid: buildMainGrid(teamAPlayers, getMainOrderForTeam("A", room.match.isSwapped ? "B" : "A"), "A"),
        teamALibero: buildLibero(teamAPlayers, "A"),
        teamBMainGrid: buildMainGrid(teamBPlayers, getMainOrderForTeam("B", room.match.isSwapped ? "B" : "A"), "B"),
        teamBLibero: buildLibero(teamBPlayers, "B"),
        updatedAt: room.updatedAt,
      });
    } finally {
      this.roomLoadInFlight = false;
      if (this.roomLoadPending && this.pageActive) {
        const pendingForce = this.roomLoadPendingForce || !!force;
        this.roomLoadPending = false;
        this.roomLoadPendingForce = false;
        void this.loadRoom(roomId, pendingForce);
      } else {
        this.roomLoadPending = false;
        this.roomLoadPendingForce = false;
      }
    }
  },

  onInputChange(e: WechatMiniprogram.Input): string | void {
    const field = (e.currentTarget.dataset as { field: string }).field;
    const value = e.detail.value;
    if (field === "teamAName") {
      if (!this.data.createMode) {
        return;
      }
      const next = String(value || "");
      this.setData({ teamAName: next });
      if (getStringLength(next.trim()) <= TEAM_NAME_MAX_LENGTH) {
        setTimeout(() => {
          this.persistDraft();
        }, 0);
      }
      return next;
    } else if (field === "teamBName") {
      if (!this.data.createMode) {
        return;
      }
      const next = String(value || "");
      this.setData({ teamBName: next });
      if (getStringLength(next.trim()) <= TEAM_NAME_MAX_LENGTH) {
        setTimeout(() => {
          this.persistDraft();
        }, 0);
      }
      return next;
    } else if (field === "teamACaptainNo") {
      this.setData({ teamACaptainNo: normalizeNumberInput(value) });
    } else if (field === "teamBCaptainNo") {
      this.setData({ teamBCaptainNo: normalizeNumberInput(value) });
    } else if (field === "roomPassword") {
      const pwd = (value || "").replace(/\D/g, "").slice(0, 6);
      this.setData({
        roomPassword: pwd,
        roomPasswordSpaced: pwd.split("").join(" "),
        inviteShareReady: this.isInviteShareReady(this.data.roomId, pwd),
      });
    }
    setTimeout(() => {
      this.persistDraft();
    }, 0);
  },

  onMatchModeChange(e: WechatMiniprogram.CustomEvent) {
    if (!this.data.createMode) {
      return;
    }
    const idx = Number(e.detail.value);
    const maxIdx = this.data.matchModes.length - 1;
    const nextIdx = Number.isFinite(idx) ? Math.max(0, Math.min(maxIdx, idx)) : 0;
    this.setData({
      matchModeIndex: nextIdx,
      matchModeChars: buildMatchModeChars((this.data.matchModes[nextIdx] || this.data.matchModes[0]).label),
    });
    this.persistDraft();
  },

  applySetupCaptainIndex(nextRaw: number) {
    const maxIdx = this.data.setupCaptainOptions.length - 1;
    const nextIdx = Number.isFinite(nextRaw) ? Math.max(0, Math.min(maxIdx, nextRaw)) : 0;
    const shouldDisableCaptain = !isCaptainSetupEnabledByIndex(nextIdx);
    const shouldClearCaptainFocus =
      shouldDisableCaptain &&
      (this.data.activeCreateInputKey === "teamACaptainNo" || this.data.activeCreateInputKey === "teamBCaptainNo");
    this.setData({
      setupCaptainIndex: nextIdx,
      activeCreateInputKey: shouldClearCaptainFocus ? "" : this.data.activeCreateInputKey,
    });
    if (shouldClearCaptainFocus) {
      wx.hideKeyboard({
        fail: () => {},
      });
    }
  },

  onSetupCaptainChange(e: WechatMiniprogram.CustomEvent) {
    if (!this.data.createMode) {
      return;
    }
    this.applySetupCaptainIndex(Number(e.detail.value));
  },

  onPasswordFocus() {
    if (!this.data.focusCreatePasswordInput || !!this.data.activeCreateInputKey) {
      return;
    }
    if (!this.data.passwordFocused) {
      this.setData({ passwordFocused: true });
    }
  },

  onPasswordBlur() {
    this.setData({ passwordFocused: false, focusCreatePasswordInput: false });
  },

  onCreatePasswordWrapTap() {
    this.setCreateFocusTarget(PASSWORD_FOCUS_KEY);
  },

  onCreateFieldWrapTap(e: WechatMiniprogram.TouchEvent) {
    const focusKey = String((e.currentTarget.dataset as { focusKey?: string }).focusKey || "");
    if (!focusKey) {
      return;
    }
    this.setCreateFocusTarget(focusKey);
  },

  setCreateFocusTarget(targetKey: string) {
    const nextActiveKey = targetKey === PASSWORD_FOCUS_KEY ? "" : targetKey;
    const nextPasswordFocus = targetKey === PASSWORD_FOCUS_KEY;
    const nextTeamANameFocus = targetKey === "teamAName";
    const nextTeamBNameFocus = targetKey === "teamBName";
    if (
      this.data.activeCreateInputKey === nextActiveKey &&
      this.data.focusCreatePasswordInput === nextPasswordFocus &&
      this.data.passwordFocused === nextPasswordFocus &&
      this.data.teamANameFocused === nextTeamANameFocus &&
      this.data.teamBNameFocused === nextTeamBNameFocus
    ) {
      return;
    }
    this.setData({
      activeCreateInputKey: nextActiveKey,
      focusCreatePasswordInput: nextPasswordFocus,
      passwordFocused: nextPasswordFocus,
      teamANameFocused: nextTeamANameFocus,
      teamBNameFocused: nextTeamBNameFocus,
    });
  },

  onCreateBlankTap() {
    if (!this.data.createMode) {
      return;
    }
    const shouldClear =
      !!this.data.activeCreateInputKey ||
      !!this.data.focusCreatePasswordInput ||
      !!this.data.passwordFocused ||
      !!this.data.teamANameFocused ||
      !!this.data.teamBNameFocused;
    if (!shouldClear) {
      return;
    }
    this.setData({
      activeCreateInputKey: "",
      focusCreatePasswordInput: false,
      passwordFocused: false,
      teamANameFocused: false,
      teamBNameFocused: false,
    });
    wx.hideKeyboard({
      fail: () => {},
    });
  },

  onTeamNameFocus(e: WechatMiniprogram.InputFocus) {
    const dataset = (e.currentTarget || {}).dataset as { field?: string; focusKey?: string };
    const field = dataset.field;
    const focusKey = String(dataset.focusKey || "");
    if (!focusKey || focusKey !== this.data.activeCreateInputKey) {
      return;
    }
    if (field === "teamAName") {
      if (!this.data.teamANameFocused) {
        this.setData({ teamANameFocused: true });
      }
      return;
    }
    if (field === "teamBName") {
      if (!this.data.teamBNameFocused) {
        this.setData({ teamBNameFocused: true });
      }
    }
  },

  onTeamNameBlur(e: WechatMiniprogram.InputBlur) {
    const field = ((e.currentTarget || {}).dataset as { field?: string }).field;
    const rawA = this.data.teamAName || "";
    const rawB = this.data.teamBName || "";
    const wasTooLongA = getStringLength(rawA.trim()) > TEAM_NAME_MAX_LENGTH;
    const wasTooLongB = getStringLength(rawB.trim()) > TEAM_NAME_MAX_LENGTH;
    if (field === "teamAName") {
      const next = sliceStringByLength(rawA, TEAM_NAME_MAX_LENGTH);
      this.setData({
        teamANameFocused: false,
        teamAName: next,
      });
      this.deferClearActiveCreateInputKey("teamAName");
    } else if (field === "teamBName") {
      const next = sliceStringByLength(rawB, TEAM_NAME_MAX_LENGTH);
      this.setData({
        teamBNameFocused: false,
        teamBName: next,
      });
      this.deferClearActiveCreateInputKey("teamBName");
    }
    if (wasTooLongA) {
      showToastHint("团队名称最多8个字");
    } else if (wasTooLongB) {
      showToastHint("团队名称最多8个字");
    }
    if (field === "teamAName" && rawA.length > 0 && rawA.trim().length === 0) {
      showToastHint("名称不能仅为空格");
    } else if (field === "teamBName" && rawB.length > 0 && rawB.trim().length === 0) {
      showToastHint("名称不能仅为空格");
    }
    const err = getTeamNameError(
      sliceStringByLength(rawA, TEAM_NAME_MAX_LENGTH),
      sliceStringByLength(rawB, TEAM_NAME_MAX_LENGTH)
    );
    if (err) {
      showToastHint(err);
    }
    this.persistDraft();
  },

  onCaptainNoBlur(e: WechatMiniprogram.InputBlur) {
    const field = ((e.currentTarget || {}).dataset as { field?: string }).field;
    if (field !== "teamACaptainNo" && field !== "teamBCaptainNo") {
      return;
    }
    const raw = field === "teamACaptainNo" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;
    const normalized = normalizeNumberInput(raw);
    if (field === "teamACaptainNo") {
      if (normalized !== this.data.teamACaptainNo) {
        this.setData({ teamACaptainNo: normalized });
      }
    } else if (normalized !== this.data.teamBCaptainNo) {
      this.setData({ teamBCaptainNo: normalized });
    }
    const blurKey = field;
    this.deferClearActiveCreateInputKey(blurKey);
    this.persistDraft();
  },

  onPlayerNumberFocus(e: WechatMiniprogram.InputFocus) {
    const focusKey = String((e.currentTarget.dataset as { focusKey?: string }).focusKey || "");
    if (!focusKey || focusKey !== this.data.activeCreateInputKey) {
      return;
    }
  },

  onTeamColorSelect(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.createMode) {
      return;
    }
    const dataset = e.currentTarget.dataset as { team: TeamCode; color: string };
    const team = dataset.team;
    const color = String(dataset.color || "").toUpperCase();
    if (!TEAM_COLOR_OPTIONS.some(function (opt) { return opt.value === color; })) {
      return;
    }
    if (team === "A") {
      if (color === this.data.teamBColor) {
        showToastHint("甲/乙队颜色不能相同");
        return;
      }
      this.setData({
        teamAColor: color,
        teamARGB: hexToRgbString(color),
      });
    } else {
      if (color === this.data.teamAColor) {
        showToastHint("甲/乙队颜色不能相同");
        return;
      }
      this.setData({
        teamBColor: color,
        teamBRGB: hexToRgbString(color),
      });
    }
    this.persistDraft();
  },

  onPlayerNumberInput(e: WechatMiniprogram.Input) {
    const dataset = e.currentTarget.dataset as { team: TeamCode; index: number };
    const team = dataset.team;
    const index = Number(dataset.index);
    const raw = (e.detail.value || "").replace(/\D/g, "").slice(0, 2);
    const number = raw || "?";

    if (team === "A") {
      const players = this.data.teamAPlayers.slice();
      const current = players[index];
      if (!current) {
        return;
      }
      players[index] = { pos: current.pos, number: number };
      this.setData({
        teamAPlayers: players,
        teamAMainGrid: buildMainGrid(players, getMainOrderForTeam("A", this.data.teamASide), "A"),
        teamALibero: buildLibero(players, "A"),
      });
      this.persistDraft(players, this.data.teamBPlayers);
    } else {
      const players = this.data.teamBPlayers.slice();
      const current = players[index];
      if (!current) {
        return;
      }
      players[index] = { pos: current.pos, number: number };
      this.setData({
        teamBPlayers: players,
        teamBMainGrid: buildMainGrid(players, getMainOrderForTeam("B", this.data.teamASide), "B"),
        teamBLibero: buildLibero(players, "B"),
      });
      this.persistDraft(this.data.teamAPlayers, players);
    }
  },

  onPlayerNumberBlur(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { team: TeamCode; index: number };
    const team = dataset.team;
    const index = Number(dataset.index);
    const blurKey = String(team) + "-" + String(index);
    let players = (team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers).slice();
    if (!Number.isFinite(index) || index < 0 || index >= players.length) {
      return;
    }
    const current = normalizeNumberInput(players[index].number);
    const normalized = current || "?";
    if (players[index].number !== normalized) {
      const slot = players[index];
      players[index] = { pos: slot.pos, number: normalized };
      if (team === "A") {
        this.setData({
          teamAPlayers: players,
          teamAMainGrid: buildMainGrid(players, getMainOrderForTeam("A", this.data.teamASide), "A"),
          teamALibero: buildLibero(players, "A"),
        });
        this.persistDraft(players, this.data.teamBPlayers);
      } else {
        this.setData({
          teamBPlayers: players,
          teamBMainGrid: buildMainGrid(players, getMainOrderForTeam("B", this.data.teamASide), "B"),
          teamBLibero: buildLibero(players, "B"),
        });
        this.persistDraft(this.data.teamAPlayers, players);
      }
    }
    // Only auto-shift L2->L1 after user finishes editing (blur), not during typing.
    const shifted = normalizeLiberoSlots(players);
    const shiftedChanged =
      shifted[6].number !== players[6].number || shifted[7].number !== players[7].number;
    if (shiftedChanged) {
      players = shifted;
      if (team === "A") {
        this.setData({
          teamAPlayers: players,
          teamAMainGrid: buildMainGrid(players, getMainOrderForTeam("A", this.data.teamASide), "A"),
          teamALibero: buildLibero(players, "A"),
        });
        this.persistDraft(players, this.data.teamBPlayers);
      } else {
        this.setData({
          teamBPlayers: players,
          teamBMainGrid: buildMainGrid(players, getMainOrderForTeam("B", this.data.teamASide), "B"),
          teamBLibero: buildLibero(players, "B"),
        });
        this.persistDraft(this.data.teamAPlayers, players);
      }
    }
    this.deferClearActiveCreateInputKey(blurKey);
    if (!current || current === "?") {
      return;
    }
    const duplicateCount = players.filter((p) => normalizeNumberInput(p.number) === current).length;
    if (duplicateCount > 1) {
      showToastHint("球员号码重复");
    }
  },

  deferClearActiveCreateInputKey(blurKey: string) {
    setTimeout(() => {
      if (this.data.activeCreateInputKey === blurKey) {
        this.setData({ activeCreateInputKey: "" });
      }
    }, 0);
  },

  onTeamServeButton(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { team: TeamCode };
    const team = dataset.team;
    const current = this.data.servingTeam;
    const next = current === team ? (team === "A" ? "B" : "A") : team;
    this.setData({ servingTeam: next, servePulseTeam: team });
    setTimeout(() => {
      if (this.data.servePulseTeam === team) {
        this.setData({ servePulseTeam: "" });
      }
    }, 180);
    this.persistDraft();
  },

  onToggleTeamSide() {
    const nextSide: TeamCode = this.data.teamASide === "A" ? "B" : "A";
    this.setData({
      teamASide: nextSide,
      sidePulse: true,
      teamAMainGrid: buildMainGrid(this.data.teamAPlayers, getMainOrderForTeam("A", nextSide), "A"),
      teamBMainGrid: buildMainGrid(this.data.teamBPlayers, getMainOrderForTeam("B", nextSide), "B"),
    });
    setTimeout(() => {
      if (this.data.sidePulse) {
        this.setData({ sidePulse: false });
      }
    }, 180);
    this.persistDraft();
  },

  isNumberOnCourt(players: PlayerSlot[], number: string): boolean {
    const target = normalizeNumberInput(number);
    if (!target) {
      return false;
    }
    return players.some(function (item) {
      return normalizeNumberInput(item.number) === target;
    });
  },

  promptOnCourtCaptain(teamLabel: string, team: TeamCode, players: PlayerSlot[]): Promise<string | null> {
    return new Promise((resolve) => {
      const order = getMainOrderForTeam(team, this.data.teamASide);
      this.captainPickerResolver = resolve;
      this.setData({
        showCaptainPicker: true,
        captainPickerTitle: teamLabel + "队场上队长",
        captainPickerTeam: team,
        captainPickerMainGrid: buildMainGrid(players, order, team),
        captainPickerLibero: buildLibero(players, team),
        captainPickerSelectedNo: "",
      });
    });
  },

  noop() {},

  onCaptainPickerSelect(e: WechatMiniprogram.TouchEvent) {
    const number = normalizeNumberInput(String((e.currentTarget.dataset as { number?: string }).number || ""));
    if (!number) {
      return;
    }
    this.setData({ captainPickerSelectedNo: number });
  },

  onCaptainPickerCancel() {
    const resolver = this.captainPickerResolver;
    this.captainPickerResolver = null;
    this.setData({
      showCaptainPicker: false,
      captainPickerSelectedNo: "",
      captainPickerMainGrid: [],
      captainPickerLibero: [],
    });
    if (resolver) {
      resolver(null);
    }
  },

  onCaptainPickerConfirm() {
    const value = normalizeNumberInput(this.data.captainPickerSelectedNo);
    if (!value) {
      showToastHint("请先选择队长号码");
      return;
    }
    const resolver = this.captainPickerResolver;
    this.captainPickerResolver = null;
    this.setData({
      showCaptainPicker: false,
      captainPickerSelectedNo: "",
      captainPickerMainGrid: [],
      captainPickerLibero: [],
    });
    if (resolver) {
      resolver(value);
    }
  },

  async ensureOnCourtCaptains(
    teamAPlayers: PlayerSlot[],
    teamBPlayers: PlayerSlot[]
  ): Promise<{ teamACaptainNo: string; teamBCaptainNo: string } | null> {
    let teamACaptainNo = normalizeNumberInput(this.data.teamACaptainNo);
    let teamBCaptainNo = normalizeNumberInput(this.data.teamBCaptainNo);
    const aOk = this.isNumberOnCourt(teamAPlayers, teamACaptainNo);
    const bOk = this.isNumberOnCourt(teamBPlayers, teamBCaptainNo);
    const teamADisplayName = (this.data.teamAName || "").trim() || "甲";
    const teamBDisplayName = (this.data.teamBName || "").trim() || "乙";

    if (!aOk) {
      const enteredA = await this.promptOnCourtCaptain(teamADisplayName, "A", teamAPlayers);
      if (!enteredA) {
        return null;
      }
      teamACaptainNo = enteredA;
    }
    if (!bOk) {
      const enteredB = await this.promptOnCourtCaptain(teamBDisplayName, "B", teamBPlayers);
      if (!enteredB) {
        return null;
      }
      teamBCaptainNo = enteredB;
    }
    return {
      teamACaptainNo: teamACaptainNo,
      teamBCaptainNo: teamBCaptainNo,
    };
  },

  persistDraft(teamAPlayersArg?: PlayerSlot[], teamBPlayersArg?: PlayerSlot[]) {
    const roomId = this.data.roomId;
    if (!roomId || this.data.createMode) {
      return;
    }
    const teamAPlayers = teamAPlayersArg || this.data.teamAPlayers;
    const teamBPlayers = teamBPlayersArg || this.data.teamBPlayers;
    const mode = this.data.matchModes[this.data.matchModeIndex] || this.data.matchModes[0];
    const captainEnabled = isCaptainSetupEnabledByIndex(this.data.setupCaptainIndex);
    updateRoomAsync(roomId, (room) => {
      room.password = this.data.roomPassword.trim();
      room.settings = {
        sets: mode.sets,
        wins: mode.wins,
        maxScore: mode.maxScore,
        tiebreakScore: mode.tiebreakScore,
      };
      if (!captainEnabled) {
        room.settings.captainEnabled = false;
      }
      room.teamA = {
        name: this.data.teamAName.trim() || "甲",
        captainNo: captainEnabled ? this.data.teamACaptainNo.trim() : "",
        color: this.data.teamAColor,
        players: teamAPlayers.slice(),
      };
      room.teamB = {
        name: this.data.teamBName.trim() || "乙",
        captainNo: captainEnabled ? this.data.teamBCaptainNo.trim() : "",
        color: this.data.teamBColor,
        players: teamBPlayers.slice(),
      };
      if (!captainEnabled) {
        room.match.teamACurrentCaptainNo = "";
        room.match.teamBCurrentCaptainNo = "";
      }
      room.match.servingTeam = this.data.servingTeam;
      room.match.isSwapped = this.data.teamASide === "B";
      return room;
    }).catch(() => {});
  },

  prepareSaveValidationUI() {
    const shouldClearFocus =
      !!this.data.activeCreateInputKey ||
      !!this.data.focusCreatePasswordInput ||
      !!this.data.passwordFocused ||
      !!this.data.teamANameFocused ||
      !!this.data.teamBNameFocused;
    if (shouldClearFocus) {
      this.setData({
        activeCreateInputKey: "",
        focusCreatePasswordInput: false,
        passwordFocused: false,
        teamANameFocused: false,
        teamBNameFocused: false,
      });
    }
  },

  dismissKeyboardForSave() {
    this.prepareSaveValidationUI();
    wx.hideKeyboard({
      fail: () => {},
    });
  },

  async onSaveAndStart() {
    if (this.saveInFlight) {
      return;
    }
    this.saveInFlight = true;
    let showCreatingLoading = false;
    try {
    this.dismissKeyboardForSave();
    const roomId = String(this.data.roomId || "");
    const editMode = !!this.data.editMode;
    const createMode = !!this.data.createMode;
    if (createMode) {
      const app = getApp<IAppOption>();
      let clientId = String(app.globalData.clientId || wx.getStorageSync("volleyball.clientId") || "");
      if (!clientId) {
        clientId = "c_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
        app.globalData.clientId = clientId;
        wx.setStorageSync("volleyball.clientId", clientId);
      }
      // Prefer local lock verification to avoid long cloud round-trip blocking on tap.
      let lockValid = hasRoomLock(roomId, clientId);
      if (!lockValid) {
        lockValid = await withTimeout<boolean>(hasRoomLockAsync(roomId, clientId), 2500, false);
      }
      if (!lockValid) {
        // Network jitter / eventual consistency can cause a false-negative lock check.
        // Try to re-reserve once for the same owner before treating it as recycled.
        const localReReserved = reserveRoomId(roomId, clientId);
        const reReserved = await withTimeout<boolean>(
          reserveRoomIdAsync(roomId, clientId),
          2500,
          localReReserved
        );
        if (reReserved) {
          lockValid = true;
        }
      }
      if (!lockValid) {
        wx.showModal({
          title: "房间号已过期",
          content: "房间号已超时，系统将重新分配。已填信息会保留，如需邀请他人请重新复制邀请信息。",
          showCancel: false,
          confirmText: "重新分配",
          success: async (res) => {
            if (!res.confirm) {
              return;
            }
            await this.reassignExpiredRoomId(clientId);
          },
        });
        return;
      }
    }
    const teamANameRaw = sliceStringByLength(this.data.teamAName, TEAM_NAME_MAX_LENGTH);
    const teamBNameRaw = sliceStringByLength(this.data.teamBName, TEAM_NAME_MAX_LENGTH);
    if (teamANameRaw !== this.data.teamAName || teamBNameRaw !== this.data.teamBName) {
      this.setData({
        teamAName: teamANameRaw,
        teamBName: teamBNameRaw,
      });
      showToastHint("团队名称最多8个字");
    }
    const teamAName = teamANameRaw.trim() || "甲";
    const teamBName = teamBNameRaw.trim() || "乙";
    const roomPassword = this.data.roomPassword.trim();
    const mode = this.data.matchModes[this.data.matchModeIndex] || this.data.matchModes[0];
    const captainEnabled = isCaptainSetupEnabledByIndex(this.data.setupCaptainIndex);
    const permanentTeamACaptainNo = captainEnabled ? normalizeNumberInput(this.data.teamACaptainNo) : "";
    const permanentTeamBCaptainNo = captainEnabled ? normalizeNumberInput(this.data.teamBCaptainNo) : "";

    if (roomPassword.length !== 6) {
      showBlockHint("房间密码需6位数字");
      return;
    }
    const teamNameSpaceOnlyErr = getTeamNameWhitespaceOnlyError(teamANameRaw, teamBNameRaw);
    if (teamNameSpaceOnlyErr) {
      showBlockHint(teamNameSpaceOnlyErr);
      return;
    }
    const teamNameErr = getTeamNameError(teamANameRaw, teamBNameRaw);
    if (teamNameErr) {
      showBlockHint(teamNameErr);
      return;
    }
    if (captainEnabled && !permanentTeamACaptainNo) {
      showBlockHint("请填写甲队队长号码");
      return;
    }
    if (captainEnabled && !permanentTeamBCaptainNo) {
      showBlockHint("请填写乙队队长号码");
      return;
    }
    if (this.data.teamAColor === this.data.teamBColor) {
      showBlockHint("甲/乙队颜色不能相同");
      return;
    }

    const errA = validateTeamPlayers(this.data.teamAPlayers, teamAName);
    if (errA) {
      showBlockHint(errA);
      return;
    }

    const errB = validateTeamPlayers(this.data.teamBPlayers, teamBName);
    if (errB) {
      showBlockHint(errB);
      return;
    }

    showCreatingLoading = !!createMode && !editMode;
    if (showCreatingLoading) {
      wx.showLoading({
        title: "房间创建中",
        mask: true,
      });
    }

    if (createMode) {
      const created = await createRoomAsync({
        roomId: roomId,
        creatorClientId: getApp<IAppOption>().globalData.clientId,
        password: roomPassword,
        settings: {
          sets: mode.sets,
          wins: mode.wins,
          maxScore: mode.maxScore,
          tiebreakScore: mode.tiebreakScore,
          ...(captainEnabled ? {} : { captainEnabled: false }),
        },
        teamAName: teamAName,
        teamACaptainNo: permanentTeamACaptainNo,
        teamAColor: this.data.teamAColor,
        teamAPlayers: this.data.teamAPlayers.slice(),
        teamBName: teamBName,
        teamBCaptainNo: permanentTeamBCaptainNo,
        teamBColor: this.data.teamBColor,
        teamBPlayers: this.data.teamBPlayers.slice(),
      });
      if (!created) {
        showBlockHint("创建失败");
        return;
      }
      const nextCreated = await updateRoomAsync(created.roomId, (room) => {
        const nowTs = Date.now();
        if (room.status !== "match") {
          room.expiresAt = nowTs + ROOM_MATCH_TTL_MS;
          room.extraTimeGranted = false;
        }
        room.status = "match";
        if (!(room as any).matchEnteredAt) {
          (room as any).matchEnteredAt = nowTs;
        }
        delete (room.match as any).teamACurrentCaptainNo;
        delete (room.match as any).teamBCurrentCaptainNo;
        (room.match as any).preStartCaptainConfirmed = false;
        (room.match as any).preStartCaptainConfirmSetNo = 0;
        room.match.servingTeam = this.data.servingTeam;
        room.match.isSwapped = this.data.teamASide === "B";
        return room;
      });
      if (!nextCreated) {
        showBlockHint("创建失败");
        return;
      }
      const clientId = getApp<IAppOption>().globalData.clientId;
      await releaseRoomIdAsync(created.roomId, clientId);
      this.setData({ createCommitted: true });
      await heartbeatRoomAsync(created.roomId, clientId);
      saveLastRoomEntry(created.roomId, roomPassword);
      this.enterMatchPage(created.roomId);
      return;
    }
    const next = await updateRoomAsync(roomId, (room) => {
      if (!editMode) {
        const nowTs = Date.now();
        if (room.status !== "match") {
          room.expiresAt = nowTs + ROOM_MATCH_TTL_MS;
          room.extraTimeGranted = false;
        }
        room.status = "match";
        if (!(room as any).matchEnteredAt) {
          (room as any).matchEnteredAt = nowTs;
        }
      }
      room.password = roomPassword;
      room.settings = {
        sets: mode.sets,
        wins: mode.wins,
        maxScore: mode.maxScore,
        tiebreakScore: mode.tiebreakScore,
      };
      if (!captainEnabled) {
        room.settings.captainEnabled = false;
      }
      room.teamA = {
        name: teamAName,
        captainNo: permanentTeamACaptainNo,
        color: this.data.teamAColor,
        players: this.data.teamAPlayers.slice(),
      };
      room.teamB = {
        name: teamBName,
        captainNo: permanentTeamBCaptainNo,
        color: this.data.teamBColor,
        players: this.data.teamBPlayers.slice(),
      };
      delete (room.match as any).teamACurrentCaptainNo;
      delete (room.match as any).teamBCurrentCaptainNo;
      (room.match as any).preStartCaptainConfirmed = false;
      (room.match as any).preStartCaptainConfirmSetNo = 0;
      room.match.servingTeam = this.data.servingTeam;
      room.match.isSwapped = this.data.teamASide === "B";
      return room;
    });

    if (!next) {
      this.handleRoomClosed();
      return;
    }

    if (editMode) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    saveLastRoomEntry(roomId, roomPassword);
    this.enterMatchPage(roomId);
    } finally {
      if (showCreatingLoading) {
        wx.hideLoading();
      }
      this.saveInFlight = false;
    }
  },

  onCreateInviteTap() {
    this.setData({ createInviteBtnFx: true });
    setTimeout(() => this.setData({ createInviteBtnFx: false }), 260);
    const roomPassword = this.data.roomPassword.trim();
    if (!/^\d{6}$/.test(roomPassword)) {
      showBlockHint("房间密码需6位数字");
      return;
    }
  },

  onCreateContinueTap() {
    if (this.saveInFlight) {
      return;
    }
    this.setData({ createContinueBtnFx: true });
    setTimeout(() => this.setData({ createContinueBtnFx: false }), 260);
    this.onSaveAndStart();
  },

  onShareAppMessage() {
    const roomId = String(this.data.roomId || "");
    const password = String(this.data.roomPassword || "");
    const hasInvitePayload = /^\d{6}$/.test(roomId) && /^\d{6}$/.test(password);
    return {
      title: buildShareCardTitle(hasInvitePayload),
      path: hasInvitePayload ? buildJoinSharePath(roomId, password) : "/pages/home/home",
      imageUrl: SHARE_IMAGE_URL,
    };
  },
});
