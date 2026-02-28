import {
  createRoom,
  getRoom,
  updateRoom,
  heartbeatRoom,
  getParticipantCount,
  leaveRoom,
  releaseRoomId,
  TEAM_COLOR_OPTIONS,
} from "../../utils/room-service";
import { showBlockHint, showToastHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

type TeamCode = "A" | "B";
type Position = "I" | "II" | "III" | "IV" | "V" | "VI" | "L1" | "L2";
type PlayerSlot = { pos: Position; number: string };
type DisplayPlayerSlot = PlayerSlot & { index: number };
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
  { label: "1局1胜（15分）", sets: 1, wins: 1, maxScore: 15, tiebreakScore: 15 },
  { label: "1局1胜（25分）", sets: 1, wins: 1, maxScore: 25, tiebreakScore: 25 },
];

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

const TEAM_A_MAIN_ORDER: Position[] = ["V", "IV", "VI", "III", "I", "II"];
const TEAM_B_MAIN_ORDER: Position[] = ["II", "I", "III", "VI", "IV", "V"];

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

function buildMainGrid(players: PlayerSlot[], order: Position[]): DisplayPlayerSlot[][] {
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
    };
  });
  return [ordered.slice(0, 2), ordered.slice(2, 4), ordered.slice(4, 6)];
}

