import {
  updateRoomAsync,
  forcePullRoomAsync,
  getRoom,
  getRoomAsync,
  getRoomExistenceFromServerAsync,
  heartbeatRoomAsync,
  leaveRoomAsync,
  subscribeRoomWatch,
  getRoomOwnerClientId,
  getRoomOperatorClientId,
  getRoomControlRole,
  transferRoomOperatorAsync,
  TEAM_COLOR_OPTIONS,
} from "../../utils/room-service";
import { showBlockHint, showToastHint } from "../../utils/hint";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";
import { getMainOrderForTeam, type MainPosition, type TeamCode } from "../../utils/lineup-order";
import { computeLandscapeSafePad } from "../../utils/safe-pad";
import { buildJoinSharePath, buildShareCardTitle, SHARE_IMAGE_URL, showMiniProgramShareMenu } from "../../utils/share";

type Position = "I" | "II" | "III" | "IV" | "V" | "VI" | "L1" | "L2";
type PlayerSlot = {
  pos: Position;
  number: string;
  isLibero?: boolean;
  liberoTag?: "L1" | "L2" | "";
};
type MatchLogItem = {
  id: string;
  ts: number;
  action: string;
  team: TeamCode | "";
  note: string;
  setNo?: number;
  opId?: string;
  revertedOpId?: string;
};
type DisplayLogItem = MatchLogItem & { timeText: string };
type SubRecordRow = {
  index: number;
  text: string;
  mainText: string;
  hasSwap: boolean;
  upText: string;
  downText: string;
  upNoText: string;
  upMarker: string;
  downNoText: string;
  downMarker: string;
};
type SubRecordSummary = {
  normal: SubRecordRow[];
  special: SubRecordRow[];
  libero: SubRecordRow[];
  specialLibero: SubRecordRow[];
  punishSet: SubRecordRow[];
  punishMatch: SubRecordRow[];
};
type SpecialBanState = {
  setBanNos: Set<string>;
  matchBanNos: Set<string>;
  matchLockedNos: Set<string>;
};
type NormalSubPair = {
  starterNo: string;
  substituteNo: string;
  closed: boolean;
};
type SubNormalPairBadge = {
  state: "link" | "lock";
  pairNo: string;
};
type SetStartLineupSnapshot = {
  setNo: number;
  teamAPlayers: PlayerSlot[];
  teamBPlayers: PlayerSlot[];
  servingTeam: TeamCode;
  startIsSwapped: boolean;
  endIsSwapped: boolean;
  teamACaptainNo: string;
  teamBCaptainNo: string;
  savedAt: number;
  endedAt: number;
};
type UndoSnapshot = {
  aScore: number;
  bScore: number;
  lastScoringTeam: TeamCode | "";
  teamACurrentCaptainNo: string;
  teamBCurrentCaptainNo: string;
  setTimerStartAt: number;
  setTimerElapsedMs: number;
  servingTeam: TeamCode;
  teamAPlayers: PlayerSlot[];
  teamBPlayers: PlayerSlot[];
  teamALiberoRoster: string[];
  teamBLiberoRoster: string[];
  liberoRosterSetNo: number;
  isSwapped: boolean;
  decidingSetEightHandled: boolean;
  decidingSetEightPending: boolean;
  setNo: number;
  aSetWins: number;
  bSetWins: number;
  isFinished: boolean;
  setSummaries: any;
  liberoReentryLock: any;
  lastActionOpId: string;
};
type TeamRows = {
  libero: PlayerSlot[];
  main: PlayerSlot[];
};
type PlayerDisplayRole = {
  isLibero: boolean;
  liberoTag: "L1" | "L2" | "";
};
type PlayerDisplayRoleMap = Partial<Record<Position, PlayerDisplayRole>>;
type FrontRowLiberoFixCandidate = {
  team: TeamCode;
  frontPos: MainPosition;
  liberoSlotPos: Position;
  liberoNo: string;
  normalNo: string;
};

function isCaptainModeEnabledFromSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") {
    return true;
  }
  return (settings as { captainEnabled?: boolean }).captainEnabled !== false;
}
type LiberoReentryLock = {
  team: TeamCode;
  liberoNo: string;
  setNo: number;
  aScore: number;
  bScore: number;
};
type TeamPosRect = { left: number; top: number; width: number; height: number };
type TeamRectMap = Partial<Record<MainPosition, TeamPosRect>>;
type TeamMainNoMap = Partial<Record<MainPosition, string>>;
type RotateFlyItem = {
  id: string;
  team: TeamCode;
  number: string;
  isCurrentCaptain: boolean;
  isInitialCaptain: boolean;
  isLibero: boolean;
  targetIsLibero: boolean;
  fadeOldToNew: boolean;
  style: string;
};
type RotateStep = {
  team: TeamCode;
  reverse: boolean;
};
type RotateDirectionHint = "forward" | "reverse" | "";
type ConnState = "online" | "reconnecting" | "offline";
type MatchFlowMode = "normal" | "edit_players" | "between_sets";
type MatchFlowReturnState = "prestart" | "playing";
type FlowSwitchScope = "none" | "top_all" | "score_only";
type CaptainConfirmReason = "prestart" | "post_edit" | "post_sub";
type SubRecordTab = "normal" | "special" | "libero";
type CaptainConfirmOpenOptions = {
  showCancel?: boolean;
  scopedTeam?: "" | TeamCode;
  switchFromSubPanel?: boolean;
};
type SubstitutionDraftSnapshot = {
  roomId: string;
  setNo: number;
  panelOpen: boolean;
  team: TeamCode;
  mode: "normal" | "special";
  reason: "injury" | "penalty_set" | "penalty_match" | "other";
  normalPenalty: "none" | "penalty_set" | "penalty_match";
  selectedPos: "" | Position;
  incomingNoInput: string;
  incomingNo: string;
  incomingLocked: boolean;
  incomingLockedNo: string;
  savedAt: number;
};

const ALL_POSITIONS: Position[] = ["I", "II", "III", "IV", "V", "VI", "L1", "L2"];
const MAIN_POSITIONS: MainPosition[] = ["I", "II", "III", "IV", "V", "VI"];
const BACK_ROW_POSITIONS: MainPosition[] = ["I", "VI", "V"];
const FRONT_ROW_POSITIONS: MainPosition[] = ["II", "III", "IV"];
const LIBERO_POSITIONS: Position[] = ["L1", "L2"];
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
const CONN_RECONNECT_FAILS_ONLINE = 3;
const CONN_OFFLINE_FAILS_ONLINE = 5;
const CONN_OFFLINE_FAILS_NONONLINE = 4;
const CONN_WATCHDOG_RECONNECT_MS = 33000;
const CONN_WATCHDOG_OFFLINE_MS = 52000;
const MODAL_ANIM_MS = 180;
const SEG_SWITCH_ANIM_MS = 180;
const SUB_RECORD_SWITCH_ANIM_MS = 320;
const LOCAL_OP_ID_TTL_MS = 10 * 60 * 1000;
const NORMAL_SUB_RETURN_TO_MAIN_HINT = "请将普通球员换回场上6人区再进行普通换人";
const SPECIAL_SUB_NOT_READY_HINT = "当前未满足特殊换人条件";
const SPECIAL_SUB_RESTRICTED_HINT = "当前仅可对符合条件球员执行特殊换人";
const AUTHORITATIVE_ROOM_SYNC_BLOCK_MS = 1200;
const LIBERO_REENTRY_SAME_POINT_HINT = "同一分内该自由人不可再次替换后排球员";
const localOpIdSeenAt = new Map<string, number>();
const SUB_RECORD_TAB_OPTIONS: Array<{ label: string; value: SubRecordTab }> = [
  { label: "普通", value: "normal" },
  { label: "特殊", value: "special" },
  { label: "自由人常规", value: "libero" },
];

function getSubRecordTabIndex(tabRaw: string): number {
  const tab = (tabRaw === "special" || tabRaw === "libero" ? tabRaw : "normal") as SubRecordTab;
  const idx = SUB_RECORD_TAB_OPTIONS.findIndex((item) => item.value === tab);
  return idx >= 0 ? idx : 0;
}

function getSubRecordTabByIndex(indexRaw: number): SubRecordTab {
  const idx = Math.max(0, Math.min(SUB_RECORD_TAB_OPTIONS.length - 1, Number(indexRaw) || 0));
  return SUB_RECORD_TAB_OPTIONS[idx].value;
}

function rememberLocalOpId(opIdRaw: string): void {
  const opId = String(opIdRaw || "");
  if (!opId) {
    return;
  }
  const now = Date.now();
  localOpIdSeenAt.set(opId, now);
  if (localOpIdSeenAt.size <= 300) {
    return;
  }
  localOpIdSeenAt.forEach((seenAt, key) => {
    if (now - seenAt > LOCAL_OP_ID_TTL_MS) {
      localOpIdSeenAt.delete(key);
    }
  });
}

function isRecentLocalOpId(opIdRaw: string): boolean {
  const opId = String(opIdRaw || "");
  if (!opId) {
    return false;
  }
  const seenAt = localOpIdSeenAt.get(opId);
  if (!seenAt) {
    return false;
  }
  if (Date.now() - seenAt > LOCAL_OP_ID_TTL_MS) {
    localOpIdSeenAt.delete(opId);
    return false;
  }
  return true;
}

function isPosition(input: string): input is Position {
  return ALL_POSITIONS.indexOf(input as Position) >= 0;
}

function isLiberoPosition(pos: Position): boolean {
  return LIBERO_POSITIONS.indexOf(pos) >= 0;
}

function isBackRowPosition(pos: Position): pos is MainPosition {
  return BACK_ROW_POSITIONS.indexOf(pos as MainPosition) >= 0;
}

function getPlayerByPos(players: PlayerSlot[], pos: Position): PlayerSlot | null {
  const found = (players || []).find((p) => p.pos === pos);
  return found || null;
}

function ensureTeamPlayerOrder(players: PlayerSlot[]): PlayerSlot[] {
  const byPos: Record<string, PlayerSlot> = {};
  (players || []).forEach((p) => {
    byPos[p.pos] = p;
  });
  return ALL_POSITIONS.map((pos) => {
    const slot = byPos[pos];
    return {
      pos: pos,
      number: slot ? String(slot.number || "?") : "?",
    };
  });
}

function getLiberoRosterFromPlayers(players: PlayerSlot[]): string[] {
  const l1 = normalizeNumberInput((getPlayerByPos(players, "L1") || { number: "" }).number);
  const l2 = normalizeNumberInput((getPlayerByPos(players, "L2") || { number: "" }).number);
  const roster: string[] = [];
  if (l1) {
    roster.push(l1);
  }
  if (l2 && roster.indexOf(l2) < 0) {
    roster.push(l2);
  }
  return roster;
}

function ensureLiberoRosterForCurrentSet(room: any): void {
  if (!room || !room.match || !room.teamA || !room.teamB) {
    return;
  }
  const match = (room.match || {}) as any;
  const currentSetNo = Math.max(1, Number(match.setNo || 1));
  const rosterSetNo = Math.max(0, Number(match.liberoRosterSetNo || 0));
  const playersA = ensureTeamPlayerOrder(room && room.teamA && room.teamA.players ? room.teamA.players : []);
  const playersB = ensureTeamPlayerOrder(room && room.teamB && room.teamB.players ? room.teamB.players : []);
  const rosterCapA = getTeamLiberoCapacityForCurrentSet(room, "A");
  const rosterCapB = getTeamLiberoCapacityForCurrentSet(room, "B");
  const rosterA = reconcileLiberoRosterWithPlayers(playersA, match.teamALiberoRoster).slice(0, rosterCapA);
  const rosterB = reconcileLiberoRosterWithPlayers(playersB, match.teamBLiberoRoster).slice(0, rosterCapB);
  if (rosterSetNo === currentSetNo && Array.isArray(match.teamALiberoRoster) && Array.isArray(match.teamBLiberoRoster)) {
    // 同局内也做一次纠偏，避免历史脏数据导致自由人身份丢失。
    match.teamALiberoRoster = rosterA;
    match.teamBLiberoRoster = rosterB;
    return;
  }
  // 同一场比赛跨局时优先沿用已存在的自由人名单，避免在自由人处于6人区时被错误重建为普通球员号码。
  match.teamALiberoRoster =
    rosterA.length > 0
      ? rosterA
      : reconcileLiberoRosterWithPlayers(playersA, getLiberoRosterFromPlayers(playersA)).slice(0, rosterCapA);
  match.teamBLiberoRoster =
    rosterB.length > 0
      ? rosterB
      : reconcileLiberoRosterWithPlayers(playersB, getLiberoRosterFromPlayers(playersB)).slice(0, rosterCapB);
  match.liberoRosterSetNo = currentSetNo;
}

function countLiberoInMain(players: PlayerSlot[], liberoRoster: string[]): number {
  const rosterSet = new Set((liberoRoster || []).map((n) => normalizeNumberInput(n)).filter(Boolean));
  if (!rosterSet.size) {
    return 0;
  }
  return MAIN_POSITIONS.reduce((count, pos) => {
    const p = getPlayerByPos(players, pos as Position);
    const no = normalizeNumberInput((p && p.number) || "");
    return count + (no && rosterSet.has(no) ? 1 : 0);
  }, 0);
}

function countNormalInLiberoSlots(players: PlayerSlot[], liberoRoster: string[]): number {
  const rosterSet = new Set((liberoRoster || []).map((n) => normalizeNumberInput(n)).filter(Boolean));
  return LIBERO_POSITIONS.reduce((count, pos) => {
    const p = getPlayerByPos(players, pos);
    const no = normalizeNumberInput((p && p.number) || "");
    if (!no) {
      return count;
    }
    return count + (rosterSet.has(no) ? 0 : 1);
  }, 0);
}

function normalizeLiberoRosterNumbers(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: string[] = [];
  input.forEach((raw) => {
    const no = normalizeNumberInput(String(raw || ""));
    if (!no || out.indexOf(no) >= 0) {
      return;
    }
    out.push(no);
  });
  return out;
}

function reconcileLiberoRosterWithPlayers(players: PlayerSlot[], rosterRaw: unknown): string[] {
  const ordered = ensureTeamPlayerOrder(players || []);
  const pool = new Set(
    ordered
      .map((p) => normalizeNumberInput(String((p && p.number) || "")))
      .filter(Boolean)
  );
  const fromRoster = normalizeLiberoRosterNumbers(rosterRaw);
  const out: string[] = [];

  // 优先保留名单中且当前确实存在于8人区的号码。
  fromRoster.forEach((no) => {
    if (!no || out.indexOf(no) >= 0) {
      return;
    }
    if (pool.has(no)) {
      out.push(no);
    }
  });

  return out.slice(0, 2);
}

function getLiberoRosterSlotIndex(
  players: PlayerSlot[],
  liberoRoster: string[],
  selectedPos: Position,
  downNoRaw: string
): number {
  const displayed = markDisplayPlayersByLiberoRoster(players || [], liberoRoster || []);
  const selected = getPlayerByPos(displayed, selectedPos);
  if (selected && selected.liberoTag === "L1") {
    return 0;
  }
  if (selected && selected.liberoTag === "L2") {
    return 1;
  }
  if (selectedPos === "L1") {
    return 0;
  }
  if (selectedPos === "L2") {
    return 1;
  }
  const downNo = normalizeSubstituteNumber(downNoRaw);
  if (!downNo) {
    return -1;
  }
  return normalizeLiberoRosterNumbers(liberoRoster || []).findIndex((n) => normalizeSubstituteNumber(n) === downNo);
}

function getTeamLiberoCapacityForCurrentSet(room: any, team: TeamCode): number {
  if (!room || !room.match) {
    return 2;
  }
  const setNo = Math.max(1, Number(room.match.setNo || 1));
  const map = getSetStartLineupsMap(room);
  const snapshot = map[String(setNo)];
  if (!snapshot) {
    return 2;
  }
  const basePlayers = ensureTeamPlayerOrder(team === "A" ? snapshot.teamAPlayers || [] : snapshot.teamBPlayers || []);
  const l1 = normalizeNumberInput(String((getPlayerByPos(basePlayers, "L1") || { number: "" }).number || ""));
  const l2 = normalizeNumberInput(String((getPlayerByPos(basePlayers, "L2") || { number: "" }).number || ""));
  const count = (l1 ? 1 : 0) + (l2 ? 1 : 0);
  if (count >= 2) {
    return 2;
  }
  if (count <= 0) {
    return 1;
  }
  return 1;
}

function getLiberoRosterForTeam(room: any, team: TeamCode, fallbackRoster?: string[]): string[] {
  const match = (room && room.match) || {};
  const key = team === "A" ? "teamALiberoRoster" : "teamBLiberoRoster";
  const rosterCap = getTeamLiberoCapacityForCurrentSet(room, team);
  const players = ensureTeamPlayerOrder(
    team === "A" ? room && room.teamA && room.teamA.players : room && room.teamB && room.teamB.players
  );
  const fromState = reconcileLiberoRosterWithPlayers(players, (match as any)[key]);
  if (fromState.length > 0) {
    return fromState.slice(0, rosterCap);
  }
  const fromFallback = reconcileLiberoRosterWithPlayers(players, fallbackRoster || []);
  if (fromFallback.length > 0) {
    return fromFallback.slice(0, rosterCap);
  }
  return reconcileLiberoRosterWithPlayers(players, getLiberoRosterFromPlayers(players || [])).slice(0, rosterCap);
}

function markDisplayPlayersByLiberoRoster(players: PlayerSlot[], liberoRoster: string[]): PlayerSlot[] {
  const ordered = ensureTeamPlayerOrder(players || []);
  const roster = new Set(normalizeLiberoRosterNumbers(liberoRoster));
  const rosterList = normalizeLiberoRosterNumbers(liberoRoster);
  const l1No = normalizeNumberInput(String((getPlayerByPos(ordered, "L1") || { number: "" }).number || ""));
  const l2No = normalizeNumberInput(String((getPlayerByPos(ordered, "L2") || { number: "" }).number || ""));
  const displayed = ordered.map((p) => {
    const rawNo = String((p && p.number) || "").trim();
    const no = normalizeNumberInput(String((p && p.number) || ""));
    const isLiberoPlaceholder = rawNo === "?" && isLiberoPosition(p.pos as Position);
    const isLibero = (!!no && roster.has(no)) || isLiberoPlaceholder;
    let liberoTag: "L1" | "L2" | "" = "";
    if (isLibero) {
      if (isLiberoPlaceholder && p.pos === "L1") {
        liberoTag = "L1";
      } else if (isLiberoPlaceholder && p.pos === "L2") {
        liberoTag = "L2";
      } else if (no && l1No && no === l1No) {
        liberoTag = "L1";
      } else if (no && l2No && no === l2No) {
        liberoTag = "L2";
      } else if (no && rosterList[0] && no === rosterList[0]) {
        liberoTag = "L1";
      } else if (no && rosterList[1] && no === rosterList[1]) {
        liberoTag = "L2";
      }
    }
    return {
      pos: p.pos,
      number: p.number,
      isLibero: isLibero,
      liberoTag: liberoTag,
    };
  });
  let liberoCount = displayed.reduce((sum, p) => sum + (p && p.isLibero ? 1 : 0), 0);
  if (liberoCount >= 2) {
    return displayed;
  }
  // 兜底：任何异常情况下都保证至少2个自由人样式位，优先补齐 L1/L2。
  const forceFill = (pos: Position, tag: "L1" | "L2"): void => {
    if (liberoCount >= 2) {
      return;
    }
    const idx = displayed.findIndex((item) => item.pos === pos);
    if (idx < 0 || displayed[idx].isLibero) {
      return;
    }
    // 仅在自由人位占位符( ? )时兜底补自由人样式，
    // 避免把“自由人常规换人后下到L位的普通球员”错误渲染为自由人。
    const rawNo = String((displayed[idx] && displayed[idx].number) || "").trim();
    if (rawNo !== "?") {
      return;
    }
    displayed[idx] = {
      ...displayed[idx],
      isLibero: true,
      liberoTag: tag,
    };
    liberoCount += 1;
  };
  forceFill("L1", "L1");
  forceFill("L2", "L2");
  return displayed;
}

function buildDisplayRoleMapFromDisplayedPlayers(players: PlayerSlot[]): PlayerDisplayRoleMap {
  const map: PlayerDisplayRoleMap = {};
  (players || []).forEach((p) => {
    if (!p || !isPosition(p.pos)) {
      return;
    }
    map[p.pos] = {
      isLibero: !!p.isLibero,
      liberoTag: p.liberoTag === "L1" || p.liberoTag === "L2" ? p.liberoTag : "",
    };
  });
  return map;
}

function applyDisplayRoleMapByPos(players: PlayerSlot[], roleMap: PlayerDisplayRoleMap): PlayerSlot[] {
  const ordered = ensureTeamPlayerOrder(players || []);
  return ordered.map((p) => {
    const role = roleMap[p.pos];
    const fallbackIsLibero = isLiberoPosition(p.pos);
    const fallbackTag: "L1" | "L2" | "" = fallbackIsLibero ? (p.pos === "L1" ? "L1" : "L2") : "";
    return {
      pos: p.pos,
      number: p.number,
      isLibero: role ? !!role.isLibero : fallbackIsLibero,
      liberoTag: role ? role.liberoTag : fallbackTag,
    };
  });
}

function buildLiberoRosterSet(input: string[]): Set<string> {
  return new Set(normalizeLiberoRosterNumbers(input || []));
}

function validateLiberoSwapByRule(
  players: PlayerSlot[],
  liberoRoster: string[],
  fromPos: Position,
  toPos: Position
): string {
  const roster = normalizeLiberoRosterNumbers(liberoRoster || []);
  if (!roster.length) {
    return "未配置自由人号码";
  }
  const teamPlayers = ensureTeamPlayerOrder(players || []);
  const fromSlot = getPlayerByPos(teamPlayers, fromPos);
  const toSlot = getPlayerByPos(teamPlayers, toPos);
  if (!fromSlot || !toSlot) {
    return "球员位置异常";
  }
  const fromNo = normalizeNumberInput(fromSlot.number || "");
  const toNo = normalizeNumberInput(toSlot.number || "");
  if (!fromNo || !toNo) {
    return "号码未填写，无法替换";
  }
  const fromIsLibero = isLiberoPosition(fromPos);
  const toIsLibero = isLiberoPosition(toPos);
  if (fromIsLibero === toIsLibero) {
    return "自由人常规换人需在场上与自由人区之间进行";
  }
  const mainPos = (fromIsLibero ? toPos : fromPos) as Position;
  if (!isBackRowPosition(mainPos)) {
    const mainSlot = getPlayerByPos(teamPlayers, mainPos);
    const mainNo = normalizeNumberInput(String((mainSlot && mainSlot.number) || ""));
    if (!mainNo || roster.indexOf(mainNo) < 0) {
      return "自由人仅可与后排球员替换";
    }
  }
  if (roster.indexOf(fromNo) < 0 && roster.indexOf(toNo) < 0) {
    return "当前操作未涉及自由人";
  }
  const nextPlayers = ensureTeamPlayerOrder(teamPlayers);
  const fromIdx = nextPlayers.findIndex((p) => p.pos === fromPos);
  const toIdx = nextPlayers.findIndex((p) => p.pos === toPos);
  if (fromIdx < 0 || toIdx < 0) {
    return "球员位置异常";
  }
  const tmpNo = nextPlayers[fromIdx].number;
  nextPlayers[fromIdx].number = nextPlayers[toIdx].number;
  nextPlayers[toIdx].number = tmpNo;
  const liberoInMainCount = countLiberoInMain(nextPlayers, roster);
  const normalInLiberoCount = countNormalInLiberoSlots(nextPlayers, roster);
  if (liberoInMainCount > 1 || normalInLiberoCount > 1) {
    return "同一时刻仅允许1名自由人在场";
  }
  return "";
}

function buildSwapTargetMainPositions(players: PlayerSlot[], liberoRoster: string[], sourcePos: Position): MainPosition[] {
  if (!isLiberoPosition(sourcePos)) {
    return [];
  }
  return MAIN_POSITIONS.filter((pos) => !validateLiberoSwapByRule(players, liberoRoster, sourcePos, pos));
}

function buildSwapTargetLiberoPositions(players: PlayerSlot[], liberoRoster: string[], sourcePos: Position): Position[] {
  if (isLiberoPosition(sourcePos)) {
    return [];
  }
  return LIBERO_POSITIONS.filter((pos) => !validateLiberoSwapByRule(players, liberoRoster, sourcePos, pos));
}

function findFrontRowLiberoFixCandidate(
  room: any,
  team: TeamCode,
  fallbackRoster: string[]
): FrontRowLiberoFixCandidate | null {
  const teamObj = team === "A" ? room && room.teamA : room && room.teamB;
  const players = ensureTeamPlayerOrder((teamObj && teamObj.players) || []);
  const roster = getLiberoRosterForTeam(room, team, fallbackRoster || []);
  const rosterSet = buildLiberoRosterSet(roster);
  if (!rosterSet.size) {
    return null;
  }
  const frontPos = FRONT_ROW_POSITIONS.find((pos) => {
    const slot = getPlayerByPos(players, pos as Position);
    const no = normalizeNumberInput(String((slot && slot.number) || ""));
    return !!no && rosterSet.has(no);
  });
  if (!frontPos) {
    return null;
  }
  const frontSlot = getPlayerByPos(players, frontPos as Position);
  const frontNo = normalizeNumberInput(String((frontSlot && frontSlot.number) || ""));
  if (!frontNo) {
    return null;
  }
  const liberoSlotPos =
    LIBERO_POSITIONS.find((pos) => {
      const slot = getPlayerByPos(players, pos);
      const no = normalizeNumberInput(String((slot && slot.number) || ""));
      return !!no && !rosterSet.has(no);
    }) || "";
  if (!liberoSlotPos) {
    return null;
  }
  const liberoSlot = getPlayerByPos(players, liberoSlotPos as Position);
  const normalNo = normalizeNumberInput(String((liberoSlot && liberoSlot.number) || ""));
  if (!normalNo) {
    return null;
  }
  return {
    team: team,
    frontPos: frontPos,
    liberoSlotPos: liberoSlotPos as Position,
    liberoNo: frontNo,
    normalNo: normalNo,
  };
}

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
  const shouldLog = String(noteSuffix || "") !== "轮转";
  if (team === "A") {
    room.teamA.players = rotateTeamByRule(room.teamA.players);
    if (shouldLog) {
      appendMatchLog(room, "rotate", room.teamA.name + " " + noteSuffix, "A");
    }
    return;
  }
  room.teamB.players = rotateTeamByRule(room.teamB.players);
  if (shouldLog) {
    appendMatchLog(room, "rotate", room.teamB.name + " " + noteSuffix, "B");
  }
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
  if (room.match.decidingSetEightHandled) {
    return false;
  }
  return Math.max(room.match.aScore, room.match.bScore) >= 8;
}

function isDecidingSetEightPending(room: any): boolean {
  return !!(room && room.match && (room.match as any).decidingSetEightPending);
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

function createLogId(): string {
  return String(Date.now()) + "-" + String(Math.floor(Math.random() * 100000));
}

function isNumberOnCourt(players: PlayerSlot[], number: string): boolean {
  const target = normalizeNumberInput(number);
  if (!target) {
    return false;
  }
  return (players || []).some((p) => normalizeNumberInput(p.number) === target);
}

function isNumberInMain(players: PlayerSlot[], number: string): boolean {
  const target = normalizeNumberInput(number);
  if (!target) {
    return false;
  }
  return (players || []).some((p) => MAIN_POSITIONS.indexOf(p.pos as MainPosition) >= 0 && normalizeNumberInput(p.number) === target);
}

function pad2(n: number): string {
  return n < 10 ? "0" + String(n) : String(n);
}

function formatLogTime(ts: number): string {
  const d = new Date(ts);
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function escapeRegExp(input: string): string {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSetNoFromNote(note: string): number | null {
  const m = String(note || "").match(/第\s*(\d+)\s*局/);
  if (!m) {
    return null;
  }
  return Math.max(1, Number(m[1]) || 1);
}

function normalizeSwapSymbolText(text: string): string {
  return String(text || "")
    .replace(/\uFE0F/g, "")
    .replace(/\u2194\uFE0F/g, "\u2194")
    .replace(/自由人替换/g, "自由人常规换人")
    .replace(/特殊自由人换人/g, "自由人特殊换人");
}

function normalizeLogsBySet(logs: MatchLogItem[]): MatchLogItem[] {
  let cursorSetNo = 1;
  return (logs || []).map((item, idx) => {
    const action = String(item && item.action ? item.action : "");
    const note = normalizeSwapSymbolText(String(item && item.note ? item.note : ""));
    const explicitSetNo = Number((item as any).setNo) || 0;
    const noteSetNo = extractSetNoFromNote(note);
    let resolvedSetNo = explicitSetNo > 0 ? Math.max(1, explicitSetNo) : 0;
    if (!resolvedSetNo) {
      if (action === "next_set" && noteSetNo) {
        resolvedSetNo = Math.max(1, noteSetNo - 1);
      } else if (noteSetNo) {
        resolvedSetNo = Math.max(1, noteSetNo);
      } else {
        resolvedSetNo = cursorSetNo;
      }
    }
    if (action === "next_set" && noteSetNo) {
      cursorSetNo = Math.max(cursorSetNo, noteSetNo);
    } else {
      cursorSetNo = Math.max(cursorSetNo, resolvedSetNo);
    }
    return {
      id: String(item && item.id ? item.id : "log-" + idx),
      ts: Number(item && item.ts) || Date.now(),
      action: String(item && item.action ? item.action : "unknown"),
      team: item && (item.team === "A" || item.team === "B") ? item.team : "",
      note: note,
      setNo: resolvedSetNo,
      opId: String((item as any).opId || ""),
      revertedOpId: String((item as any).revertedOpId || ""),
    };
  });
}

function withTeamSuffixForDisplay(noteRaw: string, teamANameRaw: string, teamBNameRaw: string): string {
  let note = normalizeSwapSymbolText(noteRaw);
  const names = [String(teamANameRaw || "").trim(), String(teamBNameRaw || "").trim()].filter(Boolean);
  names.forEach((name) => {
    const esc = escapeRegExp(name);
    note = note.replace(new RegExp(esc + "(?!队)(\\s*胜)", "g"), name + "队$1");
    note = note.replace(new RegExp(esc + "(?!队)(\\s*暂停)", "g"), name + "队$1");
    note = note.replace(new RegExp(esc + "(?!队)(\\s*暂停结束)", "g"), name + "队$1");
    note = note.replace(new RegExp(esc + "(?!队)(\\s*结束暂停)", "g"), name + "队$1");
    note = note.replace(new RegExp(esc + "(?!队)(\\s*\\+1)", "g"), name + "队$1");
    note = note.replace(new RegExp(esc + "(?!队)(\\s*-1\\s*比分撤回)", "g"), name + "队$1");
    note = note.replace(new RegExp(esc + "(?!队)(\\s*手动轮转)", "g"), name + "队$1");
    note = note.replace(new RegExp(esc + "(?!队)(\\s*撤回手动轮转)", "g"), name + "队$1");
    note = note.replace(new RegExp(esc + "(?!队)(\\s*撤回手动换边)", "g"), name + "队$1");
    note = note.replace(new RegExp("比赛结束\\s*结果确认：" + esc + "(?!队)", "g"), "比赛结束 结果确认：" + name + "队");
    note = note.replace(new RegExp("第\\s*\\d+\\s*局结束：" + esc + "(?!队)", "g"), (full) => full + "队");
  });
  return note;
}

function getNormalPenaltyLabelForOperationLog(actionRaw: string, noteRaw: string): string {
  const action = String(actionRaw || "");
  const note = String(noteRaw || "");
  if (action === "sub_normal_penalty_set" || note.indexOf("本局禁赛") >= 0) {
    return "本局禁赛";
  }
  if (action === "sub_normal_penalty_match" || note.indexOf("全场禁赛") >= 0) {
    return "全场禁赛";
  }
  return "";
}

function formatOperationLogNoteForDisplay(actionRaw: string, noteRaw: string): string {
  const action = String(actionRaw || "");
  const normalized = normalizeSwapSymbolText(String(noteRaw || ""));
  const teamMatch = normalized.match(/^\s*(.+?队)\s*(.+)?$/);
  const teamPrefix = teamMatch && teamMatch[1] ? String(teamMatch[1]) + " " : "";
  const body = teamMatch && teamMatch[2] ? String(teamMatch[2]) : normalized;

  const isLiberoNormal = action === "libero_swap" || body.indexOf("自由人常规换人") >= 0 || body.indexOf("自由人普通换人") >= 0;
  if (isLiberoNormal) {
    const parsedLibero = parseLiberoSwapRecordText(normalized);
    const detail = parsedLibero
      ? buildDirectionalSubRecordText(
          parsedLibero.upNo,
          parsedLibero.downNo,
          parsedLibero.upIsLibero,
          parsedLibero.downIsLibero
        )
      : String(body || "").replace(/自由人常规换人|自由人普通换人/g, "").trim();
    return (teamPrefix + "自由人常规换人" + (detail ? " " + detail : "")).replace(/\s{2,}/g, " ").trim();
  }

  const isSpecial =
    action.indexOf("sub_special") === 0 ||
    body.indexOf("特殊换人") >= 0 ||
    body.indexOf("自由人特殊换人") >= 0 ||
    body.indexOf("特殊自由人换人") >= 0;
  if (isSpecial) {
    const parsedSpecialLibero = parseSpecialLiberoRecordText(normalized);
    const parsedGeneric = parseGenericSubRecordText(normalized);
    const detail = parsedSpecialLibero
      ? buildSpecialLiberoRecordText(parsedSpecialLibero.upNo, parsedSpecialLibero.downNo)
      : parsedGeneric
        ? buildSubRecordDetailText(parsedGeneric.upNo, parsedGeneric.downNo, parsedGeneric.downIsLibero)
        : String(body || "")
            .replace(/自由人特殊换人|特殊自由人换人|特殊换人/g, "")
            .replace(/伤病|本局禁赛|全场禁赛|其他/g, "")
            .trim();
    return (teamPrefix + "特殊换人" + (detail ? " " + detail : ""))
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const isNormal =
    action === "sub_normal" ||
    action === "sub_normal_penalty_set" ||
    action === "sub_normal_penalty_match" ||
    action === "substitution_normal" ||
    body.indexOf("普通换人") >= 0;
  if (isNormal) {
    const penalty = getNormalPenaltyLabelForOperationLog(action, body);
    const parsed = parseGenericSubRecordText(normalized);
    const detail = parsed
      ? buildSubRecordDetailText(parsed.upNo, parsed.downNo, parsed.downIsLibero)
      : String(body || "").replace(/普通换人/g, "").replace(/本局禁赛|全场禁赛/g, "").trim();
    return (
      teamPrefix +
      "普通换人" +
      (penalty ? "（" + penalty + "）" : "") +
      (detail ? " " + detail : "")
    )
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return normalized;
}

function normalizeSubstituteNumber(value: string): string {
  const digits = normalizeNumberInput(value);
  if (!digits) {
    return "";
  }
  return String(Number(digits));
}

function buildSubRecordText(upNoRaw: string, downNoRaw: string): string {
  const upNo = normalizeSubstituteNumber(upNoRaw) || "?";
  const downNo = normalizeSubstituteNumber(downNoRaw) || "?";
  return "↑" + upNo + " ↓" + downNo;
}

function buildDirectionalSubRecordText(
  upNoRaw: string,
  downNoRaw: string,
  upIsLibero = false,
  downIsLibero = false
): string {
  const upNo = normalizeSubstituteNumber(upNoRaw) || "?";
  const downNo = normalizeSubstituteNumber(downNoRaw) || "?";
  return "↑" + upNo + (upIsLibero ? "（自）" : "") + " ↓" + downNo + (downIsLibero ? "（自）" : "");
}

function buildSubRecordDetailText(upNoRaw: string, downNoRaw: string, downIsLibero = false): string {
  const upNo = normalizeSubstituteNumber(upNoRaw) || "?";
  const downNo = normalizeSubstituteNumber(downNoRaw) || "?";
  return "↑" + upNo + " ↓" + downNo + (downIsLibero ? "（自）" : "");
}

function buildSpecialLiberoRecordText(upNoRaw: string, downNoRaw: string): string {
  const upNo = normalizeSubstituteNumber(upNoRaw) || "?";
  const downNo = normalizeSubstituteNumber(downNoRaw) || "?";
  return "↑" + upNo + "（自） ↓" + downNo + "（自）";
}

function appendSubRecordRow(rows: string[], text: string): void {
  const line = String(text || "").trim();
  if (!line) {
    return;
  }
  rows.push(line);
}

function parseSubRecordRowText(textRaw: string): {
  mainText: string;
  hasSwap: boolean;
  upText: string;
  downText: string;
  upNoText: string;
  upMarker: string;
  downNoText: string;
  downMarker: string;
} {
  const splitLiberoMarker = (valueRaw: string): { noText: string; marker: string } => {
    const value = String(valueRaw || "").trim();
    if (!value) {
      return { noText: "", marker: "" };
    }
    const match = value.match(/^([0-9?]{1,2})\s*(?:[（(]?\s*自\s*[）)]?)?$/);
    if (match) {
      const marker = /[（(]?\s*自\s*[）)]?/.test(value.replace(match[1], "")) ? "自" : "";
      return {
        noText: String(match[1] || "").trim(),
        marker,
      };
    }
    return {
      noText: value.replace(/[（(]?\s*自\s*[）)]?/g, "").trim(),
      marker: /[（(]?\s*自\s*[）)]?/.test(value) ? "自" : "",
    };
  };
  const text = normalizeSwapSymbolText(String(textRaw || "")).replace(/\s+/g, " ").trim();
  const swapMatch = text.match(/↑\s*([0-9?]{1,2}(?:[（(]?\s*自\s*[）)]?)?)\s*↓\s*([0-9?]{1,2}(?:[（(]?\s*自\s*[）)]?)?)/);
  if (!swapMatch) {
    return {
      mainText: text,
      hasSwap: false,
      upText: "",
      downText: "",
      upNoText: "",
      upMarker: "",
      downNoText: "",
      downMarker: "",
    };
  }
  const swapText = String(swapMatch[0] || "");
  const upText = String(swapMatch[1] || "").trim();
  const downText = String(swapMatch[2] || "").trim();
  const upSplit = splitLiberoMarker(upText);
  const downSplit = splitLiberoMarker(downText);
  return {
    mainText: text.replace(swapText, "").trim(),
    hasSwap: true,
    upText,
    downText,
    upNoText: upSplit.noText,
    upMarker: upSplit.marker,
    downNoText: downSplit.noText,
    downMarker: downSplit.marker,
  };
}

function parseGenericSubRecordText(noteRaw: string): { upNo: string; downNo: string; downIsLibero: boolean } | null {
  const note = normalizeSwapSymbolText(noteRaw);
  const direct = note.match(/↑\s*(\d{1,2})\s*↓\s*(\d{1,2})\s*(（自）)?/);
  if (direct) {
    return {
      upNo: normalizeSubstituteNumber(direct[1]),
      downNo: normalizeSubstituteNumber(direct[2]),
      downIsLibero: !!direct[3],
    };
  }
  return null;
}

function parseLiberoSwapRecordText(noteRaw: string): {
  normalNo: string;
  liberoNo: string;
  upNo: string;
  downNo: string;
  upIsLibero: boolean;
  downIsLibero: boolean;
} | null {
  const note = normalizeSwapSymbolText(noteRaw);
  const arrowMatch = note.match(/自由人(?:常规|普通)换人\s*↑\s*(\d{1,2})\s*(（自）)?\s*↓\s*(\d{1,2})\s*(（自）)?/);
  if (arrowMatch) {
    const normalNo = normalizeSubstituteNumber(arrowMatch[1]);
    const maybeUpMarker = !!arrowMatch[2];
    const maybeDownNo = normalizeSubstituteNumber(arrowMatch[3]);
    const maybeDownMarker = !!arrowMatch[4];
    if (normalNo && maybeDownNo) {
      const upNo = normalNo;
      const downNo = maybeDownNo;
      let upIsLibero = maybeUpMarker;
      let downIsLibero = maybeDownMarker;
      if (!upIsLibero && !downIsLibero) {
        // 兼容历史日志：默认视为“↓ 是自由人”。
        downIsLibero = true;
      }
      const liberoNo = upIsLibero && !downIsLibero ? upNo : downNo;
      const resolvedNormalNo = upIsLibero && !downIsLibero ? downNo : upNo;
      return {
        normalNo: resolvedNormalNo,
        liberoNo: liberoNo,
        upNo,
        downNo,
        upIsLibero,
        downIsLibero,
      };
    }
  }
  const markerMatch = note.match(/自由人常规换人\s*(\d{1,2})\s*(（自）)?\s*↔\s*(\d{1,2})\s*(（自）)?/);
  if (markerMatch) {
    const leftNo = normalizeSubstituteNumber(markerMatch[1]);
    const rightNo = normalizeSubstituteNumber(markerMatch[3]);
    const leftIsLibero = !!markerMatch[2];
    const rightIsLibero = !!markerMatch[4];
    if (leftNo && rightNo) {
      if (leftIsLibero && !rightIsLibero) {
        return {
          normalNo: rightNo,
          liberoNo: leftNo,
          upNo: rightNo,
          downNo: leftNo,
          upIsLibero: false,
          downIsLibero: true,
        };
      }
      if (!leftIsLibero && rightIsLibero) {
        return {
          normalNo: leftNo,
          liberoNo: rightNo,
          upNo: leftNo,
          downNo: rightNo,
          upIsLibero: false,
          downIsLibero: true,
        };
      }
      return {
        normalNo: leftNo,
        liberoNo: rightNo,
        upNo: leftNo,
        downNo: rightNo,
        upIsLibero: false,
        downIsLibero: true,
      };
    }
  }
  const oldStyle = note.match(
    /自由人常规换人\s*([A-Z0-9]+)\s*↔\s*([A-Z0-9]+)\s*[（(]\s*(\d{1,2})\s*↔\s*(\d{1,2})\s*[）)]/
  );
  if (oldStyle) {
    const leftPos = String(oldStyle[1] || "").toUpperCase();
    const rightPos = String(oldStyle[2] || "").toUpperCase();
    const leftNo = normalizeSubstituteNumber(oldStyle[3]);
    const rightNo = normalizeSubstituteNumber(oldStyle[4]);
    const leftIsLibero = leftPos === "L1" || leftPos === "L2";
    const rightIsLibero = rightPos === "L1" || rightPos === "L2";
    if (leftNo && rightNo) {
      if (leftIsLibero && !rightIsLibero) {
        return {
          normalNo: rightNo,
          liberoNo: leftNo,
          upNo: rightNo,
          downNo: leftNo,
          upIsLibero: false,
          downIsLibero: true,
        };
      }
      if (!leftIsLibero && rightIsLibero) {
        return {
          normalNo: leftNo,
          liberoNo: rightNo,
          upNo: leftNo,
          downNo: rightNo,
          upIsLibero: false,
          downIsLibero: true,
        };
      }
      return {
        normalNo: leftNo,
        liberoNo: rightNo,
        upNo: leftNo,
        downNo: rightNo,
        upIsLibero: false,
        downIsLibero: true,
      };
    }
  }
  const genericPair = note.match(/自由人常规换人[\s\S]*?(\d{1,2})\s*↔\s*(\d{1,2})/);
  if (genericPair) {
    const leftNo = normalizeSubstituteNumber(genericPair[1]);
    const rightNo = normalizeSubstituteNumber(genericPair[2]);
    if (leftNo && rightNo) {
      return {
        normalNo: leftNo,
        liberoNo: rightNo,
        upNo: leftNo,
        downNo: rightNo,
        upIsLibero: false,
        downIsLibero: true,
      };
    }
  }
  return null;
}

function parseSpecialLiberoRecordText(noteRaw: string): { upNo: string; downNo: string } | null {
  const note = normalizeSwapSymbolText(noteRaw);
  const direct = note.match(/↑\s*(\d{1,2})\s*(（自）)?\s*↓\s*(\d{1,2})\s*(（自）)?/);
  if (!direct) {
    return null;
  }
  const upNo = normalizeSubstituteNumber(direct[1]);
  const downNo = normalizeSubstituteNumber(direct[3]);
  if (!upNo || !downNo) {
    return null;
  }
  return {
    upNo,
    downNo,
  };
}

function isSpecialLiberoSubAction(actionRaw: string): boolean {
  const action = String(actionRaw || "");
  return (
    action === "sub_special_libero" ||
    action === "sub_special_libero_injury" ||
    action === "sub_special_libero_penalty_set" ||
    action === "sub_special_libero_penalty_match" ||
    action === "sub_special_libero_other"
  );
}

function isSpecialLiberoSubNote(noteRaw: string): boolean {
  const note = normalizeSwapSymbolText(noteRaw);
  return note.indexOf("自由人特殊换人") >= 0 || note.indexOf("特殊自由人换人") >= 0;
}

function buildRevertedOpIdSet(logs: MatchLogItem[]): Set<string> {
  const hiddenOpIds = new Set<string>();
  (logs || []).forEach((item) => {
    const action = String(item && item.action ? item.action : "");
    const revertedOpId = String((item as any).revertedOpId || "");
    if (action === "score_undo" && revertedOpId) {
      hiddenOpIds.add(revertedOpId);
    }
  });
  return hiddenOpIds;
}

function isNormalSubstitutionLog(item: MatchLogItem): boolean {
  const action = String(item && item.action ? item.action : "");
  const note = String(item && item.note ? item.note : "");
  return (
    action === "sub_normal" ||
    action === "sub_normal_penalty_set" ||
    action === "sub_normal_penalty_match" ||
    action === "substitution_normal" ||
    note.indexOf("普通换人") >= 0
  );
}

function isTimeoutStartLog(item: MatchLogItem): boolean {
  const action = String(item && item.action ? item.action : "");
  return action === "timeout";
}

function findNthLogOpIdBySetTeam(
  logs: MatchLogItem[],
  setNo: number,
  team: TeamCode,
  nth: number,
  matcher: (item: MatchLogItem) => boolean
): string {
  const targetSet = Math.max(1, Number(setNo || 1));
  const targetNth = Math.max(1, Number(nth || 1));
  const hiddenOpIds = buildRevertedOpIdSet(logs);
  let hit = 0;
  for (let i = 0; i < (logs || []).length; i += 1) {
    const item = logs[i];
    if (!item || item.team !== team) {
      continue;
    }
    const itemSetNo = Math.max(1, Number((item as any).setNo || extractSetNoFromNote(String(item.note || "")) || 1));
    if (itemSetNo !== targetSet) {
      continue;
    }
    const opId = String((item as any).opId || "");
    if (opId && hiddenOpIds.has(opId)) {
      continue;
    }
    if (!matcher(item)) {
      continue;
    }
    hit += 1;
    if (hit === targetNth) {
      return opId;
    }
  }
  return "";
}

function countNormalSubstitutionsBySet(logs: MatchLogItem[], setNo: number, team: TeamCode): number {
  const targetSet = Math.max(1, Number(setNo || 1));
  const hiddenOpIds = buildRevertedOpIdSet(logs);
  let count = 0;
  (logs || []).forEach((item) => {
    if (!item || item.team !== team) {
      return;
    }
    const itemSetNo = Math.max(1, Number((item as any).setNo || extractSetNoFromNote(String(item.note || "")) || 1));
    if (itemSetNo !== targetSet) {
      return;
    }
    const opId = String((item as any).opId || "");
    if (opId && hiddenOpIds.has(opId)) {
      return;
    }
    if (isNormalSubstitutionLog(item)) {
      count += 1;
    }
  });
  return count;
}

function getMatchEntryLockHint(banState: SpecialBanState, numberRaw: string): string {
  const no = normalizeSubstituteNumber(numberRaw);
  if (!no) {
    return "";
  }
  if (banState.matchBanNos.has(no)) {
    return "该号码已被全场禁赛，不能上场";
  }
  if (banState.matchLockedNos.has(no)) {
    return "该号码已执行特殊换人，不能再上场";
  }
  return "";
}

function buildSpecialBanStateBySet(logs: MatchLogItem[], setNo: number, team: TeamCode): SpecialBanState {
  const targetSet = Math.max(1, Number(setNo || 1));
  const hiddenOpIds = buildRevertedOpIdSet(logs);
  const setBanNos = new Set<string>();
  const matchBanNos = new Set<string>();
  const matchLockedNos = new Set<string>();
  (logs || []).forEach((item) => {
    if (!item || item.team !== team) {
      return;
    }
    const opId = String((item as any).opId || "");
    if (opId && hiddenOpIds.has(opId)) {
      return;
    }
    const action = String(item.action || "");
    const note = String(item.note || "");
    const isSpecialLiberoSub = isSpecialLiberoSubAction(action) || isSpecialLiberoSubNote(note);
    const parsed = isSpecialLiberoSub ? parseSpecialLiberoRecordText(note) : parseGenericSubRecordText(note);
    const downNo = normalizeSubstituteNumber(parsed && parsed.downNo ? parsed.downNo : "");
    if (!downNo) {
      return;
    }
    const itemSetNo = Math.max(1, Number((item as any).setNo || extractSetNoFromNote(note) || 1));
    if (
      action === "sub_special" ||
      action === "sub_special_injury" ||
      action === "sub_special_other" ||
      action === "sub_special_penalty_set" ||
      action === "sub_special_penalty_match" ||
      action === "sub_special_libero" ||
      action === "sub_special_libero_injury" ||
      action === "sub_special_libero_other" ||
      action === "sub_special_libero_penalty_set" ||
      action === "sub_special_libero_penalty_match" ||
      action === "substitution_special" ||
      note.indexOf("自由人特殊换人") >= 0 ||
      note.indexOf("特殊自由人换人") >= 0 ||
      note.indexOf("特殊换人") >= 0
    ) {
      matchLockedNos.add(downNo);
      return;
    }
    if (action === "sub_normal_penalty_set" || note.indexOf("本局禁赛") >= 0) {
      if (itemSetNo === targetSet) {
        setBanNos.add(downNo);
      }
      return;
    }
    if (
      action === "sub_normal_penalty_match" ||
      note.indexOf("全场禁赛") >= 0
    ) {
      matchBanNos.add(downNo);
    }
  });
  return {
    setBanNos,
    matchBanNos,
    matchLockedNos,
  };
}

function getLineupBanBlockMessage(
  logs: MatchLogItem[],
  setNo: number,
  team: TeamCode,
  players: PlayerSlot[],
  teamNameRaw: string,
  options?: { includeSetBan?: boolean }
): string {
  const teamName = String(teamNameRaw || (team === "A" ? "甲" : "乙")).trim() || (team === "A" ? "甲" : "乙");
  const includeSetBan = options && options.includeSetBan === false ? false : true;
  const banState = buildSpecialBanStateBySet(logs, setNo, team);
  const seen = new Set<string>();
  for (let i = 0; i < (players || []).length; i += 1) {
    const no = normalizeSubstituteNumber(String((players[i] && players[i].number) || ""));
    if (!no || seen.has(no)) {
      continue;
    }
    seen.add(no);
    if (banState.matchBanNos.has(no)) {
      return teamName + "队 " + no + "号已被全场禁赛，不能进入本局名单";
    }
    if (banState.matchLockedNos.has(no)) {
      return teamName + "队 " + no + "号已执行特殊换人，不能进入本局名单";
    }
    if (includeSetBan && banState.setBanNos.has(no)) {
      return teamName + "队 " + no + "号本局禁赛，不能进入本局名单";
    }
  }
  return "";
}

function validateTeamPlayers(players: PlayerSlot[], teamName: string): string | null {
  const main = (players || []).slice(0, 6);
  const missingMain = main.find((p) => !p.number || p.number === "?");
  if (missingMain) {
    return teamName + "队 " + missingMain.pos + " 位置未填写号码";
  }
  const numbers = (players || [])
    .map((p) => normalizeNumberInput(String(p.number || "")))
    .filter(Boolean);
  const uniq = new Set(numbers);
  if (uniq.size !== numbers.length) {
    return teamName + "队存在重复号码";
  }
  return null;
}

function normalizeLiberoSlots(players: PlayerSlot[]): PlayerSlot[] {
  const next = clonePlayerList(players || []);
  const l1 = next.find((p) => p.pos === "L1");
  const l2 = next.find((p) => p.pos === "L2");
  if (!l1 || !l2) {
    return next;
  }
  const l1No = normalizeNumberInput(l1.number);
  const l2No = normalizeNumberInput(l2.number);
  if (!l1No && l2No) {
    l1.number = l2No;
    l2.number = "?";
  }
  return next;
}

function arePlayersSameByPos(a: PlayerSlot[], b: PlayerSlot[]): boolean {
  const left = ensureTeamPlayerOrder(a || []);
  const right = ensureTeamPlayerOrder(b || []);
  for (let i = 0; i < ALL_POSITIONS.length; i += 1) {
    const pos = ALL_POSITIONS[i];
    const l = left.find((p) => p.pos === pos);
    const r = right.find((p) => p.pos === pos);
    const ln = normalizeNumberInput(String((l && l.number) || ""));
    const rn = normalizeNumberInput(String((r && r.number) || ""));
    if (ln !== rn) {
      return false;
    }
  }
  return true;
}

function toSubRecordRows(lines: string[]): SubRecordRow[] {
  return lines.map((text, idx) => {
    const parsed = parseSubRecordRowText(text);
    return {
      index: idx + 1,
      text: text,
      mainText: parsed.mainText,
      hasSwap: parsed.hasSwap,
      upText: parsed.upText,
      downText: parsed.downText,
      upNoText: parsed.upNoText,
      upMarker: parsed.upMarker,
      downNoText: parsed.downNoText,
      downMarker: parsed.downMarker,
    };
  });
}

function buildNormalSubPairsFromLogs(logs: MatchLogItem[], setNo: number, team: TeamCode): NormalSubPair[] {
  const targetSet = Math.max(1, Number(setNo || 1));
  const hiddenOpIds = buildRevertedOpIdSet(logs);
  const pairs: NormalSubPair[] = [];
  (logs || []).forEach((item) => {
    if (!item || item.team !== team) {
      return;
    }
    const itemSetNo = Math.max(1, Number((item as any).setNo || extractSetNoFromNote(String(item.note || "")) || 1));
    if (itemSetNo !== targetSet) {
      return;
    }
    const opId = String((item as any).opId || "");
    if (opId && hiddenOpIds.has(opId)) {
      return;
    }
    const action = String(item.action || "");
    const note = String(item.note || "");
    const isNormalSub =
      action === "sub_normal" ||
      action === "sub_normal_penalty_set" ||
      action === "sub_normal_penalty_match" ||
      action === "substitution_normal" ||
      note.indexOf("普通换人") >= 0;
    if (!isNormalSub) {
      return;
    }
    const parsed = parseGenericSubRecordText(note);
    if (!parsed) {
      return;
    }
    const upNo = normalizeSubstituteNumber(parsed.upNo);
    const downNo = normalizeSubstituteNumber(parsed.downNo);
    if (!upNo || !downNo) {
      return;
    }
    const pair = pairs.find((p) => p.starterNo === downNo || p.substituteNo === downNo || p.starterNo === upNo || p.substituteNo === upNo);
    if (!pair) {
      pairs.push({
        starterNo: downNo,
        substituteNo: upNo,
        closed: false,
      });
      return;
    }
    if (pair.closed) {
      return;
    }
    if (pair.starterNo === upNo && pair.substituteNo === downNo) {
      pair.closed = true;
    }
  });
  return pairs;
}

function buildSubNormalPairBadgeByPos(
  logs: MatchLogItem[],
  setNo: number,
  team: TeamCode,
  players: PlayerSlot[]
): Partial<Record<Position, SubNormalPairBadge>> {
  const pairs = buildNormalSubPairsFromLogs(logs, setNo, team);
  if (!pairs.length) {
    return {};
  }
  const pairByNo = new Map<string, NormalSubPair>();
  pairs.forEach((pair) => {
    pairByNo.set(pair.starterNo, pair);
    pairByNo.set(pair.substituteNo, pair);
  });
  const out: Partial<Record<Position, SubNormalPairBadge>> = {};
  ensureTeamPlayerOrder(players || []).forEach((slot) => {
    if (!slot || !isPosition(String(slot.pos || ""))) {
      return;
    }
    const pos = slot.pos as Position;
    const no = normalizeSubstituteNumber(String(slot.number || ""));
    if (!no) {
      return;
    }
    const pair = pairByNo.get(no);
    if (!pair) {
      return;
    }
    if (pair.closed) {
      out[pos] = {
        state: "lock",
        pairNo: "",
      };
      return;
    }
    const pairNo = pair.starterNo === no ? pair.substituteNo : pair.starterNo;
    if (!pairNo) {
      return;
    }
    out[pos] = {
      state: "link",
      pairNo: pairNo,
    };
  });
  return out;
}

function buildSpecialPenaltyPairAllowedPosBySet(
  logs: MatchLogItem[],
  setNo: number,
  team: TeamCode,
  players: PlayerSlot[]
): Partial<Record<Position, boolean>> {
  const pairs = buildNormalSubPairsFromLogs(logs, setNo, team);
  if (!pairs.length) {
    return {};
  }
  const banState = buildSpecialBanStateBySet(logs, setNo, team);
  const punishedNos = new Set<string>();
  banState.setBanNos.forEach((no) => {
    const normalized = normalizeSubstituteNumber(no);
    if (normalized) {
      punishedNos.add(normalized);
    }
  });
  banState.matchBanNos.forEach((no) => {
    const normalized = normalizeSubstituteNumber(no);
    if (normalized) {
      punishedNos.add(normalized);
    }
  });
  banState.matchLockedNos.forEach((no) => {
    const normalized = normalizeSubstituteNumber(no);
    if (normalized) {
      punishedNos.add(normalized);
    }
  });
  if (!punishedNos.size) {
    return {};
  }
  const allowedNos = new Set<string>();
  pairs.forEach((pair) => {
    if (!pair || pair.closed) {
      return;
    }
    const starterNo = normalizeSubstituteNumber(pair.starterNo);
    const substituteNo = normalizeSubstituteNumber(pair.substituteNo);
    if (!starterNo || !substituteNo) {
      return;
    }
    if (punishedNos.has(starterNo)) {
      allowedNos.add(substituteNo);
    }
    if (punishedNos.has(substituteNo)) {
      allowedNos.add(starterNo);
    }
  });
  if (!allowedNos.size) {
    return {};
  }
  const out: Partial<Record<Position, boolean>> = {};
  ensureTeamPlayerOrder(players || []).forEach((slot) => {
    if (!slot || !isPosition(String(slot.pos || ""))) {
      return;
    }
    const no = normalizeSubstituteNumber(String(slot.number || ""));
    if (!no) {
      return;
    }
    if (allowedNos.has(no)) {
      out[slot.pos as Position] = true;
    }
  });
  return out;
}

function buildLiberoZoneNormalPlayerAllowedPos(
  players: PlayerSlot[],
  liberoRoster: string[]
): Partial<Record<Position, boolean>> {
  const roster = normalizeLiberoRosterNumbers(liberoRoster || []);
  if (!roster.length) {
    return {};
  }
  const out: Partial<Record<Position, boolean>> = {};
  ensureTeamPlayerOrder(players || []).forEach((slot) => {
    if (!slot || !isLiberoPosition(slot.pos)) {
      return;
    }
    const no = normalizeSubstituteNumber(String(slot.number || ""));
    if (!no || roster.indexOf(no) >= 0) {
      return;
    }
    out[slot.pos as Position] = true;
  });
  return out;
}

function buildClosedNormalPairAllowedPosBySet(
  logs: MatchLogItem[],
  setNo: number,
  team: TeamCode,
  players: PlayerSlot[]
): Partial<Record<Position, boolean>> {
  const pairs = buildNormalSubPairsFromLogs(logs, setNo, team);
  if (!pairs.length) {
    return {};
  }
  const lockedNos = new Set<string>();
  pairs.forEach((pair) => {
    if (!pair || !pair.closed) {
      return;
    }
    const starterNo = normalizeSubstituteNumber(pair.starterNo);
    const substituteNo = normalizeSubstituteNumber(pair.substituteNo);
    if (starterNo) {
      lockedNos.add(starterNo);
    }
    if (substituteNo) {
      lockedNos.add(substituteNo);
    }
  });
  if (!lockedNos.size) {
    return {};
  }
  const out: Partial<Record<Position, boolean>> = {};
  ensureTeamPlayerOrder(players || []).forEach((slot) => {
    if (!slot || !isPosition(String(slot.pos || ""))) {
      return;
    }
    const no = normalizeSubstituteNumber(String(slot.number || ""));
    if (!no || !lockedNos.has(no)) {
      return;
    }
    out[slot.pos as Position] = true;
  });
  return out;
}

function buildRestrictedSpecialAllowedPosBySet(
  logs: MatchLogItem[],
  setNo: number,
  team: TeamCode,
  players: PlayerSlot[],
  liberoRoster: string[]
): Partial<Record<Position, boolean>> {
  return {
    ...buildSpecialPenaltyPairAllowedPosBySet(logs, setNo, team, players),
    ...buildClosedNormalPairAllowedPosBySet(logs, setNo, team, players),
    ...buildLiberoZoneNormalPlayerAllowedPos(players, liberoRoster),
  };
}

function isLockedSubNormalPairPos(
  badges: Partial<Record<Position, SubNormalPairBadge>>,
  pos: "" | Position
): boolean {
  if (!pos || !isPosition(String(pos))) {
    return false;
  }
  const badge = badges[pos as Position];
  return !!(badge && badge.state === "lock");
}

function validateNormalSubPairRule(logs: MatchLogItem[], setNo: number, team: TeamCode, downNoRaw: string, upNoRaw: string): string {
  const downNo = normalizeSubstituteNumber(downNoRaw);
  const upNo = normalizeSubstituteNumber(upNoRaw);
  if (!downNo || !upNo) {
    return "";
  }
  const pairs = buildNormalSubPairsFromLogs(logs, setNo, team);
  const downPair = pairs.find((p) => p.starterNo === downNo || p.substituteNo === downNo) || null;
  const upPair = pairs.find((p) => p.starterNo === upNo || p.substituteNo === upNo) || null;

  if (downPair && upPair && downPair !== upPair) {
    return "普通换人必须按既有配对执行，不能跨配对换人";
  }

  const pair = downPair || upPair;
  if (!pair) {
    return "";
  }

  if (pair.closed) {
    return "该配对本局已完成2次互换，不能再普通换人";
  }

  if (pair.starterNo === upNo && pair.substituteNo === downNo) {
    return "";
  }

  if (pair.substituteNo === downNo) {
    return "该号码只能与 " + pair.starterNo + " 进行换回";
  }
  if (pair.starterNo === upNo) {
    return (
      upNo +
      "号本局已与" +
      pair.substituteNo +
      "号配对，不能与" +
      downNo +
      "号普通换人"
    );
  }
  return "该号码已存在普通换人配对，不能与其他号码换人";
}

function getForcedNormalSubIncomingNo(logs: MatchLogItem[], setNo: number, team: TeamCode, downNoRaw: string): string {
  const downNo = normalizeSubstituteNumber(downNoRaw);
  if (!downNo) {
    return "";
  }
  const pairs = buildNormalSubPairsFromLogs(logs, setNo, team);
  const pair = pairs.find((p) => p.starterNo === downNo || p.substituteNo === downNo) || null;
  if (!pair || pair.closed) {
    return "";
  }
  if (pair.substituteNo === downNo) {
    return pair.starterNo;
  }
  return "";
}

function buildSubRecordSummary(logs: MatchLogItem[], setNo: number, team: TeamCode): SubRecordSummary {
  const targetSet = Math.max(1, Number(setNo || 1));
  const hiddenOpIds = buildRevertedOpIdSet(logs);

  const normalLines: string[] = [];
  const specialLines: string[] = [];
  const liberoLines: string[] = [];
  const specialLiberoLines: string[] = [];
  const punishSetLines: string[] = [];
  const punishMatchLines: string[] = [];

  (logs || []).forEach((item) => {
    if (!item || item.team !== team) {
      return;
    }
    const itemSetNo = Math.max(1, Number((item as any).setNo || extractSetNoFromNote(String(item.note || "")) || 1));
    if (itemSetNo !== targetSet) {
      return;
    }
    const opId = String((item as any).opId || "");
    if (opId && hiddenOpIds.has(opId)) {
      return;
    }

    const action = String(item.action || "");
    const note = String(item.note || "");
    const generic = parseGenericSubRecordText(note);

    if (action === "libero_swap" || note.indexOf("自由人常规换人") >= 0) {
      const parsedLibero = parseLiberoSwapRecordText(note);
      if (parsedLibero) {
        appendSubRecordRow(
          liberoLines,
          buildDirectionalSubRecordText(
            parsedLibero.upNo,
            parsedLibero.downNo,
            parsedLibero.upIsLibero,
            parsedLibero.downIsLibero
          )
        );
      }
      return;
    }

    const isNormalSub =
      action === "sub_normal" ||
      action === "sub_normal_penalty_set" ||
      action === "sub_normal_penalty_match" ||
      action === "substitution_normal" ||
      note.indexOf("普通换人") >= 0;
    if (isNormalSub) {
      if (generic) {
        const line = buildSubRecordText(generic.upNo, generic.downNo);
        appendSubRecordRow(normalLines, line);
        if (action === "sub_normal_penalty_set" || note.indexOf("本局禁赛") >= 0) {
          appendSubRecordRow(punishSetLines, line);
        }
        if (action === "sub_normal_penalty_match" || note.indexOf("全场禁赛") >= 0) {
          appendSubRecordRow(punishMatchLines, line);
        }
      }
      return;
    }

    const isSpecialLiberoSub = isSpecialLiberoSubAction(action) || isSpecialLiberoSubNote(note);
    if (isSpecialLiberoSub) {
      const parsedSpecialLibero = parseSpecialLiberoRecordText(note);
      if (parsedSpecialLibero) {
        const line = buildSpecialLiberoRecordText(parsedSpecialLibero.upNo, parsedSpecialLibero.downNo);
        appendSubRecordRow(specialLines, line);
        appendSubRecordRow(specialLiberoLines, line);
        if (action === "sub_special_libero_penalty_set" || note.indexOf("本局禁赛") >= 0) {
          appendSubRecordRow(punishSetLines, line);
        }
        if (action === "sub_special_libero_penalty_match" || note.indexOf("全场禁赛") >= 0) {
          appendSubRecordRow(punishMatchLines, line);
        }
      }
      return;
    }

    const isSpecialSub =
      action === "sub_special" ||
      action === "sub_special_injury" ||
      action === "sub_special_other" ||
      action === "sub_special_penalty_set" ||
      action === "sub_special_penalty_match" ||
      action === "substitution_special" ||
      note.indexOf("特殊换人") >= 0;
    if (isSpecialSub) {
      if (generic) {
        const line = buildSubRecordText(generic.upNo, generic.downNo);
        appendSubRecordRow(specialLines, line);
        if (action === "sub_special_penalty_set" || note.indexOf("本局禁赛") >= 0) {
          appendSubRecordRow(punishSetLines, line);
        }
        if (action === "sub_special_penalty_match" || note.indexOf("全场禁赛") >= 0) {
          appendSubRecordRow(punishMatchLines, line);
        }
      }
    }
  });

  return {
    normal: toSubRecordRows(normalLines),
    special: toSubRecordRows(specialLines),
    libero: toSubRecordRows(liberoLines),
    specialLibero: toSubRecordRows(specialLiberoLines),
    punishSet: toSubRecordRows(punishSetLines),
    punishMatch: toSubRecordRows(punishMatchLines),
  };
}

function clonePlayerList(players: PlayerSlot[]): PlayerSlot[] {
  return (players || []).map(function (item) {
    return { pos: item.pos, number: item.number };
  });
}

function getSetStartLineupsMap(room: any): Record<string, SetStartLineupSnapshot> {
  if (!room.match || !room.match.setStartLineupsBySet || typeof room.match.setStartLineupsBySet !== "object") {
    room.match.setStartLineupsBySet = {};
  }
  return room.match.setStartLineupsBySet as Record<string, SetStartLineupSnapshot>;
}

function ensureSetStartLineupSnapshot(room: any, setNoRaw: number): void {
  if (!room || !room.match) {
    return;
  }
  const setNo = Math.max(1, Number(setNoRaw) || 1);
  const map = getSetStartLineupsMap(room);
  const key = String(setNo);
  if (map[key]) {
    return;
  }
  const savedAt = Date.now();
  map[key] = {
    setNo: setNo,
    teamAPlayers: clonePlayerList((room.teamA && room.teamA.players) || []),
    teamBPlayers: clonePlayerList((room.teamB && room.teamB.players) || []),
    servingTeam: room.match.servingTeam === "B" ? "B" : "A",
    startIsSwapped: !!room.match.isSwapped,
    endIsSwapped: !!room.match.isSwapped,
    teamACaptainNo: String((room.match as any).teamACurrentCaptainNo || room.teamA.captainNo || ""),
    teamBCaptainNo: String((room.match as any).teamBCurrentCaptainNo || room.teamB.captainNo || ""),
    savedAt: savedAt,
    endedAt: 0,
  };
}

function markSetEndIsSwapped(room: any, setNoRaw: number): void {
  if (!room || !room.match) {
    return;
  }
  const setNo = Math.max(1, Number(setNoRaw) || 1);
  ensureSetStartLineupSnapshot(room, setNo);
  const map = getSetStartLineupsMap(room);
  const key = String(setNo);
  const snapshot = map[key];
  if (!snapshot) {
    return;
  }
  snapshot.endIsSwapped = !!room.match.isSwapped;
  snapshot.endedAt = Date.now();
}

function normalizeLiberoReentryLock(raw: any): LiberoReentryLock | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const team: TeamCode | "" = raw.team === "B" ? "B" : raw.team === "A" ? "A" : "";
  const liberoNo = normalizeSubstituteNumber(String(raw.liberoNo || ""));
  const setNo = Math.max(1, Number(raw.setNo || 1));
  const aScore = Math.max(0, Number(raw.aScore || 0));
  const bScore = Math.max(0, Number(raw.bScore || 0));
  if (!team || !liberoNo) {
    return null;
  }
  return {
    team,
    liberoNo,
    setNo,
    aScore,
    bScore,
  };
}

function isLiberoReentryLockActive(
  lockRaw: any,
  team: TeamCode,
  liberoNoRaw: string,
  setNoRaw: number,
  aScoreRaw: number,
  bScoreRaw: number
): boolean {
  const lock = normalizeLiberoReentryLock(lockRaw);
  const liberoNo = normalizeSubstituteNumber(String(liberoNoRaw || ""));
  if (!lock || !liberoNo) {
    return false;
  }
  return (
    lock.team === team &&
    lock.liberoNo === liberoNo &&
    lock.setNo === Math.max(1, Number(setNoRaw || 1)) &&
    lock.aScore === Math.max(0, Number(aScoreRaw || 0)) &&
    lock.bScore === Math.max(0, Number(bScoreRaw || 0))
  );
}

function rotateTeamReverseByRule(players: PlayerSlot[]): PlayerSlot[] {
  const byPos: Record<string, PlayerSlot> = {};
  players.forEach(function (p) {
    byPos[p.pos] = p;
  });
  const reverseSourceMap: Record<Position, Position> = {
    I: "VI",
    II: "I",
    III: "II",
    IV: "III",
    V: "IV",
    VI: "V",
    L1: "L1",
    L2: "L2",
  };
  return ALL_POSITIONS.map(function (pos) {
    const sourcePos = reverseSourceMap[pos];
    const source = byPos[sourcePos];
    return {
      pos: pos,
      number: source ? source.number : "?",
    };
  });
}

function buildRotateReplayQueue(logs: MatchLogItem[], lastSeenLogId: string): RotateStep[] {
  if (!Array.isArray(logs) || logs.length === 0) {
    return [];
  }
  if (!lastSeenLogId) {
    return [];
  }
  const idx = logs.findIndex(function (item) {
    return String(item.id || "") === lastSeenLogId;
  });
  if (idx < 0) {
    return [];
  }
  return logs
    .slice(idx + 1)
    .filter(function (item) {
      return item.action === "rotate" && (item.team === "A" || item.team === "B");
    })
    .map(function (item): RotateStep {
      return { team: item.team as TeamCode, reverse: false };
    });
}

function buildRotateStepsByDiff(beforePlayers: PlayerSlot[], afterPlayers: PlayerSlot[], team: TeamCode): RotateStep[] {
  const before = clonePlayerList(beforePlayers || []);
  const after = clonePlayerList(afterPlayers || []);
  if (!isMainMapChanged(before, after)) {
    return [];
  }
  let forwardSteps = 0;
  let temp = clonePlayerList(before);
  for (let i = 1; i <= 5; i += 1) {
    temp = rotateTeamByRule(temp);
    if (!isMainMapChanged(temp, after)) {
      forwardSteps = i;
      break;
    }
  }
  let reverseSteps = 0;
  temp = clonePlayerList(before);
  for (let i = 1; i <= 5; i += 1) {
    temp = rotateTeamReverseByRule(temp);
    if (!isMainMapChanged(temp, after)) {
      reverseSteps = i;
      break;
    }
  }
  if (!forwardSteps && !reverseSteps) {
    return [];
  }
  if (!reverseSteps || (forwardSteps > 0 && forwardSteps <= reverseSteps)) {
    return Array.from({ length: forwardSteps }).map(function (): RotateStep {
      return { team: team, reverse: false };
    });
  }
  return Array.from({ length: reverseSteps }).map(function (): RotateStep {
    return { team: team, reverse: true };
  });
}

function appendMatchLog(room: any, action: string, note: string, team?: TeamCode, opId?: string, revertedOpId?: string): void {
  if (!room.match.logs) {
    room.match.logs = [];
  }
  const normalizedNote = normalizeSwapSymbolText(note);
  const resolvedOpId = String(opId || (room.match as any).currentOpId || "");
  rememberLocalOpId(resolvedOpId);
  room.match.logs.push({
    id: createLogId(),
    ts: Date.now(),
    action: action,
    team: team || "",
    note: normalizedNote,
    setNo: Math.max(1, Number(room.match.setNo || 1)),
    opId: resolvedOpId,
    revertedOpId: String(revertedOpId || ""),
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
    teamACurrentCaptainNo: String((room.match as any).teamACurrentCaptainNo || room.teamA.captainNo || ""),
    teamBCurrentCaptainNo: String((room.match as any).teamBCurrentCaptainNo || room.teamB.captainNo || ""),
    setTimerStartAt: Math.max(0, Number((room.match as any).setTimerStartAt) || 0),
    setTimerElapsedMs: Math.max(0, Number((room.match as any).setTimerElapsedMs) || 0),
    servingTeam: room.match.servingTeam,
    teamAPlayers: room.teamA.players.slice(),
    teamBPlayers: room.teamB.players.slice(),
    teamALiberoRoster: normalizeLiberoRosterNumbers((room.match as any).teamALiberoRoster || []),
    teamBLiberoRoster: normalizeLiberoRosterNumbers((room.match as any).teamBLiberoRoster || []),
    liberoRosterSetNo: Math.max(0, Number((room.match as any).liberoRosterSetNo || 0)),
    isSwapped: !!room.match.isSwapped,
    decidingSetEightHandled: !!room.match.decidingSetEightHandled,
    decidingSetEightPending: !!(room.match as any).decidingSetEightPending,
    setNo: room.match.setNo,
    aSetWins: room.match.aSetWins,
    bSetWins: room.match.bSetWins,
    // 业务要求：暂停态/暂停次数不可被“撤回比分”回退，因此不进 undo 快照。
    isFinished: room.match.isFinished,
    setSummaries: JSON.parse(JSON.stringify((room.match as any).setSummaries || {})),
    liberoReentryLock: JSON.parse(JSON.stringify((room.match as any).liberoReentryLock || null)),
    lastActionOpId: String((room.match as any).lastActionOpId || ""),
  } as UndoSnapshot);
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

function getForwardTargetPosBySource(sourcePos: MainPosition): MainPosition {
  const target = MAIN_POSITIONS.find((pos) => (NUMBER_SOURCE_MAP[pos] as MainPosition) === sourcePos);
  return (target || sourcePos) as MainPosition;
}

function getReverseTargetPosBySource(sourcePos: MainPosition): MainPosition {
  const target = NUMBER_SOURCE_MAP[sourcePos] as MainPosition;
  return MAIN_POSITIONS.indexOf(target) >= 0 ? target : sourcePos;
}

function resolveRotateDirection(before: TeamMainNoMap, after: TeamMainNoMap): RotateDirectionHint {
  if (sameMainMap(after, rotateMainMapOnce(before))) {
    return "forward";
  }
  if (sameMainMap(before, rotateMainMapOnce(after))) {
    return "reverse";
  }
  return "";
}

function sameMainMap(a: TeamMainNoMap, b: TeamMainNoMap): boolean {
  return MAIN_POSITIONS.every((pos) => (a[pos] || "?") === (b[pos] || "?"));
}

function isOneStepRotationBetween(beforePlayers: PlayerSlot[], afterPlayers: PlayerSlot[]): boolean {
  const before = buildMainMap(beforePlayers || []);
  const after = buildMainMap(afterPlayers || []);
  return sameMainMap(after, rotateMainMapOnce(before)) || sameMainMap(before, rotateMainMapOnce(after));
}

function isMainMapChanged(beforePlayers: PlayerSlot[], afterPlayers: PlayerSlot[]): boolean {
  const before = buildMainMap(beforePlayers || []);
  const after = buildMainMap(afterPlayers || []);
  return !sameMainMap(before, after);
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
  const digits = String(value || "").replace(/\D/g, "").slice(0, 2);
  if (!digits) {
    return "";
  }
  return String(Number(digits));
}

function formatDurationMMSS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const mmText = mm < 10 ? "0" + String(mm) : String(mm);
  const ssText = ss < 10 ? "0" + String(ss) : String(ss);
  return mmText + ":" + ssText;
}

function formatTimeoutSeconds(ms: number): string {
  const sec = Math.max(0, Math.ceil(Math.max(0, ms) / 1000));
  return "暂停 " + String(sec) + "s";
}

function vibrateLongForMs(totalMs: number): void {
  const duration = Math.max(0, Number(totalMs) || 0);
  if (duration <= 0) {
    return;
  }
  const stepMs = 500;
  const count = Math.max(1, Math.ceil(duration / stepMs));
  for (let i = 0; i < count; i += 1) {
    setTimeout(() => {
      wx.vibrateLong({
        fail: () => {},
      });
    }, i * stepMs);
  }
}

function buildMatchModeText(settings: any): string {
  const sets = Math.max(1, Number(settings && settings.sets) || 1);
  const wins = Math.max(1, Number(settings && settings.wins) || 1);
  if (sets === 5 && wins === 3) {
    return "5局3胜";
  }
  if (sets === 3 && wins === 2) {
    return "3局2胜";
  }
  const maxScore = Math.max(
    0,
    Number(settings && settings.maxScore) || Number(settings && settings.tiebreakScore) || 15
  );
  return maxScore >= 25 ? "1局/25分" : "1局/15分";
}

function buildBetweenSetHint(setNo: number, wins: number): string {
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

function setKeepScreenOnSafe(keepScreenOn: boolean): void {
  wx.setKeepScreenOn({
    keepScreenOn,
    fail: () => {},
  });
}

function shouldClearLiveSubDownBadgeByAction(actionRaw: string): boolean {
  const action = String(actionRaw || "");
  if (!action) {
    return false;
  }
  if (action === "timeout" || action === "timeout_end") {
    return false;
  }
  if (action === "substitution_normal" || action === "substitution_special") {
    return false;
  }
  if (action.indexOf("sub_") === 0) {
    return false;
  }
  return true;
}

Page({
  data: {
    roomId: "",
    participantCount: 1,
    teamAName: "甲",
    teamBName: "乙",
    teamAColor: TEAM_COLOR_OPTIONS[0].value,
    teamBColor: TEAM_COLOR_OPTIONS[1].value,
    roomPassword: "",
    showRoomPassword: false,
    passwordEyeFx: false,
    captainModeEnabled: true,
    teamACaptainNo: "",
    teamBCaptainNo: "",
    teamAInitialCaptainNo: "",
    teamBInitialCaptainNo: "",
    teamARGB: "138, 135, 208",
    teamBRGB: "129, 199, 158",
    aScore: 0,
    bScore: 0,
    lastScoringTeam: "" as TeamCode | "",
    liberoReentryLockTeam: "" as "" | TeamCode,
    liberoReentryLockNo: "",
    liberoReentryLockSetNo: 0,
    liberoReentryLockAScore: 0,
    liberoReentryLockBScore: 0,
    setTimerText: "00:00",
    servingTeam: "A" as TeamCode,
    setNo: 1,
    aSetWins: 0,
    bSetWins: 0,
    teamATimeoutCount: 0,
    teamBTimeoutCount: 0,
    teamANormalSubCount: 0,
    teamBNormalSubCount: 0,
    timeoutActive: false,
    timeoutTeam: "" as TeamCode | "",
    timeoutLeftText: "暂停 30s",
    setNoText: "第1局",
    matchModeText: "5局3胜",
    setWinsText: "0 : 0",
    canStartMatch: false,
    preStartCaptainConfirmed: false,
    preStartCaptainConfirmSetNo: 0,
    matchFlowMode: "normal" as MatchFlowMode,
    matchFlowReturnState: "prestart" as MatchFlowReturnState,
    playerCardsEditable: false,
    activeAdjustInputKey: "",
    isDecidingSet: false,
    teamASideText: "左场区",
    teamBSideText: "右场区",
    showCaptainConfirmModal: false,
    captainConfirmModalClosing: false,
    captainConfirmShowCancel: false,
    captainConfirmPanelInlineStyle: "",
    captainConfirmTeamAMainGrid: [] as PlayerSlot[][],
    captainConfirmTeamALibero: [] as PlayerSlot[],
    captainConfirmTeamBMainGrid: [] as PlayerSlot[][],
    captainConfirmTeamBLibero: [] as PlayerSlot[],
    captainConfirmSelectedA: "",
    captainConfirmSelectedB: "",
    captainConfirmLockA: false,
    captainConfirmLockB: false,
    captainConfirmScopedTeam: "" as "" | TeamCode,
    captainConfirmReadonlyA: false,
    captainConfirmReadonlyB: false,
    captainConfirmContentSwitching: false,
    betweenHeadTitle: "局间配置",
    betweenHeadHint: "请核对并更新下一局球员信息",
    isMatchFinished: false,
    isSwapped: false,
    showLogPanel: false,
    logPanelClosing: false,
    logPanelInlineStyle: "",
    showSubstitutionPanel: false,
    substitutionPanelClosing: false,
    subTeam: "A" as TeamCode,
    subTeamName: "甲",
    subUseSwapLayout: false,
    subMainGrid: [] as PlayerSlot[][],
    subLibero: [] as PlayerSlot[],
    subCaptainNo: "",
    subInitialCaptainNo: "",
    subSelectedPos: "" as "" | Position,
    subMode: "normal" as "normal" | "special",
    subReason: "injury" as "injury" | "penalty_set" | "penalty_match" | "other",
    subNormalPenalty: "none" as "none" | "penalty_set" | "penalty_match",
    subIncomingNoInput: "",
    subIncomingNo: "",
    subIncomingLocked: false,
    subIncomingLockedNo: "",
    subNormalPairBadge: {} as Partial<Record<Position, SubNormalPairBadge>>,
    subNormalRecords: [] as SubRecordRow[],
    subSpecialRecords: [] as SubRecordRow[],
    subLiberoRecords: [] as SubRecordRow[],
    subSpecialLiberoRecords: [] as SubRecordRow[],
    subPunishSetRecords: [] as SubRecordRow[],
    subPunishMatchRecords: [] as SubRecordRow[],
    subNormalCount: 0,
    subSpecialCount: 0,
    subNormalDisabled: false,
    subSpecialPenaltyPairOnly: false,
    subSpecialPenaltyAllowedPos: {} as Partial<Record<Position, boolean>>,
    showSubMatchLogPopover: false,
    subMatchLogPopoverClosing: false,
    subLogPopoverInlineStyle: "",
    showSubRecordTabMenu: false,
    subRecordTab: "normal" as SubRecordTab,
    subRecordTabOptions: SUB_RECORD_TAB_OPTIONS.map((item) => item.label),
    subRecordTabIndex: 0,
    subRecordPickerSwitching: false,
    subRecordContentSwitching: false,
    subModeSwitching: false,
    subReasonSwitching: false,
    subSpecialDisabled: true,
    subNormalModeLimitLocked: false,
    logs: [] as DisplayLogItem[],
    logScrollIntoView: "",
    logSetSwitchVisible: false,
    logSetOptions: [] as number[],
    selectedLogSet: 1,
    logContentSwitching: false,
    hideTeamAMainNumbers: false,
    hideTeamBMainNumbers: false,
    rotateFlyItemsA: [] as RotateFlyItem[],
    rotateFlyItemsB: [] as RotateFlyItem[],
    switchingOut: false,
    switchingIn: false,
    flowSwitchingOut: false,
    flowSwitchingIn: false,
    flowSwitchScope: "none" as FlowSwitchScope,
    teamAPlayers: [] as PlayerSlot[],
    teamBPlayers: [] as PlayerSlot[],
    teamALiberoRosterNos: [] as string[],
    teamBLiberoRosterNos: [] as string[],
    teamALibero: [] as PlayerSlot[],
    teamAMainGrid: [] as PlayerSlot[][],
    teamBLibero: [] as PlayerSlot[],
    teamBMainGrid: [] as PlayerSlot[][],
    liveSubDownBadgeA: {} as Partial<Record<Position, string>>,
    liveSubDownBadgeB: {} as Partial<Record<Position, string>>,
    safePadTop: "0px",
    safePadRight: "0px",
    safePadBottom: "0px",
    safePadLeft: "0px",
    safeDebugText: "",
    updatedAt: 0,
    backConfirming: false,
    showSetEndModal: false,
    setEndModalClosing: false,
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
    setEndWaiting: false,
    decidingSetEightPending: false,
    roomAuthoritySyncing: false,
    connStatusText: "信号正常",
    connStatusClass: "status-online",
    roomOwnerClientId: "",
    roomOperatorClientId: "",
    controlRole: "operator" as "operator" | "observer",
    hasOperationAuthority: true,
    observerViewSide: "A" as "A" | "B",
    rawRoomSwapped: false,
    swapDragActive: false,
    swapDragTeam: "" as "" | TeamCode,
    swapDragPos: "" as "" | Position,
    swapDragSourceIsLibero: false,
    swapDragSourceInMain: false,
    swapDragTargetMainPoses: [] as MainPosition[],
    swapDragTargetI: false,
    swapDragTargetII: false,
    swapDragTargetIII: false,
    swapDragTargetIV: false,
    swapDragTargetV: false,
    swapDragTargetVI: false,
    swapDragTargetL1: false,
    swapDragTargetL2: false,
    swapDragGhostVisible: false,
    swapDragGhostStyle: "",
    swapDragGhostNumber: "",
    swapDragGhostPos: "" as "" | Position,
    swapDragGhostTeam: "" as "" | TeamCode,
    swapDragGhostIsCurrentCaptain: false,
    swapDragGhostIsInitialCaptain: false,
    swapDragGhostIsLibero: false,
    quickSubFlashKey: "",
  },

  pollTimer: 0 as number,
  heartbeatTimer: 0 as number,
  timerTick: 0 as number,
  timerStartAtMs: 0 as number,
  timerElapsedBaseMs: 0 as number,
  lastRenderedTimerText: "00:00",
  timeoutEndAtMs: 0 as number,
  lastRenderedTimeoutText: "暂停 30s",
  timeoutWarnVibratedForEndAt: 0 as number,
  timeoutEndVibratedForEndAt: 0 as number,
  timeoutAutoClearing: false as boolean,
  themeOff: null as null | (() => void),
  roomLoadInFlight: false as boolean,
  roomLoadPending: false as boolean,
  roomLoadPendingForce: false as boolean,
  roomLoadPendingRetryTimer: 0 as number,
  lastSeenLogId: "" as string,
  allLogs: [] as MatchLogItem[],
  roomWatchOff: null as null | (() => void),
  clientId: "" as string,
  lastAutoLineupOpenSign: "" as string,
  setEndActionInFlight: false as boolean,
  timeoutActionInFlight: false as boolean,
  takeoverInFlight: false as boolean,
  rotateConfirming: false as boolean,
  switchConfirming: false as boolean,
  actionQueue: null as Promise<void> | null,
  rotateMotionInFlightCount: 0 as number,
  pendingLowerParticipantCount: 0 as number,
  pendingLowerParticipantHit: 0 as number,
  lastTeamARects: {} as TeamRectMap,
  lastTeamBRects: {} as TeamRectMap,
  heartbeatFailCount: 0 as number,
  connFailureStreak: 0 as number,
  connSuccessStreak: 0 as number,
  connStateChangedAt: 0 as number,
  lastConnAliveAt: 0 as number,
  connWatchTimer: 0 as number,
  networkOnline: true as boolean,
  networkStatusHandler: null as null | ((res: { isConnected?: boolean }) => void),
  lastRoomSnapshot: null as any,
  observerPerspectiveToken: 0 as number,
  observerPerspectiveTargetSide: "" as "" | "A" | "B",
  observerViewSideLocal: "" as "" | "A" | "B",
  observerPerspectiveFreezeUntil: 0 as number,
  betweenSetSideToggleToken: 0 as number,
  swapDragStart: null as
    | null
    | {
        team: TeamCode;
        pos: Position;
        x: number;
        y: number;
        sourceIsLiberoSlot: boolean;
        sourceInMain: boolean;
      },
  swapDragLastPoint: null as null | { x: number; y: number },
  swapDragGhostSize: null as null | { width: number; height: number },
  statusRouteRedirecting: false as boolean,
  roomMissingRetryTimer: 0 as number,
  roomMissingToastAt: 0 as number,
  roomMissingLoadingVisible: false as boolean,
  reconfigureLoadingVisible: false as boolean,
  setEndLoadingVisible: false as boolean,
  roomMissingVerifyAt: 0 as number,
  roomMissingVerifyInFlight: false as boolean,
  roomClosedHandled: false as boolean,
  rectCacheWarmupTimer: 0 as number,
  rectCacheWarmupInFlight: false as boolean,
  rotateActionInFlight: false as boolean,
  decidingSetEightPrompting: false as boolean,
  decidingSetEightPromptTimer: 0 as number,
  decidingSetEightBlockedToastAt: 0 as number,
  decidingSetEightChoiceActive: false as boolean,
  authoritativeRoomSyncing: false as boolean,
  authoritativeRoomSyncToken: 0 as number,
  authoritativeRoomSyncToastAt: 0 as number,
  authoritativeRoomSyncStartedAt: 0 as number,
  authoritativeRoomSyncForceReleaseTimer: 0 as number,
  pageActive: false as boolean,
  lastFrontRowLiberoHintSign: "" as string,
  frontRowLiberoFixing: false as boolean,
  shownNormalSubAlertSigns: {} as Record<string, true>,
  shownTimeoutAlertSigns: {} as Record<string, true>,
  setUsageCountSnapshot: {} as Record<string, { normal: number; timeout: number }>,
  warmNoticeShowing: false as boolean,
  passwordAutoHideTimer: 0 as number,
  quickSubFlashTimer: 0 as number,
  quickSubTapLockUntil: 0 as number,
  substitutionDraftRestoreTriedKey: "" as string,
  flowModeUpdating: false as boolean,
  flowBaseTeamAPlayers: [] as PlayerSlot[],
  flowBaseTeamBPlayers: [] as PlayerSlot[],
  flowBaseServingTeam: "A" as TeamCode,
  flowBaseIsSwapped: false as boolean,
  flowPlayersDirty: false as boolean,
  editDisplayRoleMapA: null as PlayerDisplayRoleMap | null,
  editDisplayRoleMapB: null as PlayerDisplayRoleMap | null,
  captainConfirmReason: "prestart" as CaptainConfirmReason,
  inputEditing: false as boolean,
  inputEditingReleaseTimer: 0 as number,
  suppressInputRefocusUntil: 0 as number,
  flowDraftPersistTimer: 0 as number,
  flowSwitchInTimer: 0 as number,
  setEndModalCloseTimer: 0 as number,
  logPanelCloseTimer: 0 as number,
  substitutionPanelCloseTimer: 0 as number,
  captainConfirmModalCloseTimer: 0 as number,
  subMatchLogPopoverCloseTimer: 0 as number,
  subModeSwitchTimer: 0 as number,
  subReasonSwitchTimer: 0 as number,
  subRecordTabSwitchTimer: 0 as number,
  subRecordContentSwitchTimer: 0 as number,
  logContentSwitchTimer: 0 as number,
  captainConfirmContentSwitchTimer: 0 as number,

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

  setConnState(state: ConnState, options?: { force?: boolean }) {
    const nextText = state === "online" ? "信号正常" : state === "offline" ? "信号断联" : "正在重连";
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

  markConnectionAlive() {
    if (!this.networkOnline) {
      return;
    }
    this.lastConnAliveAt = Date.now();
    this.heartbeatFailCount = 0;
    this.connFailureStreak = 0;
    this.connSuccessStreak += 1;
    const current = this.getConnState();
    if (current === "online") {
      return;
    }
    this.setConnState("online", { force: true });
  },

  markConnectionIssue() {
    if (!this.networkOnline) {
      this.setConnState("offline");
      return;
    }
    this.heartbeatFailCount += 1;
    this.connSuccessStreak = 0;
    this.connFailureStreak += 1;
    const current = this.getConnState();
    if (current === "online") {
      if (this.connFailureStreak >= CONN_OFFLINE_FAILS_ONLINE) {
        this.setConnState("offline");
        return;
      }
      if (this.connFailureStreak >= CONN_RECONNECT_FAILS_ONLINE) {
        this.setConnState("reconnecting");
      }
      return;
    }
    if (this.connFailureStreak >= CONN_OFFLINE_FAILS_NONONLINE) {
      this.setConnState("offline");
      return;
    }
    this.setConnState("reconnecting");
  },

  startConnWatchdog() {
    this.stopConnWatchdog();
    this.connWatchTimer = setInterval(() => {
      const roomId = String(this.data.roomId || "");
      if (!roomId) {
        return;
      }
      if (!this.networkOnline) {
        this.setConnState("offline", { force: true });
        return;
      }
      const elapsed = Date.now() - Math.max(0, Number(this.lastConnAliveAt) || 0);
      if (elapsed > CONN_WATCHDOG_OFFLINE_MS) {
        this.setConnState("offline");
        return;
      }
      if (elapsed > CONN_WATCHDOG_RECONNECT_MS && this.data.connStatusClass === "status-online") {
        this.setConnState("reconnecting");
      }
    }, 3000) as unknown as number;
  },

  stopConnWatchdog() {
    if (!this.connWatchTimer) {
      return;
    }
    clearInterval(this.connWatchTimer);
    this.connWatchTimer = 0;
  },

  updateNetworkState(isConnected: boolean) {
    this.networkOnline = !!isConnected;
    if (!this.networkOnline) {
      this.connSuccessStreak = 0;
      this.connFailureStreak = 0;
      this.setConnState("offline", { force: true });
      return;
    }
    this.connSuccessStreak = 0;
    this.connFailureStreak = 0;
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

  buildLogSetOptions(sets: number): number[] {
    const count = Math.max(1, Number(sets || 1));
    return Array.from({ length: count }).map((_, i) => i + 1);
  },

  getDisplayLogsBySet(logs: MatchLogItem[], setNo: number): DisplayLogItem[] {
    const targetSet = Math.max(1, Number(setNo || 1));
    const teamAName = String(this.data.teamAName || "甲");
    const teamBName = String(this.data.teamBName || "乙");
    return (logs || [])
      .filter((item) => {
        if (String(item.action || "") === "timeout_end") {
          return false;
        }
        if (String(item.action || "") === "switch_sides_prompt") {
          return false;
        }
        if (String(item.action || "") === "next_set") {
          return false;
        }
        if (String(item.action || "") === "score_reset") {
          return false;
        }
        const noteSetNo = extractSetNoFromNote(String(item.note || ""));
        const itemSetNo = Math.max(1, Number((item as any).setNo || noteSetNo || 1));
        return itemSetNo === targetSet;
      })
      .map(function (item: MatchLogItem) {
        const noteWithTeam = withTeamSuffixForDisplay(String(item.note || ""), teamAName, teamBName);
        const note = formatOperationLogNoteForDisplay(String(item.action || ""), noteWithTeam);
        return {
          id: item.id,
          ts: item.ts,
          action: item.action,
          team: item.team || "",
          note: note,
          setNo: item.setNo,
          timeText: formatLogTime(item.ts),
        };
      });
  },

  scrollLogPanelToBottom(done?: () => void) {
    const logs = Array.isArray(this.data.logs) ? this.data.logs : [];
    const targetId = logs.length ? "match-log-item-" + String(logs.length - 1) : "";
    this.setData({ logScrollIntoView: "" }, () => {
      if (!targetId) {
        if (typeof done === "function") {
          done();
        }
        return;
      }
      wx.nextTick(() => {
        this.setData({ logScrollIntoView: targetId }, () => {
          if (typeof done === "function") {
            done();
          }
        });
      });
    });
  },

  enqueueAction(task: () => Promise<void>) {
    const baseQueue = this.actionQueue || Promise.resolve();
    this.actionQueue = baseQueue
      .catch(() => {})
      .then(async () => {
        await task();
      });
    return this.actionQueue;
  },

  isBetweenSetMode(): boolean {
    return this.data.matchFlowMode === "between_sets";
  },

  isEditPlayersMode(): boolean {
    return this.data.matchFlowMode === "edit_players";
  },

  isPlayerCardsEditable(): boolean {
    return this.data.hasOperationAuthority && (this.isBetweenSetMode() || this.isEditPlayersMode());
  },

  isMatchInteractionLocked(): boolean {
    return this.isBetweenSetMode() || this.isEditPlayersMode();
  },

  isAuthoritativeRoomSyncing(): boolean {
    if (
      this.authoritativeRoomSyncing &&
      this.authoritativeRoomSyncStartedAt > 0 &&
      Date.now() - this.authoritativeRoomSyncStartedAt > AUTHORITATIVE_ROOM_SYNC_BLOCK_MS + 120
    ) {
      this.finishAuthoritativeRoomSync();
      return false;
    }
    return !!this.authoritativeRoomSyncing;
  },

  clearAuthoritativeRoomSyncForceReleaseTimer() {
    if (!this.authoritativeRoomSyncForceReleaseTimer) {
      return;
    }
    clearTimeout(this.authoritativeRoomSyncForceReleaseTimer);
    this.authoritativeRoomSyncForceReleaseTimer = 0;
  },

  finishAuthoritativeRoomSync() {
    this.clearAuthoritativeRoomSyncForceReleaseTimer();
    this.authoritativeRoomSyncing = false;
    this.authoritativeRoomSyncStartedAt = 0;
    if (this.data.roomAuthoritySyncing) {
      this.setData({ roomAuthoritySyncing: false });
    }
  },

  notifyAuthoritativeRoomSyncing() {
    const now = Date.now();
    if (now - this.authoritativeRoomSyncToastAt < 900) {
      return;
    }
    this.authoritativeRoomSyncToastAt = now;
    showToastHint("同步中，请稍候");
  },

  hasRoomSnapshotReady(): boolean {
    return Number(this.data.updatedAt || 0) > 0;
  },

  async refreshRoomAuthoritatively(roomId: string) {
    const id = String(roomId || "");
    if (!id) {
      return;
    }
    if (this.authoritativeRoomSyncing) {
      return;
    }
    const token = ++this.authoritativeRoomSyncToken;
    this.authoritativeRoomSyncing = true;
    this.authoritativeRoomSyncStartedAt = Date.now();
    this.setData({ roomAuthoritySyncing: true });
    this.clearAuthoritativeRoomSyncForceReleaseTimer();
    this.authoritativeRoomSyncForceReleaseTimer = setTimeout(() => {
      if (token === this.authoritativeRoomSyncToken && this.authoritativeRoomSyncing) {
        this.finishAuthoritativeRoomSync();
      }
    }, AUTHORITATIVE_ROOM_SYNC_BLOCK_MS + 120) as unknown as number;
    const pullOrTimeout = async () => {
      return Promise.race([
        forcePullRoomAsync(id),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), AUTHORITATIVE_ROOM_SYNC_BLOCK_MS);
        }),
      ]);
    };
    try {
      await pullOrTimeout();
      if (token !== this.authoritativeRoomSyncToken) {
        return;
      }
      await this.loadRoom(id, true, true);
    } finally {
      if (token === this.authoritativeRoomSyncToken) {
        this.finishAuthoritativeRoomSync();
      }
    }
  },

  isDecidingSetEightPendingActive(): boolean {
    return false;
  },

  notifyDecidingSetEightPending() {
    return;
  },

  isDecidingSetEightChoiceActive(): boolean {
    return !!this.decidingSetEightChoiceActive;
  },

  notifyDecidingSetEightChoiceActive() {
    const now = Date.now();
    if (now - this.decidingSetEightBlockedToastAt < 900) {
      return;
    }
    this.decidingSetEightBlockedToastAt = now;
    showToastHint("请先处理决胜局8分换边");
  },

  scheduleDecidingSetEightModal(_roomId?: string) {
    return;
  },

  maybeShowDecidingSetEightModal(_roomId?: string) {
    return;
  },

  resolveMatchReturnState(): "prestart" | "playing" {
    return this.data.canStartMatch ? "prestart" : "playing";
  },

  buildLineupDisplayPatch(teamAPlayersRaw: PlayerSlot[], teamBPlayersRaw: PlayerSlot[], isSwappedRaw: boolean) {
    const teamAPlayers = ensureTeamPlayerOrder(teamAPlayersRaw || []);
    const teamBPlayers = ensureTeamPlayerOrder(teamBPlayersRaw || []);
    const teamASide: TeamCode = isSwappedRaw ? "B" : "A";
    const fallbackDisplayA = markDisplayPlayersByLiberoRoster(teamAPlayers, this.data.teamALiberoRosterNos || []);
    const fallbackDisplayB = markDisplayPlayersByLiberoRoster(teamBPlayers, this.data.teamBLiberoRosterNos || []);
    const useFixedDisplayRole = this.isPlayerCardsEditable();
    const displayA = useFixedDisplayRole
      ? applyDisplayRoleMapByPos(teamAPlayers, this.ensureEditDisplayRoleMap("A", fallbackDisplayA))
      : fallbackDisplayA;
    const displayB = useFixedDisplayRole
      ? applyDisplayRoleMapByPos(teamBPlayers, this.ensureEditDisplayRoleMap("B", fallbackDisplayB))
      : fallbackDisplayB;
    const aRows = buildTeamRows(displayA);
    const bRows = buildTeamRows(displayB);
    return {
      teamAPlayers: teamAPlayers,
      teamBPlayers: teamBPlayers,
      isSwapped: isSwappedRaw,
      teamASideText: isSwappedRaw ? "右场区" : "左场区",
      teamBSideText: isSwappedRaw ? "左场区" : "右场区",
      teamALibero: aRows.libero,
      teamAMainGrid: buildMainGridByOrder(displayA, getMainOrderForTeam("A", teamASide)),
      teamBLibero: bRows.libero,
      teamBMainGrid: buildMainGridByOrder(displayB, getMainOrderForTeam("B", teamASide)),
    };
  },

  buildDisplayRoleMapFromCurrentLayout(team: TeamCode): PlayerDisplayRoleMap {
    const map: PlayerDisplayRoleMap = {};
    const add = (item?: PlayerSlot | null) => {
      if (!item || !isPosition(item.pos)) {
        return;
      }
      map[item.pos] = {
        isLibero: !!item.isLibero,
        liberoTag: item.liberoTag === "L1" || item.liberoTag === "L2" ? item.liberoTag : "",
      };
    };
    if (team === "A") {
      (this.data.teamALibero || []).forEach((item) => add(item));
      (this.data.teamAMainGrid || []).forEach((row) => (row || []).forEach((item) => add(item)));
      return map;
    }
    (this.data.teamBLibero || []).forEach((item) => add(item));
    (this.data.teamBMainGrid || []).forEach((row) => (row || []).forEach((item) => add(item)));
    return map;
  },

  ensureEditDisplayRoleMap(team: TeamCode, fallbackDisplayedPlayers: PlayerSlot[]): PlayerDisplayRoleMap {
    if (team === "A") {
      if (this.editDisplayRoleMapA) {
        return this.editDisplayRoleMapA;
      }
      const fromLayout = this.buildDisplayRoleMapFromCurrentLayout("A");
      const map = Object.keys(fromLayout).length
        ? fromLayout
        : buildDisplayRoleMapFromDisplayedPlayers(fallbackDisplayedPlayers || []);
      this.editDisplayRoleMapA = map;
      return map;
    }
    if (this.editDisplayRoleMapB) {
      return this.editDisplayRoleMapB;
    }
    const fromLayout = this.buildDisplayRoleMapFromCurrentLayout("B");
    const map = Object.keys(fromLayout).length
      ? fromLayout
      : buildDisplayRoleMapFromDisplayedPlayers(fallbackDisplayedPlayers || []);
    this.editDisplayRoleMapB = map;
    return map;
  },

  clearActiveAdjustInput() {
    if (this.data.activeAdjustInputKey) {
      this.setData({ activeAdjustInputKey: "" });
    }
    this.suppressInputRefocusUntil = Date.now() + 220;
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    this.inputEditing = false;
    wx.hideKeyboard({
      fail: () => {},
    });
  },

  onMatchBlankTap() {
    if (!this.isPlayerCardsEditable()) {
      return;
    }
    this.clearActiveAdjustInput();
  },

  clearLiveSubDownBadges(force = false) {
    const currentA = (this.data.liveSubDownBadgeA || {}) as Partial<Record<Position, string>>;
    const currentB = (this.data.liveSubDownBadgeB || {}) as Partial<Record<Position, string>>;
    if (!force && Object.keys(currentA).length === 0 && Object.keys(currentB).length === 0) {
      return;
    }
    this.setData({
      liveSubDownBadgeA: {},
      liveSubDownBadgeB: {},
    });
  },

  applyLiveSubDownBadge(team: TeamCode, pos: Position, downNoRaw: string) {
    if (team !== "A" && team !== "B") {
      return;
    }
    if (!isPosition(String(pos))) {
      return;
    }
    const downNo = normalizeSubstituteNumber(String(downNoRaw || ""));
    if (!downNo) {
      return;
    }
    const key = team === "A" ? "liveSubDownBadgeA" : "liveSubDownBadgeB";
    const current =
      ((team === "A" ? this.data.liveSubDownBadgeA : this.data.liveSubDownBadgeB) || {}) as Partial<
        Record<Position, string>
      >;
    const patch: Partial<Record<Position, string>> = {
      ...current,
      [pos]: downNo,
    };
    this.setData({
      [key]: patch,
    } as WechatMiniprogram.Page.DataOption);
  },

  async persistFlowLineupDraftNow(overrides?: {
    teamAPlayers?: PlayerSlot[];
    teamBPlayers?: PlayerSlot[];
    servingTeam?: TeamCode;
    isSwapped?: boolean;
    flowMode?: MatchFlowMode;
    flowReturnState?: MatchFlowReturnState;
    debounceMs?: number;
  }) {
    if (!this.isPlayerCardsEditable()) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    const sanitizePlayersForFlowDraft = (playersRaw: PlayerSlot[]): PlayerSlot[] => {
      const ordered = ensureTeamPlayerOrder(clonePlayerList(playersRaw || []));
      const normalized = ordered.map((slot) => {
        return {
          pos: slot.pos,
          number: normalizeNumberInput(String((slot && slot.number) || "")) || "?",
        };
      });
      return normalizeLiberoSlots(normalized);
    };
    const teamAPlayers = sanitizePlayersForFlowDraft(overrides && overrides.teamAPlayers ? overrides.teamAPlayers : this.data.teamAPlayers || []);
    const teamBPlayers = sanitizePlayersForFlowDraft(overrides && overrides.teamBPlayers ? overrides.teamBPlayers : this.data.teamBPlayers || []);
    const servingTeam: TeamCode = overrides && overrides.servingTeam ? overrides.servingTeam : this.data.servingTeam === "B" ? "B" : "A";
    const isSwapped = overrides && typeof overrides.isSwapped === "boolean" ? !!overrides.isSwapped : !!this.data.isSwapped;
    const flowMode = overrides && overrides.flowMode ? overrides.flowMode : this.data.matchFlowMode;
    const flowReturnState = overrides && overrides.flowReturnState ? overrides.flowReturnState : this.data.matchFlowReturnState;
    const debounceMs = overrides && typeof overrides.debounceMs === "number" ? Math.max(0, Number(overrides.debounceMs) || 0) : 60;
    if (this.flowDraftPersistTimer) {
      clearTimeout(this.flowDraftPersistTimer);
      this.flowDraftPersistTimer = 0;
    }
    this.flowDraftPersistTimer = setTimeout(() => {
      this.flowDraftPersistTimer = 0;
      void updateRoomAsync(
        roomId,
        (room) => {
          if (!room || !room.match || !room.teamA || !room.teamB || room.match.isFinished) {
            return room;
          }
          // 防止“编辑中的旧 blur 草稿”在退出编辑/局间配置后把新状态反写回去。
          if (String((room.match as any).flowMode || "normal") !== flowMode) {
            return room;
          }
          room.teamA.players = clonePlayerList(teamAPlayers);
          room.teamB.players = clonePlayerList(teamBPlayers);
          room.match.servingTeam = servingTeam;
          room.match.isSwapped = isSwapped;
          (room.match as any).flowMode = flowMode;
          (room.match as any).flowReturnState = flowReturnState;
          (room.match as any).flowUpdatedAt = Date.now();
          return room;
        },
        { awaitCloud: false }
      );
    }, debounceMs) as unknown as number;
  },

  async setFlowMode(mode: MatchFlowMode, returnState?: MatchFlowReturnState) {
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    if (this.flowModeUpdating) {
      return;
    }
    this.flowModeUpdating = true;
    const flowChanged = this.data.matchFlowMode !== mode;
    const nextReturn = returnState || this.data.matchFlowReturnState;
    if (mode === "edit_players" || mode === "between_sets") {
      const fallbackDisplayA = markDisplayPlayersByLiberoRoster(
        ensureTeamPlayerOrder(this.data.teamAPlayers || []),
        this.data.teamALiberoRosterNos || []
      );
      const fallbackDisplayB = markDisplayPlayersByLiberoRoster(
        ensureTeamPlayerOrder(this.data.teamBPlayers || []),
        this.data.teamBLiberoRosterNos || []
      );
      void this.ensureEditDisplayRoleMap("A", fallbackDisplayA);
      void this.ensureEditDisplayRoleMap("B", fallbackDisplayB);
    } else {
      this.editDisplayRoleMapA = null;
      this.editDisplayRoleMapB = null;
    }
    if (flowChanged) {
      await this.startFlowModeSwitchOutIfNeeded(mode);
    }
    if (mode !== "normal") {
      this.clearLiveSubDownBadges();
    }
    // 先本地切换，确保进入编辑/局间配置后立即可输入，不依赖云端往返时序。
    this.setData({
      matchFlowMode: mode,
      matchFlowReturnState: nextReturn,
      playerCardsEditable: !!this.data.hasOperationAuthority && (mode === "edit_players" || mode === "between_sets"),
    });
    if (flowChanged) {
      this.finishFlowModeSwitchIn(true);
    }
    this.flowModeUpdating = false;
    setTimeout(() => {
      void updateRoomAsync(
        roomId,
        (room) => {
          if (!room || !room.match || room.match.isFinished) {
            return room;
          }
          (room.match as any).flowMode = mode;
          (room.match as any).flowReturnState = nextReturn;
          (room.match as any).flowUpdatedAt = Date.now();
          if (mode !== "between_sets") {
            delete (room.match as any).lineupAdjustDraft;
          }
          return room;
        },
        { awaitCloud: false }
      );
    }, 0);
  },

  async enterEditPlayersMode() {
    if (!this.data.hasOperationAuthority) {
      showToastHint("请先接管后继续");
      return;
    }
    if (this.data.showSetEndModal || this.data.isMatchFinished) {
      return;
    }
    const returnState = this.resolveMatchReturnState();
    this.flowBaseTeamAPlayers = clonePlayerList(this.data.teamAPlayers || []);
    this.flowBaseTeamBPlayers = clonePlayerList(this.data.teamBPlayers || []);
    this.flowBaseServingTeam = this.data.servingTeam === "B" ? "B" : "A";
    this.flowBaseIsSwapped = !!this.data.isSwapped;
    this.flowPlayersDirty = false;
    this.clearActiveAdjustInput();
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    this.inputEditing = false;
    await this.setFlowMode("edit_players", returnState);
    this.setData({
      showSubstitutionPanel: false,
      substitutionPanelClosing: false,
      showSubMatchLogPopover: false,
      subMatchLogPopoverClosing: false,
      showLogPanel: false,
      logPanelClosing: false,
    });
  },

  buildCaptainConfirmDataFromCurrent(options?: { scopedTeam?: "" | TeamCode }) {
    const scopedTeam: "" | TeamCode =
      options && options.scopedTeam === "B" ? "B" : options && options.scopedTeam === "A" ? "A" : "";
    const readonlyA = scopedTeam === "B";
    const readonlyB = scopedTeam === "A";
    const teamASide: TeamCode = this.data.isSwapped ? "B" : "A";
    const teamAPlayers = ensureTeamPlayerOrder(this.data.teamAPlayers || []);
    const teamBPlayers = ensureTeamPlayerOrder(this.data.teamBPlayers || []);
    const teamAInitial = normalizeNumberInput(String(this.data.teamAInitialCaptainNo || ""));
    const teamBInitial = normalizeNumberInput(String(this.data.teamBInitialCaptainNo || ""));
    const currentA = normalizeNumberInput(String(this.data.teamACaptainNo || ""));
    const currentB = normalizeNumberInput(String(this.data.teamBCaptainNo || ""));
    const teamALock = !!teamAInitial && isNumberInMain(teamAPlayers, teamAInitial);
    const teamBLock = !!teamBInitial && isNumberInMain(teamBPlayers, teamBInitial);
    const selectedMainA = teamALock ? teamAInitial : isNumberInMain(teamAPlayers, currentA) ? currentA : "";
    const selectedMainB = teamBLock ? teamBInitial : isNumberInMain(teamBPlayers, currentB) ? currentB : "";
    const selectedA = readonlyA ? (isNumberInMain(teamAPlayers, currentA) ? currentA : selectedMainA) : selectedMainA;
    const selectedB = readonlyB ? (isNumberInMain(teamBPlayers, currentB) ? currentB : selectedMainB) : selectedMainB;
    return {
      captainConfirmTeamAMainGrid: buildMainGridByOrder(
        markDisplayPlayersByLiberoRoster(teamAPlayers, this.data.teamALiberoRosterNos || []),
        getMainOrderForTeam("A", teamASide)
      ),
      captainConfirmTeamALibero: buildTeamRows(markDisplayPlayersByLiberoRoster(teamAPlayers, this.data.teamALiberoRosterNos || [])).libero,
      captainConfirmTeamBMainGrid: buildMainGridByOrder(
        markDisplayPlayersByLiberoRoster(teamBPlayers, this.data.teamBLiberoRosterNos || []),
        getMainOrderForTeam("B", teamASide)
      ),
      captainConfirmTeamBLibero: buildTeamRows(markDisplayPlayersByLiberoRoster(teamBPlayers, this.data.teamBLiberoRosterNos || [])).libero,
      captainConfirmSelectedA: selectedA,
      captainConfirmSelectedB: selectedB,
      captainConfirmLockA: teamALock,
      captainConfirmLockB: teamBLock,
      captainConfirmScopedTeam: scopedTeam,
      captainConfirmReadonlyA: readonlyA,
      captainConfirmReadonlyB: readonlyB,
    };
  },

  clearCaptainConfirmContentSwitchTimer() {
    if (!this.captainConfirmContentSwitchTimer) {
      return;
    }
    clearTimeout(this.captainConfirmContentSwitchTimer);
    this.captainConfirmContentSwitchTimer = 0;
  },

  triggerCaptainConfirmContentSwitchAnimation() {
    this.clearCaptainConfirmContentSwitchTimer();
    if (!this.data.captainConfirmContentSwitching) {
      this.setData({ captainConfirmContentSwitching: true });
    }
    this.captainConfirmContentSwitchTimer = setTimeout(() => {
      this.captainConfirmContentSwitchTimer = 0;
      if (this.data.captainConfirmContentSwitching) {
        this.setData({ captainConfirmContentSwitching: false });
      }
    }, MODAL_ANIM_MS) as unknown as number;
  },

  openCaptainConfirmModal(reason: CaptainConfirmReason, options?: CaptainConfirmOpenOptions) {
    if (!this.data.captainModeEnabled) {
      return;
    }
    this.captainConfirmReason = reason;
    const showCancel = !!(options && options.showCancel);
    const scopedTeam: "" | TeamCode =
      options && options.scopedTeam === "B" ? "B" : options && options.scopedTeam === "A" ? "A" : "";
    const switchFromSubPanel = !!(options && options.switchFromSubPanel);
    const showPanel = () => {
      this.clearCaptainConfirmModalCloseTimer();
      this.clearCaptainConfirmContentSwitchTimer();
      const nextData: Record<string, unknown> = {
        ...this.buildCaptainConfirmDataFromCurrent({ scopedTeam }),
        captainConfirmShowCancel: showCancel,
        captainConfirmModalClosing: false,
        showCaptainConfirmModal: true,
      };
      if (switchFromSubPanel) {
        nextData.showSubstitutionPanel = false;
        nextData.substitutionPanelClosing = false;
        nextData.showSubMatchLogPopover = false;
        nextData.subMatchLogPopoverClosing = false;
        nextData.captainConfirmContentSwitching = true;
      }
      this.setData({
        ...(nextData as any),
      });
      if (switchFromSubPanel) {
        this.captainConfirmContentSwitchTimer = setTimeout(() => {
          this.captainConfirmContentSwitchTimer = 0;
          if (this.data.captainConfirmContentSwitching) {
            this.setData({ captainConfirmContentSwitching: false });
          }
        }, MODAL_ANIM_MS) as unknown as number;
      } else if (this.data.captainConfirmContentSwitching) {
        this.setData({
          captainConfirmContentSwitching: false,
        });
      }
    };
    this.syncCaptainConfirmPanelSizeFromSubPanel(showPanel);
  },

  openForcedCaptainConfirmAfterSubstitution(team: TeamCode, options?: { switchFromSubPanel?: boolean }) {
    if (!this.data.captainModeEnabled) {
      return;
    }
    this.openCaptainConfirmModal("post_sub", {
      showCancel: false,
      scopedTeam: team,
      switchFromSubPanel: !!(options && options.switchFromSubPanel),
    });
  },

  shouldForceCaptainReconfirm(
    _team: TeamCode,
    beforePlayers: PlayerSlot[],
    afterPlayers: PlayerSlot[],
    captainNoRaw: string,
    teamInitialCaptainNoRaw?: string
  ): boolean {
    if (!this.data.captainModeEnabled) {
      return false;
    }
    // 赛前尚未确认场上队长时，不触发“重新选择场上队长”弹窗。
    if (!this.data.preStartCaptainConfirmed) {
      return false;
    }
    const captainNo = normalizeNumberInput(String(captainNoRaw || ""));
    const teamInitialCaptainNo = normalizeNumberInput(String(teamInitialCaptainNoRaw || ""));
    // 条件1：当前场上队长被换下（不在场上6人，或已不在场上）
    let currentCaptainMovedOut = false;
    if (captainNo) {
      const beforeInMain = isNumberInMain(beforePlayers || [], captainNo);
      if (beforeInMain) {
        const afterInMain = isNumberInMain(afterPlayers || [], captainNo);
        const stillOnCourt = isNumberOnCourt(afterPlayers || [], captainNo);
        currentCaptainMovedOut = !afterInMain || !stillOnCourt;
      }
    }
    // 条件2：真实队长被换上到场上6人（可能造成“双队长”，必须重选）
    let initialCaptainMovedInMain = false;
    if (teamInitialCaptainNo) {
      const beforeInitialInMain = isNumberInMain(beforePlayers || [], teamInitialCaptainNo);
      const afterInitialInMain = isNumberInMain(afterPlayers || [], teamInitialCaptainNo);
      initialCaptainMovedInMain = !beforeInitialInMain && afterInitialInMain;
    }
    return currentCaptainMovedOut || initialCaptainMovedInMain;
  },

  getTeamCurrentCaptainNoFromRoom(room: any, team: TeamCode): string {
    if (!isCaptainModeEnabledFromSettings(room && room.settings)) {
      return "";
    }
    if (!room || !room.match) {
      return normalizeNumberInput(String(team === "A" ? this.data.teamACaptainNo || "" : this.data.teamBCaptainNo || ""));
    }
    const key = team === "A" ? "teamACurrentCaptainNo" : "teamBCurrentCaptainNo";
    const teamObj = team === "A" ? room.teamA : room.teamB;
    const captainFromMatch = normalizeNumberInput(String((room.match as any)[key] || ""));
    if (captainFromMatch) {
      return captainFromMatch;
    }
    const captainFromData = normalizeNumberInput(String(team === "A" ? this.data.teamACaptainNo || "" : this.data.teamBCaptainNo || ""));
    if (captainFromData) {
      return captainFromData;
    }
    return normalizeNumberInput(String((teamObj && (teamObj as any).captainNo) || ""));
  },

  resolveCaptainConfirmReadonlyToast(team: TeamCode): string {
    const scopedTeam: "" | TeamCode =
      this.data.captainConfirmScopedTeam === "B" ? "B" : this.data.captainConfirmScopedTeam === "A" ? "A" : "";
    if (!scopedTeam) {
      return "";
    }
    if (scopedTeam === team) {
      return "";
    }
    return "当前操作不涉及到此队";
  },

  getCaptainConfirmSelectedNumber(team: TeamCode): string {
    return normalizeNumberInput(String(team === "A" ? this.data.captainConfirmSelectedA || "" : this.data.captainConfirmSelectedB || ""));
  },

  isCaptainConfirmScopedTeam(team: TeamCode): boolean {
    const scopedTeam: "" | TeamCode =
      this.data.captainConfirmScopedTeam === "B" ? "B" : this.data.captainConfirmScopedTeam === "A" ? "A" : "";
    return !!scopedTeam && scopedTeam === team;
  },

  isCaptainConfirmTeamReadonly(team: TeamCode): boolean {
    const scopedTeam: "" | TeamCode =
      this.data.captainConfirmScopedTeam === "B" ? "B" : this.data.captainConfirmScopedTeam === "A" ? "A" : "";
    if (!scopedTeam) {
      return false;
    }
    return scopedTeam !== team;
  },

  normalizeCaptainConfirmScopedTeam(): "" | TeamCode {
    if (this.data.captainConfirmScopedTeam === "B") {
      return "B";
    }
    if (this.data.captainConfirmScopedTeam === "A") {
      return "A";
    }
    return "";
  },

  closeCaptainConfirmModalAnimated() {
    if (!this.data.showCaptainConfirmModal && !this.data.captainConfirmModalClosing) {
      return;
    }
    this.clearCaptainConfirmModalCloseTimer();
    this.clearCaptainConfirmContentSwitchTimer();
    this.setData({
      showCaptainConfirmModal: false,
      captainConfirmModalClosing: true,
      captainConfirmContentSwitching: false,
    });
    this.captainConfirmModalCloseTimer = setTimeout(() => {
      this.captainConfirmModalCloseTimer = 0;
      if (!this.data.showCaptainConfirmModal && this.data.captainConfirmModalClosing) {
        this.setData({
          captainConfirmModalClosing: false,
          captainConfirmShowCancel: false,
          captainConfirmScopedTeam: "",
          captainConfirmReadonlyA: false,
          captainConfirmReadonlyB: false,
        });
      }
    }, MODAL_ANIM_MS) as unknown as number;
  },

  isLiberoSwapEnabled(): boolean {
    if (!this.data.hasOperationAuthority) {
      return false;
    }
    if (this.isMatchInteractionLocked()) {
      return false;
    }
    if (this.data.showSetEndModal) {
      return false;
    }
    if (this.data.isMatchFinished) {
      return false;
    }
    return true;
  },

  getTouchClientPoint(e: WechatMiniprogram.TouchEvent): { x: number; y: number } | null {
    const t =
      (e.changedTouches && e.changedTouches[0]) ||
      (e.touches && e.touches[0]) ||
      null;
    if (!t) {
      return null;
    }
    const x = typeof (t as any).clientX === "number" ? Number((t as any).clientX) : Number((t as any).pageX);
    const y = typeof (t as any).clientY === "number" ? Number((t as any).clientY) : Number((t as any).pageY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  },

  buildSwapDragGhostStyle(
    point: { x: number; y: number },
    size?: null | { width: number; height: number }
  ): string {
    const x = Number(point && point.x);
    const y = Number(point && point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return "";
    }
    const widthRaw = Number((size && size.width) || 70);
    const heightRaw = Number((size && size.height) || 58);
    const width = Number.isFinite(widthRaw) && widthRaw > 1 ? widthRaw : 70;
    const height = Number.isFinite(heightRaw) && heightRaw > 1 ? heightRaw : 58;
    return (
      "left:" +
      String(x) +
      "px;top:" +
      String(y) +
      "px;width:" +
      String(width) +
      "px;height:" +
      String(height) +
      "px;"
    );
  },

  updateSwapDragGhostByPoint(point: { x: number; y: number }) {
    this.swapDragLastPoint = { x: point.x, y: point.y };
    const style = this.buildSwapDragGhostStyle(point, this.swapDragGhostSize);
    if (!style || style === this.data.swapDragGhostStyle) {
      return;
    }
    this.setData({
      swapDragGhostStyle: style,
    });
  },

  measureSwapSourceCard(team: TeamCode, pos: Position): Promise<null | { width: number; height: number }> {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery().in(this);
      query.select("#swap-card-" + team + "-" + pos).boundingClientRect();
      query.exec((res) => {
        const rect = Array.isArray(res) ? (res[0] as WechatMiniprogram.BoundingClientRectCallbackResult | null) : null;
        if (
          !rect ||
          typeof rect.width !== "number" ||
          typeof rect.height !== "number" ||
          rect.width <= 1 ||
          rect.height <= 1
        ) {
          resolve(null);
          return;
        }
        resolve({
          width: rect.width,
          height: rect.height,
        });
      });
    });
  },

  clearSwapDragVisual() {
    this.swapDragStart = null;
    this.swapDragLastPoint = null;
    this.swapDragGhostSize = null;
    if (
      !this.data.swapDragActive &&
      !this.data.swapDragTeam &&
      !this.data.swapDragPos &&
      !this.data.swapDragSourceIsLibero &&
      !this.data.swapDragSourceInMain &&
      (!this.data.swapDragTargetMainPoses || this.data.swapDragTargetMainPoses.length === 0) &&
      !this.data.swapDragTargetI &&
      !this.data.swapDragTargetII &&
      !this.data.swapDragTargetIII &&
      !this.data.swapDragTargetIV &&
      !this.data.swapDragTargetV &&
      !this.data.swapDragTargetVI &&
      !this.data.swapDragTargetL1 &&
      !this.data.swapDragTargetL2 &&
      !this.data.swapDragGhostVisible &&
      !this.data.swapDragGhostStyle &&
      !this.data.swapDragGhostNumber &&
      !this.data.swapDragGhostPos &&
      !this.data.swapDragGhostTeam &&
      !this.data.swapDragGhostIsCurrentCaptain &&
      !this.data.swapDragGhostIsInitialCaptain &&
      !this.data.swapDragGhostIsLibero
    ) {
      return;
    }
    this.setData({
      swapDragActive: false,
      swapDragTeam: "",
      swapDragPos: "",
      swapDragSourceIsLibero: false,
      swapDragSourceInMain: false,
      swapDragTargetMainPoses: [],
      swapDragTargetI: false,
      swapDragTargetII: false,
      swapDragTargetIII: false,
      swapDragTargetIV: false,
      swapDragTargetV: false,
      swapDragTargetVI: false,
      swapDragTargetL1: false,
      swapDragTargetL2: false,
      swapDragGhostVisible: false,
      swapDragGhostStyle: "",
      swapDragGhostNumber: "",
      swapDragGhostPos: "",
      swapDragGhostTeam: "",
      swapDragGhostIsCurrentCaptain: false,
      swapDragGhostIsInitialCaptain: false,
      swapDragGhostIsLibero: false,
    });
  },

  clearQuickSubFlashTimer() {
    if (!this.quickSubFlashTimer) {
      return;
    }
    clearTimeout(this.quickSubFlashTimer);
    this.quickSubFlashTimer = 0;
  },

  clearFlowSwitchInTimer() {
    if (!this.flowSwitchInTimer) {
      return;
    }
    clearTimeout(this.flowSwitchInTimer);
    this.flowSwitchInTimer = 0;
  },

  clearSetEndModalCloseTimer() {
    if (!this.setEndModalCloseTimer) {
      return;
    }
    clearTimeout(this.setEndModalCloseTimer);
    this.setEndModalCloseTimer = 0;
  },

  clearLogPanelCloseTimer() {
    if (!this.logPanelCloseTimer) {
      return;
    }
    clearTimeout(this.logPanelCloseTimer);
    this.logPanelCloseTimer = 0;
  },

  clearSubstitutionPanelCloseTimer() {
    if (!this.substitutionPanelCloseTimer) {
      return;
    }
    clearTimeout(this.substitutionPanelCloseTimer);
    this.substitutionPanelCloseTimer = 0;
  },

  clearCaptainConfirmModalCloseTimer() {
    if (!this.captainConfirmModalCloseTimer) {
      return;
    }
    clearTimeout(this.captainConfirmModalCloseTimer);
    this.captainConfirmModalCloseTimer = 0;
  },

  clearSubMatchLogPopoverCloseTimer() {
    if (!this.subMatchLogPopoverCloseTimer) {
      return;
    }
    clearTimeout(this.subMatchLogPopoverCloseTimer);
    this.subMatchLogPopoverCloseTimer = 0;
  },

  clearSubModeSwitchTimer() {
    if (!this.subModeSwitchTimer) {
      return;
    }
    clearTimeout(this.subModeSwitchTimer);
    this.subModeSwitchTimer = 0;
  },

  clearSubReasonSwitchTimer() {
    if (!this.subReasonSwitchTimer) {
      return;
    }
    clearTimeout(this.subReasonSwitchTimer);
    this.subReasonSwitchTimer = 0;
  },

  clearSubRecordTabSwitchTimer() {
    if (!this.subRecordTabSwitchTimer) {
      return;
    }
    clearTimeout(this.subRecordTabSwitchTimer);
    this.subRecordTabSwitchTimer = 0;
  },

  clearSubRecordContentSwitchTimer() {
    if (!this.subRecordContentSwitchTimer) {
      return;
    }
    clearTimeout(this.subRecordContentSwitchTimer);
    this.subRecordContentSwitchTimer = 0;
  },

  clearLogContentSwitchTimer() {
    if (!this.logContentSwitchTimer) {
      return;
    }
    clearTimeout(this.logContentSwitchTimer);
    this.logContentSwitchTimer = 0;
  },

  triggerLogContentSwitchAnimation() {
    this.clearLogContentSwitchTimer();
    const start = () => {
      this.setData({ logContentSwitching: true });
      this.logContentSwitchTimer = setTimeout(() => {
        this.logContentSwitchTimer = 0;
        if (this.data.logContentSwitching) {
          this.setData({ logContentSwitching: false });
        }
      }, SUB_RECORD_SWITCH_ANIM_MS) as unknown as number;
    };
    if (this.data.logContentSwitching) {
      this.setData({ logContentSwitching: false }, start);
      return;
    }
    start();
  },

  onToggleSubRecordTabMenu() {
    this.setData({
      showSubRecordTabMenu: !this.data.showSubRecordTabMenu,
    });
  },

  triggerSubModeSwitchAnimation() {
    this.clearSubModeSwitchTimer();
    const start = () => {
      this.setData({ subModeSwitching: true });
      this.subModeSwitchTimer = setTimeout(() => {
        this.subModeSwitchTimer = 0;
        if (this.data.subModeSwitching) {
          this.setData({ subModeSwitching: false });
        }
      }, SEG_SWITCH_ANIM_MS) as unknown as number;
    };
    if (this.data.subModeSwitching) {
      this.setData({ subModeSwitching: false }, start);
      return;
    }
    start();
  },

  triggerSubReasonSwitchAnimation() {
    this.clearSubReasonSwitchTimer();
    const start = () => {
      this.setData({ subReasonSwitching: true });
      this.subReasonSwitchTimer = setTimeout(() => {
        this.subReasonSwitchTimer = 0;
        if (this.data.subReasonSwitching) {
          this.setData({ subReasonSwitching: false });
        }
      }, SEG_SWITCH_ANIM_MS) as unknown as number;
    };
    if (this.data.subReasonSwitching) {
      this.setData({ subReasonSwitching: false }, start);
      return;
    }
    start();
  },

  triggerSubRecordTabSwitchAnimation() {
    this.clearSubRecordTabSwitchTimer();
    const start = () => {
      this.setData({
        subRecordPickerSwitching: true,
      });
      this.subRecordTabSwitchTimer = setTimeout(() => {
        this.subRecordTabSwitchTimer = 0;
        if (this.data.subRecordPickerSwitching) {
          this.setData({
            subRecordPickerSwitching: false,
          });
        }
      }, SUB_RECORD_SWITCH_ANIM_MS) as unknown as number;
    };
    if (this.data.subRecordPickerSwitching) {
      this.setData({
        subRecordPickerSwitching: false,
      }, start);
      return;
    }
    start();
  },

  triggerSubRecordContentSwitchAnimation() {
    this.clearSubRecordContentSwitchTimer();
    const start = () => {
      this.setData({
        subRecordContentSwitching: true,
      });
      this.subRecordContentSwitchTimer = setTimeout(() => {
        this.subRecordContentSwitchTimer = 0;
        if (this.data.subRecordContentSwitching) {
          this.setData({
            subRecordContentSwitching: false,
          });
        }
      }, SUB_RECORD_SWITCH_ANIM_MS) as unknown as number;
    };
    if (this.data.subRecordContentSwitching) {
      this.setData({
        subRecordContentSwitching: false,
      }, start);
      return;
    }
    start();
  },

  switchSubRecordTab(tab: SubRecordTab) {
    if (tab === this.data.subRecordTab) {
      this.setData({ showSubRecordTabMenu: false });
      return;
    }
    this.clearSubRecordTabSwitchTimer();
    this.setData({
      showSubRecordTabMenu: false,
      subRecordTab: tab,
      subRecordTabIndex: getSubRecordTabIndex(tab),
      subRecordPickerSwitching: false,
      subRecordContentSwitching: false,
    }, () => {
      this.triggerSubRecordTabSwitchAnimation();
      this.triggerSubRecordContentSwitchAnimation();
    });
  },

  closeLogPanelAnimated() {
    if (!this.data.showLogPanel && !this.data.logPanelClosing) {
      return;
    }
    this.clearLogPanelCloseTimer();
    this.setData({
      showLogPanel: false,
      logPanelClosing: true,
    });
    this.logPanelCloseTimer = setTimeout(() => {
      this.logPanelCloseTimer = 0;
      if (!this.data.showLogPanel && this.data.logPanelClosing) {
        this.setData({ logPanelClosing: false });
      }
    }, MODAL_ANIM_MS) as unknown as number;
  },

  closeSubMatchLogPopoverAnimated() {
    if (!this.data.showSubMatchLogPopover && !this.data.subMatchLogPopoverClosing) {
      return;
    }
    this.clearSubRecordTabSwitchTimer();
    this.clearSubRecordContentSwitchTimer();
    this.clearSubMatchLogPopoverCloseTimer();
    this.setData({
      showSubMatchLogPopover: false,
      subMatchLogPopoverClosing: true,
      showSubRecordTabMenu: false,
      subRecordPickerSwitching: false,
      subRecordContentSwitching: false,
    });
    this.subMatchLogPopoverCloseTimer = setTimeout(() => {
      this.subMatchLogPopoverCloseTimer = 0;
      if (!this.data.showSubMatchLogPopover && this.data.subMatchLogPopoverClosing) {
        this.setData({ subMatchLogPopoverClosing: false });
      }
    }, MODAL_ANIM_MS) as unknown as number;
  },

  closeSubstitutionPanelAnimated() {
    if (!this.data.showSubstitutionPanel && !this.data.substitutionPanelClosing) {
      return;
    }
    this.clearSubstitutionDraft();
    this.clearSubModeSwitchTimer();
    this.clearSubReasonSwitchTimer();
    this.clearSubRecordTabSwitchTimer();
    this.clearSubRecordContentSwitchTimer();
    this.clearSubstitutionPanelCloseTimer();
    this.clearSubMatchLogPopoverCloseTimer();
    this.setData({
      showSubstitutionPanel: false,
      substitutionPanelClosing: true,
      showSubMatchLogPopover: false,
      subMatchLogPopoverClosing: false,
    });
    this.substitutionPanelCloseTimer = setTimeout(() => {
      this.substitutionPanelCloseTimer = 0;
      if (!this.data.showSubstitutionPanel && this.data.substitutionPanelClosing) {
        this.setData({
          substitutionPanelClosing: false,
          showSubMatchLogPopover: false,
          subMatchLogPopoverClosing: false,
          subLogPopoverInlineStyle: "",
          showSubRecordTabMenu: false,
          subRecordTab: "normal",
          subRecordTabIndex: getSubRecordTabIndex("normal"),
          subSelectedPos: "",
          subIncomingNoInput: "",
          subIncomingNo: "",
          subIncomingLocked: false,
          subIncomingLockedNo: "",
          subModeSwitching: false,
          subReasonSwitching: false,
          subRecordPickerSwitching: false,
        });
      }
    }, MODAL_ANIM_MS) as unknown as number;
  },

  getFlowSwitchScope(fromMode: MatchFlowMode, toMode: MatchFlowMode): FlowSwitchScope {
    if (fromMode === toMode) {
      return "none";
    }
    if (
      (fromMode === "normal" && toMode === "edit_players") ||
      (fromMode === "edit_players" && toMode === "normal")
    ) {
      return "score_only";
    }
    return "top_all";
  },

  async startFlowModeSwitchOutIfNeeded(nextMode: MatchFlowMode): Promise<boolean> {
    if (this.data.matchFlowMode === nextMode) {
      return false;
    }
    const scope = this.getFlowSwitchScope(this.data.matchFlowMode, nextMode);
    this.clearFlowSwitchInTimer();
    this.setData({
      flowSwitchingOut: true,
      flowSwitchingIn: false,
      flowSwitchScope: scope,
    });
    await this.delayAsync(80);
    return true;
  },

  finishFlowModeSwitchIn(changed: boolean) {
    this.clearFlowSwitchInTimer();
    if (!changed) {
      if (this.data.flowSwitchingOut || this.data.flowSwitchingIn || this.data.flowSwitchScope !== "none") {
        this.setData({
          flowSwitchingOut: false,
          flowSwitchingIn: false,
          flowSwitchScope: "none",
        });
      }
      return;
    }
    this.setData({
      flowSwitchingOut: false,
      flowSwitchingIn: true,
    });
    this.flowSwitchInTimer = setTimeout(() => {
      this.flowSwitchInTimer = 0;
      if (this.data.flowSwitchingIn) {
        this.setData({
          flowSwitchingIn: false,
          flowSwitchScope: "none",
        });
      }
    }, 170) as unknown as number;
  },

  triggerQuickSubFlash(team: TeamCode, pos: Position) {
    const flashKey = team + "-" + pos;
    this.clearQuickSubFlashTimer();
    this.setData({
      quickSubFlashKey: flashKey,
    });
    this.quickSubFlashTimer = setTimeout(() => {
      this.quickSubFlashTimer = 0;
      if (this.data.quickSubFlashKey === flashKey) {
        this.setData({ quickSubFlashKey: "" });
      }
    }, 520) as unknown as number;
  },

  openQuickSubstitutionPanel(team: TeamCode, selectedPos: Position) {
    const currentSetNo = Math.max(1, Number(this.data.setNo || 1));
    const normalCount = countNormalSubstitutionsBySet(this.allLogs, currentSetNo, team);
    const autoSpecial = normalCount >= 6;
    const nextMode: "normal" | "special" = autoSpecial ? "special" : "normal";
    this.syncSubstitutionTeamDisplay(team);
    this.clearSubstitutionPanelCloseTimer();
    this.clearLogPanelCloseTimer();
    this.clearSubMatchLogPopoverCloseTimer();
    this.setData(
      {
        showSubstitutionPanel: true,
        substitutionPanelClosing: false,
        showLogPanel: false,
        logPanelClosing: false,
        showSubMatchLogPopover: false,
        subMatchLogPopoverClosing: false,
        subLogPopoverInlineStyle: "",
        subRecordTab: nextMode === "special" ? "special" : "normal",
        subRecordTabIndex: getSubRecordTabIndex(nextMode === "special" ? "special" : "normal"),
        subMode: nextMode,
        subReason: "injury",
        subNormalPenalty: "none",
        subSelectedPos: selectedPos,
        subIncomingNoInput: "",
        subIncomingNo: "",
        subIncomingLocked: false,
        subIncomingLockedNo: "",
        subModeSwitching: false,
        subReasonSwitching: false,
        subNormalDisabled: autoSpecial,
        subNormalModeLimitLocked: false,
      },
      () => {
        this.syncSubIncomingLockState({
          team,
          selectedPos,
          mode: nextMode,
        });
        this.persistSubstitutionDraft();
      }
    );
    if (autoSpecial) {
      showToastHint("本局普通换人次数已用完，已自动选择特殊换人");
    }
  },

  getLiberoZoneNormalPlayerNormalSubHint(team: TeamCode, pos: Position, numberRaw?: string): string {
    if (!isLiberoPosition(pos)) {
      return "";
    }
    const number = normalizeSubstituteNumber(String(numberRaw || ""));
    if (!number) {
      return "";
    }
    const liberoRoster = normalizeLiberoRosterNumbers(
      team === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
    );
    if (!liberoRoster.length || liberoRoster.indexOf(number) >= 0) {
      return "";
    }
    return NORMAL_SUB_RETURN_TO_MAIN_HINT;
  },

  getLiberoReentryBlockedHint(team: TeamCode, liberoNoRaw?: string): string {
    const liberoNo = normalizeSubstituteNumber(String(liberoNoRaw || ""));
    if (!liberoNo) {
      return "";
    }
    const rawAScore = this.data.isSwapped ? Number(this.data.bScore || 0) : Number(this.data.aScore || 0);
    const rawBScore = this.data.isSwapped ? Number(this.data.aScore || 0) : Number(this.data.bScore || 0);
    return isLiberoReentryLockActive(
      {
        team: this.data.liberoReentryLockTeam,
        liberoNo: this.data.liberoReentryLockNo,
        setNo: this.data.liberoReentryLockSetNo,
        aScore: this.data.liberoReentryLockAScore,
        bScore: this.data.liberoReentryLockBScore,
      },
      team,
      liberoNo,
      this.data.setNo,
      rawAScore,
      rawBScore
    )
      ? LIBERO_REENTRY_SAME_POINT_HINT
      : "";
  },

  tryOpenQuickSubstitutionByDataset(
    dataset: { team?: string; pos?: string } | undefined,
    options?: { fromTouchEnd?: boolean }
  ) {
    if (this.data.matchFlowMode !== "normal") {
      return;
    }
    if (this.isMatchInteractionLocked()) {
      return;
    }
    if (!this.data.hasOperationAuthority) {
      return;
    }
    if (!dataset) {
      return;
    }
    const team = dataset.team === "B" ? "B" : dataset.team === "A" ? "A" : "";
    const rawPos = String(dataset.pos || "");
    if (!team || !isPosition(rawPos)) {
      return;
    }
    const pos = rawPos as Position;
    const players = ensureTeamPlayerOrder(team === "A" ? this.data.teamAPlayers || [] : this.data.teamBPlayers || []);
    const slot = getPlayerByPos(players, pos);
    if (!slot) {
      return;
    }
    const selectedNo = normalizeSubstituteNumber(String(slot.number || ""));
    if (!selectedNo) {
      return;
    }
    const quickSubBlockedHint = this.getLiberoZoneNormalPlayerNormalSubHint(team, pos, selectedNo);
    if (quickSubBlockedHint) {
      showToastHint(quickSubBlockedHint);
      return;
    }
    const liberoRoster = normalizeLiberoRosterNumbers(
      team === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
    );
    if (liberoRoster.indexOf(selectedNo) >= 0) {
      return;
    }
    if (options && options.fromTouchEnd) {
      this.quickSubTapLockUntil = Date.now() + 260;
    }
    this.triggerQuickSubFlash(team, pos);
    this.openQuickSubstitutionPanel(team, pos);
  },

  onPlayerCardTapQuickSub(e: WechatMiniprogram.TouchEvent) {
    this.onAdjustFieldWrapTap(e);
  },

  onSwapCardTouchStart(e: WechatMiniprogram.TouchEvent) {
    if (this.data.matchFlowMode !== "normal") {
      return;
    }
    if (this.isPlayerCardsEditable()) {
      return;
    }
    if (!this.isLiberoSwapEnabled()) {
      return;
    }
    const dataset = (e.currentTarget && e.currentTarget.dataset) as { team?: string; pos?: string };
    const team = dataset && dataset.team === "B" ? "B" : dataset && dataset.team === "A" ? "A" : "";
    const rawPos = String((dataset && dataset.pos) || "");
    if (!team || !isPosition(rawPos)) {
      return;
    }
    const pos = rawPos as Position;
    const point = this.getTouchClientPoint(e);
    if (!point) {
      return;
    }
    const teamPlayers = team === "A" ? this.data.teamAPlayers : this.data.teamBPlayers;
    const teamRoster = normalizeLiberoRosterNumbers(
      team === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
    );
    const source = getPlayerByPos(teamPlayers || [], pos);
    const sourceNo = String((source && source.number) || "?");
    const sourceNoNorm = normalizeNumberInput(sourceNo);
    const captainNoNorm = normalizeNumberInput(team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo);
    const initialCaptainNoNorm = normalizeNumberInput(
      team === "A" ? this.data.teamAInitialCaptainNo : this.data.teamBInitialCaptainNo
    );
    const sourceSlotIsLibero = isLiberoPosition(pos);
    const sourceNumberIsLibero = !!sourceNoNorm && teamRoster.indexOf(sourceNoNorm) >= 0;
    if (!sourceNumberIsLibero) {
      return;
    }
    if (sourceSlotIsLibero) {
      const reentryBlockedHint = this.getLiberoReentryBlockedHint(team, sourceNoNorm);
      if (reentryBlockedHint) {
        showToastHint(reentryBlockedHint);
        return;
      }
    }
    let targetMainPoses: MainPosition[] = [];
    let targetLiberoPoses: Position[] = [];
    if (sourceSlotIsLibero) {
      targetMainPoses = buildSwapTargetMainPositions(teamPlayers || [], teamRoster, pos);
    } else {
      targetLiberoPoses = buildSwapTargetLiberoPositions(teamPlayers || [], teamRoster, pos);
    }
    if (sourceSlotIsLibero && this.data.servingTeam === team) {
      targetMainPoses = targetMainPoses.filter((p) => p !== "I");
    }
    if (!targetMainPoses.length && !targetLiberoPoses.length) {
      return;
    }
    const targetMainSet = new Set(targetMainPoses);
    const targetLiberoSet = new Set(targetLiberoPoses);
    this.swapDragGhostSize = null;
    this.swapDragStart = {
      team,
      pos,
      x: point.x,
      y: point.y,
      sourceIsLiberoSlot: sourceSlotIsLibero,
      sourceInMain: !sourceSlotIsLibero,
    };
    this.swapDragLastPoint = { x: point.x, y: point.y };
    this.setData({
      swapDragActive: true,
      swapDragTeam: team,
      swapDragPos: pos,
      swapDragSourceIsLibero: sourceNumberIsLibero,
      swapDragSourceInMain: !sourceSlotIsLibero,
      swapDragTargetMainPoses: targetMainPoses,
      swapDragTargetI: targetMainSet.has("I"),
      swapDragTargetII: targetMainSet.has("II"),
      swapDragTargetIII: targetMainSet.has("III"),
      swapDragTargetIV: targetMainSet.has("IV"),
      swapDragTargetV: targetMainSet.has("V"),
      swapDragTargetVI: targetMainSet.has("VI"),
      swapDragTargetL1: targetLiberoSet.has("L1" as Position),
      swapDragTargetL2: targetLiberoSet.has("L2" as Position),
      swapDragGhostVisible: true,
      swapDragGhostStyle: this.buildSwapDragGhostStyle(point, null),
      swapDragGhostNumber: sourceNo || "?",
      swapDragGhostPos: pos,
      swapDragGhostTeam: team,
      swapDragGhostIsCurrentCaptain: !!sourceNoNorm && sourceNoNorm === captainNoNorm,
      swapDragGhostIsInitialCaptain: !!sourceNoNorm && sourceNoNorm === initialCaptainNoNorm,
      swapDragGhostIsLibero: sourceNumberIsLibero,
    });
    void this.measureSwapSourceCard(team, pos).then((size: null | { width: number; height: number }) => {
      if (!size || !this.swapDragStart) {
        return;
      }
      if (this.swapDragStart.team !== team || this.swapDragStart.pos !== pos) {
        return;
      }
      this.swapDragGhostSize = size;
      this.updateSwapDragGhostByPoint(this.swapDragLastPoint || point);
    });
  },

  onSwapCardTouchMove(e: WechatMiniprogram.TouchEvent) {
    if (this.data.matchFlowMode !== "normal") {
      return;
    }
    if (this.isPlayerCardsEditable()) {
      return;
    }
    if (!this.swapDragStart || !this.data.swapDragGhostVisible) {
      return;
    }
    const point = this.getTouchClientPoint(e);
    if (!point) {
      return;
    }
    this.updateSwapDragGhostByPoint(point);
  },

  async resolveSwapDropPosByPoint(team: TeamCode, x: number, y: number): Promise<Position | ""> {
    const candidates: Position[] = ALL_POSITIONS.slice();
    return await new Promise<Position | "">((resolve) => {
      const query = wx.createSelectorQuery().in(this);
      candidates.forEach((pos) => {
        query.select("#swap-card-" + team + "-" + pos).boundingClientRect();
      });
      query.exec((res) => {
        const list = Array.isArray(res) ? res : [];
        for (let i = 0; i < candidates.length; i += 1) {
          const rect = list[i] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
          if (
            rect &&
            typeof rect.left === "number" &&
            typeof rect.top === "number" &&
            typeof rect.width === "number" &&
            typeof rect.height === "number"
          ) {
            const right = rect.left + rect.width;
            const bottom = rect.top + rect.height;
            if (x >= rect.left && x <= right && y >= rect.top && y <= bottom) {
              resolve(candidates[i]);
              return;
            }
          }
        }
        resolve("");
      });
    });
  },

  validateLiberoSwapByLocalState(team: TeamCode, fromPos: Position, toPos: Position): string {
    const roster = normalizeLiberoRosterNumbers(
      team === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
    );
    const teamPlayers = ensureTeamPlayerOrder(team === "A" ? this.data.teamAPlayers || [] : this.data.teamBPlayers || []);
    const ruleError = validateLiberoSwapByRule(teamPlayers, roster, fromPos, toPos);
    if (ruleError) {
      return ruleError;
    }
    if (isLiberoPosition(fromPos)) {
      const fromSlot = getPlayerByPos(teamPlayers, fromPos);
      const fromNo = normalizeSubstituteNumber(String((fromSlot && fromSlot.number) || ""));
      const reentryBlockedHint = this.getLiberoReentryBlockedHint(team, fromNo);
      if (reentryBlockedHint) {
        return reentryBlockedHint;
      }
    }
    return "";
  },

  async performLiberoSwap(team: TeamCode, fromPos: Position, toPos: Position) {
    if (!this.isLiberoSwapEnabled()) {
      return;
    }
    const fromIsLibero = isLiberoPosition(fromPos);
    const toIsLibero = isLiberoPosition(toPos);
    if (fromIsLibero === toIsLibero) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    let swapError = "";
    let shouldForceCaptainReconfirmForTeam: "" | TeamCode = "";
    const next = await updateRoomAsync(roomId, (room) => {
      if (!room || !room.match || !room.teamA || !room.teamB) {
        swapError = "房间状态异常";
        return room;
      }
      if (room.match.isFinished) {
        swapError = "比赛已结束，无法替换";
        return room;
      }
      const setEndState = (room.match as any).setEndState;
      if (setEndState && setEndState.active) {
        swapError = "本局已结束，无法替换";
        return room;
      }
      ensureLiberoRosterForCurrentSet(room);
      const rosterKey = team === "A" ? "teamALiberoRoster" : "teamBLiberoRoster";
      const liberoRoster = (((room.match as any)[rosterKey] || []) as string[])
        .map((n) => normalizeNumberInput(String(n || "")))
        .filter(Boolean);
      if (!liberoRoster.length) {
        swapError = "未配置自由人号码";
        return room;
      }
      const teamObj = team === "A" ? room.teamA : room.teamB;
      const players = ensureTeamPlayerOrder(teamObj.players || []);
      const captainNo = this.getTeamCurrentCaptainNoFromRoom(room, team);
      const teamInitialCaptainNo = normalizeNumberInput(
        String((teamObj as any).captainNo || (team === "A" ? this.data.teamAInitialCaptainNo : this.data.teamBInitialCaptainNo) || "")
      );
      const fromSlot = getPlayerByPos(players, fromPos);
      const toSlot = getPlayerByPos(players, toPos);
      if (!fromSlot || !toSlot) {
        swapError = "球员位置异常";
        return room;
      }
      const fromNo = normalizeNumberInput(fromSlot.number || "");
      const toNo = normalizeNumberInput(toSlot.number || "");
      if (!fromNo || !toNo) {
        swapError = "号码未填写，无法替换";
        return room;
      }
      if (
        fromIsLibero &&
        isLiberoReentryLockActive(
          (room.match as any).liberoReentryLock,
          team,
          fromNo,
          room.match.setNo,
          room.match.aScore,
          room.match.bScore
        )
      ) {
        swapError = LIBERO_REENTRY_SAME_POINT_HINT;
        return room;
      }
      const ruleError = validateLiberoSwapByRule(players, liberoRoster, fromPos, toPos);
      if (ruleError) {
        swapError = ruleError;
        return room;
      }
      const servingTeam = room.match.servingTeam === "B" ? "B" : "A";
      if (fromIsLibero && toPos === "I" && servingTeam === team) {
        swapError = "发球队自由人不能替换发球位";
        return room;
      }
      const nextPlayers = ensureTeamPlayerOrder(players);
      const fromIdx = nextPlayers.findIndex((p) => p.pos === fromPos);
      const toIdx = nextPlayers.findIndex((p) => p.pos === toPos);
      if (fromIdx < 0 || toIdx < 0) {
        swapError = "球员位置异常";
        return room;
      }
      const tmpNo = nextPlayers[fromIdx].number;
      nextPlayers[fromIdx].number = nextPlayers[toIdx].number;
      nextPlayers[toIdx].number = tmpNo;
      if (this.shouldForceCaptainReconfirm(team, players, nextPlayers, captainNo, teamInitialCaptainNo)) {
        shouldForceCaptainReconfirmForTeam = team;
      }
      const opId = createLogId();
      (room.match as any).currentOpId = opId;
      pushUndoSnapshot(room);
      teamObj.players = nextPlayers;
      const teamName = team === "A" ? String(room.teamA.name || "甲") : String(room.teamB.name || "乙");
      const fromInLiberoRoster = liberoRoster.indexOf(fromNo) >= 0;
      const toInLiberoRoster = liberoRoster.indexOf(toNo) >= 0;
      const fromPosIsLibero = isLiberoPosition(fromPos);
      const upNo = fromPosIsLibero ? fromNo : toNo;
      const downNo = fromPosIsLibero ? toNo : fromNo;
      const upIsLibero = fromPosIsLibero ? fromInLiberoRoster : toInLiberoRoster;
      const downIsLibero = fromPosIsLibero ? toInLiberoRoster : fromInLiberoRoster;
      appendMatchLog(
        room,
        "libero_swap",
        teamName +
          "队 自由人常规换人 " +
          buildDirectionalSubRecordText(upNo, downNo, upIsLibero, downIsLibero),
        team,
        opId
      );
      (room.match as any).lastActionOpId = opId;
      return room;
    });
    if (!next) {
      showToastHint("系统繁忙，请重试");
      return;
    }
    if (swapError) {
      showToastHint(swapError);
      return;
    }
    this.applyLocalLineupFromRoom(next);
    await this.loadRoom(roomId, true);
    if (shouldForceCaptainReconfirmForTeam) {
      this.openForcedCaptainConfirmAfterSubstitution(shouldForceCaptainReconfirmForTeam);
    }
  },

  onSwapCardTouchEnd(e: WechatMiniprogram.TouchEvent) {
    if (this.data.matchFlowMode !== "normal") {
      this.clearSwapDragVisual();
      return;
    }
    if (this.isPlayerCardsEditable()) {
      this.clearSwapDragVisual();
      return;
    }
    const start = this.swapDragStart;
    const fallbackPoint = this.swapDragLastPoint;
    const dataset = (e.currentTarget && e.currentTarget.dataset) as { team?: string; pos?: string } | undefined;
    this.clearSwapDragVisual();
    if (!start) {
      this.tryOpenQuickSubstitutionByDataset(dataset, { fromTouchEnd: true });
      return;
    }
    if (!this.isLiberoSwapEnabled()) {
      return;
    }
    const point = this.getTouchClientPoint(e) || fallbackPoint;
    if (!point) {
      return;
    }
    const sourcePos = start.pos;
    const sourceIsLiberoSlot = !!start.sourceIsLiberoSlot;
    void this.enqueueAction(async () => {
      const dropPos = await this.resolveSwapDropPosByPoint(start.team, point.x, point.y);
      if (!dropPos || dropPos === sourcePos) {
        return;
      }
      const dropIsLibero = isLiberoPosition(dropPos);
      if (sourceIsLiberoSlot === dropIsLibero) {
        return;
      }
      if (sourceIsLiberoSlot && dropPos === "I" && this.data.servingTeam === start.team) {
        showToastHint("发球队自由人不能替换发球位");
        return;
      }
      const localError = this.validateLiberoSwapByLocalState(start.team, sourcePos, dropPos);
      if (localError) {
        showToastHint(localError);
        return;
      }
      await this.performLiberoSwap(start.team, sourcePos, dropPos);
    });
  },

  onLoad(query: Record<string, string>) {
    this.actionQueue = Promise.resolve();
    this.statusRouteRedirecting = false;
    this.pageActive = true;
    this.applyNavigationTheme();
    showMiniProgramShareMenu();
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
    this.clientId = ensureClientId();
    this.setData({ roomId: roomId });
    this.syncSafePadding();
    setTimeout(() => {
      this.syncSafePadding();
    }, 80);
    setTimeout(() => {
      this.syncSafePadding();
    }, 260);
    if ((wx as any).onWindowResize) {
      (wx as any).onWindowResize(this.onWindowResize);
    }
    this.bindNetworkStatus();
    this.refreshNetworkState();
    void this.refreshRoomAuthoritatively(roomId);
  },

  onShow() {
    this.pageActive = true;
    this.statusRouteRedirecting = false;
    setKeepScreenOnSafe(true);
    this.syncSafePadding();
    setTimeout(() => {
      this.syncSafePadding();
    }, 80);
    setTimeout(() => {
      this.syncSafePadding();
    }, 260);
    this.applyNavigationTheme();
    showMiniProgramShareMenu();
    this.refreshNetworkState();
    const roomId = String(this.data.roomId || "");
    if (roomId) {
      void this.refreshRoomAuthoritatively(roomId);
    }
    this.startHeartbeat();
    this.startConnWatchdog();
    this.startTimerTick();
    this.startRoomWatch();
    this.startPolling();
    this.scheduleRectCacheWarmup(320);
  },

  onHide() {
    this.pageActive = false;
    if (this.data.showSubstitutionPanel) {
      this.persistSubstitutionDraft();
    }
    if (this.data.showCaptainConfirmModal) {
      this.setData({
        showCaptainConfirmModal: false,
        captainConfirmModalClosing: false,
        captainConfirmShowCancel: false,
        captainConfirmScopedTeam: "",
        captainConfirmReadonlyA: false,
        captainConfirmReadonlyB: false,
        captainConfirmContentSwitching: false,
      });
    }
    this.clearSetEndModalCloseTimer();
    this.clearLogPanelCloseTimer();
    this.clearSubstitutionPanelCloseTimer();
    this.clearCaptainConfirmModalCloseTimer();
    this.clearCaptainConfirmContentSwitchTimer();
    this.clearSubMatchLogPopoverCloseTimer();
    this.clearSubModeSwitchTimer();
    this.clearSubReasonSwitchTimer();
    this.clearSubRecordTabSwitchTimer();
    this.clearLogContentSwitchTimer();
    this.clearAuthoritativeRoomSyncForceReleaseTimer();
    this.clearSwapDragVisual();
    this.clearQuickSubFlashTimer();
    this.clearFlowSwitchInTimer();
    if (this.data.flowSwitchingOut || this.data.flowSwitchingIn || this.data.flowSwitchScope !== "none") {
      this.setData({
        flowSwitchingOut: false,
        flowSwitchingIn: false,
        flowSwitchScope: "none",
      });
    }
    if (this.data.quickSubFlashKey) {
      this.setData({ quickSubFlashKey: "" });
    }
    if (
      this.data.setEndModalClosing ||
      this.data.logPanelClosing ||
      this.data.substitutionPanelClosing ||
      this.data.captainConfirmModalClosing ||
      this.data.captainConfirmContentSwitching ||
      this.data.subMatchLogPopoverClosing ||
      this.data.subModeSwitching ||
      this.data.subReasonSwitching
    ) {
      this.setData({
        setEndModalClosing: false,
        logPanelClosing: false,
        substitutionPanelClosing: false,
        captainConfirmModalClosing: false,
        captainConfirmContentSwitching: false,
        subMatchLogPopoverClosing: false,
        subModeSwitching: false,
        subReasonSwitching: false,
        showSubRecordTabMenu: false,
        subRecordPickerSwitching: false,
        subRecordContentSwitching: false,
        logContentSwitching: false,
      });
    }
    this.hideRoomPassword();
    this.clearActiveAdjustInput();
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    if (this.flowDraftPersistTimer) {
      clearTimeout(this.flowDraftPersistTimer);
      this.flowDraftPersistTimer = 0;
    }
    this.inputEditing = false;
    this.editDisplayRoleMapA = null;
    this.editDisplayRoleMapB = null;
    this.clearPendingRoomLoadRetry();
    this.roomLoadPending = false;
    this.roomLoadPendingForce = false;
    this.hideSetEndLoading();
    if (this.roomMissingLoadingVisible) {
      wx.hideLoading({
        fail: () => {},
      });
      this.roomMissingLoadingVisible = false;
    }
    setKeepScreenOnSafe(false);
    this.clearRectCacheWarmup();
    this.clearRoomMissingRetry();
    this.stopConnWatchdog();
    this.stopRoomWatch();
    this.stopPolling();
    this.stopHeartbeat();
    this.stopTimerTick();
  },

  onUnload() {
    this.pageActive = false;
    if (this.data.showSubstitutionPanel) {
      this.persistSubstitutionDraft();
    }
    this.clearSetEndModalCloseTimer();
    this.clearLogPanelCloseTimer();
    this.clearSubstitutionPanelCloseTimer();
    this.clearCaptainConfirmModalCloseTimer();
    this.clearCaptainConfirmContentSwitchTimer();
    this.clearSubMatchLogPopoverCloseTimer();
    this.clearSubModeSwitchTimer();
    this.clearSubReasonSwitchTimer();
    this.clearSubRecordTabSwitchTimer();
    this.clearSubRecordContentSwitchTimer();
    this.clearLogContentSwitchTimer();
    this.clearAuthoritativeRoomSyncForceReleaseTimer();
    if (this.decidingSetEightPromptTimer) {
      clearTimeout(this.decidingSetEightPromptTimer);
      this.decidingSetEightPromptTimer = 0;
    }
    this.clearSwapDragVisual();
    this.clearQuickSubFlashTimer();
    this.clearFlowSwitchInTimer();
    if (this.data.flowSwitchingOut || this.data.flowSwitchingIn || this.data.flowSwitchScope !== "none") {
      this.setData({
        flowSwitchingOut: false,
        flowSwitchingIn: false,
        flowSwitchScope: "none",
      });
    }
    if (this.data.quickSubFlashKey) {
      this.setData({ quickSubFlashKey: "" });
    }
    if (
      this.data.setEndModalClosing ||
      this.data.logPanelClosing ||
      this.data.substitutionPanelClosing ||
      this.data.captainConfirmModalClosing ||
      this.data.captainConfirmContentSwitching ||
      this.data.subMatchLogPopoverClosing ||
      this.data.subModeSwitching ||
      this.data.subReasonSwitching
    ) {
      this.setData({
        setEndModalClosing: false,
        logPanelClosing: false,
        substitutionPanelClosing: false,
        captainConfirmModalClosing: false,
        captainConfirmContentSwitching: false,
        subMatchLogPopoverClosing: false,
        subModeSwitching: false,
        subReasonSwitching: false,
        showSubRecordTabMenu: false,
        subRecordPickerSwitching: false,
        subRecordContentSwitching: false,
        logContentSwitching: false,
      });
    }
    this.hideRoomPassword();
    this.clearActiveAdjustInput();
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    if (this.flowDraftPersistTimer) {
      clearTimeout(this.flowDraftPersistTimer);
      this.flowDraftPersistTimer = 0;
    }
    this.inputEditing = false;
    this.editDisplayRoleMapA = null;
    this.editDisplayRoleMapB = null;
    this.clearPendingRoomLoadRetry();
    this.roomLoadPending = false;
    this.roomLoadPendingForce = false;
    this.hideSetEndLoading();
    if (this.roomMissingLoadingVisible) {
      wx.hideLoading({
        fail: () => {},
      });
      this.roomMissingLoadingVisible = false;
    }
    setKeepScreenOnSafe(false);
    this.clearRectCacheWarmup();
    this.clearRoomMissingRetry();
    this.stopConnWatchdog();
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
    this.stopRoomWatch();
    this.stopPolling();
    this.stopHeartbeat();
    this.stopTimerTick();
    if ((wx as any).offWindowResize) {
      (wx as any).offWindowResize(this.onWindowResize);
    }
    this.unbindNetworkStatus();
    const roomId = this.data.roomId;
    const clientId = String(this.clientId || ensureClientId());
    leaveRoomAsync(roomId, clientId);
  },

  onShareAppMessage() {
    const roomId = String(this.data.roomId || "");
    const roomPassword = String(this.data.roomPassword || "");
    const hasInvitePayload = /^\d{6}$/.test(roomId) && /^\d{6}$/.test(roomPassword);
    return {
      title: buildShareCardTitle(hasInvitePayload),
      path: hasInvitePayload ? buildJoinSharePath(roomId, roomPassword) : "/pages/home/home",
      imageUrl: SHARE_IMAGE_URL,
    };
  },

  confirmBackToHome() {
    if (this.data.backConfirming) {
      return;
    }
    this.setData({ backConfirming: true });
    wx.showModal({
      title: "退出确认",
      content: "确认退出当前房间？",
      cancelText: "取消",
      confirmText: "退出",
      success: (res) => {
        if (res.confirm) {
          wx.reLaunch({ url: "/pages/home/home" });
          return;
        }
        this.setData({ backConfirming: false });
      },
      fail: () => {
        this.setData({ backConfirming: false });
      },
      complete: () => {
        // 只有未退出时才在这里恢复，确认退出会立刻 reLaunch。
        if (this.data.backConfirming) {
          this.setData({ backConfirming: false });
        }
      },
    });
  },

  onBackPress() {
    this.confirmBackToHome();
    return true;
  },

  async onTakeoverTap() {
    if (this.data.hasOperationAuthority || this.takeoverInFlight) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    const clientId = String(this.clientId || getApp<IAppOption>().globalData.clientId || "");
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
      await this.loadRoom(roomId, true);
    } catch (_e) {
      showToastHint("接管失败，请稍后重试");
    } finally {
      this.takeoverInFlight = false;
    }
  },


  onSetEndModalTap() {},

  async onReconfigurePlayersTap() {
    if (this.data.showSetEndModal || this.data.isMatchFinished) {
      return;
    }
    if (!this.data.hasOperationAuthority) {
      showToastHint("请先接管后继续");
      return;
    }
    if (this.flowModeUpdating || this.setEndActionInFlight) {
      showToastHint("操作处理中，请稍候");
      return;
    }
    await this.enterEditPlayersMode();
  },

  onOpenStartMatchModal() {
    if (!this.data.canStartMatch || this.data.showSetEndModal || this.data.matchFlowMode !== "normal") {
      return;
    }
    if (!this.data.preStartCaptainConfirmed) {
      this.openCaptainConfirmModal("prestart");
      return;
    }
    wx.showModal({
      title: "开始比赛确认",
      content: "开始比赛后将启动本局计时",
      confirmText: "确认",
      cancelText: "取消",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        this.onStartMatchConfirm();
      },
    });
  },

  async onStartMatchConfirm() {
    const roomId = this.data.roomId;
    if (!roomId) {
      return;
    }
    if (this.data.captainModeEnabled && !this.data.preStartCaptainConfirmed) {
      showToastHint("请先确认场上队长");
      return;
    }
    const next = await updateRoomAsync(roomId, (room) => {
      const opId = createLogId();
      (room.match as any).currentOpId = opId;
      if (!room.match || room.match.isFinished) {
        return room;
      }
      if (
        Number(room.match.aScore || 0) === 0 &&
        Number(room.match.bScore || 0) === 0 &&
        Number((room.match as any).setTimerStartAt || 0) <= 0
      ) {
        if (!(room as any).matchStartedAt) {
          (room as any).matchStartedAt = Date.now();
        }
        ensureSetStartLineupSnapshot(room, Math.max(1, Number(room.match.setNo || 1)));
        (room.match as any).setTimerStartAt = Date.now();
        (room.match as any).setTimerElapsedMs = 0;
        appendMatchLog(room, "timer_start", "比赛开始", undefined, opId);
        (room.match as any).lastActionOpId = opId;
      }
      return room;
    });
    if (!next) {
      showToastHint("系统繁忙，请重试");
      return;
    }
    this.loadRoom(roomId, true);
  },

  onOpenCaptainConfirmModal() {
    if (!this.data.captainModeEnabled || !this.data.canStartMatch || this.data.showSetEndModal || this.data.matchFlowMode !== "normal") {
      return;
    }
    this.openCaptainConfirmModal("prestart", { showCancel: true });
  },

  onCloseCaptainConfirmModal() {
    this.closeCaptainConfirmModalAnimated();
  },

  onCaptainConfirmModalTap() {},

  onCaptainConfirmCancel() {
    this.closeCaptainConfirmModalAnimated();
  },

  onCaptainConfirmSelect(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.captainModeEnabled) {
      return;
    }
    const dataset = (e.currentTarget && e.currentTarget.dataset) as { team?: string; number?: string; pos?: string };
    const team = dataset && dataset.team === "B" ? "B" : dataset && dataset.team === "A" ? "A" : "";
    const posRaw = String((dataset && dataset.pos) || "");
    const no = normalizeNumberInput(String((dataset && dataset.number) || ""));
    if (!team) {
      return;
    }
    const readonlyToast = this.resolveCaptainConfirmReadonlyToast(team);
    if (readonlyToast) {
      showToastHint(readonlyToast);
      return;
    }
    if (!isPosition(posRaw) || isLiberoPosition(posRaw as Position)) {
      return;
    }
    if (!no) {
      return;
    }
    if (team === "A") {
      if (this.data.captainConfirmLockA) {
        return;
      }
      this.setData({ captainConfirmSelectedA: no });
      return;
    }
    if (this.data.captainConfirmLockB) {
      return;
    }
    this.setData({ captainConfirmSelectedB: no });
  },

  async onCaptainConfirmContinue() {
    const setNo = Math.max(1, Number(this.data.setNo || 1));
    const roomId = String(this.data.roomId || "");
    const isPostEditReconfirm = this.captainConfirmReason === "post_edit" || this.captainConfirmReason === "post_sub";
    const isPostSubReconfirm = this.captainConfirmReason === "post_sub";
    const scopedTeam = this.normalizeCaptainConfirmScopedTeam();
    if (!roomId || !this.data.hasOperationAuthority) {
      this.closeCaptainConfirmModalAnimated();
      return;
    }
    if (!this.data.captainModeEnabled) {
      this.closeCaptainConfirmModalAnimated();
      return;
    }
    if (this.data.showSetEndModal || this.data.matchFlowMode === "between_sets") {
      this.closeCaptainConfirmModalAnimated();
      return;
    }
    if (!this.data.canStartMatch && !isPostEditReconfirm) {
      this.closeCaptainConfirmModalAnimated();
      return;
    }
    const teamAPlayers = ensureTeamPlayerOrder(this.data.teamAPlayers || []);
    const teamBPlayers = ensureTeamPlayerOrder(this.data.teamBPlayers || []);
    const selectedA = normalizeNumberInput(String(this.data.captainConfirmSelectedA || ""));
    const selectedB = normalizeNumberInput(String(this.data.captainConfirmSelectedB || ""));
    const selectedAInMain = !!selectedA && isNumberInMain(teamAPlayers, selectedA);
    const selectedBInMain = !!selectedB && isNumberInMain(teamBPlayers, selectedB);
    if (!scopedTeam && (!selectedA || !selectedB)) {
      wx.showModal({
        title: "无法继续",
        content: "请先为两队选择场上队长",
        showCancel: false,
        confirmText: "知道了",
      });
      return;
    }
    if (!scopedTeam && (!selectedAInMain || !selectedBInMain)) {
      wx.showModal({
        title: "无法继续",
        content: "场上队长必须从场上6人中选择",
        showCancel: false,
        confirmText: "知道了",
      });
      return;
    }
    if (scopedTeam === "A" && !selectedAInMain) {
      wx.showModal({
        title: "无法继续",
        content: "请先为该队在场上6人中选择场上队长",
        showCancel: false,
        confirmText: "知道了",
      });
      return;
    }
    if (scopedTeam === "B" && !selectedBInMain) {
      wx.showModal({
        title: "无法继续",
        content: "请先为该队在场上6人中选择场上队长",
        showCancel: false,
        confirmText: "知道了",
      });
      return;
    }
    const fallbackA = normalizeNumberInput(String(this.data.teamACaptainNo || ""));
    const fallbackB = normalizeNumberInput(String(this.data.teamBCaptainNo || ""));
    const finalSelectedA = scopedTeam === "B" ? selectedA || fallbackA : selectedA;
    const finalSelectedB = scopedTeam === "A" ? selectedB || fallbackB : selectedB;
    await updateRoomAsync(
      roomId,
      (room) => {
        if (!room || !room.match || !room.teamA || !room.teamB || room.match.isFinished) {
          return room;
        }
        const roomCaptainA = normalizeNumberInput(String((room.match as any).teamACurrentCaptainNo || room.teamA.captainNo || ""));
        const roomCaptainB = normalizeNumberInput(String((room.match as any).teamBCurrentCaptainNo || room.teamB.captainNo || ""));
        (room.match as any).teamACurrentCaptainNo = finalSelectedA || roomCaptainA;
        (room.match as any).teamBCurrentCaptainNo = finalSelectedB || roomCaptainB;
        if (this.data.canStartMatch) {
          (room.match as any).preStartCaptainConfirmed = true;
          (room.match as any).preStartCaptainConfirmSetNo = setNo;
        }
        (room.match as any).flowMode = "normal";
        (room.match as any).flowReturnState = this.data.matchFlowReturnState || "prestart";
        (room.match as any).flowUpdatedAt = Date.now();
        return room;
      },
      { awaitCloud: false }
    );
    const nextPreStartCaptainConfirmed = this.data.canStartMatch ? true : !!this.data.preStartCaptainConfirmed;
    const nextPreStartCaptainConfirmSetNo = this.data.canStartMatch
      ? setNo
      : Math.max(0, Number(this.data.preStartCaptainConfirmSetNo || 0));
    const nextData: Record<string, unknown> = {
      teamACaptainNo: finalSelectedA || fallbackA,
      teamBCaptainNo: finalSelectedB || fallbackB,
      preStartCaptainConfirmed: nextPreStartCaptainConfirmed,
      preStartCaptainConfirmSetNo: nextPreStartCaptainConfirmSetNo,
    };
    if (isPostSubReconfirm) {
      nextData.subSelectedPos = "";
      nextData.subIncomingNoInput = "";
      nextData.subIncomingNo = "";
      nextData.subIncomingLocked = false;
      nextData.subIncomingLockedNo = "";
    }
    this.setData(nextData as any);
    this.closeCaptainConfirmModalAnimated();
    void this.loadRoom(roomId, false, true);
  },

  async onFlowConfirmTap() {
    if (!this.data.hasOperationAuthority) {
      showToastHint("请先接管后继续");
      return;
    }
    if (this.data.matchFlowMode !== "edit_players" && this.data.matchFlowMode !== "between_sets") {
      return;
    }
    this.clearActiveAdjustInput();
    const editedChangedA = !arePlayersSameByPos(
      this.flowBaseTeamAPlayers || this.data.teamAPlayers,
      this.data.teamAPlayers || []
    );
    const editedChangedB = !arePlayersSameByPos(
      this.flowBaseTeamBPlayers || this.data.teamBPlayers,
      this.data.teamBPlayers || []
    );
    this.normalizeEditablePlayersBeforeConfirm();
    const teamAName = String(this.data.teamAName || "甲");
    const teamBName = String(this.data.teamBName || "乙");
    const errA = validateTeamPlayers(this.data.teamAPlayers || [], teamAName);
    if (errA) {
      showBlockHint(errA);
      return;
    }
    const errB = validateTeamPlayers(this.data.teamBPlayers || [], teamBName);
    if (errB) {
      showBlockHint(errB);
      return;
    }
    if (this.data.matchFlowMode !== "edit_players") {
      const setNo = Math.max(1, Number(this.data.setNo || 1));
      const banErrA = getLineupBanBlockMessage(this.allLogs || [], setNo, "A", this.data.teamAPlayers || [], teamAName, {
        includeSetBan: false,
      });
      if (banErrA) {
        showBlockHint(banErrA);
        return;
      }
      const banErrB = getLineupBanBlockMessage(this.allLogs || [], setNo, "B", this.data.teamBPlayers || [], teamBName, {
        includeSetBan: false,
      });
      if (banErrB) {
        showBlockHint(banErrB);
        return;
      }
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    if (this.flowDraftPersistTimer) {
      clearTimeout(this.flowDraftPersistTimer);
      this.flowDraftPersistTimer = 0;
    }
    const changedA = !arePlayersSameByPos(
      this.flowBaseTeamAPlayers || this.data.teamAPlayers,
      this.data.teamAPlayers || []
    );
    const changedB = !arePlayersSameByPos(
      this.flowBaseTeamBPlayers || this.data.teamBPlayers,
      this.data.teamBPlayers || []
    );
    const changed = changedA || changedB;
    const scopedTeamAfterEdit: "" | TeamCode =
      editedChangedA && !editedChangedB ? "A" : editedChangedB && !editedChangedA ? "B" : "";
    const shouldRequireCaptainReconfirmAfterEdit =
      changed &&
      (
        // 已经开赛：编辑后总是要求重新确认场上队长
        !this.data.canStartMatch ||
        // 未开赛但之前已经确认过：编辑后也要求重新确认
        !!this.data.preStartCaptainConfirmed
      );
    if (this.data.matchFlowMode === "edit_players") {
      const returnState = this.data.matchFlowReturnState || "prestart";
      const nextTeamAPlayers = clonePlayerList(this.data.teamAPlayers || []);
      const nextTeamBPlayers = clonePlayerList(this.data.teamBPlayers || []);
      const nextIsSwapped = !!this.data.isSwapped;
      const nextServingTeam: TeamCode = this.data.servingTeam === "B" ? "B" : "A";
      const flowChanged = true;
      if (flowChanged) {
        await this.startFlowModeSwitchOutIfNeeded("normal");
      }
      void updateRoomAsync(
        roomId,
        (room) => {
          if (!room || !room.match || !room.teamA || !room.teamB || room.match.isFinished) {
            return room;
          }
          room.teamA.players = clonePlayerList(nextTeamAPlayers);
          room.teamB.players = clonePlayerList(nextTeamBPlayers);
          room.match.isSwapped = nextIsSwapped;
          room.match.servingTeam = nextServingTeam;
          (room.match as any).flowMode = "normal";
          (room.match as any).flowReturnState = returnState;
          (room.match as any).flowUpdatedAt = Date.now();
          if (changed && shouldRequireCaptainReconfirmAfterEdit) {
            (room.match as any).preStartCaptainConfirmed = false;
            (room.match as any).preStartCaptainConfirmSetNo = 0;
          }
          return room;
        },
        { awaitCloud: false }
      );
      this.clearActiveAdjustInput();
      this.flowPlayersDirty = false;
      this.editDisplayRoleMapA = null;
      this.editDisplayRoleMapB = null;
      this.setData({
        matchFlowMode: "normal",
        matchFlowReturnState: returnState,
        playerCardsEditable: false,
      });
      this.finishFlowModeSwitchIn(flowChanged);
      if (shouldRequireCaptainReconfirmAfterEdit) {
        this.openCaptainConfirmModal("post_edit", {
          scopedTeam: scopedTeamAfterEdit,
          showCancel: false,
        });
      }
      return;
    }

    const nextTeamAPlayers = clonePlayerList(this.data.teamAPlayers || []);
    const nextTeamBPlayers = clonePlayerList(this.data.teamBPlayers || []);
    const nextIsSwapped = !!this.data.isSwapped;
    const nextServingTeam: TeamCode = this.data.servingTeam === "B" ? "B" : "A";
    const flowChanged = true;
    if (flowChanged) {
      await this.startFlowModeSwitchOutIfNeeded("normal");
    }
    void updateRoomAsync(
      roomId,
      (room) => {
        if (!room || !room.match || !room.teamA || !room.teamB || room.match.isFinished) {
          return room;
        }
        room.teamA.players = clonePlayerList(nextTeamAPlayers);
        room.teamB.players = clonePlayerList(nextTeamBPlayers);
        room.match.isSwapped = nextIsSwapped;
        room.match.servingTeam = nextServingTeam;
        (room.match as any).setTimerStartAt = 0;
        (room.match as any).setTimerElapsedMs = 0;
        (room.match as any).timeoutActive = false;
        (room.match as any).timeoutTeam = "";
        (room.match as any).timeoutEndAt = 0;
        (room.match as any).teamATimeoutCount = 0;
        (room.match as any).teamBTimeoutCount = 0;
        // 局间配置确认后进入“待确认场上队长”状态：清空本场场上队长。
        (room.match as any).teamACurrentCaptainNo = "";
        (room.match as any).teamBCurrentCaptainNo = "";
        (room.match as any).preStartCaptainConfirmed = false;
        (room.match as any).preStartCaptainConfirmSetNo = 0;
        (room.match as any).flowMode = "normal";
        (room.match as any).flowReturnState = "prestart";
        (room.match as any).flowUpdatedAt = Date.now();
        delete (room.match as any).setEndState;
        delete (room.match as any).lineupAdjustDraft;
        return room;
      },
      { awaitCloud: false }
    );
    this.clearActiveAdjustInput();
    this.flowPlayersDirty = false;
    this.editDisplayRoleMapA = null;
    this.editDisplayRoleMapB = null;
    this.setData({
      matchFlowMode: "normal",
      matchFlowReturnState: "prestart",
      playerCardsEditable: false,
      preStartCaptainConfirmed: false,
      preStartCaptainConfirmSetNo: 0,
      teamACaptainNo: "",
      teamBCaptainNo: "",
    });
    this.finishFlowModeSwitchIn(flowChanged);
    void this.loadRoom(roomId, false, true);
  },

  async onFlowCancelTap() {
    if (!this.data.hasOperationAuthority) {
      showToastHint("请先接管后继续");
      return;
    }
    if (this.data.matchFlowMode !== "edit_players") {
      return;
    }
    if (this.flowModeUpdating || this.setEndActionInFlight) {
      showToastHint("操作处理中，请稍候");
      return;
    }
    this.clearActiveAdjustInput();
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    if (this.flowDraftPersistTimer) {
      clearTimeout(this.flowDraftPersistTimer);
      this.flowDraftPersistTimer = 0;
    }
    const returnState = this.data.matchFlowReturnState || this.resolveMatchReturnState();
    const restoreTeamAPlayers = clonePlayerList(
      this.flowBaseTeamAPlayers && this.flowBaseTeamAPlayers.length
        ? this.flowBaseTeamAPlayers
        : (this.data.teamAPlayers || [])
    );
    const restoreTeamBPlayers = clonePlayerList(
      this.flowBaseTeamBPlayers && this.flowBaseTeamBPlayers.length
        ? this.flowBaseTeamBPlayers
        : (this.data.teamBPlayers || [])
    );
    const restoreIsSwapped = !!this.flowBaseIsSwapped;
    const restoreServingTeam: TeamCode = this.flowBaseServingTeam === "B" ? "B" : "A";
    const restoreAOrdered = ensureTeamPlayerOrder(restoreTeamAPlayers || []);
    const restoreBOrdered = ensureTeamPlayerOrder(restoreTeamBPlayers || []);
    const displayA = markDisplayPlayersByLiberoRoster(restoreAOrdered, this.data.teamALiberoRosterNos || []);
    const displayB = markDisplayPlayersByLiberoRoster(restoreBOrdered, this.data.teamBLiberoRosterNos || []);
    const aRows = buildTeamRows(displayA);
    const bRows = buildTeamRows(displayB);
    const teamASide: TeamCode = restoreIsSwapped ? "B" : "A";
    this.flowPlayersDirty = false;
    this.editDisplayRoleMapA = null;
    this.editDisplayRoleMapB = null;
    const flowChanged = true;
    if (flowChanged) {
      await this.startFlowModeSwitchOutIfNeeded("normal");
    }
    this.setData({
      teamAPlayers: restoreAOrdered,
      teamBPlayers: restoreBOrdered,
      isSwapped: restoreIsSwapped,
      servingTeam: restoreServingTeam,
      teamASideText: restoreIsSwapped ? "右场区" : "左场区",
      teamBSideText: restoreIsSwapped ? "左场区" : "右场区",
      teamALibero: aRows.libero,
      teamAMainGrid: buildMainGridByOrder(displayA, getMainOrderForTeam("A", teamASide)),
      teamBLibero: bRows.libero,
      teamBMainGrid: buildMainGridByOrder(displayB, getMainOrderForTeam("B", teamASide)),
      matchFlowMode: "normal",
      matchFlowReturnState: returnState,
      playerCardsEditable: false,
    });
    this.finishFlowModeSwitchIn(flowChanged);
    await updateRoomAsync(
      roomId,
      (room) => {
        if (!room || !room.match || !room.teamA || !room.teamB || room.match.isFinished) {
          return room;
        }
        room.teamA.players = clonePlayerList(restoreAOrdered);
        room.teamB.players = clonePlayerList(restoreBOrdered);
        room.match.servingTeam = restoreServingTeam;
        room.match.isSwapped = restoreIsSwapped;
        (room.match as any).flowMode = "normal";
        (room.match as any).flowReturnState = returnState;
        (room.match as any).flowUpdatedAt = Date.now();
        return room;
      },
      { awaitCloud: false }
    );
  },

  async onSetEndContinue() {
    if (this.setEndActionInFlight) {
      showToastHint("操作处理中，请稍候");
      return;
    }
    if (this.data.setEndWaiting) {
      showToastHint("请先接管后继续");
      return;
    }
    if (!this.data.setEndMatchFinished) {
      const roomId = String(this.data.roomId || "");
      if (!roomId) {
        return;
      }
      this.setEndActionInFlight = true;
      this.showSetEndLoading("处理中");
      try {
        await updateRoomAsync(
          roomId,
          (room) => {
            if (!room || !room.match || room.match.isFinished) {
              return room;
            }
            const nextSetNo = Math.max(1, Number(room.match.setNo || 1));
            const wins = Math.max(1, Number((room.settings && room.settings.wins) || 1));
            const prevSetNo = Math.max(1, nextSetNo - 1);
            const lineupMap = getSetStartLineupsMap(room);
            const prevSnapshot = lineupMap[String(prevSetNo)] || null;
            if (prevSnapshot && Array.isArray(prevSnapshot.teamAPlayers) && Array.isArray(prevSnapshot.teamBPlayers)) {
              // 局间配置必须沿用上一局“首发快照”，不带入局中换人结果。
              room.teamA.players = clonePlayerList(prevSnapshot.teamAPlayers || []);
              room.teamB.players = clonePlayerList(prevSnapshot.teamBPlayers || []);
              // 非决胜局：按上一局结束场区自动换边；决胜局：不自动换边（保留到局间配置手动调整）。
              room.match.isSwapped = isDecidingSetByRule(nextSetNo, wins) ? !!prevSnapshot.endIsSwapped : !prevSnapshot.endIsSwapped;
            }
            (room.match as any).flowMode = "between_sets";
            (room.match as any).flowReturnState = "prestart";
            (room.match as any).flowUpdatedAt = Date.now();
            (room.match as any).teamACurrentCaptainNo = "";
            (room.match as any).teamBCurrentCaptainNo = "";
            (room.match as any).preStartCaptainConfirmed = false;
            (room.match as any).preStartCaptainConfirmSetNo = 0;
            delete (room.match as any).setEndState;
            return room;
          },
          { awaitCloud: false }
        );
        this.flowBaseTeamAPlayers = clonePlayerList(this.data.teamAPlayers || []);
        this.flowBaseTeamBPlayers = clonePlayerList(this.data.teamBPlayers || []);
        this.flowPlayersDirty = false;
        this.clearActiveAdjustInput();
        await this.loadRoom(roomId, true);
      } finally {
        this.hideSetEndLoading();
        this.setEndActionInFlight = false;
      }
      return;
    }
    const roomId = this.data.roomId;
    this.setEndActionInFlight = true;
    this.showSetEndLoading("处理中");
    try {
      const saveResultWithCloudAck = async () => {
        return updateRoomAsync(
          roomId,
          (room) => {
            const opId = createLogId();
            (room.match as any).currentOpId = opId;
            const lockTs = Date.now();
            room.status = "result";
            room.match.isFinished = true;
            delete (room.match as any).setEndState;
            (room as any).resultLockedAt = lockTs;
            (room as any).resultExpireAt = lockTs + 24 * 60 * 60 * 1000;
            (room as any).expiresAt = (room as any).resultExpireAt;
            const winnerTeam: TeamCode = Number(room.match.aSetWins || 0) > Number(room.match.bSetWins || 0) ? "A" : "B";
            const winnerName = winnerTeam === "A" ? String(room.teamA.name || "甲") : String(room.teamB.name || "乙");
            appendMatchLog(
              room,
              "result_locked",
              "比赛结束 结果确认：" +
                winnerName +
                " 以 " +
                String(room.match.aSetWins || 0) +
                ":" +
                String(room.match.bSetWins || 0) +
                " 获胜",
              winnerTeam,
              opId
            );
            (room.match as any).lastActionOpId = opId;
            return room;
          },
          { awaitCloud: true, requireCloudAck: true }
        );
      };
      let saved = await saveResultWithCloudAck();
      if (!saved || String((saved as any).status || "") !== "result") {
        // 兜底：如果首次提交命中云端版本竞争，先强拉最新快照再重试一次。
        await forcePullRoomAsync(roomId);
        saved = await saveResultWithCloudAck();
      }
      if (!saved || String((saved as any).status || "") !== "result") {
        showBlockHint("结果保存失败，请重试");
        return;
      }
      wx.reLaunch({ url: "/pages/result/result?roomId=" + roomId });
    } finally {
      this.hideSetEndLoading();
      this.setEndActionInFlight = false;
    }
  },

  async enterLineupAsOwner() {
    return false;
  },

  async onSetEndTakeover() {
    await this.onTakeoverTap();
  },

  onWindowResize() {
    this.syncSafePadding();
  },

  onToggleCourtSide() {
    if (!this.data.hasOperationAuthority || !this.isBetweenSetMode()) {
      return;
    }
    if (this.switchConfirming || this.data.switchingOut || this.data.switchingIn) {
      return;
    }
    this.switchConfirming = true;
    void this.enqueueAction(async () => {
      await this.switchSidesWithAnimation("局间配置换边");
    }).finally(() => {
      this.switchConfirming = false;
    });
  },

  onToggleServeTeam(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.hasOperationAuthority || !this.isBetweenSetMode() || !this.data.isDecidingSet) {
      return;
    }
    const dataset = (e.currentTarget && e.currentTarget.dataset) as { team?: string } | undefined;
    const team: TeamCode = dataset && dataset.team === "B" ? "B" : "A";
    // 同一按钮支持来回切：当前已发球时再点一次，切为接发（即另一队发球）。
    const nextServingTeam: TeamCode = this.data.servingTeam === team ? (team === "A" ? "B" : "A") : team;
    this.setData({
      servingTeam: nextServingTeam,
    });
    this.flowPlayersDirty = true;
    void this.persistFlowLineupDraftNow({
      teamAPlayers: clonePlayerList(this.data.teamAPlayers || []),
      teamBPlayers: clonePlayerList(this.data.teamBPlayers || []),
      servingTeam: nextServingTeam,
      isSwapped: !!this.data.isSwapped,
      flowMode: "between_sets",
      flowReturnState: this.data.matchFlowReturnState as MatchFlowReturnState,
      debounceMs: 0,
    });
  },

  onAdjustFieldWrapTap(e: WechatMiniprogram.TouchEvent) {
    const dataset = (e.currentTarget && e.currentTarget.dataset) as { team?: string; pos?: string; focusKey?: string } | undefined;
    const fallbackTeam = String((dataset && dataset.team) || "");
    const fallbackPos = String((dataset && dataset.pos) || "");
    const focusKeyRaw = String((dataset && dataset.focusKey) || "");
    let focusKey = "";
    if (focusKeyRaw) {
      const parts = focusKeyRaw.split("-");
      if (parts.length === 2) {
        const t = parts[0];
        const p = parts[1];
        if ((t === "A" || t === "B") && isPosition(p)) {
          focusKey = t + "-" + p;
        }
      }
    } else if ((fallbackTeam === "A" || fallbackTeam === "B") && isPosition(fallbackPos)) {
      focusKey = fallbackTeam + "-" + fallbackPos;
    }

    if (this.data.matchFlowMode === "edit_players" || this.data.matchFlowMode === "between_sets") {
      if (!this.data.hasOperationAuthority) {
        return;
      }
      if (!focusKey) {
        return;
      }
      if (Date.now() < this.suppressInputRefocusUntil) {
        return;
      }
      if (this.data.activeAdjustInputKey === focusKey) {
        // 再次点击同一球员时保持当前编辑焦点，避免光标抖动和输入异常。
        return;
      }
      if (this.data.activeAdjustInputKey !== focusKey) {
        this.setData({ activeAdjustInputKey: focusKey });
      }
      this.inputEditing = true;
      if (this.inputEditingReleaseTimer) {
        clearTimeout(this.inputEditingReleaseTimer);
        this.inputEditingReleaseTimer = 0;
      }
      return;
    }
    if (Date.now() < this.quickSubTapLockUntil) {
      return;
    }
    this.tryOpenQuickSubstitutionByDataset({
      team: fallbackTeam,
      pos: fallbackPos,
    });
  },

  onPlayerInputFocus(e: WechatMiniprogram.InputFocus) {
    if (!this.isPlayerCardsEditable()) {
      return;
    }
    const focusKey = String((e.currentTarget.dataset as { focusKey?: string }).focusKey || "");
    if (!focusKey) {
      return;
    }
    if (Date.now() < this.suppressInputRefocusUntil) {
      wx.hideKeyboard({
        fail: () => {},
      });
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

  applyPlayerInputChange(
    team: TeamCode,
    pos: Position,
    numberRaw: string,
    options?: { normalizeLibero?: boolean }
  ): { teamAPlayers: PlayerSlot[]; teamBPlayers: PlayerSlot[] } {
    const teamAPlayers = clonePlayerList(this.data.teamAPlayers || []);
    const teamBPlayers = clonePlayerList(this.data.teamBPlayers || []);
    const target = team === "A" ? teamAPlayers : teamBPlayers;
    const idx = target.findIndex((p) => p.pos === pos);
    if (idx < 0) {
      return {
        teamAPlayers: ensureTeamPlayerOrder(teamAPlayers),
        teamBPlayers: ensureTeamPlayerOrder(teamBPlayers),
      };
    }
    const nextNumber = numberRaw || "?";
    target[idx] = {
      pos: target[idx].pos,
      number: nextNumber,
    };
    const finalTeamA = options && options.normalizeLibero ? normalizeLiberoSlots(teamAPlayers) : teamAPlayers;
    const finalTeamB = options && options.normalizeLibero ? normalizeLiberoSlots(teamBPlayers) : teamBPlayers;
    const patch = this.buildLineupDisplayPatch(finalTeamA, finalTeamB, !!this.data.isSwapped);
    this.setData(patch);
    this.flowPlayersDirty = true;
    return {
      teamAPlayers: finalTeamA,
      teamBPlayers: finalTeamB,
    };
  },

  normalizeEditablePlayersBeforeConfirm() {
    const normalizeTeam = (team: TeamCode): { players: PlayerSlot[]; changed: boolean } => {
      const ordered = ensureTeamPlayerOrder(team === "A" ? this.data.teamAPlayers || [] : this.data.teamBPlayers || []);
      let changed = false;
      const normalized = ordered.map((slot) => {
        const raw = String((slot && slot.number) || "");
        const next = normalizeNumberInput(raw) || "?";
        if (next !== raw) {
          changed = true;
        }
        return {
          pos: slot.pos,
          number: next,
        };
      });
      const shifted = normalizeLiberoSlots(normalized);
      if (shifted[6].number !== normalized[6].number || shifted[7].number !== normalized[7].number) {
        changed = true;
        return {
          players: shifted,
          changed: changed,
        };
      }
      return {
        players: normalized,
        changed: changed,
      };
    };

    const normalizedA = normalizeTeam("A");
    const normalizedB = normalizeTeam("B");
    if (!normalizedA.changed && !normalizedB.changed) {
      return;
    }
    const patch = this.buildLineupDisplayPatch(normalizedA.players, normalizedB.players, !!this.data.isSwapped);
    this.setData(patch);
    this.flowPlayersDirty = true;
  },

  onPlayerNumberInput(e: WechatMiniprogram.Input) {
    if (!this.isPlayerCardsEditable()) {
      return;
    }
    const dataset = e.currentTarget.dataset as { team?: string; pos?: string; focusKey?: string };
    const team = dataset && dataset.team === "B" ? "B" : dataset && dataset.team === "A" ? "A" : "";
    const posRaw = String((dataset && dataset.pos) || "");
    const focusKey = String((dataset && dataset.focusKey) || "");
    if (!team || !isPosition(posRaw)) {
      return;
    }
    if (Date.now() < this.suppressInputRefocusUntil) {
      return;
    }
    if (focusKey && this.data.activeAdjustInputKey && this.data.activeAdjustInputKey !== focusKey) {
      return;
    }
    if (focusKey && !this.data.activeAdjustInputKey) {
      this.setData({ activeAdjustInputKey: focusKey });
    }
    const raw = String((e.detail && e.detail.value) || "").replace(/\D/g, "").slice(0, 2);
    const normalizedLive = raw.length >= 2 && raw.charAt(0) === "0" ? normalizeNumberInput(raw) : raw;
    const number = normalizedLive || "?";
    this.inputEditing = true;
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    this.applyPlayerInputChange(team as TeamCode, posRaw as Position, number);
  },

  onPlayerNumberBlur(e: WechatMiniprogram.InputBlur) {
    if (!this.isPlayerCardsEditable()) {
      return;
    }
    const dataset = e.currentTarget.dataset as { team?: string; pos?: string; focusKey?: string };
    const team = dataset && dataset.team === "B" ? "B" : dataset && dataset.team === "A" ? "A" : "";
    const posRaw = String((dataset && dataset.pos) || "");
    const focusKey = String((dataset && dataset.focusKey) || "");
    if (!team || !isPosition(posRaw)) {
      return;
    }
    const players = ensureTeamPlayerOrder(team === "A" ? this.data.teamAPlayers || [] : this.data.teamBPlayers || []);
    const slot = getPlayerByPos(players, posRaw as Position);
    const normalized = normalizeNumberInput(String((slot && slot.number) || "")) || "?";
    const applied = this.applyPlayerInputChange(team as TeamCode, posRaw as Position, normalized, { normalizeLibero: true });
    if (normalized !== "?") {
      const finalPlayers = ensureTeamPlayerOrder(team === "A" ? applied.teamAPlayers : applied.teamBPlayers);
      const duplicateCount = finalPlayers.filter((p) => normalizeNumberInput(String(p.number || "")) === normalized).length;
      if (duplicateCount > 1) {
        showToastHint("球员号码重复");
      }
      if (this.data.matchFlowMode === "between_sets") {
        const setNo = Math.max(1, Number(this.data.setNo || 1));
        const banState = buildSpecialBanStateBySet(this.allLogs || [], setNo, team as TeamCode);
        const banHint = getMatchEntryLockHint(banState, normalized);
        if (banHint) {
          showToastHint(banHint);
        }
      }
    }
    if (focusKey && this.data.activeAdjustInputKey === focusKey) {
      this.setData({ activeAdjustInputKey: "" });
    }
    void this.persistFlowLineupDraftNow();
    if (this.inputEditingReleaseTimer) {
      clearTimeout(this.inputEditingReleaseTimer);
      this.inputEditingReleaseTimer = 0;
    }
    this.inputEditingReleaseTimer = setTimeout(() => {
      this.inputEditing = false;
      this.inputEditingReleaseTimer = 0;
    }, 120) as unknown as number;
  },

  showSetEndLoading(title = "处理中") {
    if (this.roomMissingLoadingVisible) {
      wx.hideLoading({
        fail: () => {},
      });
      this.roomMissingLoadingVisible = false;
    }
    if (this.reconfigureLoadingVisible) {
      wx.hideLoading({
        fail: () => {},
      });
      this.reconfigureLoadingVisible = false;
    }
    if (this.setEndLoadingVisible) {
      return;
    }
    this.setEndLoadingVisible = true;
    wx.showLoading({
      title: title,
      mask: true,
      fail: () => {
        this.setEndLoadingVisible = false;
      },
    });
  },

  hideSetEndLoading() {
    if (!this.setEndLoadingVisible) {
      return;
    }
    wx.hideLoading({
      fail: () => {},
    });
    this.setEndLoadingVisible = false;
  },

  isMatchPageTop(): boolean {
    const pages = getCurrentPages();
    const top = pages.length ? pages[pages.length - 1] : null;
    const route = String((top && (top as any).route) || "");
    return route === "pages/match/match";
  },

  applyNavigationTheme() {
    applyNavigationBarTheme();
  },

  clearPasswordAutoHideTimer() {
    if (!this.passwordAutoHideTimer) {
      return;
    }
    clearTimeout(this.passwordAutoHideTimer);
    this.passwordAutoHideTimer = 0;
  },

  triggerPasswordEyeFx() {
    this.setData({ passwordEyeFx: true });
    setTimeout(() => {
      this.setData({ passwordEyeFx: false });
    }, 220);
  },

  hideRoomPassword() {
    this.clearPasswordAutoHideTimer();
    if (!this.data.showRoomPassword) {
      return;
    }
    this.setData({
      showRoomPassword: false,
    });
  },

  onToggleRoomPasswordVisible() {
    if (this.data.showRoomPassword) {
      this.triggerPasswordEyeFx();
      this.hideRoomPassword();
      return;
    }
    const password = String(this.data.roomPassword || "");
    if (!/^\d{6}$/.test(password)) {
      showToastHint("密码暂不可用");
      return;
    }
    this.triggerPasswordEyeFx();
    this.setData({
      showRoomPassword: true,
    });
    showToastHint("30秒后密码将自动隐藏");
    this.clearPasswordAutoHideTimer();
    this.passwordAutoHideTimer = setTimeout(() => {
      this.passwordAutoHideTimer = 0;
      if (this.data.showRoomPassword) {
        this.setData({ showRoomPassword: false });
      }
    }, 30000) as unknown as number;
  },

  showWarmNotice(content: string) {
    const text = String(content || "").trim();
    if (!text) {
      return;
    }
    if (!this.pageActive || !this.isMatchPageTop()) {
      return;
    }
    if (!this.data.hasOperationAuthority) {
      return;
    }
    if (this.warmNoticeShowing) {
      return;
    }
    if (this.data.showSetEndModal || this.data.isMatchFinished) {
      return;
    }
    this.warmNoticeShowing = true;
    setTimeout(() => {
      if (!this.pageActive || !this.isMatchPageTop() || !this.data.hasOperationAuthority) {
        this.warmNoticeShowing = false;
        return;
      }
      if (this.data.showSetEndModal || this.data.isMatchFinished) {
        this.warmNoticeShowing = false;
        return;
      }
      wx.showModal({
        title: "温馨提示",
        content: text,
        showCancel: false,
        confirmText: "确定",
        complete: () => {
          this.warmNoticeShowing = false;
        },
      });
    }, 30);
  },

  maybeShowSetUsageAlerts(
    room: any,
    options: {
      teamANormalSubCount: number;
      teamBNormalSubCount: number;
      teamATimeoutCount: number;
      teamBTimeoutCount: number;
      controlRole: "operator" | "observer";
    }
  ) {
    if (!room || !room.match || room.match.isFinished) {
      return;
    }
    const setNo = Math.max(1, Number(room.match.setNo || 1));
    const roomLogs = normalizeLogsBySet(Array.isArray(room.match.logs) ? (room.match.logs as MatchLogItem[]) : []);
    const setEndState = (room.match as any).setEndState;
    const blockAlerts = !!(setEndState && setEndState.active) || this.data.showSetEndModal || this.data.isMatchFinished;
    const teams: TeamCode[] = ["A", "B"];
    const teamUsage = teams.map((team) => {
      const teamName =
        team === "A"
          ? String(room.teamA && room.teamA.name ? room.teamA.name : "甲")
          : String(room.teamB && room.teamB.name ? room.teamB.name : "乙");
      const normalCount = team === "A" ? Number(options.teamANormalSubCount || 0) : Number(options.teamBNormalSubCount || 0);
      const timeoutCount = team === "A" ? Number(options.teamATimeoutCount || 0) : Number(options.teamBTimeoutCount || 0);
      return { team, teamName, normalCount, timeoutCount };
    });
    const canShowAlerts =
      options.controlRole === "operator" &&
      !!this.data.hasOperationAuthority &&
      this.pageActive &&
      this.isMatchPageTop() &&
      !blockAlerts;
    if (!canShowAlerts) {
      for (let i = 0; i < teamUsage.length; i += 1) {
        const item = teamUsage[i];
        const snapshotKey = String(setNo) + "|" + item.team;
        this.setUsageCountSnapshot[snapshotKey] = {
          normal: item.normalCount,
          timeout: item.timeoutCount,
        };
      }
      return;
    }
    for (let i = 0; i < teams.length; i += 1) {
      const item = teamUsage[i];
      const snapshotKey = String(setNo) + "|" + item.team;
      const prev = this.setUsageCountSnapshot[snapshotKey];
      this.setUsageCountSnapshot[snapshotKey] = {
        normal: item.normalCount,
        timeout: item.timeoutCount,
      };
      if (!prev) {
        continue;
      }
      const team = item.team;
      const teamName = item.teamName;
      const normalCount = item.normalCount;
      const timeoutCount = item.timeoutCount;
      if (prev.normal < 6 && normalCount >= 6) {
        const sign = String(setNo) + "|" + team + "|normal6";
        if (!this.shownNormalSubAlertSigns[sign]) {
          const triggerOpId = findNthLogOpIdBySetTeam(roomLogs, setNo, team, 6, isNormalSubstitutionLog);
          if (!isRecentLocalOpId(triggerOpId)) {
            continue;
          }
          this.shownNormalSubAlertSigns[sign] = true;
          this.showWarmNotice(teamName + "队本局普通换人次数已用完");
          return;
        }
      } else if (prev.normal < 5 && normalCount >= 5) {
        const sign = String(setNo) + "|" + team + "|normal5";
        if (!this.shownNormalSubAlertSigns[sign]) {
          const triggerOpId = findNthLogOpIdBySetTeam(roomLogs, setNo, team, 5, isNormalSubstitutionLog);
          if (!isRecentLocalOpId(triggerOpId)) {
            continue;
          }
          this.shownNormalSubAlertSigns[sign] = true;
          this.showWarmNotice(teamName + "队本局普通换人已达5次，剩余1次可用");
          return;
        }
      }
      if (prev.timeout < 2 && timeoutCount >= 2) {
        const sign = String(setNo) + "|" + team + "|timeout2";
        if (!this.shownTimeoutAlertSigns[sign]) {
          const triggerOpId = findNthLogOpIdBySetTeam(roomLogs, setNo, team, 2, isTimeoutStartLog);
          if (!isRecentLocalOpId(triggerOpId)) {
            continue;
          }
          this.shownTimeoutAlertSigns[sign] = true;
          this.showWarmNotice(teamName + "队本局暂停次数已用完");
          return;
        }
      }
    }
  },

  async autoRestoreFrontRowLibero(candidate: FrontRowLiberoFixCandidate) {
    if (this.frontRowLiberoFixing) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    this.frontRowLiberoFixing = true;
    let fixError = "";
    let shouldForceCaptainReconfirmForTeam: TeamCode | "" = "";
    try {
      const next = await updateRoomAsync(roomId, (room) => {
        if (!room || !room.match || !room.teamA || !room.teamB) {
          fixError = "房间状态异常，无法自动换回";
          return room;
        }
        if (room.match.isFinished) {
          fixError = "比赛已结束，无法自动换回";
          return room;
        }
        const setEndState = (room.match as any).setEndState;
        if (setEndState && setEndState.active) {
          fixError = "本局已结束，无法自动换回";
          return room;
        }
        const teamObj = candidate.team === "A" ? room.teamA : room.teamB;
        const players = ensureTeamPlayerOrder(teamObj.players || []);
        const captainNo = this.getTeamCurrentCaptainNoFromRoom(room, candidate.team);
        const teamInitialCaptainNo = normalizeNumberInput(
          String(
            (teamObj as any).captainNo ||
              (candidate.team === "A" ? this.data.teamAInitialCaptainNo : this.data.teamBInitialCaptainNo) ||
              ""
          )
        );
        const roster = getLiberoRosterForTeam(room, candidate.team, candidate.team === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []);
        const rosterSet = buildLiberoRosterSet(roster);
        const frontSlot = getPlayerByPos(players, candidate.frontPos as Position);
        const liberoSlot = getPlayerByPos(players, candidate.liberoSlotPos);
        if (!frontSlot || !liberoSlot) {
          fixError = "球员位置异常，无法自动换回";
          return room;
        }
        const frontNo = normalizeNumberInput(String(frontSlot.number || ""));
        const slotNo = normalizeNumberInput(String(liberoSlot.number || ""));
        if (!frontNo || !slotNo) {
          fixError = "号码无效，无法自动换回";
          return room;
        }
        if (!rosterSet.has(frontNo) || rosterSet.has(slotNo)) {
          // 状态已变化，无需执行自动换回。
          return room;
        }
        const nextPlayers = ensureTeamPlayerOrder(players);
        const frontIdx = nextPlayers.findIndex((p) => p.pos === candidate.frontPos);
        const liberoIdx = nextPlayers.findIndex((p) => p.pos === candidate.liberoSlotPos);
        if (frontIdx < 0 || liberoIdx < 0) {
          fixError = "球员位置异常，无法自动换回";
          return room;
        }
        const opId = createLogId();
        (room.match as any).currentOpId = opId;
        pushUndoSnapshot(room);
        const tmpNo = nextPlayers[frontIdx].number;
        nextPlayers[frontIdx].number = nextPlayers[liberoIdx].number;
        nextPlayers[liberoIdx].number = tmpNo;
        if (this.shouldForceCaptainReconfirm(candidate.team, players, nextPlayers, captainNo, teamInitialCaptainNo)) {
          shouldForceCaptainReconfirmForTeam = candidate.team;
        }
        teamObj.players = nextPlayers;
        (room.match as any).liberoReentryLock = {
          team: candidate.team,
          liberoNo: frontNo,
          setNo: Math.max(1, Number(room.match.setNo || 1)),
          aScore: Math.max(0, Number(room.match.aScore || 0)),
          bScore: Math.max(0, Number(room.match.bScore || 0)),
        };
        const teamName = candidate.team === "A" ? String(room.teamA.name || "甲") : String(room.teamB.name || "乙");
        appendMatchLog(
          room,
          "libero_swap_auto_front",
          teamName + "队 自由人前排自动换回 ↑" + slotNo + " ↓" + frontNo + "（自）",
          candidate.team,
          opId
        );
        (room.match as any).lastActionOpId = opId;
        return room;
      });
      if (!next) {
        showToastHint("系统繁忙，请重试");
        return;
      }
      if (fixError) {
        showToastHint(fixError);
        return;
      }
      this.applyLocalLineupFromRoom(next);
      await this.loadRoom(roomId, true);
      if (shouldForceCaptainReconfirmForTeam) {
        this.openForcedCaptainConfirmAfterSubstitution(shouldForceCaptainReconfirmForTeam);
      }
    } finally {
      this.frontRowLiberoFixing = false;
    }
  },

  maybeShowFrontRowLiberoHint(room: any) {
    if (!room || !room.match || room.match.isFinished) {
      this.lastFrontRowLiberoHintSign = "";
      return;
    }
    if (!this.pageActive || !this.isMatchPageTop()) {
      return;
    }
    if (!this.data.hasOperationAuthority) {
      return;
    }
    const setEndState = (room.match as any).setEndState;
    if (setEndState && setEndState.active) {
      return;
    }
    const lastActionOpId = String((room.match as any).lastActionOpId || "");
    if (!isRecentLocalOpId(lastActionOpId)) {
      return;
    }
    const fallbackA = this.data.teamALiberoRosterNos || [];
    const fallbackB = this.data.teamBLiberoRosterNos || [];
    const candidate =
      findFrontRowLiberoFixCandidate(room, "A", fallbackA) ||
      findFrontRowLiberoFixCandidate(room, "B", fallbackB);
    if (!candidate) {
      this.lastFrontRowLiberoHintSign = "";
      return;
    }
    const sign =
      String(Math.max(1, Number(room.match.setNo || 1))) +
      "|" +
      String(candidate.team) +
      "|" +
      String(candidate.frontPos) +
      "|" +
      String(candidate.liberoSlotPos) +
      "|" +
      String(candidate.liberoNo) +
      "|" +
      String(candidate.normalNo);
    if (this.lastFrontRowLiberoHintSign === sign) {
      return;
    }
    this.lastFrontRowLiberoHintSign = sign;
    wx.showModal({
      title: "自由人轮转提醒",
      content: "自由人轮转至前排，将自动换上原位置" + String(candidate.normalNo) + "号队员",
      showCancel: false,
      confirmText: "确认",
      success: () => {
        void this.enqueueAction(async () => {
          await this.autoRestoreFrontRowLibero(candidate);
        });
      },
    });
  },

  handleRoomClosed() {
    if (this.roomClosedHandled) {
      return;
    }
    this.roomClosedHandled = true;
    this.clearRoomMissingRetry();
    if (this.roomMissingLoadingVisible) {
      wx.hideLoading({
        fail: () => {},
      });
      this.roomMissingLoadingVisible = false;
    }
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

  scheduleRoomMissingRetry(delayMs = 1200, force = true) {
    if (this.roomMissingRetryTimer) {
      return;
    }
    this.roomMissingRetryTimer = setTimeout(() => {
      this.roomMissingRetryTimer = 0;
      if (!this.pageActive || !this.isMatchPageTop()) {
        return;
      }
      const roomId = String(this.data.roomId || "");
      if (!roomId) {
        return;
      }
      this.loadRoom(roomId, force);
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

  getSubstitutionDraftStorageKey(roomId: string): string {
    return "volleyball.substitutionDraft." + String(roomId || "");
  },

  readSubstitutionDraft(roomId: string): SubstitutionDraftSnapshot | null {
    if (!roomId) {
      return null;
    }
    try {
      const key = this.getSubstitutionDraftStorageKey(roomId);
      const raw = wx.getStorageSync(key);
      if (!raw || typeof raw !== "object") {
        return null;
      }
      if (String((raw as any).roomId || "") !== roomId) {
        return null;
      }
      const modeRaw = String((raw as any).mode || "");
      const mode: "normal" | "special" = modeRaw === "special" || modeRaw === "special_libero" ? "special" : "normal";
      const reasonRaw = String((raw as any).reason || "");
      const reason: "injury" | "penalty_set" | "penalty_match" | "other" =
        reasonRaw === "penalty_set"
          ? "penalty_set"
          : reasonRaw === "penalty_match"
            ? "penalty_match"
            : reasonRaw === "other"
              ? "other"
              : "injury";
      const normalPenaltyRaw = String((raw as any).normalPenalty || "");
      const normalPenalty: "none" | "penalty_set" | "penalty_match" =
        normalPenaltyRaw === "penalty_set"
          ? "penalty_set"
          : normalPenaltyRaw === "penalty_match"
            ? "penalty_match"
            : "none";
      const selectedPosRaw = String((raw as any).selectedPos || "");
      const selectedPos: "" | Position = isPosition(selectedPosRaw) ? (selectedPosRaw as Position) : "";
      const incomingLockedNo = normalizeSubstituteNumber(String((raw as any).incomingLockedNo || ""));
      const incomingNoInput = normalizeSubstituteNumber(String((raw as any).incomingNoInput || ""));
      const incomingNo = normalizeSubstituteNumber(String((raw as any).incomingNo || incomingNoInput || ""));
      const incomingLocked = !!(raw as any).incomingLocked && !!incomingLockedNo;
      return {
        roomId: roomId,
        setNo: Math.max(1, Number((raw as any).setNo || 1)),
        panelOpen: !!(raw as any).panelOpen,
        team: String((raw as any).team || "") === "B" ? "B" : "A",
        mode,
        reason,
        normalPenalty,
        selectedPos,
        incomingNoInput: incomingLocked ? incomingLockedNo : incomingNoInput,
        incomingNo: incomingLocked ? incomingLockedNo : incomingNo,
        incomingLocked,
        incomingLockedNo,
        savedAt: Math.max(0, Number((raw as any).savedAt) || 0),
      };
    } catch (_e) {
      return null;
    }
  },

  clearSubstitutionDraft(roomIdRaw?: string) {
    const roomId = String(roomIdRaw || this.data.roomId || "");
    if (!roomId) {
      return;
    }
    try {
      const key = this.getSubstitutionDraftStorageKey(roomId);
      wx.removeStorageSync(key);
    } catch (_e) {}
  },

  persistSubstitutionDraft() {
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    if (!this.data.showSubstitutionPanel) {
      return;
    }
    const selectedPosRaw = String(this.data.subSelectedPos || "");
    const selectedPos: "" | Position = isPosition(selectedPosRaw) ? (selectedPosRaw as Position) : "";
    const modeRaw = String(this.data.subMode || "");
    const mode: "normal" | "special" = modeRaw === "special" || modeRaw === "special_libero" ? "special" : "normal";
    const reasonRaw = String(this.data.subReason || "");
    const reason: "injury" | "penalty_set" | "penalty_match" | "other" =
      reasonRaw === "penalty_set"
        ? "penalty_set"
        : reasonRaw === "penalty_match"
          ? "penalty_match"
          : reasonRaw === "other"
            ? "other"
            : "injury";
    const normalPenaltyRaw = String(this.data.subNormalPenalty || "");
    const normalPenalty: "none" | "penalty_set" | "penalty_match" =
      normalPenaltyRaw === "penalty_set"
        ? "penalty_set"
        : normalPenaltyRaw === "penalty_match"
          ? "penalty_match"
          : "none";
    const incomingLockedNo = normalizeSubstituteNumber(String(this.data.subIncomingLockedNo || ""));
    const incomingLocked = !!this.data.subIncomingLocked && !!incomingLockedNo;
    const incomingNoInput = normalizeSubstituteNumber(
      String(incomingLocked ? incomingLockedNo : this.data.subIncomingNoInput || "")
    );
    const incomingNo = normalizeSubstituteNumber(
      String(incomingLocked ? incomingLockedNo : this.data.subIncomingNo || incomingNoInput || "")
    );
    const payload: SubstitutionDraftSnapshot = {
      roomId: roomId,
      setNo: Math.max(1, Number(this.data.setNo || 1)),
      panelOpen: true,
      team: this.data.subTeam === "B" ? "B" : "A",
      mode,
      reason,
      normalPenalty,
      selectedPos,
      incomingNoInput,
      incomingNo,
      incomingLocked,
      incomingLockedNo,
      savedAt: Date.now(),
    };
    try {
      const key = this.getSubstitutionDraftStorageKey(roomId);
      wx.setStorageSync(key, payload);
    } catch (_e) {}
  },

  tryRestoreSubstitutionDraft() {
    if (this.data.showSubstitutionPanel || !this.data.hasOperationAuthority) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    const draft = this.readSubstitutionDraft(roomId);
    if (!draft || !draft.panelOpen) {
      return;
    }
    const currentSetNo = Math.max(1, Number(this.data.setNo || 1));
    const restoreKey = roomId + "|" + String(currentSetNo);
    if (this.substitutionDraftRestoreTriedKey === restoreKey) {
      return;
    }
    this.substitutionDraftRestoreTriedKey = restoreKey;
    if (draft.setNo !== currentSetNo) {
      this.clearSubstitutionDraft(roomId);
      return;
    }
    const team: TeamCode = draft.team === "B" ? "B" : "A";
    this.syncSubstitutionTeamDisplay(team, {
      preserveDraft: true,
      draft,
    });
    this.clearSubstitutionPanelCloseTimer();
    this.clearLogPanelCloseTimer();
    this.clearSubMatchLogPopoverCloseTimer();
    this.setData(
      {
        showSubstitutionPanel: true,
        substitutionPanelClosing: false,
        showLogPanel: false,
        logPanelClosing: false,
        showSubMatchLogPopover: false,
        subMatchLogPopoverClosing: false,
        subLogPopoverInlineStyle: "",
        showSubRecordTabMenu: false,
        subRecordTab: draft.mode === "special" ? "special" : "normal",
        subRecordTabIndex: getSubRecordTabIndex(draft.mode === "special" ? "special" : "normal"),
        subModeSwitching: false,
        subReasonSwitching: false,
      },
      () => {
        this.persistSubstitutionDraft();
      }
    );
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
          this.loadRoom(roomId, true);
          return;
        }
        this.scheduleRoomMissingRetry(1600, true);
      })
      .catch(() => {})
      .finally(() => {
        this.roomMissingVerifyInFlight = false;
      });
  },

  handleRoomTemporarilyUnavailable(force: boolean) {
    if (!this.pageActive || !this.isMatchPageTop()) {
      if (this.roomMissingLoadingVisible) {
        wx.hideLoading({
          fail: () => {},
        });
        this.roomMissingLoadingVisible = false;
      }
      return;
    }
    this.scheduleRoomMissingRetry(force ? 1200 : 1800, true);
    this.verifyRoomMissingFromServer();
    if (this.setEndLoadingVisible || this.reconfigureLoadingVisible) {
      return;
    }
    const nowTs = Date.now();
    if (nowTs - Math.max(0, Number(this.roomMissingToastAt) || 0) < 1100) {
      return;
    }
    this.roomMissingToastAt = nowTs;
    this.roomMissingLoadingVisible = true;
    wx.showLoading({
      title: "重连中",
      mask: false,
      fail: () => {
        this.roomMissingLoadingVisible = false;
        showToastHint("重连中");
      },
    });
  },

  syncSafePadding() {
    const safePad = computeLandscapeSafePad(wx);
    if (!safePad.safeAreaAvailable) {
      this.setData({
        safePadTop: safePad.safePadTop,
        safePadRight: safePad.safePadRight,
        safePadBottom: safePad.safePadBottom,
        safePadLeft: safePad.safePadLeft,
        safeDebugText: "safeArea unavailable",
      });
      return;
    }
    this.setData({
      safePadTop: safePad.safePadTop,
      safePadRight: safePad.safePadRight,
      safePadBottom: safePad.safePadBottom,
      safePadLeft: safePad.safePadLeft,
      safeDebugText:
        "side-adapt | ww:" +
        String(safePad.windowWidth) +
        " wh:" +
        String(safePad.windowHeight) +
        " | safe t/l/r/b:" +
        safePad.safeEdges.join("/") +
        " | inset t/l/r/b:" +
        safePad.insetEdges.join("/") +
        " | pad t/r/b/l:" +
        [10, safePad.sideInset, 25, safePad.sideInset].join("/"),
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
    }, 60000) as unknown as number;
  },

  stopPolling() {
    if (!this.pollTimer) {
      return;
    }
    clearInterval(this.pollTimer);
    this.pollTimer = 0;
  },

  clearPendingRoomLoadRetry() {
    if (!this.roomLoadPendingRetryTimer) {
      return;
    }
    clearTimeout(this.roomLoadPendingRetryTimer);
    this.roomLoadPendingRetryTimer = 0;
  },

  schedulePendingRoomLoad(roomId: string, force: boolean, delayMs = 16) {
    if (!roomId) {
      return;
    }
    if (this.roomLoadPendingRetryTimer) {
      return;
    }
    const wait = Math.max(0, Number(delayMs) || 0);
    this.roomLoadPendingRetryTimer = setTimeout(() => {
      this.roomLoadPendingRetryTimer = 0;
      if (!this.pageActive || !this.isMatchPageTop()) {
        return;
      }
      void this.loadRoom(roomId, force);
    }, wait) as unknown as number;
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
      this.loadRoom(roomId, false, true);
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
    }, 15000) as unknown as number;
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
    const clientId = String(this.clientId || ensureClientId());
    if (!clientId) {
      this.markConnectionIssue();
      return;
    }
    heartbeatRoomAsync(roomId, clientId)
      .then((count) => {
        this.markConnectionAlive();
        if (typeof count === "number") {
          const displayCount = Math.max(1, Math.floor(count));
          const currentCount = Math.max(1, Math.floor(Number(this.data.participantCount) || 1));
          if (displayCount !== currentCount) {
            this.setData({ participantCount: displayCount });
          }
        }
        // 心跳已拿到并落地最新房间，直接走本地刷新，避免额外 getRoom 轮询请求。
        if (!this.roomLoadInFlight && this.rotateMotionInFlightCount <= 0) {
          void this.loadRoom(roomId, false, true);
        }
      })
      .catch(() => {
        this.markConnectionIssue();
      });
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
    const patch: Record<string, any> = {};
    if (nextText !== this.lastRenderedTimerText) {
      this.lastRenderedTimerText = nextText;
      patch.setTimerText = nextText;
    }

    const timeoutEndAt = Number(this.timeoutEndAtMs || 0);
    if (timeoutEndAt > 0) {
      const remainMs = timeoutEndAt - Date.now();
      if (remainMs > 0) {
        const remainSec = Math.max(0, Math.ceil(remainMs / 1000));
        if (remainSec === 5 && this.timeoutWarnVibratedForEndAt !== timeoutEndAt) {
          this.timeoutWarnVibratedForEndAt = timeoutEndAt;
          vibrateLongForMs(1000);
        }
        const timeoutText = formatTimeoutSeconds(remainMs);
        if (timeoutText !== this.lastRenderedTimeoutText) {
          this.lastRenderedTimeoutText = timeoutText;
          patch.timeoutLeftText = timeoutText;
        }
        if (!this.data.timeoutActive) {
          patch.timeoutActive = true;
        }
      } else {
        if (this.timeoutEndVibratedForEndAt !== timeoutEndAt) {
          this.timeoutEndVibratedForEndAt = timeoutEndAt;
          vibrateLongForMs(3000);
        }
        this.timeoutEndAtMs = 0;
        this.lastRenderedTimeoutText = "暂停 0s";
        if (this.data.timeoutActive) {
          patch.timeoutActive = false;
          patch.timeoutLeftText = "暂停 0s";
        }
        if (!this.timeoutAutoClearing) {
          this.timeoutAutoClearing = true;
          const roomId = String(this.data.roomId || "");
          if (roomId) {
            updateRoomAsync(roomId, (room) => {
              const opId = createLogId();
              (room.match as any).currentOpId = opId;
              const isActive = !!(room.match as any).timeoutActive;
              const endAt = Math.max(0, Number((room.match as any).timeoutEndAt) || 0);
              if (!isActive || endAt > Date.now()) {
                return room;
              }
              const timeoutTeam = (room.match as any).timeoutTeam === "B" ? "B" : "A";
              (room.match as any).timeoutActive = false;
              (room.match as any).timeoutTeam = "";
              (room.match as any).timeoutEndAt = 0;
              appendMatchLog(
                room,
                "timeout_end",
                (timeoutTeam === "A" ? room.teamA.name : room.teamB.name) + " 暂停结束",
                timeoutTeam,
                opId
              );
              (room.match as any).lastActionOpId = opId;
              return room;
            })
              .then(() => {
                this.loadRoom(roomId, false);
              })
              .finally(() => {
                this.timeoutAutoClearing = false;
              });
          } else {
            this.timeoutAutoClearing = false;
          }
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      this.setData(patch);
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

  countRectMap(rects: TeamRectMap): number {
    let count = 0;
    MAIN_POSITIONS.forEach((pos) => {
      if (rects[pos]) {
        count += 1;
      }
    });
    return count;
  },

  mergeRectMapWithFallback(primary: TeamRectMap, fallback: TeamRectMap): TeamRectMap {
    const out: TeamRectMap = {};
    MAIN_POSITIONS.forEach((pos) => {
      if (primary && primary[pos]) {
        out[pos] = primary[pos];
        return;
      }
      if (fallback && fallback[pos]) {
        out[pos] = fallback[pos];
      }
    });
    return out;
  },

  getTeamMainOrderInView(team: TeamCode): MainPosition[] {
    const teamASide: TeamCode = this.data.isSwapped ? "B" : "A";
    return getMainOrderForTeam(team, teamASide);
  },

  estimateAxisStep(values: Array<number | null>, fallbackValues: Array<number | null>): number {
    const collectStep = (arr: Array<number | null>) => {
      const steps: number[] = [];
      for (let i = 0; i < arr.length; i += 1) {
        if (arr[i] == null) {
          continue;
        }
        for (let j = i + 1; j < arr.length; j += 1) {
          if (arr[j] == null) {
            continue;
          }
          const span = j - i;
          if (span <= 0) {
            continue;
          }
          steps.push(((arr[j] as number) - (arr[i] as number)) / span);
        }
      }
      return steps;
    };
    const steps = collectStep(values);
    if (steps.length > 0) {
      return steps.reduce((sum, n) => sum + n, 0) / steps.length;
    }
    const fallbackSteps = collectStep(fallbackValues);
    if (fallbackSteps.length > 0) {
      return fallbackSteps.reduce((sum, n) => sum + n, 0) / fallbackSteps.length;
    }
    return 0;
  },

  fillAxisValues(values: Array<number | null>, step: number, fallbackValues: Array<number | null>) {
    const out = values.slice();
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] == null && fallbackValues[i] != null) {
        out[i] = fallbackValues[i];
      }
    }
    for (let pass = 0; pass < out.length * 3; pass += 1) {
      for (let i = 0; i < out.length; i += 1) {
        if (out[i] != null) {
          continue;
        }
        if (i > 0 && out[i - 1] != null && step) {
          out[i] = (out[i - 1] as number) + step;
          continue;
        }
        if (i < out.length - 1 && out[i + 1] != null && step) {
          out[i] = (out[i + 1] as number) - step;
          continue;
        }
        if (i > 0 && i < out.length - 1 && out[i - 1] != null && out[i + 1] != null) {
          out[i] = ((out[i - 1] as number) + (out[i + 1] as number)) / 2;
        }
      }
    }
    return out;
  },

  completeTeamRectMapByGrid(team: TeamCode, primary: TeamRectMap, fallback: TeamRectMap): TeamRectMap {
    const primaryCount = this.countRectMap(primary || {});
    if (primaryCount <= 0) {
      return this.mergeRectMapWithFallback(primary || {}, fallback || {});
    }
    const order = this.getTeamMainOrderInView(team);
    const indexByPos: Partial<Record<MainPosition, number>> = {};
    order.forEach((pos: MainPosition, idx: number) => {
      indexByPos[pos] = idx;
    });
    const rowTopSamples: number[][] = [[], [], []];
    const rowHeightSamples: number[][] = [[], [], []];
    const colLeftSamples: number[][] = [[], []];
    const colWidthSamples: number[][] = [[], []];
    const fbRowTopSamples: number[][] = [[], [], []];
    const fbRowHeightSamples: number[][] = [[], [], []];
    const fbColLeftSamples: number[][] = [[], []];
    const fbColWidthSamples: number[][] = [[], []];
    const collect = (src: TeamRectMap, target: "primary" | "fallback") => {
      MAIN_POSITIONS.forEach((pos) => {
        const rect = src && src[pos];
        if (!rect) {
          return;
        }
        const idx = indexByPos[pos];
        if (typeof idx !== "number") {
          return;
        }
        const row = Math.floor(idx / 2);
        const col = idx % 2;
        if (row < 0 || row > 2 || col < 0 || col > 1) {
          return;
        }
        if (target === "primary") {
          rowTopSamples[row].push(rect.top);
          rowHeightSamples[row].push(rect.height);
          colLeftSamples[col].push(rect.left);
          colWidthSamples[col].push(rect.width);
        } else {
          fbRowTopSamples[row].push(rect.top);
          fbRowHeightSamples[row].push(rect.height);
          fbColLeftSamples[col].push(rect.left);
          fbColWidthSamples[col].push(rect.width);
        }
      });
    };
    collect(primary || {}, "primary");
    collect(fallback || {}, "fallback");
    const avg = (arr: number[]) => (arr.length ? arr.reduce((sum, n) => sum + n, 0) / arr.length : 0);
    const toAxis = (samples: number[][]) => samples.map((s) => (s.length ? avg(s) : null));
    const rowTop = toAxis(rowTopSamples) as Array<number | null>;
    const rowHeight = toAxis(rowHeightSamples) as Array<number | null>;
    const colLeft = toAxis(colLeftSamples) as Array<number | null>;
    const colWidth = toAxis(colWidthSamples) as Array<number | null>;
    const fbRowTop = toAxis(fbRowTopSamples) as Array<number | null>;
    const fbRowHeight = toAxis(fbRowHeightSamples) as Array<number | null>;
    const fbColLeft = toAxis(fbColLeftSamples) as Array<number | null>;
    const fbColWidth = toAxis(fbColWidthSamples) as Array<number | null>;
    const allWidth = colWidthSamples[0].concat(colWidthSamples[1], fbColWidthSamples[0], fbColWidthSamples[1]);
    const allHeight = rowHeightSamples[0].concat(
      rowHeightSamples[1],
      rowHeightSamples[2],
      fbRowHeightSamples[0],
      fbRowHeightSamples[1],
      fbRowHeightSamples[2]
    );
    const avgWidth = allWidth.length ? avg(allWidth) : 0;
    const avgHeight = allHeight.length ? avg(allHeight) : 0;
    const rowStep = this.estimateAxisStep(rowTop, fbRowTop) || (avgHeight > 0 ? avgHeight + 8 : 0);
    const colStep = this.estimateAxisStep(colLeft, fbColLeft) || (avgWidth > 0 ? avgWidth + 8 : 0);
    const rowTopFilled = this.fillAxisValues(rowTop, rowStep, fbRowTop);
    const colLeftFilled = this.fillAxisValues(colLeft, colStep, fbColLeft);
    const rowHeightFilled = this.fillAxisValues(rowHeight, 0, fbRowHeight).map((v: number | null) =>
      v != null ? v : avgHeight > 0 ? avgHeight : 0
    );
    const colWidthFilled = this.fillAxisValues(colWidth, 0, fbColWidth).map((v: number | null) =>
      v != null ? v : avgWidth > 0 ? avgWidth : 0
    );
    const out: TeamRectMap = {};
    MAIN_POSITIONS.forEach((pos) => {
      if (primary && primary[pos]) {
        out[pos] = primary[pos];
      }
    });
    MAIN_POSITIONS.forEach((pos) => {
      if (out[pos]) {
        return;
      }
      const idx = indexByPos[pos];
      if (typeof idx !== "number") {
        return;
      }
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      const top = rowTopFilled[row];
      const left = colLeftFilled[col];
      const width = colWidthFilled[col];
      const height = rowHeightFilled[row];
      if (top != null && left != null && width > 0 && height > 0) {
        out[pos] = { left, top, width, height };
        return;
      }
      if (fallback && fallback[pos]) {
        out[pos] = fallback[pos];
      }
    });
    return out;
  },

  getCachedTeamRectMap(team: TeamCode): TeamRectMap {
    return team === "A"
      ? (this.lastTeamARects as TeamRectMap)
      : (this.lastTeamBRects as TeamRectMap);
  },

  setCachedTeamRectMap(team: TeamCode, rects: TeamRectMap): void {
    if (team === "A") {
      this.lastTeamARects = rects;
      return;
    }
    this.lastTeamBRects = rects;
  },

  clearRectCacheWarmup() {
    if (this.rectCacheWarmupTimer) {
      clearTimeout(this.rectCacheWarmupTimer);
      this.rectCacheWarmupTimer = 0;
    }
  },

  scheduleRectCacheWarmup(delayMs = 0) {
    if (this.rectCacheWarmupTimer || this.rectCacheWarmupInFlight) {
      return;
    }
    this.rectCacheWarmupTimer = setTimeout(() => {
      this.rectCacheWarmupTimer = 0;
      void this.warmupTeamRectCache();
    }, Math.max(0, Number(delayMs) || 0)) as unknown as number;
  },

  async warmupTeamRectCache() {
    if (this.rectCacheWarmupInFlight || this.rotateMotionInFlightCount > 0) {
      return;
    }
    this.rectCacheWarmupInFlight = true;
    try {
      await this.nextTickAsync();
      const [rectsA, rectsB] = await Promise.all([
        this.measureTeamMainPosRectsStable("A", 450),
        this.measureTeamMainPosRectsStable("B", 450),
      ]);
      if (this.countRectMap(rectsA) > 0) {
        this.setCachedTeamRectMap("A", rectsA);
      }
      if (this.countRectMap(rectsB) > 0) {
        this.setCachedTeamRectMap("B", rectsB);
      }
    } finally {
      this.rectCacheWarmupInFlight = false;
    }
  },

  measureTeamMainPosRects(team: TeamCode) {
    return new Promise<TeamRectMap>((resolve) => {
      const rects: TeamRectMap = {};
      const base = team === "A" ? ".team-a" : ".team-b";
      const query = wx.createSelectorQuery().in(this);
      MAIN_POSITIONS.forEach((pos) => {
        query.select(base + " .player-card.pos-card-" + pos).boundingClientRect();
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
      const measured = await this.measureTeamMainPosRects(team);
      const rects = this.completeTeamRectMapByGrid(team, measured, this.getCachedTeamRectMap(team) || {});
      if (this.countRectMap(rects) >= this.countRectMap(best)) {
        best = rects;
        if (this.countRectMap(best) > 0) {
          this.setCachedTeamRectMap(team, best);
        }
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

  resolveDisplaySwapped(
    rawRoomSwapped: boolean,
    options?: { observerSide?: "A" | "B"; hasOperationAuthority?: boolean }
  ): boolean {
    const hasOperationAuthority =
      options && typeof options.hasOperationAuthority === "boolean"
        ? !!options.hasOperationAuthority
        : !!this.data.hasOperationAuthority;
    if (hasOperationAuthority) {
      return !!rawRoomSwapped;
    }
    const observerSide = (options && options.observerSide) || this.data.observerViewSide || "A";
    return observerSide === "B" ? !rawRoomSwapped : !!rawRoomSwapped;
  },

  applyLocalLineupFromRoom(room: any, options?: { observerSide?: "A" | "B"; hasOperationAuthority?: boolean }) {
    if (!room || !room.teamA || !room.teamB || !room.match) {
      return;
    }
    this.lastRoomSnapshot = room;
    const nextSwapped = this.resolveDisplaySwapped(!!room.match.isSwapped, options);
    const teamASide: TeamCode = nextSwapped ? "B" : "A";
    const teamAPlayers = ensureTeamPlayerOrder((room.teamA.players || []).slice());
    const teamBPlayers = ensureTeamPlayerOrder((room.teamB.players || []).slice());
    const teamALiberoRosterNos = getLiberoRosterForTeam(room, "A", this.data.teamALiberoRosterNos || []);
    const teamBLiberoRosterNos = getLiberoRosterForTeam(room, "B", this.data.teamBLiberoRosterNos || []);
    const displayAPlayers = markDisplayPlayersByLiberoRoster(teamAPlayers, teamALiberoRosterNos);
    const displayBPlayers = markDisplayPlayersByLiberoRoster(teamBPlayers, teamBLiberoRosterNos);
    const aRows = buildTeamRows(displayAPlayers);
    const bRows = buildTeamRows(displayBPlayers);
    const timerStartAt = Math.max(0, Number((room.match as any).setTimerStartAt) || 0);
    const timerElapsedMs = Math.max(0, Number((room.match as any).setTimerElapsedMs) || 0);
    const captainModeEnabled = isCaptainModeEnabledFromSettings(room.settings);
    const canStartMatch =
      !room.match.isFinished &&
      Number(room.match.aScore || 0) === 0 &&
      Number(room.match.bScore || 0) === 0 &&
      timerStartAt <= 0 &&
      timerElapsedMs <= 0;
    const setNo = Math.max(1, Number(room.match.setNo || 1));
    const preStartCaptainConfirmed = captainModeEnabled
      ? !!(room.match as any).preStartCaptainConfirmed &&
        Math.max(0, Number((room.match as any).preStartCaptainConfirmSetNo || 0)) === setNo
      : true;
    const rawCurrentTeamACaptain = normalizeNumberInput(String((room.match as any).teamACurrentCaptainNo || ""));
    const rawCurrentTeamBCaptain = normalizeNumberInput(String((room.match as any).teamBCurrentCaptainNo || ""));
    const currentTeamACaptain = captainModeEnabled
      ? canStartMatch && !preStartCaptainConfirmed
        ? ""
        : rawCurrentTeamACaptain
      : "";
    const currentTeamBCaptain = captainModeEnabled
      ? canStartMatch && !preStartCaptainConfirmed
        ? ""
        : rawCurrentTeamBCaptain
      : "";
    const initialTeamACaptain = captainModeEnabled ? normalizeNumberInput(String((room.teamA as any).captainNo || "")) : "";
    const initialTeamBCaptain = captainModeEnabled ? normalizeNumberInput(String((room.teamB as any).captainNo || "")) : "";
    this.setData({
      captainModeEnabled: captainModeEnabled,
      isSwapped: nextSwapped,
      servingTeam: room.match.servingTeam === "B" ? "B" : "A",
      teamACaptainNo: currentTeamACaptain,
      teamBCaptainNo: currentTeamBCaptain,
      teamAInitialCaptainNo: initialTeamACaptain,
      teamBInitialCaptainNo: initialTeamBCaptain,
      teamAPlayers: teamAPlayers,
      teamBPlayers: teamBPlayers,
      teamALiberoRosterNos: teamALiberoRosterNos,
      teamBLiberoRosterNos: teamBLiberoRosterNos,
      teamALibero: aRows.libero,
      teamAMainGrid: buildMainGridByOrder(displayAPlayers, getMainOrderForTeam("A", teamASide)),
      teamBLibero: bRows.libero,
      teamBMainGrid: buildMainGridByOrder(displayBPlayers, getMainOrderForTeam("B", teamASide)),
    });
  },

  applyLocalScoreFromRoom(room: any, options?: { observerSide?: "A" | "B"; hasOperationAuthority?: boolean }) {
    if (!room || !room.match) {
      return;
    }
    this.lastRoomSnapshot = room;
    const nextSwapped = this.resolveDisplaySwapped(!!room.match.isSwapped, options);
    const leftTeam: TeamCode = nextSwapped ? "B" : "A";
    const rightTeam: TeamCode = leftTeam === "A" ? "B" : "A";
    const leftScore = leftTeam === "A" ? Number(room.match.aScore || 0) : Number(room.match.bScore || 0);
    const rightScore = rightTeam === "A" ? Number(room.match.aScore || 0) : Number(room.match.bScore || 0);
    const displayLastScoringTeam: TeamCode | "" =
      room.match.lastScoringTeam === leftTeam
        ? "A"
        : room.match.lastScoringTeam === rightTeam
          ? "B"
          : "";
    const leftSetWins = nextSwapped ? Number(room.match.bSetWins || 0) : Number(room.match.aSetWins || 0);
    const rightSetWins = nextSwapped ? Number(room.match.aSetWins || 0) : Number(room.match.bSetWins || 0);
    this.setData({
      isSwapped: nextSwapped,
      aScore: leftScore,
      bScore: rightScore,
      lastScoringTeam: displayLastScoringTeam,
      setWinsText: String(leftSetWins) + " : " + String(rightSetWins),
      setNoText: room.match.isFinished ? "已结束" : "第" + String(Math.max(1, Number(room.match.setNo || 1))) + "局",
    });
  },

  async playTeamRotateMotion(
    team: TeamCode,
    beforeRects: TeamRectMap,
    beforeNoMap: TeamMainNoMap,
    captainNo: string,
    initialCaptainNo: string,
    directionHint: RotateDirectionHint = ""
  ) {
    const clearTeamMotion = () => {
      if (team === "A") {
        this.setData({ hideTeamAMainNumbers: false, rotateFlyItemsA: [] });
      } else {
        this.setData({ hideTeamBMainNumbers: false, rotateFlyItemsB: [] });
      }
    };
    const cachedRects = this.getCachedTeamRectMap(team);
    const teamLiberoRoster = normalizeLiberoRosterNumbers(
      team === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
    );
    const teamLiberoSet = new Set(teamLiberoRoster);
    let mergedBeforeRects = this.completeTeamRectMapByGrid(team, beforeRects || {}, cachedRects || {});
    if (!mergedBeforeRects || MAIN_POSITIONS.every((pos) => !mergedBeforeRects[pos])) {
      const retryBeforeRects = await this.measureTeamMainPosRectsStable(team, 360);
      mergedBeforeRects = this.completeTeamRectMapByGrid(team, retryBeforeRects || {}, this.getCachedTeamRectMap(team) || {});
      if (!mergedBeforeRects || MAIN_POSITIONS.every((pos) => !mergedBeforeRects[pos])) {
        clearTeamMotion();
        this.scheduleRectCacheWarmup(80);
        return;
      }
    }
    this.rotateMotionInFlightCount += 1;
    try {
      const startSeeds: Array<{
      sourcePos: MainPosition;
      fromRect: TeamPosRect;
      number: string;
      isCurrentCaptain: boolean;
      isInitialCaptain: boolean;
      isLibero: boolean;
      id: string;
      baseStyle: string;
      }> = [];
      MAIN_POSITIONS.forEach((sourcePos) => {
        const fromRect = mergedBeforeRects[sourcePos];
        if (!fromRect) {
          return;
        }
        const number = beforeNoMap[sourcePos] || "?";
        const isCurrentCaptain =
          normalizeNumberInput(number) !== "" && normalizeNumberInput(number) === normalizeNumberInput(captainNo);
        const isInitialCaptain =
          normalizeNumberInput(number) !== "" && normalizeNumberInput(number) === normalizeNumberInput(initialCaptainNo);
        const isLibero =
          normalizeNumberInput(number) !== "" && teamLiberoSet.has(normalizeNumberInput(number));
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
        startSeeds.push({
          sourcePos,
          fromRect,
          number,
          isCurrentCaptain,
          isInitialCaptain,
          isLibero,
          id: team + "-" + sourcePos + "-" + String(Date.now()) + "-" + String(startSeeds.length),
          baseStyle,
        });
      });
      if (!startSeeds.length) {
        clearTeamMotion();
        this.scheduleRectCacheWarmup(80);
        return;
      }
      const startItems: RotateFlyItem[] = startSeeds.map((seed) => ({
        id: seed.id,
        team,
        number: seed.number,
        isCurrentCaptain: seed.isCurrentCaptain,
        isInitialCaptain: seed.isInitialCaptain,
        isLibero: seed.isLibero,
        targetIsLibero: seed.isLibero,
        fadeOldToNew: false,
        style: seed.baseStyle + "transform:translate(0,0);transition:none;",
      }));
      if (team === "A") {
        this.setData({ hideTeamAMainNumbers: true, rotateFlyItemsA: startItems });
      } else {
        this.setData({ hideTeamBMainNumbers: true, rotateFlyItemsB: startItems });
      }
      await this.nextTickAsync();
      await this.delayAsync(10);
      const afterRects = mergedBeforeRects;
      const afterNoMap = this.getTeamMainNumberMap(team);
      const endItems: RotateFlyItem[] = [];
      const usedTargets = new Set<MainPosition>();
      const targetBySource: Partial<Record<MainPosition, MainPosition>> = {};
      if (directionHint) {
        startSeeds.forEach((seed) => {
          const targetPos =
            directionHint === "forward"
              ? getForwardTargetPosBySource(seed.sourcePos)
              : getReverseTargetPosBySource(seed.sourcePos);
          if (!afterRects[targetPos]) {
            return;
          }
          targetBySource[seed.sourcePos] = targetPos;
          usedTargets.add(targetPos);
        });
      }
      startSeeds.forEach((seed) => {
        if (targetBySource[seed.sourcePos]) {
          return;
        }
        const targetPos =
          MAIN_POSITIONS.find((pos) => !usedTargets.has(pos) && !!afterRects[pos] && (afterNoMap[pos] || "?") === seed.number) || null;
        if (!targetPos) {
          return;
        }
        targetBySource[seed.sourcePos] = targetPos;
        usedTargets.add(targetPos);
      });
      const fallbackTargets = MAIN_POSITIONS.filter((pos) => !usedTargets.has(pos) && !!afterRects[pos]);
      let fallbackIndex = 0;
      startSeeds.forEach((seed) => {
        if (targetBySource[seed.sourcePos]) {
          return;
        }
        const targetPos = fallbackTargets[fallbackIndex] || null;
        if (!targetPos) {
          return;
        }
        fallbackIndex += 1;
        targetBySource[seed.sourcePos] = targetPos;
        usedTargets.add(targetPos);
      });
      startSeeds.forEach((seed) => {
        const targetPos = targetBySource[seed.sourcePos] || seed.sourcePos;
        const toRect = afterRects[targetPos] || seed.fromRect;
        const dx = toRect.left - seed.fromRect.left;
        const dy = toRect.top - seed.fromRect.top;
        endItems.push({
          id: seed.id,
          team,
          number: seed.number,
          isCurrentCaptain: seed.isCurrentCaptain,
          isInitialCaptain: seed.isInitialCaptain,
          isLibero: seed.isLibero,
          targetIsLibero: seed.isLibero,
          fadeOldToNew: false,
          style:
            seed.baseStyle +
            "transform:translate(" +
            String(dx) +
            "px," +
            String(dy) +
            "px);transition:transform 320ms cubic-bezier(0.22, 0.7, 0.2, 1);",
        });
      });
      if (!endItems.length) {
        clearTeamMotion();
        this.scheduleRectCacheWarmup(80);
        return;
      }
      this.setCachedTeamRectMap(team, mergedBeforeRects);
      await this.nextTickAsync();
      await this.delayAsync(16);
      if (team === "A") {
        this.setData({ rotateFlyItemsA: endItems });
      } else {
        this.setData({ rotateFlyItemsB: endItems });
      }
      await this.delayAsync(340);
      // 收尾拆成两步：先恢复底层数字，再下一帧移除飞行层，避免结束瞬间闪烁。
      if (team === "A") {
        this.setData({ hideTeamAMainNumbers: false });
        await this.nextTickAsync();
        await this.delayAsync(16);
        this.setData({ rotateFlyItemsA: [] });
      } else {
        this.setData({ hideTeamBMainNumbers: false });
        await this.nextTickAsync();
        await this.delayAsync(16);
        this.setData({ rotateFlyItemsB: [] });
      }
      this.scheduleRectCacheWarmup(50);
    } finally {
      this.rotateMotionInFlightCount = Math.max(0, this.rotateMotionInFlightCount - 1);
      if (this.rotateMotionInFlightCount === 0 && !this.roomLoadInFlight && this.roomLoadPending) {
        const pendingForce = !!this.roomLoadPendingForce;
        this.roomLoadPending = false;
        this.roomLoadPendingForce = false;
        if (this.data.roomId) {
          this.schedulePendingRoomLoad(this.data.roomId, pendingForce, 16);
        }
      }
    }
  },

  async loadRoom(roomId: string, force: boolean, localOnly = false) {
    if (!this.pageActive || !this.isMatchPageTop()) {
      return;
    }
    if (this.rotateMotionInFlightCount > 0 || this.rotateActionInFlight) {
      this.roomLoadPending = true;
      this.roomLoadPendingForce = this.roomLoadPendingForce || force;
      return;
    }
    if (this.roomLoadInFlight) {
      this.roomLoadPending = true;
      this.roomLoadPendingForce = this.roomLoadPendingForce || force;
      return;
    }
    this.roomLoadInFlight = true;
    try {
      let room = localOnly ? getRoom(roomId) : await getRoomAsync(roomId);
      if (!room && localOnly) {
        room = await getRoomAsync(roomId);
      }
      if (!room) {
        const fallback = this.lastRoomSnapshot || this.readCachedRoomSnapshot(roomId);
        if (fallback) {
          room = fallback;
          this.handleRoomTemporarilyUnavailable(force);
        } else {
          this.handleRoomTemporarilyUnavailable(force);
          return;
        }
      } else {
        this.roomClosedHandled = false;
        this.clearRoomMissingRetry();
        if (this.roomMissingLoadingVisible && !this.setEndLoadingVisible && !this.reconfigureLoadingVisible) {
          wx.hideLoading({
            fail: () => {},
          });
          this.roomMissingLoadingVisible = false;
        }
        this.lastRoomSnapshot = room;
        this.writeCachedRoomSnapshot(room);
      }
      if (!room) {
        this.handleRoomTemporarilyUnavailable(force);
        return;
      }
      this.lastRoomSnapshot = room;
      const currentUpdatedAt = Number(this.data.updatedAt || 0);
      const incomingUpdatedAt = Number(room.updatedAt || 0);
      if (!force && incomingUpdatedAt < currentUpdatedAt) {
        return;
      }
      if (room.status === "setup") {
        if (!this.pageActive || !this.isMatchPageTop()) {
          return;
        }
        if (!this.statusRouteRedirecting) {
          this.statusRouteRedirecting = true;
          wx.redirectTo({
            url: "/pages/create-room/create-room?roomId=" + roomId,
            fail: () => {
              this.statusRouteRedirecting = false;
            },
          });
        }
        return;
      }
      if (room.status === "result") {
        if (!this.pageActive || !this.isMatchPageTop()) {
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
      const currentClientId = String(this.clientId || getApp<IAppOption>().globalData.clientId || "");
      const incomingControlRole = getRoomControlRole(room, currentClientId);
      // 仅当“自己仍是操作者”时才忽略远端回刷，避免编辑输入中断；
      // 若已被接管，则必须及时吃到远端快照并降为观赛态。
      if (incomingControlRole === "operator" && this.data.hasOperationAuthority && this.isPlayerCardsEditable()) {
        return;
      }
      if (!force && incomingUpdatedAt === currentUpdatedAt) {
        return;
      }
      const incomingRawLogs = Array.isArray(room.match.logs) ? (room.match.logs as MatchLogItem[]) : [];
      const incomingLogs = normalizeLogsBySet(incomingRawLogs);
      this.allLogs = incomingLogs.slice();
      const roomOwnerClientId = getRoomOwnerClientId(room);
      const roomOperatorClientId = getRoomOperatorClientId(room);
      const controlRole = incomingControlRole;
      if (controlRole === "operator") {
        this.observerViewSideLocal = "";
      }
      const observerViewSide: "A" | "B" =
        controlRole === "operator"
          ? "A"
          : this.observerViewSideLocal === "A" || this.observerViewSideLocal === "B"
            ? this.observerViewSideLocal
            : this.data.observerViewSide === "B"
              ? "B"
              : "A";
      const sets = Math.max(1, Number((room.settings && room.settings.sets) || 1));
      const wins = Math.max(1, Number((room.settings && room.settings.wins) || 1));
      const logSetSwitchVisible = wins > 1;
      const currentSetNo = Math.max(1, Number(room.match.setNo || 1));
      const availableLogSets = Math.min(sets, currentSetNo);
      const prevSelectedLogSet = Math.max(1, Number(this.data.selectedLogSet || 1));
      const selectedLogSet =
        logSetSwitchVisible && prevSelectedLogSet <= availableLogSets
          ? prevSelectedLogSet
          : Math.min(currentSetNo, availableLogSets);
      const logsForSet = this.getDisplayLogsBySet(incomingLogs, selectedLogSet);
      const latestLogId = incomingLogs.length
        ? String(incomingLogs[incomingLogs.length - 1].id || "")
        : "";
      const latestAction = incomingLogs.length ? String(incomingLogs[incomingLogs.length - 1].action || "") : "";
      const shouldClearLiveSubDownByIncomingLog =
        !!latestLogId &&
        latestLogId !== this.lastSeenLogId &&
        shouldClearLiveSubDownBadgeByAction(latestAction);
      const prevAPlayers = ensureTeamPlayerOrder(this.data.teamAPlayers || []);
      const prevBPlayers = ensureTeamPlayerOrder(this.data.teamBPlayers || []);
      const shouldAutoAnimate = !force && this.data.updatedAt > 0 && prevAPlayers.length > 0 && prevBPlayers.length > 0;
      const roomAPlayers = ensureTeamPlayerOrder((room.teamA && room.teamA.players) || []);
      const roomBPlayers = ensureTeamPlayerOrder((room.teamB && room.teamB.players) || []);
      const teamALiberoRosterNos = getLiberoRosterForTeam(room, "A", this.data.teamALiberoRosterNos || []);
      const teamBLiberoRosterNos = getLiberoRosterForTeam(room, "B", this.data.teamBLiberoRosterNos || []);
      let roomADisplayPlayers = markDisplayPlayersByLiberoRoster(roomAPlayers, teamALiberoRosterNos);
      let roomBDisplayPlayers = markDisplayPlayersByLiberoRoster(roomBPlayers, teamBLiberoRosterNos);
      let prevADisplayPlayers = markDisplayPlayersByLiberoRoster(prevAPlayers, teamALiberoRosterNos);
      let prevBDisplayPlayers = markDisplayPlayersByLiberoRoster(prevBPlayers, teamBLiberoRosterNos);

      const roomSwapped = !!room.match.isSwapped;
      const nextSwapped = this.resolveDisplaySwapped(roomSwapped, {
        observerSide: observerViewSide,
        hasOperationAuthority: controlRole === "operator",
      });
      const shouldSwapAnimate = !force && this.data.updatedAt > 0 && nextSwapped !== !!this.data.isSwapped;
      let rotateReplayQueue =
        !force && !shouldSwapAnimate
          ? buildRotateReplayQueue(incomingLogs, this.lastSeenLogId)
          : [];
      if (!rotateReplayQueue.length && shouldAutoAnimate && !shouldSwapAnimate) {
        rotateReplayQueue = rotateReplayQueue
          .concat(buildRotateStepsByDiff(prevAPlayers, roomAPlayers, "A"))
          .concat(buildRotateStepsByDiff(prevBPlayers, roomBPlayers, "B"));
      }
      const useReplayQueue = shouldAutoAnimate && rotateReplayQueue.length > 0;
      const autoAnimateA = false;
      const autoAnimateB = false;
      const beforeARects = autoAnimateA ? await this.measureTeamMainPosRectsStable("A", 1000) : null;
      const beforeBRects = autoAnimateB ? await this.measureTeamMainPosRectsStable("B", 1000) : null;
      const beforeANoMap = autoAnimateA ? this.getTeamMainNumberMap("A") : null;
      const beforeBNoMap = autoAnimateB ? this.getTeamMainNumberMap("B") : null;
      const beforeACaptain = autoAnimateA ? this.data.teamACaptainNo : "";
      const beforeBCaptain = autoAnimateB ? this.data.teamBCaptainNo : "";
      const beforeAInitialCaptain = autoAnimateA ? this.data.teamAInitialCaptainNo : "";
      const beforeBInitialCaptain = autoAnimateB ? this.data.teamBInitialCaptainNo : "";
      const teamASide: TeamCode = nextSwapped ? "B" : "A";
      let aRows = buildTeamRows(roomADisplayPlayers);
      let bRows = buildTeamRows(roomBDisplayPlayers);
      let aMainGrid = buildMainGridByOrder(roomADisplayPlayers, getMainOrderForTeam("A", teamASide));
      let bMainGrid = buildMainGridByOrder(roomBDisplayPlayers, getMainOrderForTeam("B", teamASide));
      let prevARows = buildTeamRows(prevADisplayPlayers);
      let prevBRows = buildTeamRows(prevBDisplayPlayers);
      let prevAMainGrid = buildMainGridByOrder(prevADisplayPlayers, getMainOrderForTeam("A", teamASide));
      let prevBMainGrid = buildMainGridByOrder(prevBDisplayPlayers, getMainOrderForTeam("B", teamASide));
      const teamAColor = room.teamA.color || TEAM_COLOR_OPTIONS[0].value;
      const teamBColor = room.teamB.color || TEAM_COLOR_OPTIONS[1].value;
      const captainModeEnabled = isCaptainModeEnabledFromSettings(room.settings);
      const rawCurrentTeamACaptain = normalizeNumberInput(String((room.match as any).teamACurrentCaptainNo || ""));
      const rawCurrentTeamBCaptain = normalizeNumberInput(String((room.match as any).teamBCurrentCaptainNo || ""));
      const initialTeamACaptain = captainModeEnabled ? normalizeNumberInput(String((room.teamA as any).captainNo || "")) : "";
      const initialTeamBCaptain = captainModeEnabled ? normalizeNumberInput(String((room.teamB as any).captainNo || "")) : "";
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
      const matchModeText = buildMatchModeText(room.settings || {});
      const setWinsText = String(leftSetWins || 0) + " : " + String(rightSetWins || 0);
      const teamATimeoutCount = Math.max(0, Math.min(2, Number((room.match as any).teamATimeoutCount) || 0));
      const teamBTimeoutCount = Math.max(0, Math.min(2, Number((room.match as any).teamBTimeoutCount) || 0));
      const teamANormalSubCount = Math.max(0, Math.min(6, countNormalSubstitutionsBySet(incomingLogs, currentSetNo, "A")));
      const teamBNormalSubCount = Math.max(0, Math.min(6, countNormalSubstitutionsBySet(incomingLogs, currentSetNo, "B")));
      const timerStartAt = Number((room.match as any).setTimerStartAt) || 0;
      const timerElapsedMs = Number((room.match as any).setTimerElapsedMs) || 0;
      const timeoutEndAt = Math.max(0, Number((room.match as any).timeoutEndAt) || 0);
      const timeoutTeam =
        (room.match as any).timeoutTeam === "B"
          ? "B"
          : (room.match as any).timeoutTeam === "A"
            ? "A"
            : "";
      const timeoutActive = !!(room.match as any).timeoutActive && timeoutEndAt > Date.now() && !room.match.isFinished;
      const timeoutLeftText = timeoutActive ? formatTimeoutSeconds(timeoutEndAt - Date.now()) : "暂停 30s";
      if (!!(room.match as any).timeoutActive && timeoutEndAt > 0 && timeoutEndAt <= Date.now() && !this.timeoutAutoClearing) {
        this.timeoutAutoClearing = true;
        updateRoomAsync(roomId, (roomState) => {
          const opId = createLogId();
          (roomState.match as any).currentOpId = opId;
          const active = !!(roomState.match as any).timeoutActive;
          const endAt = Math.max(0, Number((roomState.match as any).timeoutEndAt) || 0);
          if (!active || endAt > Date.now()) {
            return roomState;
          }
          const t = (roomState.match as any).timeoutTeam === "B" ? "B" : "A";
          (roomState.match as any).timeoutActive = false;
          (roomState.match as any).timeoutTeam = "";
          (roomState.match as any).timeoutEndAt = 0;
          appendMatchLog(
            roomState,
            "timeout_end",
            (t === "A" ? roomState.teamA.name : roomState.teamB.name) + " 暂停结束",
            t,
            opId
          );
          (roomState.match as any).lastActionOpId = opId;
          return roomState;
        })
          .then(() => {
            this.loadRoom(roomId, false);
          })
          .finally(() => {
            this.timeoutAutoClearing = false;
          });
      }
      const shouldShowStartMatchModal =
        !room.match.isFinished &&
        Number(room.match.aScore || 0) === 0 &&
        Number(room.match.bScore || 0) === 0 &&
        timerStartAt <= 0 &&
        timerElapsedMs <= 0;
      if (!force && controlRole !== "operator" && Date.now() < this.observerPerspectiveFreezeUntil) {
        return;
      }
      const setEndState = ((room.match as any).setEndState || null) as
        | {
            active?: boolean;
            phase?: string;
            ownerClientId?: string;
            source?: string;
            setNo?: number;
            matchFinished?: boolean;
            summary?: {
              setNo?: number;
              teamAName?: string;
              teamBName?: string;
              smallScoreA?: number;
              smallScoreB?: number;
              bigScoreA?: number;
              bigScoreB?: number;
              winnerName?: string;
              durationText?: string;
              matchFinished?: boolean;
            };
          }
        | null;
      const setEndSource = String((setEndState && setEndState.source) || "set_end");
      const isReconfigureFlow = setEndSource === "reconfigure";
      const setEndActive = !!(setEndState && setEndState.active);
      const effectiveSetEndActive = setEndActive && !isReconfigureFlow;
      // 局结束弹窗已出现时，保持当前页底层比赛展示不被“下一局初始化快照”打断，
      // 但不影响此前已经发生的合法轮转/加分本地动画。
      const freezeSetEndDisplay = effectiveSetEndActive && this.data.updatedAt > 0;
      const canStartMatch = shouldShowStartMatchModal && !effectiveSetEndActive;
      const effectiveSetNo = freezeSetEndDisplay
        ? Math.max(1, Number(this.data.setNo || 1))
        : Math.max(1, Number(room.match.setNo) || 1);
      const effectiveCanStartMatch = freezeSetEndDisplay ? !!this.data.canStartMatch : canStartMatch;
      const cloudFlowModeRaw = String((room.match as any).flowMode || "");
      const roomFlowMode: MatchFlowMode =
        cloudFlowModeRaw === "edit_players" || cloudFlowModeRaw === "between_sets"
          ? (cloudFlowModeRaw as MatchFlowMode)
          : "normal";
      const cloudFlowReturnRaw = String((room.match as any).flowReturnState || "");
      const roomFlowReturnState: MatchFlowReturnState =
        cloudFlowReturnRaw === "playing"
          ? "playing"
          : cloudFlowReturnRaw === "prestart"
            ? "prestart"
            : effectiveCanStartMatch
              ? "prestart"
              : "playing";
      let flowMode: MatchFlowMode =
        room.match.isFinished || effectiveSetEndActive ? "normal" : roomFlowMode;
      if (controlRole !== "operator" && flowMode !== "normal") {
        // 观赛端始终停留在比赛页 normal 视图，仅通过“接管”进入操作态。
        flowMode = "normal";
      }
      if (
        controlRole === "operator" &&
        this.data.hasOperationAuthority &&
        (this.data.matchFlowMode === "edit_players" || this.data.matchFlowMode === "between_sets") &&
        roomFlowMode === "normal"
      ) {
        // 避免短暂旧快照把本地已进入的编辑/局间配置模式误回退为 normal。
        flowMode = this.data.matchFlowMode as MatchFlowMode;
      }
      const cloudPreStartCaptainConfirmed = !!(room.match as any).preStartCaptainConfirmed;
      const cloudPreStartCaptainConfirmSetNo = Math.max(0, Number((room.match as any).preStartCaptainConfirmSetNo || 0));
      const preStartCaptainConfirmed = captainModeEnabled
        ? cloudPreStartCaptainConfirmed &&
          cloudPreStartCaptainConfirmSetNo === effectiveSetNo
        : true;
      const preStartCaptainConfirmSetNo = preStartCaptainConfirmed ? effectiveSetNo : 0;
      const currentTeamACaptain = captainModeEnabled
        ? effectiveCanStartMatch && !preStartCaptainConfirmed
          ? ""
          : rawCurrentTeamACaptain
        : "";
      const currentTeamBCaptain = captainModeEnabled
        ? effectiveCanStartMatch && !preStartCaptainConfirmed
          ? ""
          : rawCurrentTeamBCaptain
        : "";
      const keepCaptainConfirmInPlaying =
        this.captainConfirmReason === "post_edit" || this.captainConfirmReason === "post_sub";
      const showCaptainConfirmModal =
        captainModeEnabled &&
        flowMode === "normal" &&
        controlRole === "operator" &&
        (effectiveCanStartMatch || keepCaptainConfirmInPlaying) &&
        !!this.data.showCaptainConfirmModal;
      const playerCardsEditable = controlRole === "operator" && (flowMode === "edit_players" || flowMode === "between_sets");
      const enteringBetweenSets = flowMode === "between_sets" && this.data.matchFlowMode !== "between_sets";
      if (enteringBetweenSets) {
        this.editDisplayRoleMapA = buildDisplayRoleMapFromDisplayedPlayers(roomADisplayPlayers);
        this.editDisplayRoleMapB = buildDisplayRoleMapFromDisplayedPlayers(roomBDisplayPlayers);
      }
      if ((flowMode === "edit_players" || flowMode === "between_sets") && controlRole === "operator") {
        const roleMapA = this.ensureEditDisplayRoleMap("A", roomADisplayPlayers);
        const roleMapB = this.ensureEditDisplayRoleMap("B", roomBDisplayPlayers);
        roomADisplayPlayers = applyDisplayRoleMapByPos(roomAPlayers, roleMapA);
        roomBDisplayPlayers = applyDisplayRoleMapByPos(roomBPlayers, roleMapB);
        prevADisplayPlayers = applyDisplayRoleMapByPos(prevAPlayers, roleMapA);
        prevBDisplayPlayers = applyDisplayRoleMapByPos(prevBPlayers, roleMapB);
        aRows = buildTeamRows(roomADisplayPlayers);
        bRows = buildTeamRows(roomBDisplayPlayers);
        aMainGrid = buildMainGridByOrder(roomADisplayPlayers, getMainOrderForTeam("A", teamASide));
        bMainGrid = buildMainGridByOrder(roomBDisplayPlayers, getMainOrderForTeam("B", teamASide));
        prevARows = buildTeamRows(prevADisplayPlayers);
        prevBRows = buildTeamRows(prevBDisplayPlayers);
        prevAMainGrid = buildMainGridByOrder(prevADisplayPlayers, getMainOrderForTeam("A", teamASide));
        prevBMainGrid = buildMainGridByOrder(prevBDisplayPlayers, getMainOrderForTeam("B", teamASide));
      } else {
        this.editDisplayRoleMapA = null;
        this.editDisplayRoleMapB = null;
      }
      const betweenHeadHint = buildBetweenSetHint(effectiveSetNo, wins);
      const isDecidingSet = isDecidingSetByRule(effectiveSetNo, wins);
      const liberoReentryLock = normalizeLiberoReentryLock((room.match as any).liberoReentryLock);
      const setEndPhase = String((setEndState && setEndState.phase) || "pending");
      const setEndOwnerClientId = String((setEndState && setEndState.ownerClientId) || "");
      const setEndWaiting = effectiveSetEndActive && setEndPhase === "lineup" && setEndOwnerClientId !== currentClientId;
      const setSummary = (setEndState && setEndState.summary) || {};
      const setEndMatchFinished = effectiveSetEndActive && !!(setEndState && setEndState.matchFinished);
      const setEndShouldCloseAnimated = this.data.showSetEndModal && !effectiveSetEndActive;
      if (effectiveSetEndActive) {
        this.clearSetEndModalCloseTimer();
      }
      const nextSetEndModalClosing = effectiveSetEndActive
        ? false
        : setEndShouldCloseAnimated
          ? true
          : !!this.data.setEndModalClosing;
      const effectiveShouldSwapAnimate = !freezeSetEndDisplay && shouldSwapAnimate;
      const effectiveUseReplayQueue = !freezeSetEndDisplay && useReplayQueue;
      const shouldAnimateFlowChange = flowMode !== this.data.matchFlowMode;
      const flowSwitchScope = this.getFlowSwitchScope(this.data.matchFlowMode as MatchFlowMode, flowMode);
      this.timerStartAtMs = timerStartAt;
      this.timerElapsedBaseMs = timerElapsedMs;
      this.timeoutEndAtMs = timeoutActive ? timeoutEndAt : 0;
      if (!timeoutActive) {
        this.timeoutWarnVibratedForEndAt = 0;
        this.timeoutEndVibratedForEndAt = 0;
      } else if (this.timeoutWarnVibratedForEndAt !== timeoutEndAt && this.timeoutEndVibratedForEndAt !== timeoutEndAt) {
        // 新的暂停会话到来时，重置本地震动标记。
        this.timeoutWarnVibratedForEndAt = 0;
        this.timeoutEndVibratedForEndAt = 0;
      }
      this.lastRenderedTimeoutText = timeoutLeftText;
      const liveTimerMs = timerStartAt > 0 ? timerElapsedMs + (Date.now() - timerStartAt) : timerElapsedMs;
      const timerText = formatDurationMMSS(liveTimerMs);
      this.lastRenderedTimerText = timerText;
      const nextLiveSubDownBadgeA =
        flowMode === "normal" && !shouldClearLiveSubDownByIncomingLog
          ? ((this.data.liveSubDownBadgeA || {}) as Partial<Record<Position, string>>)
          : ({} as Partial<Record<Position, string>>);
      const nextLiveSubDownBadgeB =
        flowMode === "normal" && !shouldClearLiveSubDownByIncomingLog
          ? ((this.data.liveSubDownBadgeB || {}) as Partial<Record<Position, string>>)
          : ({} as Partial<Record<Position, string>>);
      wx.setNavigationBarTitle({
        title: "裁判团队编号 " + roomId,
      });
      if (shouldAnimateFlowChange) {
        this.clearFlowSwitchInTimer();
        this.setData({
          flowSwitchingOut: true,
          flowSwitchingIn: false,
          flowSwitchScope: flowSwitchScope,
        });
      }
      if (effectiveShouldSwapAnimate) {
        this.setData({
          switchingOut: true,
          switchingIn: false,
        });
      }
      if (effectiveShouldSwapAnimate || shouldAnimateFlowChange) {
        const flowOutWaitMs = shouldAnimateFlowChange ? 80 : 0;
        const swapOutWaitMs = effectiveShouldSwapAnimate ? 120 : 0;
        await this.delayAsync(Math.max(flowOutWaitMs, swapOutWaitMs));
      }
      this.setData({
        captainModeEnabled: captainModeEnabled,
        participantCount: Math.max(1, Object.keys((room as any).participants || {}).length),
        teamAName: room.teamA.name,
        teamBName: room.teamB.name,
        teamAColor: teamAColor,
        teamBColor: teamBColor,
        roomPassword: String(room.password || ""),
        teamACaptainNo: currentTeamACaptain,
        teamBCaptainNo: currentTeamBCaptain,
        teamAInitialCaptainNo: initialTeamACaptain,
        teamBInitialCaptainNo: initialTeamBCaptain,
        teamARGB: hexToRgbTriplet(teamAColor),
        teamBRGB: hexToRgbTriplet(teamBColor),
        aScore: freezeSetEndDisplay ? Number(this.data.aScore || 0) : leftScore,
        bScore: freezeSetEndDisplay ? Number(this.data.bScore || 0) : rightScore,
        lastScoringTeam: freezeSetEndDisplay ? this.data.lastScoringTeam : displayLastScoringTeam,
        liberoReentryLockTeam: freezeSetEndDisplay
          ? this.data.liberoReentryLockTeam
          : liberoReentryLock
            ? liberoReentryLock.team
            : "",
        liberoReentryLockNo: freezeSetEndDisplay
          ? String(this.data.liberoReentryLockNo || "")
          : liberoReentryLock
            ? liberoReentryLock.liberoNo
            : "",
        liberoReentryLockSetNo: freezeSetEndDisplay
          ? Math.max(0, Number(this.data.liberoReentryLockSetNo || 0))
          : liberoReentryLock
            ? liberoReentryLock.setNo
            : 0,
        liberoReentryLockAScore: freezeSetEndDisplay
          ? Math.max(0, Number(this.data.liberoReentryLockAScore || 0))
          : liberoReentryLock
            ? liberoReentryLock.aScore
            : 0,
        liberoReentryLockBScore: freezeSetEndDisplay
          ? Math.max(0, Number(this.data.liberoReentryLockBScore || 0))
          : liberoReentryLock
            ? liberoReentryLock.bScore
            : 0,
        setTimerText: freezeSetEndDisplay ? String(this.data.setTimerText || "00:00") : timerText,
        servingTeam: freezeSetEndDisplay ? this.data.servingTeam : room.match.servingTeam,
        setNo: freezeSetEndDisplay ? Number(this.data.setNo || 1) : room.match.setNo || 1,
        aSetWins: freezeSetEndDisplay ? Number(this.data.aSetWins || 0) : room.match.aSetWins || 0,
        bSetWins: freezeSetEndDisplay ? Number(this.data.bSetWins || 0) : room.match.bSetWins || 0,
        teamATimeoutCount: freezeSetEndDisplay ? Number(this.data.teamATimeoutCount || 0) : teamATimeoutCount,
        teamBTimeoutCount: freezeSetEndDisplay ? Number(this.data.teamBTimeoutCount || 0) : teamBTimeoutCount,
        teamANormalSubCount: freezeSetEndDisplay ? Number(this.data.teamANormalSubCount || 0) : teamANormalSubCount,
        teamBNormalSubCount: freezeSetEndDisplay ? Number(this.data.teamBNormalSubCount || 0) : teamBNormalSubCount,
        timeoutActive: freezeSetEndDisplay ? !!this.data.timeoutActive : timeoutActive,
        timeoutTeam: freezeSetEndDisplay ? this.data.timeoutTeam : timeoutActive ? timeoutTeam : "",
        timeoutLeftText: freezeSetEndDisplay ? String(this.data.timeoutLeftText || "暂停 30s") : timeoutLeftText,
        setNoText: freezeSetEndDisplay ? String(this.data.setNoText || "第1局") : setNoText,
        matchModeText: matchModeText,
        setWinsText: freezeSetEndDisplay ? String(this.data.setWinsText || "0 : 0") : setWinsText,
        canStartMatch: effectiveCanStartMatch,
        matchFlowMode: flowMode,
        matchFlowReturnState: roomFlowReturnState,
        playerCardsEditable: playerCardsEditable,
        isDecidingSet: isDecidingSet,
        decidingSetEightPending: isDecidingSetEightPending(room),
        teamASideText: nextSwapped ? "右场区" : "左场区",
        teamBSideText: nextSwapped ? "左场区" : "右场区",
        betweenHeadTitle: "确认下一局的球员配置",
        betweenHeadHint: betweenHeadHint,
        preStartCaptainConfirmed: preStartCaptainConfirmed,
        preStartCaptainConfirmSetNo: preStartCaptainConfirmSetNo,
        showCaptainConfirmModal: showCaptainConfirmModal,
        captainConfirmModalClosing:
          showCaptainConfirmModal ? false : controlRole === "operator" ? this.data.captainConfirmModalClosing : false,
        showSubstitutionPanel: controlRole === "operator" ? this.data.showSubstitutionPanel : false,
        substitutionPanelClosing: controlRole === "operator" ? this.data.substitutionPanelClosing : false,
        showSubMatchLogPopover: controlRole === "operator" ? this.data.showSubMatchLogPopover : false,
        subMatchLogPopoverClosing: controlRole === "operator" ? this.data.subMatchLogPopoverClosing : false,
        isMatchFinished: freezeSetEndDisplay ? !!this.data.isMatchFinished : !!room.match.isFinished,
        showSetEndModal: effectiveSetEndActive,
        setEndModalClosing: nextSetEndModalClosing,
        setEndTitleTop: "第" + String(Math.max(1, Number(setSummary.setNo) || Number(setEndState && setEndState.setNo) || 1)) + "局结束",
        setEndTitleBottom: setEndMatchFinished ? "比赛结束" : "",
        setEndTeamAName: String(setSummary.teamAName || room.teamA.name || "甲"),
        setEndTeamBName: String(setSummary.teamBName || room.teamB.name || "乙"),
        setEndSmallScoreA: Math.max(0, Number(setSummary.smallScoreA) || 0),
        setEndSmallScoreB: Math.max(0, Number(setSummary.smallScoreB) || 0),
        setEndBigScoreA: Math.max(0, Number(setSummary.bigScoreA) || 0),
        setEndBigScoreB: Math.max(0, Number(setSummary.bigScoreB) || 0),
        setEndWinnerName: String(setSummary.winnerName || ""),
        setEndDurationText: String(setSummary.durationText || "00:00"),
        setEndMatchFinished: setEndMatchFinished,
        setEndActionText: setEndMatchFinished ? "确认比赛结果" : "继续",
        setEndWaiting: setEndWaiting,
        roomOwnerClientId: roomOwnerClientId,
        roomOperatorClientId: roomOperatorClientId,
        controlRole: controlRole,
        hasOperationAuthority: controlRole === "operator",
        observerViewSide: observerViewSide,
        rawRoomSwapped: freezeSetEndDisplay ? !!this.data.rawRoomSwapped : roomSwapped,
        isSwapped: freezeSetEndDisplay ? !!this.data.isSwapped : nextSwapped,
        teamAPlayers: freezeSetEndDisplay ? this.data.teamAPlayers : effectiveUseReplayQueue ? prevAPlayers : roomAPlayers,
        teamBPlayers: freezeSetEndDisplay ? this.data.teamBPlayers : effectiveUseReplayQueue ? prevBPlayers : roomBPlayers,
        teamALiberoRosterNos: freezeSetEndDisplay ? this.data.teamALiberoRosterNos : teamALiberoRosterNos,
        teamBLiberoRosterNos: freezeSetEndDisplay ? this.data.teamBLiberoRosterNos : teamBLiberoRosterNos,
        teamALibero: freezeSetEndDisplay ? this.data.teamALibero : effectiveUseReplayQueue ? prevARows.libero : aRows.libero,
        teamAMainGrid: freezeSetEndDisplay ? this.data.teamAMainGrid : effectiveUseReplayQueue ? prevAMainGrid : aMainGrid,
        teamBLibero: freezeSetEndDisplay ? this.data.teamBLibero : effectiveUseReplayQueue ? prevBRows.libero : bRows.libero,
        teamBMainGrid: freezeSetEndDisplay ? this.data.teamBMainGrid : effectiveUseReplayQueue ? prevBMainGrid : bMainGrid,
        liveSubDownBadgeA: nextLiveSubDownBadgeA,
        liveSubDownBadgeB: nextLiveSubDownBadgeB,
        // 主层号码显隐仅由 playTeamRotateMotion 管理，避免 loadRoom 在动画收尾阶段误隐藏造成闪烁。
        hideTeamAMainNumbers: freezeSetEndDisplay ? !!this.data.hideTeamAMainNumbers : false,
        hideTeamBMainNumbers: freezeSetEndDisplay ? !!this.data.hideTeamBMainNumbers : false,
        logs: logsForSet,
        logSetSwitchVisible: logSetSwitchVisible,
        logSetOptions: this.buildLogSetOptions(availableLogSets),
        selectedLogSet: selectedLogSet,
        updatedAt: room.updatedAt,
        switchingOut: false,
        switchingIn: effectiveShouldSwapAnimate,
      });
      if (setEndShouldCloseAnimated) {
        this.clearSetEndModalCloseTimer();
        this.setEndModalCloseTimer = setTimeout(() => {
          this.setEndModalCloseTimer = 0;
          if (!this.data.showSetEndModal && this.data.setEndModalClosing) {
            this.setData({ setEndModalClosing: false });
          }
        }, MODAL_ANIM_MS) as unknown as number;
      }
      this.finishFlowModeSwitchIn(shouldAnimateFlowChange);
      this.maybeShowDecidingSetEightModal(roomId);
      if (!freezeSetEndDisplay && controlRole !== "operator") {
        const latestLocalObserverSide =
          this.observerViewSideLocal === "A" || this.observerViewSideLocal === "B"
            ? this.observerViewSideLocal
            : "";
        if (latestLocalObserverSide && latestLocalObserverSide !== observerViewSide) {
          this.applyLocalScoreFromRoom(room, { observerSide: latestLocalObserverSide, hasOperationAuthority: false });
          this.applyLocalLineupFromRoom(room, { observerSide: latestLocalObserverSide, hasOperationAuthority: false });
          this.setData({
            observerViewSide: latestLocalObserverSide,
            rawRoomSwapped: roomSwapped,
          });
        }
      }
      if (effectiveShouldSwapAnimate) {
        setTimeout(() => {
          this.setData({ switchingIn: false });
        }, 220);
      }
      if (effectiveUseReplayQueue) {
        let tempAPlayers = clonePlayerList(prevAPlayers);
        let tempBPlayers = clonePlayerList(prevBPlayers);
        for (let i = 0; i < rotateReplayQueue.length; ) {
          const step = rotateReplayQueue[i];
          const nextStep = i + 1 < rotateReplayQueue.length ? rotateReplayQueue[i + 1] : null;
          const canParallel = !!nextStep && nextStep.team !== step.team;

          const measuredBeforeRects1 = await this.measureTeamMainPosRectsStable(step.team, 1200);
          const beforeRects1 = this.completeTeamRectMapByGrid(
            step.team,
            measuredBeforeRects1 || {},
            this.getCachedTeamRectMap(step.team)
          );
          const beforeNoMap1 = this.getTeamMainNumberMap(step.team);
          const beforeCaptain1 = step.team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;
          const beforeInitialCaptain1 = step.team === "A" ? this.data.teamAInitialCaptainNo : this.data.teamBInitialCaptainNo;

          let beforeRects2: TeamRectMap | null = null;
          let beforeNoMap2: TeamMainNoMap | null = null;
          let beforeCaptain2 = "";
          let beforeInitialCaptain2 = "";
          if (canParallel && nextStep) {
            const measuredBeforeRects2 = await this.measureTeamMainPosRectsStable(nextStep.team, 1200);
            beforeRects2 = this.completeTeamRectMapByGrid(
              nextStep.team,
              measuredBeforeRects2 || {},
              this.getCachedTeamRectMap(nextStep.team)
            );
            beforeNoMap2 = this.getTeamMainNumberMap(nextStep.team);
            beforeCaptain2 = nextStep.team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;
            beforeInitialCaptain2 = nextStep.team === "A" ? this.data.teamAInitialCaptainNo : this.data.teamBInitialCaptainNo;
          }

          if (step.team === "A") {
            tempAPlayers = step.reverse ? rotateTeamReverseByRule(tempAPlayers) : rotateTeamByRule(tempAPlayers);
          } else {
            tempBPlayers = step.reverse ? rotateTeamReverseByRule(tempBPlayers) : rotateTeamByRule(tempBPlayers);
          }
          if (canParallel && nextStep) {
            if (nextStep.team === "A") {
              tempAPlayers = nextStep.reverse ? rotateTeamReverseByRule(tempAPlayers) : rotateTeamByRule(tempAPlayers);
            } else {
              tempBPlayers = nextStep.reverse ? rotateTeamReverseByRule(tempBPlayers) : rotateTeamByRule(tempBPlayers);
            }
          }

          const tempADisplayPlayers = markDisplayPlayersByLiberoRoster(tempAPlayers, teamALiberoRosterNos);
          const tempBDisplayPlayers = markDisplayPlayersByLiberoRoster(tempBPlayers, teamBLiberoRosterNos);
          const tempARows = buildTeamRows(tempADisplayPlayers);
          const tempBRows = buildTeamRows(tempBDisplayPlayers);
          this.setData({
            teamAPlayers: tempAPlayers,
            teamBPlayers: tempBPlayers,
            teamALibero: tempARows.libero,
            teamAMainGrid: buildMainGridByOrder(tempADisplayPlayers, getMainOrderForTeam("A", teamASide)),
            teamBLibero: tempBRows.libero,
            teamBMainGrid: buildMainGridByOrder(tempBDisplayPlayers, getMainOrderForTeam("B", teamASide)),
          });

          if (canParallel && nextStep && beforeRects2 && beforeNoMap2) {
            await Promise.all([
              this.playTeamRotateMotion(
                step.team,
                beforeRects1,
                beforeNoMap1,
                beforeCaptain1,
                beforeInitialCaptain1,
                step.reverse ? "reverse" : "forward"
              ),
              this.playTeamRotateMotion(
                nextStep.team,
                beforeRects2,
                beforeNoMap2,
                beforeCaptain2,
                beforeInitialCaptain2,
                nextStep.reverse ? "reverse" : "forward"
              ),
            ]);
            i += 2;
          } else {
            await this.playTeamRotateMotion(
              step.team,
              beforeRects1,
              beforeNoMap1,
              beforeCaptain1,
              beforeInitialCaptain1,
              step.reverse ? "reverse" : "forward"
            );
            i += 1;
          }
        }
        this.setData({
          teamAPlayers: roomAPlayers,
          teamBPlayers: roomBPlayers,
          teamALibero: aRows.libero,
          teamAMainGrid: aMainGrid,
          teamBLibero: bRows.libero,
          teamBMainGrid: bMainGrid,
        });
      }
      if (autoAnimateA && beforeARects && beforeANoMap) {
        await this.playTeamRotateMotion("A", beforeARects, beforeANoMap, beforeACaptain, beforeAInitialCaptain);
      }
      if (autoAnimateB && beforeBRects && beforeBNoMap) {
        await this.playTeamRotateMotion("B", beforeBRects, beforeBNoMap, beforeBCaptain, beforeBInitialCaptain);
      }
      this.scheduleRectCacheWarmup(36);
      if (this.data.showSubstitutionPanel) {
        this.syncSubstitutionTeamDisplay(this.data.subTeam === "B" ? "B" : "A", {
          preserveDraft: true,
        });
      } else {
        this.tryRestoreSubstitutionDraft();
      }
      this.maybeShowSetUsageAlerts(room, {
        teamANormalSubCount: teamANormalSubCount,
        teamBNormalSubCount: teamBNormalSubCount,
        teamATimeoutCount: teamATimeoutCount,
        teamBTimeoutCount: teamBTimeoutCount,
        controlRole: controlRole,
      });
      this.maybeShowFrontRowLiberoHint(room);
      this.lastSeenLogId = latestLogId;
      this.lastAutoLineupOpenSign = "";
    } catch (_e) {
    } finally {
      this.roomLoadInFlight = false;
      if (this.data.hasOperationAuthority && this.isPlayerCardsEditable()) {
        this.roomLoadPending = false;
        this.roomLoadPendingForce = false;
        return;
      }
      if (this.roomLoadPending) {
        const pendingForce = !!this.roomLoadPendingForce;
        this.roomLoadPending = false;
        this.roomLoadPendingForce = false;
        const shouldDeferForInput = this.isPlayerCardsEditable() && (this.inputEditing || !!this.data.activeAdjustInputKey);
        this.schedulePendingRoomLoad(roomId, pendingForce, shouldDeferForInput ? 120 : 16);
      }
    }
  },

  onScoreChange(e: WechatMiniprogram.CustomEvent) {
    if (!this.hasRoomSnapshotReady()) {
      this.notifyAuthoritativeRoomSyncing();
      return;
    }
    if (this.isDecidingSetEightChoiceActive()) {
      this.notifyDecidingSetEightChoiceActive();
      return;
    }
    if (this.isDecidingSetEightPendingActive()) {
      this.notifyDecidingSetEightPending();
      return;
    }
    const raw = (e && e.detail ? (e.detail as { team?: TeamCode; type?: "add" | "sub" }) : {}) || {};
    const detail = {
      team: raw.team,
      type: raw.type || "add",
    };
    void this.enqueueAction(() => this.handleScoreChange(detail));
  },

  async handleScoreChange(detail: { team?: TeamCode; type?: "add" | "sub" }) {
    if (!this.hasRoomSnapshotReady()) {
      this.notifyAuthoritativeRoomSyncing();
      return;
    }
    if (this.isDecidingSetEightChoiceActive()) {
      this.notifyDecidingSetEightChoiceActive();
      return;
    }
    if (this.isMatchInteractionLocked()) {
      return;
    }
    if (this.isDecidingSetEightPendingActive()) {
      this.notifyDecidingSetEightPending();
      return;
    }
    if (this.data.showSetEndModal) {
      return;
    }
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
    const currentTeamScoreFromView = this.data.isSwapped
      ? team === "A"
        ? Number(this.data.bScore || 0)
        : Number(this.data.aScore || 0)
      : team === "A"
        ? Number(this.data.aScore || 0)
        : Number(this.data.bScore || 0);
    if (type === "add" && currentTeamScoreFromView >= 99) {
      showToastHint("单局比分不能超过99");
      return;
    }
    if (type === "add" && this.data.canStartMatch) {
      showToastHint("请先开始比赛");
      return;
    }
    if (type === "add" && this.data.timeoutActive) {
      showToastHint("暂停中，无法加分");
      return;
    }
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，请重置或重新配置");
      return;
    }
    const roomId = this.data.roomId;
    const shouldGuardRotateAction = type === "add" && this.data.servingTeam !== team;
    let rotateLockHeld = false;
    const releaseRotateLock = () => {
      if (!rotateLockHeld) {
        return;
      }
      this.rotateActionInFlight = false;
      rotateLockHeld = false;
    };
    if (shouldGuardRotateAction) {
      this.rotateActionInFlight = true;
      rotateLockHeld = true;
    }
    let rotatedTeam: TeamCode | "" = "";
    let needDecidingSetSwitchChoice = false;
    let blockedByTimeout = false;
    let blockedByMaxScore = false;
    try {
      const beforeRotateRects = shouldGuardRotateAction ? await this.measureTeamMainPosRectsStable(team, 1000) : null;
      const beforeRotateNoMap = beforeRotateRects ? this.getTeamMainNumberMap(team) : null;
      const beforeRotateCaptain = beforeRotateRects ? (team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo) : "";
      const beforeRotateInitialCaptain = beforeRotateRects
        ? team === "A"
          ? this.data.teamAInitialCaptainNo
          : this.data.teamBInitialCaptainNo
        : "";

      const next = await updateRoomAsync(roomId, (room) => {
        const opId = createLogId();
        (room.match as any).currentOpId = opId;
        if (room.match.isFinished) {
          return room;
        }
        if (type === "add") {
          if (!room.match.setTimerStartAt) {
            return room;
          }
          if (!!(room.match as any).timeoutActive && Number((room.match as any).timeoutEndAt || 0) > Date.now()) {
            blockedByTimeout = true;
            return room;
          }
          if ((team === "A" ? Number(room.match.aScore || 0) : Number(room.match.bScore || 0)) >= 99) {
            blockedByMaxScore = true;
            return room;
          }
          pushUndoSnapshot(room);

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
            team,
            opId
          );

          if (room.match.servingTeam !== team) {
            rotateTeamAndLog(room, team, "轮转");
            rotatedTeam = team;
            room.match.servingTeam = team;
          }

          if (shouldPromptSwitchAtEight(room)) {
            room.match.decidingSetEightHandled = true;
            needDecidingSetSwitchChoice = true;
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
            markSetEndIsSwapped(room, endedSetNo);
            const startedAt = Number(room.match.setTimerStartAt) || 0;
            const baseElapsed = Number(room.match.setTimerElapsedMs) || 0;
            const finalElapsed = startedAt > 0 ? baseElapsed + (Date.now() - startedAt) : baseElapsed;
            room.match.setTimerElapsedMs = finalElapsed;
            room.match.setTimerStartAt = 0;
            (room.match as any).timeoutActive = false;
            (room.match as any).timeoutTeam = "";
            (room.match as any).timeoutEndAt = 0;
            const setElapsedText = formatDurationMMSS(finalElapsed);
            if (!(room.match as any).setSummaries || typeof (room.match as any).setSummaries !== "object") {
              (room.match as any).setSummaries = {};
            }
            (room.match as any).setSummaries[String(endedSetNo)] = {
              setNo: endedSetNo,
              teamAName: String(room.teamA.name || "甲"),
              teamBName: String(room.teamB.name || "乙"),
              smallScoreA: endedScoreA,
              smallScoreB: endedScoreB,
              bigScoreA: Number(room.match.aSetWins || 0) + (setWinner === "A" ? 1 : 0),
              bigScoreB: Number(room.match.bSetWins || 0) + (setWinner === "B" ? 1 : 0),
              winnerName: setWinner === "A" ? String(room.teamA.name || "甲") : String(room.teamB.name || "乙"),
              durationText: setElapsedText,
              matchFinished: false,
            };
            if (setWinner === "A") {
              room.match.aSetWins += 1;
            } else {
              room.match.bSetWins += 1;
            }
            (room.match as any).setSummaries[String(endedSetNo)].bigScoreA = Number(room.match.aSetWins || 0);
            (room.match as any).setSummaries[String(endedSetNo)].bigScoreB = Number(room.match.bSetWins || 0);
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
              setWinner,
              opId
            );

            const reachedWins =
              setWinner === "A"
                ? room.match.aSetWins >= room.settings.wins
                : room.match.bSetWins >= room.settings.wins;
            if (reachedWins) {
              room.match.isFinished = true;
              const matchWinnerName = setWinner === "A" ? room.teamA.name : room.teamB.name;
              (room.match as any).setEndState = {
                active: true,
                phase: "pending",
                ownerClientId: "",
                source: "set_end",
                setNo: endedSetNo,
                matchFinished: true,
                summary: {
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
                },
              };
            } else {
              (room.match as any).setEndState = {
                active: true,
                phase: "pending",
                ownerClientId: "",
                source: "set_end",
                setNo: endedSetNo,
                matchFinished: false,
                summary: {
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
                },
              };
              room.match.setNo += 1;
              room.match.aScore = 0;
              room.match.bScore = 0;
              room.match.lastScoringTeam = "";
              room.match.setTimerStartAt = 0;
              // 小局结束后先保持上一局局时间，等待中场配置页返回比赛后再清零。
              room.match.setTimerElapsedMs = finalElapsed;
              room.match.servingTeam = setWinner;
              room.match.isSwapped = false;
              room.match.decidingSetEightHandled = false;
              (room.match as any).decidingSetEightPending = false;
              (room.match as any).timeoutActive = false;
              (room.match as any).timeoutTeam = "";
              (room.match as any).timeoutEndAt = 0;
              appendMatchLog(room, "next_set", "进入第" + String(room.match.setNo) + "局", setWinner, opId);
            }
          }
          (room.match as any).lastActionOpId = opId;
        }
        return room;
      });

      if (!next) {
        return;
      }
      if (blockedByTimeout) {
        releaseRotateLock();
        showToastHint("暂停中，无法加分");
        await this.loadRoom(roomId, true);
        return;
      }
      if (blockedByMaxScore) {
        releaseRotateLock();
        showToastHint("单局比分不能超过99");
        await this.loadRoom(roomId, true);
        return;
      }
      this.clearLiveSubDownBadges();
      const nextSetEndState = (next.match && (next.match as any).setEndState) || null;
      const nextSetEndSource = String((nextSetEndState && nextSetEndState.source) || "set_end");
      const shouldKeepSetEndDisplay = !!(nextSetEndState && nextSetEndState.active) && nextSetEndSource !== "reconfigure";
      if (shouldKeepSetEndDisplay) {
        releaseRotateLock();
        await this.loadRoom(roomId, true);
        return;
      }
      const showDecidingSetSwitchChoice = () => {
        if (!needDecidingSetSwitchChoice) {
          return;
        }
        this.decidingSetEightChoiceActive = true;
        wx.showModal({
          title: "决胜局8分",
          content: "是否现在换边？",
          confirmText: "换边",
          cancelText: "不换边",
          success: (res) => {
            if (res.confirm) {
              void this.switchSidesWithAnimation("自动换边（决胜局）").finally(() => {
                this.decidingSetEightChoiceActive = false;
              });
              return;
            }
            void this.loadRoom(roomId, true).finally(() => {
              this.decidingSetEightChoiceActive = false;
            });
          },
          fail: () => {
            this.decidingSetEightChoiceActive = false;
          },
        });
      };
      if (!rotatedTeam) {
        this.applyLocalScoreFromRoom(next);
        releaseRotateLock();
        await this.loadRoom(roomId, true);
        showDecidingSetSwitchChoice();
        return;
      }

      if (beforeRotateRects && beforeRotateNoMap) {
        this.applyLocalScoreFromRoom(next);
        this.applyLocalLineupFromRoom(next);
        await this.playTeamRotateMotion(
          rotatedTeam,
          beforeRotateRects,
          beforeRotateNoMap,
          beforeRotateCaptain,
          beforeRotateInitialCaptain,
          "forward"
        );
      }
      this.maybeShowFrontRowLiberoHint(next);
      releaseRotateLock();
      this.clearPendingRoomLoadRetry();
      this.roomLoadPending = false;
      this.roomLoadPendingForce = false;
      await this.loadRoom(roomId, true);
      showDecidingSetSwitchChoice();
    } finally {
      releaseRotateLock();
    }
  },

  switchSidesWithAnimation(logNote: string, options?: { clearDecidingSetEightPending?: boolean }) {
    const roomId = this.data.roomId;
    const clearDecidingSetEightPending = !!(options && options.clearDecidingSetEightPending);
    return new Promise<void>((resolve) => {
      this.setData({ switchingOut: true, switchingIn: false });
      setTimeout(() => {
        updateRoomAsync(roomId, (room) => {
          const opId = createLogId();
          (room.match as any).currentOpId = opId;
          pushUndoSnapshot(room);
          room.match.isSwapped = !room.match.isSwapped;
          if (clearDecidingSetEightPending) {
            (room.match as any).decidingSetEightPending = false;
          }
          appendMatchLog(room, "switch_sides", logNote, undefined, opId);
          (room.match as any).lastActionOpId = opId;
          return room;
        })
          .then((next) => {
            this.setData({ switchingOut: false, switchingIn: true });
            if (next) {
              this.clearLiveSubDownBadges();
              // 编辑/局间配置模式下 loadRoom 会跳过回刷，这里先本地落地，避免“只有动画不换边”。
              this.applyLocalScoreFromRoom(next);
              this.applyLocalLineupFromRoom(next);
              this.loadRoom(roomId, true);
            }
            setTimeout(() => {
              this.setData({ switchingIn: false });
              resolve();
            }, 220);
          })
          .catch(() => {
            this.setData({ switchingOut: false, switchingIn: false });
            resolve();
          });
      }, 150);
    });
  },

  onSwitchSides() {
    if (this.isBetweenSetMode()) {
      this.onToggleCourtSide();
      return;
    }
    if (!this.hasRoomSnapshotReady()) {
      this.notifyAuthoritativeRoomSyncing();
      return;
    }
    if (this.isDecidingSetEightPendingActive()) {
      this.notifyDecidingSetEightPending();
      return;
    }
    if (this.switchConfirming) {
      showToastHint("操作处理中，请稍候");
      return;
    }
    if (this.data.showSetEndModal) {
      return;
    }
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，无法换边");
      return;
    }
    this.switchConfirming = true;
    wx.showModal({
      title: "换边确认",
      content: "是否确认手动换边？",
      confirmText: "确定",
      cancelText: "取消",
      success: (res) => {
        if (!res.confirm) {
          this.switchConfirming = false;
          return;
        }
        void this.enqueueAction(async () => {
          await this.switchSidesWithAnimation("手动换边");
        }).finally(() => {
          this.switchConfirming = false;
        });
      },
      fail: () => {
        this.switchConfirming = false;
      },
    });
  },

  async onToggleObserverPerspective() {
    if (this.data.hasOperationAuthority) {
      return;
    }
    const nextSwapped = !this.data.isSwapped;
    const rawRoomSwapped = !!this.data.rawRoomSwapped;
    const nextSide: "A" | "B" = nextSwapped === rawRoomSwapped ? "A" : "B";
    const teamASide: TeamCode = nextSwapped ? "B" : "A";
    const teamAPlayers = ensureTeamPlayerOrder((this.data.teamAPlayers || []).slice());
    const teamBPlayers = ensureTeamPlayerOrder((this.data.teamBPlayers || []).slice());
    const displayAPlayers = markDisplayPlayersByLiberoRoster(teamAPlayers, this.data.teamALiberoRosterNos || []);
    const displayBPlayers = markDisplayPlayersByLiberoRoster(teamBPlayers, this.data.teamBLiberoRosterNos || []);
    const aRows = buildTeamRows(displayAPlayers);
    const bRows = buildTeamRows(displayBPlayers);
    const currSetWins = String(this.data.setWinsText || "0 : 0")
      .split(":")
      .map((s) => String(s || "").trim());
    const leftWins = currSetWins.length > 0 ? currSetWins[0] : "0";
    const rightWins = currSetWins.length > 1 ? currSetWins[1] : "0";
    const token = ++this.observerPerspectiveToken;
    this.observerPerspectiveTargetSide = nextSide;
    this.observerViewSideLocal = nextSide;
    this.observerPerspectiveFreezeUntil = Date.now() + 1200;
    this.setData({ switchingOut: true, switchingIn: false });
    await this.delayAsync(120);
    if (token !== this.observerPerspectiveToken) {
      this.setData({ switchingOut: false, switchingIn: false });
      return;
    }
    try {
      this.setData({
        observerViewSide: nextSide,
        isSwapped: nextSwapped,
        aScore: Number(this.data.bScore || 0),
        bScore: Number(this.data.aScore || 0),
        setWinsText: rightWins + " : " + leftWins,
        lastScoringTeam: this.data.lastScoringTeam === "A" ? "B" : this.data.lastScoringTeam === "B" ? "A" : "",
        teamALibero: aRows.libero,
        teamAMainGrid: buildMainGridByOrder(displayAPlayers, getMainOrderForTeam("A", teamASide)),
        teamBLibero: bRows.libero,
        teamBMainGrid: buildMainGridByOrder(displayBPlayers, getMainOrderForTeam("B", teamASide)),
      });
    } catch (_e) {
      this.setData({
        observerViewSide: nextSide,
        isSwapped: nextSwapped,
        aScore: Number(this.data.bScore || 0),
        bScore: Number(this.data.aScore || 0),
        setWinsText: rightWins + " : " + leftWins,
        lastScoringTeam: this.data.lastScoringTeam === "A" ? "B" : this.data.lastScoringTeam === "B" ? "A" : "",
      });
    }
    this.setData({ switchingOut: false, switchingIn: true });
    setTimeout(() => {
      if (token !== this.observerPerspectiveToken) {
        this.setData({ switchingOut: false, switchingIn: false });
        return;
      }
      this.setData({ switchingIn: false });
      this.observerPerspectiveTargetSide = "";
    }, 220);
  },

  async onTeamTimeoutTap(e: WechatMiniprogram.TouchEvent) {
    if (!this.hasRoomSnapshotReady()) {
      this.notifyAuthoritativeRoomSyncing();
      return;
    }
    if (this.isMatchInteractionLocked()) {
      return;
    }
    if (this.isDecidingSetEightPendingActive()) {
      this.notifyDecidingSetEightPending();
      return;
    }
    if (!this.data.hasOperationAuthority) {
      return;
    }
    if (this.timeoutActionInFlight) {
      showToastHint("操作处理中，请稍候");
      return;
    }
    if (this.data.showSetEndModal) {
      return;
    }
    if (this.data.canStartMatch) {
      showToastHint("请先开始比赛");
      return;
    }
    if (this.data.isMatchFinished) {
      showToastHint("比赛已结束，无法暂停");
      return;
    }
    const team = ((e.currentTarget.dataset as { team?: TeamCode }).team || "") as TeamCode;
    if (team !== "A" && team !== "B") {
      return;
    }
    if (this.data.timeoutActive) {
      showToastHint("暂停进行中");
      return;
    }
    const currentCount = team === "A" ? Number(this.data.teamATimeoutCount || 0) : Number(this.data.teamBTimeoutCount || 0);
    if (currentCount >= 2) {
      const teamName = team === "A" ? String(this.data.teamAName || "甲") : String(this.data.teamBName || "乙");
      showToastHint(teamName + "队本局暂停次数已用完");
      return;
    }
    const teamName = team === "A" ? String(this.data.teamAName || "甲") : String(this.data.teamBName || "乙");
    this.timeoutActionInFlight = true;
    wx.showModal({
      title: "暂停确认",
      content: teamName + "队确认暂停？",
      confirmText: "确认",
      cancelText: "取消",
      success: async (res) => {
        try {
          if (!res.confirm) {
            return;
          }
          const roomId = this.data.roomId;
          const saved = await updateRoomAsync(
            roomId,
            (room) => {
              const opId = createLogId();
              (room.match as any).currentOpId = opId;
              if (room.match.isFinished) {
                return room;
              }
              if (!!(room.match as any).timeoutActive && Number((room.match as any).timeoutEndAt || 0) > Date.now()) {
                return room;
              }
              const key = team === "A" ? "teamATimeoutCount" : "teamBTimeoutCount";
              const prev = Math.max(0, Math.min(2, Number((room.match as any)[key]) || 0));
              if (prev >= 2) {
                return room;
              }
              (room.match as any)[key] = prev + 1;
              (room.match as any).timeoutActive = true;
              (room.match as any).timeoutTeam = team;
              (room.match as any).timeoutEndAt = Date.now() + 30 * 1000;
              const latestName = team === "A" ? String(room.teamA.name || teamName) : String(room.teamB.name || teamName);
              appendMatchLog(room, "timeout", latestName + " 暂停（" + String(prev + 1) + "/2）", team, opId);
              (room.match as any).lastActionOpId = opId;
              return room;
            }
          );
          if (!saved) {
            showToastHint("系统繁忙，请重试");
            return;
          }
          const nextCount = Math.max(
            0,
            Math.min(
              2,
              Number(saved && saved.match && (saved.match as any)[team === "A" ? "teamATimeoutCount" : "teamBTimeoutCount"]) || 0
            )
          );
          const used =
            !!saved &&
            !!(saved.match as any).timeoutActive &&
            (saved.match as any).timeoutTeam === team &&
            nextCount > currentCount;
          if (!used) {
            if (!!(saved.match as any).isFinished) {
              showToastHint("比赛已结束，无法暂停");
              return;
            }
            if (!!(saved.match as any).timeoutActive) {
              showToastHint("暂停进行中");
              return;
            }
            if (nextCount >= 2) {
              showToastHint(teamName + "队本局暂停次数已用完");
              return;
            }
            showToastHint("系统繁忙，请重试");
            return;
          }
          this.loadRoom(roomId, true);
        } finally {
          this.timeoutActionInFlight = false;
        }
      },
      fail: () => {
        this.timeoutActionInFlight = false;
      },
    });
  },

  async onEndTimeoutTap() {
    if (this.isMatchInteractionLocked()) {
      return;
    }
    if (this.timeoutActionInFlight) {
      return;
    }
    if (!this.data.timeoutActive || this.data.showSetEndModal || this.data.isMatchFinished) {
      return;
    }
    const roomId = this.data.roomId;
    if (!roomId) {
      return;
    }
    this.timeoutActionInFlight = true;
    try {
      const saved = await updateRoomAsync(
        roomId,
        (room) => {
          const opId = createLogId();
          (room.match as any).currentOpId = opId;
          const active = !!(room.match as any).timeoutActive;
          const endAt = Math.max(0, Number((room.match as any).timeoutEndAt) || 0);
          if (!active || endAt <= Date.now()) {
            return room;
          }
          const timeoutTeam = (room.match as any).timeoutTeam === "B" ? "B" : "A";
          (room.match as any).timeoutActive = false;
          (room.match as any).timeoutTeam = "";
          (room.match as any).timeoutEndAt = 0;
          appendMatchLog(
            room,
            "timeout_end",
            (timeoutTeam === "A" ? room.teamA.name : room.teamB.name) + " 暂停提前结束",
            timeoutTeam,
            opId
          );
          (room.match as any).lastActionOpId = opId;
          return room;
        }
      );
      const ended = !!saved && !(saved.match as any).timeoutActive;
      if (ended) {
        this.timeoutEndAtMs = 0;
        this.lastRenderedTimeoutText = "暂停 30s";
        this.timeoutWarnVibratedForEndAt = 0;
        this.timeoutEndVibratedForEndAt = 0;
        this.loadRoom(roomId, true);
      }
    } finally {
      this.timeoutActionInFlight = false;
    }
  },

  onRotateTeam(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { team: TeamCode };
    const team = dataset.team;
    if (team !== "A" && team !== "B") {
      return;
    }
    if (!this.hasRoomSnapshotReady()) {
      this.notifyAuthoritativeRoomSyncing();
      return;
    }
    if (this.isDecidingSetEightPendingActive()) {
      this.notifyDecidingSetEightPending();
      return;
    }
    if (this.isPlayerCardsEditable()) {
      const beforeRotateRectsPromise = this.measureTeamMainPosRectsStable(team, 800);
      const beforeRotateNoMap = this.getTeamMainNumberMap(team);
      const beforeRotateCaptain = team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;
      const beforeRotateInitialCaptain = team === "A" ? this.data.teamAInitialCaptainNo : this.data.teamBInitialCaptainNo;
      void beforeRotateRectsPromise.then(async (beforeRotateRects: TeamRectMap) => {
        const teamAPlayers = clonePlayerList(this.data.teamAPlayers || []);
        const teamBPlayers = clonePlayerList(this.data.teamBPlayers || []);
        if (team === "A") {
          const rotated = rotateTeamByRule(teamAPlayers);
          const patch = this.buildLineupDisplayPatch(rotated, teamBPlayers, !!this.data.isSwapped);
          this.setData(patch);
          await this.playTeamRotateMotion("A", beforeRotateRects, beforeRotateNoMap, beforeRotateCaptain, beforeRotateInitialCaptain, "forward");
        } else {
          const rotated = rotateTeamByRule(teamBPlayers);
          const patch = this.buildLineupDisplayPatch(teamAPlayers, rotated, !!this.data.isSwapped);
          this.setData(patch);
          await this.playTeamRotateMotion("B", beforeRotateRects, beforeRotateNoMap, beforeRotateCaptain, beforeRotateInitialCaptain, "forward");
        }
        this.flowPlayersDirty = true;
        void this.persistFlowLineupDraftNow();
      });
      return;
    }
    if (this.rotateConfirming) {
      showToastHint("操作处理中，请稍候");
      return;
    }
    this.rotateConfirming = true;
    const teamName = team === "A" ? String(this.data.teamAName || "甲") : String(this.data.teamBName || "乙");
    wx.showModal({
      title: "轮转确认",
      content: teamName + "队是否强制轮转？",
      confirmText: "确定",
      cancelText: "取消",
      success: (res) => {
        if (!res.confirm) {
          this.rotateConfirming = false;
          return;
        }
        void this.enqueueAction(async () => {
          if (this.data.showSetEndModal) {
            return;
          }
          if (this.data.isMatchFinished) {
            showToastHint("比赛已结束，无法轮转");
            return;
          }
          const roomId = this.data.roomId;
          let needReload = false;
          this.rotateActionInFlight = true;
          try {
            const beforeRotateRects = await this.measureTeamMainPosRectsStable(team, 1000);
            const beforeRotateNoMap = this.getTeamMainNumberMap(team);
            const beforeRotateCaptain = team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;
            const beforeRotateInitialCaptain = team === "A" ? this.data.teamAInitialCaptainNo : this.data.teamBInitialCaptainNo;
            const next = await updateRoomAsync(roomId, (room) => {
              const opId = createLogId();
              (room.match as any).currentOpId = opId;
              pushUndoSnapshot(room);
              rotateTeamAndLog(room, team, "手动轮转");
              (room.match as any).lastActionOpId = opId;
              return room;
            });
            if (!next) {
              return;
            }
            this.clearLiveSubDownBadges();
            this.applyLocalLineupFromRoom(next);
            await this.playTeamRotateMotion(
              team,
              beforeRotateRects,
              beforeRotateNoMap,
              beforeRotateCaptain,
              beforeRotateInitialCaptain,
              "forward"
            );
            this.maybeShowFrontRowLiberoHint(next);
            needReload = true;
          } finally {
            this.rotateActionInFlight = false;
          }
          if (needReload) {
            this.clearPendingRoomLoadRetry();
            this.roomLoadPending = false;
            this.roomLoadPendingForce = false;
            await this.loadRoom(roomId, true);
          }
        }).finally(() => {
          this.rotateConfirming = false;
        });
      },
      fail: () => {
        this.rotateConfirming = false;
      },
    });
  },

  async onResetScore() {
    const roomId = this.data.roomId;
    const next = await updateRoomAsync(roomId, (room) => {
      const opId = createLogId();
      (room.match as any).currentOpId = opId;
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
      (room.match as any).decidingSetEightPending = false;
      (room.match as any).teamATimeoutCount = 0;
      (room.match as any).teamBTimeoutCount = 0;
      (room.match as any).timeoutActive = false;
      (room.match as any).timeoutTeam = "";
      (room.match as any).timeoutEndAt = 0;
      delete (room.match as any).liberoReentryLock;
      room.match.isFinished = false;
      (room.match as any).setStartLineupsBySet = {};
      (room.match as any).lastActionOpId = opId;
      return room;
    });
    if (next) {
      this.clearLiveSubDownBadges();
      this.loadRoom(roomId, true);
    }
  },

  async performUndoLastScore(allowCrossSet = false, closeSetEndModal = false) {
    const roomId = this.data.roomId;
    this.rotateActionInFlight = true;
    try {
      let undone = false;
      let beforeAScore = 0;
      let beforeBScore = 0;
      let beforeIsSwapped = false;
      let beforeLastScoringTeam: TeamCode | "" = "";
      let inferredUndoTeamFromSetEnd: TeamCode | "" = "";
      let undoRotateA = false;
      let undoRotateB = false;
      let revertedOpId = "";
      const beforeARects = await this.measureTeamMainPosRectsStable("A", 1000);
      const beforeBRects = await this.measureTeamMainPosRectsStable("B", 1000);
      const beforeANoMap = this.getTeamMainNumberMap("A");
      const beforeBNoMap = this.getTeamMainNumberMap("B");
      const beforeACaptain = this.data.teamACaptainNo;
      const beforeBCaptain = this.data.teamBCaptainNo;
      const beforeAInitialCaptain = this.data.teamAInitialCaptainNo;
      const beforeBInitialCaptain = this.data.teamBInitialCaptainNo;
      const next = await updateRoomAsync(roomId, (room) => {
      const opId = createLogId();
      (room.match as any).currentOpId = opId;
      const setEndState = (room.match as any).setEndState || null;
      const setEndSummary = (setEndState && setEndState.summary) || null;
      const endA = Number(setEndSummary && setEndSummary.smallScoreA);
      const endB = Number(setEndSummary && setEndSummary.smallScoreB);
      if (endA > endB) {
        inferredUndoTeamFromSetEnd = "A";
      } else if (endB > endA) {
        inferredUndoTeamFromSetEnd = "B";
      } else {
        const winnerName = String((setEndSummary && setEndSummary.winnerName) || "");
        const teamAName = String((room.teamA && room.teamA.name) || "");
        const teamBName = String((room.teamB && room.teamB.name) || "");
        if (winnerName && teamAName && winnerName === teamAName) {
          inferredUndoTeamFromSetEnd = "A";
        } else if (winnerName && teamBName && winnerName === teamBName) {
          inferredUndoTeamFromSetEnd = "B";
        }
      }
      if (closeSetEndModal) {
        delete (room.match as any).setEndState;
      }
      beforeAScore = room.match.aScore;
      beforeBScore = room.match.bScore;
      beforeIsSwapped = !!room.match.isSwapped;
      beforeLastScoringTeam =
        room.match.lastScoringTeam === "B" ? "B" : room.match.lastScoringTeam === "A" ? "A" : "";
      const stack = room.match.undoStack;
      if (!stack || stack.length === 0) {
        return room;
      }
      let last = stack.pop() as UndoSnapshot | undefined;
      while (
        last &&
        last.aScore === room.match.aScore &&
        last.bScore === room.match.bScore &&
        (last.lastScoringTeam || "") === (room.match.lastScoringTeam || "") &&
        last.servingTeam === room.match.servingTeam &&
        !!last.isSwapped === !!room.match.isSwapped &&
        !!last.decidingSetEightHandled === !!room.match.decidingSetEightHandled &&
        !!(last as any).decidingSetEightPending === !!(room.match as any).decidingSetEightPending &&
        (last.setNo || room.match.setNo) === room.match.setNo &&
        (last.aSetWins || 0) === room.match.aSetWins &&
        (last.bSetWins || 0) === room.match.bSetWins &&
        !!last.isFinished === !!room.match.isFinished &&
        normalizeLiberoRosterNumbers(last.teamALiberoRoster || []).join(",") ===
          normalizeLiberoRosterNumbers((room.match as any).teamALiberoRoster || []).join(",") &&
        normalizeLiberoRosterNumbers(last.teamBLiberoRoster || []).join(",") ===
          normalizeLiberoRosterNumbers((room.match as any).teamBLiberoRoster || []).join(",") &&
        samePlayers(last.teamAPlayers || [], room.teamA.players || []) &&
        samePlayers(last.teamBPlayers || [], room.teamB.players || [])
      ) {
        last = stack.pop() as UndoSnapshot | undefined;
      }
      if (!last) {
        return room;
      }
      const currentSetNo = Math.max(1, Number(room.match.setNo || 1));
      const lastSetNo = Math.max(1, Number(last.setNo || currentSetNo));
      if (!allowCrossSet && lastSetNo !== currentSetNo) {
        stack.push(last);
        return room;
      }
      undone = true;
      revertedOpId = String((room.match as any).lastActionOpId || "");
      room.match.aScore = last.aScore;
      room.match.bScore = last.bScore;
      room.match.lastScoringTeam = last.lastScoringTeam === "B" ? "B" : last.lastScoringTeam === "A" ? "A" : "";
      (room.match as any).teamACurrentCaptainNo = String(last.teamACurrentCaptainNo || room.teamA.captainNo || "");
      (room.match as any).teamBCurrentCaptainNo = String(last.teamBCurrentCaptainNo || room.teamB.captainNo || "");
      (room.match as any).setTimerStartAt = Math.max(0, Number(last.setTimerStartAt) || 0);
      (room.match as any).setTimerElapsedMs = Math.max(0, Number(last.setTimerElapsedMs) || 0);
      room.match.servingTeam = last.servingTeam;
      room.match.isSwapped = !!last.isSwapped;
      room.match.decidingSetEightHandled = !!last.decidingSetEightHandled;
      (room.match as any).decidingSetEightPending = !!(last as any).decidingSetEightPending;
      room.match.setNo = last.setNo || room.match.setNo || 1;
      room.match.aSetWins = last.aSetWins || 0;
      room.match.bSetWins = last.bSetWins || 0;
      room.match.isFinished = !!last.isFinished;
      (room.match as any).teamALiberoRoster = normalizeLiberoRosterNumbers(last.teamALiberoRoster || []);
      (room.match as any).teamBLiberoRoster = normalizeLiberoRosterNumbers(last.teamBLiberoRoster || []);
      (room.match as any).liberoRosterSetNo = Math.max(0, Number(last.liberoRosterSetNo || room.match.setNo || 0));
      (room.match as any).setSummaries = JSON.parse(JSON.stringify((last as any).setSummaries || {}));
      const snapshotLiberoReentryLock = normalizeLiberoReentryLock((last as any).liberoReentryLock);
      if (snapshotLiberoReentryLock) {
        (room.match as any).liberoReentryLock = snapshotLiberoReentryLock;
      } else {
        delete (room.match as any).liberoReentryLock;
      }
      (room.match as any).lastActionOpId = String((last as any).lastActionOpId || "");
      undoRotateA = isOneStepRotationBetween(room.teamA.players || [], last.teamAPlayers || []);
      undoRotateB = isOneStepRotationBetween(room.teamB.players || [], last.teamBPlayers || []);
      const sameScore = Number(beforeAScore) === Number(last.aScore) && Number(beforeBScore) === Number(last.bScore);
      const swappedChanged = beforeIsSwapped !== !!last.isSwapped;
      room.teamA.players = last.teamAPlayers.slice();
      room.teamB.players = last.teamBPlayers.slice();
      let undoNote = "";
      if (sameScore && swappedChanged) {
        undoNote = "撤回手动换边";
      } else if (sameScore && undoRotateA !== undoRotateB) {
        const undoTeamName = undoRotateA ? String((room.teamA && room.teamA.name) || "甲") : String((room.teamB && room.teamB.name) || "乙");
        undoNote = undoTeamName + " 撤回手动轮转";
      } else {
        let undoTeam: TeamCode | "" = beforeLastScoringTeam;
        if (!undoTeam) {
          if (inferredUndoTeamFromSetEnd) {
            undoTeam = inferredUndoTeamFromSetEnd;
          }
        }
        if (!undoTeam) {
          if (Number(beforeAScore) > Number(last.aScore)) {
            undoTeam = "A";
          } else if (Number(beforeBScore) > Number(last.bScore)) {
            undoTeam = "B";
          }
        }
        const undoTeamName =
          undoTeam === "A"
            ? String((room.teamA && room.teamA.name) || "甲")
            : undoTeam === "B"
              ? String((room.teamB && room.teamB.name) || "乙")
              : "未知";
        undoNote =
          undoTeamName +
          " -1 比分撤回（" +
          String(room.match.aScore) +
          ":" +
          String(room.match.bScore) +
          "）";
      }
      appendMatchLog(room, "score_undo", undoNote, undefined, opId, revertedOpId);
      (room.match as any).lastActionOpId = opId;
      return room;
      });

      if (!next) {
        showToastHint("系统繁忙，请重试");
        return;
      }
      if (!undone) {
        showToastHint("本局无可撤回操作");
        return;
      }
      const afterANoMap = buildMainMap((next.teamA && next.teamA.players) || []);
      const afterBNoMap = buildMainMap((next.teamB && next.teamB.players) || []);
      this.clearLiveSubDownBadges();
      const undoDirectionA: RotateDirectionHint = undoRotateA ? resolveRotateDirection(beforeANoMap, afterANoMap) : "";
      const undoDirectionB: RotateDirectionHint = undoRotateB ? resolveRotateDirection(beforeBNoMap, afterBNoMap) : "";
      const swappedChanged = beforeIsSwapped !== !!(next.match && next.match.isSwapped);
      if (swappedChanged) {
        this.setData({ switchingOut: true, switchingIn: false });
        await this.delayAsync(120);
        this.applyLocalScoreFromRoom(next);
        this.applyLocalLineupFromRoom(next);
        this.setData({ switchingOut: false, switchingIn: true });
        await this.delayAsync(220);
        this.setData({ switchingIn: false });
      } else {
        this.applyLocalScoreFromRoom(next);
        this.applyLocalLineupFromRoom(next);
      }
      if (undoRotateA) {
        await this.playTeamRotateMotion("A", beforeARects, beforeANoMap, beforeACaptain, beforeAInitialCaptain, undoDirectionA);
      }
      if (undoRotateB) {
        await this.playTeamRotateMotion("B", beforeBRects, beforeBNoMap, beforeBCaptain, beforeBInitialCaptain, undoDirectionB);
      }
    } finally {
      this.rotateActionInFlight = false;
    }
    await this.loadRoom(roomId, true);
  },

  onUndoLastScore() {
    void this.enqueueAction(async () => {
      if (!this.hasRoomSnapshotReady()) {
        this.notifyAuthoritativeRoomSyncing();
        return;
      }
      if (this.data.showSetEndModal) {
        return;
      }
      await this.performUndoLastScore(false);
    });
  },

  async onSetEndUndo() {
    if (this.setEndActionInFlight) {
      showToastHint("操作处理中，请稍候");
      return;
    }
    if (this.data.setEndWaiting) {
      showToastHint("已由其他裁判接管");
      return;
    }
    this.setEndActionInFlight = true;
    try {
      await this.performUndoLastScore(true, true);
    } finally {
      this.setEndActionInFlight = false;
    }
  },

  onOpenLogPanel() {
    const openPanel = () => {
      const currentSetNo = Math.max(1, Number(this.data.setNo || 1));
      const availableSetCount = Math.max(1, Number((this.data.logSetOptions || []).length || 1));
      const targetSetNo = Math.min(currentSetNo, availableSetCount);
      this.clearSubstitutionDraft();
      this.clearLogPanelCloseTimer();
      this.clearSubstitutionPanelCloseTimer();
      this.clearSubMatchLogPopoverCloseTimer();
      this.setData({
        showLogPanel: true,
        logPanelClosing: false,
        showSubstitutionPanel: false,
        substitutionPanelClosing: false,
        showSubMatchLogPopover: false,
        subMatchLogPopoverClosing: false,
        showSubRecordTabMenu: false,
        subModeSwitching: false,
        subReasonSwitching: false,
        subRecordPickerSwitching: false,
        subRecordContentSwitching: false,
        logContentSwitching: false,
        selectedLogSet: targetSetNo,
        logs: this.getDisplayLogsBySet(this.allLogs, targetSetNo),
      }, () => {
        this.scrollLogPanelToBottom();
      });
    };
    this.syncLogPanelSizeFromSubPanel(openPanel);
  },

  syncLogPanelSizeFromSubPanel(done?: () => void) {
    const finish = () => {
      if (typeof done === "function") {
        done();
      }
    };
    wx.nextTick(() => {
      const query = this.createSelectorQuery();
      query.select("#sub-panel-size-probe").boundingClientRect();
      query.exec((res) => {
        const rect = (res && res[0]) as WechatMiniprogram.BoundingClientRectCallbackResult | null;
        if (!rect || !rect.width || !rect.height) {
          finish();
          return;
        }
        const width = Math.max(0, Math.round(Number(rect.width)));
        const minHeight = Math.max(0, Math.round(Number(rect.height)));
        if (!width || !minHeight) {
          finish();
          return;
        }
        const inlineStyle =
          "width:" +
          width +
          "px;max-width:" +
          width +
          "px;min-height:" +
          minHeight +
          "px;max-height:" +
          minHeight +
          "px;height:" +
          minHeight +
          "px;";
        if (this.data.logPanelInlineStyle === inlineStyle) {
          finish();
          return;
        }
        this.setData({ logPanelInlineStyle: inlineStyle }, finish);
      });
    });
  },

  syncCaptainConfirmPanelSizeFromSubPanel(done?: () => void) {
    const finish = () => {
      if (typeof done === "function") {
        done();
      }
    };
    wx.nextTick(() => {
      const query = this.createSelectorQuery();
      query.select("#sub-panel-size-probe").boundingClientRect();
      query.exec((res) => {
        const rect = (res && res[0]) as WechatMiniprogram.BoundingClientRectCallbackResult | null;
        if (!rect || !rect.width || !rect.height) {
          finish();
          return;
        }
        const width = Math.max(0, Math.round(Number(rect.width)));
        const minHeight = Math.max(0, Math.round(Number(rect.height)));
        if (!width || !minHeight) {
          finish();
          return;
        }
        const inlineStyle =
          "width:" +
          width +
          "px;max-width:" +
          width +
          "px;min-height:" +
          minHeight +
          "px;max-height:" +
          minHeight +
          "px;height:" +
          minHeight +
          "px;";
        if (this.data.captainConfirmPanelInlineStyle === inlineStyle) {
          finish();
          return;
        }
        this.setData({ captainConfirmPanelInlineStyle: inlineStyle }, finish);
      });
    });
  },

  onSelectLogSet(e: WechatMiniprogram.TouchEvent) {
    const setNo = Math.max(1, Number((e.currentTarget.dataset as { setNo?: number }).setNo || 1));
    if (setNo === this.data.selectedLogSet) {
      return;
    }
    this.setData({
      selectedLogSet: setNo,
      logContentSwitching: false,
      logs: this.getDisplayLogsBySet(this.allLogs, setNo),
    }, () => {
      this.scrollLogPanelToBottom();
      this.triggerLogContentSwitchAnimation();
    });
  },


  onCloseLogPanel() {
    this.closeLogPanelAnimated();
  },

  onLogPanelTap() {},

  getForcedSubIncomingNo(
    team: TeamCode,
    selectedPos: "" | Position,
    mode: "normal" | "special"
  ): string {
    if (mode !== "normal" || !selectedPos || !isPosition(String(selectedPos))) {
      return "";
    }
    const teamPlayers = ensureTeamPlayerOrder(team === "A" ? this.data.teamAPlayers || [] : this.data.teamBPlayers || []);
    const selectedSlot = getPlayerByPos(teamPlayers, selectedPos as Position);
    const downNo = normalizeSubstituteNumber(String((selectedSlot && selectedSlot.number) || ""));
    if (!downNo) {
      return "";
    }
    const setNo = Math.max(1, Number(this.data.setNo || 1));
    return getForcedNormalSubIncomingNo(this.allLogs, setNo, team, downNo);
  },

  syncSubIncomingLockState(next?: {
    team?: TeamCode;
    selectedPos?: "" | Position;
    mode?: "normal" | "special";
  }) {
    const team: TeamCode = next && next.team ? (next.team === "B" ? "B" : "A") : this.data.subTeam === "B" ? "B" : "A";
    const selectedPos: "" | Position =
      next && typeof next.selectedPos !== "undefined"
        ? (next.selectedPos as "" | Position)
        : ((this.data.subSelectedPos || "") as "" | Position);
    const mode: "normal" | "special" =
      next && next.mode ? next.mode : (this.data.subMode as "normal" | "special");
    const forcedNo = this.getForcedSubIncomingNo(team, selectedPos, mode);
    const wasLocked = !!this.data.subIncomingLocked || !!this.data.subIncomingLockedNo;
    if (!forcedNo) {
      if (!wasLocked) {
        this.persistSubstitutionDraft();
        return;
      }
      this.setData(
        {
          subIncomingLocked: false,
          subIncomingLockedNo: "",
          subIncomingNoInput: "",
          subIncomingNo: "",
        },
        () => {
          this.persistSubstitutionDraft();
        }
      );
      return;
    }
    this.setData(
      {
        subIncomingLocked: true,
        subIncomingLockedNo: forcedNo,
        subIncomingNoInput: forcedNo,
        subIncomingNo: forcedNo,
      },
      () => {
        this.persistSubstitutionDraft();
      }
    );
  },

  syncSubstitutionTeamDisplay(
    team: TeamCode,
    options?: {
      preserveDraft?: boolean;
      draft?: SubstitutionDraftSnapshot | null;
    }
  ) {
    const nextTeam: TeamCode = team === "B" ? "B" : "A";
    const teamName = nextTeam === "A" ? String(this.data.teamAName || "甲") : String(this.data.teamBName || "乙");
    const setNo = Math.max(1, Number(this.data.setNo || 1));
    const teamPlayers = ensureTeamPlayerOrder(nextTeam === "A" ? this.data.teamAPlayers || [] : this.data.teamBPlayers || []);
    const mainGrid = nextTeam === "A" ? this.data.teamAMainGrid || [] : this.data.teamBMainGrid || [];
    const libero = nextTeam === "A" ? this.data.teamALibero || [] : this.data.teamBLibero || [];
    const captainNo = nextTeam === "A" ? String(this.data.teamACaptainNo || "") : String(this.data.teamBCaptainNo || "");
    const initialCaptainNo =
      nextTeam === "A" ? String(this.data.teamAInitialCaptainNo || "") : String(this.data.teamBInitialCaptainNo || "");
    const subUseSwapLayout = nextTeam === "A" ? !!this.data.isSwapped : !this.data.isSwapped;
    const summary = buildSubRecordSummary(this.allLogs, setNo, nextTeam);
    const subNormalPairBadge = buildSubNormalPairBadgeByPos(
      this.allLogs,
      setNo,
      nextTeam,
      teamPlayers
    );
    const normalDisabled = summary.normal.length >= 6;
    const liberoRoster = normalizeLiberoRosterNumbers(
      nextTeam === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
    );
    const subSpecialPenaltyAllowedPos = buildRestrictedSpecialAllowedPosBySet(
      this.allLogs,
      setNo,
      nextTeam,
      teamPlayers,
      liberoRoster
    );
    const subSpecialPenaltyPairOnly = !normalDisabled && Object.keys(subSpecialPenaltyAllowedPos).length > 0;
    const specialDisabled = !normalDisabled && !subSpecialPenaltyPairOnly;
    const draft = (options && options.draft) || null;
    const preserveDraft = !!(options && options.preserveDraft);
    const selectedPosRaw = String(
      draft
        ? draft.selectedPos || ""
        : preserveDraft
          ? this.data.subSelectedPos || ""
          : ""
    );
    let nextSelectedPos: "" | Position = isPosition(selectedPosRaw) ? (selectedPosRaw as Position) : "";
    const draftMode: "normal" | "special" = draft
      ? draft.mode === "special"
        ? "special"
        : "normal"
      : preserveDraft
        ? this.data.subMode === "special"
          ? "special"
          : "normal"
        : "normal";
    let nextMode: "normal" | "special" =
      draftMode === "special" && specialDisabled ? "normal" : draftMode;
    const panelAlreadyOpen = !!this.data.showSubstitutionPanel;
    let nextNormalModeLimitLocked = false;
    if (normalDisabled) {
      if (!panelAlreadyOpen) {
        // 新开弹窗时，普通换人已满6次，默认切到特殊换人。
        nextMode = "special";
      } else if (nextMode === "normal" && this.data.subMode === "normal") {
        // 同一弹窗内刚达到6次时，不自动切模式，只锁定普通模式操作区。
        nextNormalModeLimitLocked = true;
      }
    }
    if (nextMode === "normal" && isLockedSubNormalPairPos(subNormalPairBadge || {}, nextSelectedPos)) {
      nextSelectedPos = "";
    }
    if (nextMode === "special" && subSpecialPenaltyPairOnly && nextSelectedPos && !subSpecialPenaltyAllowedPos[nextSelectedPos]) {
      nextSelectedPos = "";
    }
    const nextReason: "injury" | "penalty_set" | "penalty_match" | "other" = draft
      ? draft.reason === "penalty_set"
        ? "penalty_set"
        : draft.reason === "penalty_match"
          ? "penalty_match"
          : draft.reason === "other"
            ? "other"
            : "injury"
      : preserveDraft
        ? this.data.subReason === "penalty_set"
          ? "penalty_set"
          : this.data.subReason === "penalty_match"
            ? "penalty_match"
            : this.data.subReason === "other"
              ? "other"
              : "injury"
        : "injury";
    const nextNormalPenalty: "none" | "penalty_set" | "penalty_match" = draft
      ? draft.normalPenalty === "penalty_set"
        ? "penalty_set"
        : draft.normalPenalty === "penalty_match"
          ? "penalty_match"
          : "none"
      : preserveDraft
        ? this.data.subNormalPenalty === "penalty_set"
          ? "penalty_set"
          : this.data.subNormalPenalty === "penalty_match"
            ? "penalty_match"
            : "none"
        : "none";
    const lockedNoBase = String(
      draft
        ? draft.incomingLockedNo || ""
        : preserveDraft
          ? this.data.subIncomingLockedNo || ""
          : ""
    );
    const nextIncomingLockedNo = normalizeSubstituteNumber(lockedNoBase);
    const nextIncomingLocked = !!(
      nextIncomingLockedNo &&
      (draft ? !!draft.incomingLocked : preserveDraft ? !!this.data.subIncomingLocked : false)
    );
    const incomingInputBase = String(
      nextIncomingLocked
        ? nextIncomingLockedNo
        : draft
          ? draft.incomingNoInput || ""
          : preserveDraft
            ? this.data.subIncomingNoInput || ""
            : ""
    );
    const incomingNoBase = String(
      nextIncomingLocked
        ? nextIncomingLockedNo
        : draft
          ? draft.incomingNo || ""
          : preserveDraft
            ? this.data.subIncomingNo || ""
            : ""
    );
    const nextIncomingNoInput = normalizeSubstituteNumber(incomingInputBase);
    const nextIncomingNo = normalizeSubstituteNumber(incomingNoBase || nextIncomingNoInput || "");
    this.setData(
      {
        subTeam: nextTeam,
        subTeamName: teamName,
        subUseSwapLayout: subUseSwapLayout,
        subMainGrid: mainGrid,
        subLibero: libero,
        subCaptainNo: captainNo,
        subInitialCaptainNo: initialCaptainNo,
        subSelectedPos: nextSelectedPos,
        subMode: nextMode,
        subReason: nextReason,
        subNormalPenalty: nextNormalPenalty,
        subIncomingNoInput: nextIncomingNoInput,
        subIncomingNo: nextIncomingNo,
        subIncomingLocked: nextIncomingLocked,
        subIncomingLockedNo: nextIncomingLockedNo,
        subNormalPairBadge: subNormalPairBadge,
        subNormalRecords: summary.normal,
        subSpecialRecords: summary.special,
        subLiberoRecords: summary.libero,
        subSpecialLiberoRecords: summary.specialLibero,
        subPunishSetRecords: summary.punishSet,
        subPunishMatchRecords: summary.punishMatch,
        subNormalCount: summary.normal.length,
        subSpecialCount: summary.special.length,
        subNormalDisabled: normalDisabled,
        subSpecialPenaltyPairOnly: subSpecialPenaltyPairOnly,
        subSpecialPenaltyAllowedPos: subSpecialPenaltyAllowedPos,
        subSpecialDisabled: specialDisabled,
        subNormalModeLimitLocked: nextNormalModeLimitLocked,
      },
      () => {
        this.syncSubIncomingLockState({
          team: nextTeam,
          selectedPos: nextSelectedPos,
          mode: nextMode,
        });
        if (this.data.showSubstitutionPanel || !!draft) {
          this.persistSubstitutionDraft();
        }
      }
    );
  },

  onOpenSubstitutionPanel(e: WechatMiniprogram.TouchEvent) {
    if (this.isAuthoritativeRoomSyncing() && !this.data.updatedAt) {
      this.notifyAuthoritativeRoomSyncing();
      return;
    }
    if (this.isDecidingSetEightPendingActive()) {
      this.notifyDecidingSetEightPending();
      return;
    }
    if (this.isMatchInteractionLocked()) {
      return;
    }
    if (!this.data.hasOperationAuthority) {
      return;
    }
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) as { team?: TeamCode };
    const team = dataset && dataset.team === "B" ? "B" : dataset && dataset.team === "A" ? "A" : (this.data.subTeam as TeamCode);
    const setNo = Math.max(1, Number(this.data.setNo || 1));
    const summary = buildSubRecordSummary(this.allLogs, setNo, team);
    const normalDisabled = summary.normal.length >= 6;
    const defaultMode: "normal" | "special" = normalDisabled ? "special" : "normal";
    const defaultTab: SubRecordTab = defaultMode === "special" ? "special" : "normal";
    this.syncSubstitutionTeamDisplay(team);
    this.clearSubstitutionPanelCloseTimer();
    this.clearLogPanelCloseTimer();
    this.clearSubMatchLogPopoverCloseTimer();
    this.setData(
      {
        showSubstitutionPanel: true,
        substitutionPanelClosing: false,
        showLogPanel: false,
        logPanelClosing: false,
        showSubMatchLogPopover: false,
        subMatchLogPopoverClosing: false,
        subLogPopoverInlineStyle: "",
        showSubRecordTabMenu: false,
        subRecordTab: defaultTab,
        subRecordTabIndex: getSubRecordTabIndex(defaultTab),
        subRecordPickerSwitching: false,
        subRecordContentSwitching: false,
        subMode: defaultMode,
        subReason: "injury",
        subNormalPenalty: "none",
        subIncomingNoInput: "",
        subIncomingNo: "",
        subIncomingLocked: false,
        subIncomingLockedNo: "",
        subModeSwitching: false,
        subReasonSwitching: false,
      },
      () => {
        this.persistSubstitutionDraft();
      }
    );
  },

  onCloseSubstitutionPanel() {
    this.closeSubstitutionPanelAnimated();
  },

  onToggleSubMatchLogPopover() {
    const opening = !this.data.showSubMatchLogPopover;
    if (!opening) {
      this.closeSubMatchLogPopoverAnimated();
      return;
    }
    this.clearSubMatchLogPopoverCloseTimer();
    const nextTab: SubRecordTab = this.data.subMode === "special" ? "special" : "normal";
    this.setData({
      showSubMatchLogPopover: opening,
      subMatchLogPopoverClosing: false,
      showSubRecordTabMenu: false,
      subRecordTab: nextTab,
      subRecordTabIndex: getSubRecordTabIndex(nextTab),
      subRecordPickerSwitching: false,
      subRecordContentSwitching: false,
    }, () => {
      this.syncSubMatchLogPopoverSize();
    });
  },

  syncSubMatchLogPopoverSize(done?: () => void) {
    if (typeof done === "function") {
      done();
    }
  },

  onCloseSubMatchLogPopover() {
    this.closeSubMatchLogPopoverAnimated();
  },

  onSubMatchLogPopoverTap() {},

  onSelectSubRecordTab(e: WechatMiniprogram.TouchEvent) {
    const tab = String(((e.currentTarget && e.currentTarget.dataset) as { tab?: string }).tab || "");
    if (tab !== "normal" && tab !== "special" && tab !== "libero") {
      return;
    }
    this.switchSubRecordTab(tab as SubRecordTab);
  },

  onSubRecordTabPickerChange(e: WechatMiniprogram.PickerChange) {
    const index = Number((e && e.detail && (e.detail as any).value) || 0);
    const tab = getSubRecordTabByIndex(index);
    this.switchSubRecordTab(tab);
  },

  getSubPlayerDisabledHint(pos: Position, numberRaw: string, _isLiberoCard: boolean): string {
    const number = normalizeSubstituteNumber(numberRaw);
    if (!number) {
      return "该位置暂无球员，无法换人";
    }
    const mode: "normal" | "special" = this.data.subMode === "special" ? "special" : "normal";
    const team: TeamCode = this.data.subTeam === "B" ? "B" : "A";
    if (mode === "normal") {
      const liberoZoneNormalPlayerHint = this.getLiberoZoneNormalPlayerNormalSubHint(team, pos, number);
      if (liberoZoneNormalPlayerHint) {
        return liberoZoneNormalPlayerHint;
      }
    }
    const liberoRoster = normalizeLiberoRosterNumbers(
      team === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
    );
    const isLiberoByRule = isLiberoPosition(pos) || liberoRoster.indexOf(number) >= 0;
    if (mode === "normal" && isLiberoByRule) {
      return "只能对非自由人使用普通换人";
    }
    if (mode === "special" && this.data.subSpecialPenaltyPairOnly && !this.data.subSpecialPenaltyAllowedPos[pos]) {
      return SPECIAL_SUB_RESTRICTED_HINT;
    }
    if (mode === "normal" && (this.data.subNormalModeLimitLocked || this.data.subNormalDisabled)) {
      return "普通换人本局已达6次上限";
    }
    if (mode === "normal" && isLockedSubNormalPairPos(this.data.subNormalPairBadge || {}, pos)) {
      return "该球员已执行过2次普通换人，已锁定";
    }
    return "";
  },

  onSubSelectPlayer(e: WechatMiniprogram.TouchEvent) {
    const dataset = (e.currentTarget && e.currentTarget.dataset) as { pos?: string; number?: string; isLibero?: string | number };
    const posRaw = String((dataset && dataset.pos) || "");
    const numberRaw = String((dataset && dataset.number) || "");
    const isLiberoCard = String((dataset && dataset.isLibero) || "") === "1";
    if (!isPosition(posRaw)) {
      return;
    }
    const pos = posRaw as Position;
    const disabledHint = this.getSubPlayerDisabledHint(pos, numberRaw, isLiberoCard);
    if (disabledHint) {
      showToastHint(disabledHint);
      return;
    }
    const nextPos = this.data.subSelectedPos === pos ? "" : pos;
    const team: TeamCode = this.data.subTeam === "B" ? "B" : "A";
    const mode = this.data.subMode as "normal" | "special";
    this.setData(
      {
        subSelectedPos: nextPos,
      },
      () => {
        this.syncSubIncomingLockState({ team, selectedPos: nextPos, mode });
        this.persistSubstitutionDraft();
      }
    );
  },

  onSubSelectMode(e: WechatMiniprogram.TouchEvent) {
    const mode = String(((e.currentTarget && e.currentTarget.dataset) as { mode?: string }).mode || "");
    if (mode !== "normal" && mode !== "special") {
      return;
    }
    const nextMode = mode as "normal" | "special";
    if (nextMode === "normal" && this.data.subNormalDisabled) {
      showToastHint("普通换人本局已达6次上限");
      return;
    }
    if (nextMode === "special" && this.data.subSpecialDisabled) {
      showToastHint(SPECIAL_SUB_NOT_READY_HINT);
      return;
    }
    if (nextMode === this.data.subMode) {
      return;
    }
    const selectedPosRaw = String(this.data.subSelectedPos || "");
    const selectedPos = isPosition(selectedPosRaw) ? (selectedPosRaw as Position) : ("" as "" | Position);
    let nextSelectedPos: "" | Position = selectedPos;
    if (nextMode === "normal" && isLockedSubNormalPairPos(this.data.subNormalPairBadge || {}, nextSelectedPos)) {
      nextSelectedPos = "";
    }
    if (nextMode === "normal" && nextSelectedPos) {
      const slots: Array<{ pos?: string; number?: string; isLibero?: boolean }> = [];
      const liberoSlots = (this.data.subLibero || []) as Array<{ pos?: string; number?: string; isLibero?: boolean }>;
      const mainRows = (this.data.subMainGrid || []) as Array<Array<{ pos?: string; number?: string; isLibero?: boolean }>>;
      liberoSlots.forEach((item) => slots.push(item));
      mainRows.forEach((row) => row.forEach((item) => slots.push(item)));
      const selectedSlot = slots.find((item) => String(item && item.pos) === nextSelectedPos);
      if (selectedSlot) {
        const selectedNo = normalizeSubstituteNumber(String((selectedSlot && selectedSlot.number) || ""));
        const liberoRoster = normalizeLiberoRosterNumbers(
          this.data.subTeam === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
        );
        const isLiberoByRule = isLiberoPosition(nextSelectedPos as Position) || (!!selectedNo && liberoRoster.indexOf(selectedNo) >= 0);
        if (isLiberoByRule) {
          nextSelectedPos = "";
        }
      }
    }
    if (nextMode === "special" && nextSelectedPos && this.data.subSpecialPenaltyPairOnly && !this.data.subSpecialPenaltyAllowedPos[nextSelectedPos]) {
      nextSelectedPos = "";
    }
    this.setData(
      {
        subSelectedPos: nextSelectedPos,
        subMode: nextMode,
        subReason: mode === "normal" ? "injury" : this.data.subReason,
        subNormalModeLimitLocked: nextMode === "normal" ? this.data.subNormalModeLimitLocked : false,
      },
      () => {
        this.triggerSubModeSwitchAnimation();
        this.syncSubIncomingLockState({
          team: this.data.subTeam === "B" ? "B" : "A",
          selectedPos: (this.data.subSelectedPos || "") as "" | Position,
          mode: nextMode,
        });
        this.persistSubstitutionDraft();
      }
    );
  },

  onSubSelectNormalPenalty(e: WechatMiniprogram.TouchEvent) {
    const penalty = String(((e.currentTarget && e.currentTarget.dataset) as { penalty?: string }).penalty || "");
    if (penalty !== "none" && penalty !== "penalty_set" && penalty !== "penalty_match") {
      return;
    }
    const nextPenalty = penalty as "none" | "penalty_set" | "penalty_match";
    if (nextPenalty === this.data.subNormalPenalty) {
      return;
    }
    this.setData(
      {
        subNormalPenalty: nextPenalty,
      },
      () => {
        this.triggerSubReasonSwitchAnimation();
        this.persistSubstitutionDraft();
      }
    );
  },

  onSubSelectReason(e: WechatMiniprogram.TouchEvent) {
    const reason = String(((e.currentTarget && e.currentTarget.dataset) as { reason?: string }).reason || "");
    if (
      reason !== "injury" &&
      reason !== "penalty_set" &&
      reason !== "penalty_match" &&
      reason !== "other"
    ) {
      return;
    }
    if (reason === this.data.subReason) {
      return;
    }
    this.setData(
      {
        subReason: reason as "injury" | "penalty_set" | "penalty_match" | "other",
      },
      () => {
        this.triggerSubReasonSwitchAnimation();
        this.persistSubstitutionDraft();
      }
    );
  },

  onSubIncomingNoInput(e: WechatMiniprogram.Input) {
    if (this.data.subIncomingLocked) {
      return;
    }
    const raw = String((e.detail && e.detail.value) || "").replace(/\D/g, "").slice(0, 2);
    const normalized = normalizeSubstituteNumber(raw);
    this.setData(
      {
        subIncomingNoInput: normalized,
        subIncomingNo: normalized,
      },
      () => {
        this.persistSubstitutionDraft();
      }
    );
  },

  onSubIncomingNoBlur() {
    if (this.data.subIncomingLocked) {
      return;
    }
    const normalized = normalizeSubstituteNumber(this.data.subIncomingNoInput || this.data.subIncomingNo || "");
    this.setData(
      {
        subIncomingNoInput: normalized,
        subIncomingNo: normalized,
      },
      () => {
        this.persistSubstitutionDraft();
      }
    );
    if (!normalized) {
      return;
    }
  },

  validateSubstitutionDraftInput(
    team: TeamCode,
    selectedPos: Position,
    incomingNo: string,
    options?: {
      mode?: "normal" | "special";
      reason?: "injury" | "penalty_set" | "penalty_match" | "other";
      logs?: MatchLogItem[];
      setNo?: number;
    }
  ): string {
    if (!isPosition(String(selectedPos))) {
      return "请先选择要换下的球员";
    }
    const mode = options && options.mode === "special" ? "special" : "normal";
    const logs = options && Array.isArray(options.logs) ? options.logs : this.allLogs;
    const setNo = Math.max(1, Number((options && options.setNo) || this.data.setNo || 1));
    const teamPlayers = ensureTeamPlayerOrder(team === "A" ? this.data.teamAPlayers || [] : this.data.teamBPlayers || []);
    const selectedSlot = getPlayerByPos(teamPlayers, selectedPos);
    const downNo = normalizeSubstituteNumber(String((selectedSlot && selectedSlot.number) || ""));
    if (!downNo) {
      return "当前被换下球员号码无效";
    }
    if (mode === "special" && this.data.subSpecialPenaltyPairOnly && !this.data.subSpecialPenaltyAllowedPos[selectedPos]) {
      return SPECIAL_SUB_RESTRICTED_HINT;
    }
    const upNo = normalizeSubstituteNumber(incomingNo);
    if (!upNo) {
      return "请输入换上号码";
    }
    if (upNo === downNo) {
      return "换上号码与换下号码不能相同";
    }
    const duplicateOnCourt = teamPlayers.some((p) => p.pos !== selectedPos && normalizeSubstituteNumber(p.number) === upNo);
    if (duplicateOnCourt) {
      return "该号码已在场上";
    }
    const liberoRoster = normalizeLiberoRosterNumbers(
      team === "A" ? this.data.teamALiberoRosterNos || [] : this.data.teamBLiberoRosterNos || []
    ).map((n) => normalizeSubstituteNumber(n));
    const selectedIsLiberoNo = liberoRoster.indexOf(downNo) >= 0;
    const downIsLibero = selectedIsLiberoNo || isLiberoPosition(selectedPos);
    const banState = buildSpecialBanStateBySet(logs, setNo, team);
    const matchEntryLockHint = getMatchEntryLockHint(banState, upNo);
    if (matchEntryLockHint) {
      return matchEntryLockHint;
    }
    if (banState.setBanNos.has(upNo)) {
      return "该号码本局禁赛，不能上场";
    }
    if (mode === "normal") {
      if (downIsLibero) {
        return "普通换人仅支持场上6人，不可选择自由人";
      }
      if (liberoRoster.indexOf(upNo) >= 0) {
        return "普通换人不能换上自由人";
      }
      const forcedNo = getForcedNormalSubIncomingNo(logs, setNo, team, downNo);
      if (forcedNo && upNo !== forcedNo) {
        return "当前仅可换回 " + forcedNo + " 号";
      }
      const pairRuleMsg = validateNormalSubPairRule(logs, setNo, team, downNo, upNo);
      if (pairRuleMsg) {
        return pairRuleMsg;
      }
      return "";
    }
    if (downIsLibero && liberoRoster.indexOf(upNo) >= 0) {
      return "该号码已是自由人";
    }
    if (!downIsLibero && liberoRoster.indexOf(upNo) >= 0) {
      return "普通球员位置不能换上自由人";
    }
    return "";
  },

  showSubstitutionBlock(content: string) {
    wx.showModal({
      title: "换人无效",
      content: content,
      showCancel: false,
      confirmText: "知道了",
    });
  },

  async onSubConfirmTap() {
    if (!this.data.hasOperationAuthority) {
      showToastHint("请先接管后继续");
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      showToastHint("房间状态异常");
      return;
    }
    const team: TeamCode = this.data.subTeam === "B" ? "B" : "A";
    const selectedPos = this.data.subSelectedPos;
    const incomingNo = normalizeSubstituteNumber(
      this.data.subIncomingLockedNo || this.data.subIncomingNoInput || this.data.subIncomingNo || ""
    );
    if (this.data.subMode === "normal" && (this.data.subNormalModeLimitLocked || this.data.subNormalDisabled)) {
      showToastHint("普通换人本局已达6次上限");
      return;
    }
    if (!selectedPos || !isPosition(String(selectedPos))) {
      this.showSubstitutionBlock("请先选择要换下的球员");
      return;
    }
    if (!incomingNo) {
      this.showSubstitutionBlock("请先输入换上号码");
      return;
    }
    const localError = this.validateSubstitutionDraftInput(team, selectedPos as Position, incomingNo, {
      mode: this.data.subMode,
      logs: this.allLogs,
      setNo: this.data.setNo,
    });
    if (localError) {
      this.showSubstitutionBlock(localError);
      return;
    }
    const normalPenalty =
      this.data.subNormalPenalty === "penalty_set"
        ? "penalty_set"
        : this.data.subNormalPenalty === "penalty_match"
          ? "penalty_match"
          : "none";
    const currentSetNo = Math.max(1, Number(this.data.setNo || 1));
    if (this.data.subMode === "normal") {
      const normalCount = countNormalSubstitutionsBySet(this.allLogs, currentSetNo, team);
      if (normalCount >= 6) {
        this.showSubstitutionBlock("普通换人本局已达6次上限");
        return;
      }
    }

    let updateError = "";
    let shouldForceCaptainReconfirmForTeam: "" | TeamCode = "";
    let liveBadgePos: "" | Position = "";
    let liveBadgeDownNo = "";
    const mode: "normal" | "special" = this.data.subMode === "special" ? "special" : "normal";
    const next = await updateRoomAsync(roomId, (room) => {
      if (!room || !room.match || !room.teamA || !room.teamB) {
        updateError = "房间状态异常";
        return room;
      }
      if (room.match.isFinished) {
        updateError = "比赛已结束，无法换人";
        return room;
      }
      const setEndState = (room.match as any).setEndState;
      if (setEndState && setEndState.active) {
        updateError = "本局已结束，无法换人";
        return room;
      }

      const roomSetNo = Math.max(1, Number(room.match.setNo || 1));
      const roomLogs = normalizeLogsBySet(Array.isArray(room.match.logs) ? (room.match.logs as MatchLogItem[]) : []);
      const banState = buildSpecialBanStateBySet(roomLogs, roomSetNo, team);
      if (mode === "normal" && countNormalSubstitutionsBySet(roomLogs, roomSetNo, team) >= 6) {
        updateError = "普通换人本局已达6次上限";
        return room;
      }

      const teamObj = team === "A" ? room.teamA : room.teamB;
      const nextPlayers = ensureTeamPlayerOrder(teamObj.players || []);
      const roomNormalCount = countNormalSubstitutionsBySet(roomLogs, roomSetNo, team);
      ensureLiberoRosterForCurrentSet(room);
      const roster = normalizeLiberoRosterNumbers(getLiberoRosterForTeam(room, team)).map((n) => normalizeSubstituteNumber(n));
      if (mode === "special" && roomNormalCount < 6) {
        const allowedPos = buildRestrictedSpecialAllowedPosBySet(roomLogs, roomSetNo, team, nextPlayers, roster);
        if (!Object.keys(allowedPos).length) {
          updateError = SPECIAL_SUB_NOT_READY_HINT;
          return room;
        }
        if (!allowedPos[selectedPos as Position]) {
          updateError = SPECIAL_SUB_RESTRICTED_HINT;
          return room;
        }
      }
      const captainNo = this.getTeamCurrentCaptainNoFromRoom(room, team);
      const teamInitialCaptainNo = normalizeNumberInput(
        String((teamObj as any).captainNo || (team === "A" ? this.data.teamAInitialCaptainNo : this.data.teamBInitialCaptainNo) || "")
      );
      const selectedSlot = getPlayerByPos(nextPlayers, selectedPos as Position);
      if (!selectedSlot) {
        updateError = "被换下球员位置无效";
        return room;
      }
      if (mode === "normal" && isLiberoPosition(selectedPos as Position)) {
        updateError = "普通换人仅支持场上6人，不可选择自由人";
        return room;
      }
      const downNo = normalizeSubstituteNumber(String(selectedSlot.number || ""));
      if (!downNo) {
        updateError = "被换下球员号码无效";
        return room;
      }
      liveBadgePos = selectedPos as Position;
      liveBadgeDownNo = downNo;
      if (incomingNo === downNo) {
        updateError = "换上号码与换下号码不能相同";
        return room;
      }

      const duplicateOnCourt = nextPlayers.some(
        (p) => p.pos !== selectedPos && normalizeSubstituteNumber(p.number) === incomingNo
      );
      if (duplicateOnCourt) {
        updateError = "该号码已在场上";
        return room;
      }
      const matchEntryLockHint = getMatchEntryLockHint(banState, incomingNo);
      if (matchEntryLockHint) {
        updateError = matchEntryLockHint;
        return room;
      }
      if (banState.setBanNos.has(incomingNo)) {
        updateError = "该号码本局禁赛，不能上场";
        return room;
      }
      if (mode === "normal") {
        const pairRuleMsg = validateNormalSubPairRule(roomLogs, roomSetNo, team, downNo, incomingNo);
        if (pairRuleMsg) {
          updateError = pairRuleMsg;
          return room;
        }
      }

      const downIsLibero = roster.indexOf(downNo) >= 0 || isLiberoPosition(selectedPos as Position);
      const liberoRosterIndex =
        mode === "special" && downIsLibero
          ? getLiberoRosterSlotIndex(nextPlayers, roster, selectedPos as Position, downNo)
          : -1;
      if (mode === "normal" && downIsLibero) {
        updateError = "普通换人仅支持场上6人，不可选择自由人";
        return room;
      }
      if (mode === "normal" && roster.indexOf(incomingNo) >= 0) {
        updateError = "普通换人不能换上自由人";
        return room;
      }
      if (mode === "special") {
        if (!downIsLibero && roster.indexOf(incomingNo) >= 0) {
          updateError = "普通球员位置不能换上自由人";
          return room;
        }
        if (downIsLibero && roster.indexOf(incomingNo) >= 0) {
          updateError = "该号码已是自由人";
          return room;
        }
      }

      if (mode === "special" && downIsLibero) {
        if (roster.indexOf(incomingNo) >= 0) {
          updateError = "该号码已是自由人";
          return room;
        }
      }

      const selectedIdx = nextPlayers.findIndex((p) => p.pos === selectedPos);
      if (selectedIdx < 0) {
        updateError = "被换下球员位置无效";
        return room;
      }

      const opId = createLogId();
      (room.match as any).currentOpId = opId;
      pushUndoSnapshot(room);
      nextPlayers[selectedIdx].number = incomingNo;
      if (this.shouldForceCaptainReconfirm(team, teamObj.players || [], nextPlayers, captainNo, teamInitialCaptainNo)) {
        shouldForceCaptainReconfirmForTeam = team;
      }
      if (mode === "special" && (roster.indexOf(downNo) >= 0 || isLiberoPosition(selectedPos as Position))) {
        const rosterKey = team === "A" ? "teamALiberoRoster" : "teamBLiberoRoster";
        const nextRoster = normalizeLiberoRosterNumbers(getLiberoRosterForTeam(room, team));
        const rosterCap = getTeamLiberoCapacityForCurrentSet(room, team);
        let downIdx = liberoRosterIndex;
        if (downIdx < 0) {
          downIdx = nextRoster.findIndex((n) => normalizeSubstituteNumber(n) === downNo);
        }
        if (downIdx >= 0 && downIdx < rosterCap) {
          nextRoster[downIdx] = incomingNo;
        } else if (nextRoster.length < rosterCap) {
          nextRoster.push(incomingNo);
        } else if (rosterCap === 1 && nextRoster.length) {
          nextRoster[0] = incomingNo;
        }
        (room.match as any)[rosterKey] = normalizeLiberoRosterNumbers(nextRoster).slice(0, rosterCap);
      }
      teamObj.players = nextPlayers;

      const teamName = team === "A" ? String(room.teamA.name || "甲") : String(room.teamB.name || "乙");
      const detail = buildSubRecordDetailText(incomingNo, downNo);
      if (mode === "normal") {
        const normalPenaltyTextMap: Record<string, string> = {
          penalty_set: "本局禁赛",
          penalty_match: "全场禁赛",
        };
        const hasPenalty = normalPenalty === "penalty_set" || normalPenalty === "penalty_match";
        const normalPenaltyText = hasPenalty ? normalPenaltyTextMap[normalPenalty] || "" : "";
        const action =
          normalPenalty === "penalty_set"
            ? "sub_normal_penalty_set"
            : normalPenalty === "penalty_match"
              ? "sub_normal_penalty_match"
              : "sub_normal";
        const note = hasPenalty
          ? teamName + "队 普通换人 " + normalPenaltyText + " " + detail
          : teamName + "队 普通换人 " + detail;
        appendMatchLog(room, action, note, team, opId);
      } else {
        const downIsLibero = roster.indexOf(downNo) >= 0 || isLiberoPosition(selectedPos as Position);
        const action = downIsLibero ? "sub_special_libero" : "sub_special";
        const detailText = downIsLibero ? buildSpecialLiberoRecordText(incomingNo, downNo) : detail;
        appendMatchLog(room, action, teamName + "队 特殊换人 " + detailText, team, opId);
      }
      (room.match as any).lastActionOpId = opId;
      return room;
    });

    if (!next) {
      showToastHint("系统繁忙，请重试");
      return;
    }
    if (updateError) {
      this.showSubstitutionBlock(updateError);
      return;
    }
    const latestLogs = normalizeLogsBySet(Array.isArray(next.match && next.match.logs) ? (next.match.logs as MatchLogItem[]) : []);
    this.allLogs = latestLogs.slice();
    this.syncSubstitutionTeamDisplay(team, {
      draft: {
        setNo: Math.max(1, Number((next.match && (next.match as any).setNo) || currentSetNo)),
        panelOpen: true,
        team,
        mode,
        reason: "injury",
        normalPenalty,
        selectedPos: "",
        incomingNoInput: "",
        incomingNo: "",
        incomingLocked: false,
        incomingLockedNo: "",
      },
    });
    this.applyLocalLineupFromRoom(next);
    if (this.data.matchFlowMode === "normal" && liveBadgePos && liveBadgeDownNo) {
      this.applyLiveSubDownBadge(team, liveBadgePos, liveBadgeDownNo);
    }
    await this.loadRoom(roomId, true);
    if (shouldForceCaptainReconfirmForTeam) {
      this.openForcedCaptainConfirmAfterSubstitution(shouldForceCaptainReconfirmForTeam);
      return;
    }
    showToastHint("换人已记录");
  },

  onSubstitutionPanelTap() {},
});
