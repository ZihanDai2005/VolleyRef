const LAST_ROOM_ENTRY_KEY = "volleyball.lastEnteredRoom.entry";

export interface LastRoomEntry {
  roomId: string;
  password: string;
  savedAt: number;
}

function normalizeSixDigits(input: unknown): string {
  const v = String(input || "").trim();
  return /^\d{6}$/.test(v) ? v : "";
}

export function readLastRoomEntry(): LastRoomEntry | null {
  try {
    const raw = wx.getStorageSync(LAST_ROOM_ENTRY_KEY);
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const roomId = normalizeSixDigits((raw as any).roomId);
    const password = normalizeSixDigits((raw as any).password);
    const savedAt = Math.max(0, Number((raw as any).savedAt || 0));
    if (!roomId || !password) {
      return null;
    }
    return {
      roomId,
      password,
      savedAt,
    };
  } catch (_e) {
    return null;
  }
}

export function saveLastRoomEntry(roomIdRaw: unknown, passwordRaw: unknown): void {
  const roomId = normalizeSixDigits(roomIdRaw);
  const password = normalizeSixDigits(passwordRaw);
  if (!roomId || !password) {
    return;
  }
  try {
    wx.setStorageSync(LAST_ROOM_ENTRY_KEY, {
      roomId,
      password,
      savedAt: Date.now(),
    });
  } catch (_e) {}
}

export function clearLastRoomEntry(): void {
  try {
    wx.removeStorageSync(LAST_ROOM_ENTRY_KEY);
  } catch (_e) {}
}

