const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const roomsCol = db.collection("rooms");
const roomArchivesCol = db.collection("rooms_expired_archive");
const locksCol = db.collection("room_locks");
const _ = db.command;

const ROOM_LOCK_TTL_MS = 3 * 60 * 60 * 1000;
const PARTICIPANT_TTL_MS = 40 * 1000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const ROOM_EXTRA_TTL_MS = 3 * 60 * 60 * 1000;
const RESULT_KEEP_MS = 24 * 60 * 60 * 1000;
const EXPIRED_ROOM_RETAIN_MS = 3 * 24 * 60 * 60 * 1000;
const AUTHORITY_PRESENCE_TTL_MS = 5 * 60 * 1000;
const AUTO_OPERATOR_CLAIM_PROBATION_MS = 10 * 60 * 1000;
const GLOBAL_CLEANUP_COOLDOWN_MS = 60 * 1000;
const GLOBAL_CLEANUP_LOCK_MS = 15 * 1000;
const GLOBAL_CLEANUP_META_ID = "__cleanup_meta__";
const GLOBAL_CLEANUP_BATCH = 100;
const GLOBAL_CLEANUP_MAX_PASSES = 50;

function now() {
  return Date.now();
}

function err(message) {
  return { ok: false, message: String(message || "error") };
}

