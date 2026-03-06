const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const roomsCol = db.collection("rooms");
const locksCol = db.collection("room_locks");
const _ = db.command;

const ROOM_LOCK_TTL_MS = 10 * 60 * 1000;
const PARTICIPANT_TTL_MS = 20 * 1000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const ROOM_EXTRA_TTL_MS = 3 * 60 * 60 * 1000;
const RESULT_KEEP_MS = 24 * 60 * 60 * 1000;
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

async function getRoomDoc(roomId) {
  try {
    const res = await roomsCol.doc(roomId).get();
    if (!res || !res.data) {
      return null;
    }
    const room = res.data;
    const ts = now();
    let changed = false;

    if (!room.expiresAt) {
      room.expiresAt = Number(room.createdAt || ts) + ROOM_TTL_MS;
      changed = true;
    }
    room.matchStartedAt = Math.max(0, Number(room.matchStartedAt || 0));
    room.extraTimeGranted = !!room.extraTimeGranted;

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
        await roomsCol.doc(roomId).remove();
        return null;
      }
      if (changed) {
        room.updatedAt = ts;
        await roomsCol.doc(roomId).set({ data: room });
      }
      return room;
    }

    if (!room.matchStartedAt && ts > Number(room.expiresAt || 0)) {
      await roomsCol.doc(roomId).remove();
      return null;
    }

    if (
      room.matchStartedAt > 0 &&
      ts > Number(room.expiresAt || 0) &&
      !room.extraTimeGranted &&
      room.status === "match" &&
      !(room.match && room.match.isFinished)
    ) {
      room.expiresAt = Number(room.expiresAt || ts) + ROOM_EXTRA_TTL_MS;
      room.extraTimeGranted = true;
      changed = true;
    }

    if (ts > Number(room.expiresAt || 0)) {
      await roomsCol.doc(roomId).remove();
      return null;
    }

    if (changed) {
      room.updatedAt = ts;
      await roomsCol.doc(roomId).set({ data: room });
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
      data: {
        lastRunAt: ts,
        runningUntil: ts + GLOBAL_CLEANUP_LOCK_MS,
        updatedAt: ts,
      },
    });
  } catch (e) {}

  let deleted = 0;
  try {
    deleted = await runGlobalExpiredRoomCleanup();
  } finally {
    try {
      await locksCol.doc(GLOBAL_CLEANUP_META_ID).set({
        data: {
          lastRunAt: ts,
          runningUntil: 0,
          lastDeleted: deleted,
          updatedAt: now(),
        },
      });
    } catch (e) {}
  }
  return { ran: true, deleted: deleted };
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
    const existingVersion = Math.max(1, Number(existing.syncVersion || 1));
    const incomingVersion = Math.max(1, Number(normalized.syncVersion || 1));
    if (incomingVersion <= existingVersion) {
      return existing;
    }
  }
  if (!normalized.createdAt) {
    normalized.createdAt = ts;
  }
  if (!normalized.expiresAt) {
    normalized.expiresAt = Number(normalized.createdAt || ts) + ROOM_TTL_MS;
  }
  normalized.matchStartedAt = Math.max(0, Number(normalized.matchStartedAt || 0));
  normalized.extraTimeGranted = !!normalized.extraTimeGranted;
  if (normalized.status === "result") {
    if (!normalized.resultLockedAt) {
      normalized.resultLockedAt = ts;
    }
    if (!normalized.resultExpireAt) {
      normalized.resultExpireAt = Number(normalized.resultLockedAt || ts) + RESULT_KEEP_MS;
    }
    normalized.expiresAt = Number(normalized.resultExpireAt || normalized.expiresAt || ts);
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
  await roomsCol.doc(roomId).set({ data: next });
  return next;
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
          data: {
            _id: id,
            ownerId: owner,
            ts: now(),
          },
        });
        return true;
      }
    } catch (e) {}
    return false;
  }
  await locksCol.doc(id).set({
    data: {
      _id: id,
      ownerId: owner,
      ts: now(),
    },
  });
  return true;
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

exports.main = async (event) => {
  const action = String(event && event.action ? event.action : "");
  try {
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

    if (action === "createRoom") {
      await maybeRunGlobalCleanup(false);
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
      return { ok: true, ran: !!info.ran, deleted: Number(info.deleted || 0) };
    }

    if (action === "isRoomIdBlocked") {
      const blocked = await isRoomIdBlocked(event.roomId);
      return { ok: true, blocked: blocked };
    }

    if (action === "reserveRoomId") {
      const reserved = await reserveRoomId(event.roomId, event.ownerId);
      return { ok: true, reserved: reserved };
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
      const participants = cleanupParticipants(room.participants);
      participants[clientId] = now();
      const next = {
        ...room,
        participants: participants,
        updatedAt: now(),
      };
      await roomsCol.doc(roomId).set({ data: next });
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
      const next = {
        ...room,
        participants: participants,
        updatedAt: now(),
      };
      await roomsCol.doc(roomId).set({ data: next });
      return { ok: true, room: next, participantCount: Object.keys(participants).length };
    }

    return err("unknown action");
  } catch (e) {
    return err(e && e.message ? e.message : "server error");
  }
};
