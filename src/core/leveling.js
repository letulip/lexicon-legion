// Player XP, levels and ranks. Pure.
export const RANK_LEVELS = [3, 5, 7, 9, 11];
export const RANKS = ['Рекрут', 'Легионер', 'Декан', 'Центурион', 'Трибун', 'Легат'];
export const xpForLevel = (L) => 100 * (Math.pow(2, L - 1) - 1);
export const levelFromXp = (xp) => { let L = 1; while (xpForLevel(L + 1) <= xp) L++; return L; };
export const xpIntoLevel = (xp) => xp - xpForLevel(levelFromXp(xp));
export const xpForNextLevel = (xp) => { const L = levelFromXp(xp); return xpForLevel(L + 1) - xpForLevel(L); };
export function rankIndex(level) { let i = 0; for (const lv of RANK_LEVELS) if (level >= lv) i++; return i; }
export function rankTitle(level) { return RANKS[rankIndex(level)]; }
