// index.ts
import { mockPlayers } from "../../utils/util";
Page({
  data: {
    roomId: "12345",
    teamAPlayers: [
      { number: 13, pos: "I" },
      { number: 11, pos: "II" },
      { number: 7, pos: "III" },
      { number: 3, pos: "IV" },
      { number: 17, pos: "V" },
      { number: 10, pos: "VI" },
      { number: "?", pos: "L1" },
      { number: "?", pos: "L2" },
    ],
    teamBPlayers: [
      { number: 13, pos: "I" },
      { number: 1, pos: "II" },
      { number: 8, pos: "III" },
      { number: 3, pos: "IV" },
      { number: 6, pos: "V" },
      { number: 15, pos: "VI" },
      { number: "?", pos: "L1" },
      { number: "?", pos: "L2" },
    ],
    matchSettings: {
      sets: 5,
      maxScore: 25,
      finalSetScore: 15,
    },
  },
  onSettingsConfirm(e: any) {
    this.setData({ matchSettings: e.detail });
  },
  onPlayerChangeA(e: any) {
    this.setData({ teamAPlayers: e.detail });
  },
  onPlayerChangeB(e: any) {
    this.setData({ teamBPlayers: e.detail });
  },
  onStartMatch() {
    wx.navigateTo({
      url: `/pages/match/match?roomId=${this.data.roomId}`,
    });
  },
});