function stripDbReservedFields(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripDbReservedFields(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out = {};
  Object.keys(value).forEach((key) => {
    if (key === "_id") {
      return;
    }
    out[key] = stripDbReservedFields(value[key]);
  });
  return out;
}

function asDbData(value) {
  return stripDbReservedFields(value || {});
}

function createLogId() {
  return String(now()) + "-" + String(Math.floor(Math.random() * 100000));
}

function isFinishedSmallScore(scoreA, scoreB) {
  const a = Math.max(0, Number(scoreA) || 0);
  const b = Math.max(0, Number(scoreB) || 0);
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return high >= 15 && high - low >= 2;
}

function appendResultLockedLog(room, meta, ts) {
  if (!room.match || typeof room.match !== "object") {
    room.match = {};
  }
  if (!Array.isArray(room.match.logs)) {
    room.match.logs = [];
  }
  const opId = String((meta && meta.opId) || "");
  if (
    opId &&
    room.match.logs.some((item) => String(item && item.action) === "result_locked" && String(item && item.opId) === opId)
  ) {
    return;
  }
  const aSetWins = Math.max(0, Number((meta && meta.aSetWins) || room.match.aSetWins || 0));
  const bSetWins = Math.max(0, Number((meta && meta.bSetWins) || room.match.bSetWins || 0));
  const winnerTeam =
    meta && meta.winnerTeam === "A" ? "A" : meta && meta.winnerTeam === "B" ? "B" : aSetWins > bSetWins ? "A" : "B";
  const fallbackName =
    winnerTeam === "A"
      ? String((room.teamA && room.teamA.name) || "甲")
      : String((room.teamB && room.teamB.name) || "乙");
  const winnerName = String((meta && meta.winnerName) || fallbackName || "");
  room.match.logs.push({
    id: createLogId(),
    ts: Math.max(0, Number((meta && meta.logTs) || ts)) || ts,
    action: "result_locked",
    team: winnerTeam,
    note: "比赛结束 结果确认：" + winnerName + " 以 " + String(aSetWins) + ":" + String(bSetWins) + " 获胜",
    setNo: Math.max(1, Number((meta && meta.setNo) || room.match.setNo || 1)),
    opId: opId,
    revertedOpId: "",
  });
  if (room.match.logs.length > 300) {
    room.match.logs = room.match.logs.slice(room.match.logs.length - 300);
  }
  if (opId) {
    room.match.lastActionOpId = opId;
  }
}

async function archiveExpiredRoom(roomId, room, expiredAt, reason) {
  const id = String(roomId || "");
  if (!id || !room || typeof room !== "object") {
    return;
  }
  const ts = now();
  const expiredTs = Math.max(0, Number(expiredAt || 0)) || ts;
  const archiveId = id + "_" + String(expiredTs);
  try {
    await roomArchivesCol.doc(archiveId).set({
      data: asDbData({
        roomId: id,
        retainState: "expired_wait_delete",
        expiredAt: expiredTs,
        deleteAfterAt: expiredTs + EXPIRED_ROOM_RETAIN_MS,
        archivedAt: ts,
        reason: String(reason || "expired"),
        sourceStatus: String(room.status || ""),
        sourceExpiresAt: Math.max(0, Number(room.expiresAt || 0)),
        sourceResultExpireAt: Math.max(0, Number(room.resultExpireAt || 0)),
        room: JSON.parse(JSON.stringify(room)),
      }),
    });
  } catch (e) {}
}

async function removeRoomWithRetention(roomId, room, expiredAt, reason) {
  await archiveExpiredRoom(roomId, room, expiredAt, reason);
  try {
    await roomsCol.doc(roomId).remove();
  } catch (e) {}
}

async function getRoomDoc(roomId) {
  try {
    const res = await roomsCol.doc(roomId).get();
    if (!res || !res.data) {
      return null;
    }
    const room = res.data;
    const ts = now();
    let changed = false;
    ensureCollaboration(room);

    if (!room.expiresAt) {
      room.expiresAt = Number(room.createdAt || ts) + ROOM_TTL_MS;
      changed = true;
    }
    room.matchEnteredAt = Math.max(0, Number(room.matchEnteredAt || 0));
    room.matchStartedAt = Math.max(0, Number(room.matchStartedAt || 0));
    room.extraTimeGranted = !!room.extraTimeGranted;
    if (room.status === "match" && room.matchEnteredAt <= 0) {
      room.matchEnteredAt = Math.max(room.matchStartedAt || 0, Number(room.updatedAt || 0), Number(room.createdAt || 0), ts);
      changed = true;
    }

    if (room.status === "result") {
      if (!room.resultLockedAt) {
        room.resultLockedAt = Math.max(Number(room.updatedAt || 0), Number(room.createdAt || 0), ts);
        changed = true;
      }
      if (!room.resultExpireAt) {
        room.resultExpireAt = room.resultLockedAt + RESULT_KEEP_MS;
        changed = true;
      }
      if (ts > Number(room.resultExpireAt || 0)) {
        await removeRoomWithRetention(
          roomId,
          room,
          Number(room.resultExpireAt || room.expiresAt || ts),
          "result_expired"
        );
        return null;
      }
      if (changed) {
        room.updatedAt = ts;
        await roomsCol.doc(roomId).set({ data: asDbData(room) });
      }
      return room;
    }

    const hasStartedMatch = room.matchStartedAt > 0;
    if (!hasStartedMatch && ts > Number(room.expiresAt || 0)) {
      await removeRoomWithRetention(
        roomId,
        room,
        Number(room.expiresAt || ts),
        "match_not_started_expired"
      );
      return null;
    }

    if (
      hasStartedMatch &&
      ts > Number(room.expiresAt || 0) &&
      !room.extraTimeGranted
    ) {
      room.expiresAt = Number(room.expiresAt || ts) + ROOM_EXTRA_TTL_MS;
      room.extraTimeGranted = true;
      changed = true;
    }

    if (ts > Number(room.expiresAt || 0)) {
      await removeRoomWithRetention(
        roomId,
        room,
        Number(room.expiresAt || ts),
        hasStartedMatch ? "match_started_expired" : "match_expired"
      );
      return null;
    }

    if (changed) {
      room.updatedAt = ts;
      await roomsCol.doc(roomId).set({ data: asDbData(room) });
    }
    return room;
  } catch (e) {
    return null;
  }
}

async function runGlobalExpiredRoomCleanup() {
  let deleted = 0;
  for (let pass = 0; pass < GLOBAL_CLEANUP_MAX_PASSES; pass += 1) {
    let ids = [];
    try {
      const res = await roomsCol
        .where({
          expiresAt: _.lte(now()),
        })
        .field({
          _id: true,
        })
        .limit(GLOBAL_CLEANUP_BATCH)
        .get();
      ids = (res && Array.isArray(res.data) ? res.data : [])
        .map((item) => String((item && item._id) || ""))
        .filter(Boolean);
    } catch (e) {
      ids = [];
    }
    if (!ids.length) {
      break;
    }
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const room = await getRoomDoc(id);
      if (!room) {
        deleted += 1;
      }
    }
  }
  return deleted;
}

