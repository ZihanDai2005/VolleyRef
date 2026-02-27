import {
  createRoom,
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
type MatchModeOption = {
  label: string;
  sets: number;
  wins: number;
  maxScore: number;
  tiebreakScore: number;
};

const MATCH_MODE_OPTIONS: MatchModeOption[] = [
  { label: "5局3胜", sets: 5, wins: 3, maxScore: 25, tiebreakScore: 15 },
  { label: "3局2胜", sets: 3, wins: 2, maxScore: 25, tiebreakScore: 15 },
  { label: "1局1胜(15分)", sets: 1, wins: 1, maxScore: 15, tiebreakScore: 15 },
  { label: "1局1胜(25分)", sets: 1, wins: 1, maxScore: 25, tiebreakScore: 25 },
];

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

function findDuplicateNumber(players: PlayerSlot[]): string | null {
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < players.length; i += 1) {
    const n = (players[i].number || "").trim();
    if (!n || n === "?") {
      continue;
    }
    if (seen[n]) {
      return n;
    }
    seen[n] = true;
  }
  return null;
}

Page({
  data: {
    roomId: "",
    participantCount: 0,
    roomPassword: "",
    createMode: false,
    editMode: false,
    matchModes: MATCH_MODE_OPTIONS,
    matchModeIndex: 0,
    passwordFocused: false,
    teamAName: "",
    teamBName: "",
    teamAColor: TEAM_COLOR_OPTIONS[0].value,
    teamBColor: TEAM_COLOR_OPTIONS[1].value,
    colorOptions: TEAM_COLOR_OPTIONS,
    teamAPlayers: [] as PlayerSlot[],
    teamBPlayers: [] as PlayerSlot[],
    teamARowTop: [] as PlayerSlot[],
    teamARowMid: [] as PlayerSlot[],
    teamARowLibero: [] as PlayerSlot[],
    teamBRowTop: [] as PlayerSlot[],
    teamBRowMid: [] as PlayerSlot[],
    teamBRowLibero: [] as PlayerSlot[],
    updatedAt: 0,
  },

  pollTimer: 0 as number,

  onLoad(query: Record<string, string>) {
    const roomId = query.roomId || "";
    if (!roomId) {
      wx.showToast({ title: "房间号无效", icon: "none" });
      return;
    }
    const createMode = query.create === "1";
    const editMode = query.edit === "1";
    this.setData({ roomId: roomId, editMode: editMode, createMode: createMode });
    if (createMode) {
      const presetPassword = String(query.password || "").replace(/\D/g, "").slice(0, 6);
      this.setData({
        participantCount: 0,
        roomPassword: presetPassword,
        teamAName: "",
        teamBName: "",
        teamAColor: TEAM_COLOR_OPTIONS[0].value,
        teamBColor: TEAM_COLOR_OPTIONS[1].value,
        teamAPlayers: [
          { pos: "I", number: "?" },
          { pos: "II", number: "?" },
          { pos: "III", number: "?" },
          { pos: "IV", number: "?" },
          { pos: "V", number: "?" },
          { pos: "VI", number: "?" },
          { pos: "L1", number: "?" },
          { pos: "L2", number: "?" },
        ],
        teamBPlayers: [
          { pos: "I", number: "?" },
          { pos: "II", number: "?" },
          { pos: "III", number: "?" },
          { pos: "IV", number: "?" },
          { pos: "V", number: "?" },
          { pos: "VI", number: "?" },
          { pos: "L1", number: "?" },
          { pos: "L2", number: "?" },
        ],
        teamARowTop: [
          { pos: "I", number: "?" },
          { pos: "II", number: "?" },
          { pos: "III", number: "?" },
        ],
        teamARowMid: [
          { pos: "IV", number: "?" },
          { pos: "V", number: "?" },
          { pos: "VI", number: "?" },
        ],
        teamARowLibero: [
          { pos: "L1", number: "?" },
          { pos: "L2", number: "?" },
        ],
        teamBRowTop: [
          { pos: "I", number: "?" },
          { pos: "II", number: "?" },
          { pos: "III", number: "?" },
        ],
        teamBRowMid: [
          { pos: "IV", number: "?" },
          { pos: "V", number: "?" },
          { pos: "VI", number: "?" },
        ],
        teamBRowLibero: [
          { pos: "L1", number: "?" },
          { pos: "L2", number: "?" },
        ],
      });
      return;
    }
    this.loadRoom(roomId, true);
  },

  onShow() {
    if (this.data.createMode) {
      return;
    }
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
    if (this.data.createMode) {
      return;
    }
    const roomId = this.data.roomId;
    const clientId = getApp<IAppOption>().globalData.clientId;
    leaveRoom(roomId, clientId);
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

    if (room.status === "match" && !this.data.editMode) {
      wx.redirectTo({ url: "/pages/match/match?roomId=" + roomId });
      return;
    }

    if (!force && room.updatedAt === this.data.updatedAt) {
      this.setData({ participantCount: getParticipantCount(roomId) });
      return;
    }

    const teamAPlayers = room.teamA.players;
    const teamBPlayers = room.teamB.players;
    this.setData({
      participantCount: getParticipantCount(roomId),
      roomPassword: room.password,
      matchModeIndex: getMatchModeIndexBySettings(
        room.settings.sets,
        room.settings.wins,
        room.settings.maxScore,
        room.settings.tiebreakScore
      ),
      teamAName: room.teamA.name,
      teamBName: room.teamB.name,
      teamAColor: room.teamA.color || TEAM_COLOR_OPTIONS[0].value,
      teamBColor: room.teamB.color || TEAM_COLOR_OPTIONS[1].value,
      teamAPlayers: teamAPlayers,
      teamBPlayers: teamBPlayers,
      teamARowTop: teamAPlayers.slice(0, 3),
      teamARowMid: teamAPlayers.slice(3, 6),
      teamARowLibero: teamAPlayers.slice(6, 8),
      teamBRowTop: teamBPlayers.slice(0, 3),
      teamBRowMid: teamBPlayers.slice(3, 6),
      teamBRowLibero: teamBPlayers.slice(6, 8),
      updatedAt: room.updatedAt,
    });
  },

  onInputChange(e: WechatMiniprogram.Input) {
    const field = (e.currentTarget.dataset as { field: string }).field;
    const value = e.detail.value;
    if (field === "teamAName") {
      this.setData({ teamAName: value });
    } else if (field === "teamBName") {
      this.setData({ teamBName: value });
    } else if (field === "roomPassword") {
      this.setData({ roomPassword: (value || "").replace(/\D/g, "").slice(0, 6) });
    }
    setTimeout(() => {
      this.persistDraft();
    }, 0);
  },

  onMatchModeChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    const maxIdx = this.data.matchModes.length - 1;
    const nextIdx = Number.isFinite(idx) ? Math.max(0, Math.min(maxIdx, idx)) : 0;
    this.setData({ matchModeIndex: nextIdx });
    this.persistDraft();
  },

  onPasswordFocus() {
    this.setData({ passwordFocused: true });
  },

  onPasswordBlur() {
    this.setData({ passwordFocused: false });
  },

  onTeamColorSelect(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { team: TeamCode; color: string };
    const team = dataset.team;
    const color = String(dataset.color || "").toUpperCase();
    if (!TEAM_COLOR_OPTIONS.some(function (opt) { return opt.value === color; })) {
      return;
    }
    if (team === "A") {
      if (color === this.data.teamBColor) {
        wx.showToast({ title: "A/B队颜色不能相同", icon: "none" });
        return;
      }
      this.setData({ teamAColor: color });
    } else {
      if (color === this.data.teamAColor) {
        wx.showToast({ title: "A/B队颜色不能相同", icon: "none" });
        return;
      }
      this.setData({ teamBColor: color });
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
        teamARowTop: players.slice(0, 3),
        teamARowMid: players.slice(3, 6),
        teamARowLibero: players.slice(6, 8),
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
        teamBRowTop: players.slice(0, 3),
        teamBRowMid: players.slice(3, 6),
        teamBRowLibero: players.slice(6, 8),
      });
      this.persistDraft(this.data.teamAPlayers, players);
    }
  },

  onPlayerNumberBlur(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { team: TeamCode };
    const team = dataset.team;
    const players = team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers;
    const duplicate = findDuplicateNumber(players);
    if (!duplicate) {
      return;
    }
    const teamName = team === "A" ? (this.data.teamAName.trim() || "A") : (this.data.teamBName.trim() || "B");
    wx.showToast({ title: teamName + "队号码" + duplicate + "重复", icon: "none" });
  },

  persistDraft(teamAPlayersArg?: PlayerSlot[], teamBPlayersArg?: PlayerSlot[]) {
    const roomId = this.data.roomId;
    if (!roomId || this.data.createMode) {
      return;
    }
    const teamAPlayers = teamAPlayersArg || this.data.teamAPlayers;
    const teamBPlayers = teamBPlayersArg || this.data.teamBPlayers;
    const mode = this.data.matchModes[this.data.matchModeIndex] || this.data.matchModes[0];
    updateRoom(roomId, (room) => {
      room.password = this.data.roomPassword.trim();
      room.settings = {
        sets: mode.sets,
        wins: mode.wins,
        maxScore: mode.maxScore,
        tiebreakScore: mode.tiebreakScore,
      };
      room.teamA = {
        name: this.data.teamAName.trim() || "A",
        color: this.data.teamAColor,
        players: teamAPlayers.slice(),
      };
      room.teamB = {
        name: this.data.teamBName.trim() || "B",
        color: this.data.teamBColor,
        players: teamBPlayers.slice(),
      };
      return room;
    });
  },

  onSaveAndStart() {
    const teamAName = this.data.teamAName.trim() || "A";
    const teamBName = this.data.teamBName.trim() || "B";
    const roomPassword = this.data.roomPassword.trim();
    const mode = this.data.matchModes[this.data.matchModeIndex] || this.data.matchModes[0];

    if (roomPassword.length !== 6) {
      wx.showToast({ title: "房间密码需6位数字", icon: "none" });
      return;
    }
    if (this.data.teamAColor === this.data.teamBColor) {
      wx.showToast({ title: "A/B队颜色不能相同", icon: "none" });
      return;
    }

    const errA = validateTeamPlayers(this.data.teamAPlayers, teamAName);
    if (errA) {
      wx.showToast({ title: errA, icon: "none" });
      return;
    }

    const errB = validateTeamPlayers(this.data.teamBPlayers, teamBName);
    if (errB) {
      wx.showToast({ title: errB, icon: "none" });
      return;
    }

    const roomId = this.data.roomId;
    const editMode = this.data.editMode;
    const createMode = this.data.createMode;
    if (createMode) {
      if (getRoom(roomId)) {
        wx.showToast({ title: "房间号已存在", icon: "none" });
        return;
      }
      const created = createRoom({
        roomId: roomId,
        password: roomPassword,
        settings: {
          sets: mode.sets,
          wins: mode.wins,
          maxScore: mode.maxScore,
          tiebreakScore: mode.tiebreakScore,
        },
        teamAName: teamAName,
        teamAColor: this.data.teamAColor,
        teamAPlayers: this.data.teamAPlayers.slice(),
        teamBName: teamBName,
        teamBColor: this.data.teamBColor,
        teamBPlayers: this.data.teamBPlayers.slice(),
      });
      const nextCreated = updateRoom(created.roomId, (room) => {
        room.status = "match";
        return room;
      });
      if (!nextCreated) {
        wx.showToast({ title: "创建失败", icon: "none" });
        return;
      }
      const clientId = getApp<IAppOption>().globalData.clientId;
      heartbeatRoom(created.roomId, clientId);
      wx.navigateTo({ url: "/pages/match/match?roomId=" + created.roomId });
      return;
    }
    const next = updateRoom(roomId, (room) => {
      room.status = editMode ? room.status : "match";
      room.password = roomPassword;
      room.settings = {
        sets: mode.sets,
        wins: mode.wins,
        maxScore: mode.maxScore,
        tiebreakScore: mode.tiebreakScore,
      };
      room.teamA = {
        name: teamAName,
        color: this.data.teamAColor,
        players: this.data.teamAPlayers.slice(),
      };
      room.teamB = {
        name: teamBName,
        color: this.data.teamBColor,
        players: this.data.teamBPlayers.slice(),
      };
      return room;
    });

    if (!next) {
      wx.showToast({ title: "房间不存在", icon: "none" });
      return;
    }

    if (editMode) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.navigateTo({ url: "/pages/match/match?roomId=" + roomId });
  },
});