function buildLibero(players: PlayerSlot[]): DisplayPlayerSlot[] {
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

function getTeamNameError(teamANameRaw: string, teamBNameRaw: string): string | null {
  const teamAName = String(teamANameRaw || "").trim();
  const teamBName = String(teamBNameRaw || "").trim();
  if (teamAName.length > 8) {
    return "团队名称最多8个字";
  }
  if (teamBName.length > 8) {
    return "团队名称最多8个字";
  }
  if (teamAName && teamBName && teamAName === teamBName) {
    return "甲乙队名称不能相同";
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

Page({
  data: {
    roomId: "",
    roomIdSpaced: "",
    roomPasswordSpaced: "",
    focusCreatePasswordInput: false,
    participantCount: 0,
    roomPassword: "",
    createMode: false,
    createCommitted: false,
    editMode: false,
    matchModes: MATCH_MODE_OPTIONS,
    matchModeIndex: 0,
    passwordFocused: false,
    teamANameFocused: false,
    teamBNameFocused: false,
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
  },

  pollTimer: 0 as number,
  themeOff: null as null | (() => void),
  captainPickerResolver: null as null | ((value: string | null) => void),

  onLoad(query: Record<string, string>) {
    this.applyNavigationTheme();
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
        teamAMainGrid: buildMainGrid(initialA, TEAM_A_MAIN_ORDER),
        teamALibero: buildLibero(initialA),
        teamBMainGrid: buildMainGrid(initialB, TEAM_B_MAIN_ORDER),
        teamBLibero: buildLibero(initialB),
      });
      return;
    }
    this.loadRoom(roomId, true);
  },

  onShow() {
    this.applyNavigationTheme();
    if (this.data.createMode) {
      return;
    }
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
    this.stopPolling();
    if (this.data.createMode) {
      if (!this.data.createCommitted) {
        const clientId = getApp<IAppOption>().globalData.clientId;
        releaseRoomId(this.data.roomId, clientId);
      }
      if (this.captainPickerResolver) {
        this.captainPickerResolver(null);
        this.captainPickerResolver = null;
      }
      return;
    }
    const roomId = this.data.roomId;
    const clientId = getApp<IAppOption>().globalData.clientId;
    leaveRoom(roomId, clientId);
    if (this.captainPickerResolver) {
      this.captainPickerResolver(null);
      this.captainPickerResolver = null;
    }
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
        this.handleRoomClosed();
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
      roomIdSpaced: roomId.split("").join(" "),
      participantCount: getParticipantCount(roomId),
      roomPassword: room.password,
      roomPasswordSpaced: String(room.password || "").split("").join(" "),
      matchModeIndex: getMatchModeIndexBySettings(
        room.settings.sets,
        room.settings.wins,
        room.settings.maxScore,
        room.settings.tiebreakScore
      ),
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
      teamAMainGrid: buildMainGrid(teamAPlayers, TEAM_A_MAIN_ORDER),
      teamALibero: buildLibero(teamAPlayers),
      teamBMainGrid: buildMainGrid(teamBPlayers, TEAM_B_MAIN_ORDER),
      teamBLibero: buildLibero(teamBPlayers),
      updatedAt: room.updatedAt,
    });
  },

  onInputChange(e: WechatMiniprogram.Input) {
    const field = (e.currentTarget.dataset as { field: string }).field;
    const value = e.detail.value;
    if (field === "teamAName") {
      if (!this.data.createMode) {
        return;
      }
      this.setData({ teamAName: value });
    } else if (field === "teamBName") {
      if (!this.data.createMode) {
        return;
      }
      this.setData({ teamBName: value });
    } else if (field === "teamACaptainNo") {
      this.setData({ teamACaptainNo: normalizeNumberInput(value) });
    } else if (field === "teamBCaptainNo") {
      this.setData({ teamBCaptainNo: normalizeNumberInput(value) });
    } else if (field === "roomPassword") {
      const pwd = (value || "").replace(/\D/g, "").slice(0, 6);
      this.setData({
        roomPassword: pwd,
        roomPasswordSpaced: pwd.split("").join(" "),
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
    this.setData({ matchModeIndex: nextIdx });
    this.persistDraft();
  },

  onPasswordFocus() {
    this.setData({ passwordFocused: true, focusCreatePasswordInput: true });
  },

  onPasswordBlur() {
    this.setData({ passwordFocused: false, focusCreatePasswordInput: false });
  },

  onCreatePasswordWrapTap() {
    this.setData({ focusCreatePasswordInput: true });
  },

  onTeamNameFocus(e: WechatMiniprogram.InputFocus) {
    const field = ((e.currentTarget || {}).dataset as { field?: string }).field;
    if (field === "teamAName") {
      this.setData({ teamANameFocused: true });
      return;
    }
    if (field === "teamBName") {
      this.setData({ teamBNameFocused: true });
    }
  },

  onTeamNameBlur(e: WechatMiniprogram.InputBlur) {
    const field = ((e.currentTarget || {}).dataset as { field?: string }).field;
    const rawA = this.data.teamAName || "";
    const rawB = this.data.teamBName || "";
    const wasTooLongA = rawA.length > 8;
    const wasTooLongB = rawB.length > 8;
    if (field === "teamAName") {
      const next = rawA.slice(0, 8);
      this.setData({ teamANameFocused: false, teamAName: next });
    } else if (field === "teamBName") {
      const next = rawB.slice(0, 8);
      this.setData({ teamBNameFocused: false, teamBName: next });
    }
    if (wasTooLongA) {
      showToastHint("团队名称最多8个字");
    } else if (wasTooLongB) {
      showToastHint("团队名称最多8个字");
    }
    const err = getTeamNameError(rawA.slice(0, 8), rawB.slice(0, 8));
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
    this.persistDraft();
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
      this.setData({ teamAColor: color });
      this.setData({ teamARGB: hexToRgbString(color) });
    } else {
      if (color === this.data.teamAColor) {
        showToastHint("甲/乙队颜色不能相同");
        return;
      }
      this.setData({ teamBColor: color });
      this.setData({ teamBRGB: hexToRgbString(color) });
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
        teamAMainGrid: buildMainGrid(players, TEAM_A_MAIN_ORDER),
        teamALibero: buildLibero(players),
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
        teamBMainGrid: buildMainGrid(players, TEAM_B_MAIN_ORDER),
        teamBLibero: buildLibero(players),
      });
      this.persistDraft(this.data.teamAPlayers, players);
    }
  },

  onPlayerNumberBlur(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { team: TeamCode; index: number };
    const team = dataset.team;
    const index = Number(dataset.index);
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
          teamAMainGrid: buildMainGrid(players, TEAM_A_MAIN_ORDER),
          teamALibero: buildLibero(players),
        });
        this.persistDraft(players, this.data.teamBPlayers);
      } else {
        this.setData({
          teamBPlayers: players,
          teamBMainGrid: buildMainGrid(players, TEAM_B_MAIN_ORDER),
          teamBLibero: buildLibero(players),
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
          teamAMainGrid: buildMainGrid(players, TEAM_A_MAIN_ORDER),
          teamALibero: buildLibero(players),
        });
        this.persistDraft(players, this.data.teamBPlayers);
      } else {
        this.setData({
          teamBPlayers: players,
          teamBMainGrid: buildMainGrid(players, TEAM_B_MAIN_ORDER),
          teamBLibero: buildLibero(players),
        });
        this.persistDraft(this.data.teamAPlayers, players);
      }
    }
    if (!current || current === "?") {
      return;
    }
    const duplicateCount = players.filter((p) => normalizeNumberInput(p.number) === current).length;
    if (duplicateCount > 1) {
      showToastHint("球员号码重复");
    }
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
    this.setData({ teamASide: this.data.teamASide === "A" ? "B" : "A", sidePulse: true });
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
      const order = team === "A" ? TEAM_A_MAIN_ORDER : TEAM_B_MAIN_ORDER;
      this.captainPickerResolver = resolve;
      this.setData({
        showCaptainPicker: true,
        captainPickerTitle: teamLabel + "队场上队长",
        captainPickerTeam: team,
        captainPickerMainGrid: buildMainGrid(players, order),
        captainPickerLibero: buildLibero(players),
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
    this.setData({
      teamACaptainNo: teamACaptainNo,
      teamBCaptainNo: teamBCaptainNo,
    });
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
    updateRoom(roomId, (room) => {
      room.password = this.data.roomPassword.trim();
      room.settings = {
        sets: mode.sets,
        wins: mode.wins,
        maxScore: mode.maxScore,
        tiebreakScore: mode.tiebreakScore,
      };
      room.teamA = {
        name: this.data.teamAName.trim() || "甲",
        captainNo: this.data.teamACaptainNo.trim(),
        color: this.data.teamAColor,
        players: teamAPlayers.slice(),
      };
      room.teamB = {
        name: this.data.teamBName.trim() || "乙",
        captainNo: this.data.teamBCaptainNo.trim(),
        color: this.data.teamBColor,
        players: teamBPlayers.slice(),
      };
      room.match.servingTeam = this.data.servingTeam;
      room.match.isSwapped = this.data.teamASide === "B";
      return room;
    });
  },

  async onSaveAndStart() {
    const teamAName = this.data.teamAName.trim() || "甲";
    const teamBName = this.data.teamBName.trim() || "乙";
    const roomPassword = this.data.roomPassword.trim();
    const mode = this.data.matchModes[this.data.matchModeIndex] || this.data.matchModes[0];
    let teamACaptainNo = normalizeNumberInput(this.data.teamACaptainNo);
    let teamBCaptainNo = normalizeNumberInput(this.data.teamBCaptainNo);

    if (roomPassword.length !== 6) {
      showBlockHint("房间密码需6位数字");
      return;
    }
    const teamNameErr = getTeamNameError(this.data.teamAName, this.data.teamBName);
    if (teamNameErr) {
      showBlockHint(teamNameErr);
      return;
    }
    if (!teamACaptainNo) {
      showBlockHint("请填写甲队队长号码");
      return;
    }
    if (!teamBCaptainNo) {
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

    const roomId = this.data.roomId;
    const editMode = this.data.editMode;
    const createMode = this.data.createMode;

    if (!editMode) {
      const captainResolved = await this.ensureOnCourtCaptains(this.data.teamAPlayers, this.data.teamBPlayers);
      if (!captainResolved) {
        return;
      }
      teamACaptainNo = captainResolved.teamACaptainNo;
      teamBCaptainNo = captainResolved.teamBCaptainNo;
    }

    if (createMode) {
      if (getRoom(roomId)) {
        showBlockHint("房间号已存在");
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
        teamACaptainNo: teamACaptainNo,
        teamAColor: this.data.teamAColor,
        teamAPlayers: this.data.teamAPlayers.slice(),
        teamBName: teamBName,
        teamBCaptainNo: teamBCaptainNo,
        teamBColor: this.data.teamBColor,
        teamBPlayers: this.data.teamBPlayers.slice(),
      });
      const nextCreated = updateRoom(created.roomId, (room) => {
        room.status = "match";
        room.match.servingTeam = this.data.servingTeam;
        room.match.isSwapped = this.data.teamASide === "B";
        return room;
      });
      if (!nextCreated) {
        showBlockHint("创建失败");
        return;
      }
      const clientId = getApp<IAppOption>().globalData.clientId;
      releaseRoomId(created.roomId, clientId);
      this.setData({ createCommitted: true });
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
        captainNo: teamACaptainNo,
        color: this.data.teamAColor,
        players: this.data.teamAPlayers.slice(),
      };
      room.teamB = {
        name: teamBName,
        captainNo: teamBCaptainNo,
        color: this.data.teamBColor,
        players: this.data.teamBPlayers.slice(),
      };
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
    wx.navigateTo({ url: "/pages/match/match?roomId=" + roomId });
  },

  onCreateInviteTap() {
    this.setData({ createInviteBtnFx: true });
    setTimeout(() => this.setData({ createInviteBtnFx: false }), 260);
    this.onCopyInviteAndStart();
  },

  onCreateContinueTap() {
    this.setData({ createContinueBtnFx: true });
    setTimeout(() => this.setData({ createContinueBtnFx: false }), 260);
    this.onSaveAndStart();
  },

  buildInviteText() {
    return (
      "[排球裁判小助手] 裁判团队编号 " +
      this.data.roomId +
      "，密码 " +
      this.data.roomPassword +
      "，打开小程序粘贴即可加入房间，请确认邀请人已完成比赛设置并进入比赛页面后再加入"
    );
  },

  async onCopyInviteAndStart() {
    const inviteText = this.buildInviteText();
    wx.setClipboardData({
      data: inviteText,
      success: () => {
        showToastHint("邀请信息已复制");
      },
      fail: () => {
        showBlockHint("复制失败，请重试");
      },
    });
  },
});
