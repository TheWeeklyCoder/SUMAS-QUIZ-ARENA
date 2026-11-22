// Study levels. A bank belongs to one level (banks saved before levels existed count as 100 level).
import { state } from "../state.js";
import { ls } from "./util.js";

export const LEVELS = [100, 200, 300];
export const levelLabel = (l) => `${l} level`;
export const bankLevel = (b) => (LEVELS.includes(Number(b?.level)) ? Number(b.level) : 100);
export const banksForLevel = (banks, level) => (banks || []).filter((b) => bankLevel(b) === level);
/** Levels that have at least one bank. The others are shown but cannot be picked yet. */
export const levelsWithBanks = (banks) => LEVELS.filter((l) => banksForLevel(banks, l).length > 0);

/** The student's level, or null when they have not chosen one. The phone copy covers a profile write that was refused or is still offline. */
export function myLevel() {
  const v = Number(state.profile?.level) || Number(ls("level_" + (state.user?.uid || "")));
  return LEVELS.includes(v) ? v : null;
}
