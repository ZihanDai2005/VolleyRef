export type Position = "I" | "II" | "III" | "IV" | "V" | "VI" | "L1" | "L2";

export interface PlayerSlot {
  pos: Position;
  number: string;
}

export interface MatchSettings {
  sets: number;
  wins: number;
  maxScore: number;
  tiebreakScore: number;
  captainEnabled?: boolean;
}

export interface TeamState {
  name: string;
  captainNo: string;
  color: string;
  players: PlayerSlot[];
}

export interface CollaborationState {
  ownerClientId: string;
  operatorClientId: string;
  operatorUpdatedAt: number;
  observerSideMap: Record<string, "A" | "B">;
  presenceSeenAtMap?: Record<string, number>;
  presenceUidMap?: Record<string, string>;
  autoClaimBy?: string;
  autoClaimAt?: number;
  autoClaimPrevOperatorId?: string;
}

export interface SetStartLineupSnapshot {
  setNo: number;
  teamAPlayers: PlayerSlot[];
  teamBPlayers: PlayerSlot[];
  servingTeam: "A" | "B";
  startIsSwapped: boolean;
  endIsSwapped: boolean;
  teamACaptainNo?: string;
  teamBCaptainNo?: string;
  savedAt?: number;
  endedAt?: number;
}

export interface MatchState {
  aScore: number;
  bScore: number;
  lastScoringTeam: "A" | "B" | "";
  teamACurrentCaptainNo: string;
  teamBCurrentCaptainNo: string;
  setTimerStartAt: number;
  setTimerElapsedMs: number;
  servingTeam: "A" | "B";
  isSwapped: boolean;
  decidingSetEightHandled: boolean;
  setNo: number;
  liberoRosterSetNo?: number;
  teamALiberoRoster?: string[];
  teamBLiberoRoster?: string[];
  aSetWins: number;
  bSetWins: number;
  teamATimeoutCount: number;
  teamBTimeoutCount: number;
  timeoutActive: boolean;
  timeoutTeam: "A" | "B" | "";
  timeoutEndAt: number;
  isFinished: boolean;
  lastActionOpId?: string;
  undoStack: Array<{
    aScore: number;
    bScore: number;
    lastScoringTeam?: "A" | "B" | "";
    teamACurrentCaptainNo?: string;
    teamBCurrentCaptainNo?: string;
    setTimerStartAt?: number;
    setTimerElapsedMs?: number;
    servingTeam: "A" | "B";
    teamAPlayers: PlayerSlot[];
    teamBPlayers: PlayerSlot[];
    isSwapped?: boolean;
    decidingSetEightHandled?: boolean;
    setNo?: number;
    aSetWins?: number;
    bSetWins?: number;
    teamATimeoutCount?: number;
    teamBTimeoutCount?: number;
    timeoutActive?: boolean;
    timeoutTeam?: "A" | "B" | "";
    timeoutEndAt?: number;
    isFinished?: boolean;
    lastActionOpId?: string;
  }>;
  logs: Array<{
    id: string;
    ts: number;
    action: string;
    team: "A" | "B" | "";
    note: string;
    setNo?: number;
    opId?: string;
    revertedOpId?: string;
  }>;
  setEndState?: {
    active: boolean;
    phase: "pending" | "lineup";
    ownerClientId: string;
    source?: "set_end" | "reconfigure";
    setNo: number;
    matchFinished: boolean;
    summary: {
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
    };
  };
  lineupAdjustDraft?: any;
  setStartLineupsBySet?: Record<string, SetStartLineupSnapshot>;
  flowMode?: "normal" | "edit_players" | "between_sets";
  flowReturnState?: "prestart" | "playing";
  flowUpdatedAt?: number;
  preStartCaptainConfirmed?: boolean;
  preStartCaptainConfirmSetNo?: number;
  currentOpId?: string;
}

export interface RoomState {
  roomId: string;
  password: string;
  status: "setup" | "match" | "result";
  syncVersion: number;
  expiresAt: number;
  matchEnteredAt: number;
  matchStartedAt: number;
  extraTimeGranted: boolean;
  resultLockedAt: number;
  resultExpireAt: number;
  settings: MatchSettings;
  teamA: TeamState;
  teamB: TeamState;
  collaboration: CollaborationState;
  match: MatchState;
  participants: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

interface RoomStore {
  [roomId: string]: RoomState;
}

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const ROOM_EXTRA_TTL_MS = 3 * 60 * 60 * 1000;
const RESULT_KEEP_MS = 24 * 60 * 60 * 1000;
const PARTICIPANT_TTL_MS = 40 * 1000;
const ROOM_LOCK_TTL_MS = 3 * 60 * 60 * 1000;
const AUTHORITY_PRESENCE_TTL_MS = 5 * 60 * 1000;
const CLOUD_PULL_INTERVAL_MS = 15000;
const ROOM_API_FUNCTION = "roomApi";
const ROOM_API_TIMEOUT_MS = 10000;
const POSITIONS: Position[] = ["I", "II", "III", "IV", "V", "VI", "L1", "L2"];
const DEFAULT_TEAM_A_COLOR = "#BEC5CC";
const DEFAULT_TEAM_B_COLOR = "#707A8A";
export const TEAM_COLOR_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "浅灰", value: "#BEC5CC" },
  { label: "深灰", value: "#707A8A" },
  { label: "紫色", value: "#837AE5" },
  { label: "深蓝", value: "#4C87DE" },
  { label: "浅蓝", value: "#7EC5FB" },
  { label: "青色", value: "#4DD1C2" },
  { label: "浅绿", value: "#86DB8A" },
  { label: "深绿", value: "#409965" },
  { label: "黄色", value: "#FCC947" },
  { label: "粉色", value: "#FFBBD5" },
  { label: "橙色", value: "#FD9D51" },
  { label: "红色", value: "#EF6B6A" }
];

const cloudPullingMap: Record<string, boolean> = {};
const cloudPullAtMap: Record<string, number> = {};
const roomMemoryStore: RoomStore = {};
const roomLockMemoryStore: Record<string, { owner: string; ts: number }> = {};
const roomWatchMap: Record<
  string,
  {
    listeners: Set<(room: RoomState | null) => void>;
    watcher: { close?: () => void } | null;
    restarting: boolean;
  }
> = {};

function canUseCloud(): boolean {
  return !!(wx as any).cloud && typeof (wx as any).cloud.callFunction === "function";
}

function callRoomApi<T = any>(
  action: string,
  payload: Record<string, any>,
  timeoutMs = ROOM_API_TIMEOUT_MS
): Promise<T> {
  if (!canUseCloud()) {
    return Promise.reject(new Error("cloud-not-ready"));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const safeResolve = (value: T) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const safeReject = (error: any) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const timeout = setTimeout(() => {
      safeReject(new Error("cloud-timeout"));
    }, Math.max(1000, Number(timeoutMs) || ROOM_API_TIMEOUT_MS));

    (wx as any).cloud
      .callFunction({
        name: ROOM_API_FUNCTION,
        data: {
          action: action,
          ...payload,
        },
      })
      .then((res: any) => {
        clearTimeout(timeout);
        const result = (res && res.result) || {};
        if (result && result.ok === false) {
          safeReject(new Error(String(result.message || "cloud-api-failed")));
          return;
        }
        safeResolve(result as T);
      })
      .catch((e: any) => {
        clearTimeout(timeout);
        safeReject(e);
      });
  });
}

