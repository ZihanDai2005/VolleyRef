export function normalizeShareDigits(input: unknown): string {
  const raw = String(input || "").trim();
  return /^\d{6}$/.test(raw) ? raw : "";
}

export const SHARE_TITLE_WITHOUT_ROOM_INFO =
  "轮转、换人、暂停……排球场上的一切变化【排球裁判小助手】帮你盯着👀";
export const SHARE_TITLE_WITH_ROOM_INFO = "在？【排球裁判小助手】喊你吹个比赛！";
export const SHARE_IMAGE_URL = "/assets/share/share-card.png";

export function buildJoinSharePath(roomIdRaw: unknown, passwordRaw: unknown): string {
  const roomId = normalizeShareDigits(roomIdRaw);
  const password = normalizeShareDigits(passwordRaw);
  if (!roomId || !password) {
    return "/pages/home/home";
  }
  return "/pages/join-match/join-match?roomId=" + roomId + "&password=" + password + "&auto=1&src=share";
}

export function showMiniProgramShareMenu() {
  wx.showShareMenu({
    withShareTicket: true,
    fail: () => {},
  });
}

export function buildShareCardTitle(hasRoomInfo: boolean): string {
  return hasRoomInfo ? SHARE_TITLE_WITH_ROOM_INFO : SHARE_TITLE_WITHOUT_ROOM_INFO;
}