async function runExpiredArchiveCleanup() {
  let deleted = 0;
  for (let pass = 0; pass < GLOBAL_CLEANUP_MAX_PASSES; pass += 1) {
    let ids = [];
    try {
      const res = await roomArchivesCol
        .where({
          deleteAfterAt: _.lte(now()),
        })
        .field({
          _id: true,
        })
        .limit(GLOBAL_CLEANUP_BATCH)
        .get();
      ids = (res && Array.isArray(res.data) ? res.data : [])
        .map((item) => String((item && item._id) || ""))
        .filter(Boolean);
    } catch (e) {
      ids = [];
    }
    if (!ids.length) {
      break;
    }
    for (let i = 0; i < ids.length; i += 1) {
      try {
        await roomArchivesCol.doc(ids[i]).remove();
        deleted += 1;
      } catch (e) {}
    }
  }
  return deleted;
}

async function maybeRunGlobalCleanup(force) {
  const ts = now();
  const shouldForce = !!force;
  let shouldRun = shouldForce;
  if (!shouldRun) {
    try {
      const metaRes = await locksCol.doc(GLOBAL_CLEANUP_META_ID).get();
      const meta = metaRes && metaRes.data ? metaRes.data : null;
      const lastRunAt = Number((meta && meta.lastRunAt) || 0);
      const runningUntil = Number((meta && meta.runningUntil) || 0);
      if (runningUntil > ts) {
        return { ran: false, deleted: 0 };
      }
      shouldRun = ts - lastRunAt >= GLOBAL_CLEANUP_COOLDOWN_MS;
    } catch (e) {
      shouldRun = true;
    }
  }
  if (!shouldRun) {
    return { ran: false, deleted: 0 };
  }

  try {
    await locksCol.doc(GLOBAL_CLEANUP_META_ID).set({
      data: asDbData({
        lastRunAt: ts,
        runningUntil: ts + GLOBAL_CLEANUP_LOCK_MS,
        updatedAt: ts,
      }),
    });
  } catch (e) {}

  let deleted = 0;
  let archiveDeleted = 0;
  try {
    deleted = await runGlobalExpiredRoomCleanup();
    archiveDeleted = await runExpiredArchiveCleanup();
  } finally {
    try {
      await locksCol.doc(GLOBAL_CLEANUP_META_ID).set({
        data: asDbData({
          lastRunAt: ts,
          runningUntil: 0,
          lastDeleted: deleted,
          lastArchiveDeleted: archiveDeleted,
          updatedAt: now(),
        }),
      });
    } catch (e) {}
  }
  return { ran: true, deleted: deleted, archiveDeleted: archiveDeleted };
}