function normalizeHexColor(color: unknown, fallback: string): string {
  const raw = String(color || "").trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(raw)) {
    return fallback;
  }
  const exists = TEAM_COLOR_OPTIONS.some(function (item) {
    return item.value === raw;
  });
  return exists ? raw : fallback;
}

function now(): number {
  return Date.now();
}

function saveStore(store: RoomStore): void {
  Object.keys(roomMemoryStore).forEach(function (roomId) {
    delete roomMemoryStore[roomId];
  });
  Object.keys(store).forEach(function (roomId) {
    roomMemoryStore[roomId] = cloneRoom(store[roomId]);
  });
}

function loadRoomLocks(): Record<string, { owner: string; ts: number }> {
  const input = roomLockMemoryStore as Record<string, { owner?: string; ts?: number }>;
  const output: Record<string, { owner: string; ts: number }> = {};
  const nowTs = now();
  Object.keys(input).forEach(function (roomId) {
    const item = input[roomId];
    const owner = String(item && item.owner ? item.owner : "");
    const ts = Number(item && item.ts ? item.ts : 0);
    if (!owner || ts <= 0) {
      return;
    }
    if (nowTs - ts > ROOM_LOCK_TTL_MS) {
      return;
    }
    output[roomId] = { owner: owner, ts: ts };
  });
  return output;
}

function saveRoomLocks(locks: Record<string, { owner: string; ts: number }>): void {
  Object.keys(roomLockMemoryStore).forEach(function (roomId) {
    delete roomLockMemoryStore[roomId];
  });
  Object.keys(locks).forEach(function (roomId) {
    roomLockMemoryStore[roomId] = {
      owner: String(locks[roomId].owner || ""),
      ts: Number(locks[roomId].ts || 0),
    };
  });
}

function randomRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cloneRoom(room: RoomState): RoomState {
  return JSON.parse(JSON.stringify(room)) as RoomState;
}

function createDefaultRoom(roomId: string): RoomState {
  const ts = now();
  return {
    roomId: roomId,
    password: "",
    status: "setup",
    syncVersion: 1,
    expiresAt: ts + ROOM_TTL_MS,
    matchEnteredAt: 0,
    matchStartedAt: 0,
    extraTimeGranted: false,
    resultLockedAt: 0,
    resultExpireAt: 0,
    settings: {
      sets: 5,
      wins: 3,
      maxScore: 25,
      tiebreakScore: 15,
    },
    teamA: {
      name: "甲",
      captainNo: "",
      color: DEFAULT_TEAM_A_COLOR,
      players: createInitialPlayers(),
    },
    teamB: {
      name: "乙",
      captainNo: "",
      color: DEFAULT_TEAM_B_COLOR,
      players: createInitialPlayers(),
    },
    collaboration: {
      ownerClientId: "",
      operatorClientId: "",
      operatorUpdatedAt: 0,
      observerSideMap: {},
      presenceSeenAtMap: {},
      presenceUidMap: {},
      autoClaimBy: "",
      autoClaimAt: 0,
      autoClaimPrevOperatorId: "",
    },
    match: {
      aScore: 0,
      bScore: 0,
      lastScoringTeam: "",
      teamACurrentCaptainNo: "",
      teamBCurrentCaptainNo: "",
      setTimerStartAt: 0,
      setTimerElapsedMs: 0,
      servingTeam: "A",
      isSwapped: false,
      decidingSetEightHandled: false,
      setNo: 1,
      liberoRosterSetNo: 0,
      teamALiberoRoster: [],
      teamBLiberoRoster: [],
      aSetWins: 0,
      bSetWins: 0,
      teamATimeoutCount: 0,
      teamBTimeoutCount: 0,
      timeoutActive: false,
      timeoutTeam: "",
      timeoutEndAt: 0,
      isFinished: false,
      undoStack: [],
      logs: [],
      setEndState: undefined,
      lineupAdjustDraft: undefined,
      setStartLineupsBySet: {},
    },
    participants: {},
    createdAt: ts,
    updatedAt: ts,
  };
}

function normalizePlayers(players: unknown): PlayerSlot[] {
  if (!Array.isArray(players)) {
    return createInitialPlayers();
  }
  const result: PlayerSlot[] = [];
  POSITIONS.forEach(function (pos, idx) {
    const raw = players[idx] as Partial<PlayerSlot> | undefined;
    result.push({
      pos: pos,
      number: raw && typeof raw.number === "string" ? raw.number : "?",
    });
  });
  return result;
}

function normalizeLiberoRoster(source: unknown): string[] {
  if (!Array.isArray(source)) {
    return [];
  }
  const result: string[] = [];
  source.forEach((raw) => {
    const no = String(raw || "").replace(/\D/g, "").slice(0, 2);
    if (!no) {
      return;
    }
    if (result.indexOf(no) >= 0) {
      return;
    }
    result.push(no);
  });
  return result.slice(0, 2);
}

function normalizeSetStartLineupsBySet(source: unknown): Record<string, SetStartLineupSnapshot> {
  if (!source || typeof source !== "object") {
    return {};
  }
  const input = source as Record<string, unknown>;
  const output: Record<string, SetStartLineupSnapshot> = {};
  Object.keys(input).forEach(function (key) {
    const raw = input[key];
    if (!raw || typeof raw !== "object") {
      return;
    }
    const item = raw as Record<string, unknown>;
    const setNo = Math.max(1, Number(item.setNo || key) || 1);
    output[String(setNo)] = {
      setNo: setNo,
      teamAPlayers: normalizePlayers(item.teamAPlayers),
      teamBPlayers: normalizePlayers(item.teamBPlayers),
      servingTeam: item.servingTeam === "B" ? "B" : "A",
      startIsSwapped: !!item.startIsSwapped,
      endIsSwapped:
        typeof item.endIsSwapped === "boolean" ? !!item.endIsSwapped : !!item.startIsSwapped,
      teamACaptainNo: String(item.teamACaptainNo || ""),
      teamBCaptainNo: String(item.teamBCaptainNo || ""),
      savedAt: Math.max(0, Number(item.savedAt) || 0),
      endedAt: Math.max(0, Number(item.endedAt) || 0),
    };
  });
  return output;
}

function normalizeParticipants(source: unknown): Record<string, number> {
  if (!source || typeof source !== "object") {
    return {};
  }
  const input = source as Record<string, unknown>;
  const output: Record<string, number> = {};
  Object.keys(input).forEach(function (k) {
    const ts = Number(input[k]);
    if (ts > 0) {
      output[k] = ts;
    }
  });
  return output;
}

function normalizeObserverSideMap(source: unknown): Record<string, "A" | "B"> {
  if (!source || typeof source !== "object") {
    return {};
  }
  const input = source as Record<string, unknown>;
  const output: Record<string, "A" | "B"> = {};
  Object.keys(input).forEach(function (clientId) {
    const side = input[clientId] === "B" ? "B" : input[clientId] === "A" ? "A" : "";
    if (!side) {
      return;
    }
    const id = String(clientId || "").trim();
    if (!id) {
      return;
    }
    output[id] = side;
  });
  return output;
}

