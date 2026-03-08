import { getRoomAsync } from "../../utils/room-service";
import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

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

type DisplayLogItem = MatchLogItem & { timeText: string };

type SetSummaryItem = {
  setNo: number;
  teamAName: string;
  teamBName: string;
  smallScoreA: string;
  smallScoreB: string;
  winnerName: string;
  durationText: string;
};

function pad2(n: number): string {
  return n < 10 ? "0" + String(n) : String(n);
}

function formatLogTime(ts: number): string {
  const d = new Date(Number(ts) || 0);
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
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

function normalizeLogsBySet(logs: MatchLogItem[]): MatchLogItem[] {
  let cursorSetNo = 1;
  return (logs || []).map((item, idx) => {
    const action = String(item && item.action ? item.action : "");
    const note = String(item && item.note ? item.note : "");
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

Page({
  data: {
    roomId: "",
    customNavTop: "10px",
    customNavOffset: "54px",
    clearCountdownText: "",
    teamAName: "甲",
    teamBName: "乙",
    bigScoreA: "0",
    bigScoreB: "0",
    setOptions: [1] as number[],
    selectedSetNo: 1,
    selectedSmallScoreA: "--",
    selectedSmallScoreB: "--",
    selectedSetWinnerText: "",
    selectedSetDurationText: "",
    logs: [] as DisplayLogItem[],
  },
  themeOff: null as null | (() => void),
  countdownTimer: 0 as number,
  resultExpireAt: 0 as number,
  allLogs: [] as MatchLogItem[],
  setSummaryMap: {} as Record<number, SetSummaryItem>,

  onLoad(query: Record<string, string>) {
    this.applyNavigationTheme();
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
        wx.setNavigationBarTitle({ title: "" });
      });
    }
    const roomId = String((query && query.roomId) || "");
    if (!roomId) {
      wx.reLaunch({ url: "/pages/home/home" });
      return;
    }
    this.setData({ roomId });
    this.ensureRoom(roomId);
  },

  onShow() {
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
  },

  onHide() {
    this.stopCountdown();
  },

  onUnload() {
    this.stopCountdown();
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
  },

  buildSetOptions(playedSets: number): number[] {
    const count = Math.max(1, Number(playedSets || 1));
    return Array.from({ length: count }).map((_, i) => i + 1);
  },

  getDisplayLogsBySet(logs: MatchLogItem[], setNo: number): DisplayLogItem[] {
    const targetSet = toSetNo(setNo, 1);
    const teamAName = String(this.data.teamAName || "甲");
    const teamBName = String(this.data.teamBName || "乙");
    const hiddenOpIds = new Set<string>();
    (logs || []).forEach((item) => {
      const action = String(item && item.action ? item.action : "");
      const revertedOpId = String((item as any).revertedOpId || "");
      if (action === "score_undo" && revertedOpId) {
        hiddenOpIds.add(revertedOpId);
      }
    });
    return (logs || [])
      .filter((item) => {
        const action = String(item.action || "");
        if (
          action === "timeout_end" ||
          action === "next_set" ||
          action === "score_undo" ||
          action === "switch_sides_prompt"
        ) {
          return false;
        }
        const opId = String((item as any).opId || "");
        if (opId && hiddenOpIds.has(opId)) {
          return false;
        }
        const noteSetNo = extractSetNoFromText(String(item.note || ""));
        return toSetNo(item.setNo, noteSetNo || 1) === targetSet;
      })
      .slice()
      .reverse()
      .map((item) => {
        return {
          ...item,
          note: withTeamSuffixForDisplay(String(item.note || ""), teamAName, teamBName),
          timeText: formatLogTime(item.ts),
        };
      });
  },

  applySetView(setNo: number) {
    const targetSet = toSetNo(setNo, 1);
    const summary = this.setSummaryMap[targetSet];
    const winnerText = summary && summary.winnerName ? "本局" + summary.winnerName + "队胜" : "";
    const durationText = summary && summary.durationText && summary.durationText !== "00:00" ? "局时间 " + summary.durationText : "";
    this.setData({
      selectedSetNo: targetSet,
      selectedSmallScoreA: summary ? summary.smallScoreA : "--",
      selectedSmallScoreB: summary ? summary.smallScoreB : "--",
      selectedSetWinnerText: winnerText,
      selectedSetDurationText: durationText,
      logs: this.getDisplayLogsBySet(this.allLogs, targetSet),
    });
  },

  async ensureRoom(roomId: string) {
    const room = await getRoomAsync(roomId);
    if (!room) {
      wx.showModal({
        title: "房间已失效",
        content: "该裁判团队不存在或已过期，请返回首页。",
        showCancel: false,
        confirmText: "返回首页",
        success: () => {
          wx.reLaunch({ url: "/pages/home/home" });
        },
      });
      return;
    }
    if (room.status !== "result") {
      wx.redirectTo({ url: "/pages/match/match?roomId=" + roomId });
      return;
    }

    const teamAName = String(room.teamA && room.teamA.name ? room.teamA.name : "甲");
    const teamBName = String(room.teamB && room.teamB.name ? room.teamB.name : "乙");
    const bigScoreA = String(Math.max(0, Number(room.match && room.match.aSetWins) || 0));
    const bigScoreB = String(Math.max(0, Number(room.match && room.match.bSetWins) || 0));

    const incomingLogs = Array.isArray(room.match && room.match.logs) ? ((room.match && room.match.logs) as MatchLogItem[]) : [];
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
    this.allLogs.forEach((log) => {
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
      .reduce((max, n) => Math.max(max, n), 1);
    const setNoFromLogs = this.allLogs
      .map((item) => toSetNo(item.setNo, 1))
      .reduce((max, n) => Math.max(max, n), 1);
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

    const currentSelected = Number(this.data.selectedSetNo || 0);
    const selectedSetNo =
      currentSelected >= 1 && currentSelected <= playedSets ? currentSelected : playedSets;
    this.setData({
      teamAName,
      teamBName,
      bigScoreA,
      bigScoreB,
      setOptions: this.buildSetOptions(playedSets),
    });
    this.applySetView(selectedSetNo);
    this.refreshCountdownText();
  },

  onSelectSet(e: WechatMiniprogram.TouchEvent) {
    const setNo = toSetNo((e.currentTarget.dataset as { setNo?: number }).setNo, 1);
    if (setNo === this.data.selectedSetNo) {
      return;
    }
    this.applySetView(setNo);
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
