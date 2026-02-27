export const formatTime = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

  return (
    [year, month, day].map(formatNumber).join("/") +
    " " +
    [hour, minute, second].map(formatNumber).join(":")
  );
};

const formatNumber = (n: number) => {
  const s = n.toString();
  return s[1] ? s : "0" + s;
};

// mock球员号码池和初始站位
export function mockPlayers(team: "A" | "B") {
  // 6个主力+2个自由人
  const base = team === "A" ? 1 : 11;
  return [
    { number: base, pos: "I" },
    { number: base + 1, pos: "II" },
    { number: base + 2, pos: "III" },
    { number: base + 3, pos: "IV" },
    { number: base + 4, pos: "V" },
    { number: base + 5, pos: "VI" },
    { number: "?", pos: "L1" },
    { number: "?", pos: "L2" },
  ];
}