function normalizeRoom(roomId: string, raw: unknown): RoomState {
  const input = (raw || {}) as Partial<RoomState>;
  const base = createDefaultRoom(roomId);

  base.password = String((input as any).password || "");
  base.status = input.status === "result" ? "result" : input.status === "match" ? "match" : "setup";
  base.syncVersion = Math.max(1, Number((input as any).syncVersion) || 1);
  base.expiresAt = Math.max(0, Number((input as any).expiresAt) || 0);
  base.matchEnteredAt = Math.max(0, Number((input as any).matchEnteredAt) || 0);
  base.matchStartedAt = Math.max(0, Number((input as any).matchStartedAt) || 0);
  base.extraTimeGranted = !!(input as any).extraTimeGranted;
  base.resultLockedAt = Math.max(0, Number((input as any).resultLockedAt) || 0);
  base.resultExpireAt = Math.max(0, Number((input as any).resultExpireAt) || 0);
  base.settings.sets = Number(input.settings && input.settings.sets) || 5;
  base.settings.wins = Number(input.settings && input.settings.wins) || 3;
  base.settings.maxScore = Number(input.settings && input.settings.maxScore) || 25;
  base.settings.tiebreakScore = Number(input.settings && input.settings.tiebreakScore) || 15;
  if (input.settings && Object.prototype.hasOwnProperty.call(input.settings, "captainEnabled")) {
    base.settings.captainEnabled = (input.settings as MatchSettings).captainEnabled !== false;
  } else {
    delete base.settings.captainEnabled;
  }

  base.teamA.name = (input.teamA && input.teamA.name) || "甲";
  base.teamB.name = (input.teamB && input.teamB.name) || "乙";
  base.teamA.captainNo = String(input.teamA && (input.teamA as any).captainNo ? (input.teamA as any).captainNo : "");
  base.teamB.captainNo = String(input.teamB && (input.teamB as any).captainNo ? (input.teamB as any).captainNo : "");
  base.teamA.color = normalizeHexColor(input.teamA && (input.teamA as any).color, DEFAULT_TEAM_A_COLOR);
  base.teamB.color = normalizeHexColor(input.teamB && (input.teamB as any).color, DEFAULT_TEAM_B_COLOR);
  if (base.teamA.color === base.teamB.color) {
    base.teamB.color = DEFAULT_TEAM_B_COLOR;
    if (base.teamA.color === base.teamB.color) {
      base.teamB.color = TEAM_COLOR_OPTIONS[2].value;
    }
  }
  base.teamA.players = normalizePlayers(input.teamA && input.teamA.players);
  base.teamB.players = normalizePlayers(input.teamB && input.teamB.players);
  const rawCollaboration = ((input as any).collaboration || {}) as Partial<CollaborationState>;
  base.collaboration.ownerClientId = String(
    rawCollaboration.ownerClientId || (input as any).ownerClientId || ""
  ).trim();
  base.collaboration.operatorClientId = String(
    rawCollaboration.operatorClientId || (input as any).operatorClientId || base.collaboration.ownerClientId || ""
  ).trim();
  base.collaboration.operatorUpdatedAt = Math.max(0, Number(rawCollaboration.operatorUpdatedAt) || 0);
  base.collaboration.observerSideMap = normalizeObserverSideMap(rawCollaboration.observerSideMap);
  base.collaboration.presenceSeenAtMap = normalizeParticipants(rawCollaboration.presenceSeenAtMap);
  base.collaboration.presenceUidMap = {};
  const rawPresenceUidMap =
    rawCollaboration && rawCollaboration.presenceUidMap && typeof rawCollaboration.presenceUidMap === "object"
      ? (rawCollaboration.presenceUidMap as Record<string, unknown>)
      : null;
  if (rawPresenceUidMap) {
    Object.keys(rawPresenceUidMap).forEach((clientId) => {
      const uid = String(rawPresenceUidMap[clientId] || "").trim();
      const cid = String(clientId || "").trim();
      if (cid && uid) {
        (base.collaboration.presenceUidMap as Record<string, string>)[cid] = uid;
      }
    });
  }
  base.collaboration.autoClaimBy = String(rawCollaboration.autoClaimBy || "").trim();
  base.collaboration.autoClaimAt = Math.max(0, Number(rawCollaboration.autoClaimAt) || 0);
  base.collaboration.autoClaimPrevOperatorId = String(rawCollaboration.autoClaimPrevOperatorId || "").trim();
  if (!base.collaboration.ownerClientId && base.collaboration.operatorClientId) {
    base.collaboration.ownerClientId = base.collaboration.operatorClientId;
  }
  if (!base.collaboration.operatorClientId && base.collaboration.ownerClientId) {
    base.collaboration.operatorClientId = base.collaboration.ownerClientId;
  }
  if (
    base.collaboration.autoClaimBy &&
    base.collaboration.autoClaimBy !== base.collaboration.operatorClientId
  ) {
    base.collaboration.autoClaimBy = "";
    base.collaboration.autoClaimAt = 0;
    base.collaboration.autoClaimPrevOperatorId = "";
  }

  base.match.aScore = Math.max(0, Number(input.match && input.match.aScore) || 0);
  base.match.bScore = Math.max(0, Number(input.match && input.match.bScore) || 0);
  base.match.lastScoringTeam =
    input.match && (input.match as any).lastScoringTeam === "B"
      ? "B"
      : input.match && (input.match as any).lastScoringTeam === "A"
        ? "A"
        : "";
  base.match.teamACurrentCaptainNo = String(
    (input.match && (input.match as any).teamACurrentCaptainNo) ||
      (input.teamA && (input.teamA as any).captainNo) ||
      ""
  );
  base.match.teamBCurrentCaptainNo = String(
    (input.match && (input.match as any).teamBCurrentCaptainNo) ||
      (input.teamB && (input.teamB as any).captainNo) ||
      ""
  );
  base.match.setTimerStartAt = Math.max(0, Number(input.match && (input.match as any).setTimerStartAt) || 0);
  base.match.setTimerElapsedMs = Math.max(0, Number(input.match && (input.match as any).setTimerElapsedMs) || 0);
  base.match.servingTeam = input.match && input.match.servingTeam === "B" ? "B" : "A";
  base.match.isSwapped = !!(input.match && (input.match as any).isSwapped);
  base.match.decidingSetEightHandled = !!(input.match && (input.match as any).decidingSetEightHandled);
  base.match.setNo = Math.max(1, Number(input.match && (input.match as any).setNo) || 1);
  base.match.liberoRosterSetNo = Math.max(0, Number(input.match && (input.match as any).liberoRosterSetNo) || 0);
  base.match.teamALiberoRoster = normalizeLiberoRoster(input.match && (input.match as any).teamALiberoRoster);
  base.match.teamBLiberoRoster = normalizeLiberoRoster(input.match && (input.match as any).teamBLiberoRoster);
  base.match.aSetWins = Math.max(0, Number(input.match && (input.match as any).aSetWins) || 0);
  base.match.bSetWins = Math.max(0, Number(input.match && (input.match as any).bSetWins) || 0);
  base.match.teamATimeoutCount = Math.max(0, Math.min(2, Number(input.match && (input.match as any).teamATimeoutCount) || 0));
  base.match.teamBTimeoutCount = Math.max(0, Math.min(2, Number(input.match && (input.match as any).teamBTimeoutCount) || 0));
  base.match.timeoutActive = !!(input.match && (input.match as any).timeoutActive);
  base.match.timeoutTeam =
    input.match && (input.match as any).timeoutTeam === "B"
      ? "B"
      : input.match && (input.match as any).timeoutTeam === "A"
        ? "A"
        : "";
  base.match.timeoutEndAt = Math.max(0, Number(input.match && (input.match as any).timeoutEndAt) || 0);
  if (base.match.timeoutEndAt <= now()) {
    base.match.timeoutActive = false;
    base.match.timeoutTeam = "";
    base.match.timeoutEndAt = 0;
  }
  base.match.isFinished = !!(input.match && (input.match as any).isFinished);
  (base.match as any).lastActionOpId = String((input.match && (input.match as any).lastActionOpId) || "");
  (base.match as any).currentOpId = String((input.match && (input.match as any).currentOpId) || "");
  (base.match as any).flowMode =
    input.match && ((input.match as any).flowMode === "edit_players" || (input.match as any).flowMode === "between_sets")
      ? (input.match as any).flowMode
      : "normal";
  (base.match as any).flowReturnState =
    input.match && (input.match as any).flowReturnState === "prestart"
      ? "prestart"
      : input.match && (input.match as any).flowReturnState === "playing"
        ? "playing"
        : "";
  (base.match as any).flowUpdatedAt = Math.max(
    0,
    Number(input.match && (input.match as any).flowUpdatedAt) || 0
  );
  (base.match as any).preStartCaptainConfirmed = !!(
    input.match && (input.match as any).preStartCaptainConfirmed
  );
  (base.match as any).preStartCaptainConfirmSetNo = Math.max(
    0,
    Number(input.match && (input.match as any).preStartCaptainConfirmSetNo) || 0
  );

  const rawUndoStack = input.match && (input.match as any).undoStack;
  if (Array.isArray(rawUndoStack)) {
    base.match.undoStack = rawUndoStack.map(function (item: any) {
      return {
        aScore: Math.max(0, Number(item.aScore) || 0),
        bScore: Math.max(0, Number(item.bScore) || 0),
        lastScoringTeam: item.lastScoringTeam === "B" ? "B" : item.lastScoringTeam === "A" ? "A" : "",
        teamACurrentCaptainNo: String(item.teamACurrentCaptainNo || base.match.teamACurrentCaptainNo || ""),
        teamBCurrentCaptainNo: String(item.teamBCurrentCaptainNo || base.match.teamBCurrentCaptainNo || ""),
        setTimerStartAt: Math.max(0, Number(item.setTimerStartAt) || 0),
        setTimerElapsedMs: Math.max(0, Number(item.setTimerElapsedMs) || 0),
        servingTeam: item.servingTeam === "B" ? "B" : "A",
        teamAPlayers: normalizePlayers(item.teamAPlayers),
        teamBPlayers: normalizePlayers(item.teamBPlayers),
        isSwapped: !!item.isSwapped,
        decidingSetEightHandled: !!item.decidingSetEightHandled,
        setNo: Math.max(1, Number(item.setNo) || 1),
        aSetWins: Math.max(0, Number(item.aSetWins) || 0),
        bSetWins: Math.max(0, Number(item.bSetWins) || 0),
        teamATimeoutCount: Math.max(0, Math.min(2, Number(item.teamATimeoutCount) || 0)),
        teamBTimeoutCount: Math.max(0, Math.min(2, Number(item.teamBTimeoutCount) || 0)),
        timeoutActive: !!item.timeoutActive,
        timeoutTeam: item.timeoutTeam === "B" ? "B" : item.timeoutTeam === "A" ? "A" : "",
        timeoutEndAt: Math.max(0, Number(item.timeoutEndAt) || 0),
        isFinished: !!item.isFinished,
        lastActionOpId: String(item.lastActionOpId || ""),
      };
    });
  } else {
    base.match.undoStack = [];
  }

  const rawLogs = input.match && (input.match as any).logs;
  if (Array.isArray(rawLogs)) {
    base.match.logs = rawLogs.map(function (item: any, idx: number) {
      const team = item.team === "A" || item.team === "B" ? item.team : "";
      return {
        id: String(item.id || "log-" + idx),
        ts: Number(item.ts) || now(),
        action: String(item.action || "unknown"),
        team: team,
        note: String(item.note || ""),
        setNo: Math.max(1, Number(item.setNo) || 1),
        opId: String(item.opId || ""),
        revertedOpId: String(item.revertedOpId || ""),
      };
    });
  } else {
    base.match.logs = [];
  }

  const rawSetEndState = input.match && (input.match as any).setEndState;
  if (rawSetEndState && typeof rawSetEndState === "object") {
    const summary = (rawSetEndState as any).summary || {};
    (base.match as any).setEndState = {
      active: !!(rawSetEndState as any).active,
      phase: (rawSetEndState as any).phase === "lineup" ? "lineup" : "pending",
      ownerClientId: String((rawSetEndState as any).ownerClientId || ""),
      source: (rawSetEndState as any).source === "reconfigure" ? "reconfigure" : "set_end",
      setNo: Math.max(1, Number((rawSetEndState as any).setNo) || 1),
      matchFinished: !!(rawSetEndState as any).matchFinished,
      summary: {
        setNo: Math.max(1, Number(summary.setNo) || 1),
        teamAName: String(summary.teamAName || base.teamA.name || "甲"),
        teamBName: String(summary.teamBName || base.teamB.name || "乙"),
        smallScoreA: Math.max(0, Number(summary.smallScoreA) || 0),
        smallScoreB: Math.max(0, Number(summary.smallScoreB) || 0),
        bigScoreA: Math.max(0, Number(summary.bigScoreA) || 0),
        bigScoreB: Math.max(0, Number(summary.bigScoreB) || 0),
        winnerName: String(summary.winnerName || ""),
        durationText: String(summary.durationText || "00:00"),
        matchFinished: !!summary.matchFinished,
      },
    };
  } else {
    (base.match as any).setEndState = undefined;
  }

  if (input.match && (input.match as any).lineupAdjustDraft) {
    (base.match as any).lineupAdjustDraft = (input.match as any).lineupAdjustDraft;
  } else {
    (base.match as any).lineupAdjustDraft = undefined;
  }
  (base.match as any).setStartLineupsBySet = normalizeSetStartLineupsBySet(
    input.match && (input.match as any).setStartLineupsBySet
  );

  base.participants = normalizeParticipants((input as any).participants);
  base.createdAt = Number(input.createdAt) || base.createdAt;
  base.updatedAt = Number(input.updatedAt) || base.updatedAt;
  if (!base.collaboration.operatorUpdatedAt && base.collaboration.operatorClientId) {
    base.collaboration.operatorUpdatedAt = Math.max(base.updatedAt || 0, base.createdAt || 0, now());
  }

  if (!base.expiresAt) {
    base.expiresAt = base.createdAt + ROOM_TTL_MS;
  }
  if (base.status === "match" && base.matchEnteredAt <= 0) {
    base.matchEnteredAt = Math.max(base.matchStartedAt || 0, base.updatedAt || 0, base.createdAt || 0, now());
  }
  if (base.status === "result") {
    if (!base.resultLockedAt) {
      base.resultLockedAt = Math.max(base.updatedAt || 0, base.createdAt || 0, now());
    }
    if (!base.resultExpireAt) {
      base.resultExpireAt = base.resultLockedAt + RESULT_KEEP_MS;
    }
  } else {
    base.resultLockedAt = 0;
    base.resultExpireAt = 0;
  }

  return base;
}

