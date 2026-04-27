const fs = require("fs");
const path = require("path");
const PDFDocument = require("./vendor/pdfkit.standalone");

const FONT_DIR = path.join(__dirname, "assets", "fonts");
const FONT_CJK_REGULAR = path.join(FONT_DIR, "NotoSansHans-Regular.otf");
const FONT_SCORE = path.join(FONT_DIR, "BebasNeue-NumRomanL-subset.ttf");
const FONT_CJK_REGULAR_BUFFER = fs.readFileSync(FONT_CJK_REGULAR);
const FONT_SCORE_BUFFER = fs.readFileSync(FONT_SCORE);

const LIGHT_PALETTE = {
  pageBg: "#ffffff",
  surface: "#f5f6f8",
  strongSurface: "#ffffff",
  textMain: "#111315",
  textSecondary: "#5c6270",
  textMuted: "#a0a6b1",
  lineSoft: "#dfe1e6",
  badgeText: "#f5f6f8",
  activeChipBg: "#111315",
  activeChipText: "#f5f6f8",
  inactiveTrack: "#eff1f5",
  signalUp: "#18be6a",
  signalDown: "#f7464e",
  neutralBadge: "#5c6270",
};

const DARK_PALETTE = {
  pageBg: "#1b1d20",
  surface: "#000000",
  strongSurface: "#1b1d20",
  textMain: "#f5f6f8",
  textSecondary: "#c1c6ce",
  textMuted: "#a0a6b1",
  lineSoft: "#2f3237",
  badgeText: "#111315",
  activeChipBg: "#f5f6f8",
  activeChipText: "#111315",
  inactiveTrack: "#23262b",
  signalUp: "#18be6a",
  signalDown: "#f7464e",
  neutralBadge: "#5c6270",
};

function pad2(n) {
  return n < 10 ? "0" + String(n) : String(n);
}

function toSetNo(val, fallback) {
  return Math.max(1, Number(val) || fallback || 1);
}

function normalizeHexColor(color, fallback) {
  const raw = String(color || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
}

function hexToRgb(hex, fallback) {
  const raw = String(hex || "").trim();
  const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) {
    return fallback || { r: 92, g: 98, b: 112 };
  }
  const c = m[1];
  return {
    r: parseInt(c.slice(0, 2), 16),
    g: parseInt(c.slice(2, 4), 16),
    b: parseInt(c.slice(4, 6), 16),
  };
}

