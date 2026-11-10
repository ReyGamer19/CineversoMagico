import { NextResponse, connection } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

// Estadísticas anónimas de Cineverso Mágico.
// Se guarda UN resumen por día en la tabla "catalog" (filas con id = AAAAMMDD, p. ej. 20261110).
// El catálogo de películas sigue en la fila id = 1, no se toca.

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_HASH = "29c7b21d3cde1ccfca37823fe7bb9eed806a4e2d145df2a531f1be576ee26031";
const noStore = { "Cache-Control": "no-store, max-age=0" };

const headers = (): Record<string, string> => {
  const h: Record<string, string> = { apikey: SERVICE_KEY, "Content-Type": "application/json" };
  if (SERVICE_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
};

function sameText(a: string, b: string) {
  const x = Buffer.from(a, "utf8"), y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
function passwordOk(p: unknown) {
  if (typeof p !== "string" || !p || p.length > 200) return false;
  if (ADMIN_PASSWORD && sameText(p, ADMIN_PASSWORD)) return true;
  if (/^[a-f0-9]{64}$/.test(ADMIN_HASH)) return sameText(createHash("sha256").update(p, "utf8").digest("hex"), ADMIN_HASH);
  return false;
}

// Día en hora de Lima (UTC-5), como número AAAAMMDD
function dayId(offsetDays = 0) {
  const d = new Date(Date.now() - 5 * 3600 * 1000 - offsetDays * 86400000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

type Day = {
  visits: number;
  loggedVisits: number;
  visitors: Record<string, 1>;
  devices: Record<string, number>;
  plays: Record<string, number>;
  completes: Record<string, number>;
  watchSecs: Record<string, number>;
  dropoff: Record<string, number[]>; // 10 tramos de 10 %
  titles: Record<string, string>;
};
const emptyDay = (): Day => ({ visits: 0, loggedVisits: 0, visitors: {}, devices: {}, plays: {}, completes: {}, watchSecs: {}, dropoff: {}, titles: {} });

async function readDay(id: number): Promise<Day> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${id}&select=data`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error("read");
  const rows = await res.json();
  const d = Array.isArray(rows) && rows[0] && rows[0].data && typeof rows[0].data === "object" ? rows[0].data : null;
  return Object.assign(emptyDay(), d || {});
}
async function writeDay(id: number, data: Day) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?on_conflict=id`, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error("write");
}

const cleanKey = (v: unknown, max = 60) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : "");

// REGISTRAR un evento (público, anónimo)
export async function POST(req: Request) {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) return NextResponse.json({ ok: false }, { status: 503, headers: noStore });
  let b: any;
  try { b = JSON.parse(await req.text()); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: noStore }); }
  const type = cleanKey(b?.type, 12);
  if (["visit", "play", "watch"].indexOf(type) === -1) return NextResponse.json({ ok: false }, { status: 400, headers: noStore });

  try {
    const id = dayId();
    const d = await readDay(id);
    if (type === "visit") {
      d.visits += 1;
      if (b.logged) d.loggedVisits += 1;
      const dev = ["tv", "mobile", "desktop"].indexOf(b.device) !== -1 ? b.device : "desktop";
      d.devices[dev] = (d.devices[dev] || 0) + 1;
      const vid = cleanKey(b.vid, 40);
      if (vid && Object.keys(d.visitors).length < 20000) d.visitors[vid] = 1;
    } else {
      const mid = cleanKey(b.movieId);
      if (!mid) return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
      if (b.title && Object.keys(d.titles).length < 3000) d.titles[mid] = cleanKey(b.title, 120);
      if (type === "play") d.plays[mid] = (d.plays[mid] || 0) + 1;
      if (type === "watch") {
        const pct = Math.max(0, Math.min(100, Number(b.pct) || 0));
        const secs = Math.max(0, Math.min(6 * 3600, Number(b.secs) || 0));
        d.watchSecs[mid] = (d.watchSecs[mid] || 0) + Math.round(secs);
        if (pct >= 90) d.completes[mid] = (d.completes[mid] || 0) + 1;
        else {
          const arr = d.dropoff[mid] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          arr[Math.min(9, Math.floor(pct / 10))] += 1;
          d.dropoff[mid] = arr;
        }
      }
    }
    await writeDay(id, d);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502, headers: noStore });
  }
}

// LEER el resumen (solo administrador). Cabecera: x-admin-key
export async function GET(req: Request) {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) return NextResponse.json({ error: "Servidor sin configurar" }, { status: 503, headers: noStore });
  if (!passwordOk(req.headers.get("x-admin-key") || "")) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401, headers: noStore });
  }
  const days = Math.max(1, Math.min(90, parseInt(new URL(req.url).searchParams.get("days") || "7", 10) || 7));
  try {
    const from = dayId(days - 1), to = dayId(0);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=gte.${from}&id=lte.${to}&select=id,data`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error("read");
    const rows: any[] = await res.json();
    const total = emptyDay();
    const daily: { day: number; visits: number; plays: number }[] = [];
    for (const r of rows) {
      const d: Day = Object.assign(emptyDay(), r.data || {});
      total.visits += d.visits;
      total.loggedVisits += d.loggedVisits;
      Object.keys(d.visitors).forEach((k) => (total.visitors[k] = 1));
      Object.keys(d.devices).forEach((k) => (total.devices[k] = (total.devices[k] || 0) + d.devices[k]));
      Object.keys(d.plays).forEach((k) => (total.plays[k] = (total.plays[k] || 0) + d.plays[k]));
      Object.keys(d.completes).forEach((k) => (total.completes[k] = (total.completes[k] || 0) + d.completes[k]));
      Object.keys(d.watchSecs).forEach((k) => (total.watchSecs[k] = (total.watchSecs[k] || 0) + d.watchSecs[k]));
      Object.keys(d.dropoff).forEach((k) => {
        const a = total.dropoff[k] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        d.dropoff[k].forEach((n, i) => (a[i] += n || 0));
        total.dropoff[k] = a;
      });
      Object.assign(total.titles, d.titles);
      daily.push({ day: r.id, visits: d.visits, plays: Object.keys(d.plays).reduce((s, k) => s + d.plays[k], 0) });
    }
    return NextResponse.json(
      {
        days,
        visits: total.visits,
        uniqueVisitors: Object.keys(total.visitors).length,
        loggedVisits: total.loggedVisits,
        devices: total.devices,
        plays: total.plays,
        completes: total.completes,
        watchSecs: total.watchSecs,
        dropoff: total.dropoff,
        titles: total.titles,
        daily: daily.sort((a, b) => a.day - b.day),
      },
      { headers: noStore }
    );
  } catch {
    return NextResponse.json({ error: "No se pudieron leer las estadísticas" }, { status: 502, headers: noStore });
  }
}
