import {
  updateRoomAsync,
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

type Position = "I" | "II" | "III" | "IV" | "V" | "VI" | "L1" | "L2";
type PlayerSlot = { pos: Position; number: string };
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
type RotateStep = {
  team: TeamCode;
  reverse: boolean;
};
type RotateDirectionHint = "forward" | "reverse" | "";
type ConnState = "online" | "reconnecting" | "offline";

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

function normalizeLogsBySet(logs: MatchLogItem[]): MatchLogItem[] {
  let cursorSetNo = 1;
  return (logs || []).map((item, idx) => {
    const action = String(item && item.action ? item.action : "");
    const note = String(item && item.note ? item.note : "");
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
  let note = String(noteRaw || "");
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

function clonePlayerList(players: PlayerSlot[]): PlayerSlot[] {
  return (players || []).map(function (item) {
    return { pos: item.pos, number: item.number };
  });
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
  const resolvedOpId = String(opId || (room.match as any).currentOpId || "");
  room.match.logs.push({
    id: createLogId(),
    ts: Date.now(),
    action: action,
    team: team || "",
    note: note,
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
    isSwapped: !!room.match.isSwapped,
    decidingSetEightHandled: !!room.match.decidingSetEightHandled,
    setNo: room.match.setNo,
    aSetWins: room.match.aSetWins,
    bSetWins: room.match.bSetWins,
    // 业务要求：暂停态/暂停次数不可被“撤回比分”回退，因此不进 undo 快照。
    isFinished: room.match.isFinished,
    setSummaries: JSON.parse(JSON.stringify((room.match as any).setSummaries || {})),
    lastActionOpId: String((room.match as any).lastActionOpId || ""),
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

function setKeepScreenOnSafe(keepScreenOn: boolean): void {
  wx.setKeepScreenOn({
    keepScreenOn,
    fail: () => {},
  });
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
    teamATimeoutCount: 0,
    teamBTimeoutCount: 0,
    timeoutActive: false,
    timeoutTeam: "" as TeamCode | "",
    timeoutLeftText: "暂停 30s",
    setNoText: "第1局",
    matchModeText: "5局3胜",
    setWinsText: "0 : 0",
    canStartMatch: false,
    isMatchFinished: false,
    isSwapped: false,
    showLogPanel: false,
    logs: [] as DisplayLogItem[],
    logSetSwitchVisible: false,
    logSetOptions: [] as number[],
    selectedLogSet: 1,
    hideTeamAMainNumbers: false,
    hideTeamBMainNumbers: false,
    rotateFlyItemsA: [] as RotateFlyItem[],
    rotateFlyItemsB: [] as RotateFlyItem[],
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
    setEndWaiting: false,
    connStatusText: "连接中",
    connStatusClass: "status-reconnecting",
    roomOwnerClientId: "",
    roomOperatorClientId: "",
    controlRole: "operator" as "operator" | "observer",
    hasOperationAuthority: true,
    observerViewSide: "A" as "A" | "B",
    rawRoomSwapped: false,
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
  lastSeenLogId: "" as string,
  allLogs: [] as MatchLogItem[],
  roomWatchOff: null as null | (() => void),
  clientId: "" as string,
  openingLineup: false as boolean,
  lineupNavigateLockUntil: 0 as number,
  setEndActionInFlight: false as boolean,
  timeoutActionInFlight: false as boolean,
  takeoverInFlight: false as boolean,
  rotateConfirming: false as boolean,
  switchConfirming: false as boolean,
  actionQueue: Promise.resolve() as Promise<void>,
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
  roomMissingRetryTimer: 0 as number,
  roomMissingToastAt: 0 as number,
  roomMissingVerifyAt: 0 as number,
  roomMissingVerifyInFlight: false as boolean,
  roomClosedHandled: false as boolean,
  rectCacheWarmupTimer: 0 as number,
  rectCacheWarmupInFlight: false as boolean,
  rotateActionInFlight: false as boolean,

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
      if (this.connFailureStreak >= 3) {
        this.setConnState("offline");
        return;
      }
      if (this.connFailureStreak >= 2) {
        this.setConnState("reconnecting");
      }
      return;
    }
    if (this.connFailureStreak >= 2) {
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
      if (elapsed > 22000) {
        this.setConnState("offline");
        return;
      }
      if (elapsed > 12000 && this.data.connStatusClass === "status-online") {
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
        const noteSetNo = extractSetNoFromNote(String(item.note || ""));
        const itemSetNo = Math.max(1, Number((item as any).setNo || noteSetNo || 1));
        return itemSetNo === targetSet;
      })
      .slice()
      .reverse()
      .map(function (item: MatchLogItem) {
        const note = withTeamSuffixForDisplay(String(item.note || ""), teamAName, teamBName);
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

  enqueueAction(task: () => Promise<void>) {
    this.actionQueue = this.actionQueue
      .catch(() => {})
      .then(async () => {
        await task();
      });
    return this.actionQueue;
  },

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
    this.loadRoom(roomId, true);
  },

  onShow() {
    this.openingLineup = false;
    this.lineupNavigateLockUntil = 0;
    this.setConnState("reconnecting", { force: true });
    setKeepScreenOnSafe(true);
    this.syncSafePadding();
    setTimeout(() => {
      this.syncSafePadding();
    }, 80);
    setTimeout(() => {
      this.syncSafePadding();
    }, 260);
    this.applyNavigationTheme();
    this.refreshNetworkState();
    this.startHeartbeat();
    this.startConnWatchdog();
    this.startTimerTick();
    this.startRoomWatch();
    this.startPolling();
    this.scheduleRectCacheWarmup(320);
  },

  openLineupAdjustOnce(roomId: string, entry: "normal" | "reconfigure" = "normal"): boolean {
    const now = Date.now();
    const pages = getCurrentPages();
    const top = pages[pages.length - 1];
    const topRoute = String((top && (top as any).route) || "");
    if (topRoute === "pages/lineup-adjust/lineup-adjust") {
      return false;
    }
    if (this.openingLineup || now < this.lineupNavigateLockUntil) {
      return false;
    }
    this.openingLineup = true;
    this.lineupNavigateLockUntil = now + 4000;
    wx.navigateTo({
      url: "/pages/lineup-adjust/lineup-adjust?roomId=" + roomId + "&entry=" + entry,
      complete: () => {
        setTimeout(() => {
          const latestPages = getCurrentPages();
          const latestTop = latestPages[latestPages.length - 1];
          const latestRoute = String((latestTop && (latestTop as any).route) || "");
          if (latestRoute !== "pages/lineup-adjust/lineup-adjust") {
            this.openingLineup = false;
          }
        }, 500);
      },
      fail: () => {
        this.openingLineup = false;
      },
    });
    return true;
  },

  onHide() {
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

  onBackExitDirect() {
    this.setData({ showBackExitModal: false, backConfirming: true });
    wx.reLaunch({ url: "/pages/home/home" });
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
      wx.reLaunch({ url: "/pages/home/home" });
      setTimeout(() => {
        this.setData({ backConfirming: false });
      }, 200);
      return;
    }
    wx.setClipboardData({
      data: inviteText,
      complete: () => {
        wx.reLaunch({ url: "/pages/home/home" });
        setTimeout(() => {
          this.setData({ backConfirming: false });
        }, 200);
      },
    });
  },

  onSetEndModalTap() {},

  async onReconfigurePlayersTap() {
    if (!this.data.canStartMatch || this.data.showSetEndModal) {
      return;
    }
    if (this.setEndActionInFlight) {
      return;
    }
    const roomId = String(this.data.roomId || "");
    if (!roomId) {
      return;
    }
    const ownerClientId = String(this.clientId || getApp<IAppOption>().globalData.clientId || "");
    if (!ownerClientId) {
      return;
    }

    this.setEndActionInFlight = true;
    wx.showLoading({
      title: "处理中",
      mask: true,
    });
    try {
      const updated = await updateRoomAsync(
        roomId,
        (room) => {
          if (!room.match || room.match.isFinished) {
            return room;
          }
          const roomSetNo = Math.max(1, Number(room.match.setNo || 1));
          const preStart =
            Number(room.match.aScore || 0) === 0 &&
            Number(room.match.bScore || 0) === 0 &&
            Math.max(0, Number((room.match as any).setTimerStartAt) || 0) <= 0 &&
            Math.max(0, Number((room.match as any).setTimerElapsedMs) || 0) <= 0;
          if (!preStart) {
            return room;
          }

          const lastCommitted = (room.match as any).lineupAdjustLastCommitted || null;
          const canUseLastCommitted =
            !!lastCommitted &&
            Number(lastCommitted.setNo || 0) === roomSetNo &&
            Array.isArray(lastCommitted.teamAPlayers) &&
            Array.isArray(lastCommitted.teamBPlayers);
          const draftTeamAPlayers = canUseLastCommitted
            ? clonePlayerList(lastCommitted.teamAPlayers as PlayerSlot[])
            : clonePlayerList((room.teamA && room.teamA.players) || []);
          const draftTeamBPlayers = canUseLastCommitted
            ? clonePlayerList(lastCommitted.teamBPlayers as PlayerSlot[])
            : clonePlayerList((room.teamB && room.teamB.players) || []);
          const draftIsSwapped = canUseLastCommitted ? !!lastCommitted.isSwapped : !!room.match.isSwapped;
          const draftServingTeam: TeamCode =
            (canUseLastCommitted ? lastCommitted.servingTeam : room.match.servingTeam) === "B" ? "B" : "A";
          const draftTeamACaptainNo = String(
            (canUseLastCommitted ? lastCommitted.teamACaptainNo : "") ||
              (room.match as any).teamACurrentCaptainNo ||
              room.teamA.captainNo ||
              ""
          );
          const draftTeamBCaptainNo = String(
            (canUseLastCommitted ? lastCommitted.teamBCaptainNo : "") ||
              (room.match as any).teamBCurrentCaptainNo ||
              room.teamB.captainNo ||
              ""
          );
          const initCaptainNoA = normalizeNumberInput(room.teamA.captainNo || "");
          const initCaptainNoB = normalizeNumberInput(room.teamB.captainNo || "");
          const inferredManualA =
            !isNumberInMain(draftTeamAPlayers, initCaptainNoA) && isNumberOnCourt(draftTeamAPlayers, draftTeamACaptainNo);
          const inferredManualB =
            !isNumberInMain(draftTeamBPlayers, initCaptainNoB) && isNumberOnCourt(draftTeamBPlayers, draftTeamBCaptainNo);

          room.teamA.players = clonePlayerList(draftTeamAPlayers);
          room.teamB.players = clonePlayerList(draftTeamBPlayers);
          (room.match as any).teamACurrentCaptainNo = draftTeamACaptainNo;
          (room.match as any).teamBCurrentCaptainNo = draftTeamBCaptainNo;
          room.match.isSwapped = draftIsSwapped;
          room.match.servingTeam = draftServingTeam;
          (room.match as any).setTimerStartAt = 0;
          (room.match as any).setTimerElapsedMs = 0;

          const previousSetNo = Math.max(1, roomSetNo - 1);
          const summaries = ((room.match as any).setSummaries || {}) as Record<string, any>;
          const previousSummary = summaries[String(previousSetNo)] || null;
          (room.match as any).setEndState = {
            active: true,
            phase: "lineup",
            ownerClientId: ownerClientId,
            source: "reconfigure",
            setNo: previousSetNo,
            matchFinished: false,
            summary: {
              setNo: previousSetNo,
              teamAName: String((previousSummary && previousSummary.teamAName) || room.teamA.name || "甲"),
              teamBName: String((previousSummary && previousSummary.teamBName) || room.teamB.name || "乙"),
              smallScoreA: Math.max(0, Number(previousSummary && previousSummary.smallScoreA) || 0),
              smallScoreB: Math.max(0, Number(previousSummary && previousSummary.smallScoreB) || 0),
              bigScoreA: Math.max(0, Number(previousSummary && previousSummary.bigScoreA) || Number(room.match.aSetWins || 0)),
              bigScoreB: Math.max(0, Number(previousSummary && previousSummary.bigScoreB) || Number(room.match.bSetWins || 0)),
              winnerName: String((previousSummary && previousSummary.winnerName) || ""),
              durationText: String((previousSummary && previousSummary.durationText) || "00:00"),
              matchFinished: false,
            },
          };
          (room.match as any).lineupAdjustDraft = {
            setNo: roomSetNo,
            isSwapped: draftIsSwapped,
            servingTeam: draftServingTeam,
            teamAPlayers: clonePlayerList(draftTeamAPlayers),
            teamBPlayers: clonePlayerList(draftTeamBPlayers),
            teamACaptainNo: draftTeamACaptainNo,
            teamBCaptainNo: draftTeamBCaptainNo,
            teamAInitialCaptainNo: String(room.teamA.captainNo || ""),
            teamBInitialCaptainNo: String(room.teamB.captainNo || ""),
            teamAManualCaptainChosen: canUseLastCommitted ? !!lastCommitted.teamAManualCaptainChosen : inferredManualA,
            teamBManualCaptainChosen: canUseLastCommitted ? !!lastCommitted.teamBManualCaptainChosen : inferredManualB,
          };
          return room;
        },
        { awaitCloud: true }
      );
      const latest = updated || (await getRoomAsync(roomId));
      const latestState = latest && latest.match ? ((latest.match as any).setEndState || null) : null;
      const latestSetNo = Math.max(1, Number(latest && latest.match && latest.match.setNo) || 1);
      const latestDraft = latest && latest.match ? ((latest.match as any).lineupAdjustDraft || null) : null;
      const acquired =
        !!latestState &&
        !!latestState.active &&
        String(latestState.phase || "") === "lineup" &&
        String(latestState.ownerClientId || "") === ownerClientId &&
        !!latestDraft &&
        Number(latestDraft.setNo || 0) === latestSetNo;
      if (!acquired) {
        await this.loadRoom(roomId, true);
        return;
      }
      this.setData({ showSetEndModal: false, setEndWaiting: false });
      this.openLineupAdjustOnce(roomId, "reconfigure");
    } finally {
      wx.hideLoading({
        fail: () => {},
      });
      this.setEndActionInFlight = false;
    }
  },

  onOpenStartMatchModal() {
    if (!this.data.canStartMatch || this.data.showSetEndModal) {
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
      await this.enterLineupAsOwner();
      return;
    }
    const roomId = this.data.roomId;
    this.setEndActionInFlight = true;
    wx.showLoading({
      title: "处理中",
      mask: true,
    });
    try {
      await updateRoomAsync(roomId, (room) => {
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
      });
      wx.hideLoading({
        fail: () => {},
      });
      wx.reLaunch({ url: "/pages/result/result?roomId=" + roomId });
    } finally {
      wx.hideLoading({
        fail: () => {},
      });
      this.setEndActionInFlight = false;
    }
  },

  async enterLineupAsOwner() {
    if (this.setEndActionInFlight) {
      showToastHint("操作处理中，请稍候");
      return false;
    }
    this.setEndActionInFlight = true;
    wx.showLoading({
      title: "处理中",
      mask: true,
    });
    const roomId = this.data.roomId;
    const ownerClientId = String(this.clientId || getApp<IAppOption>().globalData.clientId || "");
    try {
      const updated = await updateRoomAsync(
        roomId,
        (room) => {
          const state = (room.match as any).setEndState;
          if (state && state.active && !room.match.isFinished) {
            state.phase = "lineup";
            state.ownerClientId = ownerClientId;
          }
          return room;
        },
        { awaitCloud: true }
      );
      const latest = updated || (await getRoomAsync(roomId));
      const state = latest && latest.match ? ((latest.match as any).setEndState || null) : null;
      const acquired =
        !!state &&
        !!state.active &&
        String(state.phase || "") === "lineup" &&
        String(state.ownerClientId || "") === ownerClientId;
      if (!acquired) {
        wx.hideLoading({
          fail: () => {},
        });
        showToastHint("已由其他裁判接管");
        await this.loadRoom(roomId, true);
        return false;
      }
      this.setData({ showSetEndModal: false, setEndWaiting: false });
      wx.hideLoading({
        fail: () => {},
      });
      this.openLineupAdjustOnce(roomId);
      return true;
    } finally {
      wx.hideLoading({
        fail: () => {},
      });
      this.setEndActionInFlight = false;
    }
  },

  async onSetEndTakeover() {
    if (this.setEndActionInFlight) {
      showToastHint("操作处理中，请稍候");
      return;
    }
    if (!this.data.setEndWaiting) {
      return;
    }
    await this.enterLineupAsOwner();
  },

  onWindowResize() {
    this.syncSafePadding();
  },

  applyNavigationTheme() {
    applyNavigationBarTheme();
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
    this.markConnectionIssue();
    this.scheduleRoomMissingRetry(force ? 1200 : 1800, true);
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
          if (displayCount >= currentCount) {
            this.pendingLowerParticipantCount = 0;
            this.pendingLowerParticipantHit = 0;
            if (displayCount !== currentCount) {
              this.setData({ participantCount: displayCount });
            }
            return;
          }
          if (this.pendingLowerParticipantCount === displayCount) {
            this.pendingLowerParticipantHit += 1;
          } else {
            this.pendingLowerParticipantCount = displayCount;
            this.pendingLowerParticipantHit = 1;
          }
          // 需要连续两次心跳都看到更低人数，才允许向下更新，避免 1/2 来回抖动。
          if (this.pendingLowerParticipantHit >= 2) {
            this.pendingLowerParticipantCount = 0;
            this.pendingLowerParticipantHit = 0;
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
    order.forEach((pos, idx) => {
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
    const rowHeightFilled = this.fillAxisValues(rowHeight, 0, fbRowHeight).map((v) =>
      v != null ? v : avgHeight > 0 ? avgHeight : 0
    );
    const colWidthFilled = this.fillAxisValues(colWidth, 0, fbColWidth).map((v) =>
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

  applyLocalLineupFromRoom(
    room: any,
    options?: { observerSide?: "A" | "B"; hasOperationAuthority?: boolean; preHideTeams?: TeamCode[] }
  ) {
    if (!room || !room.teamA || !room.teamB || !room.match) {
      return;
    }
    this.lastRoomSnapshot = room;
    const nextSwapped = this.resolveDisplaySwapped(!!room.match.isSwapped, options);
    const teamASide: TeamCode = nextSwapped ? "B" : "A";
    const teamAPlayers = (room.teamA.players || []).slice();
    const teamBPlayers = (room.teamB.players || []).slice();
    const aRows = buildTeamRows(teamAPlayers);
    const bRows = buildTeamRows(teamBPlayers);
    const currentTeamACaptain = normalizeNumberInput(
      String((room.match as any).teamACurrentCaptainNo || (room.teamA as any).captainNo || "")
    );
    const currentTeamBCaptain = normalizeNumberInput(
      String((room.match as any).teamBCurrentCaptainNo || (room.teamB as any).captainNo || "")
    );
    const preHideTeams = (options && Array.isArray(options.preHideTeams) ? options.preHideTeams : []) as TeamCode[];
    const preHideA = preHideTeams.indexOf("A") >= 0;
    const preHideB = preHideTeams.indexOf("B") >= 0;
    this.setData({
      isSwapped: nextSwapped,
      servingTeam: room.match.servingTeam === "B" ? "B" : "A",
      teamACaptainNo: currentTeamACaptain,
      teamBCaptainNo: currentTeamBCaptain,
      teamAPlayers: teamAPlayers,
      teamBPlayers: teamBPlayers,
      teamALibero: aRows.libero,
      teamAMainGrid: buildMainGridByOrder(teamAPlayers, getMainOrderForTeam("A", teamASide)),
      teamBLibero: bRows.libero,
      teamBMainGrid: buildMainGridByOrder(teamBPlayers, getMainOrderForTeam("B", teamASide)),
      hideTeamAMainNumbers: preHideA,
      hideTeamBMainNumbers: preHideB,
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
        isCaptain: boolean;
        id: string;
        baseStyle: string;
      }> = [];
      MAIN_POSITIONS.forEach((sourcePos) => {
        const fromRect = mergedBeforeRects[sourcePos];
        if (!fromRect) {
          return;
        }
        const number = beforeNoMap[sourcePos] || "?";
        const isCaptain =
          normalizeNumberInput(number) !== "" && normalizeNumberInput(number) === normalizeNumberInput(captainNo);
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
          isCaptain,
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
        isCaptain: seed.isCaptain,
        style: seed.baseStyle + "transform:translate(0,0);transition:none;",
      }));
      if (team === "A") {
        this.setData({ hideTeamAMainNumbers: true, rotateFlyItemsA: startItems });
      } else {
        this.setData({ hideTeamBMainNumbers: true, rotateFlyItemsB: startItems });
      }
      await this.nextTickAsync();
      await this.delayAsync(10);
      let afterRects = await this.measureTeamMainPosRectsStable(team, 1200);
      afterRects = this.completeTeamRectMapByGrid(team, afterRects || {}, mergedBeforeRects || {});
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
          isCaptain: seed.isCaptain,
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
      this.setCachedTeamRectMap(team, afterRects);
      await this.nextTickAsync();
      await this.delayAsync(16);
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
      this.scheduleRectCacheWarmup(50);
    } finally {
      this.rotateMotionInFlightCount = Math.max(0, this.rotateMotionInFlightCount - 1);
      if (this.rotateMotionInFlightCount === 0 && !this.roomLoadInFlight && this.roomLoadPending) {
        const pendingForce = !!this.roomLoadPendingForce;
        this.roomLoadPending = false;
        this.roomLoadPendingForce = false;
        if (this.data.roomId) {
          this.loadRoom(this.data.roomId, pendingForce);
        }
      }
    }
  },

  async loadRoom(roomId: string, force: boolean, localOnly = false) {
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
        wx.hideToast({
          fail: () => {},
        });
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
        wx.redirectTo({ url: "/pages/create-room/create-room?roomId=" + roomId });
        return;
      }
      if (room.status === "result") {
        wx.reLaunch({ url: "/pages/result/result?roomId=" + roomId });
        return;
      }
      if (!force && incomingUpdatedAt === currentUpdatedAt) {
        return;
      }
      const incomingRawLogs = Array.isArray(room.match.logs) ? (room.match.logs as MatchLogItem[]) : [];
      const incomingLogs = normalizeLogsBySet(incomingRawLogs);
      this.allLogs = incomingLogs.slice();
      const currentClientId = String(this.clientId || getApp<IAppOption>().globalData.clientId || "");
      const roomOwnerClientId = getRoomOwnerClientId(room);
      const roomOperatorClientId = getRoomOperatorClientId(room);
      const controlRole = getRoomControlRole(room, currentClientId);
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
      const prevAPlayers = this.data.teamAPlayers || [];
      const prevBPlayers = this.data.teamBPlayers || [];
      const shouldAutoAnimate = !force && this.data.updatedAt > 0 && prevAPlayers.length > 0 && prevBPlayers.length > 0;

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
          .concat(buildRotateStepsByDiff(prevAPlayers, room.teamA.players || [], "A"))
          .concat(buildRotateStepsByDiff(prevBPlayers, room.teamB.players || [], "B"));
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
      const teamASide: TeamCode = nextSwapped ? "B" : "A";
      const aRows = buildTeamRows(room.teamA.players);
      const bRows = buildTeamRows(room.teamB.players);
      const aMainGrid = buildMainGridByOrder(room.teamA.players, getMainOrderForTeam("A", teamASide));
      const bMainGrid = buildMainGridByOrder(room.teamB.players, getMainOrderForTeam("B", teamASide));
      const prevARows = buildTeamRows(prevAPlayers);
      const prevBRows = buildTeamRows(prevBPlayers);
      const prevAMainGrid = buildMainGridByOrder(prevAPlayers, getMainOrderForTeam("A", teamASide));
      const prevBMainGrid = buildMainGridByOrder(prevBPlayers, getMainOrderForTeam("B", teamASide));
      const teamAColor = room.teamA.color || TEAM_COLOR_OPTIONS[0].value;
      const teamBColor = room.teamB.color || TEAM_COLOR_OPTIONS[1].value;
      const currentTeamACaptain = normalizeNumberInput(
        String((room.match as any).teamACurrentCaptainNo || (room.teamA as any).captainNo || "")
      );
      const currentTeamBCaptain = normalizeNumberInput(
        String((room.match as any).teamBCurrentCaptainNo || (room.teamB as any).captainNo || "")
      );
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
      const setEndPhase = String((setEndState && setEndState.phase) || "pending");
      const setEndOwnerClientId = String((setEndState && setEndState.ownerClientId) || "");
      const setEndWaiting = effectiveSetEndActive && setEndPhase === "lineup" && setEndOwnerClientId !== currentClientId;
      const setSummary = (setEndState && setEndState.summary) || {};
      const setEndMatchFinished = effectiveSetEndActive && !!(setEndState && setEndState.matchFinished);
      const effectiveShouldSwapAnimate = !freezeSetEndDisplay && shouldSwapAnimate;
      const effectiveUseReplayQueue = !freezeSetEndDisplay && useReplayQueue;
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
      wx.setNavigationBarTitle({
        title: "裁判团队编号 " + roomId,
      });
      if (effectiveShouldSwapAnimate) {
        this.setData({ switchingOut: true, switchingIn: false });
        await this.delayAsync(120);
      }
      this.setData({
        participantCount: Math.max(
          1,
          Object.keys((room as any).participants || {}).length,
          Number(this.data.participantCount || 1)
        ),
        teamAName: room.teamA.name,
        teamBName: room.teamB.name,
        teamAColor: teamAColor,
        teamBColor: teamBColor,
        roomPassword: String(room.password || ""),
        teamACaptainNo: currentTeamACaptain,
        teamBCaptainNo: currentTeamBCaptain,
        teamARGB: hexToRgbTriplet(teamAColor),
        teamBRGB: hexToRgbTriplet(teamBColor),
        aScore: freezeSetEndDisplay ? Number(this.data.aScore || 0) : leftScore,
        bScore: freezeSetEndDisplay ? Number(this.data.bScore || 0) : rightScore,
        lastScoringTeam: freezeSetEndDisplay ? this.data.lastScoringTeam : displayLastScoringTeam,
        setTimerText: freezeSetEndDisplay ? String(this.data.setTimerText || "00:00") : timerText,
        servingTeam: freezeSetEndDisplay ? this.data.servingTeam : room.match.servingTeam,
        setNo: freezeSetEndDisplay ? Number(this.data.setNo || 1) : room.match.setNo || 1,
        aSetWins: freezeSetEndDisplay ? Number(this.data.aSetWins || 0) : room.match.aSetWins || 0,
        bSetWins: freezeSetEndDisplay ? Number(this.data.bSetWins || 0) : room.match.bSetWins || 0,
        teamATimeoutCount: freezeSetEndDisplay ? Number(this.data.teamATimeoutCount || 0) : teamATimeoutCount,
        teamBTimeoutCount: freezeSetEndDisplay ? Number(this.data.teamBTimeoutCount || 0) : teamBTimeoutCount,
        timeoutActive: freezeSetEndDisplay ? !!this.data.timeoutActive : timeoutActive,
        timeoutTeam: freezeSetEndDisplay ? this.data.timeoutTeam : timeoutActive ? timeoutTeam : "",
        timeoutLeftText: freezeSetEndDisplay ? String(this.data.timeoutLeftText || "暂停 30s") : timeoutLeftText,
        setNoText: freezeSetEndDisplay ? String(this.data.setNoText || "第1局") : setNoText,
        matchModeText: matchModeText,
        setWinsText: freezeSetEndDisplay ? String(this.data.setWinsText || "0 : 0") : setWinsText,
        canStartMatch: freezeSetEndDisplay ? !!this.data.canStartMatch : canStartMatch,
        isMatchFinished: freezeSetEndDisplay ? !!this.data.isMatchFinished : !!room.match.isFinished,
        showSetEndModal: effectiveSetEndActive,
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
        teamAPlayers: freezeSetEndDisplay ? this.data.teamAPlayers : effectiveUseReplayQueue ? prevAPlayers : room.teamA.players,
        teamBPlayers: freezeSetEndDisplay ? this.data.teamBPlayers : effectiveUseReplayQueue ? prevBPlayers : room.teamB.players,
        teamALibero: freezeSetEndDisplay ? this.data.teamALibero : effectiveUseReplayQueue ? prevARows.libero : aRows.libero,
        teamAMainGrid: freezeSetEndDisplay ? this.data.teamAMainGrid : effectiveUseReplayQueue ? prevAMainGrid : aMainGrid,
        teamBLibero: freezeSetEndDisplay ? this.data.teamBLibero : effectiveUseReplayQueue ? prevBRows.libero : bRows.libero,
        teamBMainGrid: freezeSetEndDisplay ? this.data.teamBMainGrid : effectiveUseReplayQueue ? prevBMainGrid : bMainGrid,
        logs: logsForSet,
        logSetSwitchVisible: logSetSwitchVisible,
        logSetOptions: this.buildLogSetOptions(availableLogSets),
        selectedLogSet: selectedLogSet,
        updatedAt: room.updatedAt,
        switchingOut: false,
        switchingIn: effectiveShouldSwapAnimate,
      });
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
          const canAnimateStep1 = this.countRectMap(beforeRects1 || {}) > 0;
          const beforeNoMap1 = this.getTeamMainNumberMap(step.team);
          const beforeCaptain1 = step.team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;

          let beforeRects2: TeamRectMap | null = null;
          let beforeNoMap2: TeamMainNoMap | null = null;
          let beforeCaptain2 = "";
          let canAnimateStep2 = false;
          if (canParallel && nextStep) {
            const measuredBeforeRects2 = await this.measureTeamMainPosRectsStable(nextStep.team, 1200);
            beforeRects2 = this.completeTeamRectMapByGrid(
              nextStep.team,
              measuredBeforeRects2 || {},
              this.getCachedTeamRectMap(nextStep.team)
            );
            canAnimateStep2 = this.countRectMap(beforeRects2 || {}) > 0;
            beforeNoMap2 = this.getTeamMainNumberMap(nextStep.team);
            beforeCaptain2 = nextStep.team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;
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

          const tempARows = buildTeamRows(tempAPlayers);
          const tempBRows = buildTeamRows(tempBPlayers);
          const preHideA =
            (step.team === "A" && canAnimateStep1) || !!(canParallel && nextStep && nextStep.team === "A" && canAnimateStep2);
          const preHideB =
            (step.team === "B" && canAnimateStep1) || !!(canParallel && nextStep && nextStep.team === "B" && canAnimateStep2);
          this.setData({
            teamAPlayers: tempAPlayers,
            teamBPlayers: tempBPlayers,
            teamALibero: tempARows.libero,
            teamAMainGrid: buildMainGridByOrder(tempAPlayers, getMainOrderForTeam("A", teamASide)),
            teamBLibero: tempBRows.libero,
            teamBMainGrid: buildMainGridByOrder(tempBPlayers, getMainOrderForTeam("B", teamASide)),
            hideTeamAMainNumbers: preHideA,
            hideTeamBMainNumbers: preHideB,
          });

          if (canParallel && nextStep && beforeRects2 && beforeNoMap2) {
            await Promise.all([
              this.playTeamRotateMotion(
                step.team,
                beforeRects1,
                beforeNoMap1,
                beforeCaptain1,
                step.reverse ? "reverse" : "forward"
              ),
              this.playTeamRotateMotion(
                nextStep.team,
                beforeRects2,
                beforeNoMap2,
                beforeCaptain2,
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
              step.reverse ? "reverse" : "forward"
            );
            i += 1;
          }
        }
        this.setData({
          teamAPlayers: room.teamA.players,
          teamBPlayers: room.teamB.players,
          teamALibero: aRows.libero,
          teamAMainGrid: aMainGrid,
          teamBLibero: bRows.libero,
          teamBMainGrid: bMainGrid,
        });
      }
      if (autoAnimateA && beforeARects && beforeANoMap) {
        await this.playTeamRotateMotion("A", beforeARects, beforeANoMap, beforeACaptain);
      }
      if (autoAnimateB && beforeBRects && beforeBNoMap) {
        await this.playTeamRotateMotion("B", beforeBRects, beforeBNoMap, beforeBCaptain);
      }
      this.scheduleRectCacheWarmup(36);
      this.lastSeenLogId = latestLogId;
      if (
        effectiveSetEndActive &&
        setEndPhase === "lineup" &&
        setEndOwnerClientId &&
        setEndOwnerClientId === currentClientId &&
        !this.openingLineup
      ) {
        this.openLineupAdjustOnce(roomId);
      }
    } catch (_e) {
      this.markConnectionIssue();
    } finally {
      this.roomLoadInFlight = false;
      if (this.roomLoadPending) {
        const pendingForce = !!this.roomLoadPendingForce;
        this.roomLoadPending = false;
        this.roomLoadPendingForce = false;
        this.loadRoom(roomId, pendingForce);
      }
    }
  },

  onScoreChange(e: WechatMiniprogram.CustomEvent) {
    const raw = (e && e.detail ? (e.detail as { team?: TeamCode; type?: "add" | "sub" }) : {}) || {};
    const detail = {
      team: raw.team,
      type: raw.type || "add",
    };
    void this.enqueueAction(() => this.handleScoreChange(detail));
  },

  async handleScoreChange(detail: { team?: TeamCode; type?: "add" | "sub" }) {
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
        wx.showModal({
          title: "决胜局8分",
          content: "是否现在换边？",
          confirmText: "换边",
          cancelText: "不换边",
          success: (res) => {
            if (res.confirm) {
              void this.switchSidesWithAnimation("自动换边（决胜局）");
              return;
            }
            void this.loadRoom(roomId, true);
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
        this.applyLocalLineupFromRoom(next, { preHideTeams: [rotatedTeam] });
        await this.nextTickAsync();
        await this.playTeamRotateMotion(rotatedTeam, beforeRotateRects, beforeRotateNoMap, beforeRotateCaptain, "forward");
      }
      releaseRotateLock();
      await this.loadRoom(roomId, true);
      showDecidingSetSwitchChoice();
    } finally {
      releaseRotateLock();
    }
  },

  switchSidesWithAnimation(logNote: string) {
    const roomId = this.data.roomId;
    return new Promise<void>((resolve) => {
      this.setData({ switchingOut: true, switchingIn: false });
      setTimeout(() => {
        updateRoomAsync(roomId, (room) => {
          const opId = createLogId();
          (room.match as any).currentOpId = opId;
          pushUndoSnapshot(room);
          room.match.isSwapped = !room.match.isSwapped;
          appendMatchLog(room, "switch_sides", logNote, undefined, opId);
          (room.match as any).lastActionOpId = opId;
          return room;
        })
          .then((next) => {
            this.setData({ switchingOut: false, switchingIn: true });
            if (next) {
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
    const teamAPlayers = (this.data.teamAPlayers || []).slice();
    const teamBPlayers = (this.data.teamBPlayers || []).slice();
    const aRows = buildTeamRows(teamAPlayers);
    const bRows = buildTeamRows(teamBPlayers);
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
        teamAMainGrid: buildMainGridByOrder(teamAPlayers, getMainOrderForTeam("A", teamASide)),
        teamBLibero: bRows.libero,
        teamBMainGrid: buildMainGridByOrder(teamBPlayers, getMainOrderForTeam("B", teamASide)),
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
            },
            { awaitCloud: true }
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
    if (this.timeoutActionInFlight) {
      showToastHint("操作处理中，请稍候");
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
        },
        { awaitCloud: true }
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
            const canAnimateTeam = this.countRectMap(beforeRotateRects || {}) > 0;
            const beforeRotateCaptain = team === "A" ? this.data.teamACaptainNo : this.data.teamBCaptainNo;
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
            this.applyLocalLineupFromRoom(next, { preHideTeams: canAnimateTeam ? [team] : [] });
            await this.nextTickAsync();
            await this.playTeamRotateMotion(team, beforeRotateRects, beforeRotateNoMap, beforeRotateCaptain, "forward");
            needReload = true;
          } finally {
            this.rotateActionInFlight = false;
          }
          if (needReload) {
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
      (room.match as any).teamATimeoutCount = 0;
      (room.match as any).teamBTimeoutCount = 0;
      (room.match as any).timeoutActive = false;
      (room.match as any).timeoutTeam = "";
      (room.match as any).timeoutEndAt = 0;
      room.match.isFinished = false;
      appendMatchLog(room, "score_reset", "比分清零（0:0）", undefined, opId);
      (room.match as any).lastActionOpId = opId;
      return room;
    });
    if (next) {
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
      const canAnimateA = this.countRectMap(beforeARects || {}) > 0;
      const canAnimateB = this.countRectMap(beforeBRects || {}) > 0;
      const beforeACaptain = this.data.teamACaptainNo;
      const beforeBCaptain = this.data.teamBCaptainNo;
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
      room.match.setNo = last.setNo || room.match.setNo || 1;
      room.match.aSetWins = last.aSetWins || 0;
      room.match.bSetWins = last.bSetWins || 0;
      room.match.isFinished = !!last.isFinished;
      (room.match as any).setSummaries = JSON.parse(JSON.stringify((last as any).setSummaries || {}));
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
      const undoDirectionA: RotateDirectionHint = undoRotateA ? resolveRotateDirection(beforeANoMap, afterANoMap) : "";
      const undoDirectionB: RotateDirectionHint = undoRotateB ? resolveRotateDirection(beforeBNoMap, afterBNoMap) : "";
      const swappedChanged = beforeIsSwapped !== !!(next.match && next.match.isSwapped);
      if (swappedChanged) {
        this.setData({ switchingOut: true, switchingIn: false });
        await this.delayAsync(120);
        this.applyLocalScoreFromRoom(next);
        this.applyLocalLineupFromRoom(next, {
          preHideTeams: [
            ...(undoRotateA && canAnimateA ? (["A"] as TeamCode[]) : []),
            ...(undoRotateB && canAnimateB ? (["B"] as TeamCode[]) : []),
          ],
        });
        this.setData({ switchingOut: false, switchingIn: true });
        await this.delayAsync(220);
        this.setData({ switchingIn: false });
      } else {
        this.applyLocalScoreFromRoom(next);
        this.applyLocalLineupFromRoom(next, {
          preHideTeams: [
            ...(undoRotateA && canAnimateA ? (["A"] as TeamCode[]) : []),
            ...(undoRotateB && canAnimateB ? (["B"] as TeamCode[]) : []),
          ],
        });
      }
      await this.nextTickAsync();
      if (undoRotateA) {
        await this.playTeamRotateMotion("A", beforeARects, beforeANoMap, beforeACaptain, undoDirectionA);
      }
      if (undoRotateB) {
        await this.playTeamRotateMotion("B", beforeBRects, beforeBNoMap, beforeBCaptain, undoDirectionB);
      }
    } finally {
      this.rotateActionInFlight = false;
    }
    await this.loadRoom(roomId, true);
  },

  onUndoLastScore() {
    void this.enqueueAction(async () => {
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
    const currentSetNo = Math.max(1, Number(this.data.setNo || 1));
    const availableSetCount = Math.max(1, Number((this.data.logSetOptions || []).length || 1));
    const targetSetNo = Math.min(currentSetNo, availableSetCount);
    this.setData({
      showLogPanel: true,
      selectedLogSet: targetSetNo,
      logs: this.getDisplayLogsBySet(this.allLogs, targetSetNo),
    });
  },

  onSelectLogSet(e: WechatMiniprogram.TouchEvent) {
    const setNo = Math.max(1, Number((e.currentTarget.dataset as { setNo?: number }).setNo || 1));
    if (setNo === this.data.selectedLogSet) {
      return;
    }
    this.setData({
      selectedLogSet: setNo,
      logs: this.getDisplayLogsBySet(this.allLogs, setNo),
    });
  },


  onCloseLogPanel() {
    this.setData({ showLogPanel: false });
  },

  onLogPanelTap() {},
});