function formatLogTime(ts) {
  const d = new Date(Number(ts) || 0);
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function formatSetElapsedTime(setStartTs, itemTs) {
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

function escapeRegExp(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSetNoFromText(text) {
  const match = String(text || "").match(/第\s*(\d+)\s*局/);
  if (!match) {
    return null;
  }
  return toSetNo(match[1], 1);
}

function normalizeSwapSymbolText(text) {
  return String(text || "")
    .replace(/\uFE0F/g, "")
    .replace(/\u2194\uFE0F/g, "\u2194")
    .replace(/自由人替换/g, "自由人常规换人");
}

function normalizeLogsBySet(logs) {
  let cursorSetNo = 1;
  return (Array.isArray(logs) ? logs : []).map((item, idx) => {
    const action = String(item && item.action ? item.action : "");
    const note = normalizeSwapSymbolText(String(item && item.note ? item.note : ""));
    const explicitSetNo = Number(item && item.setNo) || 0;
    const noteSetNo = extractSetNoFromText(note);
    let resolvedSetNo = explicitSetNo > 0 ? toSetNo(explicitSetNo, cursorSetNo) : 0;
    if (!resolvedSetNo) {
      if (action === "next_set" && noteSetNo) {
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
      note,
      setNo: resolvedSetNo,
      opId: String(item && item.opId ? item.opId : ""),
      revertedOpId: String(item && item.revertedOpId ? item.revertedOpId : ""),
    };
  });
}

function extractScoreFromText(text) {
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

function extractWinnerFromText(text, teamAName, teamBName) {
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

function withTeamSuffixForDisplay(noteRaw, teamANameRaw, teamBNameRaw) {
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

function normalizeWinnerName(name) {
  return String(name || "").replace(/\s+/g, "").replace(/队$/u, "");
}

function stripFullScoreForAddOneNote(note) {
  return String(note || "")
    .replace(/\s*[（(]\s*\d+\s*[:：]\s*\d+\s*[）)]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isSubstitutionAction(action, noteRaw) {
  const actionText = String(action || "");
  const note = String(noteRaw || "");
  return (
    actionText === "libero_swap" ||
    actionText.indexOf("sub_") === 0 ||
    actionText.indexOf("substitution_") === 0 ||
    note.indexOf("换人") >= 0
  );
}

function getSubstitutionTypeLabel(noteRaw) {
  const note = String(noteRaw || "");
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

function normalizeSwapToken(raw) {
  return String(raw || "")
    .replace(/[（(]\s*([^）)]+?)\s*[）)]/g, " $1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSubstitutionSwap(noteRaw) {
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
  const pairMatch = note.match(/([0-9?]{1,2}(?:\s*[（(][^）)]+[）)])?)\s*↔\s*([0-9?]{1,2}(?:\s*[（(][^）)]+[）)])?)/);
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

function extractTimeoutCountFromText(text) {
  const raw = String(text || "");
  const wrap = raw.match(/暂停[（(]\s*([0-9]+)\s*\/\s*2\s*[）)]/);
  if (wrap && wrap[1]) {
    return String(Number(wrap[1]));
  }
  return "";
}

function extractResultWinnerFromText(text, teamAName, teamBName) {
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

function buildScoreProgressBySet(logs, setNo) {
  const targetSet = toSetNo(setNo, 1);
  const hiddenOpIds = new Set();
  (Array.isArray(logs) ? logs : []).forEach((item) => {
    if (String(item && item.action ? item.action : "") !== "score_undo") {
      return;
    }
    const revertedOpId = String(item && item.revertedOpId ? item.revertedOpId : "");
    if (revertedOpId) {
      hiddenOpIds.add(revertedOpId);
    }
  });

  const seq = [];
  (Array.isArray(logs) ? logs : []).forEach((item) => {
    const action = String(item && item.action ? item.action : "");
    const note = String(item && item.note ? item.note : "");
    const opId = String(item && item.opId ? item.opId : "");
    if (opId && hiddenOpIds.has(opId)) {
      return;
    }
    const isScoreAdd = action === "score_add" || note.indexOf("+1") >= 0;
    if (!isScoreAdd) {
      return;
    }
    const noteSetNo = extractSetNoFromText(note);
    const itemSetNo = toSetNo(item && item.setNo, noteSetNo || 1);
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
}

function buildSetSummaryMap(room, teamAName, teamBName, allLogs) {
  const setSummaryMap = {};
  const storedSetSummaries = (room && room.match && room.match.setSummaries) || {};

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

  allLogs.forEach((log) => {
    if (String(log.action) !== "set_end") {
      return;
    }
    const setNo = toSetNo(log.setNo, 1);
    const score = extractScoreFromText(log.note);
    const winnerName = extractWinnerFromText(log.note, teamAName, teamBName);
    const prev = setSummaryMap[setNo];
    setSummaryMap[setNo] = {
      setNo,
      teamAName,
      teamBName,
      smallScoreA: score ? score.a : prev ? prev.smallScoreA : "--",
      smallScoreB: score ? score.b : prev ? prev.smallScoreB : "--",
      winnerName: winnerName || (prev ? prev.winnerName : ""),
      durationText: prev ? prev.durationText : "",
    };
  });

  const endState = room && room.match && room.match.setEndState;
  if (endState && endState.summary) {
    const s = endState.summary;
    const setNo = toSetNo(s.setNo, toSetNo(endState.setNo, 1));
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

  return setSummaryMap;
}

function getDisplayLogsBySet(logs, setNo, options) {
  const targetSet = toSetNo(setNo, 1);
  const teamAName = String(options.teamAName || "甲");
  const teamBName = String(options.teamBName || "乙");
  const teamAColor = String(options.teamAColor || "#837AE5");
  const teamBColor = String(options.teamBColor || "#4C87DE");
  let setStartTs = 0;

  (Array.isArray(logs) ? logs : []).forEach((item) => {
    if (String(item && item.action ? item.action : "") !== "timer_start") {
      return;
    }
    const noteSetNo = extractSetNoFromText(String(item && item.note ? item.note : ""));
    const itemSetNo = toSetNo(item && item.setNo, noteSetNo || 1);
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

  const hiddenOpIds = new Set();
  (Array.isArray(logs) ? logs : []).forEach((item) => {
    if (String(item && item.action ? item.action : "") !== "score_undo") {
      return;
    }
    const revertedOpId = String(item && item.revertedOpId ? item.revertedOpId : "");
    if (revertedOpId) {
      hiddenOpIds.add(revertedOpId);
    }
  });

  return (Array.isArray(logs) ? logs : [])
    .filter((item) => {
      const action = String(item && item.action ? item.action : "");
      const noteText = String(item && item.note ? item.note : "");
      const isSubAction =
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
        return false;
      }
      if (action === "switch_sides" && noteText.indexOf("局间配置换边") >= 0) {
        return false;
      }
      const opId = String(item && item.opId ? item.opId : "");
      if (opId && hiddenOpIds.has(opId)) {
        return false;
      }
      const noteSetNo = extractSetNoFromText(String(item && item.note ? item.note : ""));
      const itemSetNo = toSetNo(item && item.setNo, noteSetNo || 1);
      if (itemSetNo !== targetSet) {
        return false;
      }
      if (!isSubAction && setStartTs > 0 && (action === "rotate" || action === "switch_sides")) {
        const ts = Math.max(0, Number(item && item.ts) || 0);
        if (ts > 0 && ts < setStartTs) {
          return false;
        }
      }
      return true;
    })
    .slice()
    .reverse()
    .map((item, idx) => {
      const rawNote = String(item && item.note ? item.note : "");
      const normalizedNote = withTeamSuffixForDisplay(rawNote, teamAName, teamBName);
      const action = String(item && item.action ? item.action : "");
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
      const scoreFromNote = extractScoreFromText(rawNote);
      const setScoreFromNote = isSetEnd ? extractScoreFromText(rawNote) : null;
      const resultScoreFromNote = isResultLocked ? extractScoreFromText(rawNote) : null;
      const renderedNote = isScoreAdd ? stripFullScoreForAddOneNote(normalizedNote) : normalizedNote;
      const winnerRaw = isSetEnd ? extractWinnerFromText(rawNote, teamAName, teamBName) : "";
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
      let leftSubUpNo = "";
      let rightSubUpNo = "";
      let leftSubDownNo = "";
      let rightSubDownNo = "";
      let leftScoreBadgeText = "";
      let rightScoreBadgeText = "";
      let leftScoreBadgeColor = teamAColor;
      let rightScoreBadgeColor = teamBColor;
      let leftScoreBadgeAlpha = 1;
      let rightScoreBadgeAlpha = 1;
      let leftScoreBadgeNeutral = false;
      let rightScoreBadgeNeutral = false;

      if (isSetEnd) {
        const setScoreText = setScoreFromNote ? String(setScoreFromNote.a) + " - " + String(setScoreFromNote.b) : "";
        if (winnerIsA || (!winnerIsB && isTeamAOnly)) {
          leftNote = "本局胜利";
          leftSubNote = setScoreText;
        } else if (winnerIsB || (!winnerIsA && isTeamBOnly)) {
          rightNote = "本局胜利";
          rightSubNote = setScoreText;
        } else {
          leftNote = renderedNote;
        }
      } else if (isMatchStart) {
        leftNote = "比赛开始";
        rightNote = "比赛开始";
      } else if (isResultLocked) {
        const resultScoreText = resultScoreFromNote ? String(resultScoreFromNote.a) + " - " + String(resultScoreFromNote.b) : "";
        if (resultWinnerIsA || (!resultWinnerIsB && isTeamAOnly)) {
          leftNote = "比赛胜利";
          leftSubNote = resultScoreText;
        } else if (resultWinnerIsB || (!resultWinnerIsA && isTeamBOnly)) {
          rightNote = "比赛胜利";
          rightSubNote = resultScoreText;
        } else {
          leftNote = renderedNote;
        }
      } else if (isManualSwitchSides) {
        leftNote = "手动换边";
        rightNote = "手动换边";
      } else if (isDecidingAutoSwitchSides) {
        leftNote = "自动换边";
        leftSubNote = "决胜局";
        rightNote = "自动换边";
        rightSubNote = "决胜局";
      } else if (isSwitchSides || isSharedEvent) {
        leftNote = renderedNote;
        rightNote = renderedNote;
      } else if (isTeamAOnly) {
        if (isScoreAdd && scoreFromNote) {
          leftNote = "得分 +1";
          leftScoreBadgeText = String(scoreFromNote.a || "");
          rightScoreBadgeText = String(scoreFromNote.b || "");
          rightScoreBadgeAlpha = 0.25;
          rightScoreBadgeNeutral = true;
        } else if (isTimeoutStart) {
          const timeoutCount = extractTimeoutCountFromText(rawNote);
          leftNote = timeoutCount ? "暂停 (" + timeoutCount + "/2)" : "暂停";
        } else if (isManualRotate) {
          leftNote = "手动轮转";
        } else if (isSubstitutionAction(action, renderedNote)) {
          const sub = parseSubstitutionSwap(renderedNote);
          leftNote = getSubstitutionTypeLabel(renderedNote);
          if (sub) {
            leftSubSwap = true;
            leftSubUpNo = sub.upNo;
            leftSubDownNo = sub.downNo;
          }
        } else {
          leftNote = renderedNote;
        }
      } else if (isTeamBOnly) {
        if (isScoreAdd && scoreFromNote) {
          rightNote = "得分 +1";
          rightScoreBadgeText = String(scoreFromNote.b || "");
          leftScoreBadgeText = String(scoreFromNote.a || "");
          leftScoreBadgeAlpha = 0.25;
          leftScoreBadgeNeutral = true;
        } else if (isTimeoutStart) {
          const timeoutCount = extractTimeoutCountFromText(rawNote);
          rightNote = timeoutCount ? "暂停 (" + timeoutCount + "/2)" : "暂停";
        } else if (isManualRotate) {
          rightNote = "手动轮转";
        } else if (isSubstitutionAction(action, renderedNote)) {
          const sub = parseSubstitutionSwap(renderedNote);
          rightNote = getSubstitutionTypeLabel(renderedNote);
          if (sub) {
            rightSubSwap = true;
            rightSubUpNo = sub.upNo;
            rightSubDownNo = sub.downNo;
          }
        } else {
          rightNote = renderedNote;
        }
      } else {
        leftNote = renderedNote;
      }

      return {
        id: String(item && item.id ? item.id : "row-" + idx),
        rowKey: "set-" + String(targetSet) + "-" + String(idx),
        leftNote,
        leftSubNote,
        rightNote,
        rightSubNote,
        leftScoreBadgeText,
        rightScoreBadgeText,
        leftScoreBadgeColor,
        rightScoreBadgeColor,
        leftScoreBadgeAlpha,
        rightScoreBadgeAlpha,
        leftScoreBadgeNeutral,
        rightScoreBadgeNeutral,
        hasLeftNote: !!leftNote,
        hasRightNote: !!rightNote,
        hasLeftSub: !!leftSubNote || leftSubSwap,
        hasRightSub: !!rightSubNote || rightSubSwap,
        hasLeftPlaceholder: !leftNote,
        hasRightPlaceholder: !rightNote,
        showLeftBadge: !!leftScoreBadgeText,
        showRightBadge: !!rightScoreBadgeText,
        leftSubSwap,
        rightSubSwap,
        leftSubUpNo,
        rightSubUpNo,
        leftSubDownNo,
        rightSubDownNo,
        timeText: formatLogTime(item.ts),
        setTimeText: formatSetElapsedTime(setStartTs, item.ts),
      };
    });
}

function buildResultPdfModel(room) {
  const teamAName = String(room && room.teamA && room.teamA.name ? room.teamA.name : "甲");
  const teamBName = String(room && room.teamB && room.teamB.name ? room.teamB.name : "乙");
  const teamAColor = normalizeHexColor(room && room.teamA && room.teamA.color, "#837AE5");
  const teamBColor = normalizeHexColor(room && room.teamB && room.teamB.color, "#4C87DE");
  const aSetWins = Math.max(0, Number(room && room.match && room.match.aSetWins) || 0);
  const bSetWins = Math.max(0, Number(room && room.match && room.match.bSetWins) || 0);
  const allLogs = normalizeLogsBySet(Array.isArray(room && room.match && room.match.logs) ? room.match.logs : []);
  const setSummaryMap = buildSetSummaryMap(room, teamAName, teamBName, allLogs);
  const setNoFromSummaries = Object.keys(setSummaryMap)
    .map((k) => toSetNo(k, 1))
    .reduce((max, n) => Math.max(max, n), 1);
  const setNoFromLogs = allLogs
    .map((item) => toSetNo(item.setNo, 1))
    .reduce((max, n) => Math.max(max, n), 1);
  const playedByWins = Math.max(1, aSetWins + bSetWins);
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

  const sets = [];
  for (let setNo = 1; setNo <= playedSets; setNo += 1) {
    const summary = setSummaryMap[setNo];
    const smallScoreAValue = Number(summary && summary.smallScoreA);
    const smallScoreBValue = Number(summary && summary.smallScoreB);
    const leadingTeam =
      Number.isFinite(smallScoreAValue) && Number.isFinite(smallScoreBValue)
        ? smallScoreAValue > smallScoreBValue
          ? "A"
          : smallScoreBValue > smallScoreAValue
            ? "B"
            : ""
        : "";
    sets.push({
      setNo,
      smallScoreA: summary ? summary.smallScoreA : "--",
      smallScoreB: summary ? summary.smallScoreB : "--",
      leadingTeam,
      durationText: summary && summary.durationText && summary.durationText !== "00:00" ? "局时间 " + summary.durationText : "",
      progress: buildScoreProgressBySet(allLogs, setNo),
      logs: getDisplayLogsBySet(allLogs, setNo, {
        teamAName,
        teamBName,
        teamAColor,
        teamBColor,
      }),
    });
  }

  return {
    title: "比赛结果",
    teamAName,
    teamBName,
    teamAColor,
    teamBColor,
    bigScoreA: String(aSetWins),
    bigScoreB: String(bSetWins),
    sets,
  };
}

function fitText(doc, fontName, fontSize, text, maxWidth) {
  const raw = String(text || "");
  if (!raw || !(maxWidth > 0)) {
    return raw;
  }
  doc.font(fontName).fontSize(fontSize);
  if (doc.widthOfString(raw) <= maxWidth) {
    return raw;
  }
  const ellipsis = "...";
  const ellipsisWidth = doc.widthOfString(ellipsis);
  if (ellipsisWidth >= maxWidth) {
    return "";
  }
  let result = raw;
  while (result.length > 0 && doc.widthOfString(result) + ellipsisWidth > maxWidth) {
    result = result.slice(0, -1);
  }
  return result ? result + ellipsis : "";
}

function setFillOpacity(doc, opacity) {
  if (typeof opacity === "number" && opacity >= 0 && opacity <= 1) {
    doc.fillOpacity(opacity);
    return;
  }
  doc.fillOpacity(1);
}

function drawTextInBox(doc, options) {
  const text = fitText(doc, options.fontName, options.fontSize, options.text, options.width);
  doc.save();
  doc.font(options.fontName).fontSize(options.fontSize).fillColor(options.color);
  const lineHeight = doc.currentLineHeight(true);
  const y = options.y + Math.max(0, ((options.height || lineHeight) - lineHeight) / 2);
  doc.text(text, options.x, y, {
    width: options.width,
    align: options.align || "left",
    lineBreak: false,
    height: lineHeight,
  });
  doc.restore();
}

function drawCenteredScoreLine(doc, options) {
  doc.save();
  const scoreFont = options.scoreFont || "score";
  const scoreSize = options.scoreFontSize;
  const sepSize = options.sepFontSize;
  const leftText = String(options.leftText || "--");
  const rightText = String(options.rightText || "--");
  const sepText = "-";
  doc.font(scoreFont).fontSize(scoreSize);
  const leftWidth = doc.widthOfString(leftText);
  const rightWidth = doc.widthOfString(rightText);
  doc.font(scoreFont).fontSize(sepSize);
  const sepWidth = doc.widthOfString(sepText);
  const totalWidth = leftWidth + options.gap * 2 + sepWidth + rightWidth;
  let cursorX = options.x + (options.width - totalWidth) / 2;
  const lineHeight = Math.max(scoreSize, sepSize) * 1.05;
  const baseY = options.y + Math.max(0, (options.height - lineHeight) / 2);

  drawTextInBox(doc, {
    text: leftText,
    x: cursorX,
    y: baseY,
    width: leftWidth + 2,
    height: lineHeight,
    fontName: scoreFont,
    fontSize: scoreSize,
    color: options.color,
    align: "left",
  });
  cursorX += leftWidth + options.gap;
  drawTextInBox(doc, {
    text: sepText,
    x: cursorX,
    y: baseY,
    width: sepWidth + 2,
    height: lineHeight,
    fontName: scoreFont,
    fontSize: sepSize,
    color: options.color,
    align: "left",
  });
  cursorX += sepWidth + options.gap;
  drawTextInBox(doc, {
    text: rightText,
    x: cursorX,
    y: baseY,
    width: rightWidth + 2,
    height: lineHeight,
    fontName: scoreFont,
    fontSize: scoreSize,
    color: options.color,
    align: "left",
  });
  doc.restore();
}

function drawRoundedRect(doc, x, y, width, height, radius, fillColor, strokeColor) {
  doc.save();
  if (fillColor) {
    doc.fillColor(fillColor);
  }
  if (strokeColor) {
    doc.strokeColor(strokeColor);
  }
  const path = doc.roundedRect(x, y, width, height, radius);
  if (fillColor && strokeColor) {
    path.fillAndStroke();
  } else if (fillColor) {
    path.fill();
  } else if (strokeColor) {
    path.stroke();
  }
  doc.restore();
}

function drawTriangle(doc, centerX, centerY, color, direction) {
  doc.save();
  doc.fillColor(color);
  if (direction === "up") {
    doc
      .moveTo(centerX, centerY - 5)
      .lineTo(centerX - 5, centerY + 4)
      .lineTo(centerX + 5, centerY + 4)
      .closePath()
      .fill();
  } else {
    doc
      .moveTo(centerX, centerY + 5)
      .lineTo(centerX - 5, centerY - 4)
      .lineTo(centerX + 5, centerY - 4)
      .closePath()
      .fill();
  }
  doc.restore();
}

function drawScorePanel(doc, options) {
  const panelHeight = options.large ? 120 : options.durationText ? 105 : 87;
  drawRoundedRect(doc, options.x, options.y, options.width, panelHeight, 12, options.palette.surface, null);

  drawTextInBox(doc, {
    text: options.label,
    x: options.x + 12,
    y: options.y + 10,
    width: options.width - 24,
    height: 18,
    fontName: "cjk-medium",
    fontSize: 14,
    color: options.palette.textSecondary,
    align: "center",
  });

  const compareInset = 14;
  const middleWidth = 20;
  const sideWidth = (options.width - compareInset * 2 - middleWidth) / 2;
  const compareY = options.y + 30;
  drawTextInBox(doc, {
    text: options.teamAName,
    x: options.x + compareInset,
    y: compareY,
    width: sideWidth,
    height: 16,
    fontName: "cjk-medium",
    fontSize: 14,
    color: options.palette.textSecondary,
    align: "right",
  });
  drawTextInBox(doc, {
    text: "vs",
    x: options.x + compareInset + sideWidth,
    y: compareY,
    width: middleWidth,
    height: 16,
    fontName: "cjk-medium",
    fontSize: 14,
    color: options.palette.textSecondary,
    align: "center",
  });
  drawTextInBox(doc, {
    text: options.teamBName,
    x: options.x + compareInset + sideWidth + middleWidth,
    y: compareY,
    width: sideWidth,
    height: 16,
    fontName: "cjk-medium",
    fontSize: 14,
    color: options.palette.textSecondary,
    align: "left",
  });

  drawCenteredScoreLine(doc, {
    x: options.x,
    y: options.y + (options.large ? 46 : 40),
    width: options.width,
    height: options.large ? 48 : 38,
    leftText: options.scoreA,
    rightText: options.scoreB,
    color: options.palette.textMain,
    scoreFontSize: options.large ? 58 : 32,
    sepFontSize: options.large ? 32 : 26,
    gap: 10,
  });

  if (options.durationText) {
    drawTextInBox(doc, {
      text: options.durationText,
      x: options.x + 12,
      y: options.y + panelHeight - 24,
      width: options.width - 24,
      height: 16,
      fontName: "cjk-medium",
      fontSize: 14,
      color: options.palette.textMain,
      align: "center",
    });
  }

  return panelHeight;
}

function getProgressBodyHeight(setView) {
  const progressBodyPaddingY = 20;
  const progressRowGap = 10;
  const progressCellHeight = 16;
  const progressEmptyHeight = 34;
  if (!setView.progress.hasData) {
    return progressBodyPaddingY * 2 + progressEmptyHeight;
  }
  return progressBodyPaddingY * 2 + progressCellHeight * 2 + progressRowGap;
}

function getSmallScorePanelHeight(setView) {
  return setView.durationText ? 105 : 87;
}

function getLogRowHeight(row) {
  return row.hasLeftSub || row.hasRightSub ? 58 : 52;
}

function getColumnHeight(setView) {
  const setHeaderHeight = 42;
  const sectionTopGap = 20;
  const sectionHeadFont = 16;
  const sectionHeadGap = 8;
  const teamRowGap = 9;
  const teamRowHeight = 18;
  const logListTopGap = 4;
  const logEmptyHeight = 28;
  const logRowPaddingY = 6;
  let height = 0;
  height += setHeaderHeight;
  height += getSmallScorePanelHeight(setView);
  height += sectionTopGap + sectionHeadFont + sectionHeadGap + getProgressBodyHeight(setView);
  height += sectionTopGap + sectionHeadFont + teamRowGap + teamRowHeight + logListTopGap;
  if (setView.logs.length) {
    height += setView.logs.reduce((sum, row) => sum + getLogRowHeight(row) + logRowPaddingY * 2, 0);
  } else {
    height += logEmptyHeight;
  }
  return Math.ceil(height);
}

function drawSetHeader(doc, options) {
  drawRoundedRect(doc, options.x, options.y, 30, 30, 15, options.palette.activeChipBg, null);
  drawTextInBox(doc, {
    text: String(options.setNo),
    x: options.x,
    y: options.y + 1,
    width: 30,
    height: 28,
    fontName: "score",
    fontSize: 12,
    color: options.palette.activeChipText,
    align: "center",
  });
  drawTextInBox(doc, {
    text: "局",
    x: options.x + 38,
    y: options.y + 1,
    width: 20,
    height: 28,
    fontName: "cjk-regular",
    fontSize: 13,
    color: options.palette.textMuted,
    align: "left",
  });
}

function drawProgressCard(doc, options) {
  const panelWidth = options.panelWidth;
  const progressBodyPaddingY = 20;
  const progressBodyPaddingX = 21;
  const progressTeamGap = 21;
  const progressRowGap = 10;
  const progressCellHeight = 16;
  const progressBodyRadius = 12;
  const teamNameMaxWidth = 56;
  const sectionHeadFont = 16;
  const sectionHeadGap = 8;

  drawTextInBox(doc, {
    text: "得分进程",
    x: options.x,
    y: options.y,
    width: panelWidth,
    height: sectionHeadFont,
    fontName: "cjk-medium",
    fontSize: sectionHeadFont,
    color: options.palette.textMain,
    align: "left",
  });

  const bodyY = options.y + sectionHeadFont + sectionHeadGap;
  const bodyHeight = getProgressBodyHeight(options.setView);
  drawRoundedRect(doc, options.x, bodyY, panelWidth, bodyHeight, progressBodyRadius, options.palette.surface, null);

  if (!options.setView.progress.hasData) {
    drawTextInBox(doc, {
      text: "本局暂无得分进程",
      x: options.x + 20,
      y: bodyY + (bodyHeight - 20) / 2,
      width: panelWidth - 40,
      height: 20,
      fontName: "cjk-regular",
      fontSize: 13,
      color: options.palette.textSecondary,
      align: "center",
    });
    return bodyY + bodyHeight;
  }

  const trackX = options.x + progressBodyPaddingX + teamNameMaxWidth + progressTeamGap;
  const trackWidth = panelWidth - progressBodyPaddingX * 2 - teamNameMaxWidth - progressTeamGap;
  const rows = [
    {
      teamName: options.model.teamAName,
      data: options.setView.progress.a,
      color: options.model.teamAColor,
    },
    {
      teamName: options.model.teamBName,
      data: options.setView.progress.b,
      color: options.model.teamBColor,
    },
  ];

  rows.forEach((row, rowIndex) => {
    const rowY = bodyY + progressBodyPaddingY + rowIndex * (progressCellHeight + progressRowGap);
    drawTextInBox(doc, {
      text: row.teamName,
      x: options.x + progressBodyPaddingX,
      y: rowY,
      width: teamNameMaxWidth,
      height: progressCellHeight,
      fontName: "cjk-medium",
      fontSize: 14,
      color: options.palette.textMain,
      align: "left",
    });
    const cols = Math.max(1, row.data.length);
    const gap = 2.6;
    const cellWidth = cols > 1 ? (trackWidth - gap * (cols - 1)) / cols : trackWidth;
    row.data.forEach((cell, cellIndex) => {
      const cellX = trackX + cellIndex * (cellWidth + gap);
      drawRoundedRect(
        doc,
        cellX,
        rowY,
        cellWidth,
        progressCellHeight,
        0,
        Number(cell) > 0 ? row.color : options.palette.inactiveTrack,
        null
      );
    });
  });

  return bodyY + bodyHeight;
}

function drawBadge(doc, options) {
  doc.save();
  setFillOpacity(doc, options.isNeutral ? 0.25 : options.alpha);
  drawRoundedRect(doc, options.x, options.y, 22, 22, 11, options.isNeutral ? options.palette.neutralBadge : options.color, null);
  doc.restore();
  drawTextInBox(doc, {
    text: options.text,
    x: options.x,
    y: options.y + 1,
    width: 22,
    height: 20,
    fontName: "score",
    fontSize: 10,
    color: options.palette.badgeText,
    align: "center",
  });
}

function drawLogPill(doc, options) {
  const side = options.side;
  const row = options.row;
  const hasNote = side === "left" ? row.hasLeftNote : row.hasRightNote;
  const hasPlaceholder = side === "left" ? row.hasLeftPlaceholder : row.hasRightPlaceholder;
  const hasBadge = side === "left" ? row.showLeftBadge : row.showRightBadge;
  if (!hasNote && !(hasPlaceholder && hasBadge)) {
    return;
  }

  const width = options.width;
  const height = options.height;
  const x = options.x;
  const y = options.y;
  const padH = 8;
  const padV = 5;
  const innerPad = 5;
  const badgeReserve = hasBadge ? 32 : 0;
  const textX = side === "left" ? x + padH + innerPad : x + padH;
  const textWidth = width - padH * 2 - innerPad - badgeReserve;
  const mainText = side === "left" ? row.leftNote : row.rightNote;
  const subText = side === "left" ? row.leftSubNote : row.rightSubNote;
  const isSwap = side === "left" ? row.leftSubSwap : row.rightSubSwap;
  const upNo = side === "left" ? row.leftSubUpNo : row.rightSubUpNo;
  const downNo = side === "left" ? row.leftSubDownNo : row.rightSubDownNo;
  const hasSub = side === "left" ? row.hasLeftSub : row.hasRightSub;
  const badgeText = side === "left" ? row.leftScoreBadgeText : row.rightScoreBadgeText;
  const badgeColor = side === "left" ? row.leftScoreBadgeColor : row.rightScoreBadgeColor;
  const badgeAlpha = side === "left" ? row.leftScoreBadgeAlpha : row.rightScoreBadgeAlpha;
  const badgeNeutral = side === "left" ? row.leftScoreBadgeNeutral : row.rightScoreBadgeNeutral;

  drawRoundedRect(doc, x, y, width, height, Math.min(18, height / 2), options.palette.surface, null);

  if (hasNote) {
    if (!hasSub) {
      drawTextInBox(doc, {
        text: mainText,
        x: side === "left" ? textX : x + padH,
        y: y + 8,
        width: textWidth,
        height: height - 16,
        fontName: "cjk-medium",
        fontSize: 14,
        color: options.palette.textMain,
        align: side === "left" ? "left" : "right",
      });
    } else {
      drawTextInBox(doc, {
        text: mainText,
        x: side === "left" ? textX : x + padH,
        y: y + padV + 2,
        width: textWidth,
        height: 18,
        fontName: "cjk-medium",
        fontSize: 14,
        color: options.palette.textMain,
        align: side === "left" ? "left" : "right",
      });
      if (isSwap) {
        const baseY = y + height - 13;
        if (side === "left") {
          drawTriangle(doc, x + padH + innerPad + 6, baseY, options.palette.signalUp, "up");
          drawTextInBox(doc, {
            text: upNo,
            x: x + padH + innerPad + 16,
            y: baseY - 8,
            width: 56,
            height: 14,
            fontName: "cjk-regular",
            fontSize: 12,
            color: options.palette.textSecondary,
            align: "left",
          });
          drawTriangle(doc, x + padH + innerPad + 80, baseY, options.palette.signalDown, "down");
          drawTextInBox(doc, {
            text: downNo,
            x: x + padH + innerPad + 90,
            y: baseY - 8,
            width: 56,
            height: 14,
            fontName: "cjk-regular",
            fontSize: 12,
            color: options.palette.textSecondary,
            align: "left",
          });
        } else {
          drawTriangle(doc, x + width - padH - innerPad - 6, baseY, options.palette.signalUp, "up");
          drawTextInBox(doc, {
            text: upNo,
            x: x + width - padH - innerPad - 72,
            y: baseY - 8,
            width: 56,
            height: 14,
            fontName: "cjk-regular",
            fontSize: 12,
            color: options.palette.textSecondary,
            align: "right",
          });
          drawTriangle(doc, x + width - padH - innerPad - 80, baseY, options.palette.signalDown, "down");
          drawTextInBox(doc, {
            text: downNo,
            x: x + width - padH - innerPad - 146,
            y: baseY - 8,
            width: 56,
            height: 14,
            fontName: "cjk-regular",
            fontSize: 12,
            color: options.palette.textSecondary,
            align: "right",
          });
        }
      } else {
        drawTextInBox(doc, {
          text: subText,
          x: side === "left" ? textX : x + padH,
          y: y + height - 18,
          width: textWidth,
          height: 14,
          fontName: "cjk-regular",
          fontSize: 12,
          color: options.palette.textSecondary,
          align: side === "left" ? "left" : "right",
        });
      }
    }
  }

  if (hasBadge) {
    const badgeX = side === "left" ? x + width - 29 : x + 7;
    const badgeY = y + (height - 22) / 2;
    drawBadge(doc, {
      x: badgeX,
      y: badgeY,
      text: badgeText,
      color: badgeColor,
      alpha: badgeAlpha,
      isNeutral: badgeNeutral,
      palette: options.palette,
    });
  }
}

function drawLogSection(doc, options) {
  const panelWidth = options.panelWidth;
  const sectionHeadFont = 16;
  const teamRowGap = 9;
  const teamRowHeight = 18;
  const logListTopGap = 4;
  const logEmptyHeight = 28;
  const logRowPaddingY = 6;
  const leftWidth = panelWidth * 0.4;
  const timeWidth = panelWidth * 0.2;
  const rightWidth = panelWidth * 0.4;

  drawTextInBox(doc, {
    text: "比赛记录",
    x: options.x,
    y: options.y,
    width: panelWidth,
    height: sectionHeadFont,
    fontName: "cjk-medium",
    fontSize: sectionHeadFont,
    color: options.palette.textMain,
    align: "left",
  });

  const teamRowY = options.y + sectionHeadFont + teamRowGap;
  drawTextInBox(doc, {
    text: options.model.teamAName,
    x: options.x,
    y: teamRowY,
    width: leftWidth,
    height: teamRowHeight,
    fontName: "cjk-medium",
    fontSize: 14,
    color: options.palette.textMain,
    align: "center",
  });
  drawTextInBox(doc, {
    text: options.model.teamBName,
    x: options.x + leftWidth + timeWidth,
    y: teamRowY,
    width: rightWidth,
    height: teamRowHeight,
    fontName: "cjk-medium",
    fontSize: 14,
    color: options.palette.textMain,
    align: "center",
  });

  let cursorY = teamRowY + teamRowHeight + logListTopGap;
  if (!options.setView.logs.length) {
    drawTextInBox(doc, {
      text: "暂无记录",
      x: options.x + 20,
      y: cursorY + 4,
      width: panelWidth - 40,
      height: logEmptyHeight - 8,
      fontName: "cjk-regular",
      fontSize: 13,
      color: options.palette.textSecondary,
      align: "center",
    });
    return cursorY + logEmptyHeight;
  }

  options.setView.logs.forEach((row) => {
    const rowHeight = getLogRowHeight(row);
    const pillHeight = Math.max(40, rowHeight - 6);
    const pillY = cursorY + (rowHeight + logRowPaddingY * 2 - pillHeight) / 2;

    drawLogPill(doc, {
      x: options.x,
      y: pillY,
      width: leftWidth - 10,
      height: pillHeight,
      row,
      side: "left",
      palette: options.palette,
    });
    drawLogPill(doc, {
      x: options.x + leftWidth + timeWidth + 10,
      y: pillY,
      width: rightWidth - 10,
      height: pillHeight,
      row,
      side: "right",
      palette: options.palette,
    });

    drawTextInBox(doc, {
      text: row.timeText,
      x: options.x + leftWidth,
      y: cursorY + rowHeight / 2 - 9,
      width: timeWidth,
      height: 14,
      fontName: "cjk-regular",
      fontSize: 12,
      color: options.palette.textSecondary,
      align: "center",
    });
    drawTextInBox(doc, {
      text: row.setTimeText,
      x: options.x + leftWidth,
      y: cursorY + rowHeight / 2 + 4,
      width: timeWidth,
      height: 12,
      fontName: "cjk-regular",
      fontSize: 11,
      color: options.palette.textSecondary,
      align: "center",
    });

    cursorY += rowHeight + logRowPaddingY * 2;
  });

  return cursorY;
}

function buildPdfBuffer(room, theme) {
  if (!FONT_CJK_REGULAR_BUFFER || !FONT_SCORE_BUFFER) {
    throw new Error("result-pdf-fonts-missing");
  }

  const palette = String(theme || "").toLowerCase() === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const model = buildResultPdfModel(room);
  const columnWidth = 390;
  const columnGap = 24;
  const marginX = 24;
  const titleTop = 24;
  const titleHeight = 30;
  const titleBottomGap = 18;
  const globalScorePanelBottomGap = 18;
  const contentPadX = 33;
  const contentBottom = 28;
  const panelWidth = columnWidth - contentPadX * 2;

  const columnHeights = model.sets.map((setView) => getColumnHeight(setView));
  const pageWidth = marginX * 2 + model.sets.length * columnWidth + Math.max(0, model.sets.length - 1) * columnGap;
  const headerHeight = titleTop + titleHeight + titleBottomGap + 120 + globalScorePanelBottomGap;
  const pageHeight = Math.max(headerHeight + Math.max.apply(null, columnHeights) + contentBottom, 844);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [pageWidth, pageHeight],
      margin: 0,
      autoFirstPage: true,
      compress: true,
      info: {
        Title: "比赛结果",
        Author: "VolleyRef",
        Subject: "比赛结果导出",
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("cjk-regular", FONT_CJK_REGULAR_BUFFER);
    doc.registerFont("cjk-medium", FONT_CJK_REGULAR_BUFFER);
    doc.registerFont("score", FONT_SCORE_BUFFER);

    doc.rect(0, 0, pageWidth, pageHeight).fill(palette.pageBg);

    drawTextInBox(doc, {
      text: model.title,
      x: marginX,
      y: titleTop,
      width: pageWidth - marginX * 2,
      height: titleHeight,
      fontName: "cjk-medium",
      fontSize: 18,
      color: palette.textMain,
      align: "center",
    });

    drawScorePanel(doc, {
      x: marginX,
      y: titleTop + titleHeight + titleBottomGap,
      width: pageWidth - marginX * 2,
      label: "比局",
      scoreA: model.bigScoreA,
      scoreB: model.bigScoreB,
      large: true,
      durationText: "",
      teamAName: model.teamAName,
      teamBName: model.teamBName,
      palette,
    });

    const columnsTop = headerHeight;
    model.sets.forEach((setView, index) => {
      const columnX = marginX + index * (columnWidth + columnGap);
      const contentX = columnX + contentPadX;
      let cursorY = columnsTop;

      drawSetHeader(doc, {
        x: contentX,
        y: cursorY,
        setNo: setView.setNo,
        palette,
      });
      cursorY += 42;

      cursorY += drawScorePanel(doc, {
        x: contentX,
        y: cursorY,
        width: panelWidth,
        label: "本局比分",
        scoreA: setView.smallScoreA,
        scoreB: setView.smallScoreB,
        large: false,
        durationText: setView.durationText,
        teamAName: model.teamAName,
        teamBName: model.teamBName,
        palette,
      });

      cursorY = drawProgressCard(doc, {
        x: contentX,
        y: cursorY + 20,
        panelWidth,
        setView,
        palette,
        model,
      });

      cursorY = drawLogSection(doc, {
        x: contentX,
        y: cursorY + 20,
        panelWidth,
        setView,
        palette,
        model,
      });

      if (index < model.sets.length - 1) {
        doc.save();
        doc
          .strokeColor(palette.lineSoft)
          .lineWidth(1)
          .moveTo(columnX + columnWidth + columnGap / 2, 12)
          .lineTo(columnX + columnWidth + columnGap / 2, pageHeight - 12)
          .stroke();
        doc.restore();
      }
    });

    doc.end();
  });
}

async function exportResultPdf(roomId, room, theme) {
  const pdfBuffer = await buildPdfBuffer(room, theme);
  return {
    roomId: String(roomId || ""),
    pdfBase64: pdfBuffer.toString("base64"),
    size: pdfBuffer.length,
  };
}

module.exports = {
  buildPdfBuffer,
  exportResultPdf,
};