function cleanupRoomParticipants(room: RoomState): boolean {
  const ts = now();
  let changed = false;
  Object.keys(room.participants).forEach(function (clientId) {
    if (ts - room.participants[clientId] > PARTICIPANT_TTL_MS) {
      delete room.participants[clientId];
      changed = true;
    }
  });
  return changed;
}

function clearAutoOperatorClaimMeta(collaboration: CollaborationState): boolean {
  let changed = false;
  if (String(collaboration.autoClaimBy || "")) {
    collaboration.autoClaimBy = "";
    changed = true;
  }
  if (Number(collaboration.autoClaimAt || 0) > 0) {
    collaboration.autoClaimAt = 0;
    changed = true;
  }
  if (String(collaboration.autoClaimPrevOperatorId || "")) {
    collaboration.autoClaimPrevOperatorId = "";
    changed = true;
  }
  return changed;
}

function ensureOperatorByParticipants(room: RoomState, clientId: string): boolean {
  const cid = String(clientId || "").trim();
  if (!cid) {
    return false;
  }
  if (!room.collaboration || typeof room.collaboration !== "object") {
    (room as any).collaboration = {
      ownerClientId: "",
      operatorClientId: "",
      operatorUpdatedAt: 0,
      observerSideMap: {},
      presenceSeenAtMap: {},
      presenceUidMap: {},
      autoClaimBy: "",
      autoClaimAt: 0,
      autoClaimPrevOperatorId: "",
    } as CollaborationState;
  }
  const collaboration = room.collaboration as CollaborationState;
  if (!collaboration.presenceSeenAtMap || typeof collaboration.presenceSeenAtMap !== "object") {
    collaboration.presenceSeenAtMap = {};
  }
  if (!collaboration.presenceUidMap || typeof collaboration.presenceUidMap !== "object") {
    collaboration.presenceUidMap = {};
  }
  const nowTs = now();
  const seenMap = collaboration.presenceSeenAtMap;
  let changed = false;
  Object.keys(seenMap).forEach((id) => {
    if (!room.participants[id] || nowTs - Number(seenMap[id] || 0) > AUTHORITY_PRESENCE_TTL_MS) {
      delete seenMap[id];
      changed = true;
    }
  });
  if (Number(seenMap[cid] || 0) !== nowTs) {
    seenMap[cid] = nowTs;
    changed = true;
  }
  const currentOperator = String(getRoomOperatorClientId(room) || "").trim();
  const currentOwner = String(getRoomOwnerClientId(room) || "").trim();
  // 角色切换只允许显式“接管”触发；心跳只维护在线状态，不自动抢权。
  if (!currentOperator) {
    const fallback = currentOwner || cid;
    collaboration.operatorClientId = fallback;
    collaboration.operatorUpdatedAt = nowTs;
    changed = true;
  }
  if (!collaboration.ownerClientId && (currentOwner || currentOperator || cid)) {
    collaboration.ownerClientId = currentOwner || currentOperator || cid;
    changed = true;
  }
  changed = clearAutoOperatorClaimMeta(collaboration) || changed;
  return changed;
}

