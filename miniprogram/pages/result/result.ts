import { forcePullRoomAsync } from "../../utils/room-service";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";
import { buildJoinSharePath, buildShareCardTitle, SHARE_IMAGE_URL, showMiniProgramShareMenu } from "../../utils/share";
import { BEBAS_GLYPHS, type BebasCommand } from "./bebasGlyphs";

type MatchLogItem = {
  id: string;
  ts: number;
  action: string;
  team: "A" | "B" | "";
  note: string;
  setNo?: number;
  opId?: string;
  revertedOpId?: string;
};

type DisplayLogRow = {
  id: string;
  rowKey: string;
  timeText: string;
  setTimeText: string;
  leftNote: string;
  leftSubNote: string;
  rightNote: string;
  rightSubNote: string;
  leftScoreBadgeText: string;
  leftScoreBadgeRgb: string;
  leftScoreBadgeAlpha: string;
  rightScoreBadgeText: string;
  rightScoreBadgeRgb: string;
  rightScoreBadgeAlpha: string;
  leftScoreBadgeNeutral: boolean;
  rightScoreBadgeNeutral: boolean;
  hasLeftNote: boolean;
  hasRightNote: boolean;
  hasLeftSub: boolean;
  hasRightSub: boolean;
  hasLeftPlaceholder: boolean;
  hasRightPlaceholder: boolean;
  showLeftBadge: boolean;
  showRightBadge: boolean;
  leftPillClass: string;
  rightPillClass: string;
  leftTextClass: string;
  rightTextClass: string;
  leftBadgeClass: string;
  rightBadgeClass: string;
  leftBadgeStyle: string;
  rightBadgeStyle: string;
  leftSubSwap: boolean;
  rightSubSwap: boolean;
  leftSubType: string;
  rightSubType: string;
  leftSubUpNo: string;
  rightSubUpNo: string;
  leftSubDownNo: string;
  rightSubDownNo: string;
};

type ScoreProgressData = {
  a: number[];
  b: number[];
  cols: number;
  hasData: boolean;
};

type ScoreProgressCellView = {
  cellKey: string;
  cellStyle: string;
};

type ScoreProgressRowView = {
  rowKey: string;
  teamName: string;
  trackStyle: string;
  cells: ScoreProgressCellView[];
};

type SetSummaryItem = {
  setNo: number;
  teamAName: string;
  teamBName: string;
  smallScoreA: string;
  smallScoreB: string;
  winnerName: string;
  durationText: string;
};

type ScoreSheetSetRow = {
  setNo: number;
  aTimeout: string;
  aSubs: string;
  aWin: string;
  aPoints: string;
  bPoints: string;
  bWin: string;
  bSubs: string;
  bTimeout: string;
};

type ScoreSheetTotalRow = Omit<ScoreSheetSetRow, "setNo">;

type ResultExportSetView = {
  setNo: number;
  smallScoreA: string;
  smallScoreB: string;
  leadingTeam: "" | "A" | "B";
  durationText: string;
  progress: ScoreProgressData;
  logs: DisplayLogRow[];
};

type ResultExportPalette = {
  pageBg: string;
  surface: string;
  surfaceSoft: string;
  strongSurface: string;
  textMain: string;
  textSecondary: string;
  textMuted: string;
  lineSoft: string;
  badgeText: string;
  activeChipBg: string;
  activeChipText: string;
  inactiveTrack: string;
  signalUp: string;
  signalDown: string;
};

const RESULT_EXPORT_UI_FONT_FAMILY = "\"PingFang SC\",\"SF Pro Text\",\"Helvetica Neue\",Arial,sans-serif";
const RESULT_EXPORT_BEBAS_DATA_URL =
  "data:font/ttf;base64,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OEIVRiYSCxsBfoNdPxoONy2bZA1tMSUCAjsdNk5NNWpbSFFfq1g1LSN+UiFNKx8uJTdWWSIuNxZGRCAbQwAAAQBBAEYDCQUrAAYAbEAvAQcHQAgFAwUBAwIDBAYEBQYGAAUFBgIBAgMGAwQBAQIAAAEFBAIDAQEGAAABAUZ2LzcYAD88Pxc8AYcuCMQI/AjEhy4IxAj8CMQBLi4ALjEwAUlouQABAAdJaGGwQFJYOBE3uQAH/8A4WSUDMxMTMwMBIeDGnZ/G5EYE5fwxA8/7GwABACMBpgFZAjMAAwAYQBUAAAEBAFcAAAABXwABAAFPERACCBgrEyEVISMBNv7KAjONAAAAAAABAAADwgABAJ4DAAAHALQABAAEACEABAAFABcABAAGABQABAAJABsABAAKACIABAAMAB8ABAANAB0ABAAQACQABAARACUABAASACUABAATABkABQAEACQABQAFABkABQAGABkABQAHABQABQAIABUABQAJAB4ABQAKACUABQAMACMABQANACAABQAPABwABQAQACcABQARACcABQASACcABQATABwABQAUABwABgAEABoABgAI/4cABgAKABoABgANABUABgAQABwABgARAB0ABgASAB0ABgAU/+gABwAEAB8ABwAJABkABwAKACAABwAMAB0ABwANABsABwAQACIABwARACMABwASACMABwATABcABwAU/+cACAAEABoACAAF/6IACAAG/90ACAAJABQACAAKABoACAAL/5sACAAMABgACAANABUACAAP/+oACAAQAB0ACAARAB0ACAASAB0ACAAU/6UACQAEAB0ACQAJABcACQAKAB0ACQAMABsACQANABgACQAQACAACQARAB8ACQASAB8ACgAEAB0ACgAJABcACgAKAB0ACgAMABsACgANABgACgAQACAACgARACAACgASACAACgATABQACwAH/+cACwAI/4gACwAP/3EACwAQABwACwARABwACwASABwADAAEAB8ADAAJABoADAAKACAADAAMAB4ADAANABsADAAQACMADAARACMADAASACMADAATABcADAAU/+YADQAEACIADQAFABcADQAGABQADQAJABwADQAKACIADQAMACAADQANAB0ADQAQACUADQARACUADQASACUADQATABkADwAF/4AADwAH/+YADwAI/+QADwAL/54ADwAQAB0ADwARAB0ADwASAB0ADwAT/+QADwAU/1gAEAAEAB8AEAAJABgAEAAKAB8AEAAL/+IAEAAMAB0AEAANABkAEAAQACEAEAARACIAEAASACIAEAATABYAEAAU/9QAEQAEACUAEQAFABkAEQAGABkAEQAHABUAEQAIABYAEQAJAB4AEQAKACUAEQAMACMAEQANACAAEQAPABwAEQAQACcAEQARACcAEQASACcAEQATABwAEQAUABwAEgAF/24AEgAI/tUAEgAL/40AEgAT/+gAEgAU/1cAEwAEABgAEwAKABkAEwAMABYAEwAP/+sAEwAQABsAEwARABsAEwASABsAEwAU/+EAFAAG/94AFAAH/8kAFAAI/4wAFAAM/+YAFAAP/1UAFAAQABwAFAARABwAFAASABwAFAAT/9cAAAAAABgBJgAAAAAAAAAAAFwAAAAAAAAAAAABAAoAXAAAAAAAAAACAA4AZgAAAAAAAAADAEgAdAAAAAAAAAAEAAoAXAAAAAAAAAAFACAAvAAAAAAAAAAGAAoAXAAAAAAAAAAHAAAA3AABAAAAAAAAAC4A3AABAAAAAAABAAUBCgABAAAAAAACAAcBDwABAAAAAAADACQBFgABAAAAAAAEAAUBCgABAAAAAAAFABABOgABAAAAAAAGAAUBCgABAAAAAAAHAAAA3AADAAEECQAAAFwAAAADAAEECQABAAoAXAADAAEECQACAA4AZgADAAEECQADAEgAdAADAAEECQAEAAoAXAADAAEECQAFACAAvAADAAEECQAGAAoAXAADAAEECQAHAAAA3ABSAHkAbwBpAGMAaABpACAAVABzAHUAbgBlAGsAYQB3AGEAIABCAGEAZwBlAGwAJgBDAG8AIABBAGwAbAAgAHIAaQBnAGgAdABzACAAcgBlAHMAZQByAHYAZQBkAEIAZQBiAGEAcwBSAGUAZwB1AGwAYQByAE0AYQBjAHIAbwBtAGUAZABpAGEAIABGAG8AbgB0AG8AZwByAGEAcABoAGUAcgAgADQALgAxACAAMAA1AC8AMAA3AC8AMgA5AEIAZQBiAGEAcwAgAHYAZQByAHMAbwBpAG4AMQAuADBSeW9pY2hpIFRzdW5la2F3YSBCYWdlbCZDbyBBbGwgcmlnaHRzIHJlc2VydmVkQmViYXNSZWd1bGFyTWFjcm9tZWRpYSBGb250b2dyYXBoZXIgNC4xIDA1LzA3LzI5QmViYXMgdmVyc29pbjEuMAACAAAAAAAA/7UAMgAAAAAAAAAAAAAAAAAAAAAAAAAAABYAAAABAAIAAwATABQAFQAWABcAGAAZABoAGwAcACIAJAAlACwALwA2ADkAEAAA";
const RESULT_EXPORT_BEBAS_FONT_SOURCES = [
  `url("${RESULT_EXPORT_BEBAS_DATA_URL}")`,
  "url('/assets/fonts/BebasNeue-NumRomanL-subset.ttf')",
  "url('assets/fonts/BebasNeue-NumRomanL-subset.ttf')",
  "url('./assets/fonts/BebasNeue-NumRomanL-subset.ttf')",
];
const RESULT_EXPORT_BEBAS_FALLBACK_ADVANCE = 0.42;
const RESULT_STATUS_RETRY_DELAYS_MS = [320, 900, 1600];

function getBebasTextMetrics(text: string, letterSpacing = 0) {
  const chars = Array.from(String(text || ""));
  let cursor = 0;
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  chars.forEach((char, idx) => {
    const glyph = BEBAS_GLYPHS[char];
    if (glyph) {
      xMin = Math.min(xMin, cursor + glyph.xMin);
      xMax = Math.max(xMax, cursor + glyph.xMax);
      yMin = Math.min(yMin, glyph.yMin);
      yMax = Math.max(yMax, glyph.yMax);
      cursor += glyph.advanceWidth;
    } else {
      cursor += RESULT_EXPORT_BEBAS_FALLBACK_ADVANCE;
    }
    if (idx < chars.length - 1) {
      cursor += letterSpacing;
    }
  });
  if (!Number.isFinite(xMin)) {
    xMin = 0;
    xMax = cursor;
    yMin = -0.85;
    yMax = -0.15;
  }
  return {
    width: Math.max(cursor, xMax - xMin),
    xMin,
    xMax,
    yMin,
    yMax,
  };
}

function drawBebasText(
  ctx: any,
  text: string,
  x: number,
  y: number,
  options: {
    align?: "left" | "right" | "center";
    color?: string;
    fontSize?: number;
    letterSpacing?: number;
  }
) {
  const value = String(text || "");
  if (!value) {
    return;
  }
  const fontSize = Number(options.fontSize) || 16;
  const letterSpacing = Number(options.letterSpacing) || 0;
  const metrics = getBebasTextMetrics(value, letterSpacing);
  let originX = x;
  if (options.align === "center") {
    originX = x - ((metrics.xMin + metrics.xMax) / 2) * fontSize;
  } else if (options.align === "right") {
    originX = x - metrics.xMax * fontSize;
  } else {
    originX = x - metrics.xMin * fontSize;
  }
  const originY = y - ((metrics.yMin + metrics.yMax) / 2) * fontSize;
  let cursor = 0;
  ctx.save();
  ctx.fillStyle = options.color || "#ffffff";
  ctx.beginPath();
  Array.from(value).forEach((char, idx) => {
    const glyph = BEBAS_GLYPHS[char];
    if (glyph) {
      glyph.commands.forEach((command: BebasCommand) => {
        const [type, ...rest] = command;
        if (type === "M") {
          ctx.moveTo(originX + (cursor + rest[0]) * fontSize, originY + rest[1] * fontSize);
        } else if (type === "L") {
          ctx.lineTo(originX + (cursor + rest[0]) * fontSize, originY + rest[1] * fontSize);
        } else if (type === "Q") {
          ctx.quadraticCurveTo(
            originX + (cursor + rest[2]) * fontSize,
            originY + rest[3] * fontSize,
            originX + (cursor + rest[0]) * fontSize,
            originY + rest[1] * fontSize
          );
        } else if (type === "C") {
          ctx.bezierCurveTo(
            originX + (cursor + rest[2]) * fontSize,
            originY + rest[3] * fontSize,
            originX + (cursor + rest[4]) * fontSize,
            originY + rest[5] * fontSize,
            originX + (cursor + rest[0]) * fontSize,
            originY + rest[1] * fontSize
          );
        } else if (type === "Z") {
          ctx.closePath();
        }
      });
      cursor += glyph.advanceWidth;
    } else {
      cursor += RESULT_EXPORT_BEBAS_FALLBACK_ADVANCE;
    }
    if (idx < value.length - 1) {
      cursor += letterSpacing;
    }
  });
  ctx.fill();
  ctx.restore();
}

function pad2(n: number): string {
  return n < 10 ? "0" + String(n) : String(n);
}

function hexToRgbTriplet(hex: string, fallback = "81, 125, 209"): string {
  const normalized = String(hex || "").trim();
  const m = normalized.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) {
    return fallback;
  }
  const c = m[1];
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return String(r) + ", " + String(g) + ", " + String(b);
}