async function putRoomDoc(room) {
  const roomId = String(room && room.roomId ? room.roomId : "");
  if (!roomId) {
    throw new Error("roomId required");
  }
  const ts = now();
  const normalized = room && typeof room === "object" ? { ...room } : {};
  let existing = null;
  try {
    const existingRes = await roomsCol.doc(roomId).get();
    if (existingRes && existingRes.data) {
      existing = existingRes.data;
    }
  } catch (e) {}

  if (existing) {
    const existingStatus = String(existing.status || "");
    const incomingStatus = String(normalized.status || "");
    // 防止高版本旧快照把房间状态回滚（例如 result -> match/create-room）。
    if (existingStatus === "result" && incomingStatus !== "result") {
      return existing;
    }
    // 防止 match 被旧草稿回滚到 create-room。
    if (existingStatus === "match" && incomingStatus === "create-room") {
      return existing;
    }
    const existingVersion = Math.max(1, Number(existing.syncVersion || 1));
    const incomingVersion = Math.max(1, Number(normalized.syncVersion || 1));
    if (existingStatus !== "result" && incomingStatus === "result" && incomingVersion <= existingVersion) {
      normalized.syncVersion = existingVersion + 1;
    } else if (incomingVersion <= existingVersion) {
      return existing;
    }
  }
  if (!normalized.createdAt) {
    normalized.createdAt = ts;
  }
  if (!normalized.expiresAt) {
    normalized.expiresAt = Number(normalized.createdAt || ts) + ROOM_TTL_MS;
  }
  normalized.matchEnteredAt = Math.max(0, Number(normalized.matchEnteredAt || 0));
  normalized.matchStartedAt = Math.max(0, Number(normalized.matchStartedAt || 0));
  normalized.extraTimeGranted = !!normalized.extraTimeGranted;
  ensureCollaboration(normalized);
  if (normalized.status === "match" && normalized.matchEnteredAt <= 0) {
    normalized.matchEnteredAt = Math.max(
      normalized.matchStartedAt || 0,
      Number(normalized.updatedAt || 0),
      Number(normalized.createdAt || 0),
      ts
    );
  }
  if (normalized.status === "result") {
    const existingResultLockedAt =
      existing && String(existing.status || "") === "result"
        ? Math.max(0, Number(existing.resultLockedAt || 0))
        : 0;
    const existingResultExpireAt =
      existing && String(existing.status || "") === "result"
        ? Math.max(0, Number(existing.resultExpireAt || 0))
        : 0;
    if (existingResultLockedAt > Number(normalized.resultLockedAt || 0)) {
      normalized.resultLockedAt = existingResultLockedAt;
    }
    if (existingResultExpireAt > Number(normalized.resultExpireAt || 0)) {
      normalized.resultExpireAt = existingResultExpireAt;
    }
    if (!normalized.resultLockedAt) {
      normalized.resultLockedAt = ts;
    }
    if (!normalized.resultExpireAt) {
      normalized.resultExpireAt = Number(normalized.resultLockedAt || ts) + RESULT_KEEP_MS;
    }
    normalized.expiresAt = Math.max(
      Number(normalized.resultExpireAt || 0),
      Math.max(0, Number(normalized.expiresAt || 0)),
      Math.max(0, Number(existing && existing.expiresAt ? existing.expiresAt : 0)),
      ts
    );
  } else {
    normalized.resultLockedAt = 0;
    normalized.resultExpireAt = 0;
  }
  const mergedParticipants = {};
  const existingParticipants = cleanupParticipants(existing && existing.participants);
  const incomingParticipants = cleanupParticipants(normalized.participants);
  Object.keys(existingParticipants).forEach((clientId) => {
    mergedParticipants[clientId] = Number(existingParticipants[clientId] || 0);
  });
  Object.keys(incomingParticipants).forEach((clientId) => {
    const prev = Number(mergedParticipants[clientId] || 0);
    const next = Number(incomingParticipants[clientId] || 0);
    mergedParticipants[clientId] = Math.max(prev, next);
  });
  normalized.participants = mergedParticipants;

  const next = {
    ...normalized,
    roomId: roomId,
    updatedAt: ts,
  };
  await roomsCol.doc(roomId).set({ data: asDbData(next) });
  return next;
}

