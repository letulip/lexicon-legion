// Day streak with an earned freeze budget (from Tense Titans). Pure.
export function freezeCap(streak) { return 1 + Math.floor((streak || 0) / 60); }
function grantWeekly(prevStreak, newStreak, freezes) {
  const crossed = Math.floor(newStreak / 7) - Math.floor((prevStreak || 0) / 7);
  return Math.min(freezeCap(newStreak), (freezes || 0) + Math.max(0, crossed));
}
// Returns { streak, froze, daysSaved, freezes, sameDay } for an ACTIVE day.
export function advanceStreak(prevStreak, lastDate, today, freezes = 0, DAY = 86400000) {
  const prev = prevStreak || 0, fz = freezes || 0;
  if (!lastDate) return { streak: 1, froze: false, daysSaved: 0, freezes: Math.min(freezeCap(1), fz), sameDay: false };
  if (lastDate === today) return { streak: prev, froze: false, daysSaved: 0, freezes: fz, sameDay: true };
  const dayDiff = Math.round((Date.parse(today) - Date.parse(lastDate)) / DAY);
  if (dayDiff <= 1) { const streak = prev + 1; return { streak, froze: false, daysSaved: 0, freezes: grantWeekly(prev, streak, fz), sameDay: false }; }
  const gap = dayDiff - 1;
  if (gap <= fz) { const streak = prev + 1; return { streak, froze: true, daysSaved: gap, freezes: grantWeekly(prev, streak, fz - gap), sameDay: false }; }
  return { streak: 1, froze: false, daysSaved: 0, freezes: 0, sameDay: false };
}
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