function formatLogTime(ts: number): string {
  const d = new Date(Number(ts) || 0);
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function formatSetElapsedTime(setStartTs: number, itemTs: number): string {
  const startTs = Math.max(0, Number(setStartTs) || 0);
  const ts = Math.max(0, Number(itemTs) || 0);
  if (!startTs || !ts || ts < startTs) {
    return "局时 --";
  }
  const elapsedSec = Math.max(0, Math.floor((ts - startTs) / 1000));
  const mm = Math.floor(elapsedSec / 60);
  const ss = elapsedSec % 60;
  return "局时 " + String(mm) + "'" + pad2(ss) + "\"";
}

function escapeRegExp(input: string): string {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toSetNo(val: unknown, fallback = 1): number {
  return Math.max(1, Number(val) || fallback);
}

function extractSetNoFromText(text: string): number | null {
  const match = String(text || "").match(/第\s*(\d+)\s*局/);
  if (!match) {
    return null;
  }
  return toSetNo(match[1], 1);
}

function normalizeSwapSymbolText(text: string): string {
  return String(text || "")
    .replace(/\uFE0F/g, "")
    .replace(/\u2194\uFE0F/g, "\u2194")
    .replace(/自由人替换/g, "自由人常规换人");
}

function normalizeLogsBySet(logs: MatchLogItem[]): MatchLogItem[] {
  let cursorSetNo = 1;
  return (logs || []).map((item, idx) => {
    const action = String(item && item.action ? item.action : "");
    const note = normalizeSwapSymbolText(String(item && item.note ? item.note : ""));
    const explicitSetNo = Number((item as any).setNo) || 0;
    const noteSetNo = extractSetNoFromText(note);
    let resolvedSetNo = explicitSetNo > 0 ? toSetNo(explicitSetNo, cursorSetNo) : 0;
    if (!resolvedSetNo) {
      if (action === "next_set" && noteSetNo) {
        // “进入第N局”应归属上一局日志。
        resolvedSetNo = Math.max(1, noteSetNo - 1);
      } else if (noteSetNo) {
        resolvedSetNo = noteSetNo;
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

function extractScoreFromText(text: string): { a: string; b: string } | null {
  const raw = String(text || "");
  const wrap = raw.match(/[（(]\s*(\d+)\s*[:：]\s*(\d+)\s*[）)]/);
  if (wrap) {
    return { a: String(Number(wrap[1])), b: String(Number(wrap[2])) };
  }
  const plain = raw.match(/(\d+)\s*[:：]\s*(\d+)/);
  if (plain) {
    return { a: String(Number(plain[1])), b: String(Number(plain[2])) };
  }
  return null;
}

function extractWinnerFromText(text: string, teamAName: string, teamBName: string): string {
  const raw = String(text || "");
  const m = raw.match(/[：:]\s*(.+?)\s*胜/);
  if (m && m[1]) {
    return String(m[1]).trim();
  }
  if (raw.indexOf(teamAName + " 胜") >= 0 || raw.indexOf(teamAName + "胜") >= 0) {
    return teamAName;
  }
  if (raw.indexOf(teamBName + " 胜") >= 0 || raw.indexOf(teamBName + "胜") >= 0) {
    return teamBName;
  }
  return "";
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

function normalizeWinnerName(name: string): string {
  return String(name || "").replace(/\s+/g, "").replace(/队$/u, "");
}

function stripFullScoreForAddOneNote(note: string): string {
  return String(note || "")
    .replace(/\s*[（(]\s*\d+\s*[:：]\s*\d+\s*[）)]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isSubstitutionAction(action: string, noteRaw: string): boolean {
  const actionText = String(action || "");
  const note = String(noteRaw || "");
  return (
    actionText === "libero_swap" ||
    actionText === "libero_swap_auto_front" ||
    actionText.indexOf("sub_") === 0 ||
    actionText.indexOf("substitution_") === 0 ||
    note.indexOf("换人") >= 0 ||
    note.indexOf("自由人前排自动换回") >= 0
  );
}

function getSubstitutionTypeLabel(noteRaw: string, actionRaw = ""): string {
  const note = String(noteRaw || "");
  const action = String(actionRaw || "");
  if (action === "libero_swap_auto_front" || note.indexOf("自由人前排自动换回") >= 0) {
    return "自由人前排换回";
  }
  if (note.indexOf("自由人普通换人") >= 0 || note.indexOf("自由人常规换人") >= 0 || note.indexOf("自由人前排自动换回") >= 0) {
    return "自由人常规换人";
  }
  if (note.indexOf("普通换人") >= 0) {
    return "普通换人";
  }
  if (note.indexOf("特殊换人") >= 0 || note.indexOf("自由人特殊换人") >= 0 || note.indexOf("特殊自由人换人") >= 0) {
    return "特殊换人";
  }
  return "普通换人";
}

function normalizeSwapToken(raw: string): string {
  return String(raw || "")
    .replace(/[（(]\s*([^）)]+?)\s*[）)]/g, " $1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSubstitutionSwap(noteRaw: string): { typeLabel: string; upNo: string; downNo: string; hideType: boolean } | null {
  const note = String(noteRaw || "");
  const typeLabel = getSubstitutionTypeLabel(note);
  const hideType = true;
  const upMatch = note.match(/↑\s*([0-9?]{1,2}(?:\s*[（(][^）)]+[）)])?)/);
  const downMatch = note.match(/↓\s*([0-9?]{1,2}(?:\s*[（(][^）)]+[）)])?)/);
  if (upMatch && upMatch[1] && downMatch && downMatch[1]) {
    return {
      typeLabel,
      upNo: normalizeSwapToken(upMatch[1]),
      downNo: normalizeSwapToken(downMatch[1]),
      hideType,
    };
  }
  const pairMatch = note.match(
    /([0-9?]{1,2}(?:\s*[（(][^）)]+[）)])?)\s*↔\s*([0-9?]{1,2}(?:\s*[（(][^）)]+[）)])?)/
  );
  if (pairMatch && pairMatch[1] && pairMatch[2]) {
    return {
      typeLabel,
      upNo: normalizeSwapToken(pairMatch[1]),
      downNo: normalizeSwapToken(pairMatch[2]),
      hideType,
    };
  }
  return null;
}

function stripTeamPrefix(noteRaw: string, teamNameRaw: string): string {
  const note = String(noteRaw || "").trim();
  const teamName = String(teamNameRaw || "").trim();
  if (!teamName) {
    return note;
  }
  const esc = escapeRegExp(teamName);
  return note.replace(new RegExp("^\\s*" + esc + "队?\\s*"), "").trim();
}

function extractTimeoutCountFromText(text: string): string {
  const raw = String(text || "");
  const wrap = raw.match(/暂停[（(]\s*([0-9]+)\s*\/\s*2\s*[）)]/);
  if (wrap && wrap[1]) {
    return String(Number(wrap[1]));
  }
  return "";
}

function extractResultWinnerFromText(text: string, teamAName: string, teamBName: string): string {
  const raw = String(text || "");
  const m = raw.match(/结果确认[:：]\s*(.+?)\s+以\s*\d+\s*[:：]\s*\d+\s*获胜/);
  if (m && m[1]) {
    return String(m[1]).trim();
  }
  if (raw.indexOf(teamAName) >= 0) {
    return teamAName;
  }
  if (raw.indexOf(teamBName) >= 0) {
    return teamBName;
  }
  return "";
}

function extractSpecialReasonLabel(noteRaw: string): string {
  const note = String(noteRaw || "");
  if (note.indexOf("本局禁赛") >= 0) {
    return "本局禁赛";
  }
  if (note.indexOf("全场禁赛") >= 0) {
    return "全场禁赛";
  }
  if (note.indexOf("伤病") >= 0) {
    return "伤病";
  }
  if (note.indexOf("其他") >= 0) {
    return "其他";
  }
  return "";
}

void stripTeamPrefix;
void extractSpecialReasonLabel;

function hasSetResult(summary?: SetSummaryItem): boolean {
  if (!summary) {
    return false;
  }
  const scoreReady = summary.smallScoreA !== "--" && summary.smallScoreB !== "--";
  const winnerReady = normalizeWinnerName(String(summary.winnerName || "")).length > 0;
  return scoreReady && winnerReady;
}

function parseSetDurationMinutes(durationText: string): string {
  const raw = String(durationText || "").trim();
  if (!raw) {
    return "";
  }
  const hm = raw.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (hm) {
    const min = Math.max(0, Number(hm[1]) || 0);
    return String(min);
  }
  const mm = raw.match(/^(\d{1,3})\s*分/);
  if (mm) {
    return String(Math.max(0, Number(mm[1]) || 0));
  }
  const onlyNum = raw.match(/^(\d{1,3})$/);
  if (onlyNum) {
    return String(Math.max(0, Number(onlyNum[1]) || 0));
  }
  return "";
}

function getSetDurationMinutesFromLogs(logs: MatchLogItem[], setNo: number): string {
  const targetSet = toSetNo(setNo, 1);
  let startTs = 0;
  let endTs = 0;
  let firstActionTs = 0;
  (logs || []).forEach((item) => {
    const itemSet = toSetNo(item.setNo, extractSetNoFromText(String(item.note || "")) || 1);
    if (itemSet !== targetSet) {
      return;
    }
    const ts = Math.max(0, Number(item.ts) || 0);
    const action = String(item.action || "");
    if (action === "timer_start") {
      if (!startTs || ts < startTs) {
        startTs = ts;
      }
      return;
    }
    if (
      action === "score_add" ||
      action === "timeout" ||
      action.indexOf("sub_") === 0 ||
      action.indexOf("substitution_") === 0
    ) {
      if (!firstActionTs || ts < firstActionTs) {
        firstActionTs = ts;
      }
    }
    if (action === "set_end") {
      if (!endTs || ts > endTs) {
        endTs = ts;
      }
    }
  });
  if (!startTs && firstActionTs) {
    startTs = firstActionTs;
  }
  if (!startTs || !endTs || endTs <= startTs) {
    return "";
  }
  return String(Math.floor((endTs - startTs) / 60000));
}

function resolveSetDurationMinutes(durationText: string, logs: MatchLogItem[], setNo: number): string {
  const fromSummary = parseSetDurationMinutes(durationText);
  if (fromSummary !== "") {
    return fromSummary;
  }
  const fromLogs = getSetDurationMinutesFromLogs(logs, setNo);
  if (fromLogs) {
    return fromLogs;
  }
  return fromSummary;
}

function sumDisplayedSetMinutes(
  logs: MatchLogItem[],
  setSummaryMap: Record<number, SetSummaryItem>
): { totalMinutes: number; hasAnySetMinutes: boolean } {
  let totalMinutes = 0;
  let hasAnySetMinutes = false;
  for (let setNo = 1; setNo <= 5; setNo += 1) {
    const summary = setSummaryMap[setNo];
    if (!hasSetResult(summary)) {
      continue;
    }
    const mins = resolveSetDurationMinutes(String(summary && summary.durationText ? summary.durationText : ""), logs, setNo);
    totalMinutes += Math.max(0, Number(mins) || 0);
    hasAnySetMinutes = true;
  }
  return { totalMinutes, hasAnySetMinutes };
}

function getMatchTimeStats(
  logs: MatchLogItem[],
  setSummaryMap: Record<number, SetSummaryItem>
): { startTs: number; endTs: number; totalMinutes: number; hasAnySetMinutes: boolean } {
  let startTs = 0;
  let endTs = 0;
  let firstActionTs = 0;
  let lastActionTs = 0;
  const displayedMinutes = sumDisplayedSetMinutes(logs, setSummaryMap);
  (logs || []).forEach((item) => {
    const ts = Math.max(0, Number(item.ts) || 0);
    const action = String(item.action || "");
    if (!ts) {
      return;
    }
    if (action === "timer_start") {
      if (!startTs || ts < startTs) {
        startTs = ts;
      }
      return;
    }
    if (
      action === "score_add" ||
      action === "timeout" ||
      action.indexOf("sub_") === 0 ||
      action.indexOf("substitution_") === 0
    ) {
      if (!firstActionTs || ts < firstActionTs) {
        firstActionTs = ts;
      }
      if (!lastActionTs || ts > lastActionTs) {
        lastActionTs = ts;
      }
    }
    if (action === "set_end") {
      if (!endTs || ts > endTs) {
        endTs = ts;
      }
    }
  });
  if (!startTs && firstActionTs) {
    startTs = firstActionTs;
  }
  if (!endTs && lastActionTs) {
    endTs = lastActionTs;
  }
  if (!startTs || !endTs || endTs < startTs) {
    return {
      startTs,
      endTs,
      totalMinutes: displayedMinutes.totalMinutes,
      hasAnySetMinutes: displayedMinutes.hasAnySetMinutes,
    };
  }
  return {
    startTs,
    endTs,
    totalMinutes: displayedMinutes.totalMinutes,
    hasAnySetMinutes: displayedMinutes.hasAnySetMinutes,
  };
}

function buildCanvasRoundRectPath(
  ctx: any,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillCanvasRoundRect(
  ctx: any,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string
) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  buildCanvasRoundRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
}

function fitTextWithEllipsis(
  ctx: any,
  text: string,
  maxWidth: number
): string {
  const raw = String(text || "");
  if (!raw || maxWidth <= 0 || ctx.measureText(raw).width <= maxWidth) {
    return raw;
  }
  const ellipsis = "...";
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  if (ellipsisWidth >= maxWidth) {
    return "";
  }
  let result = raw;
  while (result.length > 0 && ctx.measureText(result).width + ellipsisWidth > maxWidth) {
    result = result.slice(0, -1);
  }
  return result ? result + ellipsis : "";
}

function getResultExportErrorText(err: unknown): string {
  const raw = String(
    (err && typeof err === "object" && "message" in err && (err as { message?: unknown }).message) || err || ""
  ).trim();
  if (!raw) {
    return "导出失败，请稍后重试";
  }
  if (
    raw.indexOf("unknown action") >= 0 ||
    raw.indexOf("Cannot find module") >= 0 ||
    raw.indexOf("function not found") >= 0
  ) {
    return "导出功能暂不可用，请稍后重试";
  }
  if (raw.indexOf("room not found") >= 0) {
    return "房间不存在或已过期";
  }
  if (raw.indexOf("room not in result status") >= 0) {
    return "当前比赛结果还不可导出";
  }
  if (
    raw.indexOf("TIME_LIMIT_EXCEEDED") >= 0 ||
    raw.indexOf("timed out") >= 0 ||
    raw.indexOf("timeout") >= 0
  ) {
    return "导出超时，请稍后重试";
  }
  if (raw.indexOf("write-result-image-failed") >= 0 || raw.indexOf("export page image failed") >= 0) {
    return "图片生成失败，请稍后重试";
  }
  return "导出失败，请稍后重试";
}

function loadFontFaceAsync(family: string, source: string): Promise<boolean> {
  return new Promise((resolve) => {
    wx.loadFontFace({
      family,
      source,
      global: true,
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

Page({
  data: {
    roomId: "",
    roomPassword: "",
    customNavTop: "10px",
    customNavOffset: "54px",
    clearCountdownText: "",
    teamAName: "甲",
    teamBName: "乙",
    teamARGB: "131, 122, 229",
    teamBRGB: "76, 135, 222",
    winnerRGB: "81, 125, 209",
    bigScoreA: "0",
    bigScoreB: "0",
    bigScoreLeadingTeam: "" as "" | "A" | "B",
    setOptions: [1] as number[],
    selectedSetNo: 1,
    selectedSmallScoreA: "--",
    selectedSmallScoreB: "--",
    selectedSetLeadingTeam: "" as "" | "A" | "B",
    selectedSetWinnerText: "",
    selectedSetDurationText: "",
    resultSetContentSwitching: false,
    scoreProgressRows: [] as ScoreProgressRowView[],
    scoreProgressHasData: false,
    scoreProgressEmpty: true,
    scoreProgressGapRpx: 5,
    logs: [] as DisplayLogRow[],
  },
  themeOff: null as null | (() => void),
  countdownTimer: 0 as number,
  resultExpireAt: 0 as number,
  allLogs: [] as MatchLogItem[],
  setSummaryMap: {} as Record<number, SetSummaryItem>,
  isSheetGenerating: false,
  scoreSheetTempFilePath: "",
  scoreSheetPreparingPromise: null as null | Promise<string>,
  resultPageImagePreparingPromise: null as null | Promise<string[]>,
  scoreSheetFontFamily: RESULT_EXPORT_UI_FONT_FAMILY,
  scoreSheetSetNoFamily: RESULT_EXPORT_UI_FONT_FAMILY,
  scoreSheetSystemFamily: RESULT_EXPORT_UI_FONT_FAMILY,
  scoreSheetMonoFamily: "Courier New",
  scoreSheetScoreFamily: "Arial",
  scoreSheetFontLoadPromise: null as null | Promise<void>,
  scoreSheetFontsReady: false as boolean,
  resultPageImagePaths: [] as string[],
  resultPageImageTheme: "",
  pageActive: false as boolean,
  roomEnsureInFlight: false as boolean,
  roomEnsurePending: false as boolean,
  statusRouteRedirecting: false as boolean,
  resultStatusRetryTimer: 0 as number,
  resultStatusRetryCount: 0 as number,
  resultSetContentSwitchTimer: 0 as number,
  onLoad(query: Record<string, string>) {
    this.pageActive = true;
    this.statusRouteRedirecting = false;
    this.roomEnsureInFlight = false;
    this.roomEnsurePending = false;
    this.applyNavigationTheme();
    showMiniProgramShareMenu();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
    [80, 220, 420, 1000].forEach((delay) => {
      setTimeout(() => {
        this.syncCustomNavTop();
      }, delay);
    });
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
        this.invalidateResultExportCache();
        wx.setNavigationBarTitle({ title: "" });
      });
    }
    const roomId = String((query && query.roomId) || "");
    if (!roomId) {
      wx.reLaunch({ url: "/pages/home/home" });
      return;
    }
    this.loadScoreSheetFonts();
    this.setData({ roomId });
    this.ensureRoom(roomId);
  },

  onShow() {
    this.pageActive = true;
    this.statusRouteRedirecting = false;
    showMiniProgramShareMenu();
    this.applyNavigationTheme();
    wx.setNavigationBarTitle({ title: "" });
    this.syncCustomNavTop();
    [80, 220, 420, 1000].forEach((delay) => {
      setTimeout(() => {
        this.syncCustomNavTop();
      }, delay);
    });
    this.startCountdown();
    const roomId = String(this.data.roomId || "");
    if (roomId) {
      this.ensureRoom(roomId);
    }
    void this.prepareScoreSheet(false).catch(() => {});
  },

  onReady() {
    void this.prepareScoreSheet(false).catch(() => {});
  },

  onHide() {
    this.pageActive = false;
    this.clearResultStatusRetry();
    this.stopCountdown();
  },

  onUnload() {
    this.pageActive = false;
    this.roomEnsurePending = false;
    this.roomEnsureInFlight = false;
    this.clearResultStatusRetry();
    this.stopCountdown();
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
    this.isSheetGenerating = false;
    this.scoreSheetTempFilePath = "";
    this.scoreSheetPreparingPromise = null;
    this.resultPageImagePaths = [];
    this.resultPageImageTheme = "";
    this.resultPageImagePreparingPromise = null;
    if (this.resultSetContentSwitchTimer) {
      clearTimeout(this.resultSetContentSwitchTimer);
      this.resultSetContentSwitchTimer = 0;
    }
  },

  invalidateResultExportCache() {
    this.resultPageImagePaths = [];
    this.resultPageImageTheme = "";
    this.resultPageImagePreparingPromise = null;
  },

  clearResultStatusRetry() {
    if (!this.resultStatusRetryTimer) {
      return;
    }
    clearTimeout(this.resultStatusRetryTimer);
    this.resultStatusRetryTimer = 0;
  },

  scheduleResultStatusRetry(roomId: string): boolean {
    const id = String(roomId || "");
    if (!id || this.resultStatusRetryTimer) {
      return false;
    }
    if (this.resultStatusRetryCount >= RESULT_STATUS_RETRY_DELAYS_MS.length) {
      return false;
    }
    const delay = RESULT_STATUS_RETRY_DELAYS_MS[this.resultStatusRetryCount];
    this.resultStatusRetryCount += 1;
    this.resultStatusRetryTimer = setTimeout(() => {
      this.resultStatusRetryTimer = 0;
      if (!this.pageActive || !this.isResultPageTop()) {
        return;
      }
      void this.ensureRoom(id);
    }, delay) as unknown as number;
    return true;
  },

  buildSetOptions(playedSets: number): number[] {
    const count = Math.max(1, Number(playedSets || 1));
    return Array.from({ length: count }).map((_, i) => i + 1);
  },

  getDisplayLogsBySet(logs: MatchLogItem[], setNo: number): DisplayLogRow[] {
    const targetSet = toSetNo(setNo, 1);
    const teamAName = String(this.data.teamAName || "甲");
    const teamBName = String(this.data.teamBName || "乙");
    const teamARGB = String(this.data.teamARGB || "131, 122, 229");
    const teamBRGB = String(this.data.teamBRGB || "76, 135, 222");
    let setStartTs = 0;
    (logs || []).forEach((item) => {
      const action = String(item && item.action ? item.action : "");
      if (action !== "timer_start") {
        return;
      }
      const noteSetNo = extractSetNoFromText(String(item && item.note ? item.note : ""));
      const itemSetNo = toSetNo(item && (item as any).setNo, noteSetNo || 1);
      if (itemSetNo !== targetSet) {
        return;
      }
      const ts = Math.max(0, Number(item && item.ts) || 0);
      if (!ts) {
        return;
      }
      if (!setStartTs || ts < setStartTs) {
        setStartTs = ts;
      }
    });
    const hiddenOpIds = new Set<string>();
    (logs || []).forEach((item) => {
      const action = String(item && item.action ? item.action : "");
      const revertedOpId = String((item as any).revertedOpId || "");
      if (action === "score_undo" && revertedOpId) {
        hiddenOpIds.add(revertedOpId);
      }
    });
    let latestResultLockedKey = "";
    (logs || []).forEach((item, idx) => {
      const action = String(item && item.action ? item.action : "");
      const noteText = String(item && item.note ? item.note : "");
      const isResultLocked = action === "result_locked" || noteText.indexOf("比赛结束") >= 0;
      if (!isResultLocked) {
        return;
      }
      const opId = String((item as any).opId || "");
      if (opId && hiddenOpIds.has(opId)) {
        return;
      }
      const noteSetNo = extractSetNoFromText(noteText);
      const itemSetNo = toSetNo(item && (item as any).setNo, noteSetNo || 1);
      if (itemSetNo !== targetSet) {
        return;
      }
      latestResultLockedKey =
        opId || String((item as any).id || "") || String(Math.max(0, Number((item as any).ts) || 0)) + "-" + String(idx);
    });
    return (logs || [])
      .filter((item, idx) => {
        const action = String(item.action || "");
        const noteText = String(item.note || "");
        const opId = String((item as any).opId || "");
        const itemKey =
          opId || String((item as any).id || "") || String(Math.max(0, Number((item as any).ts) || 0)) + "-" + String(idx);
        const isResultLocked = action === "result_locked" || noteText.indexOf("比赛结束") >= 0;
        const isSubstitutionAction =
          action === "libero_swap" ||
          action.indexOf("sub_") === 0 ||
          action.indexOf("substitution_") === 0 ||
          noteText.indexOf("换人") >= 0;
        if (
          action === "timeout_end" ||
          action === "next_set" ||
          action === "score_undo" ||
          action === "switch_sides_prompt" ||
          action === "score_reset"
        ) {
          return false;
        }
        if (action === "rotate" && noteText.indexOf("手动轮转") < 0) {
          // 自动轮转不展示；仅保留手动轮转。
          return false;
        }
        if (action === "switch_sides" && noteText.indexOf("局间配置换边") >= 0) {
          // 局间配置换边不展示。
          return false;
        }
        if (opId && hiddenOpIds.has(opId)) {
          return false;
        }
        if (isResultLocked && latestResultLockedKey && itemKey !== latestResultLockedKey) {
          return false;
        }
        const noteSetNo = extractSetNoFromText(String(item.note || ""));
        const itemSetNo = toSetNo(item.setNo, noteSetNo || 1);
        if (itemSetNo !== targetSet) {
          return false;
        }
        // 赛前只隐藏轮转/换边；换人记录（含赛前）应在结果页保留展示。
        if (!isSubstitutionAction && setStartTs > 0 && (action === "rotate" || action === "switch_sides")) {
          const ts = Math.max(0, Number(item.ts) || 0);
          if (ts > 0 && ts < setStartTs) {
            return false;
          }
        }
        return true;
      })
      .map((item, idx) => {
        const rawNote = String(item.note || "");
        const normalizedNote = withTeamSuffixForDisplay(rawNote, teamAName, teamBName);
        const action = String(item.action || "");
        const isSwitchSides = action.indexOf("switch_sides") === 0 || action === "switch_sides";
        const isSetEnd = action === "set_end";
        const isResultLocked = action === "result_locked" || rawNote.indexOf("比赛结束") >= 0;
        const isMatchStart = action === "timer_start" || rawNote.indexOf("比赛开始") >= 0;
        const isManualSwitchSides = action === "switch_sides" && rawNote.indexOf("手动换边") >= 0;
        const isDecidingAutoSwitchSides = action === "switch_sides" && rawNote.indexOf("自动换边（决胜局）") >= 0;
        const isTimeoutStart = action === "timeout" || rawNote.indexOf("暂停（") >= 0 || rawNote.indexOf("暂停(") >= 0;
        const isManualRotate = action === "rotate" && rawNote.indexOf("手动轮转") >= 0;
        const isTeamAOnly = item.team === "A";
        const isTeamBOnly = item.team === "B";
        const isSharedEvent = !isTeamAOnly && !isTeamBOnly;
        const isScoreAdd = action === "score_add" || normalizedNote.indexOf("+1") >= 0;
        const scoreFromNote = extractScoreFromText(String(item.note || ""));
        const setScoreFromNote = isSetEnd ? extractScoreFromText(rawNote) : null;
        const resultScoreFromNote = isResultLocked ? extractScoreFromText(rawNote) : null;
        const renderedNote = isScoreAdd ? stripFullScoreForAddOneNote(normalizedNote) : normalizedNote;
        const winnerRaw = isSetEnd ? extractWinnerFromText(String(item.note || ""), teamAName, teamBName) : "";
        const winnerNormalized = normalizeWinnerName(winnerRaw);
        const resultWinnerRaw = isResultLocked ? extractResultWinnerFromText(rawNote, teamAName, teamBName) : "";
        const resultWinnerNormalized = normalizeWinnerName(resultWinnerRaw);
        const teamANormalized = normalizeWinnerName(teamAName);
        const teamBNormalized = normalizeWinnerName(teamBName);
        const winnerIsA = !!winnerNormalized && winnerNormalized === teamANormalized;
        const winnerIsB = !!winnerNormalized && winnerNormalized === teamBNormalized;
        const resultWinnerIsA = !!resultWinnerNormalized && resultWinnerNormalized === teamANormalized;
        const resultWinnerIsB = !!resultWinnerNormalized && resultWinnerNormalized === teamBNormalized;
        let leftNote = "";
        let leftSubNote = "";
        let rightNote = "";
        let rightSubNote = "";
        let leftSubSwap = false;
        let rightSubSwap = false;
        let leftSubType = "";
        let rightSubType = "";
        let leftSubUpNo = "";
        let rightSubUpNo = "";
        let leftSubDownNo = "";
        let rightSubDownNo = "";
        let leftScoreBadgeText = "";
        let leftScoreBadgeRgb = "";
        let leftScoreBadgeAlpha = "1";
        let rightScoreBadgeText = "";
        let rightScoreBadgeRgb = "";
        let rightScoreBadgeAlpha = "1";
        let leftScoreBadgeNeutral = false;
        let rightScoreBadgeNeutral = false;
        if (isSetEnd) {
          const setScoreText = setScoreFromNote ? String(setScoreFromNote.a) + " : " + String(setScoreFromNote.b) : "";
          if (winnerIsA || (!winnerIsB && isTeamAOnly)) {
            leftNote = "本局胜利";
            leftSubNote = setScoreText;
          } else if (winnerIsB || (!winnerIsA && isTeamBOnly)) {
            rightNote = "本局胜利";
            rightSubNote = setScoreText;
          } else if (winnerRaw) {
            leftNote = "本局胜利";
            leftSubNote = setScoreText;
          } else {
            leftNote = renderedNote;
            leftSubNote = "";
          }
        } else if (isMatchStart) {
          leftNote = "比赛开始";
          leftSubNote = "";
          rightNote = "比赛开始";
          rightSubNote = "";
        } else if (isResultLocked) {
          const resultScoreText = resultScoreFromNote ? String(resultScoreFromNote.a) + " : " + String(resultScoreFromNote.b) : "";
          if (resultWinnerIsA || (!resultWinnerIsB && isTeamAOnly)) {
            leftNote = "比赛胜利";
            leftSubNote = resultScoreText;
          } else if (resultWinnerIsB || (!resultWinnerIsA && isTeamBOnly)) {
            rightNote = "比赛胜利";
            rightSubNote = resultScoreText;
          } else if (resultWinnerRaw) {
            leftNote = "比赛胜利";
            leftSubNote = resultScoreText;
          } else {
            leftNote = renderedNote;
            leftSubNote = "";
          }
        } else if (isManualSwitchSides) {
          leftNote = "手动换边";
          leftSubNote = "";
          rightNote = "手动换边";
          rightSubNote = "";
        } else if (isDecidingAutoSwitchSides) {
          leftNote = "自动换边";
          leftSubNote = "决胜局";
          rightNote = "自动换边";
          rightSubNote = "决胜局";
        } else if (isSwitchSides || isSharedEvent) {
          leftNote = renderedNote;
          leftSubNote = "";
          rightNote = renderedNote;
          rightSubNote = "";
        } else if (isTeamAOnly) {
          if (isScoreAdd && scoreFromNote) {
            leftNote = "得分 +1";
            leftSubNote = "";
            leftScoreBadgeText = String(scoreFromNote.a || "");
            leftScoreBadgeRgb = teamARGB;
            leftScoreBadgeAlpha = "1";
          } else if (isTimeoutStart) {
            const timeoutCount = extractTimeoutCountFromText(rawNote);
            leftNote = timeoutCount ? "暂停 (" + timeoutCount + "/2)" : "暂停";
            leftSubNote = "";
          } else if (isManualRotate) {
            leftNote = "手动轮转";
            leftSubNote = "";
          } else if (isSubstitutionAction(action, renderedNote)) {
            const sub = parseSubstitutionSwap(renderedNote);
            leftNote = getSubstitutionTypeLabel(renderedNote, action);
            if (sub) {
              leftSubSwap = true;
              leftSubType = sub.hideType ? "" : sub.typeLabel;
              leftSubUpNo = sub.upNo;
              leftSubDownNo = sub.downNo;
              leftSubNote = "";
            } else {
              leftSubNote = "";
            }
          } else {
            leftNote = renderedNote;
            leftSubNote = "";
          }
        } else if (isTeamBOnly) {
          if (isScoreAdd && scoreFromNote) {
            rightNote = "得分 +1";
            rightSubNote = "";
            rightScoreBadgeText = String(scoreFromNote.b || "");
            rightScoreBadgeRgb = teamBRGB;
            rightScoreBadgeAlpha = "1";
          } else if (isTimeoutStart) {
            const timeoutCount = extractTimeoutCountFromText(rawNote);
            rightNote = timeoutCount ? "暂停 (" + timeoutCount + "/2)" : "暂停";
            rightSubNote = "";
          } else if (isManualRotate) {
            rightNote = "手动轮转";
            rightSubNote = "";
          } else if (isSubstitutionAction(action, renderedNote)) {
            const sub = parseSubstitutionSwap(renderedNote);
            rightNote = getSubstitutionTypeLabel(renderedNote, action);
            if (sub) {
              rightSubSwap = true;
              rightSubType = sub.hideType ? "" : sub.typeLabel;
              rightSubUpNo = sub.upNo;
              rightSubDownNo = sub.downNo;
              rightSubNote = "";
            } else {
              rightSubNote = "";
            }
          } else {
            rightNote = renderedNote;
            rightSubNote = "";
          }
        } else {
          leftNote = renderedNote;
          leftSubNote = "";
        }
        const hasLeftNote = !!leftNote;
        const hasRightNote = !!rightNote;
        const hasLeftSub = !!leftSubNote || leftSubSwap;
        const hasRightSub = !!rightSubNote || rightSubSwap;
        const hasLeftPlaceholder = !hasLeftNote;
        const hasRightPlaceholder = !hasRightNote;
        const showLeftBadge = !!leftScoreBadgeText;
        const showRightBadge = !!rightScoreBadgeText;
        const leftPillClass = "result-log-pill result-log-pill-left" + (showLeftBadge ? " has-badge" : "");
        const rightPillClass = "result-log-pill result-log-pill-right" + (showRightBadge ? " has-badge" : "");
        const leftTextClass = "result-log-pill-text " + (hasLeftSub ? "has-sub" : "single-line");
        const rightTextClass = "result-log-pill-text " + (hasRightSub ? "has-sub" : "single-line");
        const leftBadgeClass =
          "result-log-score-badge result-log-score-badge-left" + (leftScoreBadgeNeutral ? " is-neutral" : "");
        const rightBadgeClass =
          "result-log-score-badge result-log-score-badge-right" + (rightScoreBadgeNeutral ? " is-neutral" : "");
        const leftBadgeStyle =
          "background: rgba(" + String(leftScoreBadgeRgb || "var(--gray-500-rgb)") + ", " + String(leftScoreBadgeAlpha || "1") + ");";
        const rightBadgeStyle =
          "background: rgba(" + String(rightScoreBadgeRgb || "var(--gray-500-rgb)") + ", " + String(rightScoreBadgeAlpha || "1") + ");";
        return {
          id: String(item.id || ""),
          rowKey: "set-" + String(targetSet) + "-" + String(idx) + "-" + String(Math.max(0, Number(item.ts) || 0)),
          leftNote,
          leftSubNote,
          rightNote,
          rightSubNote,
          leftScoreBadgeText,
          leftScoreBadgeRgb,
          leftScoreBadgeAlpha,
          rightScoreBadgeText,
          rightScoreBadgeRgb,
          rightScoreBadgeAlpha,
          leftScoreBadgeNeutral,
          rightScoreBadgeNeutral,
          hasLeftNote,
          hasRightNote,
          hasLeftSub,
          hasRightSub,
          hasLeftPlaceholder,
          hasRightPlaceholder,
          showLeftBadge,
          showRightBadge,
          leftPillClass,
          rightPillClass,
          leftTextClass,
          rightTextClass,
          leftBadgeClass,
          rightBadgeClass,
          leftBadgeStyle,
          rightBadgeStyle,
          leftSubSwap,
          rightSubSwap,
          leftSubType,
          rightSubType,
          leftSubUpNo,
          rightSubUpNo,
          leftSubDownNo,
          rightSubDownNo,
          timeText: formatLogTime(item.ts),
          setTimeText: formatSetElapsedTime(setStartTs, item.ts),
        };
      });
  },

  buildScoreProgressBySet(logs: MatchLogItem[], setNo: number): ScoreProgressData {
    const targetSet = toSetNo(setNo, 1);
    const hiddenOpIds = new Set<string>();
    (logs || []).forEach((item) => {
      if (String(item && item.action ? item.action : "") !== "score_undo") {
        return;
      }
      const revertedOpId = String((item as any).revertedOpId || "");
      if (revertedOpId) {
        hiddenOpIds.add(revertedOpId);
      }
    });

    const seq: ("A" | "B")[] = [];
    (logs || []).forEach((item) => {
      const action = String(item && item.action ? item.action : "");
      const note = String(item && item.note ? item.note : "");
      const opId = String((item as any).opId || "");
      if (opId && hiddenOpIds.has(opId)) {
        return;
      }
      const isScoreAdd = action === "score_add" || note.indexOf("+1") >= 0;
      if (!isScoreAdd) {
        return;
      }
      const noteSetNo = extractSetNoFromText(note);
      const itemSetNo = toSetNo(item && (item as any).setNo, noteSetNo || 1);
      if (itemSetNo !== targetSet) {
        return;
      }
      const team = item && (item.team === "A" || item.team === "B") ? item.team : "";
      if (!team) {
        return;
      }
      seq.push(team);
    });

    if (!seq.length) {
      return { a: [], b: [], cols: 0, hasData: false };
    }

    return {
      a: seq.map((team) => (team === "A" ? 1 : 0)),
      b: seq.map((team) => (team === "B" ? 1 : 0)),
      cols: seq.length,
      hasData: true,
    };
  },

  buildScoreProgressRows(
    teamAName: string,
    teamBName: string,
    teamARGB: string,
    teamBRGB: string,
    progress: ScoreProgressData,
    gapRpx: number
  ): ScoreProgressRowView[] {
    if (!progress || !progress.hasData || progress.cols <= 0) {
      return [];
    }
    const buildRow = (rowKey: string, teamName: string, rowData: number[], teamRgb: string): ScoreProgressRowView => {
      const trackStyle =
        "grid-template-columns: repeat(" +
        String(progress.cols) +
        ", minmax(0, 1fr)); column-gap: " +
        String(Math.max(0, Number(gapRpx) || 0)) +
        "rpx;";
      const cells: ScoreProgressCellView[] = (rowData || []).map((cell, idx) => {
        const isOn = Number(cell) > 0;
        return {
          cellKey: rowKey + "-" + String(idx),
          cellStyle: isOn ? "background: rgba(" + String(teamRgb) + ", 1);" : "background: rgba(var(--gray-500-rgb), 0.05);",
        };
      });
      return {
        rowKey,
        teamName,
        trackStyle,
        cells,
      };
    };
    return [buildRow("A", teamAName, progress.a, teamARGB), buildRow("B", teamBName, progress.b, teamBRGB)];
  },

  applySetView(setNo: number) {
    const targetSet = toSetNo(setNo, 1);
    const summary = this.setSummaryMap[targetSet];
    const durationText = summary && summary.durationText && summary.durationText !== "00:00" ? "局时间 " + summary.durationText : "";
    const displayLogs = this.getDisplayLogsBySet(this.allLogs, targetSet);
    const scoreProgress = this.buildScoreProgressBySet(this.allLogs, targetSet);
    const gapRpx = Math.max(0, Number(this.data.scoreProgressGapRpx) || 0);
    const scoreProgressRows = this.buildScoreProgressRows(
      String(this.data.teamAName || "甲"),
      String(this.data.teamBName || "乙"),
      String(this.data.teamARGB || "131, 122, 229"),
      String(this.data.teamBRGB || "76, 135, 222"),
      scoreProgress,
      gapRpx
    );
    const smallScoreAValue = summary ? Number(summary.smallScoreA) : NaN;
    const smallScoreBValue = summary ? Number(summary.smallScoreB) : NaN;
    const selectedSetLeadingTeam: "" | "A" | "B" =
      Number.isFinite(smallScoreAValue) && Number.isFinite(smallScoreBValue)
        ? smallScoreAValue > smallScoreBValue
          ? "A"
          : smallScoreBValue > smallScoreAValue
            ? "B"
            : ""
        : "";
    this.setData({
      selectedSetNo: targetSet,
      selectedSmallScoreA: summary ? summary.smallScoreA : "--",
      selectedSmallScoreB: summary ? summary.smallScoreB : "--",
      selectedSetLeadingTeam,
      selectedSetDurationText: durationText,
      scoreProgressRows,
      scoreProgressHasData: scoreProgress.hasData,
      scoreProgressEmpty: !scoreProgress.hasData,
      logs: Array.isArray(displayLogs) ? displayLogs : [],
    });
  },

  triggerResultSetContentSwitchAnimation() {
    if (this.resultSetContentSwitchTimer) {
      clearTimeout(this.resultSetContentSwitchTimer);
      this.resultSetContentSwitchTimer = 0;
    }
    const start = () => {
      this.setData({ resultSetContentSwitching: true });
      this.resultSetContentSwitchTimer = setTimeout(() => {
        this.resultSetContentSwitchTimer = 0;
        if (this.data.resultSetContentSwitching) {
          this.setData({ resultSetContentSwitching: false });
        }
      }, 320) as unknown as number;
    };
    if (this.data.resultSetContentSwitching) {
      this.setData({ resultSetContentSwitching: false }, start);
      return;
    }
    start();
  },

  isResultPageTop(): boolean {
    const pages = getCurrentPages();
    const top = pages.length ? pages[pages.length - 1] : null;
    const route = String((top && (top as any).route) || "");
    return route === "pages/result/result";
  },

  async ensureRoom(roomId: string) {
    if (!roomId || !this.pageActive) {
      return;
    }
    if (this.roomEnsureInFlight) {
      this.roomEnsurePending = true;
      return;
    }
    this.roomEnsureInFlight = true;
    try {
      const room = await forcePullRoomAsync(roomId);
      if (!room) {
        if (!this.pageActive || !this.isResultPageTop()) {
          return;
        }
        if (!this.statusRouteRedirecting) {
          this.statusRouteRedirecting = true;
          wx.showModal({
            title: "房间已失效",
            content: "该裁判团队不存在或已过期，请返回首页。",
            showCancel: false,
            confirmText: "返回首页",
            success: () => {
              wx.reLaunch({ url: "/pages/home/home" });
            },
            fail: () => {
              this.statusRouteRedirecting = false;
            },
          });
        }
        return;
      }
      if (room.status !== "result") {
        if (this.scheduleResultStatusRetry(roomId)) {
          return;
        }
        if (!this.pageActive || !this.isResultPageTop()) {
          return;
        }
        if (!this.statusRouteRedirecting) {
          this.statusRouteRedirecting = true;
          wx.reLaunch({
            url: "/pages/match/match?roomId=" + roomId,
            fail: () => {
              this.statusRouteRedirecting = false;
            },
          });
        }
        return;
      }
      this.clearResultStatusRetry();
      this.resultStatusRetryCount = 0;

      const teamAName = String(room.teamA && room.teamA.name ? room.teamA.name : "甲");
      const teamBName = String(room.teamB && room.teamB.name ? room.teamB.name : "乙");
      const aSetWins = Math.max(0, Number(room.match && room.match.aSetWins) || 0);
      const bSetWins = Math.max(0, Number(room.match && room.match.bSetWins) || 0);
      const bigScoreA = String(aSetWins);
      const bigScoreB = String(bSetWins);
      const bigScoreLeadingTeam: "" | "A" | "B" =
        aSetWins > bSetWins ? "A" : bSetWins > aSetWins ? "B" : "";
      const teamAColor = String((room.teamA && (room.teamA as any).color) || "#837ae5");
      const teamBColor = String((room.teamB && (room.teamB as any).color) || "#4c87de");
      const teamARGB = hexToRgbTriplet(teamAColor, "131, 122, 229");
      const teamBRGB = hexToRgbTriplet(teamBColor, "76, 135, 222");
      const winnerColor = aSetWins >= bSetWins ? teamAColor : teamBColor;
      const winnerRGB = hexToRgbTriplet(winnerColor);

      const incomingLogs = Array.isArray(room.match && room.match.logs)
        ? ((room.match && room.match.logs) as MatchLogItem[])
        : [];
      this.allLogs = normalizeLogsBySet(incomingLogs);

      const setSummaryMap: Record<number, SetSummaryItem> = {};
      const storedSetSummaries = (room.match as any).setSummaries || {};
      Object.keys(storedSetSummaries || {}).forEach((key) => {
        const s = storedSetSummaries[key] || {};
        const setNo = toSetNo(s.setNo, toSetNo(key, 1));
        setSummaryMap[setNo] = {
          setNo,
          teamAName: String(s.teamAName || teamAName),
          teamBName: String(s.teamBName || teamBName),
          smallScoreA: String(Math.max(0, Number(s.smallScoreA) || 0)),
          smallScoreB: String(Math.max(0, Number(s.smallScoreB) || 0)),
          winnerName: String(s.winnerName || ""),
          durationText: String(s.durationText || ""),
        };
      });
      this.allLogs.forEach((log: MatchLogItem) => {
        if (String(log.action) !== "set_end") {
          return;
        }
        const setNo = toSetNo(log.setNo, 1);
        const score = extractScoreFromText(log.note);
        const winnerName = extractWinnerFromText(log.note, teamAName, teamBName);
        const prev = setSummaryMap[setNo];
        const nextSmallA = score ? score.a : prev ? prev.smallScoreA : "--";
        const nextSmallB = score ? score.b : prev ? prev.smallScoreB : "--";
        setSummaryMap[setNo] = {
          setNo,
          teamAName,
          teamBName,
          smallScoreA: nextSmallA,
          smallScoreB: nextSmallB,
          winnerName: winnerName || (prev ? prev.winnerName : ""),
          durationText: prev ? prev.durationText : "",
        };
      });

      const endState = (room.match as any).setEndState;
      if (endState && endState.summary) {
        const s = endState.summary;
        const setNo = toSetNo(s.setNo, toSetNo((endState as any).setNo, 1));
        setSummaryMap[setNo] = {
          setNo,
          teamAName: String(s.teamAName || teamAName),
          teamBName: String(s.teamBName || teamBName),
          smallScoreA: String(Math.max(0, Number(s.smallScoreA) || 0)),
          smallScoreB: String(Math.max(0, Number(s.smallScoreB) || 0)),
          winnerName: String(s.winnerName || ""),
          durationText: String(s.durationText || ""),
        };
      }

      const setNoFromSummaries = Object.keys(setSummaryMap)
        .map((k) => toSetNo(k, 1))
        .reduce((max: number, n: number) => Math.max(max, n), 1);
      const setNoFromLogs = this.allLogs
        .map((item: MatchLogItem) => toSetNo(item.setNo, 1))
        .reduce((max: number, n: number) => Math.max(max, n), 1);
      const playedByWins = Math.max(
        1,
        (Number(room.match && room.match.aSetWins) || 0) + (Number(room.match && room.match.bSetWins) || 0)
      );
      const playedSets = Math.max(playedByWins, setNoFromSummaries, setNoFromLogs, 1);

      for (let i = 1; i <= playedSets; i += 1) {
        if (!setSummaryMap[i]) {
          setSummaryMap[i] = {
            setNo: i,
            teamAName,
            teamBName,
            smallScoreA: "--",
            smallScoreB: "--",
            winnerName: "",
            durationText: "",
          };
        }
      }

      this.resultExpireAt = Math.max(0, Number((room as any).resultExpireAt || 0));
      this.setSummaryMap = setSummaryMap;
      this.invalidateResultExportCache();

      const currentSelected = Number(this.data.selectedSetNo || 0);
      const selectedSetNo = currentSelected >= 1 && currentSelected <= playedSets ? currentSelected : playedSets;
      this.setData({
        teamAName,
        teamBName,
        teamARGB,
        teamBRGB,
        roomPassword: String((room as any).password || ""),
        winnerRGB,
        bigScoreA,
        bigScoreB,
        bigScoreLeadingTeam,
        setOptions: this.buildSetOptions(playedSets),
      });
      this.applySetView(selectedSetNo);
      this.refreshCountdownText();
      await this.loadScoreSheetFonts();
      void this.prepareScoreSheet(false).catch(() => {});
    } finally {
      this.roomEnsureInFlight = false;
      if (this.roomEnsurePending && this.pageActive) {
        this.roomEnsurePending = false;
        void this.ensureRoom(roomId);
      } else {
        this.roomEnsurePending = false;
      }
    }
  },

  onSelectSet(e: WechatMiniprogram.TouchEvent) {
    const setNo = toSetNo((e.currentTarget.dataset as { setNo?: number }).setNo, 1);
    if (setNo === this.data.selectedSetNo) {
      return;
    }
    this.setData({ resultSetContentSwitching: false }, () => {
      this.applySetView(setNo);
      this.triggerResultSetContentSwitchAnimation();
    });
  },

  onShareAppMessage() {
    const roomId = String(this.data.roomId || "");
    const roomPassword = String(this.data.roomPassword || "");
    const hasInvitePayload = /^\d{6}$/.test(roomId) && /^\d{6}$/.test(roomPassword);
    return {
      title: buildShareCardTitle(hasInvitePayload),
      path: hasInvitePayload ? buildJoinSharePath(roomId, roomPassword) : "/pages/result/result?roomId=" + roomId,
      imageUrl: SHARE_IMAGE_URL,
    };
  },

  onDownloadPageTap() {
    if (this.resultPageImagePreparingPromise) {
      wx.showToast({ title: "导出中", icon: "none" });
      return;
    }
    this.prepareResultPageImage(true).catch(() => {});
  },

  onScoreSheetTap() {
    if (this.scoreSheetTempFilePath) {
      wx.previewImage({
        current: this.scoreSheetTempFilePath,
        urls: [this.scoreSheetTempFilePath],
      });
      return;
    }
    if (this.isSheetGenerating) {
      wx.showToast({ title: "记分表生成中", icon: "none" });
      return;
    }
    this.prepareScoreSheet(true).catch(() => {});
  },

  buildResultExportSetView(setNo: number): ResultExportSetView {
    const targetSet = toSetNo(setNo, 1);
    const summary = this.setSummaryMap[targetSet];
    const smallScoreAValue = summary ? Number(summary.smallScoreA) : NaN;
    const smallScoreBValue = summary ? Number(summary.smallScoreB) : NaN;
    const leadingTeam: "" | "A" | "B" =
      Number.isFinite(smallScoreAValue) && Number.isFinite(smallScoreBValue)
        ? smallScoreAValue > smallScoreBValue
          ? "A"
          : smallScoreBValue > smallScoreAValue
            ? "B"
            : ""
        : "";
    const progress = this.buildScoreProgressBySet(this.allLogs, targetSet);
    return {
      setNo: targetSet,
      smallScoreA: summary ? summary.smallScoreA : "--",
      smallScoreB: summary ? summary.smallScoreB : "--",
      leadingTeam,
      durationText: summary && summary.durationText && summary.durationText !== "00:00" ? "局时间 " + summary.durationText : "",
      progress,
      logs: this.getDisplayLogsBySet(this.allLogs, targetSet),
    };
  },

  getResultExportPalette(): ResultExportPalette {
    const isDark = String((wx.getSystemInfoSync().theme || "light")).toLowerCase() === "dark";
    return isDark
      ? {
          pageBg: "#1b1d20",
          surface: "#000000",
          surfaceSoft: "#1b1d20",
          strongSurface: "#1b1d20",
          textMain: "#f5f6f8",
          textSecondary: "#c1c6ce",
          textMuted: "#a0a6b1",
          lineSoft: "#2f3237",
          badgeText: "#111315",
          activeChipBg: "#f5f6f8",
          activeChipText: "#111315",
          inactiveTrack: "rgba(92, 98, 112, 0.05)",
          signalUp: "#18be6a",
          signalDown: "#f7464e",
        }
      : {
          pageBg: "#ffffff",
          surface: "#f5f6f8",
          surfaceSoft: "#ececef",
          strongSurface: "#ffffff",
          textMain: "#111315",
          textSecondary: "#5c6270",
          textMuted: "#a0a6b1",
          lineSoft: "#dfe1e6",
          badgeText: "#f5f6f8",
          activeChipBg: "#111315",
          activeChipText: "#f5f6f8",
          inactiveTrack: "rgba(92, 98, 112, 0.05)",
          signalUp: "#18be6a",
          signalDown: "#f7464e",
        };
  },

  async prepareResultPageImage(previewAfterReady: boolean): Promise<string[]> {
    const currentTheme = String((wx.getSystemInfoSync().theme || "light")).toLowerCase();
    if (this.resultPageImagePaths.length && this.resultPageImageTheme === currentTheme) {
      if (previewAfterReady) {
        wx.previewImage({
          current: this.resultPageImagePaths[0],
          urls: this.resultPageImagePaths,
        });
      }
      return Promise.resolve(this.resultPageImagePaths);
    }
    if (this.resultPageImagePreparingPromise) {
      if (previewAfterReady) {
        wx.showLoading({ title: "生成中", mask: true });
      }
      return this.resultPageImagePreparingPromise
        .then((paths: string[]) => {
          if (previewAfterReady && paths.length) {
            wx.hideLoading();
            wx.previewImage({
              current: paths[0],
              urls: paths,
            });
          }
          return paths;
        })
        .catch((err: unknown) => {
          if (previewAfterReady) {
            wx.hideLoading();
            console.error("prepareResultPageImage reuse failed", err);
            wx.showToast({ title: getResultExportErrorText(err), icon: "none" });
          }
          throw err;
        });
    }
    if (previewAfterReady) {
      wx.showLoading({ title: "生成中", mask: true });
    }
    const promise: Promise<string[]> = this.generateLocalResultPageImages(currentTheme).then((imagePaths: string[]) => {
      if (!imagePaths.length) {
        throw new Error("write-result-image-failed");
      }
      this.resultPageImagePaths = imagePaths;
      this.resultPageImageTheme = currentTheme;
      return imagePaths;
    });
    this.resultPageImagePreparingPromise = promise;
    return promise
      .then((paths: string[]) => {
        if (previewAfterReady) {
          wx.hideLoading();
          wx.previewImage({
            current: paths[0],
            urls: paths,
          });
        }
        return paths;
      })
        .catch((err: unknown) => {
        if (previewAfterReady) {
          wx.hideLoading();
          console.error("prepareResultPageImage failed", err);
          wx.showToast({ title: getResultExportErrorText(err), icon: "none" });
        }
        throw err;
      })
      .finally(() => {
        this.resultPageImagePreparingPromise = null;
      });
  },

  async generateLocalResultPageImages(themeKey: string): Promise<string[]> {
    void themeKey;
    await this.loadScoreSheetFonts();
    const renderRes = await this.renderResultPageImages();
    if (!renderRes || !renderRes.imagePaths.length) {
      throw new Error("write-result-image-failed");
    }
    return renderRes.imagePaths;
  },

  async renderResultPageImages(): Promise<{
    imagePaths: string[];
    themeKey: string;
  }> {
    const setNos = Array.isArray(this.data.setOptions) && this.data.setOptions.length ? this.data.setOptions : [1];
    const exportSets = setNos.map((setNo) => this.buildResultExportSetView(setNo));
    const palette = this.getResultExportPalette();
    const themeKey = String((wx.getSystemInfoSync().theme || "light")).toLowerCase();
    const maxColumnsPerImage = Math.max(1, exportSets.length);
    const chunks: ResultExportSetView[][] = [];
    for (let i = 0; i < exportSets.length; i += Math.max(1, maxColumnsPerImage)) {
      chunks.push(exportSets.slice(i, i + Math.max(1, maxColumnsPerImage)));
    }
    const imagePaths: string[] = [];
    for (const chunk of chunks) {
      const chunkRes = await this.renderResultPageImageChunk(chunk, palette, themeKey);
      if (chunkRes.imagePath) {
        imagePaths.push(chunkRes.imagePath);
      }
    }
    return {
      imagePaths,
      themeKey,
    };
  },

  async renderResultPageImageChunk(
    exportSets: ResultExportSetView[],
    palette: ResultExportPalette,
    themeKey: string
  ): Promise<{
    imagePath: string;
    imageWidth: number;
    imageHeight: number;
    themeKey: string;
  }> {
    const columnWidth = 390;
    const columnGap = 24;
    const titleTop = 18;
    const titleHeight = 28;
    const titleBottomGap = 16;
    const globalScorePanelHeight = 120;
    const globalScorePanelBottomGap = 18;
    const contentPadX = 33;
    const contentBottom = 28;
    const sectionTopGap = 20;
    const sectionHeadFont = 16;
    const sectionHeadGap = 8;
    const progressBodyPaddingY = 21;
    const progressBodyPaddingX = 21;
    const progressTeamGap = 21;
    const progressRowGap = 10;
    const progressCellHeight = 16;
    const progressEmptyHeight = 34;
    const progressBodyRadius = 12;
    const teamRowGap = 9;
    const teamRowHeight = 18;
    const logListTopGap = 4;
    const logEmptyHeight = 28;
    const logRowPaddingY = 6;
    const logColLeftRightGap = 5;
    const logPillMinHeight = 40;
    const logPillPadH = 8;
    const logPillInnerPad = 5;
    const logPillBadgeSize = 22;
    const logPillBadgeOffset = 7;
    const logPillBadgeReserve = 32;
    const logPillRadius = 999;
    const pageWidth = exportSets.length * columnWidth + Math.max(0, exportSets.length - 1) * columnGap;
    const panelWidth = columnWidth - contentPadX * 2;

    const getProgressBodyHeight = (setView: ResultExportSetView): number => {
      if (!setView.progress.hasData) {
        return progressBodyPaddingY * 2 + progressEmptyHeight;
      }
      const rowsHeight = progressCellHeight * 2 + progressRowGap;
      return progressBodyPaddingY * 2 + rowsHeight;
    };

    const getSmallScorePanelHeight = (setView: ResultExportSetView): number => {
      return setView.durationText ? 105 : 87;
    };

    const getLogRowHeight = (row: DisplayLogRow): number => {
      return row.hasLeftSub || row.hasRightSub ? 58 : 52;
    };

    const getColumnHeight = (setView: ResultExportSetView): number => {
      let height = 0;
      height += 42;
      height += getSmallScorePanelHeight(setView);
      height += sectionTopGap + sectionHeadFont + sectionHeadGap + getProgressBodyHeight(setView);
      height += sectionTopGap + sectionHeadFont + teamRowGap + teamRowHeight + logListTopGap;
      if (setView.logs.length) {
        height += setView.logs.reduce((sum, row) => sum + getLogRowHeight(row) + logRowPaddingY * 2, 0);
      } else {
        height += logEmptyHeight;
      }
      return Math.ceil(height);
    };

    const columnHeights = exportSets.map((setView) => getColumnHeight(setView));
    const imageWidth = pageWidth;
    const headerHeight = titleTop + titleHeight + titleBottomGap + globalScorePanelHeight + globalScorePanelBottomGap;
    const imageHeight = Math.max(headerHeight + Math.max(...columnHeights) + contentBottom, 844);

    return new Promise((resolve, reject) => {
      wx.nextTick(() => {
        const query = wx.createSelectorQuery();
        query
          .select("#resultExportCanvas")
          .fields({ node: true, size: true })
          .exec((res) => {
            const canvasRef = (res && res[0] && (res[0] as any).node) || null;
            if (!canvasRef) {
              reject(new Error("result export canvas node not ready"));
              return;
            }
            const canvas = canvasRef as any;
            const ctx = canvas.getContext("2d") as any;
            // 真机原生层对导出位图缓冲有体积限制，结果页在多局并排时需要主动压到安全像素范围内。
            const preferredScale = (exportSets.length === 1 ? 3.8 : 3.1) * 1.5;
            const maxExportPixels = (exportSets.length === 1 ? 9_500_000 : 26_000_000) * 2.25;
            const maxCanvasEdge = (exportSets.length === 1 ? 5120 : 8192) * 1.5;
            const pixelLimitedScale = Math.sqrt(maxExportPixels / Math.max(1, imageWidth * imageHeight));
            const widthLimitedScale = maxCanvasEdge / Math.max(1, imageWidth);
            const heightLimitedScale = maxCanvasEdge / Math.max(1, imageHeight);
            const resolvedScale = Math.min(preferredScale, pixelLimitedScale, widthLimitedScale, heightLimitedScale);
            const renderScale = Math.max(0.55, Number.isFinite(resolvedScale) ? resolvedScale : 1);
            const exportPixelWidth = Math.max(1, Math.round(imageWidth * renderScale));
            const exportPixelHeight = Math.max(1, Math.round(imageHeight * renderScale));
            const actualScaleX = exportPixelWidth / Math.max(1, imageWidth);
            const actualScaleY = exportPixelHeight / Math.max(1, imageHeight);
            const systemFontFamily = RESULT_EXPORT_UI_FONT_FAMILY;
            canvas.width = exportPixelWidth;
            canvas.height = exportPixelHeight;
            ctx.scale(actualScaleX, actualScaleY);
            ctx.clearRect(0, 0, imageWidth, imageHeight);
            ctx.fillStyle = palette.pageBg;
            ctx.fillRect(0, 0, imageWidth, imageHeight);

            const drawText = (
              text: string,
              x: number,
              y: number,
              options: {
                align?: "left" | "right" | "center" | "start" | "end";
                baseline?: "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
                color?: string;
                fontSize?: number;
                fontWeight?: string;
                fontFamily?: string;
                maxWidth?: number;
              }
            ) => {
              ctx.save();
              ctx.textAlign = options.align || "left";
              ctx.textBaseline = options.baseline || "middle";
              ctx.fillStyle = options.color || palette.textMain;
              ctx.font =
                String(options.fontWeight || "400") +
                " " +
                String(options.fontSize || 14) +
                "px " +
                String(options.fontFamily || systemFontFamily);
              const finalText =
                typeof options.maxWidth === "number" ? fitTextWithEllipsis(ctx, text, options.maxWidth) : String(text || "");
              ctx.fillText(finalText, x, y);
              ctx.restore();
            };

            const drawTextBlock = (
              lines: Array<{
                text: string;
                fontSize: number;
                fontWeight: string;
                color: string;
                lineHeight: number;
                fontFamily?: string;
                maxWidth?: number;
              }>,
              x: number,
              y: number,
              height: number,
              align: "left" | "right" | "center"
            ) => {
              const visibleLines = lines.filter((item) => String(item.text || "").trim().length > 0);
              if (!visibleLines.length) {
                return;
              }
              const totalHeight = visibleLines.reduce((sum, item) => sum + item.lineHeight, 0);
              let cursorY = y + (height - totalHeight) / 2;
              visibleLines.forEach((item) => {
                drawText(item.text, x, cursorY + item.lineHeight / 2, {
                  align,
                  color: item.color,
                  fontSize: item.fontSize,
                  fontWeight: item.fontWeight,
                  fontFamily: item.fontFamily || systemFontFamily,
                  maxWidth: item.maxWidth,
                });
                cursorY += item.lineHeight;
              });
            };

            const drawScorePanel = (
              x: number,
              y: number,
              width: number,
              label: string,
              scoreA: string,
              scoreB: string,
              large: boolean,
              durationText: string
            ) => {
              const panelHeight = large ? 120 : durationText ? 105 : 87;
              fillCanvasRoundRect(ctx, x, y, width, panelHeight, 12, palette.surface);
              const panelCenterX = x + width / 2;
              drawText(label, panelCenterX, y + 18, {
                align: "center",
                color: palette.textSecondary,
                fontSize: 14,
                fontWeight: "700",
              });
              const compareY = y + 40;
              const compareInset = 14;
              const middleWidth = 20;
              const sideWidth = (width - compareInset * 2 - middleWidth) / 2;
              drawText(String(this.data.teamAName || "甲"), x + compareInset + sideWidth, compareY, {
                align: "right",
                color: palette.textSecondary,
                fontSize: 14,
                fontWeight: "600",
                maxWidth: sideWidth - 6,
              });
              drawText("vs", panelCenterX, compareY, {
                align: "center",
                color: palette.textSecondary,
                fontSize: 14,
                fontWeight: "600",
              });
              drawText(String(this.data.teamBName || "乙"), x + width - compareInset - sideWidth, compareY, {
                align: "left",
                color: palette.textSecondary,
                fontSize: 14,
                fontWeight: "600",
                maxWidth: sideWidth - 6,
              });
              const scoreFontSize = large ? 58 : 24;
              const scoreSepSize = large ? 32 : 20;
              const scoreY = y + (large ? 84 : 70);
              const scoreAText = String(scoreA || "--");
              const scoreBText = String(scoreB || "--");
              const sepText = "-";
              const gap = 10;
              const scoreAWidth = getBebasTextMetrics(scoreAText).width * scoreFontSize;
              const scoreBWidth = getBebasTextMetrics(scoreBText).width * scoreFontSize;
              const sepWidth = getBebasTextMetrics(sepText).width * scoreSepSize;
              const totalWidth = scoreAWidth + gap + sepWidth + gap + scoreBWidth;
              let cursorX = panelCenterX - totalWidth / 2;
              drawBebasText(ctx, scoreAText, cursorX, scoreY, {
                align: "left",
                color: palette.textMain,
                fontSize: scoreFontSize,
              });
              cursorX += scoreAWidth + gap;
              drawBebasText(ctx, sepText, cursorX, scoreY, {
                align: "left",
                color: palette.textMain,
                fontSize: scoreSepSize,
              });
              cursorX += sepWidth + gap;
              drawBebasText(ctx, scoreBText, cursorX, scoreY, {
                align: "left",
                color: palette.textMain,
                fontSize: scoreFontSize,
              });
              if (durationText) {
                drawText(durationText, panelCenterX, y + panelHeight - 14, {
                  align: "center",
                  color: palette.textMain,
                  fontSize: 14,
                  fontWeight: "600",
                });
              }
            };

            const drawSetHeader = (x: number, y: number, setNo: number) => {
              const chipWidth = 30;
              const chipHeight = 30;
              fillCanvasRoundRect(ctx, x, y, chipWidth, chipHeight, 15, palette.activeChipBg);
              drawBebasText(ctx, String(setNo), x + chipWidth / 2, y + chipHeight / 2 + 1, {
                align: "center",
                color: palette.activeChipText,
                fontSize: 12,
              });
              drawText("局", x + chipWidth + 8, y + chipHeight / 2 + 1, {
                color: palette.textMuted,
                fontSize: 13,
                fontWeight: "400",
              });
            };

            const drawProgressCard = (x: number, y: number, setView: ResultExportSetView) => {
              drawText("得分进程", x, y + sectionHeadFont / 2, {
                color: palette.textMain,
                fontSize: sectionHeadFont,
                fontWeight: "700",
              });
              const bodyY = y + sectionHeadFont + sectionHeadGap;
              const bodyHeight = getProgressBodyHeight(setView);
              fillCanvasRoundRect(ctx, x, bodyY, panelWidth, bodyHeight, progressBodyRadius, palette.surface);
              if (!setView.progress.hasData) {
                drawText("本局暂无得分进程", x + panelWidth / 2, bodyY + bodyHeight / 2, {
                  align: "center",
                  color: palette.textSecondary,
                  fontSize: 13,
                  fontWeight: "500",
                });
                return bodyY + bodyHeight;
              }
              const teamNameMaxWidth = 56;
              const trackX = x + progressBodyPaddingX + teamNameMaxWidth + progressTeamGap;
              const trackWidth = panelWidth - progressBodyPaddingX * 2 - teamNameMaxWidth - progressTeamGap;
              const rows = [
                {
                  teamName: String(this.data.teamAName || "甲"),
                  data: setView.progress.a,
                  color: "rgba(" + String(this.data.teamARGB || "131, 122, 229") + ", 1)",
                },
                {
                  teamName: String(this.data.teamBName || "乙"),
                  data: setView.progress.b,
                  color: "rgba(" + String(this.data.teamBRGB || "76, 135, 222") + ", 1)",
                },
              ];
              rows.forEach((row, rowIndex) => {
                const rowY = bodyY + progressBodyPaddingY + rowIndex * (progressCellHeight + progressRowGap);
                drawText(row.teamName, x + progressBodyPaddingX, rowY + progressCellHeight / 2, {
                  color: palette.textMain,
                  fontSize: 14,
                  fontWeight: "700",
                  maxWidth: teamNameMaxWidth,
                });
                const cols = Math.max(1, row.data.length);
                const maxGap = 2.6;
                const minVisibleCellWidth = 1.35;
                const minPixelWidth = 1 / Math.max(1, actualScaleX);
                const minCellWidth = Math.max(minVisibleCellWidth, minPixelWidth);
                const fitGap =
                  cols > 1 ? Math.max(0, (trackWidth - minCellWidth * cols) / (cols - 1)) : 0;
                const gap = cols > 1 ? Math.min(maxGap, fitGap) : 0;
                const cellWidth = cols > 1 ? (trackWidth - gap * (cols - 1)) / cols : trackWidth;
                const useContinuousBand = cellWidth < minCellWidth;
                row.data.forEach((cell, cellIndex) => {
                  const cellX = useContinuousBand
                    ? trackX + (trackWidth * cellIndex) / cols
                    : trackX + cellIndex * (cellWidth + gap);
                  const nextCellX = useContinuousBand
                    ? trackX + (trackWidth * (cellIndex + 1)) / cols
                    : cellX + cellWidth;
                  const pixelLeft = Math.round(cellX * actualScaleX) / actualScaleX;
                  const pixelRight = Math.round(nextCellX * actualScaleX) / actualScaleX;
                  const resolvedWidth = Math.max(minPixelWidth, pixelRight - pixelLeft);
                  fillCanvasRoundRect(
                    ctx,
                    pixelLeft,
                    rowY,
                    resolvedWidth,
                    progressCellHeight,
                    0,
                    Number(cell) > 0 ? row.color : palette.inactiveTrack
                  );
                });
              });
              return bodyY + bodyHeight;
            };

            const drawSwapArrow = (centerX: number, centerY: number, color: string, direction: "up" | "down") => {
              ctx.save();
              ctx.fillStyle = color;
              ctx.translate(centerX, centerY);
              if (direction === "down") {
                ctx.rotate(Math.PI);
              }
              const arrowWidth = 11;
              const arrowHeight = 10;
              const scale = Math.min(arrowWidth / 580.99, arrowHeight / 532.35);
              const xOffset = -580.99 / 2;
              const yOffset = -532.35 / 2;
              const px = (xValue: number) => (xValue + xOffset) * scale;
              const py = (yValue: number) => (yValue + yOffset) * scale;
              ctx.beginPath();
              ctx.moveTo(px(195.22), py(55.01));
              ctx.lineTo(px(14.91), py(367.32));
              ctx.bezierCurveTo(px(-27.44), py(440.66), px(25.49), py(532.32), px(110.19), py(532.32));
              ctx.lineTo(px(470.81), py(532.32));
              ctx.bezierCurveTo(px(555.51), py(532.32), px(608.44), py(440.63), px(566.09), py(367.32));
              ctx.lineTo(px(385.78), py(55.01));
              ctx.bezierCurveTo(px(343.44), py(-18.34), px(237.57), py(-18.34), px(195.22), py(55.01));
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            };

            const drawLogPill = (
              x: number,
              y: number,
              width: number,
              height: number,
              row: DisplayLogRow,
              side: "left" | "right"
            ) => {
              const hasNote = side === "left" ? row.hasLeftNote : row.hasRightNote;
              const hasPlaceholder = side === "left" ? row.hasLeftPlaceholder : row.hasRightPlaceholder;
              const hasBadge = side === "left" ? row.showLeftBadge : row.showRightBadge;
              if (!hasNote && !hasPlaceholder && !hasBadge) {
                return;
              }
              fillCanvasRoundRect(ctx, x, y, width, height, logPillRadius, palette.surface);
              if (!hasNote) {
                if (hasBadge) {
                  const badgeText = side === "left" ? row.leftScoreBadgeText : row.rightScoreBadgeText;
                  const badgeRgb = side === "left" ? row.leftScoreBadgeRgb : row.rightScoreBadgeRgb;
                  const badgeAlpha = side === "left" ? row.leftScoreBadgeAlpha : row.rightScoreBadgeAlpha;
                  const isNeutral = side === "left" ? row.leftScoreBadgeNeutral : row.rightScoreBadgeNeutral;
                  const badgeX = side === "left" ? x + width - logPillBadgeOffset - logPillBadgeSize : x + logPillBadgeOffset;
                  const badgeY = y + (height - logPillBadgeSize) / 2;
                  const badgeBg = isNeutral
                    ? "rgba(92, 98, 112, 0.25)"
                    : "rgba(" + String(badgeRgb || "92, 98, 112") + ", " + String(badgeAlpha || "1") + ")";
                  fillCanvasRoundRect(ctx, badgeX, badgeY, logPillBadgeSize, logPillBadgeSize, logPillBadgeSize / 2, badgeBg);
                  drawBebasText(ctx, badgeText, badgeX + logPillBadgeSize / 2, badgeY + logPillBadgeSize / 2 + 0.5, {
                    align: "center",
                    color: palette.badgeText,
                    fontSize: 10,
                  });
                }
                return;
              }
              const mainText = side === "left" ? row.leftNote : row.rightNote;
              const subText = side === "left" ? row.leftSubNote : row.rightSubNote;
              const hasSub = side === "left" ? row.hasLeftSub : row.hasRightSub;
              const isNeutral = side === "left" ? row.leftScoreBadgeNeutral : row.rightScoreBadgeNeutral;
              const badgeText = side === "left" ? row.leftScoreBadgeText : row.rightScoreBadgeText;
              const badgeRgb = side === "left" ? row.leftScoreBadgeRgb : row.rightScoreBadgeRgb;
              const badgeAlpha = side === "left" ? row.leftScoreBadgeAlpha : row.rightScoreBadgeAlpha;
              const isSwap = side === "left" ? row.leftSubSwap : row.rightSubSwap;
              const upNo = side === "left" ? row.leftSubUpNo : row.rightSubUpNo;
              const downNo = side === "left" ? row.leftSubDownNo : row.rightSubDownNo;
              const textX = side === "left" ? x + logPillPadH + logPillInnerPad : x + width - logPillPadH - logPillInnerPad;
              const textMaxWidth = width - logPillPadH * 2 - logPillInnerPad - (hasBadge ? logPillBadgeReserve : 0);
              const align = side === "left" ? "left" : "right";
              const mainLineHeight = 17;
              const subLineHeight = 14;
              const swapLineHeight = 14;
              if (!hasSub) {
                drawTextBlock(
                  [
                    {
                      text: mainText,
                      fontSize: 14,
                      fontWeight: "700",
                      color: palette.textMain,
                      lineHeight: mainLineHeight,
                      maxWidth: textMaxWidth,
                    },
                  ],
                  textX,
                  y,
                  height,
                  align
                );
              } else if (!isSwap) {
                drawTextBlock(
                  [
                    {
                      text: mainText,
                      fontSize: 14,
                      fontWeight: "700",
                      color: palette.textMain,
                      lineHeight: mainLineHeight,
                      maxWidth: textMaxWidth,
                    },
                    {
                      text: subText,
                      fontSize: 12,
                      fontWeight: "500",
                      color: palette.textSecondary,
                      lineHeight: subLineHeight,
                      maxWidth: textMaxWidth,
                    },
                  ],
                  textX,
                  y,
                  height,
                  align
                );
              } else {
                drawTextBlock(
                  [
                    {
                      text: mainText,
                      fontSize: 14,
                      fontWeight: "700",
                      color: palette.textMain,
                      lineHeight: mainLineHeight,
                      maxWidth: textMaxWidth,
                    },
                  ],
                  textX,
                  y + (height - (mainLineHeight + swapLineHeight)) / 2 - 1,
                  mainLineHeight,
                  align
                );
              }
              if (hasBadge) {
                const badgeX = side === "left" ? x + width - logPillBadgeOffset - logPillBadgeSize : x + logPillBadgeOffset;
                const badgeY = y + (height - logPillBadgeSize) / 2;
                const badgeBg = isNeutral
                  ? "rgba(92, 98, 112, 0.25)"
                  : "rgba(" + String(badgeRgb || "92, 98, 112") + ", " + String(badgeAlpha || "1") + ")";
                fillCanvasRoundRect(ctx, badgeX, badgeY, logPillBadgeSize, logPillBadgeSize, logPillBadgeSize / 2, badgeBg);
                drawBebasText(ctx, badgeText, badgeX + logPillBadgeSize / 2, badgeY + logPillBadgeSize / 2 + 0.5, {
                  align: "center",
                  color: palette.badgeText,
                  fontSize: 10,
                });
              }
              if (!hasSub) {
                return;
              }
              if (isSwap) {
                const baseY = y + height / 2 + (mainLineHeight + swapLineHeight) / 2 - 7;
                const arrowSize = 11;
                const actionGap = 2;
                const actionPairGap = 15;
                const numberFontSize = 12;
                const numberFont = "500 " + String(numberFontSize) + "px " + systemFontFamily;
                ctx.save();
                ctx.font = numberFont;
                const upText = fitTextWithEllipsis(ctx, upNo, Math.max(0, textMaxWidth - arrowSize - actionGap));
                const downText = fitTextWithEllipsis(ctx, downNo, Math.max(0, textMaxWidth - arrowSize - actionGap));
                let upWidth = ctx.measureText(upText).width;
                let downWidth = ctx.measureText(downText).width;
                const fixedWidth = arrowSize * 2 + actionGap * 2 + actionPairGap;
                const availableNumberWidth = Math.max(8, textMaxWidth - fixedWidth);
                if (upWidth + downWidth > availableNumberWidth) {
                  const halfWidth = Math.max(8, availableNumberWidth / 2);
                  const nextUpText = fitTextWithEllipsis(ctx, upText, halfWidth);
                  const nextDownText = fitTextWithEllipsis(ctx, downText, halfWidth);
                  upWidth = ctx.measureText(nextUpText).width;
                  downWidth = ctx.measureText(nextDownText).width;
                  const groupWidth = fixedWidth + upWidth + downWidth;
                  const groupX =
                    side === "left"
                      ? x + logPillPadH + logPillInnerPad
                      : x + width - logPillPadH - logPillInnerPad - groupWidth;
                  ctx.restore();
                  drawSwapArrow(groupX + arrowSize / 2, baseY, palette.signalUp, "up");
                  drawText(nextUpText, groupX + arrowSize + actionGap, baseY, {
                    color: palette.textSecondary,
                    fontSize: numberFontSize,
                    fontWeight: "500",
                  });
                  const downArrowX = groupX + arrowSize + actionGap + upWidth + actionPairGap;
                  drawSwapArrow(downArrowX + arrowSize / 2, baseY, palette.signalDown, "down");
                  drawText(nextDownText, downArrowX + arrowSize + actionGap, baseY, {
                    color: palette.textSecondary,
                    fontSize: numberFontSize,
                    fontWeight: "500",
                  });
                } else {
                  const groupWidth = fixedWidth + upWidth + downWidth;
                  const groupX =
                    side === "left"
                      ? x + logPillPadH + logPillInnerPad
                      : x + width - logPillPadH - logPillInnerPad - groupWidth;
                  ctx.restore();
                  drawSwapArrow(groupX + arrowSize / 2, baseY, palette.signalUp, "up");
                  drawText(upText, groupX + arrowSize + actionGap, baseY, {
                    color: palette.textSecondary,
                    fontSize: numberFontSize,
                    fontWeight: "500",
                  });
                  const downArrowX = groupX + arrowSize + actionGap + upWidth + actionPairGap;
                  drawSwapArrow(downArrowX + arrowSize / 2, baseY, palette.signalDown, "down");
                  drawText(downText, downArrowX + arrowSize + actionGap, baseY, {
                    color: palette.textSecondary,
                    fontSize: numberFontSize,
                    fontWeight: "500",
                  });
                }
              }
            };

            const drawLogSection = (x: number, y: number, setView: ResultExportSetView) => {
              drawText("比赛记录", x, y + sectionHeadFont / 2, {
                color: palette.textMain,
                fontSize: sectionHeadFont,
                fontWeight: "700",
              });
              const teamRowY = y + sectionHeadFont + teamRowGap;
              const leftWidth = panelWidth * 0.4;
              const timeWidth = panelWidth * 0.2;
              const rightWidth = panelWidth * 0.4;
              drawText(String(this.data.teamAName || "甲"), x + leftWidth / 2, teamRowY + teamRowHeight / 2, {
                align: "center",
                color: palette.textMain,
                fontSize: 14,
                fontWeight: "700",
                maxWidth: leftWidth - 10,
              });
              drawText(String(this.data.teamBName || "乙"), x + leftWidth + timeWidth + rightWidth / 2, teamRowY + teamRowHeight / 2, {
                align: "center",
                color: palette.textMain,
                fontSize: 14,
                fontWeight: "700",
                maxWidth: rightWidth - 10,
              });
              let cursorY = teamRowY + teamRowHeight + logListTopGap;
              if (!setView.logs.length) {
                drawText("暂无记录", x + panelWidth / 2, cursorY + logEmptyHeight / 2, {
                  align: "center",
                  color: palette.textSecondary,
                  fontSize: 13,
                  fontWeight: "400",
                });
                return cursorY + logEmptyHeight;
              }
              setView.logs.forEach((row) => {
                const rowHeight = getLogRowHeight(row);
                const pillHeight = Math.max(logPillMinHeight, rowHeight - 6);
                const pillY = cursorY + (rowHeight + logRowPaddingY * 2 - pillHeight) / 2;
                const leftX = x;
                const timeX = x + leftWidth;
                const rightX = timeX + timeWidth;
                const pillWidth = leftWidth - logColLeftRightGap * 2;
                drawLogPill(leftX, pillY, pillWidth, pillHeight, row, "left");
                drawLogPill(rightX + logColLeftRightGap * 2, pillY, pillWidth, pillHeight, row, "right");
                drawTextBlock(
                  [
                    {
                      text: row.timeText,
                      fontSize: 12,
                      fontWeight: "400",
                      color: palette.textSecondary,
                      lineHeight: 14,
                    },
                    {
                      text: row.setTimeText,
                      fontSize: 11,
                      fontWeight: "400",
                      color: palette.textSecondary,
                      lineHeight: 13,
                    },
                  ],
                  timeX + timeWidth / 2,
                  pillY,
                  pillHeight,
                  "center"
                );
                cursorY += rowHeight + logRowPaddingY * 2;
              });
              return cursorY;
            };

            exportSets.forEach((setView, index) => {
              const columnX = index * (columnWidth + columnGap);
              const contentX = columnX + contentPadX;
              let cursorY = headerHeight;
              drawSetHeader(contentX, cursorY, setView.setNo);
              cursorY += 42;
              drawScorePanel(
                contentX,
                cursorY,
                panelWidth,
                "本局比分",
                setView.smallScoreA,
                setView.smallScoreB,
                false,
                setView.durationText
              );
              cursorY += getSmallScorePanelHeight(setView);
              cursorY = drawProgressCard(contentX, cursorY + sectionTopGap, setView);
              cursorY = drawLogSection(contentX, cursorY + sectionTopGap, setView);
              if (index < exportSets.length - 1) {
                ctx.save();
                ctx.strokeStyle = palette.lineSoft;
                ctx.lineWidth = 1;
                const dividerX = columnX + columnWidth + columnGap / 2;
                const dividerTop = titleTop + titleHeight + titleBottomGap + globalScorePanelHeight + 8;
                ctx.beginPath();
                ctx.moveTo(dividerX, dividerTop);
                ctx.lineTo(dividerX, imageHeight - 12);
                ctx.stroke();
                ctx.restore();
              }
            });

            drawText("比赛结果", imageWidth / 2, titleTop + titleHeight / 2, {
              align: "center",
              color: palette.textMain,
              fontSize: 18,
              fontWeight: "600",
            });
            drawScorePanel(
              contentPadX,
              titleTop + titleHeight + titleBottomGap,
              imageWidth - contentPadX * 2,
              "比局",
              String(this.data.bigScoreA || "0"),
              String(this.data.bigScoreB || "0"),
              true,
              ""
            );

            wx.canvasToTempFilePath(
              {
                canvas,
                x: 0,
                y: 0,
                width: imageWidth,
                height: imageHeight,
                destWidth: exportPixelWidth,
                destHeight: exportPixelHeight,
                fileType: "png",
                quality: 1,
                success: (out) => {
                  const path = String((out && out.tempFilePath) || "");
                  if (!path) {
                    reject(new Error("empty export image path"));
                    return;
                  }
                  resolve({
                    imagePath: path,
                    imageWidth,
                    imageHeight,
                    themeKey,
                  });
                },
                fail: (err) => reject(err || new Error("export page image failed")),
              }
            );
          });
      });
    });
  },

  async loadScoreSheetFonts() {
    if (this.scoreSheetFontsReady) {
      return;
    }
    if (this.scoreSheetFontLoadPromise) {
      return this.scoreSheetFontLoadPromise;
    }
    this.scoreSheetFontLoadPromise = (async () => {
      this.scoreSheetFontFamily = this.scoreSheetSystemFamily;
      this.scoreSheetSetNoFamily = this.scoreSheetSystemFamily;
      this.scoreSheetScoreFamily = "Arial";
      for (const source of RESULT_EXPORT_BEBAS_FONT_SOURCES) {
        const loaded = await loadFontFaceAsync("BebasNeue", source);
        if (loaded) {
          this.scoreSheetScoreFamily = "BebasNeue";
          break;
        }
      }
      this.scoreSheetFontsReady = true;
    })().finally(() => {
      this.scoreSheetFontLoadPromise = null;
    });
    return this.scoreSheetFontLoadPromise;
  },

  buildScoreSheetRows(teamAName: string, teamBName: string): { setRows: ScoreSheetSetRow[]; total: ScoreSheetTotalRow } {
    const hiddenOpIds = new Set<string>();
    (this.allLogs || []).forEach((item: MatchLogItem) => {
      if (String(item.action || "") === "score_undo") {
        const reverted = String((item as any).revertedOpId || "");
        if (reverted) {
          hiddenOpIds.add(reverted);
        }
      }
    });

    const baseRows: ScoreSheetSetRow[] = Array.from({ length: 5 }).map((_, i) => {
      const setNo = i + 1;
      return {
        setNo,
        aTimeout: "0",
        aSubs: "0",
        aWin: "0",
        aPoints: "",
        bPoints: "",
        bWin: "0",
        bSubs: "0",
        bTimeout: "0",
      };
    });

    const teamSetCounts: Record<"A" | "B", Record<number, { timeout: number; subs: number }>> = {
      A: {},
      B: {},
    };
    const ensureTeamSetCount = (team: "A" | "B", setNo: number): { timeout: number; subs: number } => {
      if (!teamSetCounts[team]) {
        (teamSetCounts as any)[team] = {};
      }
      if (!teamSetCounts[team][setNo]) {
        teamSetCounts[team][setNo] = { timeout: 0, subs: 0 };
      }
      return teamSetCounts[team][setNo];
    };
    for (let setNo = 1; setNo <= 5; setNo += 1) {
      teamSetCounts.A[setNo] = { timeout: 0, subs: 0 };
      teamSetCounts.B[setNo] = { timeout: 0, subs: 0 };
    }

    (this.allLogs || []).forEach((item: MatchLogItem) => {
      const setNo = toSetNo(item.setNo, 1);
      if (setNo < 1 || setNo > 5) {
        return;
      }
      const opId = String((item as any).opId || "");
      if (opId && hiddenOpIds.has(opId)) {
        return;
      }
      const team = item.team === "A" || item.team === "B" ? item.team : "";
      if (!team) {
        return;
      }
      const action = String(item.action || "");
      if (action === "timeout") {
        ensureTeamSetCount(team, setNo).timeout += 1;
        return;
      }
      if (action.indexOf("sub_") === 0 || action.indexOf("substitution_") === 0) {
        ensureTeamSetCount(team, setNo).subs += 1;
      }
    });

    let totalAPoints = 0;
    let totalBPoints = 0;
    let totalATimeout = 0;
    let totalBTimeout = 0;
    let totalASubs = 0;
    let totalBSubs = 0;
    let totalAWins = 0;
    let totalBWins = 0;
    const winnerA = normalizeWinnerName(teamAName);
    const winnerB = normalizeWinnerName(teamBName);

    baseRows.forEach((row) => {
      const summary = this.setSummaryMap[row.setNo];
      if (summary && summary.smallScoreA !== "--" && summary.smallScoreB !== "--") {
        row.aPoints = String(Math.max(0, Number(summary.smallScoreA) || 0));
        row.bPoints = String(Math.max(0, Number(summary.smallScoreB) || 0));
        totalAPoints += Number(row.aPoints) || 0;
        totalBPoints += Number(row.bPoints) || 0;
        const wn = normalizeWinnerName(summary.winnerName || "");
        if (wn && wn === winnerA) {
          row.aWin = "1";
          row.bWin = "0";
          totalAWins += 1;
        } else if (wn && wn === winnerB) {
          row.aWin = "0";
          row.bWin = "1";
          totalBWins += 1;
        } else {
          row.aWin = "0";
          row.bWin = "0";
        }
      } else {
        row.aTimeout = "";
        row.aSubs = "";
        row.aWin = "";
        row.bPoints = "";
        row.bWin = "";
        row.bSubs = "";
        row.bTimeout = "";
      }

      const aCount = ensureTeamSetCount("A", row.setNo);
      const bCount = ensureTeamSetCount("B", row.setNo);
      if (summary && summary.smallScoreA !== "--" && summary.smallScoreB !== "--") {
        row.aTimeout = String(aCount.timeout);
        row.aSubs = String(aCount.subs);
        row.bSubs = String(bCount.subs);
        row.bTimeout = String(bCount.timeout);
      }
      totalATimeout += aCount.timeout;
      totalASubs += aCount.subs;
      totalBSubs += bCount.subs;
      totalBTimeout += bCount.timeout;
    });

    return {
      setRows: baseRows,
      total: {
        aTimeout: String(totalATimeout),
        aSubs: String(totalASubs),
        aWin: String(totalAWins),
        aPoints: String(totalAPoints),
        bPoints: String(totalBPoints),
        bWin: String(totalBWins),
        bSubs: String(totalBSubs),
        bTimeout: String(totalBTimeout),
      },
    };
  },

  async prepareScoreSheet(previewAfterReady: boolean): Promise<string> {
    if (this.scoreSheetTempFilePath) {
      if (previewAfterReady) {
        wx.previewImage({
          current: this.scoreSheetTempFilePath,
          urls: [this.scoreSheetTempFilePath],
        });
      }
      return Promise.resolve(this.scoreSheetTempFilePath);
    }
    if (this.scoreSheetPreparingPromise) {
      if (previewAfterReady) {
        wx.showLoading({ title: "生成中", mask: true });
      }
      return this.scoreSheetPreparingPromise
        .then((path: string) => {
          if (previewAfterReady && path) {
            wx.hideLoading();
            wx.previewImage({
              current: path,
              urls: [path],
            });
          }
          return path;
        })
        .catch((err: unknown) => {
          if (previewAfterReady) {
            wx.hideLoading();
            wx.showToast({ title: "生成失败，请重试", icon: "none" });
          }
          throw err;
        });
    }
    if (previewAfterReady) {
      wx.showLoading({ title: "生成中", mask: true });
    }
    await this.loadScoreSheetFonts();
    if (this.scoreSheetTempFilePath) {
      if (previewAfterReady) {
        wx.hideLoading();
        wx.previewImage({
          current: this.scoreSheetTempFilePath,
          urls: [this.scoreSheetTempFilePath],
        });
      }
      return this.scoreSheetTempFilePath;
    }
    if (this.scoreSheetPreparingPromise) {
      return this.scoreSheetPreparingPromise
        .then((path: string) => {
          if (previewAfterReady && path) {
            wx.hideLoading();
            wx.previewImage({
              current: path,
              urls: [path],
            });
          }
          return path;
        })
        .catch((err: unknown) => {
          if (previewAfterReady) {
            wx.hideLoading();
            wx.showToast({ title: "生成失败，请重试", icon: "none" });
          }
          throw err;
        });
    }
    this.isSheetGenerating = true;
    const drawWidth = 640;
    const drawHeight = 635;
    const exportWidth = 2560;
    const exportHeight = 2540;
    const generatePromise = new Promise<string>((resolve, reject) => {
      wx.nextTick(() => {
        const query = wx.createSelectorQuery();
        query
          .select("#scoreSheetCanvas")
          .fields({ node: true, size: true })
          .exec((res) => {
            const canvasRef = (res && res[0] && (res[0] as any).node) || null;
            if (!canvasRef) {
              reject(new Error("canvas node not ready"));
              return;
            }
            const canvas = canvasRef as any;
            const ctx = canvas.getContext("2d");
            const dpr = Math.max(1, Number(wx.getSystemInfoSync().pixelRatio || 1));
            const songti900Weight = "700";
            const songti700Weight = "500";
            canvas.width = drawWidth * dpr;
            canvas.height = drawHeight * dpr;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, drawWidth, drawHeight);
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, drawWidth, drawHeight);
            // 坐标以导出图(2560x2540)为基准，按比例映射到绘制画布(640x635)
            const scaleX = drawWidth / exportWidth;
            const scaleY = drawHeight / exportHeight;
            const frameX = 12 * 10;
            const frameY = 12 * 10;
            const frameW = 232 * 10;
            const frameH = 230 * 10;
            const frameLineWidth = 20;
            const thinLineWidth = 6;
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = frameLineWidth * Math.min(scaleX, scaleY);
            ctx.strokeRect(frameX * scaleX, frameY * scaleY, frameW * scaleX, frameH * scaleY);

            // 下面所有坐标均在粗框内部（导出图坐标系），再按比例映射
            const row1X = frameX;
            const row1Y = frameY;
            const row1W = frameW;
            const row1H = 22 * 10;
            ctx.lineWidth = thinLineWidth * Math.min(scaleX, scaleY);
            ctx.strokeRect(row1X * scaleX, row1Y * scaleY, row1W * scaleX, row1H * scaleY);

            const row2X = frameX;
            const row2Y = row1Y + row1H;
            const row2H = 24 * 10;
            const row2HalfW = row1W / 2;
            ctx.strokeRect(row2X * scaleX, row2Y * scaleY, row2HalfW * scaleX, row2H * scaleY);
            ctx.strokeRect((row2X + row2HalfW) * scaleX, row2Y * scaleY, row2HalfW * scaleX, row2H * scaleY);
            // 第2行两圆圈：22x22，细描边
            const abCircleD = 20 * 10;
            const abCircleR = abCircleD / 2;
            const abCircleInsetSide = 4 * 10;
            const abCircleInsetTB = 2 * 10;
            const abCircleCy = row2Y + abCircleInsetTB + abCircleR;
            const circleACx = row2X + row2HalfW - abCircleInsetSide - abCircleR;
            const circleBCx = row2X + row2HalfW + abCircleInsetSide + abCircleR;
            ctx.lineWidth = thinLineWidth * Math.min(scaleX, scaleY);
            ctx.beginPath();
            ctx.arc(circleACx * scaleX, abCircleCy * scaleY, abCircleR * Math.min(scaleX, scaleY), 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(circleBCx * scaleX, abCircleCy * scaleY, abCircleR * Math.min(scaleX, scaleY), 0, Math.PI * 2);
            ctx.stroke();
            // 圆圈内大号 A/B（与比分同一超粗数字字体族）
            const abGlyphY = abCircleCy + 2 * 10;
            ctx.fillStyle = "#000000";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${Math.round(176 * Math.min(scaleX, scaleY))}px "${this.scoreSheetScoreFamily}","Helvetica Neue","Arial",sans-serif`;
            ctx.fillText("A", circleACx * scaleX, abGlyphY * scaleY);
            ctx.fillText("B", circleBCx * scaleX, abGlyphY * scaleY);

            const bottomY = row2Y + row2H;
            ctx.lineWidth = frameLineWidth * Math.min(scaleX, scaleY);
            ctx.beginPath();
            ctx.moveTo(row2X * scaleX, bottomY * scaleY);
            ctx.lineTo((row2X + row1W) * scaleX, bottomY * scaleY);
            ctx.stroke();

            // 第3-9行：细线网格
            // 每行高20；列宽：1-3=20，4=24，5=64，6=24，7-9=20（均为用户坐标，已x10）
            const rowGridStartY = bottomY;
            const rowGridH = 20 * 10;
            const rowGridWidths = [20, 20, 20, 24, 64, 24, 20, 20, 20].map((v) => v * 10);
            const rowGridStartX = frameX;
            ctx.lineWidth = thinLineWidth * Math.min(scaleX, scaleY);
            for (let row = 0; row < 7; row += 1) {
              let cx = rowGridStartX;
              const cy = rowGridStartY + row * rowGridH;
              for (let col = 0; col < rowGridWidths.length; col += 1) {
                const cw = rowGridWidths[col];
                ctx.strokeRect(cx * scaleX, cy * scaleY, cw * scaleX, rowGridH * scaleY);
                cx += cw;
              }
            }

            // 第3行和第4行之间：粗线
            const yBetween3And4 = rowGridStartY + rowGridH;
            ctx.lineWidth = frameLineWidth * Math.min(scaleX, scaleY);
            ctx.beginPath();
            ctx.moveTo(frameX * scaleX, yBetween3And4 * scaleY);
            ctx.lineTo((frameX + frameW) * scaleX, yBetween3And4 * scaleY);
            ctx.stroke();

            // 4,5 到 9,5：整块粗框矩形（跨6行）
            const col5X = rowGridStartX + rowGridWidths[0] + rowGridWidths[1] + rowGridWidths[2] + rowGridWidths[3];
            const col5W = rowGridWidths[4];
            const row4Y = rowGridStartY + rowGridH;
            const row4To9H = rowGridH * 6;
            ctx.strokeRect(col5X * scaleX, row4Y * scaleY, col5W * scaleX, row4To9H * scaleY);

            // 第10行：高24，三段粗框（84 / 64 / 84）
            const row10Y = rowGridStartY + rowGridH * 7;
            const row10H = 24 * 10;
            const row10Widths = [84, 64, 84].map((v) => v * 10);
            let row10X = frameX;
            ctx.lineWidth = frameLineWidth * Math.min(scaleX, scaleY);
            row10Widths.forEach((w) => {
              ctx.strokeRect(row10X * scaleX, row10Y * scaleY, w * scaleX, row10H * scaleY);
              row10X += w;
            });
            const row10CellStarts = [frameX, frameX + row10Widths[0], frameX + row10Widths[0] + row10Widths[1]];

            // 最后一行：高20，满宽粗框
            const rowLastY = row10Y + row10H;
            const rowLastH = 20 * 10;
            ctx.strokeRect(frameX * scaleX, rowLastY * scaleY, frameW * scaleX, rowLastH * scaleY);

            // 第三行（3,*）标题文字
            const row3Labels = ["暂停", "换人", "胜负", "得分", "局时间", "得分", "胜负", "换人", "暂停"];
            const row3CenterY = rowGridStartY + rowGridH / 2;
            const row3NormalSize = 82;
            const row3MidSize = 102;
            // 第2行左右队名：与“局时间”同字体参数
            const teamNameY = row2Y + row2H / 2;
            const teamNamePad = 2 * 10;
            const teamNameLabel = "队名";
            const teamANameLabel = String(this.data.teamAName || "甲").trim() || "甲";
            const teamBNameLabel = String(this.data.teamBName || "乙").trim() || "乙";
            const teamNameGap = 2 * 10;
            const teamNameInnerPad = 2 * 10;
            ctx.fillStyle = "#000000";
            ctx.textBaseline = "middle";
            const teamLabelFont = `${songti900Weight} ${Math.round(row3MidSize * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
            ctx.font = teamLabelFont;
            ctx.textAlign = "left";
            ctx.fillText(teamNameLabel, (row2X + teamNamePad) * scaleX, teamNameY * scaleY);
            ctx.textAlign = "right";
            ctx.fillText(teamNameLabel, (row2X + row1W - teamNamePad) * scaleX, teamNameY * scaleY);
            const labelWidthPx = ctx.measureText(teamNameLabel).width;
            const leftNameStartPx = (row2X + teamNamePad) * scaleX + labelWidthPx + teamNameGap * scaleX;
            const rightNameEndPx = (row2X + row1W - teamNamePad) * scaleX - labelWidthPx - teamNameGap * scaleX;
            const leftNameMaxRightPx = (circleACx - abCircleR - teamNameInnerPad) * scaleX;
            const rightNameMinLeftPx = (circleBCx + abCircleR + teamNameInnerPad) * scaleX;
            const leftNameMaxWidthPx = Math.max(0, leftNameMaxRightPx - leftNameStartPx);
            const rightNameMaxWidthPx = Math.max(0, rightNameEndPx - rightNameMinLeftPx);
            const leftNameCenterPx = leftNameStartPx + leftNameMaxWidthPx / 2;
            const rightNameCenterPx = rightNameMinLeftPx + rightNameMaxWidthPx / 2;
            const trimTextToWidth = (raw: string, maxWidthPx: number): string => {
              if (!raw) return "";
              if (maxWidthPx <= 0) return "";
              if (ctx.measureText(raw).width <= maxWidthPx) return raw;
              let t = raw;
              while (t.length > 0 && ctx.measureText(t).width > maxWidthPx) {
                t = t.slice(0, -1);
              }
              return t;
            };
            const splitTeamNameLines = (raw: string): string[] => {
              const chars = Array.from(String(raw || ""));
              if (chars.length > 6) {
                const line1Count = Math.ceil(chars.length / 2);
                const line2Count = Math.floor(chars.length / 2);
                return [
                  chars.slice(0, line1Count).join(""),
                  chars.slice(line1Count, line1Count + line2Count).join(""),
                ].filter(Boolean);
              }
              return [chars.join("")];
            };
            const drawTeamNameLines = (linesRaw: string[], centerX: number, maxWidthPx: number): void => {
              const minScale = Math.min(scaleX, scaleY);
              const isMultiline = linesRaw.length > 1;
              const fontPx = Math.round((isMultiline ? 72 : 90) * minScale);
              const lineOffsetPx = isMultiline ? Math.round(40 * minScale) : 0;
              ctx.font = `700 ${fontPx}px ${this.scoreSheetSystemFamily}`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const lines = linesRaw.map((line) => trimTextToWidth(line, maxWidthPx));
              if (isMultiline) {
                if (lines[0]) ctx.fillText(lines[0], centerX, teamNameY * scaleY - lineOffsetPx);
                if (lines[1]) ctx.fillText(lines[1], centerX, teamNameY * scaleY + lineOffsetPx);
                return;
              }
              if (lines[0]) {
                ctx.fillText(lines[0], centerX, teamNameY * scaleY);
              }
            };
            drawTeamNameLines(splitTeamNameLines(teamANameLabel), leftNameCenterPx, leftNameMaxWidthPx);
            drawTeamNameLines(splitTeamNameLines(teamBNameLabel), rightNameCenterPx, rightNameMaxWidthPx);

            let row3CursorX = rowGridStartX;
            row3Labels.forEach((txt, idx) => {
              const cw = rowGridWidths[idx];
              const cx = row3CursorX + cw / 2;
              const isMid = idx === 4;
              const fontSize = isMid ? row3MidSize : row3NormalSize;
              ctx.font = `${songti900Weight} ${Math.round(fontSize * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
              ctx.fillStyle = "#000000";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(txt, cx * scaleX, row3CenterY * scaleY);
              row3CursorX += cw;
            });

            // 1,1 格：居中“比赛结果”，并拉开字间距
            const titleChars = ["比", "赛", "结", "果"];
            const titleFontSize = 120;
            const titleStep = 156; // 字距拉开（加大）
            const titleTotal = titleStep * (titleChars.length - 1);
            const titleCenterX = row1X + row1W / 2;
            const titleCenterY = row1Y + row1H / 2;
            const titleVisualOffsetY = 8; // 中文字形视觉中心通常略偏上，向下微调
            ctx.fillStyle = "#000000";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `${songti900Weight} ${Math.round(titleFontSize * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
            titleChars.forEach((ch, idx) => {
              const x = titleCenterX - titleTotal / 2 + idx * titleStep;
              ctx.fillText(ch, x * scaleX, (titleCenterY + titleVisualOffsetY) * scaleY);
            });

            // 最后一行左侧：胜队（左对齐，参数与标题一致）
            const winnerChars = ["胜", "队"];
            const winnerX = frameX + 16 * 10;
            const winnerY = rowLastY + rowLastH / 2;
            const winnerCharStep = titleStep * 1.5;
            ctx.fillStyle = "#000000";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.font = `${songti900Weight} ${Math.round(titleFontSize * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
            winnerChars.forEach((ch, idx) => {
              const x = winnerX + idx * winnerCharStep;
              ctx.fillText(ch, x * scaleX, winnerY * scaleY);
            });

            // 最后一行：胜队右侧写胜利队名（不带“队”字）
            const aWins = Math.max(0, Number(this.data.bigScoreA || 0));
            const bWins = Math.max(0, Number(this.data.bigScoreB || 0));
            const winnerNameRaw =
              aWins > bWins
                ? String(this.data.teamAName || "")
                : bWins > aWins
                  ? String(this.data.teamBName || "")
                  : "";
            const winnerName = winnerNameRaw.replace(/队$/u, "");
            if (winnerName) {
              const winnerNameGap = 8 * 10 * 1.5;
              const winnerNameX = winnerX + winnerCharStep * 2 + winnerNameGap;
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.font = `700 ${Math.round(88 * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
              ctx.fillText(winnerName, winnerNameX * scaleX, winnerY * scaleY);
            }

            // 最后一行右侧：比分（右对齐，左侧为胜方分）
            const scoreA = Math.max(0, Number(this.data.bigScoreA || 0));
            const scoreB = Math.max(0, Number(this.data.bigScoreB || 0));
            const leftWinScore = scoreA >= scoreB ? scoreA : scoreB;
            const rightLoseScore = scoreA >= scoreB ? scoreB : scoreA;
            const scoreText = String(leftWinScore) + " : " + String(rightLoseScore);
            const scoreX = frameX + frameW - 14 * 10;
            const scoreY = winnerY + 1 * 10;
            ctx.fillStyle = "#000000";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${Math.round(titleFontSize * Math.min(scaleX, scaleY))}px "${this.scoreSheetScoreFamily}","Helvetica Neue","Arial",sans-serif`;
            ctx.fillText(scoreText, scoreX * scaleX, scoreY * scaleY);

            // 第4-9行两侧数据（1-4格与6-9格）
            const metrics = this.buildScoreSheetRows(String(this.data.teamAName || "甲"), String(this.data.teamBName || "乙"));
            const leftCols = [0, 1, 2, 3];
            const rightCols = [5, 6, 7, 8];
            const getCellCenterX = (colIdx: number): number => {
              let x = rowGridStartX;
              for (let i = 0; i < colIdx; i += 1) {
                x += rowGridWidths[i];
              }
              return x + rowGridWidths[colIdx] / 2;
            };
            const rowDataToDraw = metrics.setRows.slice();
            rowDataToDraw.push({
              setNo: 6,
              aTimeout: metrics.total.aTimeout,
              aSubs: metrics.total.aSubs,
              aWin: metrics.total.aWin,
              aPoints: metrics.total.aPoints,
              bPoints: metrics.total.bPoints,
              bWin: metrics.total.bWin,
              bSubs: metrics.total.bSubs,
              bTimeout: metrics.total.bTimeout,
            });
            rowDataToDraw.forEach((row: ScoreSheetSetRow, idx: number) => {
              const cy = rowGridStartY + rowGridH * (idx + 1) + rowGridH / 2;
              const valsLeft = [row.aTimeout, row.aSubs, row.aWin, row.aPoints];
              const valsRight = [row.bPoints, row.bWin, row.bSubs, row.bTimeout];
              ctx.fillStyle = "#000000";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.font = `700 ${Math.round(92 * Math.min(scaleX, scaleY))}px "${this.scoreSheetMonoFamily}","Courier New","Roboto Mono","SFMono-Regular",monospace`;
              valsLeft.forEach((v, i) => {
                if (!v) return;
                ctx.fillText(v, getCellCenterX(leftCols[i]) * scaleX, cy * scaleY);
              });
              valsRight.forEach((v, i) => {
                if (!v) return;
                ctx.fillText(v, getCellCenterX(rightCols[i]) * scaleX, cy * scaleY);
              });
            });

            // 4-8行，第5列：第一遍（1..5 + 括号）
            const setNoLeftPad = 4 * 10;
            const setBracketRightPad = 4 * 10;
            for (let i = 0; i < 5; i += 1) {
              const cy = rowGridStartY + rowGridH * (i + 1) + rowGridH / 2;
              const noText = String(i + 1);
              ctx.fillStyle = "#000000";
              ctx.textBaseline = "middle";
              ctx.textAlign = "left";
              ctx.font = `${songti700Weight} ${Math.round(92 * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
              ctx.fillText(noText, (col5X + setNoLeftPad) * scaleX, cy * scaleY);

              ctx.textAlign = "right";
              ctx.font = `${songti700Weight} ${Math.round(84 * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
              ctx.fillText("(           )", (col5X + col5W - setBracketRightPad) * scaleX, cy * scaleY);
            }

            // 4-8行，第5列：第二遍（括号内分钟数，使用和两侧数字一致字体）
            for (let i = 0; i < 5; i += 1) {
              const setNo = i + 1;
              const summary = this.setSummaryMap[setNo];
              const mins = resolveSetDurationMinutes(
                String(summary && summary.durationText ? summary.durationText : ""),
                this.allLogs,
                setNo
              );
              if (!mins) {
                continue;
              }
              const cy = rowGridStartY + rowGridH * (i + 1) + rowGridH / 2;
              const minutesX = col5X + col5W / 2 + 10 * 10;
              ctx.fillStyle = "#000000";
              ctx.textBaseline = "middle";
              ctx.textAlign = "center";
              ctx.font = `700 ${Math.round(92 * Math.min(scaleX, scaleY))}px "${this.scoreSheetMonoFamily}","Courier New","Roboto Mono","SFMono-Regular",monospace`;
              ctx.fillText(mins, minutesX * scaleX, cy * scaleY);
            }

            // 9,5 与第10行三格：统一两行字号参数
            const summaryLine1FontPx = 74;
            const summaryLine2FontPx = 74;

            // 9,5：两行标题与占位（比赛用时 / (      分)）
            const durationCellCenterX = col5X + col5W / 2;
            const durationCellCenterY = rowGridStartY + rowGridH * 6 + rowGridH / 2;
            const durationLine1Y = durationCellCenterY - 34;
            const durationLine2Y = durationCellCenterY + 36;
            ctx.fillStyle = "#000000";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `${songti900Weight} ${Math.round(summaryLine1FontPx * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
            ctx.fillText("比赛用时", durationCellCenterX * scaleX, durationLine1Y * scaleY);
            ctx.font = `${songti900Weight} ${Math.round(summaryLine2FontPx * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
            ctx.fillText("(                分)", durationCellCenterX * scaleX, durationLine2Y * scaleY);
            // 比赛用时中的分钟数：单独用等宽字体叠加渲染（不与中文混排）
            const displayedSetMinutes = sumDisplayedSetMinutes(this.allLogs, this.setSummaryMap);
            if (displayedSetMinutes.hasAnySetMinutes) {
              const durationNumberOffsetX = -1 * 10;
              const durationNumberOffsetY = 1 * 10;
              ctx.font = `900 ${Math.round(summaryLine2FontPx * Math.min(scaleX, scaleY))}px "${this.scoreSheetMonoFamily}","Courier New","Roboto Mono","SFMono-Regular",monospace`;
              ctx.fillText(
                String(displayedSetMinutes.totalMinutes),
                (durationCellCenterX + durationNumberOffsetX) * scaleX,
                (durationLine2Y + durationNumberOffsetY) * scaleY
              );
            }

            // 第10行三格：开始/结束/总时间（两行）
            const row10Line1Y = row10Y + row10H * 0.34;
            const row10Line2Y = row10Y + row10H * 0.72;
            const row10Meta = [
              { w: row10Widths[0], title: "比赛开始时间", value: "         点        分" },
              { w: row10Widths[1], title: "比赛结束时间", value: "         点        分" },
              { w: row10Widths[2], title: "比赛总时间", value: "         时        分" },
            ];
            row10Meta.forEach((item, idx) => {
              const cx = row10CellStarts[idx] + item.w / 2;
              ctx.fillStyle = "#000000";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.font = `${songti900Weight} ${Math.round(summaryLine1FontPx * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
              ctx.fillText(item.title, cx * scaleX, row10Line1Y * scaleY);
              ctx.font = `${songti900Weight} ${Math.round(summaryLine2FontPx * Math.min(scaleX, scaleY))}px ${this.scoreSheetSystemFamily}`;
              ctx.fillText(item.value, cx * scaleX, row10Line2Y * scaleY);
            });
            // 第10行三格：数字单独用等宽字体叠加渲染（不与“点/分/时”混排）
            const matchTime = getMatchTimeStats(this.allLogs, this.setSummaryMap);
            const startDate = matchTime.startTs > 0 ? new Date(matchTime.startTs) : null;
            const endDate = matchTime.endTs > 0 ? new Date(matchTime.endTs) : null;
            const startHour = startDate ? pad2(startDate.getHours()) : "";
            const startMinute = startDate ? pad2(startDate.getMinutes()) : "";
            const endHour = endDate ? pad2(endDate.getHours()) : "";
            const endMinute = endDate ? pad2(endDate.getMinutes()) : "";
            const totalHour = matchTime.hasAnySetMinutes ? String(Math.floor(matchTime.totalMinutes / 60)) : "";
            const totalMinute = matchTime.hasAnySetMinutes ? pad2(matchTime.totalMinutes % 60) : "";
            const row10NumOffsetLeft = 15 * 10;
            const row10NumOffsetRight = 16 * 10;
            const drawRow10Numbers = (
              cx: number,
              hourText: string,
              minuteText: string,
              hourShiftX: number,
              minuteShiftX: number
            ) => {
              ctx.fillStyle = "#000000";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.font = `900 ${Math.round(summaryLine2FontPx * Math.min(scaleX, scaleY))}px "${this.scoreSheetMonoFamily}","Courier New","Roboto Mono","SFMono-Regular",monospace`;
              if (hourText) {
                ctx.fillText(hourText, (cx - row10NumOffsetLeft + hourShiftX) * scaleX, row10Line2Y * scaleY);
              }
              if (minuteText) {
                ctx.fillText(minuteText, (cx + row10NumOffsetRight + minuteShiftX) * scaleX, row10Line2Y * scaleY);
              }
            };
            const shiftLeft3 = -3 * 10;
            const shiftLeft2 = -2 * 10;
            const minuteExtraLeft2 = -3 * 10;
            drawRow10Numbers(
              row10CellStarts[0] + row10Widths[0] / 2,
              startHour,
              startMinute,
              shiftLeft3,
              shiftLeft3 + minuteExtraLeft2
            );
            drawRow10Numbers(
              row10CellStarts[1] + row10Widths[1] / 2,
              endHour,
              endMinute,
              shiftLeft2,
              shiftLeft3 + minuteExtraLeft2
            );
            drawRow10Numbers(
              row10CellStarts[2] + row10Widths[2] / 2,
              totalHour,
              totalMinute,
              shiftLeft3,
              shiftLeft3 + minuteExtraLeft2
            );
            wx.canvasToTempFilePath(
              {
                canvas,
                x: 0,
                y: 0,
                width: drawWidth,
                height: drawHeight,
                destWidth: exportWidth,
                destHeight: exportHeight,
                fileType: "png",
                quality: 1,
                success: (out) => {
                  const path = String((out && out.tempFilePath) || "");
                  if (!path) {
                    reject(new Error("empty temp path"));
                    return;
                  }
                  resolve(path);
                },
                fail: (err) => {
                  reject(err || new Error("export fail"));
                },
              }
            );
          });
      });
    });

    this.scoreSheetPreparingPromise = generatePromise;
    return generatePromise
      .then((path) => {
        this.scoreSheetTempFilePath = path;
        return path;
      })
      .then((path) => {
        if (previewAfterReady) {
          wx.hideLoading();
          wx.previewImage({
            current: path,
            urls: [path],
          });
        }
        return path;
      })
      .catch((err) => {
        if (previewAfterReady) {
          wx.hideLoading();
          wx.showToast({ title: "生成失败，请重试", icon: "none" });
        }
        throw err;
      })
      .finally(() => {
        this.isSheetGenerating = false;
        this.scoreSheetPreparingPromise = null;
      });
  },

  applyNavigationTheme() {
    applyNavigationBarTheme();
  },

  syncCustomNavTop() {
    const sys = wx.getSystemInfoSync();
    const fallback = Number(sys.statusBarHeight || 0) + 6;
    let navTop = fallback;
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (
        menu &&
        typeof menu.top === "number" &&
        typeof menu.height === "number" &&
        menu.top >= 0 &&
        menu.height > 0
      ) {
        navTop = menu.top - (44 - menu.height) / 2;
      }
    } catch (e) {}
    const roundedTop = Math.max(0, Math.round(navTop));
    this.setData({
      customNavTop: String(roundedTop) + "px",
      customNavOffset: String(roundedTop + 44) + "px",
    });
  },

  onBackTap() {
    wx.reLaunch({ url: "/pages/home/home" });
  },

  onBackPress() {
    wx.reLaunch({ url: "/pages/home/home" });
    return true;
  },

  startCountdown() {
    this.stopCountdown();
    this.refreshCountdownText();
    this.countdownTimer = setInterval(() => {
      this.refreshCountdownText();
    }, 30000) as unknown as number;
  },

  stopCountdown() {
    if (!this.countdownTimer) {
      return;
    }
    clearInterval(this.countdownTimer);
    this.countdownTimer = 0;
  },

  refreshCountdownText() {
    const expireAt = Math.max(0, Number(this.resultExpireAt || 0));
    if (!expireAt) {
      this.setData({ clearCountdownText: "" });
      return;
    }
    const remainMs = Math.max(0, expireAt - Date.now());
    const remainMin = Math.ceil(remainMs / 60000);
    const hours = Math.floor(remainMin / 60);
    const mins = remainMin % 60;
    const text =
      hours > 0
        ? "数据将在 " + String(hours) + " 小时 " + String(mins) + " 分钟后被清除，请自行做好数据留存。"
        : "数据将在 " + String(remainMin) + " 分钟后被清除，请自行做好数据留存。";
    this.setData({ clearCountdownText: text });
  },
});