async function lockResultRoomDoc(input) {
  const roomId = String(input && input.roomId ? input.roomId : "");
  if (!roomId) {
    throw new Error("roomId required");
  }
  const ts = now();
  const existing = await getRoomDoc(roomId);
  if (!existing) {
    throw new Error("room not found");
  }
  const meta = input && input.result && typeof input.result === "object" ? input.result : {};
  const normalized = existing && typeof existing === "object" ? { ...existing } : {};
  normalized.status = "result";
  normalized.syncVersion = Math.max(1, Number(existing.syncVersion || 1)) + 1;
  normalized.resultLockedAt = Math.max(0, Number(meta.resultLockedAt || 0)) || ts;
  normalized.resultExpireAt =
    Math.max(0, Number(meta.resultExpireAt || 0)) || normalized.resultLockedAt + RESULT_KEEP_MS;
  normalized.expiresAt = Math.max(
    Number(normalized.resultExpireAt || 0),
    Math.max(0, Number(meta.expiresAt || 0)),
    Math.max(0, Number(existing.expiresAt || 0)),
    ts
  );
  if (!normalized.match || typeof normalized.match !== "object") {
    normalized.match = existing.match && typeof existing.match === "object" ? { ...existing.match } : {};
  }
  if (meta.aSetWins !== undefined) {
    normalized.match.aSetWins = Math.max(0, Number(meta.aSetWins) || 0);
  }
  if (meta.bSetWins !== undefined) {
    normalized.match.bSetWins = Math.max(0, Number(meta.bSetWins) || 0);
  }
  const endedSetNo = Math.max(1, Number(meta.setNo || normalized.match.setNo || 1));
  const smallScoreA = Math.max(0, Number(meta.smallScoreA || 0));
  const smallScoreB = Math.max(0, Number(meta.smallScoreB || 0));
  if (isFinishedSmallScore(smallScoreA, smallScoreB)) {
    if (!normalized.match.setSummaries || typeof normalized.match.setSummaries !== "object") {
      normalized.match.setSummaries = {};
    }
    const winnerTeam =
      meta && meta.winnerTeam === "A"
        ? "A"
        : meta && meta.winnerTeam === "B"
          ? "B"
          : smallScoreA > smallScoreB
            ? "A"
            : "B";
    normalized.match.setSummaries[String(endedSetNo)] = {
      setNo: endedSetNo,
      teamAName: String(meta.teamAName || (normalized.teamA && normalized.teamA.name) || "甲"),
      teamBName: String(meta.teamBName || (normalized.teamB && normalized.teamB.name) || "乙"),
      smallScoreA: smallScoreA,
      smallScoreB: smallScoreB,
      bigScoreA: Math.max(0, Number(normalized.match.aSetWins || 0)),
      bigScoreB: Math.max(0, Number(normalized.match.bSetWins || 0)),
      winnerName:
        String(meta.winnerName || "") ||
        (winnerTeam === "A"
          ? String((normalized.teamA && normalized.teamA.name) || "甲")
          : String((normalized.teamB && normalized.teamB.name) || "乙")),
      durationText: String(meta.durationText || ""),
      matchFinished: true,
    };
    normalized.match.aScore = smallScoreA;
    normalized.match.bScore = smallScoreB;
  }
  normalized.match.isFinished = true;
  appendResultLockedLog(normalized, meta, ts);
  normalized.match.undoStack = [];
  delete normalized.match.lineupAdjustDraft;
  delete normalized.match.setEndState;
  return putRoomDoc(normalized);
}

