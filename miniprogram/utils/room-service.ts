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
}

export interface TeamState {
  name: string;
  captainNo: string;
  color: string;
  players: PlayerSlot[];
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
  aSetWins: number;
  bSetWins: number;
  isFinished: boolean;
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
    isFinished?: boolean;
  }>;
  logs: Array<{
    id: string;
    ts: number;
    action: string;
    team: "A" | "B" | "";
    note: string;
  }>;
}

export interface RoomState {
  roomId: string;
  password: string;
  status: "setup" | "match" | "result";
  syncVersion: number;
  expiresAt: number;
  matchStartedAt: number;
  extraTimeGranted: boolean;
  resultLockedAt: number;
  resultExpireAt: number;
  settings: MatchSettings;
  teamA: TeamState;
  teamB: TeamState;
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
const PARTICIPANT_TTL_MS = 20 * 1000;
const ROOM_LOCK_TTL_MS = 10 * 60 * 1000;
const CLOUD_PULL_INTERVAL_MS = 5000;
const ROOM_API_FUNCTION = "roomApi";
const POSITIONS: Position[] = ["I", "II", "III", "IV", "V", "VI", "L1", "L2"];
const DEFAULT_TEAM_A_COLOR = "#6C63BE";
const DEFAULT_TEAM_B_COLOR = "#66B97A";
export const TEAM_COLOR_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "浅灰", value: "#9FA8B4" },
  { label: "深灰", value: "#4F5561" },
  { label: "紫色", value: "#6C63BE" },
  { label: "深蓝", value: "#3E6FB6" },
  { label: "浅蓝", value: "#6FAEDC" },
  { label: "青色", value: "#3FA89C" },
  { label: "浅绿", value: "#66B97A" },
  { label: "深绿", value: "#2F6F4A" },
  { label: "黄色", value: "#E0BC45" },
  { label: "粉色", value: "#E5A7BE" },
  { label: "橙色", value: "#E28A47" },
  { label: "红色", value: "#C95A5A" }
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

function callRoomApi<T = any>(action: string, payload: Record<string, any>): Promise<T> {
  if (!canUseCloud()) {
    return Promise.reject(new Error("cloud-not-ready"));
  }
  return new Promise<T>((resolve, reject) => {
    (wx as any).cloud
      .callFunction({
        name: ROOM_API_FUNCTION,
        data: {
          action: action,
          ...payload,
        },
      })
      .then((res: any) => {
        const result = (res && res.result) || {};
        if (result && result.ok === false) {
          reject(new Error(String(result.message || "cloud-api-failed")));
          return;
        }
        resolve(result as T);
      })
      .catch(reject);
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
      aSetWins: 0,
      bSetWins: 0,
      isFinished: false,
      undoStack: [],
      logs: [],
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

function normalizeRoom(roomId: string, raw: unknown): RoomState {
  const input = (raw || {}) as Partial<RoomState>;
  const base = createDefaultRoom(roomId);

  base.password = String((input as any).password || "");
  base.status = input.status === "result" ? "result" : input.status === "match" ? "match" : "setup";
  base.syncVersion = Math.max(1, Number((input as any).syncVersion) || 1);
  base.expiresAt = Math.max(0, Number((input as any).expiresAt) || 0);
  base.matchStartedAt = Math.max(0, Number((input as any).matchStartedAt) || 0);
  base.extraTimeGranted = !!(input as any).extraTimeGranted;
  base.resultLockedAt = Math.max(0, Number((input as any).resultLockedAt) || 0);
  base.resultExpireAt = Math.max(0, Number((input as any).resultExpireAt) || 0);
  base.settings.sets = Number(input.settings && input.settings.sets) || 5;
  base.settings.wins = Number(input.settings && input.settings.wins) || 3;
  base.settings.maxScore = Number(input.settings && input.settings.maxScore) || 25;
  base.settings.tiebreakScore = Number(input.settings && input.settings.tiebreakScore) || 15;

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
  base.match.aSetWins = Math.max(0, Number(input.match && (input.match as any).aSetWins) || 0);
  base.match.bSetWins = Math.max(0, Number(input.match && (input.match as any).bSetWins) || 0);
  base.match.isFinished = !!(input.match && (input.match as any).isFinished);

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
        isFinished: !!item.isFinished,
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
      };
    });
  } else {
    base.match.logs = [];
  }

  base.participants = normalizeParticipants((input as any).participants);
  base.createdAt = Number(input.createdAt) || base.createdAt;
  base.updatedAt = Number(input.updatedAt) || base.updatedAt;

  if (!base.expiresAt) {
    base.expiresAt = base.createdAt + ROOM_TTL_MS;
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

    if (!room.matchStartedAt && room.expiresAt > 0 && ts > room.expiresAt) {
      delete store[roomId];
      changed = true;
      return;
    }

    if (
      room.matchStartedAt > 0 &&
      room.expiresAt > 0 &&
      ts > room.expiresAt &&
      !room.extraTimeGranted &&
      room.status === "match" &&
      !room.match.isFinished
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
            const store = getStore();
            if (store[roomId]) {
              delete store[roomId];
              saveStore(store);
            }
            emitRoomWatch(roomId, null);
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
        saveCloudRoomRaw(res.room);
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
    room.updatedAt = now();
    store[roomId] = room;
    saveStore(store);
  }
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
    return local;
  }
  try {
    const res = await Promise.race([
      callRoomApi<{ room?: any }>("getRoom", { roomId: roomId }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
    ]);
    if (res && res.room) {
      return cloneRoom(saveCloudRoomRaw(res.room));
    }
  } catch (e) {}
  return local;
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
  const local = heartbeatRoom(roomId, clientId);
  void callRoomApi<{ room?: any; participantCount?: number }>("heartbeatRoom", {
    roomId: roomId,
    clientId: clientId,
  })
    .then((res) => {
      if (res && res.room) {
        saveCloudRoomRaw(res.room);
      }
    })
    .catch(() => {});
  return local;
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
  updater: (room: RoomState) => RoomState
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
  next.syncVersion = Math.max(1, Number((baseRoom as any).syncVersion) || 1) + 1;
  next.updatedAt = now();
  saveRoomToStore(next);

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