function cleanupExpiredRooms(store: RoomStore): boolean {
  const ts = now();
  let changed = false;
  Object.keys(store).forEach(function (roomId) {
    const room = store[roomId];
    if (!room) {
      return;
    }
    if (cleanupRoomParticipants(room)) {
      changed = true;
    }
    if (room.status === "result") {
      if (room.resultExpireAt > 0 && ts > room.resultExpireAt) {
        delete store[roomId];
        changed = true;
      }
      return;
    }

    const hasStartedMatch = room.matchStartedAt > 0;
    if (!hasStartedMatch && room.expiresAt > 0 && ts > room.expiresAt) {
      delete store[roomId];
      changed = true;
      return;
    }

    if (
      hasStartedMatch &&
      room.expiresAt > 0 &&
      ts > room.expiresAt &&
      !room.extraTimeGranted
    ) {
      room.expiresAt = room.expiresAt + ROOM_EXTRA_TTL_MS;
      room.extraTimeGranted = true;
      room.updatedAt = ts;
      changed = true;
      return;
    }

    if (room.expiresAt > 0 && ts > room.expiresAt) {
      delete store[roomId];
      changed = true;
    }
  });
  return changed;
}

function getStore(): RoomStore {
  const store: RoomStore = {};
  Object.keys(roomMemoryStore).forEach(function (roomId) {
    store[roomId] = normalizeRoom(roomId, roomMemoryStore[roomId]);
  });
  if (cleanupExpiredRooms(store)) {
    saveStore(store);
  }
  return store;
}

function saveRoomToStore(room: RoomState): void {
  const store = getStore();
  store[room.roomId] = normalizeRoom(room.roomId, room);
  saveStore(store);
}

function saveCloudRoomRaw(raw: any): RoomState {
  const roomId = String(raw && raw.roomId ? raw.roomId : raw && raw._id ? raw._id : "");
  const room = normalizeRoom(roomId, raw || {});
  const current = getStore()[roomId];
  if (current) {
    const currentStatus = String((current as any).status || "");
    const nextStatus = String((room as any).status || "");
    if (nextStatus === "result" && currentStatus !== "result") {
      saveRoomToStore(room);
      return room;
    }
    if (currentStatus === "result" && nextStatus !== "result") {
      return cloneRoom(current);
    }
    const currentVersion = Math.max(1, Number((current as any).syncVersion) || 1);
    const nextVersion = Math.max(1, Number((room as any).syncVersion) || 1);
    if (nextVersion < currentVersion) {
      return cloneRoom(current);
    }
    if (nextVersion === currentVersion && Number(room.updatedAt || 0) < Number(current.updatedAt || 0)) {
      return cloneRoom(current);
    }
  }
  saveRoomToStore(room);
  return room;
}

function hasRoomWatch(roomId: string): boolean {
  const bucket = roomWatchMap[roomId];
  return !!bucket && bucket.listeners.size > 0;
}

function emitRoomWatch(roomId: string, room: RoomState | null): void {
  const bucket = roomWatchMap[roomId];
  if (!bucket || bucket.listeners.size <= 0) {
    return;
  }
  bucket.listeners.forEach((listener) => {
    try {
      listener(room ? cloneRoom(room) : null);
    } catch (e) {}
  });
}

function stopRoomWatchInternal(roomId: string): void {
  const bucket = roomWatchMap[roomId];
  if (!bucket) {
    return;
  }
  try {
    bucket.watcher && bucket.watcher.close && bucket.watcher.close();
  } catch (e) {}
  bucket.watcher = null;
  bucket.restarting = false;
}

function startRoomWatchInternal(roomId: string): void {
  const bucket = roomWatchMap[roomId];
  if (!bucket || bucket.watcher || !canUseCloud() || !roomId) {
    return;
  }
  const cloudObj = (wx as any).cloud;
  if (!cloudObj || typeof cloudObj.database !== "function") {
    return;
  }
  try {
    const db = cloudObj.database();
    bucket.watcher = db
      .collection("rooms")
      .doc(roomId)
      .watch({
        onChange: (snapshot: any) => {
          const docs = snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
          if (!docs.length) {
            // 云 watch 可能短暂抖动返回空 docs，避免误删本地房间导致页面误判“房间已关闭”。
            cloudPullRoom(roomId);
            const local = getStore()[roomId] || null;
            emitRoomWatch(roomId, local);
            return;
          }
          const next = saveCloudRoomRaw(docs[0]);
          emitRoomWatch(roomId, next);
        },
        onError: () => {
          stopRoomWatchInternal(roomId);
          const latest = roomWatchMap[roomId];
          if (!latest || latest.restarting || latest.listeners.size <= 0) {
            return;
          }
          latest.restarting = true;
          setTimeout(() => {
            const retry = roomWatchMap[roomId];
            if (!retry) {
              return;
            }
            retry.restarting = false;
            if (retry.listeners.size > 0) {
              startRoomWatchInternal(roomId);
            }
          }, 1200);
        },
      });
  } catch (e) {
    stopRoomWatchInternal(roomId);
  }
}