async function isRoomIdBlocked(roomId) {
  const id = String(roomId || "");
  if (!id) {
    return false;
  }
  const room = await getRoomDoc(id);
  if (room) {
    return true;
  }
  try {
    const lock = await locksCol.doc(id).get();
    if (!lock || !lock.data) {
      return false;
    }
    const ts = Number(lock.data.ts || 0);
    if (now() - ts > ROOM_LOCK_TTL_MS) {
      await locksCol.doc(id).remove();
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function reserveRoomId(roomId, ownerId) {
  const id = String(roomId || "");
  const owner = String(ownerId || "");
  if (!id || !owner) {
    return false;
  }
  if (await isRoomIdBlocked(id)) {
    try {
      const lock = await locksCol.doc(id).get();
      if (lock && lock.data && String(lock.data.ownerId || "") === owner) {
        await locksCol.doc(id).set({
          data: asDbData({
            ownerId: owner,
            ts: now(),
          }),
        });
        return true;
      }
    } catch (e) {}
    return false;
  }
  await locksCol.doc(id).set({
    data: asDbData({
      ownerId: owner,
      ts: now(),
    }),
  });
  return true;
}

async function hasRoomLock(roomId, ownerId) {
  const id = String(roomId || "");
  const owner = String(ownerId || "");
  if (!id || !owner) {
    return false;
  }
  try {
    const lock = await locksCol.doc(id).get();
    if (!lock || !lock.data) {
      return false;
    }
    const ts = Number(lock.data.ts || 0);
    if (now() - ts > ROOM_LOCK_TTL_MS) {
      await locksCol.doc(id).remove();
      return false;
    }
    return String(lock.data.ownerId || "") === owner;
  } catch (e) {
    return false;
  }
}

async function releaseRoomId(roomId, ownerId) {
  const id = String(roomId || "");
  const owner = String(ownerId || "");
  if (!id) {
    return;
  }
  try {
    if (owner) {
      const lock = await locksCol.doc(id).get();
      if (lock && lock.data && String(lock.data.ownerId || "") !== owner) {
        return;
      }
    }
    await locksCol.doc(id).remove();
  } catch (e) {}
}

function cleanupParticipants(participants) {
  const map = participants && typeof participants === "object" ? participants : {};
  const next = {};
  const ts = now();
  Object.keys(map).forEach((k) => {
    const t = Number(map[k] || 0);
    if (t > 0 && ts - t <= PARTICIPANT_TTL_MS) {
      next[k] = t;
    }
  });
  return next;
}

function ensureCollaboration(room) {
  if (!room || typeof room !== "object") {
    return;
  }
  if (!room.collaboration || typeof room.collaboration !== "object") {
    room.collaboration = {};
  }
  room.collaboration.ownerClientId = String(room.collaboration.ownerClientId || room.ownerClientId || "").trim();
  room.collaboration.operatorClientId = String(
    room.collaboration.operatorClientId || room.operatorClientId || room.collaboration.ownerClientId || ""
  ).trim();
  room.collaboration.operatorUpdatedAt = Math.max(0, Number(room.collaboration.operatorUpdatedAt || 0));
  room.collaboration.observerSideMap =
    room.collaboration.observerSideMap && typeof room.collaboration.observerSideMap === "object"
      ? room.collaboration.observerSideMap
      : {};
  room.collaboration.presenceSeenAtMap =
    room.collaboration.presenceSeenAtMap && typeof room.collaboration.presenceSeenAtMap === "object"
      ? room.collaboration.presenceSeenAtMap
      : {};
  room.collaboration.presenceUidMap =
    room.collaboration.presenceUidMap && typeof room.collaboration.presenceUidMap === "object"
      ? room.collaboration.presenceUidMap
      : {};
  room.collaboration.autoClaimBy = String(room.collaboration.autoClaimBy || "").trim();
  room.collaboration.autoClaimAt = Math.max(0, Number(room.collaboration.autoClaimAt || 0));
  room.collaboration.autoClaimPrevOperatorId = String(room.collaboration.autoClaimPrevOperatorId || "").trim();
  if (!room.collaboration.ownerClientId && room.collaboration.operatorClientId) {
    room.collaboration.ownerClientId = room.collaboration.operatorClientId;
  }
  if (!room.collaboration.operatorClientId && room.collaboration.ownerClientId) {
    room.collaboration.operatorClientId = room.collaboration.ownerClientId;
  }
  if (
    room.collaboration.autoClaimBy &&
    room.collaboration.autoClaimBy !== room.collaboration.operatorClientId
  ) {
    room.collaboration.autoClaimBy = "";
    room.collaboration.autoClaimAt = 0;
    room.collaboration.autoClaimPrevOperatorId = "";
  }
}

function getRoomOperatorClientId(room) {
  ensureCollaboration(room);
  const direct = String(room && room.collaboration && room.collaboration.operatorClientId ? room.collaboration.operatorClientId : "").trim();
  if (direct) {
    return direct;
  }
  return String(room && room.collaboration && room.collaboration.ownerClientId ? room.collaboration.ownerClientId : "").trim();
}

function getRoomOwnerClientId(room) {
  ensureCollaboration(room);
  return String(room && room.collaboration && room.collaboration.ownerClientId ? room.collaboration.ownerClientId : "").trim();
}

function clearAutoOperatorClaimMeta(room) {
  ensureCollaboration(room);
  let changed = false;
  if (String(room.collaboration.autoClaimBy || "")) {
    room.collaboration.autoClaimBy = "";
    changed = true;
  }
  if (Number(room.collaboration.autoClaimAt || 0) > 0) {
    room.collaboration.autoClaimAt = 0;
    changed = true;
  }
  if (String(room.collaboration.autoClaimPrevOperatorId || "")) {
    room.collaboration.autoClaimPrevOperatorId = "";
    changed = true;
  }
  return changed;
}

function ensureOperatorByParticipants(room, clientId, participants, ts) {
  const cid = String(clientId || "").trim();
  if (!cid) {
    return false;
  }
  ensureCollaboration(room);
  const activeMap = participants && typeof participants === "object" ? participants : {};
  const seenMap = room.collaboration.presenceSeenAtMap || {};
  let changed = false;
  Object.keys(seenMap).forEach((id) => {
    if (!activeMap[id] || ts - Number(seenMap[id] || 0) > AUTHORITY_PRESENCE_TTL_MS) {
      delete seenMap[id];
      changed = true;
    }
  });
  if (Number(seenMap[cid] || 0) !== ts) {
    seenMap[cid] = ts;
    changed = true;
  }
  room.collaboration.presenceSeenAtMap = seenMap;
  const currentOperator = getRoomOperatorClientId(room);
  const currentOwner = getRoomOwnerClientId(room);
  // 角色切换必须由显式“接管”触发。心跳仅维护 presence，不做自动抢权。
  if (!currentOperator) {
    const fallback = currentOwner || cid;
    room.collaboration.operatorClientId = fallback;
    room.collaboration.operatorUpdatedAt = ts;
    changed = true;
  }
  if (!room.collaboration.ownerClientId && (currentOwner || currentOperator || cid)) {
    room.collaboration.ownerClientId = currentOwner || currentOperator || cid;
    changed = true;
  }
  changed = clearAutoOperatorClaimMeta(room) || changed;
  return changed;
}

function dedupeParticipantsByUid(room, participants, clientId, uid, ts) {
  const cid = String(clientId || "").trim();
  const userUid = String(uid || "").trim();
  if (!cid) {
    return false;
  }
  ensureCollaboration(room);
  const collab = room.collaboration;
  const uidMap = collab.presenceUidMap || {};
  let changed = false;
  Object.keys(uidMap).forEach((id) => {
    if (!participants[id]) {
      delete uidMap[id];
      if (collab.presenceSeenAtMap && collab.presenceSeenAtMap[id]) {
        delete collab.presenceSeenAtMap[id];
      }
      changed = true;
    }
  });
  if (userUid && uidMap[cid] !== userUid) {
    uidMap[cid] = userUid;
    changed = true;
  }
  collab.presenceUidMap = uidMap;
  return changed;
}

exports.main = async (event) => {
  const action = String(event && event.action ? event.action : "");
  try {
    const isTimerTrigger =
      !!(event && (event.type === "timer" || event.TriggerName || event.triggerName || event.$trigger));
    if (isTimerTrigger) {
      const info = await maybeRunGlobalCleanup(true);
      return {
        ok: true,
        timer: true,
        ran: !!info.ran,
        deleted: Number(info.deleted || 0),
        archiveDeleted: Number(info.archiveDeleted || 0),
      };
    }

    if (action === "getRoom") {
      const roomId = String(event.roomId || "");
      if (!roomId) {
        return err("missing roomId");
      }
      const room = await getRoomDoc(roomId);
      return { ok: true, room: room || null };
    }

    if (action === "upsertRoom") {
      const room = event.room || null;
      if (!room || !room.roomId) {
        return err("missing room");
      }
      const saved = await putRoomDoc(room);
      return { ok: true, room: saved };
    }

    if (action === "lockResultRoom") {
      const roomId = String(event.roomId || (event.room && event.room.roomId) || "");
      if (!roomId) {
        return err("missing roomId");
      }
      const saved = await lockResultRoomDoc({ roomId: roomId, result: event.result || {} });
      return { ok: true, room: saved };
    }

    if (action === "createRoom") {
      const room = event.room || null;
      if (!room || !room.roomId) {
        return err("missing room");
      }
      const exists = await getRoomDoc(String(room.roomId));
      if (exists) {
        return { ok: true, room: exists };
      }
      const saved = await putRoomDoc(room);
      return { ok: true, room: saved };
    }

    if (action === "cleanupExpiredRooms") {
      const force = !!(event && event.force);
      const info = await maybeRunGlobalCleanup(force);
      return {
        ok: true,
        ran: !!info.ran,
        deleted: Number(info.deleted || 0),
        archiveDeleted: Number(info.archiveDeleted || 0),
      };
    }

    if (action === "isRoomIdBlocked") {
      const blocked = await isRoomIdBlocked(event.roomId);
      return { ok: true, blocked: blocked };
    }

    if (action === "reserveRoomId") {
      const reserved = await reserveRoomId(event.roomId, event.ownerId);
      return { ok: true, reserved: reserved };
    }

    if (action === "hasRoomLock") {
      const locked = await hasRoomLock(event.roomId, event.ownerId);
      return { ok: true, locked: locked };
    }

    if (action === "releaseRoomId") {
      await releaseRoomId(event.roomId, event.ownerId);
      return { ok: true };
    }

    if (action === "verifyRoomPassword") {
      const roomId = String(event.roomId || "");
      const password = String(event.password || "");
      if (!roomId) {
        return err("missing roomId");
      }
      const room = await getRoomDoc(roomId);
      if (!room) {
        return { ok: false, message: "房间不存在，请确认是否有误，或确认其他裁判已经完成团队设置" };
      }
      if (String(room.password || "") !== password) {
        return { ok: false, message: "房间密码错误", room: room };
      }
      return { ok: true, message: "ok", room: room };
    }

    if (action === "heartbeatRoom") {
      const roomId = String(event.roomId || "");
      const clientId = String(event.clientId || "");
      if (!roomId || !clientId) {
        return err("missing args");
      }
      const room = await getRoomDoc(roomId);
      if (!room) {
        return { ok: true, room: null, participantCount: 0 };
      }
      const wxContext = cloud.getWXContext ? cloud.getWXContext() : {};
      const openid = String((wxContext && wxContext.OPENID) || "");
      const participants = cleanupParticipants(room.participants);
      participants[clientId] = now();
      const ts = now();
      let changed = dedupeParticipantsByUid(room, participants, clientId, openid, ts);
      changed = ensureOperatorByParticipants(room, clientId, participants, ts) || changed;
      const next = {
        ...room,
        participants: participants,
        updatedAt: ts,
      };
      if (changed) {
        next.collaboration = room.collaboration;
      }
      await roomsCol.doc(roomId).set({ data: asDbData(next) });
      return { ok: true, room: next, participantCount: Object.keys(participants).length };
    }

    if (action === "leaveRoom") {
      const roomId = String(event.roomId || "");
      const clientId = String(event.clientId || "");
      if (!roomId || !clientId) {
        return err("missing args");
      }
      const room = await getRoomDoc(roomId);
      if (!room) {
        return { ok: true, room: null };
      }
      const participants = cleanupParticipants(room.participants);
      if (participants[clientId]) {
        delete participants[clientId];
      }
      ensureCollaboration(room);
      const seenMap = room.collaboration.presenceSeenAtMap || {};
      if (seenMap[clientId]) {
        delete seenMap[clientId];
      }
      room.collaboration.presenceSeenAtMap = seenMap;
      const uidMap = room.collaboration.presenceUidMap || {};
      if (uidMap[clientId]) {
        delete uidMap[clientId];
      }
      room.collaboration.presenceUidMap = uidMap;
      const next = {
        ...room,
        participants: participants,
        updatedAt: now(),
      };
      await roomsCol.doc(roomId).set({ data: asDbData(next) });
      return { ok: true, room: next, participantCount: Object.keys(participants).length };
    }

    return err("unknown action");
  } catch (e) {
    return err(e && e.message ? e.message : "server error");
  }
};
