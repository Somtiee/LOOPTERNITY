export function formatSurvivalTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s.toFixed(1)}s`;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
