import {
  getRoomAsync,
  getRoomExistenceFromServerAsync,
  updateRoomAsync,
  subscribeRoomWatch,
  heartbeatRoomAsync,
  getRoomOwnerClientId,
  getRoomOperatorClientId,
  getRoomControlRole,
  transferRoomOperatorAsync,
  TEAM_COLOR_OPTIONS,
} from "../../utils/room-service";
import { showBlockHint, showToastHint } from "../../utils/hint";
import { getMainOrderForTeam, type MainPosition, type TeamCode } from "../../utils/lineup-order";
import { computeLandscapeSafePad } from "../../utils/safe-pad";

type Position = "I" | "II" | "III" | "IV" | "V" | "VI" | "L1" | "L2";
type PlayerSlot = { pos: Position; number: string };
type DisplayPlayerSlot = PlayerSlot & { index: number; inputKey: string };
type TeamRows = { libero: DisplayPlayerSlot[] };
type TeamPosRect = { left: number; top: number; width: number; height: number };
type TeamRectMap = Partial<Record<MainPosition, TeamPosRect>>;
type TeamMainNoMap = Partial<Record<MainPosition, string>>;
type RotateFlyItem = {
  id: string;
  team: TeamCode;
  number: string;
  isCaptain: boolean;
  style: string;
};
type ConnState = "online" | "reconnecting" | "offline";
type CaptainPickerTeam = TeamCode;
type LineupAdjustDraft = {
  setNo: number;
  isSwapped: boolean;
  servingTeam: TeamCode;
  teamAPlayers: PlayerSlot[];
  teamBPlayers: PlayerSlot[];
  teamACaptainNo: string;
  teamBCaptainNo: string;
  teamAInitialCaptainNo: string;
  teamBInitialCaptainNo: string;
  teamAManualCaptainChosen: boolean;
  teamBManualCaptainChosen: boolean;
};
const ALL_POSITIONS: Position[] = ["I", "II", "III", "IV", "V", "VI", "L1", "L2"];
const MAIN_POSITIONS: MainPosition[] = ["I", "II", "III", "IV", "V", "VI"];
const NUMBER_SOURCE_MAP: Record<Position, Position> = {
  I: "II",
  II: "III",
  III: "IV",
  IV: "V",
  V: "VI",
  VI: "I",
  L1: "L1",
  L2: "L2",
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

function normalizeNumberInput(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 2);
  if (!digits) {
    return "";
  }
  return String(Number(digits));
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

function getMissingMainPosition(players: PlayerSlot[]): MainPosition | "" {
  for (let i = 0; i < MAIN_POSITIONS.length; i += 1) {
    const pos = MAIN_POSITIONS[i];
    const slot = (players || []).find((p) => p.pos === pos);
    const no = normalizeNumberInput(String((slot && slot.number) || ""));
    if (!no) {
      return pos;
    }
  }
  return "";
}

function rotateTeamByRule(players: PlayerSlot[]): PlayerSlot[] {
  const byPos: Record<string, PlayerSlot> = {};
  players.forEach(function (p) {
    byPos[p.pos] = p;
  });
  return ALL_POSITIONS.map(function (pos) {
    const sourcePos = NUMBER_SOURCE_MAP[pos];
    const source = byPos[sourcePos];
    return {
      pos: pos,
      number: source ? source.number : "?",
    };
  });
}

function buildMainMap(players: PlayerSlot[]): TeamMainNoMap {
  const map: TeamMainNoMap = {};
  players.forEach((p) => {
    if (MAIN_POSITIONS.indexOf(p.pos as MainPosition) >= 0) {
      map[p.pos as MainPosition] = p.number;
    }
  });
  return map;
}

function clonePlayers(players: any[]): PlayerSlot[] {
  const byPos: Partial<Record<Position, string>> = {};
  (players || []).forEach(function (item: any) {
    const pos = String(item && item.pos) as Position;
    if (!(pos in PLAYER_INDEX_BY_POS)) {
      return;
    }
    const number = String(item && item.number ? item.number : "?");
    byPos[pos] = number;
  });
  return (Object.keys(PLAYER_INDEX_BY_POS) as Position[]).map(function (pos) {
    return { pos: pos, number: byPos[pos] || "?" };
  });
}

function buildMainGridByOrder(players: PlayerSlot[], order: MainPosition[], team: TeamCode): DisplayPlayerSlot[][] {
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

function buildTeamRows(players: PlayerSlot[], team: TeamCode): TeamRows {
  const byPos: Record<string, PlayerSlot> = {};
  players.forEach(function (p) {
    byPos[p.pos] = p;
  });
  return {
    libero: (["L1", "L2"] as Position[]).map(function (pos) {
      const slot = byPos[pos] || { pos: pos, number: "?" };
      return {
        pos: slot.pos,
        number: slot.number,
        index: PLAYER_INDEX_BY_POS[pos],
        inputKey: team + "-" + String(PLAYER_INDEX_BY_POS[pos]),
      };
    }),
  };
}

function hexToRgbTriplet(hex: string): string {
  const normalized = String(hex || "").trim();
  const m = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) {
    return "138, 135, 208";
  }
  const c = m[1];
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return String(r) + ", " + String(g) + ", " + String(b);
}

function getPresetLineupFromPreviousSet(room: any): {
  teamAPlayers: PlayerSlot[];
  teamBPlayers: PlayerSlot[];
  isSwapped: boolean;
  servingTeam: TeamCode;
} {
  const currentSetNo = Math.max(1, Number(room && room.match && room.match.setNo) || 1);
  const previousSetNo = Math.max(1, currentSetNo - 1);
  const undoStack = Array.isArray(room && room.match && room.match.undoStack) ? room.match.undoStack : [];
  const prevSetSnapshots = undoStack.filter(function (item: any) {
    return Math.max(1, Number(item && item.setNo) || 1) === previousSetNo;
  });

  let teamAPlayers: PlayerSlot[];
  let teamBPlayers: PlayerSlot[];
  let endIsSwapped = !!(room && room.match && room.match.isSwapped);
  let nextServingTeam: TeamCode = room && room.match && room.match.servingTeam === "B" ? "A" : "B";

  if (prevSetSnapshots.length > 0) {
    teamAPlayers = clonePlayers(prevSetSnapshots[0].teamAPlayers || []);
    teamBPlayers = clonePlayers(prevSetSnapshots[0].teamBPlayers || []);
    const firstSnapshot = prevSetSnapshots[0] || {};
    const prevSetServingTeam: TeamCode = firstSnapshot.servingTeam === "B" ? "B" : "A";
    nextServingTeam = prevSetServingTeam === "A" ? "B" : "A";
    const lastSnapshot = prevSetSnapshots[prevSetSnapshots.length - 1] || {};
    if (typeof lastSnapshot.isSwapped === "boolean") {
      endIsSwapped = !!lastSnapshot.isSwapped;
    }
  } else {
    teamAPlayers = clonePlayers((room && room.teamA && room.teamA.players) || []);
    teamBPlayers = clonePlayers((room && room.teamB && room.teamB.players) || []);
  }

  return {
    teamAPlayers,
    teamBPlayers,
    isSwapped: !endIsSwapped,
    servingTeam: nextServingTeam,
  };
}

function setKeepScreenOnSafe(keepScreenOn: boolean): void {
  wx.setKeepScreenOn({
    keepScreenOn,
    fail: () => {},
  });
}

function buildAdjustHeadHint(setNo: number, wins: number): string {
  const nSet = Math.max(1, Number(setNo || 1));
  const nWins = Math.max(1, Number(wins || 1));
  const decidingSetNo = nWins > 1 ? nWins * 2 - 1 : 1;
  if (nWins > 1 && nSet === decidingSetNo) {
    return "已沿用上一局首发阵容，点击球员可修改";
  }
  return "已沿用上一局首发阵容并按结束时场区换边，点击球员可修改";
}

function isDecidingSetByRule(setNo: number, wins: number): boolean {
  const nSet = Math.max(1, Number(setNo || 1));
  const nWins = Math.max(1, Number(wins || 1));
  const decidingSetNo = nWins > 1 ? nWins * 2 - 1 : 1;
  return nWins > 1 && nSet === decidingSetNo;
}

function ensureClientId(): string {
  const app = getApp<IAppOption>();
  let clientId = String((app && app.globalData && app.globalData.clientId) || "");
  if (clientId) {
    return clientId;
  }
  clientId = String(wx.getStorageSync("volleyball.clientId") || "");
  if (!clientId) {
    clientId =
      "c_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1000000).toString(36);
    wx.setStorageSync("volleyball.clientId", clientId);
  }
  if (app && app.globalData) {
    app.globalData.clientId = clientId;
  }
  return clientId;
}

Page({
  currentSetNo: 1 as number,
  isReconfigureEntry: false as boolean,
  clientId: "" as string,
  draftSaveTimer: 0 as number,
  inputEditing: false as boolean,
  inputEditingReleaseTimer: 0 as number,
  roomWatchOff: null as null | (() => void),
  continueInFlight: false as boolean,
  leavingPage: false as boolean,
  sideSwitchInFlight: false as boolean,
  sideSwitchPendingCount: 0 as number,
  sideSwitchActionQueue: Promise.resolve() as Promise<void>,
  rotateActionQueueA: Promise.resolve() as Promise<void>,
  rotateActionQueueB: Promise.resolve() as Promise<void>,
  takeoverInFlight: false as boolean,
  connFailCount: 0 as number,
  connSuccessStreak: 0 as number,
  connStateChangedAt: 0 as number,
  heartbeatTimer: 0 as number,
  roomMissingRetryTimer: 0 as number,
  roomMissingToastAt: 0 as number,
  roomMissingVerifyAt: 0 as number,
  roomMissingVerifyInFlight: false as boolean,
  roomClosedHandled: false as boolean,
  lastRoomSnapshot: null as any,
  networkOnline: true as boolean,
  networkStatusHandler: null as null | ((res: { isConnected?: boolean }) => void),
  data: {
    continueBtnFx: false,
    adjustHeadTitle: "确认下一局的球员配置",
    adjustHeadHint: "已沿用上一局首发阵容并按结束时场区换边，点击球员可修改",
    isDecidingSet: false,
    isSwapped: false,
    switchingOut: false,
    switchingIn: false,
    servingTeam: "A" as TeamCode,
    hideTeamAMainNumbers: false,
    hideTeamBMainNumbers: false,
    roomId: "",
    teamAName: "甲",
    teamBName: "乙",
    teamAColor: TEAM_COLOR_OPTIONS[2].value,
    teamBColor: TEAM_COLOR_OPTIONS[6].value,
    teamARGB: "108, 99, 190",
    teamBRGB: "102, 185, 122",
    teamACaptainNo: "",
    teamBCaptainNo: "",
    teamAInitialCaptainNo: "",
    teamBInitialCaptainNo: "",
    teamAManualCaptainChosen: false,
    teamBManualCaptainChosen: false,
    teamACaptainSource: "" as "" | "auto" | "manual",
    teamBCaptainSource: "" as "" | "auto" | "manual",
    teamACaptainPickDisabled: false,
    teamBCaptainPickDisabled: false,
    teamACaptainBtnText: "选择场上队长",
    teamBCaptainBtnText: "选择场上队长",
    teamACaptainResolved: false,
    teamBCaptainResolved: false,
    teamASideText: "左场区",
    teamBSideText: "右场区",
    teamAShowCaptainCheck: false,
    teamBShowCaptainCheck: false,
    teamAShowCaptainRepick: false,
    teamBShowCaptainRepick: false,
    teamAPlayers: [] as PlayerSlot[],
    teamBPlayers: [] as PlayerSlot[],
    activeAdjustInputKey: "",
    teamALibero: [] as DisplayPlayerSlot[],
    teamAMainGrid: [] as DisplayPlayerSlot[][],
    teamBLibero: [] as DisplayPlayerSlot[],
    teamBMainGrid: [] as DisplayPlayerSlot[][],
    safePadTop: "0px",
    safePadRight: "0px",
    safePadBottom: "0px",
    safePadLeft: "0px",
    rotateFlyItemsA: [] as RotateFlyItem[],
    rotateFlyItemsB: [] as RotateFlyItem[],
    showCaptainPicker: false,
    captainPickerTitle: "",
    captainPickerTeam: "A" as CaptainPickerTeam,
    captainPickerMainGrid: [] as DisplayPlayerSlot[][],
    captainPickerLibero: [] as DisplayPlayerSlot[],
    captainPickerSelectedNo: "",
    connStatusText: "连接中",
    connStatusClass: "status-reconnecting",
    roomOwnerClientId: "",
    roomOperatorClientId: "",
    controlRole: "operator" as "operator" | "observer",
    hasOperationAuthority: true,
  },

  setConnState(state: ConnState, options?: { force?: boolean }) {
    const nextText = state === "online" ? "已连接" : state === "offline" ? "已离线" : "连接中";
    const nextClass = state === "online" ? "status-online" : state === "offline" ? "status-offline" : "status-reconnecting";
    if (this.data.connStatusText === nextText && this.data.connStatusClass === nextClass) {
      return;
    }
    const nowTs = Date.now();
    const force = !!(options && options.force);
    const elapsed = nowTs - Math.max(0, Number(this.connStateChangedAt) || 0);
    if (!force && elapsed > 0 && elapsed < 5000) {
      return;
    }
    this.setData({
      connStatusText: nextText,
      connStatusClass: nextClass,
    });
    this.connStateChangedAt = nowTs;
  },

  getConnState(): ConnState {
    const klass = String(this.data.connStatusClass || "");
    if (klass === "status-online") {
      return "online";
    }
    if (klass === "status-offline") {
      return "offline";
    }
    return "reconnecting";
  },

  markConnectionAlive() {
    if (!this.networkOnline) {
      return;
    }
    this.connFailCount = 0;
    this.connSuccessStreak += 1;
    const current = this.getConnState();
    if (current === "online") {
      return;
    }
    if (this.connSuccessStreak >= 2) {
      this.setConnState("online");
      return;
    }
    this.setConnState("reconnecting");
  },

  markConnectionIssue() {
    if (!this.networkOnline) {
      this.setConnState("offline");
      return;
    }
    this.connSuccessStreak = 0;
    this.connFailCount += 1;
    const current = this.getConnState();
    if (current === "online") {
      if (this.connFailCount >= 3) {
        this.setConnState("offline");
        return;
      }
      if (this.connFailCount >= 2) {
        this.setConnState("reconnecting");
      }
      return;
    }
    if (this.connFailCount >= 2) {
      this.setConnState("offline");
      return;
    }
    this.setConnState("reconnecting");
  },

  updateNetworkState(isConnected: boolean) {
    this.networkOnline = !!isConnected;
    if (!this.networkOnline) {
      this.connFailCount = 0;
      this.connSuccessStreak = 0;
      this.setConnState("offline", { force: true });
      return;
    }
    this.connFailCount = 0;
    this.connSuccessStreak = 0;
    if (this.data.connStatusClass === "status-offline") {
      this.setConnState("reconnecting", { force: true });
    }
  },

  refreshNetworkState() {
    if (typeof wx.getNetworkType !== "function") {
      return;
    }
    wx.getNetworkType({
      success: (res: WechatMiniprogram.GetNetworkTypeSuccessCallbackResult) => {
        this.updateNetworkState(String(res.networkType || "") !== "none");
      },
      fail: () => {},
    });
  },

  bindNetworkStatus() {
    const api = wx as any;
    if (typeof api.onNetworkStatusChange !== "function") {
      return;
    }
    if (!this.networkStatusHandler) {
      this.networkStatusHandler = (res: { isConnected?: boolean }) => {
        this.updateNetworkState(!!(res && res.isConnected));
      };
    }
    api.onNetworkStatusChange(this.networkStatusHandler);
  },

  unbindNetworkStatus() {
    const api = wx as any;
    if (typeof api.offNetworkStatusChange === "function" && this.networkStatusHandler) {
      api.offNetworkStatusChange(this.networkStatusHandler);
    }
  },

  startHeartbeatProbe() {
    this.stopHeartbeatProbe();
    this.sendHeartbeatProbe();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeatProbe();
    }, 20000) as unknown as number;
  },

  stopHeartbeatProbe() {
    if (!this.heartbeatTimer) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
  },

  sendHeartbeatProbe() {
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    const clientId = String(this.clientId || ensureClientId());
    if (!clientId) {
      this.markConnectionIssue();
      return;
    }
    heartbeatRoomAsync(roomId, clientId)
      .then(() => {
        this.markConnectionAlive();
      })
      .catch(() => {
        this.markConnectionIssue();
      });
  },

  onLoad(options: Record<string, string>) {
    const roomId = String((options && options.roomId) || "");
    const entry = String((options && options.entry) || "");
    this.isReconfigureEntry = entry === "reconfigure";
    if (!roomId) {
      wx.reLaunch({ url: "/pages/home/home" });
      return;
    }
    this.clientId = ensureClientId();
    this.setData({ roomId: roomId });
    this.setConnState("reconnecting");
    this.syncSafePadding();
    if ((wx as any).onWindowResize) {
      (wx as any).onWindowResize(this.onWindowResize);
    }
    this.bindNetworkStatus();
    this.refreshNetworkState();
    setTimeout(() => {
      this.syncSafePadding();
    }, 80);
    this.loadRoom();
  },

  onShow() {
    this.leavingPage = false;
    this.setConnState("reconnecting", { force: true });
    setKeepScreenOnSafe(true);
    this.syncSafePadding();
    setTimeout(() => {
      this.syncSafePadding();
    }, 80);
    setTimeout(() => {
      this.syncSafePadding();
    }, 260);
    this.refreshNetworkState();
    this.startHeartbeatProbe();
    this.startRoomWatch();
    this.loadRoom();
  },

  onUnload() {
    this.persistLineupDraftNow().catch(() => {});
    this.clearDraftSaveTimer();
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    setKeepScreenOnSafe(false);
    this.clearRoomMissingRetry();
    if ((wx as any).offWindowResize) {
      (wx as any).offWindowResize(this.onWindowResize);
    }
    this.unbindNetworkStatus();
    this.stopHeartbeatProbe();
    this.stopRoomWatch();
  },

  onHide() {
    this.persistLineupDraftNow().catch(() => {});
    this.inputEditing = false;
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    setKeepScreenOnSafe(false);
    this.clearRoomMissingRetry();
    this.stopHeartbeatProbe();
    this.stopRoomWatch();
  },

  scheduleRoomMissingRetry(delayMs = 1200) {
    if (this.roomMissingRetryTimer) {
      return;
    }
    this.roomMissingRetryTimer = setTimeout(() => {
      this.roomMissingRetryTimer = 0;
      this.loadRoom();
    }, Math.max(400, Number(delayMs) || 1200)) as unknown as number;
  },

  clearRoomMissingRetry() {
    if (!this.roomMissingRetryTimer) {
      return;
    }
    clearTimeout(this.roomMissingRetryTimer);
    this.roomMissingRetryTimer = 0;
  },

  getRoomSnapshotStorageKey(roomId: string): string {
    return "volleyball.roomSnapshot." + String(roomId || "");
  },

  readCachedRoomSnapshot(roomId: string): any | null {
    try {
      const key = this.getRoomSnapshotStorageKey(roomId);
      const cached = wx.getStorageSync(key);
      if (cached && typeof cached === "object" && String((cached as any).roomId || "") === roomId) {
        return cached;
      }
    } catch (_e) {}
    return null;
  },

  writeCachedRoomSnapshot(room: any) {
    const roomId = String((room && room.roomId) || "");
    if (!roomId) {
      return;
    }
    try {
      const key = this.getRoomSnapshotStorageKey(roomId);
      wx.setStorageSync(key, room);
    } catch (_e) {}
  },

  handleRoomClosed() {
    if (this.roomClosedHandled) {
      return;
    }
    this.roomClosedHandled = true;
    this.clearRoomMissingRetry();
    wx.hideToast({
      fail: () => {},
    });
    wx.showModal({
      title: "房间已失效",
      content: "该裁判团队不存在或已过期，请重新创建或加入。",
      showCancel: false,
      confirmText: "返回首页",
      success: () => {
        wx.reLaunch({ url: "/pages/home/home" });
      },
    });
  },

  verifyRoomMissingFromServer() {
    const roomId = String(this.data.roomId || "");
    if (!roomId || this.roomClosedHandled) {
      return;
    }
    const nowTs = Date.now();
    if (this.roomMissingVerifyInFlight) {
      return;
    }
    if (nowTs - Math.max(0, Number(this.roomMissingVerifyAt) || 0) < 2500) {
      return;
    }
    this.roomMissingVerifyInFlight = true;
    this.roomMissingVerifyAt = nowTs;
    getRoomExistenceFromServerAsync(roomId)
      .then((status) => {
        if (status === "missing") {
          this.handleRoomClosed();
          return;
        }
        if (status === "exists") {
          this.roomClosedHandled = false;
          this.loadRoom();
          return;
        }
        this.scheduleRoomMissingRetry(1600);
      })
      .catch(() => {})
      .finally(() => {
        this.roomMissingVerifyInFlight = false;
      });
  },

  handleRoomTemporarilyUnavailable() {
    this.markConnectionIssue();
    this.scheduleRoomMissingRetry(1200);
    this.verifyRoomMissingFromServer();
    const nowTs = Date.now();
    if (nowTs - Math.max(0, Number(this.roomMissingToastAt) || 0) < 1100) {
      return;
    }
    this.roomMissingToastAt = nowTs;
    wx.showToast({
      title: "连接中，正在重试",
      icon: "loading",
      duration: 1200,
      mask: false,
      fail: () => {
        showToastHint("连接中，正在重试");
      },
    });
  },

  enqueueRotateAction(team: TeamCode, task: () => Promise<void>) {
    const key = team === "A" ? "rotateActionQueueA" : "rotateActionQueueB";
    (this as any)[key] = (this as any)[key]
      .catch(() => {})
      .then(async () => {
        await task();
      });
    return (this as any)[key] as Promise<void>;
  },

  enqueueSideSwitchAction(task: () => Promise<void>) {
    this.sideSwitchActionQueue = this.sideSwitchActionQueue
      .catch(() => {})
      .then(async () => {
        await task();
      });
    return this.sideSwitchActionQueue;
  },

  startRoomWatch() {
    if (this.leavingPage || this.continueInFlight) {
      return;
    }
    if (this.roomWatchOff) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    this.roomWatchOff = subscribeRoomWatch(roomId, () => {
      if (this.inputEditing || this.sideSwitchInFlight || this.sideSwitchPendingCount > 0) {
        return;
      }
      this.loadRoom();
    });
  },

  stopRoomWatch() {
    if (!this.roomWatchOff) {
      return;
    }
    this.roomWatchOff();
    this.roomWatchOff = null;
  },

  onWindowResize() {
    this.syncSafePadding();
  },

  clearDraftSaveTimer() {
    if (!this.draftSaveTimer) {
      return;
    }
    clearTimeout(this.draftSaveTimer);
    this.draftSaveTimer = 0;
  },

  buildLineupDraft(): LineupAdjustDraft {
    return {
      setNo: Math.max(1, Number(this.currentSetNo || 1)),
      isSwapped: !!this.data.isSwapped,
      servingTeam: this.data.servingTeam === "B" ? "B" : "A",
      teamAPlayers: clonePlayers(this.data.teamAPlayers || []),
      teamBPlayers: clonePlayers(this.data.teamBPlayers || []),
      teamACaptainNo: normalizeNumberInput(this.data.teamACaptainNo || ""),
      teamBCaptainNo: normalizeNumberInput(this.data.teamBCaptainNo || ""),
      teamAInitialCaptainNo: normalizeNumberInput(this.data.teamAInitialCaptainNo || ""),
      teamBInitialCaptainNo: normalizeNumberInput(this.data.teamBInitialCaptainNo || ""),
      teamAManualCaptainChosen: !!this.data.teamAManualCaptainChosen,
      teamBManualCaptainChosen: !!this.data.teamBManualCaptainChosen,
    };
  },

  async persistLineupDraftNow() {
    if (this.leavingPage || this.continueInFlight) {
      return;
    }
    this.clearDraftSaveTimer();
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    const draft = this.buildLineupDraft();
    await updateRoomAsync(roomId, (room) => {
      const setNo = Math.max(1, Number(room.match && room.match.setNo) || 1);
      draft.setNo = setNo;
      this.currentSetNo = setNo;
      (room.match as any).lineupAdjustDraft = draft;
      return room;
    });
  },

  schedulePersistLineupDraft() {
    this.clearDraftSaveTimer();
    this.draftSaveTimer = setTimeout(() => {
      this.persistLineupDraftNow().catch(() => {});
    }, 120) as unknown as number;
  },

  applyDisplay(teamAPlayers: PlayerSlot[], teamBPlayers: PlayerSlot[], isSwapped: boolean) {
    const teamASide: TeamCode = isSwapped ? "B" : "A";
    const aRows = buildTeamRows(teamAPlayers, "A");
    const bRows = buildTeamRows(teamBPlayers, "B");
    this.setData({
      teamAPlayers: teamAPlayers,
      teamBPlayers: teamBPlayers,
      isSwapped: isSwapped,
      teamALibero: aRows.libero,
      teamAMainGrid: buildMainGridByOrder(teamAPlayers, getMainOrderForTeam("A", teamASide), "A"),
      teamBLibero: bRows.libero,
      teamBMainGrid: buildMainGridByOrder(teamBPlayers, getMainOrderForTeam("B", teamASide), "B"),
      teamASideText: isSwapped ? "右场区" : "左场区",
      teamBSideText: isSwapped ? "左场区" : "右场区",
    });
    this.syncCaptainPickState(teamAPlayers, teamBPlayers);
  },

  deferClearAdjustFocus(inputKey: string) {
    if (!inputKey) {
      return;
    }
    setTimeout(() => {
      if (this.data.activeAdjustInputKey !== inputKey) {
        return;
      }
      this.setData({ activeAdjustInputKey: "" });
    }, 0);
  },

  isCaptainInMain(players: PlayerSlot[], captainNo: string): boolean {
    const target = normalizeNumberInput(captainNo);
    if (!target) {
      return false;
    }
    return players.some((p) => MAIN_POSITIONS.indexOf(p.pos as MainPosition) >= 0 && normalizeNumberInput(p.number) === target);
  },

  isCaptainOnCourt(players: PlayerSlot[], captainNo: string): boolean {
    const target = normalizeNumberInput(captainNo);
    if (!target) {
      return false;
    }
    return players.some((p) => normalizeNumberInput(p.number) === target);
  },

  syncCaptainPickState(teamAPlayersArg?: PlayerSlot[], teamBPlayersArg?: PlayerSlot[]) {
    const teamAPlayers = teamAPlayersArg || this.data.teamAPlayers;
    const teamBPlayers = teamBPlayersArg || this.data.teamBPlayers;
    const aNo = normalizeNumberInput(this.data.teamACaptainNo);
    const bNo = normalizeNumberInput(this.data.teamBCaptainNo);
    const aInitNo = normalizeNumberInput(this.data.teamAInitialCaptainNo);
    const bInitNo = normalizeNumberInput(this.data.teamBInitialCaptainNo);
    const aAutoLocked = !!aInitNo && this.isCaptainInMain(teamAPlayers, aInitNo);
    const bAutoLocked = !!bInitNo && this.isCaptainInMain(teamBPlayers, bInitNo);
    const nextACaptainNo = aAutoLocked ? aInitNo : aNo;
    const nextBCaptainNo = bAutoLocked ? bInitNo : bNo;
    const aOnCourt = this.isCaptainOnCourt(teamAPlayers, nextACaptainNo);
    const bOnCourt = this.isCaptainOnCourt(teamBPlayers, nextBCaptainNo);
    const aManualMode = !aAutoLocked && !!this.data.teamAManualCaptainChosen && aOnCourt;
    const bManualMode = !bAutoLocked && !!this.data.teamBManualCaptainChosen && bOnCourt;

    const aResolved = aAutoLocked || aManualMode;
    const bResolved = bAutoLocked || bManualMode;

    const aText = aAutoLocked
      ? "队长号码 " + nextACaptainNo
      : aManualMode
        ? "下一局场上队长 " + nextACaptainNo
        : aInitNo
          ? "队长" + aInitNo + "不在首发6人中 选择场上队长"
          : "选择场上队长";
    const bText = bAutoLocked
      ? "队长号码 " + nextBCaptainNo
      : bManualMode
        ? "下一局场上队长 " + nextBCaptainNo
        : bInitNo
          ? "队长" + bInitNo + "不在首发6人中 选择场上队长"
          : "选择场上队长";

    this.setData({
      teamACaptainNo: nextACaptainNo,
      teamBCaptainNo: nextBCaptainNo,
      teamAManualCaptainChosen: aManualMode,
      teamBManualCaptainChosen: bManualMode,
      teamACaptainSource: aAutoLocked ? "auto" : aManualMode ? "manual" : "",
      teamBCaptainSource: bAutoLocked ? "auto" : bManualMode ? "manual" : "",
      teamACaptainResolved: aResolved,
      teamBCaptainResolved: bResolved,
      teamACaptainPickDisabled: aAutoLocked || aManualMode,
      teamBCaptainPickDisabled: bAutoLocked || bManualMode,
      teamACaptainBtnText: aText,
      teamBCaptainBtnText: bText,
      teamAShowCaptainCheck: aResolved,
      teamBShowCaptainCheck: bResolved,
      teamAShowCaptainRepick: aManualMode,
      teamBShowCaptainRepick: bManualMode,
    });
  },

  onAdjustFieldWrapTap(e: WechatMiniprogram.TouchEvent) {
    const focusKey = String((e.currentTarget.dataset as { focusKey?: string }).focusKey || "");
    if (!focusKey || this.data.activeAdjustInputKey === focusKey) {
      return;
    }
    this.setData({ activeAdjustInputKey: focusKey });
    this.inputEditing = true;
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
  },

  onAdjustBlankTap() {
    if (!this.data.activeAdjustInputKey) {
      return;
    }
    this.setData({ activeAdjustInputKey: "" });
    wx.hideKeyboard({
      fail: () => {},
    });
  },

  async loadRoom() {
    if (this.leavingPage || this.continueInFlight) {
      return;
    }
    if (this.sideSwitchInFlight || this.sideSwitchPendingCount > 0) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    let room: any = null;
    try {
      room = await getRoomAsync(roomId);
    } catch (_e) {
      this.markConnectionIssue();
      return;
    }
    if (!room) {
      const fallback = this.lastRoomSnapshot || this.readCachedRoomSnapshot(roomId);
      if (fallback) {
        room = fallback;
        this.handleRoomTemporarilyUnavailable();
      } else {
        this.handleRoomTemporarilyUnavailable();
        return;
      }
    } else {
      this.roomClosedHandled = false;
      this.clearRoomMissingRetry();
      wx.hideToast({
        fail: () => {},
      });
      this.lastRoomSnapshot = room;
      this.writeCachedRoomSnapshot(room);
    }
    this.lastRoomSnapshot = room;
    const setEndState = (room.match && (room.match as any).setEndState) || null;
    const setEndActive = !!(setEndState && setEndState.active);
    const setEndPhase = String((setEndState && setEndState.phase) || "");
    const setEndOwnerClientId = String((setEndState && setEndState.ownerClientId) || "");
    const currentClientId = String(this.clientId || ensureClientId());
    const roomOwnerClientId = getRoomOwnerClientId(room);
    const roomOperatorClientId = getRoomOperatorClientId(room);
    const controlRole = getRoomControlRole(room, currentClientId);
    if (!setEndActive || setEndPhase !== "lineup" || setEndOwnerClientId !== currentClientId) {
      wx.redirectTo({ url: "/pages/match/match?roomId=" + roomId });
      return;
    }

    const roomSetNo = Math.max(1, Number(room.match && room.match.setNo) || 1);
    const roomWins = Math.max(1, Number((room.settings && room.settings.wins) || 1));
    if (this.inputEditing) {
      return;
    }
    this.currentSetNo = roomSetNo;
    const preset = getPresetLineupFromPreviousSet(room);
    const roomTeamACaptain = normalizeNumberInput(room.teamA.captainNo || "");
    const roomTeamBCaptain = normalizeNumberInput(room.teamB.captainNo || "");
    const draft = (room.match && (room.match as any).lineupAdjustDraft) as LineupAdjustDraft | undefined;
    const canUseDraft =
      !!draft &&
      Number(draft.setNo || 0) === roomSetNo &&
      Array.isArray(draft.teamAPlayers) &&
      Array.isArray(draft.teamBPlayers);

    const initTeamAPlayers = canUseDraft ? clonePlayers(draft!.teamAPlayers || []) : preset.teamAPlayers;
    const initTeamBPlayers = canUseDraft ? clonePlayers(draft!.teamBPlayers || []) : preset.teamBPlayers;
    const initIsSwapped = canUseDraft ? !!draft!.isSwapped : preset.isSwapped;
    const initServingTeam: TeamCode = canUseDraft ? (draft!.servingTeam === "B" ? "B" : "A") : preset.servingTeam;
    // 永久队长只取创建房间时写入的 teamX.captainNo，不受中场临时草稿影响。
    const initTeamAInitialCaptainNo = roomTeamACaptain;
    const initTeamBInitialCaptainNo = roomTeamBCaptain;
    const initTeamACaptainNo = canUseDraft
      ? normalizeNumberInput(draft!.teamACaptainNo || roomTeamACaptain)
      : roomTeamACaptain;
    const initTeamBCaptainNo = canUseDraft
      ? normalizeNumberInput(draft!.teamBCaptainNo || roomTeamBCaptain)
      : roomTeamBCaptain;
    const initTeamAManualCaptainChosen = canUseDraft ? !!draft!.teamAManualCaptainChosen : false;
    const initTeamBManualCaptainChosen = canUseDraft ? !!draft!.teamBManualCaptainChosen : false;

    this.setData(
      {
        adjustHeadTitle: this.isReconfigureEntry ? "重新配置本局球员" : "确认下一局的球员配置",
        adjustHeadHint: this.isReconfigureEntry
          ? "已恢复本局此前配置，点击球员可继续调整"
          : buildAdjustHeadHint(roomSetNo, roomWins),
        isDecidingSet: isDecidingSetByRule(roomSetNo, roomWins),
        teamAName: room.teamA.name || "甲",
        teamBName: room.teamB.name || "乙",
        teamAColor: room.teamA.color || TEAM_COLOR_OPTIONS[2].value,
        teamBColor: room.teamB.color || TEAM_COLOR_OPTIONS[6].value,
        teamARGB: hexToRgbTriplet(room.teamA.color || TEAM_COLOR_OPTIONS[2].value),
        teamBRGB: hexToRgbTriplet(room.teamB.color || TEAM_COLOR_OPTIONS[6].value),
        teamACaptainNo: initTeamACaptainNo,
        teamBCaptainNo: initTeamBCaptainNo,
        teamAInitialCaptainNo: initTeamAInitialCaptainNo,
        teamBInitialCaptainNo: initTeamBInitialCaptainNo,
        teamAManualCaptainChosen: initTeamAManualCaptainChosen,
        teamBManualCaptainChosen: initTeamBManualCaptainChosen,
        teamACaptainSource: "",
        teamBCaptainSource: "",
        servingTeam: initServingTeam,
        activeAdjustInputKey: "",
        roomOwnerClientId: roomOwnerClientId,
        roomOperatorClientId: roomOperatorClientId,
        controlRole: controlRole,
        hasOperationAuthority: controlRole === "operator",
      },
      () => {
        this.applyDisplay(initTeamAPlayers, initTeamBPlayers, initIsSwapped);
      }
    );
  },

  onPlayerInputFocus(e: WechatMiniprogram.InputFocus) {
    const focusKey = String((e.currentTarget.dataset as { focusKey?: string }).focusKey || "");
    if (!focusKey) {
      return;
    }
    if (this.data.activeAdjustInputKey && this.data.activeAdjustInputKey !== focusKey) {
      return;
    }
    if (!this.data.activeAdjustInputKey) {
      this.setData({ activeAdjustInputKey: focusKey });
    }
    this.inputEditing = true;
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
  },

  onPlayerNumberInput(e: WechatMiniprogram.Input) {
    const focusKey = String((e.currentTarget.dataset as { focusKey?: string }).focusKey || "");
    if (focusKey && this.data.activeAdjustInputKey && this.data.activeAdjustInputKey !== focusKey) {
      return;
    }
    if (focusKey && !this.data.activeAdjustInputKey) {
      this.setData({ activeAdjustInputKey: focusKey });
    }
    const raw = (e.detail.value || "").replace(/\D/g, "").slice(0, 2);
    const number = raw || "?";
    this.inputEditing = true;
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    const dataset = e.currentTarget.dataset as { team: TeamCode; index: number };
    const team = dataset.team;
    const index = Number(dataset.index);
    const players = (team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers).slice();
    const current = players[index];
    if (!current) {
      return;
    }
    players[index] = { pos: current.pos, number: number };
    if (team === "A") {
      this.applyDisplay(players, this.data.teamBPlayers, this.data.isSwapped);
    } else {
      this.applyDisplay(this.data.teamAPlayers, players, this.data.isSwapped);
    }
    this.schedulePersistLineupDraft();
  },

  onPlayerNumberBlur(e: WechatMiniprogram.InputBlur) {
    const dataset = e.currentTarget.dataset as { team: TeamCode; index: number };
    const team = dataset.team;
    const index = Number(dataset.index);
    const blurKey = String((dataset as { focusKey?: string }).focusKey || (String(team) + "-" + String(index)));
    let players = (team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers).slice();
    if (!Number.isFinite(index) || index < 0 || index >= players.length) {
      return;
    }
    const current = normalizeNumberInput(players[index].number);
    const normalized = current || "?";
    let displayUpdated = false;

    if (players[index].number !== normalized) {
      const slot = players[index];
      players[index] = { pos: slot.pos, number: normalized };
      if (team === "A") {
        this.applyDisplay(players, this.data.teamBPlayers, this.data.isSwapped);
      } else {
        this.applyDisplay(this.data.teamAPlayers, players, this.data.isSwapped);
      }
      displayUpdated = true;
    }

    const shifted = normalizeLiberoSlots(players);
    const shiftedChanged = shifted[6].number !== players[6].number || shifted[7].number !== players[7].number;
    if (shiftedChanged) {
      players = shifted;
      if (team === "A") {
        this.applyDisplay(players, this.data.teamBPlayers, this.data.isSwapped);
      } else {
        this.applyDisplay(this.data.teamAPlayers, players, this.data.isSwapped);
      }
      displayUpdated = true;
    }

    if (!displayUpdated) {
      if (team === "A") {
        this.syncCaptainPickState(players, this.data.teamBPlayers);
      } else {
        this.syncCaptainPickState(this.data.teamAPlayers, players);
      }
    }

    if (current && current !== "?") {
      const duplicateCount = players.filter((p) => normalizeNumberInput(p.number) === current).length;
      if (duplicateCount > 1) {
        showToastHint("球员号码重复");
      }
    }
    this.persistLineupDraftNow().catch(() => {});
    this.deferClearAdjustFocus(blurKey);
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    this.inputEditingReleaseTimer = setTimeout(() => {
      this.inputEditing = false;
      this.inputEditingReleaseTimer = 0;
    }, 120) as unknown as number;
  },

  openCaptainPicker(team: TeamCode) {
    const teamASide: TeamCode = this.data.isSwapped ? "B" : "A";
    const players = team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers;
    const teamName = (team === "A" ? this.data.teamAName : this.data.teamBName).trim() || (team === "A" ? "甲" : "乙");
    this.setData({
      showCaptainPicker: true,
      captainPickerTitle: teamName + "队场上队长",
      captainPickerTeam: team,
      captainPickerMainGrid: buildMainGridByOrder(players, getMainOrderForTeam(team, teamASide), team),
      captainPickerLibero: buildTeamRows(players, team).libero,
      captainPickerSelectedNo: "",
    });
  },

  onCaptainPickTap(e: WechatMiniprogram.TouchEvent) {
    const team = String((e.currentTarget.dataset as { team?: string }).team || "") as TeamCode;
    if (team !== "A" && team !== "B") {
      return;
    }
    const disabled = team === "A" ? this.data.teamACaptainPickDisabled : this.data.teamBCaptainPickDisabled;
    if (disabled) {
      return;
    }
    const players = team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers;
    const missingPos = getMissingMainPosition(players);
    if (missingPos) {
      const teamName = (team === "A" ? this.data.teamAName : this.data.teamBName).trim() || (team === "A" ? "甲" : "乙");
      showBlockHint(teamName + "队请先填满6个普通球员号码后再选择场上队长");
      return;
    }
    this.openCaptainPicker(team);
  },

  onCaptainRepickTap(e: WechatMiniprogram.TouchEvent) {
    const team = String((e.currentTarget.dataset as { team?: string }).team || "") as TeamCode;
    if (team !== "A" && team !== "B") {
      return;
    }
    const canRepick = team === "A" ? this.data.teamAShowCaptainRepick : this.data.teamBShowCaptainRepick;
    if (!canRepick) {
      return;
    }
    const players = team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers;
    const missingPos = getMissingMainPosition(players);
    if (missingPos) {
      const teamName = (team === "A" ? this.data.teamAName : this.data.teamBName).trim() || (team === "A" ? "甲" : "乙");
      showBlockHint(teamName + "队请先填满6个普通球员号码后再选择场上队长");
      return;
    }
    this.openCaptainPicker(team);
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
    this.setData({
      showCaptainPicker: false,
      captainPickerSelectedNo: "",
      captainPickerMainGrid: [],
      captainPickerLibero: [],
    });
  },

  onCaptainPickerConfirm() {
    const value = normalizeNumberInput(this.data.captainPickerSelectedNo);
    if (!value) {
      showToastHint("请先选择队长号码");
      return;
    }
    const team = this.data.captainPickerTeam;
    const nextPatch =
      team === "A"
        ? { teamACaptainNo: value, teamAManualCaptainChosen: true }
        : { teamBCaptainNo: value, teamBManualCaptainChosen: true };
    this.setData(
      {
        ...nextPatch,
        showCaptainPicker: false,
        captainPickerSelectedNo: "",
        captainPickerMainGrid: [],
        captainPickerLibero: [],
      },
      () => {
        this.syncCaptainPickState();
        this.schedulePersistLineupDraft();
      }
    );
  },

  prepareContinueValidationUI() {
    if (this.data.activeAdjustInputKey) {
      this.setData({ activeAdjustInputKey: "" });
    }
    wx.hideKeyboard({
      fail: () => {},
    });
  },

  dismissKeyboardForContinue(): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        resolve();
      };
      if (this.data.activeAdjustInputKey) {
        this.setData({ activeAdjustInputKey: "" });
      }
      this.inputEditing = false;
      wx.hideKeyboard({
        complete: () => {
          setTimeout(finish, 90);
        },
      });
      setTimeout(finish, 220);
    });
  },

  async onContinueTap() {
    if (this.continueInFlight) {
      return;
    }
    this.prepareContinueValidationUI();
    await this.dismissKeyboardForContinue();
    const teamAName = (this.data.teamAName || "").trim() || "甲";
    const teamBName = (this.data.teamBName || "").trim() || "乙";
    const errA = validateTeamPlayers(this.data.teamAPlayers, teamAName);
    if (errA) {
      setTimeout(() => {
        showBlockHint(errA);
      }, 40);
      return;
    }
    const errB = validateTeamPlayers(this.data.teamBPlayers, teamBName);
    if (errB) {
      setTimeout(() => {
        showBlockHint(errB);
      }, 40);
      return;
    }

    if (!this.data.teamACaptainResolved || !this.data.teamBCaptainResolved) {
      setTimeout(() => {
        wx.showModal({
          title: "无法继续",
          content: "请先为两队确定下一局场上队长后再继续。",
          showCancel: false,
          confirmText: "知道了",
        });
      }, 40);
      return;
    }
    this.continueInFlight = true;
    this.leavingPage = true;
    this.stopRoomWatch();
    this.clearDraftSaveTimer();
    this.setData({ continueBtnFx: true });
    const roomId = String(this.data.roomId || "");
    try {
      if (roomId) {
        await updateRoomAsync(roomId, (room) => {
        room.teamA.players = this.data.teamAPlayers.slice();
        room.teamB.players = this.data.teamBPlayers.slice();
        (room.match as any).teamACurrentCaptainNo = this.data.teamACaptainNo;
        (room.match as any).teamBCurrentCaptainNo = this.data.teamBCaptainNo;
        // 返回比赛页后保持“未开始比赛”状态：本局计时等待用户在比赛页点“开始比赛”再启动。
        if (
          room.match &&
          !room.match.isFinished &&
          Number(room.match.aScore || 0) === 0 &&
          Number(room.match.bScore || 0) === 0
        ) {
          (room.match as any).setTimerStartAt = 0;
          (room.match as any).setTimerElapsedMs = 0;
          // 新一局正式开始时再清零暂停次数，确保局末弹窗撤回不会丢失本局暂停计数。
          (room.match as any).teamATimeoutCount = 0;
          (room.match as any).teamBTimeoutCount = 0;
          (room.match as any).timeoutActive = false;
          (room.match as any).timeoutTeam = "";
          (room.match as any).timeoutEndAt = 0;
        }
        room.match.isSwapped = this.data.isSwapped;
        room.match.servingTeam = this.data.servingTeam;
        (room.match as any).lineupAdjustLastCommitted = {
          setNo: Math.max(1, Number(room.match.setNo || 1)),
          isSwapped: this.data.isSwapped,
          servingTeam: this.data.servingTeam === "B" ? "B" : "A",
          teamAPlayers: clonePlayers(this.data.teamAPlayers),
          teamBPlayers: clonePlayers(this.data.teamBPlayers),
          teamACaptainNo: String(this.data.teamACaptainNo || ""),
          teamBCaptainNo: String(this.data.teamBCaptainNo || ""),
          teamAManualCaptainChosen: !!this.data.teamAManualCaptainChosen,
          teamBManualCaptainChosen: !!this.data.teamBManualCaptainChosen,
          savedAt: Date.now(),
        };
        delete (room.match as any).setEndState;
        delete (room.match as any).lineupAdjustDraft;
        return room;
        });
      }
      setTimeout(() => {
      this.setData({ continueBtnFx: false });
      if (roomId) {
        wx.redirectTo({ url: "/pages/match/match?roomId=" + roomId });
        return;
      }
      wx.reLaunch({ url: "/pages/home/home" });
    }, 150);
    } catch (_e) {
      this.continueInFlight = false;
      this.leavingPage = false;
      showBlockHint("系统繁忙，请重试");
      this.setData({ continueBtnFx: false });
      this.startRoomWatch();
    }
  },

  onBackTap() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: "/pages/home/home" });
  },

  onBackPress() {
    return true;
  },

  async onTakeoverTap() {
    if (this.data.hasOperationAuthority || this.takeoverInFlight) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    const clientId = String(this.clientId || ensureClientId());
    if (!roomId || !clientId) {
      showToastHint("接管失败，请稍后重试");
      return;
    }
    this.takeoverInFlight = true;
    try {
      const next = await transferRoomOperatorAsync(roomId, clientId, clientId);
      if (!next || getRoomOperatorClientId(next) !== clientId) {
        showToastHint("接管失败，请稍后重试");
        return;
      }
      await this.loadRoom();
    } catch (_e) {
      showToastHint("接管失败，请稍后重试");
    } finally {
      this.takeoverInFlight = false;
    }
  },

  onRotateTeam(e: WechatMiniprogram.TouchEvent) {
    const team = String((e.currentTarget.dataset as { team?: string }).team || "") as TeamCode;
    if (team !== "A" && team !== "B") {
      return;
    }
    void this.enqueueRotateAction(team, async () => {
      const beforeRects = await this.measureTeamMainPosRects(team);
      const beforeNoMap = this.getTeamMainNumberMap(team);
      if (team === "A") {
        const rotated = rotateTeamByRule(this.data.teamAPlayers);
        this.applyDisplay(rotated, this.data.teamBPlayers, this.data.isSwapped);
        this.schedulePersistLineupDraft();
        await this.playTeamRotateMotion("A", beforeRects, beforeNoMap, this.data.teamACaptainNo);
      } else {
        const rotated = rotateTeamByRule(this.data.teamBPlayers);
        this.applyDisplay(this.data.teamAPlayers, rotated, this.data.isSwapped);
        this.schedulePersistLineupDraft();
        await this.playTeamRotateMotion("B", beforeRects, beforeNoMap, this.data.teamBCaptainNo);
      }
    });
  },

  onToggleServeTeam(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.isDecidingSet) {
      return;
    }
    const team = String((e.currentTarget.dataset as { team?: string }).team || "") as TeamCode;
    if (team !== "A" && team !== "B") {
      return;
    }
    const nextServing: TeamCode = this.data.servingTeam === "A" ? "B" : "A";
    this.setData({ servingTeam: nextServing });
    this.schedulePersistLineupDraft();
  },

  onToggleCourtSide() {
    this.sideSwitchPendingCount += 1;
    void this.enqueueSideSwitchAction(async () => {
      this.sideSwitchInFlight = true;
      try {
        this.setData({ switchingOut: true, switchingIn: false });
        await this.delayAsync(120);
        this.applyDisplay(this.data.teamAPlayers, this.data.teamBPlayers, !this.data.isSwapped);
        this.setData({ switchingOut: false, switchingIn: true });
        await this.persistLineupDraftNow();
        await this.delayAsync(220);
        this.setData({ switchingIn: false });
      } finally {
        this.sideSwitchInFlight = false;
        this.sideSwitchPendingCount = Math.max(0, this.sideSwitchPendingCount - 1);
        if (this.sideSwitchPendingCount === 0 && !this.inputEditing) {
          this.loadRoom();
        }
      }
    });
  },

  nextTickAsync() {
    return new Promise<void>((resolve) => {
      wx.nextTick(() => resolve());
    });
  },

  delayAsync(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(() => resolve(), ms);
    });
  },

  countRectMap(rects: TeamRectMap) {
    return MAIN_POSITIONS.reduce((acc, pos) => {
      return acc + (rects[pos] ? 1 : 0);
    }, 0);
  },

  measureTeamMainPosRects(team: TeamCode) {
    return new Promise<TeamRectMap>((resolve) => {
      const base = team === "A" ? ".team-panel.team-a" : ".team-panel.team-b";
      const query = wx.createSelectorQuery().in(this);
      MAIN_POSITIONS.forEach((pos) => {
        query.select(base + " .player-card.pos-card-" + pos).boundingClientRect();
      });
      query.exec((res) => {
        const list = Array.isArray(res) ? res : [];
        const rects: TeamRectMap = {};
        MAIN_POSITIONS.forEach((pos, idx) => {
          const rect = list[idx] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
          if (
            rect &&
            typeof rect.left === "number" &&
            typeof rect.top === "number" &&
            typeof rect.width === "number" &&
            typeof rect.height === "number"
          ) {
            rects[pos] = {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            };
          }
        });
        resolve(rects);
      });
    });
  },

  async measureTeamMainPosRectsStable(team: TeamCode, timeoutMs = 1000) {
    const start = Date.now();
    let best: TeamRectMap = {};
    while (Date.now() - start < timeoutMs) {
      await this.nextTickAsync();
      const rects = await this.measureTeamMainPosRects(team);
      if (this.countRectMap(rects) >= this.countRectMap(best)) {
        best = rects;
      }
      if (this.countRectMap(best) === 6) {
        return best;
      }
      await this.delayAsync(20);
    }
    return best;
  },

  getTeamMainNumberMap(team: TeamCode): TeamMainNoMap {
    const players = team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers;
    return buildMainMap(players || []);
  },

  async playTeamRotateMotion(team: TeamCode, beforeRects: TeamRectMap, beforeNoMap: TeamMainNoMap, captainNo: string) {
    if (!beforeRects || MAIN_POSITIONS.every((pos) => !beforeRects[pos])) {
      return;
    }
    await this.nextTickAsync();
    await this.delayAsync(10);
    const afterRects = await this.measureTeamMainPosRectsStable(team, 1000);
    const afterNoMap = this.getTeamMainNumberMap(team);
    const startItems: RotateFlyItem[] = [];
    const endItems: RotateFlyItem[] = [];
    MAIN_POSITIONS.forEach((sourcePos) => {
      const number = beforeNoMap[sourcePos] || "?";
      const targetPos = MAIN_POSITIONS.find((pos) => (afterNoMap[pos] || "?") === number);
      if (!targetPos) {
        return;
      }
      const fromRect = beforeRects[sourcePos];
      const toRect = afterRects[targetPos];
      if (!fromRect || !toRect) {
        return;
      }
      const dx = toRect.left - fromRect.left;
      const dy = toRect.top - fromRect.top;
      const id = team + "-" + sourcePos + "-" + targetPos + "-" + String(Date.now());
      const baseStyle =
        "left:" +
        String(fromRect.left) +
        "px;top:" +
        String(fromRect.top) +
        "px;width:" +
        String(fromRect.width) +
        "px;height:" +
        String(fromRect.height) +
        "px;";
      const isCaptain = normalizeNumberInput(number) !== "" && normalizeNumberInput(number) === normalizeNumberInput(captainNo);
      startItems.push({
        id,
        team,
        number,
        isCaptain,
        style: baseStyle + "transform:translate(0,0);transition:none;",
      });
      endItems.push({
        id,
        team,
        number,
        isCaptain,
        style:
          baseStyle +
          "transform:translate(" +
          String(dx) +
          "px," +
          String(dy) +
          "px);transition:transform 320ms cubic-bezier(0.22, 0.7, 0.2, 1);",
      });
    });
    if (!startItems.length) {
      return;
    }
    if (team === "A") {
      this.setData({ hideTeamAMainNumbers: true, rotateFlyItemsA: startItems });
    } else {
      this.setData({ hideTeamBMainNumbers: true, rotateFlyItemsB: startItems });
    }
    await this.nextTickAsync();
    if (team === "A") {
      this.setData({ rotateFlyItemsA: endItems });
    } else {
      this.setData({ rotateFlyItemsB: endItems });
    }
    await this.delayAsync(340);
    if (team === "A") {
      this.setData({ hideTeamAMainNumbers: false, rotateFlyItemsA: [] });
    } else {
      this.setData({ hideTeamBMainNumbers: false, rotateFlyItemsB: [] });
    }
  },

  syncSafePadding() {
    const safePad = computeLandscapeSafePad(wx);
    if (!safePad.safeAreaAvailable) {
      this.setData({
        safePadTop: safePad.safePadTop,
        safePadRight: safePad.safePadRight,
        safePadBottom: safePad.safePadBottom,
        safePadLeft: safePad.safePadLeft,
      });
      return;
    }
    this.setData({
      safePadTop: safePad.safePadTop,
      safePadRight: safePad.safePadRight,
      safePadBottom: safePad.safePadBottom,
      safePadLeft: safePad.safePadLeft,
    });
  },
});
