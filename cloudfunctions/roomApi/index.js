const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const roomsCol = db.collection("rooms");
const locksCol = db.collection("room_locks");

const ROOM_LOCK_TTL_MS = 10 * 60 * 1000;
const PARTICIPANT_TTL_MS = 20 * 1000;

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
    return res.data;
  } catch (e) {
    return null;
  }
}

async function putRoomDoc(room) {
  const roomId = String(room && room.roomId ? room.roomId : "");
  if (!roomId) {
    throw new Error("roomId required");
  }
  const next = {
    ...room,
    roomId: roomId,
    updatedAt: now(),
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
