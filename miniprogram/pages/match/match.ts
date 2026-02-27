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

type TeamCode = "A" | "B";
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

const ALL_POSITIONS: Position[] = ["I", "II", "III", "IV", "V", "VI", "L1", "L2"];
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

function buildMainGridByOrder(players: PlayerSlot[], order: Position[]): PlayerSlot[][] {
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

function rotateTeamNTimes(players: PlayerSlot[], times: number): PlayerSlot[] {
  let next = players.slice();
  for (let i = 0; i < times; i += 1) {
    next = rotateTeamByRule(next);
  }
  return next;
}

function toggleSidesWithLog(room: any, note: string): void {
  room.match.isSwapped = !room.match.isSwapped;
  appendMatchLog(room, "switch_sides", note);
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
    rotatingAOut: false,
    rotatingAIn: false,
    rotatingBOut: false,
    rotatingBIn: false,
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
    wx.setNavigationBarTitle({ title: "裁判团队编号 " + roomId });
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

    const aRows = buildTeamRows(room.teamA.players);
    const bRows = buildTeamRows(room.teamB.players);
    const aMainGrid = buildMainGridByOrder(room.teamA.players, ["V", "IV", "VI", "III", "I", "II"]);
    const bMainGrid = buildMainGridByOrder(room.teamB.players, ["II", "I", "III", "VI", "IV", "V"]);
    const nextSwapped = !!room.match.isSwapped;
    const teamAColor = room.teamA.color || TEAM_COLOR_OPTIONS[0].value;
    const teamBColor = room.teamB.color || TEAM_COLOR_OPTIONS[1].value;
    const leftSetWins = nextSwapped ? room.match.bSetWins : room.match.aSetWins;
    const rightSetWins = nextSwapped ? room.match.aSetWins : room.match.bSetWins;
    const setNoText = room.match.isFinished ? "已结束" : "第" + String(room.match.setNo || 1) + "局";
    const setWinsText = String(leftSetWins || 0) + " : " + String(rightSetWins || 0);
    const timerStartAt = Number((room.match as any).setTimerStartAt) || 0;
    const timerElapsedMs = Number((room.match as any).setTimerElapsedMs) || 0;
    this.timerStartAtMs = timerStartAt;
    this.timerElapsedBaseMs = timerElapsedMs;
    const liveTimerMs = timerStartAt > 0 ? timerElapsedMs + (Date.now() - timerStartAt) : timerElapsedMs;
    const timerText = formatDurationMMSS(liveTimerMs);
    this.lastRenderedTimerText = timerText;
    wx.setNavigationBarTitle({ title: "裁判团队编号 " + roomId });
    this.setData({
      participantCount: getParticipantCount(roomId),
      teamAName: room.teamA.name,
      teamBName: room.teamB.name,
      teamAColor: teamAColor,
      teamBColor: teamBColor,
      teamACaptainNo: normalizeNumberInput(String((room.teamA as any).captainNo || "")),
      teamBCaptainNo: normalizeNumberInput(String((room.teamB as any).captainNo || "")),
      teamARGB: hexToRgbTriplet(teamAColor),
      teamBRGB: hexToRgbTriplet(teamBColor),
      aScore: room.match.aScore,
      bScore: room.match.bScore,
      lastScoringTeam: room.match.lastScoringTeam === "B" ? "B" : room.match.lastScoringTeam === "A" ? "A" : "",
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

  onScoreChange(e: WechatMiniprogram.CustomEvent) {
    const detail = e.detail as { team?: TeamCode; type?: "add" | "sub" };
    const team = detail.team;
    const type = detail.type || "add";
    if (team !== "A" && team !== "B") {
      return;
    }
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，请重置或重新配置");
      return;
    }
    const roomId = this.data.roomId;
    let setEndedMessage = "";
    let matchEndedMessage = "";
    let setElapsedText = "00:00";
    let rotatedTeam: TeamCode | "" = "";
    let needDecidingSetSwitchChoice = false;

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
          const startedAt = Number(room.match.setTimerStartAt) || 0;
          const baseElapsed = Number(room.match.setTimerElapsedMs) || 0;
          const finalElapsed = startedAt > 0 ? baseElapsed + (Date.now() - startedAt) : baseElapsed;
          room.match.setTimerElapsedMs = finalElapsed;
          room.match.setTimerStartAt = 0;
          setElapsedText = formatDurationMMSS(finalElapsed);
          if (setWinner === "A") {
            room.match.aSetWins += 1;
          } else {
            room.match.bSetWins += 1;
          }
          appendMatchLog(
            room,
            "set_end",
            "第" +
              String(room.match.setNo) +
              "局结束：" +
              (setWinner === "A" ? room.teamA.name : room.teamB.name) +
              " 胜（" +
              String(room.match.aScore) +
              ":" +
              String(room.match.bScore) +
              "）",
            setWinner
          );
          setEndedMessage =
            "第" +
            String(room.match.setNo) +
            "局结束，" +
            (setWinner === "A" ? room.teamA.name : room.teamB.name) +
            "胜，用时" +
            setElapsedText;

          const reachedWins =
            setWinner === "A"
              ? room.match.aSetWins >= room.settings.wins
              : room.match.bSetWins >= room.settings.wins;
          if (reachedWins) {
            room.match.isFinished = true;
            const matchWinnerName = setWinner === "A" ? room.teamA.name : room.teamB.name;
            const matchFinalSetScore = String(room.match.aSetWins) + ":" + String(room.match.bSetWins);
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
            matchEndedMessage = "整场比分 " + matchFinalSetScore + "，" + matchWinnerName + "获胜";
          } else {
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

    const showMessages = () => {
      if (setEndedMessage) {
        if (matchEndedMessage) {
          showBlockHint(setEndedMessage + "；" + matchEndedMessage + "；比赛结束");
        } else {
          showToastHint(setEndedMessage);
        }
      }
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
            this.onSwitchSides();
            return;
          }
          updateRoom(roomId, (room) => {
            appendMatchLog(room, "switch_sides_skip", "决胜局8分，选择不换边");
            return room;
          });
          this.loadRoom(roomId, true);
        },
      });
    };

    if (!rotatedTeam) {
      this.loadRoom(roomId, true);
      showMessages();
      showDecidingSetSwitchChoice();
      return;
    }

    if (rotatedTeam === "A") {
      this.setData({ rotatingAOut: true, rotatingAIn: false });
    } else {
      this.setData({ rotatingBOut: true, rotatingBIn: false });
    }

    setTimeout(() => {
      if (rotatedTeam === "A") {
        this.setData({ rotatingAOut: false, rotatingAIn: true });
      } else {
        this.setData({ rotatingBOut: false, rotatingBIn: true });
      }
      this.loadRoom(roomId, true);
      showMessages();
      showDecidingSetSwitchChoice();
      setTimeout(() => {
        if (rotatedTeam === "A") {
          this.setData({ rotatingAIn: false });
        } else {
          this.setData({ rotatingBIn: false });
        }
      }, 180);
    }, 140);
  },

  onSwitchSides() {
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，无法换边");
      return;
    }
    const roomId = this.data.roomId;
    this.setData({ switchingOut: true, switchingIn: false });
    setTimeout(() => {
      const next = updateRoom(roomId, (room) => {
        pushUndoSnapshot(room);
        toggleSidesWithLog(room, room.match.isSwapped ? "左右换边（已复位）" : "左右换边（已交换）");
        room.teamA.players = rotateTeamNTimes(room.teamA.players, 3);
        room.teamB.players = rotateTeamNTimes(room.teamB.players, 3);
        appendMatchLog(room, "rotate", room.teamA.name + " 换边自动轮转3次", "A");
        appendMatchLog(room, "rotate", room.teamB.name + " 换边自动轮转3次", "B");
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

  onRotateTeam(e: WechatMiniprogram.TouchEvent) {
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，无法轮转");
      return;
    }
    const dataset = e.currentTarget.dataset as { team: TeamCode };
    const team = dataset.team;
    const roomId = this.data.roomId;
    if (team === "A") {
      this.setData({ rotatingAOut: true, rotatingAIn: false });
    } else {
      this.setData({ rotatingBOut: true, rotatingBIn: false });
    }

    setTimeout(() => {
      const next = updateRoom(roomId, (room) => {
        pushUndoSnapshot(room);
        rotateTeamAndLog(room, team, "手动轮转");
        return room;
      });

      if (team === "A") {
        this.setData({ rotatingAOut: false, rotatingAIn: true });
      } else {
        this.setData({ rotatingBOut: false, rotatingBIn: true });
      }

      if (next) {
        this.loadRoom(roomId, true);
      }

      setTimeout(() => {
        if (team === "A") {
          this.setData({ rotatingAIn: false });
        } else {
          this.setData({ rotatingBIn: false });
        }
      }, 180);
    }, 140);
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

  onUndoLastScore() {
    const roomId = this.data.roomId;
    let undone = false;
    let beforeAScore = 0;
    let beforeBScore = 0;
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
  },

  onOpenLogPanel() {
    this.setData({ showLogPanel: true });
  },

  onCloseLogPanel() {
    this.setData({ showLogPanel: false });
  },

  onLogPanelTap() {},
});
