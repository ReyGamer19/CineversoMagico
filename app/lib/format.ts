export function formatRemaining(sec: number) {
  const totalMin = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `Quedan ${h} h ${m} min` : `Quedan ${m} min`;
}
