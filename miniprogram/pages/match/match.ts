import {
  getRoom,
  updateRoom,
  heartbeatRoom,
  getParticipantCount,
  leaveRoom,
  TEAM_COLOR_OPTIONS,
} from "../../utils/room-service";
import { showBlockHint, showToastHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";
import { getMainOrderForTeam, type MainPosition, type TeamCode } from "../../utils/lineup-order";

type Position = "I" | "II" | "III" | "IV" | "V" | "VI" | "L1" | "L2";
type PlayerSlot = { pos: Position; number: string };
type MatchLogItem = {
  id: string;
  ts: number;
  action: string;
  team: TeamCode | "";
  note: string;
};
type DisplayLogItem = MatchLogItem & { timeText: string };
type TeamRows = {
  libero: PlayerSlot[];
  main: PlayerSlot[];
};
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

function buildTeamRows(players: PlayerSlot[]): TeamRows {
  const byPos: Record<string, PlayerSlot> = {};
  players.forEach(function (p) {
    byPos[p.pos] = p;
  });
  return {
    libero: [byPos.L1, byPos.L2].filter(Boolean) as PlayerSlot[],
    main: [byPos.I, byPos.II, byPos.III, byPos.IV, byPos.V, byPos.VI].filter(Boolean) as PlayerSlot[],
  };
}

function buildMainGridByOrder(players: PlayerSlot[], order: MainPosition[]): PlayerSlot[][] {
  const byPos: Record<string, PlayerSlot> = {};
  players.forEach(function (p) {
    byPos[p.pos] = p;
  });
  const ordered = order.map(function (pos) {
    return byPos[pos] || { pos: pos, number: "?" };
  });
  return [ordered.slice(0, 2), ordered.slice(2, 4), ordered.slice(4, 6)];
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

function rotateTeamAndLog(room: any, team: TeamCode, noteSuffix: string): void {
  if (team === "A") {
    room.teamA.players = rotateTeamByRule(room.teamA.players);
    appendMatchLog(room, "rotate", room.teamA.name + " " + noteSuffix, "A");
    return;
  }
  room.teamB.players = rotateTeamByRule(room.teamB.players);
  appendMatchLog(room, "rotate", room.teamB.name + " " + noteSuffix, "B");
}

function getSetTargetScore(room: any): number {
  if ((room.settings.wins || 1) <= 1) {
    return Number(room.settings.maxScore) || 15;
  }
  const decidingSet =
    room.match.aSetWins === room.settings.wins - 1 &&
    room.match.bSetWins === room.settings.wins - 1;
  return decidingSet ? 15 : 25;
}

function shouldPromptSwitchAtEight(room: any): boolean {
  if ((room.settings.wins || 1) <= 1) {
    return false;
  }
  const decidingSet =
    room.match.aSetWins === room.settings.wins - 1 &&
    room.match.bSetWins === room.settings.wins - 1;
  if (!decidingSet) {
    return false;
  }
  if (room.match.isSwapped) {
    return false;
  }
  if (room.match.decidingSetEightHandled) {
    return false;
  }
  return Math.max(room.match.aScore, room.match.bScore) === 8;
}

function createLogId(): string {
  return String(Date.now()) + "-" + String(Math.floor(Math.random() * 100000));
}

function pad2(n: number): string {
  return n < 10 ? "0" + String(n) : String(n);
}

function formatLogTime(ts: number): string {
  const d = new Date(ts);
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function appendMatchLog(room: any, action: string, note: string, team?: TeamCode): void {
  if (!room.match.logs) {
    room.match.logs = [];
  }
  room.match.logs.push({
    id: createLogId(),
    ts: Date.now(),
    action: action,
    team: team || "",
    note: note,
  });
  if (room.match.logs.length > 300) {
    room.match.logs.shift();
  }
}

function pushUndoSnapshot(room: any): void {
  room.match.undoStack.push({
    aScore: room.match.aScore,
    bScore: room.match.bScore,
    lastScoringTeam: room.match.lastScoringTeam || "",
    servingTeam: room.match.servingTeam,
    teamAPlayers: room.teamA.players.slice(),
    teamBPlayers: room.teamB.players.slice(),
    isSwapped: !!room.match.isSwapped,
    decidingSetEightHandled: !!room.match.decidingSetEightHandled,
    setNo: room.match.setNo,
    aSetWins: room.match.aSetWins,
    bSetWins: room.match.bSetWins,
    isFinished: room.match.isFinished,
  });
  if (room.match.undoStack.length > 100) {
    room.match.undoStack.shift();
  }
}

function samePlayers(a: PlayerSlot[], b: PlayerSlot[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].pos !== b[i].pos || a[i].number !== b[i].number) {
      return false;
    }
  }
  return true;
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

function rotateMainMapOnce(map: TeamMainNoMap): TeamMainNoMap {
  const next: TeamMainNoMap = {};
  MAIN_POSITIONS.forEach((pos) => {
    const sourcePos = NUMBER_SOURCE_MAP[pos] as MainPosition;
    next[pos] = map[sourcePos] || "?";
  });
  return next;
}

function sameMainMap(a: TeamMainNoMap, b: TeamMainNoMap): boolean {
  return MAIN_POSITIONS.every((pos) => (a[pos] || "?") === (b[pos] || "?"));
}

function isOneStepRotationBetween(beforePlayers: PlayerSlot[], afterPlayers: PlayerSlot[]): boolean {
  const before = buildMainMap(beforePlayers || []);
  const after = buildMainMap(afterPlayers || []);
  return sameMainMap(after, rotateMainMapOnce(before)) || sameMainMap(before, rotateMainMapOnce(after));
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

function normalizeNumberInput(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 2);
}

function formatDurationMMSS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const mmText = mm < 10 ? "0" + String(mm) : String(mm);
  const ssText = ss < 10 ? "0" + String(ss) : String(ss);
  return mmText + ":" + ssText;
}

Page({
  data: {
    roomId: "",
    participantCount: 0,
    teamAName: "甲",
    teamBName: "乙",
    teamAColor: TEAM_COLOR_OPTIONS[0].value,
    teamBColor: TEAM_COLOR_OPTIONS[1].value,
    roomPassword: "",
    teamACaptainNo: "",
    teamBCaptainNo: "",
    teamARGB: "138, 135, 208",
    teamBRGB: "129, 199, 158",
    aScore: 0,
    bScore: 0,
    lastScoringTeam: "" as TeamCode | "",
    setTimerText: "00:00",
    servingTeam: "A" as TeamCode,
    setNo: 1,
    aSetWins: 0,
    bSetWins: 0,
    setNoText: "第1局",
    setWinsText: "0 : 0",
    isMatchFinished: false,
    isSwapped: false,
    showLogPanel: false,
    logs: [] as DisplayLogItem[],
    hideTeamAMainNumbers: false,
    hideTeamBMainNumbers: false,
    rotateFlyItems: [] as RotateFlyItem[],
    switchingOut: false,
    switchingIn: false,
    teamAPlayers: [] as PlayerSlot[],
    teamBPlayers: [] as PlayerSlot[],
    teamALibero: [] as PlayerSlot[],
    teamAMainGrid: [] as PlayerSlot[][],
    teamBLibero: [] as PlayerSlot[],
    teamBMainGrid: [] as PlayerSlot[][],
    safePadTop: "0px",
    safePadRight: "0px",
    safePadBottom: "0px",
    safePadLeft: "0px",
    safeDebugText: "",
    updatedAt: 0,
    backConfirming: false,
    showBackExitModal: false,
    showSetEndModal: false,
    setEndTitleTop: "",
    setEndTitleBottom: "",
    setEndTeamAName: "",
    setEndTeamBName: "",
    setEndSmallScoreA: 0,
    setEndSmallScoreB: 0,
    setEndBigScoreA: 0,
    setEndBigScoreB: 0,
    setEndWinnerName: "",
    setEndDurationText: "00:00",
    setEndMatchFinished: false,
    setEndActionText: "继续",
  },

  pollTimer: 0 as number,
  timerTick: 0 as number,
  timerStartAtMs: 0 as number,
  timerElapsedBaseMs: 0 as number,
  lastRenderedTimerText: "00:00",
  themeOff: null as null | (() => void),

  onLoad(query: Record<string, string>) {
    this.applyNavigationTheme();
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
      });
    }
    const roomId = query.roomId || "";
    if (!roomId) {
      showBlockHint("缺少房间号");
      return;
    }
    wx.setNavigationBarTitle({
      title: "裁判团队编号 " + roomId,
    });
    this.setData({ roomId: roomId });
    this.syncSafePadding();
    if ((wx as any).onWindowResize) {
      (wx as any).onWindowResize(this.onWindowResize);
    }
    this.loadRoom(roomId, true);
  },

  onShow() {
    this.applyNavigationTheme();
    this.startTimerTick();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
    this.stopTimerTick();
  },

  onUnload() {
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
    this.stopPolling();
    this.stopTimerTick();
    if ((wx as any).offWindowResize) {
      (wx as any).offWindowResize(this.onWindowResize);
    }
    const roomId = this.data.roomId;
    const clientId = getApp<IAppOption>().globalData.clientId;
    leaveRoom(roomId, clientId);
  },

  confirmBackToHome() {
    if (this.data.backConfirming || this.data.showBackExitModal) {
      return;
    }
    this.setData({ showBackExitModal: true });
  },

  onBackPress() {
    this.confirmBackToHome();
    return true;
  },

  onBackExitModalTap() {},

  onBackExitCancel() {
    this.setData({ showBackExitModal: false });
  },

  onBackExitDirect() {
    this.setData({ showBackExitModal: false, backConfirming: true });
    wx.reLaunch({ url: "/pages/create-room/create-room" });
    setTimeout(() => {
      this.setData({ backConfirming: false });
    }, 200);
  },

  onBackExitCopyAndLeave() {
    this.setData({ showBackExitModal: false, backConfirming: true });
    const inviteText =
      "[排球裁判小助手] 裁判团队编号 " +
      this.data.roomId +
      "，密码 " +
      this.data.roomPassword +
      "，打开小程序粘贴即可加入房间，请确认邀请人已完成比赛设置并进入比赛页面后再加入";
    if (!/^\d{6}$/.test(this.data.roomId) || !/^\d{6}$/.test(this.data.roomPassword)) {
      wx.reLaunch({ url: "/pages/create-room/create-room" });
      setTimeout(() => {
        this.setData({ backConfirming: false });
      }, 200);
      return;
    }
    wx.setClipboardData({
      data: inviteText,
      complete: () => {
        wx.reLaunch({ url: "/pages/create-room/create-room" });
        setTimeout(() => {
          this.setData({ backConfirming: false });
        }, 200);
      },
    });
  },

  onSetEndModalTap() {},

  onSetEndContinue() {
    this.setData({ showSetEndModal: false });
    if (this.data.setEndMatchFinished) {
      wx.reLaunch({ url: "/pages/create-room/create-room" });
      return;
    }
    wx.navigateTo({ url: "/pages/lineup-adjust/lineup-adjust?roomId=" + this.data.roomId });
  },

  onWindowResize() {
    this.syncSafePadding();
  },

  applyNavigationTheme() {
    applyNavigationBarTheme();
  },

  handleRoomClosed() {
    wx.showModal({
      title: "房间已关闭",
      content: "该裁判团队已超时关闭或不存在，请重新创建或加入有效团队。",
      showCancel: false,
      confirmText: "返回首页",
      success: () => {
        wx.reLaunch({ url: "/pages/create-room/create-room" });
      },
    });
  },

  syncSafePadding() {
    const info: any = (wx as any).getWindowInfo ? (wx as any).getWindowInfo() : wx.getSystemInfoSync();
    const safe = info && info.safeArea;
    const windowWidth = Number(info && info.windowWidth) || Number(info && info.screenWidth) || 0;
    const windowHeight = Number(info && info.windowHeight) || Number(info && info.screenHeight) || 0;
    if (!safe || !windowWidth || !windowHeight) {
      this.setData({
        safePadTop: "10px",
        safePadRight: "0px",
        safePadBottom: "25px",
        safePadLeft: "0px",
        safeDebugText: "safeArea unavailable",
      });
      return;
    }
    const insetTop = Math.max(0, Number(safe.top) || 0);
    const insetLeft = Math.max(0, Number(safe.left) || 0);
    const insetRight = Math.max(0, windowWidth - (Number(safe.right) || windowWidth));
    const insetBottom = Math.max(0, windowHeight - (Number(safe.bottom) || windowHeight));
    // 比赛页统一策略：左右用安全边距，顶部/底部使用固定值便于稳定布局。
    // 部分机型会把危险区上报到 top，这里也映射到左右，避免“左右贴边+顶部空白”。
    const sideInset = Math.max(insetLeft, insetRight, insetTop, insetBottom);
    this.setData({
      safePadTop: "10px",
      safePadRight: String(sideInset) + "px",
      safePadBottom: "25px",
      safePadLeft: String(sideInset) + "px",
      safeDebugText:
        "side-only | ww:" +
        String(windowWidth) +
        " wh:" +
        String(windowHeight) +
        " | safe t/l/r/b:" +
        [safe.top, safe.left, safe.right, safe.bottom].join("/") +
        " | inset t/l/r/b:" +
        [insetTop, insetLeft, insetRight, insetBottom].join("/") +
        " | pad t/r/b/l:" +
        [10, sideInset, 25, sideInset].join("/"),
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
    }, 800) as unknown as number;
  },

  stopPolling() {
    if (!this.pollTimer) {
      return;
    }
    clearInterval(this.pollTimer);
    this.pollTimer = 0;
  },

  startTimerTick() {
    this.stopTimerTick();
    this.timerTick = setInterval(() => {
      this.refreshTimerText();
    }, 250) as unknown as number;
  },

  stopTimerTick() {
    if (!this.timerTick) {
      return;
    }
    clearInterval(this.timerTick);
    this.timerTick = 0;
  },

  refreshTimerText() {
    const startAt = this.timerStartAtMs || 0;
    const base = this.timerElapsedBaseMs || 0;
    const live = startAt > 0 ? base + (Date.now() - startAt) : base;
    const nextText = formatDurationMMSS(live);
    if (nextText === this.lastRenderedTimerText) {
      return;
    }
    this.lastRenderedTimerText = nextText;
    this.setData({ setTimerText: nextText });
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

  countRectMap(rects: TeamRectMap): number {
    let count = 0;
    MAIN_POSITIONS.forEach((pos) => {
      if (rects[pos]) {
        count += 1;
      }
    });
    return count;
  },

  measureTeamMainPosRects(team: TeamCode) {
    return new Promise<TeamRectMap>((resolve) => {
      const rects: TeamRectMap = {};
      const base = team === "A" ? ".team-a" : ".team-b";
      const query = wx.createSelectorQuery().in(this);
      MAIN_POSITIONS.forEach((pos) => {
        query.select(base + " .num.pos-" + pos).boundingClientRect();
      });
      query.exec((res) => {
        const list = Array.isArray(res) ? res : [];
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
      if (this.countRectMap(best) === MAIN_POSITIONS.length) {
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
    let afterRects = await this.measureTeamMainPosRectsStable(team, 1000);
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
      startItems.push({
        id,
        team,
        number,
        isCaptain: normalizeNumberInput(number) !== "" && normalizeNumberInput(number) === normalizeNumberInput(captainNo),
        style: baseStyle + "transform:translate(0,0);transition:none;",
      });
      endItems.push({
        id,
        team,
        number,
        isCaptain: normalizeNumberInput(number) !== "" && normalizeNumberInput(number) === normalizeNumberInput(captainNo),
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
      MAIN_POSITIONS.forEach((targetPos) => {
        const sourcePos = NUMBER_SOURCE_MAP[targetPos] as MainPosition;
        const number = beforeNoMap[sourcePos] || "?";
        const fromRect = beforeRects[sourcePos];
        const toRect = afterRects[targetPos];
        if (!fromRect || !toRect) {
          return;
        }
        const dx = toRect.left - fromRect.left;
        const dy = toRect.top - fromRect.top;
        const id = team + "-fallback-" + sourcePos + "-" + targetPos + "-" + String(Date.now());
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
    }
    if (!startItems.length) {
      await this.nextTickAsync();
      await this.delayAsync(24);
      afterRects = await this.measureTeamMainPosRectsStable(team, 220);
      MAIN_POSITIONS.forEach((targetPos) => {
        const sourcePos = NUMBER_SOURCE_MAP[targetPos] as MainPosition;
        const number = beforeNoMap[sourcePos] || "?";
        const fromRect = beforeRects[sourcePos];
        const toRect = afterRects[targetPos];
        if (!fromRect || !toRect) {
          return;
        }
        const dx = toRect.left - fromRect.left;
        const dy = toRect.top - fromRect.top;
        const id = team + "-retry-" + sourcePos + "-" + targetPos + "-" + String(Date.now());
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
    }
    if (!startItems.length) {
      return;
    }
    if (team === "A") {
      this.setData({ hideTeamAMainNumbers: true, rotateFlyItems: startItems });
    } else {
      this.setData({ hideTeamBMainNumbers: true, rotateFlyItems: startItems });
    }
    await this.nextTickAsync();
    this.setData({ rotateFlyItems: endItems });
    setTimeout(() => {
      if (team === "A") {
        this.setData({ hideTeamAMainNumbers: false, rotateFlyItems: [] });
      } else {
        this.setData({ hideTeamBMainNumbers: false, rotateFlyItems: [] });
      }
    }, 340);
  },

  loadRoom(roomId: string, force: boolean) {
    const clientId = getApp<IAppOption>().globalData.clientId;
    heartbeatRoom(roomId, clientId);
    const room = getRoom(roomId);
    if (!room) {
      if (force) {
        this.handleRoomClosed();
      }
      return;
    }
    if (room.status === "setup") {
      wx.redirectTo({ url: "/pages/room/room?roomId=" + roomId });
      return;
    }
    if (!force && room.updatedAt === this.data.updatedAt) {
      return;
    }

    const nextSwapped = !!room.match.isSwapped;
    const teamASide: TeamCode = nextSwapped ? "B" : "A";
    const aRows = buildTeamRows(room.teamA.players);
    const bRows = buildTeamRows(room.teamB.players);
    const aMainGrid = buildMainGridByOrder(room.teamA.players, getMainOrderForTeam("A", teamASide));
    const bMainGrid = buildMainGridByOrder(room.teamB.players, getMainOrderForTeam("B", teamASide));
    const teamAColor = room.teamA.color || TEAM_COLOR_OPTIONS[0].value;
    const teamBColor = room.teamB.color || TEAM_COLOR_OPTIONS[1].value;
    const leftTeam: TeamCode = nextSwapped ? "B" : "A";
    const rightTeam: TeamCode = leftTeam === "A" ? "B" : "A";
    const leftScore = leftTeam === "A" ? room.match.aScore : room.match.bScore;
    const rightScore = rightTeam === "A" ? room.match.aScore : room.match.bScore;
    const leftSetWins = nextSwapped ? room.match.bSetWins : room.match.aSetWins;
    const rightSetWins = nextSwapped ? room.match.aSetWins : room.match.bSetWins;
    const displayLastScoringTeam: TeamCode | "" =
      room.match.lastScoringTeam === leftTeam
        ? "A"
        : room.match.lastScoringTeam === rightTeam
          ? "B"
          : "";
    const setNoText = room.match.isFinished ? "已结束" : "第" + String(room.match.setNo || 1) + "局";
    const setWinsText = String(leftSetWins || 0) + " : " + String(rightSetWins || 0);
    const timerStartAt = Number((room.match as any).setTimerStartAt) || 0;
    const timerElapsedMs = Number((room.match as any).setTimerElapsedMs) || 0;
    this.timerStartAtMs = timerStartAt;
    this.timerElapsedBaseMs = timerElapsedMs;
    const liveTimerMs = timerStartAt > 0 ? timerElapsedMs + (Date.now() - timerStartAt) : timerElapsedMs;
    const timerText = formatDurationMMSS(liveTimerMs);
    this.lastRenderedTimerText = timerText;
    wx.setNavigationBarTitle({
      title: "裁判团队编号 " + roomId,
    });
    this.setData({
      participantCount: getParticipantCount(roomId),
      teamAName: room.teamA.name,
      teamBName: room.teamB.name,
      teamAColor: teamAColor,
      teamBColor: teamBColor,
      roomPassword: String(room.password || ""),
      teamACaptainNo: normalizeNumberInput(String((room.teamA as any).captainNo || "")),
      teamBCaptainNo: normalizeNumberInput(String((room.teamB as any).captainNo || "")),
      teamARGB: hexToRgbTriplet(teamAColor),
      teamBRGB: hexToRgbTriplet(teamBColor),
      aScore: leftScore,
      bScore: rightScore,
      lastScoringTeam: displayLastScoringTeam,
      setTimerText: timerText,
      servingTeam: room.match.servingTeam,
      setNo: room.match.setNo || 1,
      aSetWins: room.match.aSetWins || 0,
      bSetWins: room.match.bSetWins || 0,
      setNoText: setNoText,
      setWinsText: setWinsText,
      isMatchFinished: !!room.match.isFinished,
      isSwapped: nextSwapped,
      teamAPlayers: room.teamA.players,
      teamBPlayers: room.teamB.players,
      teamALibero: aRows.libero,
      teamAMainGrid: aMainGrid,
      teamBLibero: bRows.libero,
      teamBMainGrid: bMainGrid,
      logs: (room.match.logs || [])
        .slice()
        .reverse()
        .map(function (item: MatchLogItem) {
          return {
            id: item.id,
            ts: item.ts,
            action: item.action,
            team: item.team || "",
            note: item.note,
            timeText: formatLogTime(item.ts),
          };
        }),
      updatedAt: room.updatedAt,
    });
  },

  async onScoreChange(e: WechatMiniprogram.CustomEvent) {
    const detail = e.detail as { team?: TeamCode; type?: "add" | "sub" };
    const displayTeam = detail.team;
    const team =
      displayTeam === "A" || displayTeam === "B"
        ? this.data.isSwapped
          ? (displayTeam === "A" ? "B" : "A")
          : displayTeam
        : undefined;
    const type = detail.type || "add";
    if (team !== "A" && team !== "B") {
      return;
    }
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，请重置或重新配置");
      return;
    }
    const roomId = this.data.roomId;
    let setEndSummary: null | {
      setNo: number;
      teamAName: string;
      teamBName: string;
      smallScoreA: number;
      smallScoreB: number;
      bigScoreA: number;
      bigScoreB: number;
      winnerName: string;
      durationText: string;
      matchFinished: boolean;
    } = null;
    let rotatedTeam: TeamCode | "" = "";
    let needDecidingSetSwitchChoice = false;
    const beforeRotateRects =
      type === "add" && this.data.servingTeam !== team ? await this.measureTeamMainPosRectsStable(team, 1000) : null;
    const beforeRotateNoMap = beforeRotateRects ? this.getTeamMainNumberMap(team) : null;
    const beforeRotateCaptain = beforeRotateRects ? (team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo) : "";

    const next = updateRoom(roomId, (room) => {
      if (room.match.isFinished) {
        return room;
      }
      if (type === "add") {
        pushUndoSnapshot(room);
        if (room.match.aScore === 0 && room.match.bScore === 0 && !room.match.setTimerStartAt) {
          room.match.setTimerStartAt = Date.now();
          room.match.setTimerElapsedMs = 0;
        }

        if (team === "A") {
          room.match.aScore += 1;
        } else {
          room.match.bScore += 1;
        }
        room.match.lastScoringTeam = team;
        appendMatchLog(
          room,
          "score_add",
          (team === "A" ? room.teamA.name : room.teamB.name) +
            " +1（" +
            String(room.match.aScore) +
            ":" +
            String(room.match.bScore) +
            "）",
          team
        );

        if (room.match.servingTeam !== team) {
          rotateTeamAndLog(room, team, "轮转");
          rotatedTeam = team;
          room.match.servingTeam = team;
        }

        if (shouldPromptSwitchAtEight(room)) {
          room.match.decidingSetEightHandled = true;
          needDecidingSetSwitchChoice = true;
          appendMatchLog(room, "switch_sides_prompt", "决胜局8分，请选择是否换边");
        }

        const target = getSetTargetScore(room);
        const diff = room.match.aScore - room.match.bScore;
        let setWinner: TeamCode | "" = "";
        if (room.match.aScore >= target && diff >= 2) {
          setWinner = "A";
        } else if (room.match.bScore >= target && diff <= -2) {
          setWinner = "B";
        }

        if (setWinner) {
          const endedSetNo = Number(room.match.setNo || 1);
          const endedScoreA = Number(room.match.aScore || 0);
          const endedScoreB = Number(room.match.bScore || 0);
          const startedAt = Number(room.match.setTimerStartAt) || 0;
          const baseElapsed = Number(room.match.setTimerElapsedMs) || 0;
          const finalElapsed = startedAt > 0 ? baseElapsed + (Date.now() - startedAt) : baseElapsed;
          room.match.setTimerElapsedMs = finalElapsed;
          room.match.setTimerStartAt = 0;
          const setElapsedText = formatDurationMMSS(finalElapsed);
          if (setWinner === "A") {
            room.match.aSetWins += 1;
          } else {
            room.match.bSetWins += 1;
          }
          appendMatchLog(
            room,
            "set_end",
            "第" +
              String(endedSetNo) +
              "局结束：" +
              (setWinner === "A" ? room.teamA.name : room.teamB.name) +
              " 胜（" +
              String(endedScoreA) +
              ":" +
              String(endedScoreB) +
              "）",
            setWinner
          );

          const reachedWins =
            setWinner === "A"
              ? room.match.aSetWins >= room.settings.wins
              : room.match.bSetWins >= room.settings.wins;
          if (reachedWins) {
            room.match.isFinished = true;
            const matchWinnerName = setWinner === "A" ? room.teamA.name : room.teamB.name;
            appendMatchLog(
              room,
              "match_end",
              "比赛结束：" +
                matchWinnerName +
                " 以 " +
                String(room.match.aSetWins) +
                ":" +
                String(room.match.bSetWins) +
                " 获胜",
              setWinner
            );
            setEndSummary = {
              setNo: endedSetNo,
              teamAName: room.teamA.name,
              teamBName: room.teamB.name,
              smallScoreA: endedScoreA,
              smallScoreB: endedScoreB,
              bigScoreA: room.match.aSetWins,
              bigScoreB: room.match.bSetWins,
              winnerName: matchWinnerName,
              durationText: setElapsedText,
              matchFinished: true,
            };
          } else {
            setEndSummary = {
              setNo: endedSetNo,
              teamAName: room.teamA.name,
              teamBName: room.teamB.name,
              smallScoreA: endedScoreA,
              smallScoreB: endedScoreB,
              bigScoreA: room.match.aSetWins,
              bigScoreB: room.match.bSetWins,
              winnerName: setWinner === "A" ? room.teamA.name : room.teamB.name,
              durationText: setElapsedText,
              matchFinished: false,
            };
            room.match.setNo += 1;
            room.match.aScore = 0;
            room.match.bScore = 0;
            room.match.lastScoringTeam = "";
            room.match.setTimerStartAt = 0;
            room.match.setTimerElapsedMs = 0;
            room.match.servingTeam = setWinner;
            room.match.isSwapped = false;
            room.match.decidingSetEightHandled = false;
            appendMatchLog(room, "next_set", "进入第" + String(room.match.setNo) + "局", setWinner);
          }
        }
      }
      return room;
    });

    if (!next) {
      return;
    }

    const showSetEndModal = () => {
      if (!setEndSummary) {
        return;
      }
      this.setData({
        showSetEndModal: true,
        setEndTitleTop: "第" + String(setEndSummary.setNo) + "局结束",
        setEndTitleBottom: setEndSummary.matchFinished ? "比赛结束" : "",
        setEndTeamAName: setEndSummary.teamAName,
        setEndTeamBName: setEndSummary.teamBName,
        setEndSmallScoreA: setEndSummary.smallScoreA,
        setEndSmallScoreB: setEndSummary.smallScoreB,
        setEndBigScoreA: setEndSummary.bigScoreA,
        setEndBigScoreB: setEndSummary.bigScoreB,
        setEndWinnerName: setEndSummary.winnerName,
        setEndDurationText: setEndSummary.durationText,
        setEndMatchFinished: setEndSummary.matchFinished,
        setEndActionText: setEndSummary.matchFinished ? "返回首页" : "继续",
      });
    };

    const showDecidingSetSwitchChoice = () => {
      if (!needDecidingSetSwitchChoice) {
        return;
      }
      wx.showModal({
        title: "决胜局8分",
        content: "是否现在换边？",
        confirmText: "换边",
        cancelText: "不换边",
        success: (res) => {
          if (res.confirm) {
            this.switchSidesWithAnimation("自动换边（决胜局）");
            return;
          }
          this.loadRoom(roomId, true);
        },
      });
    };

    if (!rotatedTeam) {
      this.loadRoom(roomId, true);
      showSetEndModal();
      showDecidingSetSwitchChoice();
      return;
    }

    this.loadRoom(roomId, true);
    if (beforeRotateRects && beforeRotateNoMap) {
      await this.playTeamRotateMotion(rotatedTeam, beforeRotateRects, beforeRotateNoMap, beforeRotateCaptain);
    }
    showSetEndModal();
    showDecidingSetSwitchChoice();
  },

  switchSidesWithAnimation(logNote: string) {
    const roomId = this.data.roomId;
    this.setData({ switchingOut: true, switchingIn: false });
    setTimeout(() => {
      const next = updateRoom(roomId, (room) => {
        pushUndoSnapshot(room);
        room.match.isSwapped = !room.match.isSwapped;
        appendMatchLog(room, "switch_sides", logNote);
        return room;
      });
      this.setData({ switchingOut: false, switchingIn: true });
      if (next) {
        this.loadRoom(roomId, true);
      }
      setTimeout(() => {
        this.setData({ switchingIn: false });
      }, 220);
    }, 150);
  },

  onSwitchSides() {
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，无法换边");
      return;
    }
    this.switchSidesWithAnimation("手动换边");
  },

  async onRotateTeam(e: WechatMiniprogram.TouchEvent) {
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，无法轮转");
      return;
    }
    const dataset = e.currentTarget.dataset as { team: TeamCode };
    const team = dataset.team;
    const roomId = this.data.roomId;
    const beforeRotateRects = await this.measureTeamMainPosRectsStable(team, 1000);
    const beforeRotateNoMap = this.getTeamMainNumberMap(team);
    const beforeRotateCaptain = team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;
    const next = updateRoom(roomId, (room) => {
      pushUndoSnapshot(room);
      rotateTeamAndLog(room, team, "手动轮转");
      return room;
    });

    if (!next) {
      return;
    }
    this.loadRoom(roomId, true);
    await this.playTeamRotateMotion(team, beforeRotateRects, beforeRotateNoMap, beforeRotateCaptain);
  },

  onResetScore() {
    const roomId = this.data.roomId;
    const next = updateRoom(roomId, (room) => {
      pushUndoSnapshot(room);
      room.match.aScore = 0;
      room.match.bScore = 0;
      room.match.lastScoringTeam = "";
      room.match.setTimerStartAt = 0;
      room.match.setTimerElapsedMs = 0;
      room.match.servingTeam = "A";
      room.match.aSetWins = 0;
      room.match.bSetWins = 0;
      room.match.setNo = 1;
      room.match.decidingSetEightHandled = false;
      room.match.isFinished = false;
      appendMatchLog(room, "score_reset", "比分清零（0:0）");
      return room;
    });
    if (next) {
      this.loadRoom(roomId, true);
    }
  },

  async onUndoLastScore() {
    const roomId = this.data.roomId;
    let undone = false;
    let beforeAScore = 0;
    let beforeBScore = 0;
    let undoRotateA = false;
    let undoRotateB = false;
    const beforeARects = await this.measureTeamMainPosRectsStable("A", 1000);
    const beforeBRects = await this.measureTeamMainPosRectsStable("B", 1000);
    const beforeANoMap = this.getTeamMainNumberMap("A");
    const beforeBNoMap = this.getTeamMainNumberMap("B");
    const beforeACaptain = this.data.teamACaptainNo;
    const beforeBCaptain = this.data.teamBCaptainNo;
    const next = updateRoom(roomId, (room) => {
      beforeAScore = room.match.aScore;
      beforeBScore = room.match.bScore;
      const stack = room.match.undoStack;
      if (!stack || stack.length === 0) {
        return room;
      }
      let last = stack.pop();
      while (
        last &&
        last.aScore === room.match.aScore &&
        last.bScore === room.match.bScore &&
        (last.lastScoringTeam || "") === (room.match.lastScoringTeam || "") &&
        last.servingTeam === room.match.servingTeam &&
        !!last.isSwapped === !!room.match.isSwapped &&
        !!last.decidingSetEightHandled === !!room.match.decidingSetEightHandled &&
        (last.setNo || room.match.setNo) === room.match.setNo &&
        (last.aSetWins || 0) === room.match.aSetWins &&
        (last.bSetWins || 0) === room.match.bSetWins &&
        !!last.isFinished === !!room.match.isFinished &&
        samePlayers(last.teamAPlayers || [], room.teamA.players || []) &&
        samePlayers(last.teamBPlayers || [], room.teamB.players || [])
      ) {
        last = stack.pop();
      }
      if (!last) {
        return room;
      }
      undone = true;
      room.match.aScore = last.aScore;
      room.match.bScore = last.bScore;
      room.match.lastScoringTeam = last.lastScoringTeam === "B" ? "B" : last.lastScoringTeam === "A" ? "A" : "";
      room.match.servingTeam = last.servingTeam;
      room.match.isSwapped = !!last.isSwapped;
      room.match.decidingSetEightHandled = !!last.decidingSetEightHandled;
      room.match.setNo = last.setNo || room.match.setNo || 1;
      room.match.aSetWins = last.aSetWins || 0;
      room.match.bSetWins = last.bSetWins || 0;
      room.match.isFinished = !!last.isFinished;
      undoRotateA = isOneStepRotationBetween(room.teamA.players || [], last.teamAPlayers || []);
      undoRotateB = isOneStepRotationBetween(room.teamB.players || [], last.teamBPlayers || []);
      room.teamA.players = last.teamAPlayers.slice();
      room.teamB.players = last.teamBPlayers.slice();
      appendMatchLog(
        room,
        "score_undo",
        "比分撤回（" +
          String(beforeAScore) +
          ":" +
          String(beforeBScore) +
          " -> " +
          String(room.match.aScore) +
          ":" +
          String(room.match.bScore) +
          "）"
      );
      return room;
    });

    if (!next) {
      return;
    }
    if (!undone) {
      showToastHint("暂无可撤回积分");
      return;
    }
    this.loadRoom(roomId, true);
    if (undoRotateA) {
      await this.playTeamRotateMotion("A", beforeARects, beforeANoMap, beforeACaptain);
    }
    if (undoRotateB) {
      await this.playTeamRotateMotion("B", beforeBRects, beforeBNoMap, beforeBCaptain);
    }
  },

  onOpenLogPanel() {
    this.setData({ showLogPanel: true });
  },

  onSwitchPlayer() {
    // Reserved: substitution behavior to be implemented later.
  },

  onCloseLogPanel() {
    this.setData({ showLogPanel: false });
  },

  onLogPanelTap() {},
});