function cloudPullRoom(roomId: string): void {
  if (!canUseCloud() || !roomId) {
    return;
  }
  if (cloudPullingMap[roomId]) {
    return;
  }
  const nowTs = now();
  const last = cloudPullAtMap[roomId] || 0;
  if (nowTs - last < CLOUD_PULL_INTERVAL_MS) {
    return;
  }
  cloudPullAtMap[roomId] = nowTs;
  cloudPullingMap[roomId] = true;
  callRoomApi<{ room?: any }>("getRoom", { roomId: roomId })
    .then((res) => {
      if (res && res.room) {
        const next = saveCloudRoomRaw(res.room);
        emitRoomWatch(roomId, next);
      }
    })
    .catch(() => {})
    .finally(() => {
      cloudPullingMap[roomId] = false;
    });
}

function cloudUpsertRoom(room: RoomState): void {
  if (!canUseCloud() || !room || !room.roomId) {
    return;
  }
  callRoomApi("upsertRoom", { room: room }).catch(() => {});
}

export function createInitialPlayers(): PlayerSlot[] {
  return POSITIONS.map(function (pos) {
    return { pos: pos, number: "?" };
  });
}

export function buildDefaultSettings(): MatchSettings {
  return {
    sets: 5,
    wins: 3,
    maxScore: 25,
    tiebreakScore: 15,
  };
}

export function createRoom(input: {
  roomId?: string;
  password: string;
  settings: MatchSettings;
  teamAName: string;
  teamBName: string;
  teamACaptainNo?: string;
  teamBCaptainNo?: string;
  teamAColor?: string;
  teamBColor?: string;
  creatorClientId?: string;
  teamAPlayers: PlayerSlot[];
  teamBPlayers: PlayerSlot[];
}): RoomState {
  const store = getStore();
  let roomId = input.roomId || randomRoomId();

  if (!input.roomId) {
    while (store[roomId]) {
      roomId = randomRoomId();
    }
  } else if (store[roomId]) {
    return cloneRoom(store[roomId]);
  }

  const room = createDefaultRoom(roomId);
  room.password = String(input.password || "");
  room.settings = {
    sets: Number(input.settings.sets) || 5,
    wins: Number(input.settings.wins) || 3,
    maxScore: Number(input.settings.maxScore) || 25,
    tiebreakScore: Number(input.settings.tiebreakScore) || 15,
  };
  if (input.settings.captainEnabled === false) {
    room.settings.captainEnabled = false;
  }
  room.teamA = {
    name: input.teamAName || "甲",
    captainNo: String(input.teamACaptainNo || ""),
    color: normalizeHexColor(input.teamAColor, DEFAULT_TEAM_A_COLOR),
    players: normalizePlayers(input.teamAPlayers),
  };
  room.teamB = {
    name: input.teamBName || "乙",
    captainNo: String(input.teamBCaptainNo || ""),
    color: normalizeHexColor(input.teamBColor, DEFAULT_TEAM_B_COLOR),
    players: normalizePlayers(input.teamBPlayers),
  };
  room.match.teamACurrentCaptainNo = room.teamA.captainNo;
  room.match.teamBCurrentCaptainNo = room.teamB.captainNo;
  if (room.teamA.color === room.teamB.color) {
    room.teamB.color = DEFAULT_TEAM_B_COLOR;
    if (room.teamA.color === room.teamB.color) {
      room.teamB.color = TEAM_COLOR_OPTIONS[2].value;
    }
  }
  const creatorClientId = String(input.creatorClientId || "").trim();
  if (creatorClientId) {
    room.collaboration.ownerClientId = creatorClientId;
    room.collaboration.operatorClientId = creatorClientId;
    room.collaboration.operatorUpdatedAt = now();
  }

  store[roomId] = room;
  saveStore(store);
  cloudUpsertRoom(room);
  return cloneRoom(room);
}

export function getRoom(roomId: string): RoomState | null {
  const room = getStore()[roomId];
  if (roomId && !hasRoomWatch(roomId)) {
    cloudPullRoom(roomId);
  }
  return room ? cloneRoom(room) : null;
}

export function isRoomIdBlocked(roomId: string): boolean {
  const id = String(roomId || "");
  if (!id) {
    return false;
  }
  if (getRoom(id)) {
    return true;
  }
  const locks = loadRoomLocks();
  return !!locks[id];
}

export function reserveRoomId(roomId: string, ownerId: string): boolean {
  const id = String(roomId || "");
  const owner = String(ownerId || "");
  if (!id || !owner) {
    return false;
  }
  if (getRoom(id)) {
    return false;
  }
  const locks = loadRoomLocks();
  const existing = locks[id];
  if (existing && existing.owner !== owner) {
    return false;
  }
  locks[id] = {
    owner: owner,
    ts: now(),
  };
  saveRoomLocks(locks);
  return true;
}

export function hasRoomLock(roomId: string, ownerId: string): boolean {
  const id = String(roomId || "");
  const owner = String(ownerId || "");
  if (!id || !owner) {
    return false;
  }
  const locks = loadRoomLocks();
  const existing = locks[id];
  if (!existing) {
    return false;
  }
  return existing.owner === owner;
}

export function releaseRoomId(roomId: string, ownerId?: string): void {
  const id = String(roomId || "");
  if (!id) {
    return;
  }
  const owner = String(ownerId || "");
  const locks = loadRoomLocks();
  const existing = locks[id];
  if (!existing) {
    return;
  }
  if (owner && existing.owner !== owner) {
    return;
  }
  delete locks[id];
  saveRoomLocks(locks);
}

export function getParticipantCount(roomId: string): number {
  const room = getStore()[roomId];
  if (!room) {
    cloudPullRoom(roomId);
    return 0;
  }
  cloudPullRoom(roomId);
  return Object.keys(room.participants).length;
}

export function verifyRoomPassword(roomId: string, password: string): { ok: boolean; message: string } {
  const room = getStore()[roomId];
  cloudPullRoom(roomId);
  if (!room) {
    return { ok: false, message: "房间不存在，请确认是否有误，或确认其他裁判已经完成团队设置" };
  }
  if (String(room.password || "") !== String(password || "")) {
    return { ok: false, message: "房间密码错误" };
  }
  return { ok: true, message: "ok" };
}

export function heartbeatRoom(roomId: string, clientId: string): number {
  const store = getStore();
  const room = store[roomId];
  if (!room || !clientId) {
    return 0;
  }
  room.participants[clientId] = now();
  room.updatedAt = now();
  cleanupRoomParticipants(room);
  if (ensureOperatorByParticipants(room, clientId)) {
    room.updatedAt = now();
  }
  store[roomId] = room;
  saveStore(store);
  return Object.keys(room.participants).length;
}

export function leaveRoom(roomId: string, clientId: string): void {
  const store = getStore();
  const room = store[roomId];
  if (!room || !clientId) {
    return;
  }
  if (room.participants[clientId]) {
    delete room.participants[clientId];
  }
  if (
    room.collaboration &&
    room.collaboration.presenceSeenAtMap &&
    room.collaboration.presenceSeenAtMap[clientId]
  ) {
    delete room.collaboration.presenceSeenAtMap[clientId];
  }
  room.updatedAt = now();
  store[roomId] = room;
  saveStore(store);
}

