import type { Channel, EpgItem, NowNext } from "./types";

const COUNTRY_TZ: Record<string, string> = {
  "Perú": "America/Lima",
  "Chile": "America/Santiago",
  "Argentina": "America/Argentina/Buenos_Aires",
  "España": "Europe/Madrid",
  "Ecuador": "America/Guayaquil",
  "Bolivia": "America/La_Paz",
  "Italia": "Europe/Rome",
};

export function tzCountryKey(c: Channel): string | undefined {
  return Object.keys(COUNTRY_TZ).find((k) => c.country.startsWith(k));
}

export function tzForChannel(c: Channel): string {
  const k = tzCountryKey(c);
  return k ? COUNTRY_TZ[k] : "America/Lima";
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesNow(tz: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value) % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    return h * 60 + m;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

export function parseSchedule(text: string): { items: EpgItem[]; invalid: string[] } {
  const items: EpgItem[] = [];
  const invalid: string[] = [];
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
    if (!m) { invalid.push(line); return; }
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) { invalid.push(line); return; }
    items.push({ t: `${String(h).padStart(2, "0")}:${m[2]}`, title: m[3].trim().slice(0, 80) });
  });
  items.sort((a, b) => toMin(a.t) - toMin(b.t));
  return { items, invalid };
}

// Calcula qué se transmite ahora y qué sigue, según la hora actual del canal (se repite cada día)
export function getNowNext(items: EpgItem[] | undefined, tz: string, now: Date): NowNext | null {
  if (!items || items.length === 0) return null;
  const nowMin = minutesNow(tz, now);
  let idx = -1;
  for (let i = 0; i < items.length; i++) {
    if (toMin(items[i].t) <= nowMin) idx = i;
  }
  if (idx === -1) idx = items.length - 1; // todavía no empieza el primero de hoy: sigue el último de ayer
  const current = items[idx];
  const next = items.length > 1 ? items[(idx + 1) % items.length] : null;
  const start = toMin(current.t);
  const end = next ? toMin(next.t) : start + 1440;
  const duration = ((end - start + 1440) % 1440) || 1440;
  const elapsed = (nowMin - start + 1440) % 1440;
  return { current, next, progress: Math.min(100, Math.max(0, (elapsed / duration) * 100)) };
}
