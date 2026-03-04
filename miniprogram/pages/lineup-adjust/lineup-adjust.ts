import { getRoomAsync, updateRoomAsync, TEAM_COLOR_OPTIONS } from "../../utils/room-service";
import { showBlockHint, showToastHint } from "../../utils/hint";
import { getMainOrderForTeam, type MainPosition, type TeamCode } from "../../utils/lineup-order";
import { computeLandscapeSafePad } from "../../utils/safe-pad";

type Position = "I" | "II" | "III" | "IV" | "V" | "VI" | "L1" | "L2";
type PlayerSlot = { pos: Position; number: string };
type DisplayPlayerSlot = PlayerSlot & { index: number };
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
    return !normalizeNumberInput(p.number);
  });
  if (missingMain) {
    return teamName + "队 " + missingMain.pos + " 位置未填写号码";
  }

  const numbers = players
    .map(function (p) {
      return normalizeNumberInput(p.number);
    })
    .filter(function (n) {
      return !!n;
    });
  const uniq = new Set(numbers);
  if (uniq.size !== numbers.length) {
    return teamName + "队存在重复号码";
  }
  return null;
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

function buildMainGridByOrder(players: PlayerSlot[], order: MainPosition[]): DisplayPlayerSlot[][] {
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

function buildTeamRows(players: PlayerSlot[]): TeamRows {
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

Page({
  currentSetNo: 1 as number,
  draftSaveTimer: 0 as number,
  data: {
    continueBtnFx: false,
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
    teamAShowCaptainCheck: false,
    teamBShowCaptainCheck: false,
    teamAShowCaptainRepick: false,
    teamBShowCaptainRepick: false,
    teamAPlayers: [] as PlayerSlot[],
    teamBPlayers: [] as PlayerSlot[],
    teamALibero: [] as DisplayPlayerSlot[],
    teamAMainGrid: [] as DisplayPlayerSlot[][],
    teamBLibero: [] as DisplayPlayerSlot[],
    teamBMainGrid: [] as DisplayPlayerSlot[][],
    safePadTop: "0px",
    safePadRight: "0px",
    safePadBottom: "0px",
    safePadLeft: "0px",
    rotateFlyItems: [] as RotateFlyItem[],
    showCaptainPicker: false,
    captainPickerTitle: "",
    captainPickerTeam: "A" as CaptainPickerTeam,
    captainPickerMainGrid: [] as DisplayPlayerSlot[][],
    captainPickerLibero: [] as DisplayPlayerSlot[],
    captainPickerSelectedNo: "",
  },

  onLoad(options: Record<string, string>) {
    const roomId = String((options && options.roomId) || "");
    if (!roomId) {
      wx.reLaunch({ url: "/pages/create-room/create-room" });
      return;
    }
    this.setData({ roomId: roomId });
    this.syncSafePadding();
    if ((wx as any).onWindowResize) {
      (wx as any).onWindowResize(this.onWindowResize);
    }
    setTimeout(() => {
      this.syncSafePadding();
    }, 80);
    this.loadRoom();
  },

  onShow() {
    setKeepScreenOnSafe(true);
    this.syncSafePadding();
    setTimeout(() => {
      this.syncSafePadding();
    }, 80);
    setTimeout(() => {
      this.syncSafePadding();
    }, 260);
    this.loadRoom();
  },

  onUnload() {
    this.persistLineupDraftNow().catch(() => {});
    this.clearDraftSaveTimer();
    setKeepScreenOnSafe(false);
    if ((wx as any).offWindowResize) {
      (wx as any).offWindowResize(this.onWindowResize);
    }
  },

  onHide() {
    this.persistLineupDraftNow().catch(() => {});
    setKeepScreenOnSafe(false);
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
    const aRows = buildTeamRows(teamAPlayers);
    const bRows = buildTeamRows(teamBPlayers);
    this.setData({
      teamAPlayers: teamAPlayers,
      teamBPlayers: teamBPlayers,
      isSwapped: isSwapped,
      teamALibero: aRows.libero,
      teamAMainGrid: buildMainGridByOrder(teamAPlayers, getMainOrderForTeam("A", teamASide)),
      teamBLibero: bRows.libero,
      teamBMainGrid: buildMainGridByOrder(teamBPlayers, getMainOrderForTeam("B", teamASide)),
    });
    this.syncCaptainPickState(teamAPlayers, teamBPlayers);
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
          ? "队长" + aInitNo + "不在场上 选择场上队长"
          : "选择场上队长";
    const bText = bAutoLocked
      ? "队长号码 " + nextBCaptainNo
      : bManualMode
        ? "下一局场上队长 " + nextBCaptainNo
        : bInitNo
          ? "队长" + bInitNo + "不在场上 选择场上队长"
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

  async loadRoom() {
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    const room = await getRoomAsync(roomId);
    if (!room) {
      wx.showModal({
        title: "房间已失效",
        content: "该裁判团队不存在或已过期，请重新创建或加入。",
        showCancel: false,
        confirmText: "返回首页",
        success: () => {
          wx.reLaunch({ url: "/pages/create-room/create-room" });
        },
      });
      return;
    }

    const roomSetNo = Math.max(1, Number(room.match && room.match.setNo) || 1);
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
    const initTeamAInitialCaptainNo = canUseDraft
      ? normalizeNumberInput(draft!.teamAInitialCaptainNo || roomTeamACaptain)
      : roomTeamACaptain;
    const initTeamBInitialCaptainNo = canUseDraft
      ? normalizeNumberInput(draft!.teamBInitialCaptainNo || roomTeamBCaptain)
      : roomTeamBCaptain;
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
      },
      () => {
        this.applyDisplay(initTeamAPlayers, initTeamBPlayers, initIsSwapped);
      }
    );
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
      this.applyDisplay(players, this.data.teamBPlayers, this.data.isSwapped);
      this.schedulePersistLineupDraft();
    } else {
      const players = this.data.teamBPlayers.slice();
      const current = players[index];
      if (!current) {
        return;
      }
      players[index] = { pos: current.pos, number: number };
      this.applyDisplay(this.data.teamAPlayers, players, this.data.isSwapped);
      this.schedulePersistLineupDraft();
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
        this.applyDisplay(players, this.data.teamBPlayers, this.data.isSwapped);
      } else {
        this.applyDisplay(this.data.teamAPlayers, players, this.data.isSwapped);
      }
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
    }

    if (!current || current === "?") {
      if (team === "A") {
        this.syncCaptainPickState(players, this.data.teamBPlayers);
      } else {
        this.syncCaptainPickState(this.data.teamAPlayers, players);
      }
    } else {
      const duplicateCount = players.filter((p) => normalizeNumberInput(p.number) === current).length;
      if (duplicateCount > 1) {
        showToastHint("球员号码重复");
      }
      if (team === "A") {
        this.syncCaptainPickState(players, this.data.teamBPlayers);
      } else {
        this.syncCaptainPickState(this.data.teamAPlayers, players);
      }
    }
    this.schedulePersistLineupDraft();
  },

  openCaptainPicker(team: TeamCode) {
    const teamASide: TeamCode = this.data.isSwapped ? "B" : "A";
    const players = team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers;
    const teamName = (team === "A" ? this.data.teamAName : this.data.teamBName).trim() || (team === "A" ? "甲" : "乙");
    this.setData({
      showCaptainPicker: true,
      captainPickerTitle: teamName + "队场上队长",
      captainPickerTeam: team,
      captainPickerMainGrid: buildMainGridByOrder(players, getMainOrderForTeam(team, teamASide)),
      captainPickerLibero: buildTeamRows(players).libero,
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

  async onContinueTap() {
    const teamAName = (this.data.teamAName || "").trim() || "甲";
    const teamBName = (this.data.teamBName || "").trim() || "乙";
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

    if (!this.data.teamACaptainResolved || !this.data.teamBCaptainResolved) {
      wx.showModal({
        title: "无法继续",
        content: "请先为两队确定下一局场上队长后再继续。",
        showCancel: false,
        confirmText: "知道了",
      });
      return;
    }
    this.setData({ continueBtnFx: true });
    const roomId = String(this.data.roomId || "");
    if (roomId) {
      await updateRoomAsync(roomId, (room) => {
        room.teamA.players = this.data.teamAPlayers.slice();
        room.teamB.players = this.data.teamBPlayers.slice();
        (room.match as any).teamACurrentCaptainNo = this.data.teamACaptainNo;
        (room.match as any).teamBCurrentCaptainNo = this.data.teamBCaptainNo;
        // 点击“继续比赛 启动计时”返回比赛页时，立刻启动下一局计时。
        if (
          room.match &&
          !room.match.isFinished &&
          Number(room.match.aScore || 0) === 0 &&
          Number(room.match.bScore || 0) === 0
        ) {
          (room.match as any).setTimerStartAt = Date.now();
          (room.match as any).setTimerElapsedMs = 0;
        }
        room.match.isSwapped = this.data.isSwapped;
        room.match.servingTeam = this.data.servingTeam;
        delete (room.match as any).lineupAdjustDraft;
        return room;
      });
    }
    setTimeout(() => {
      this.setData({ continueBtnFx: false });
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 });
        return;
      }
      wx.reLaunch({ url: "/pages/create-room/create-room" });
    }, 150);
  },

  onBackTap() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: "/pages/create-room/create-room" });
  },

  onBackPress() {
    return true;
  },

  async onRotateTeam(e: WechatMiniprogram.TouchEvent) {
    const team = String((e.currentTarget.dataset as { team?: string }).team || "") as TeamCode;
    if (team !== "A" && team !== "B") {
      return;
    }
    const beforeRects = await this.measureTeamMainPosRects(team);
    const beforeNoMap = this.getTeamMainNumberMap(team);
    if (team === "A") {
      if (this.data.hideTeamAMainNumbers) {
        return;
      }
      const rotated = rotateTeamByRule(this.data.teamAPlayers);
      this.applyDisplay(rotated, this.data.teamBPlayers, this.data.isSwapped);
      this.schedulePersistLineupDraft();
      await this.playTeamRotateMotion("A", beforeRects, beforeNoMap, this.data.teamACaptainNo);
    } else {
      if (this.data.hideTeamBMainNumbers) {
        return;
      }
      const rotated = rotateTeamByRule(this.data.teamBPlayers);
      this.applyDisplay(this.data.teamAPlayers, rotated, this.data.isSwapped);
      this.schedulePersistLineupDraft();
      await this.playTeamRotateMotion("B", beforeRects, beforeNoMap, this.data.teamBCaptainNo);
    }
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
        query.select(base + " .player-input.pos-" + pos).boundingClientRect();
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