export function updateRoom(
  roomId: string,
  updater: (room: RoomState) => RoomState
): RoomState | null {
  const store = getStore();
  const current = store[roomId];
  if (!current) {
    return null;
  }
  const next = normalizeRoom(roomId, updater(cloneRoom(current)));
  next.syncVersion = Math.max(1, Number((current as any).syncVersion) || 1) + 1;
  next.updatedAt = now();
  store[roomId] = next;
  saveStore(store);
  cloudUpsertRoom(next);
  return cloneRoom(next);
}

export async function isRoomIdBlockedAsync(roomId: string): Promise<boolean> {
  try {
    const res = await callRoomApi<{ blocked: boolean }>("isRoomIdBlocked", { roomId: roomId });
    return !!(res && res.blocked);
  } catch (e) {
    return isRoomIdBlocked(roomId);
  }
}

export async function reserveRoomIdAsync(roomId: string, ownerId: string): Promise<boolean> {
  const localReserved = reserveRoomId(roomId, ownerId);
  try {
    const res = await callRoomApi<{ ok: boolean; reserved: boolean }>("reserveRoomId", {
      roomId: roomId,
      ownerId: ownerId,
    });
    const reserved = !!(res && (res as any).reserved);
    if (!reserved && localReserved) {
      releaseRoomId(roomId, ownerId);
    }
    return reserved;
  } catch (e) {
    return localReserved;
  }
}

export async function hasRoomLockAsync(roomId: string, ownerId: string): Promise<boolean> {
  const localLocked = hasRoomLock(roomId, ownerId);
  try {
    const res = await callRoomApi<{ locked: boolean }>("hasRoomLock", {
      roomId: roomId,
      ownerId: ownerId,
    });
    return !!(res && (res as any).locked);
  } catch (e) {
    return localLocked;
  }
}

export async function cleanupExpiredRoomsAsync(force = false): Promise<void> {
  if (!canUseCloud()) {
    return;
  }
  try {
    await callRoomApi("cleanupExpiredRooms", { force: !!force });
  } catch (e) {}
}

export async function releaseRoomIdAsync(roomId: string, ownerId?: string): Promise<void> {
  releaseRoomId(roomId, ownerId);
  try {
    await callRoomApi("releaseRoomId", { roomId: roomId, ownerId: String(ownerId || "") });
  } catch (e) {}
}

export async function createRoomAsync(input: {
  roomId?: string;
  password: string;
  settings: MatchSettings;
  teamAName: string;
  teamBName: string;
  teamACaptainNo?: string;
  teamBCaptainNo?: string;
  teamAColor?: string;
  teamBColor?: string;
  creatorClientId?: string;
  teamAPlayers: PlayerSlot[];
  teamBPlayers: PlayerSlot[];
}): Promise<RoomState | null> {
  const roomId = String(input.roomId || randomRoomId());
  const room = createDefaultRoom(roomId);
  room.password = String(input.password || "");
  room.settings = {
    sets: Number(input.settings.sets) || 5,
    wins: Number(input.settings.wins) || 3,
    maxScore: Number(input.settings.maxScore) || 25,
    tiebreakScore: Number(input.settings.tiebreakScore) || 15,
  };
  if (input.settings.captainEnabled === false) {
    room.settings.captainEnabled = false;
  }
  room.teamA = {
    name: input.teamAName || "甲",
    captainNo: String(input.teamACaptainNo || ""),
    color: normalizeHexColor(input.teamAColor, DEFAULT_TEAM_A_COLOR),
    players: normalizePlayers(input.teamAPlayers),
  };
  room.teamB = {
    name: input.teamBName || "乙",
    captainNo: String(input.teamBCaptainNo || ""),
    color: normalizeHexColor(input.teamBColor, DEFAULT_TEAM_B_COLOR),
    players: normalizePlayers(input.teamBPlayers),
  };
  room.match.teamACurrentCaptainNo = room.teamA.captainNo;
  room.match.teamBCurrentCaptainNo = room.teamB.captainNo;
  if (room.teamA.color === room.teamB.color) {
    room.teamB.color = DEFAULT_TEAM_B_COLOR;
    if (room.teamA.color === room.teamB.color) {
      room.teamB.color = TEAM_COLOR_OPTIONS[2].value;
    }
  }
  const creatorClientId = String(input.creatorClientId || "").trim();
  if (creatorClientId) {
    room.collaboration.ownerClientId = creatorClientId;
    room.collaboration.operatorClientId = creatorClientId;
    room.collaboration.operatorUpdatedAt = now();
  }
  try {
    const res = await callRoomApi<{ room?: any }>("createRoom", { room: room });
    if (res && res.room) {
      return cloneRoom(saveCloudRoomRaw(res.room));
    }
  } catch (e) {}
  return null;
}

export async function getRoomAsync(roomId: string): Promise<RoomState | null> {
  const local = getRoom(roomId);
  if (local) {
    // 本地命中时也保持低频向云端拉取，避免参与人数等协同信息长期停留在旧快照。
    cloudPullRoom(roomId);
    return local;
  }
  try {
    const res = await callRoomApi<{ room?: any }>("getRoom", { roomId: roomId });
    if (res && res.room) {
      return cloneRoom(saveCloudRoomRaw(res.room));
    }
  } catch (e) {}
  return getRoom(roomId);
}

export async function verifyRoomPasswordAsync(
  roomId: string,
  password: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await callRoomApi<{ ok: boolean; message: string; room?: any }>("verifyRoomPassword", {
      roomId: roomId,
      password: password,
    });
    if (res && (res as any).room) {
      saveCloudRoomRaw((res as any).room);
    }
    return {
      ok: !!(res && res.ok),
      message: String((res && res.message) || (res && res.ok ? "ok" : "校验失败")),
    };
  } catch (e) {
    const msg = String((e as any)?.message || "");
    if (msg) {
      return { ok: false, message: msg };
    }
    return verifyRoomPassword(roomId, password);
  }
}

export async function heartbeatRoomAsync(roomId: string, clientId: string): Promise<number> {
  if (canUseCloud()) {
    try {
      const res = await callRoomApi<{ room?: any; participantCount?: number }>("heartbeatRoom", {
        roomId: roomId,
        clientId: clientId,
      });
      if (res && res.room) {
        const room = saveCloudRoomRaw(res.room);
        return Math.max(0, Object.keys(room.participants || {}).length);
      }
      if (res && typeof res.participantCount === "number") {
        return Math.max(0, Number(res.participantCount) || 0);
      }
    } catch (e) {}
  }
  return heartbeatRoom(roomId, clientId);
}

export async function leaveRoomAsync(roomId: string, clientId: string): Promise<void> {
  leaveRoom(roomId, clientId);
  void callRoomApi<{ room?: any }>("leaveRoom", { roomId: roomId, clientId: clientId })
    .then((res) => {
      if (res && res.room) {
        saveCloudRoomRaw(res.room);
      }
    })
    .catch(() => {});
}

