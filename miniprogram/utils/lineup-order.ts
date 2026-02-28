export type TeamCode = "A" | "B";
export type MainPosition = "I" | "II" | "III" | "IV" | "V" | "VI";

const SIDE_A_MAIN_ORDER: MainPosition[] = ["V", "IV", "VI", "III", "I", "II"];
const SIDE_B_MAIN_ORDER: MainPosition[] = ["II", "I", "III", "VI", "IV", "V"];

export function getMainOrderForTeam(team: TeamCode, teamASide: TeamCode): MainPosition[] {
  const isASide = team === "A" ? teamASide === "A" : teamASide === "B";
  return isASide ? SIDE_A_MAIN_ORDER : SIDE_B_MAIN_ORDER;
}

