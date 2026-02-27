import {
  getRoom,
  updateRoom,
  heartbeatRoom,
  getParticipantCount,
  leaveRoom,
  TEAM_COLOR_OPTIONS,
} from "../../utils/room-service";

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

function shouldAutoSwitchAtEight(room: any): boolean {
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

Page({
  data: {
    roomId: "",
    participantCount: 0,
    teamAName: "A",
    teamBName: "B",
    teamAColor: TEAM_COLOR_OPTIONS[0].value,
    teamBColor: TEAM_COLOR_OPTIONS[1].value,
    teamARGB: "138, 135, 208",
    teamBRGB: "129, 199, 158",
    aScore: 0,
    bScore: 0,
    servingTeam: "A" as TeamCode,
    servingTeamName: "A",
    serveOnLeft: true,
    serveThemeClass: "serve-a",
    serveMotion: false,
    setNo: 1,
    aSetWins: 0,
    bSetWins: 0,
    setSummaryText: "第1局 0:0",
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
    safePadTop: "8px",
    safePadRight: "20px",
    safePadBottom: "8px",
    safePadLeft: "20px",
    updatedAt: 0,
  },

  pollTimer: 0 as number,
  serveMotionTimer: 0 as number,

  onLoad(query: Record<string, string>) {
    const roomId = query.roomId || "";
    if (!roomId) {
      wx.showToast({ title: "缺少房间号", icon: "none" });
      return;
    }
    wx.setNavigationBarTitle({ title: "比赛房间 " + roomId });
    this.setData({ roomId: roomId });
    this.syncSafePadding();
    if ((wx as any).onWindowResize) {
      (wx as any).onWindowResize(this.onWindowResize);
    }
    this.loadRoom(roomId, true);
  },

  onShow() {
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
    if ((wx as any).offWindowResize) {
      (wx as any).offWindowResize(this.onWindowResize);
    }
    if (this.serveMotionTimer) {
      clearTimeout(this.serveMotionTimer);
      this.serveMotionTimer = 0;
    }
    const roomId = this.data.roomId;
    const clientId = getApp<IAppOption>().globalData.clientId;
    leaveRoom(roomId, clientId);
  },

  onWindowResize() {
    this.syncSafePadding();
  },

  syncSafePadding() {
    const info: any = (wx as any).getWindowInfo ? (wx as any).getWindowInfo() : wx.getSystemInfoSync();
    const safe = info && info.safeArea;
    const windowWidth = Number(info && info.windowWidth) || Number(info && info.screenWidth) || 0;
    const windowHeight = Number(info && info.windowHeight) || Number(info && info.screenHeight) || 0;
    if (!safe || !windowWidth || !windowHeight) {
      this.setData({
        safePadTop: "8px",
        safePadRight: "20px",
        safePadBottom: "8px",
        safePadLeft: "20px",
      });
      return;
    }
    const insetTop = Math.max(0, Number(safe.top) || 0);
    const insetLeft = Math.max(0, Number(safe.left) || 0);
    const insetRight = Math.max(0, windowWidth - (Number(safe.right) || windowWidth));
    const insetBottom = Math.max(0, windowHeight - (Number(safe.bottom) || windowHeight));
    this.setData({
      safePadTop: String(8 + insetTop) + "px",
      safePadRight: String(20 + insetRight) + "px",
      safePadBottom: String(8 + insetBottom) + "px",
      safePadLeft: String(20 + insetLeft) + "px",
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

  loadRoom(roomId: string, force: boolean) {
    const clientId = getApp<IAppOption>().globalData.clientId;
    heartbeatRoom(roomId, clientId);
    const room = getRoom(roomId);
    if (!room) {
      if (force) {
        wx.showToast({ title: "房间不存在", icon: "none" });
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
    const nextServingTeam = room.match.servingTeam;
    const nextSwapped = !!room.match.isSwapped;
    const teamAColor = room.teamA.color || TEAM_COLOR_OPTIONS[0].value;
    const teamBColor = room.teamB.color || TEAM_COLOR_OPTIONS[1].value;
    const leftSetWins = nextSwapped ? room.match.bSetWins : room.match.aSetWins;
    const rightSetWins = nextSwapped ? room.match.aSetWins : room.match.bSetWins;
    const setSummaryText = room.match.isFinished
      ? "已结束 " + String(leftSetWins || 0) + ":" + String(rightSetWins || 0)
      : "第" + String(room.match.setNo || 1) + "局 " + String(leftSetWins || 0) + ":" + String(rightSetWins || 0);
    const nextServeOnLeft =
      (nextServingTeam === "A" && !nextSwapped) || (nextServingTeam === "B" && nextSwapped);
    const nextServeThemeClass = nextServingTeam === "A" ? "serve-a" : "serve-b";
    const shouldAnimateServe =
      this.data.servingTeam !== nextServingTeam ||
      this.data.isSwapped !== nextSwapped ||
      this.data.serveOnLeft !== nextServeOnLeft;

    if (this.serveMotionTimer) {
      clearTimeout(this.serveMotionTimer);
      this.serveMotionTimer = 0;
    }
    this.setData({
      participantCount: getParticipantCount(roomId),
      teamAName: room.teamA.name,
      teamBName: room.teamB.name,
      teamAColor: teamAColor,
      teamBColor: teamBColor,
      teamARGB: hexToRgbTriplet(teamAColor),
      teamBRGB: hexToRgbTriplet(teamBColor),
      aScore: room.match.aScore,
      bScore: room.match.bScore,
      servingTeam: nextServingTeam,
      servingTeamName: nextServingTeam === "A" ? room.teamA.name : room.teamB.name,
      serveOnLeft: nextServeOnLeft,
      serveThemeClass: nextServeThemeClass,
      serveMotion: shouldAnimateServe,
      setNo: room.match.setNo || 1,
      aSetWins: room.match.aSetWins || 0,
      bSetWins: room.match.bSetWins || 0,
      setSummaryText: setSummaryText,
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
    if (shouldAnimateServe) {
      this.serveMotionTimer = setTimeout(() => {
        this.setData({ serveMotion: false });
      }, 220) as unknown as number;
    }
  },

  onScoreChange(e: WechatMiniprogram.CustomEvent) {
    const detail = e.detail as { team?: TeamCode; type?: "add" | "sub" };
    const team = detail.team;
    const type = detail.type || "add";
    if (team !== "A" && team !== "B") {
      return;
    }
    if (this.data.isMatchFinished) {
      wx.showToast({ title: "比赛已结束，请重置或重新配置", icon: "none" });
      return;
    }
    const roomId = this.data.roomId;
    let setEndedMessage = "";
    let matchEndedMessage = "";
    let matchWinnerName = "";
    let rotatedTeam: TeamCode | "" = "";

    const next = updateRoom(roomId, (room) => {
      if (room.match.isFinished) {
        return room;
      }
      if (type === "add") {
        room.match.undoStack.push({
          aScore: room.match.aScore,
          bScore: room.match.bScore,
          servingTeam: room.match.servingTeam,
          teamAPlayers: room.teamA.players.slice(),
          teamBPlayers: room.teamB.players.slice(),
          setNo: room.match.setNo,
          aSetWins: room.match.aSetWins,
          bSetWins: room.match.bSetWins,
          isFinished: room.match.isFinished,
        });
        if (room.match.undoStack.length > 100) {
          room.match.undoStack.shift();
        }

        if (team === "A") {
          room.match.aScore += 1;
        } else {
          room.match.bScore += 1;
        }
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

        if (shouldAutoSwitchAtEight(room)) {
          toggleSidesWithLog(room, "决胜局8分自动换边");
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
            "第" + String(room.match.setNo) + "局结束，" + (setWinner === "A" ? room.teamA.name : room.teamB.name) + "胜";

          const reachedWins =
            setWinner === "A"
              ? room.match.aSetWins >= room.settings.wins
              : room.match.bSetWins >= room.settings.wins;
          if (reachedWins) {
            room.match.isFinished = true;
            matchWinnerName = setWinner === "A" ? room.teamA.name : room.teamB.name;
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
            matchEndedMessage = "整场比赛" + matchWinnerName + "胜，比赛结束";
          } else {
            room.match.setNo += 1;
            room.match.aScore = 0;
            room.match.bScore = 0;
            room.match.servingTeam = setWinner;
            room.match.isSwapped = false;
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
        const title = matchEndedMessage ? setEndedMessage + "\n" + matchEndedMessage : setEndedMessage;
        wx.showToast({ title: title, icon: "none" });
      }
    };

    if (!rotatedTeam) {
      this.loadRoom(roomId, true);
      showMessages();
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
      wx.showToast({ title: "比赛已结束，无法换边", icon: "none" });
      return;
    }
    const roomId = this.data.roomId;
    this.setData({ switchingOut: true, switchingIn: false });
    setTimeout(() => {
      const next = updateRoom(roomId, (room) => {
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
      wx.showToast({ title: "比赛已结束，无法轮转", icon: "none" });
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

  onOpenConfig() {
    const roomId = this.data.roomId;
    wx.navigateTo({ url: "/pages/room/room?roomId=" + roomId + "&edit=1" });
  },

  onResetScore() {
    const roomId = this.data.roomId;
    const next = updateRoom(roomId, (room) => {
      room.match.undoStack.push({
        aScore: room.match.aScore,
        bScore: room.match.bScore,
        servingTeam: room.match.servingTeam,
        teamAPlayers: room.teamA.players.slice(),
        teamBPlayers: room.teamB.players.slice(),
        setNo: room.match.setNo,
        aSetWins: room.match.aSetWins,
        bSetWins: room.match.bSetWins,
        isFinished: room.match.isFinished,
      });
      if (room.match.undoStack.length > 100) {
        room.match.undoStack.shift();
      }
      room.match.aScore = 0;
      room.match.bScore = 0;
      room.match.servingTeam = "A";
      room.match.aSetWins = 0;
      room.match.bSetWins = 0;
      room.match.setNo = 1;
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
        (last.setNo || room.match.setNo) === room.match.setNo &&
        (last.aSetWins || 0) === room.match.aSetWins &&
        (last.bSetWins || 0) === room.match.bSetWins
      ) {
        last = stack.pop();
      }
      if (!last) {
        return room;
      }
      undone = true;
      room.match.aScore = last.aScore;
      room.match.bScore = last.bScore;
      room.match.servingTeam = last.servingTeam;
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
      wx.showToast({ title: "暂无可撤回积分", icon: "none" });
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