export async function updateRoomAsync(
  roomId: string,
  updater: (room: RoomState) => RoomState,
  options?: { awaitCloud?: boolean; requireCloudAck?: boolean }
): Promise<RoomState | null> {
  let baseRoom = getRoom(roomId);
  try {
    if (!baseRoom) {
      const remote = await getRoomAsync(roomId);
      if (remote) {
        baseRoom = remote;
      }
    }
  } catch (e) {}
  if (!baseRoom) {
    return null;
  }
  const next = normalizeRoom(roomId, updater(cloneRoom(baseRoom)));
  const baseComparable = cloneRoom(baseRoom);
  const nextComparable = cloneRoom(next);
  (baseComparable as any).updatedAt = 0;
  (baseComparable as any).syncVersion = 0;
  (nextComparable as any).updatedAt = 0;
  (nextComparable as any).syncVersion = 0;
  if (JSON.stringify(baseComparable) === JSON.stringify(nextComparable)) {
    return cloneRoom(baseRoom);
  }
  next.syncVersion = Math.max(1, Number((baseRoom as any).syncVersion) || 1) + 1;
  next.updatedAt = now();
  saveRoomToStore(next);

  const awaitCloud = !!(options && options.awaitCloud);
  const requireCloudAck = !!(options && options.requireCloudAck);

  if (awaitCloud && canUseCloud()) {
    try {
      const res = await callRoomApi<{ room?: any }>("upsertRoom", { room: next });
      if (res && res.room) {
        const remoteRoom = normalizeRoom(roomId, res.room);
        const savedRoom = saveCloudRoomRaw(res.room);
        if (requireCloudAck && String(remoteRoom.status || "") !== String(next.status || "")) {
          return null;
        }
        return cloneRoom(savedRoom);
      }
      if (requireCloudAck) {
        return null;
      }
    } catch (e) {}
    if (requireCloudAck) {
      return null;
    }
  }

  void callRoomApi<{ room?: any }>("upsertRoom", { room: next })
    .then((res) => {
      if (res && res.room) {
        saveCloudRoomRaw(res.room);
      }
    })
    .catch(() => {});
  return cloneRoom(next);
}

export async function getParticipantCountAsync(roomId: string): Promise<number> {
  const room = await getRoomAsync(roomId);
  if (!room) {
    return 0;
  }
  return Object.keys(room.participants || {}).length;
}

export async function forcePullRoomAsync(roomId: string): Promise<RoomState | null> {
  try {
    const res = await callRoomApi<{ room?: any }>("getRoom", { roomId: roomId });
    if (res && res.room) {
      return cloneRoom(saveCloudRoomRaw(res.room));
    }
  } catch (e) {}
  return getRoom(roomId);
}

export async function getRoomExistenceFromServerAsync(
  roomId: string
): Promise<"exists" | "missing" | "unknown"> {
  if (!canUseCloud()) {
    return getRoom(roomId) ? "exists" : "unknown";
  }
  try {
    const res = await callRoomApi<{ room?: any }>("getRoom", { roomId: roomId });
    if (res && res.room) {
      saveCloudRoomRaw(res.room);
      return "exists";
    }
    return "missing";
  } catch (e) {
    return "unknown";
  }
}

export type RoomControlRole = "operator" | "observer";

function normalizeClientId(input: unknown): string {
  return String(input || "").trim();
}

export function getRoomOwnerClientId(room: RoomState | null | undefined): string {
  return normalizeClientId(room && room.collaboration && room.collaboration.ownerClientId);
}

export function getRoomOperatorClientId(room: RoomState | null | undefined): string {
  const direct = normalizeClientId(room && room.collaboration && room.collaboration.operatorClientId);
  if (direct) {
    return direct;
  }
  return getRoomOwnerClientId(room);
}

export function isRoomOperator(room: RoomState | null | undefined, clientId: string): boolean {
  const cid = normalizeClientId(clientId);
  if (!room || !cid) {
    return false;
  }
  const operatorClientId = getRoomOperatorClientId(room);
  if (operatorClientId) {
    return operatorClientId === cid;
  }
  const ownerClientId = getRoomOwnerClientId(room);
  if (ownerClientId) {
    return ownerClientId === cid;
  }
  // Legacy rooms created before control-role fields existed.
  return true;
}

export function getRoomControlRole(room: RoomState | null | undefined, clientId: string): RoomControlRole {
  return isRoomOperator(room, clientId) ? "operator" : "observer";
}

export function getClientViewSide(room: RoomState | null | undefined, clientId: string): "A" | "B" | "" {
  const cid = normalizeClientId(clientId);
  if (!room || !cid) {
    return "";
  }
  const map = (room.collaboration && room.collaboration.observerSideMap) || {};
  const side = map[cid];
  return side === "B" ? "B" : side === "A" ? "A" : "";
}

export async function setClientViewSideAsync(
  roomId: string,
  clientId: string,
  side: "A" | "B"
): Promise<RoomState | null> {
  const cid = normalizeClientId(clientId);
  if (!cid || !roomId) {
    return getRoom(roomId);
  }
  const targetSide: "A" | "B" = side === "B" ? "B" : "A";
  return updateRoomAsync(
    roomId,
    (room) => {
      if (!room.collaboration || typeof room.collaboration !== "object") {
        (room as any).collaboration = {
          ownerClientId: "",
          operatorClientId: "",
          operatorUpdatedAt: 0,
          observerSideMap: {},
        };
      }
      if (!room.collaboration.observerSideMap || typeof room.collaboration.observerSideMap !== "object") {
        room.collaboration.observerSideMap = {};
      }
      room.collaboration.observerSideMap[cid] = targetSide;
      return room;
    },
    { awaitCloud: true }
  );
}

export async function transferRoomOperatorAsync(
  roomId: string,
  byClientId: string,
  nextOperatorClientId: string
): Promise<RoomState | null> {
  const actor = normalizeClientId(byClientId);
  const next = normalizeClientId(nextOperatorClientId);
  if (!roomId || !actor || !next) {
    return getRoom(roomId);
  }
  return updateRoomAsync(
    roomId,
    (room) => {
      const participants = (room && room.participants) || {};
      // 业务需求：在线裁判均可发起“接管”操作。
      const canTransfer = !!participants[actor];
      if (!canTransfer) {
        return room;
      }
      const operatorClientId = getRoomOperatorClientId(room);
      room.collaboration.operatorClientId = next;
      if (!room.collaboration.ownerClientId) {
        room.collaboration.ownerClientId = operatorClientId || next;
      }
      room.collaboration.operatorUpdatedAt = now();
      room.collaboration.autoClaimBy = "";
      room.collaboration.autoClaimAt = 0;
      room.collaboration.autoClaimPrevOperatorId = "";
      const setEndState = ((room.match as any).setEndState || null) as
        | { active?: boolean; phase?: string; ownerClientId?: string }
        | null;
      if (setEndState && !!setEndState.active && String(setEndState.phase || "") === "lineup") {
        // 接管局间配置时，直接把配置控制权切给接管者，并清空上一个操作者的临时草稿。
        setEndState.ownerClientId = next;
        delete (room.match as any).lineupAdjustDraft;
      }
      return room;
    },
    { awaitCloud: true }
  );
}

export function subscribeRoomWatch(roomId: string, listener: (room: RoomState | null) => void): () => void {
  const id = String(roomId || "");
  if (!id || typeof listener !== "function") {
    return () => {};
  }
  let bucket = roomWatchMap[id];
  if (!bucket) {
    bucket = {
      listeners: new Set(),
      watcher: null,
      restarting: false,
    };
    roomWatchMap[id] = bucket;
  }
  bucket.listeners.add(listener);
  startRoomWatchInternal(id);

  const local = getStore()[id];
  if (local) {
    setTimeout(() => {
      try {
        listener(cloneRoom(local));
      } catch (e) {}
    }, 0);
  }

  return () => {
    const current = roomWatchMap[id];
    if (!current) {
      return;
    }
    current.listeners.delete(listener);
    if (current.listeners.size <= 0) {
      stopRoomWatchInternal(id);
      delete roomWatchMap[id];
    }
  };
}
