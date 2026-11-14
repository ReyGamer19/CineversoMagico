import { NextResponse, connection } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// Opcional: si algún día pones ADMIN_PASSWORD en Vercel, también funciona.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
// Huella SHA-256 de tu clave de la web (la de ?admin). La rellena actualizar-cineverso.js.
// Este archivo solo corre en el servidor: la huella nunca llega al navegador.
const ADMIN_HASH = "29c7b21d3cde1ccfca37823fe7bb9eed806a4e2d145df2a531f1be576ee26031";

// Funciona con la clave antigua "service_role" (empieza con eyJ) y con la nueva "secret" (sb_secret_...)
const baseHeaders = (): Record<string, string> => {
  const h: Record<string, string> = {
    apikey: SERVICE_KEY,
    "Content-Type": "application/json",
  };
  if (SERVICE_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
};

const noStore = { "Cache-Control": "no-store, max-age=0" };

const hasAdminKey = () => !!ADMIN_PASSWORD || /^[a-f0-9]{64}$/.test(ADMIN_HASH);

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

function passwordOk(p: unknown): boolean {
  if (typeof p !== "string" || !p || p.length > 200) return false;
  if (ADMIN_PASSWORD && sameText(p, ADMIN_PASSWORD)) return true;
  if (/^[a-f0-9]{64}$/.test(ADMIN_HASH)) {
    const h = createHash("sha256").update(p, "utf8").digest("hex");
    return sameText(h, ADMIN_HASH);
  }
  return false;
}

// ---------- Seguridad del administrador ----------
// 1) Al iniciar sesión con la clave, el servidor entrega un PASE temporal firmado (7 días).
//    El navegador guarda solo ese pase: la clave real nunca queda guardada ni viaja en cada cambio.
// 2) Si alguien prueba claves: 5 intentos fallidos = bloqueado 15 minutos (por conexión).
// 3) Copias de seguridad automáticas del catálogo (una por día de la semana) y botón para restaurar.
const TOKEN_DAYS = 7;
const GUARD_ROW = 12;   // { fails: { [ipHash]: { n, first, until } } }
const BACKUP_BASE = 100; // filas 100..106 = copia de cada día de la semana
function adminSecret() {
  return createHash("sha256").update("cv-admin|" + ADMIN_HASH + "|" + ADMIN_PASSWORD + "|" + SERVICE_KEY, "utf8").digest();
}
function makeToken() {
  const exp = Date.now() + TOKEN_DAYS * 86400000;
  return { token: "cvt." + exp + "." + createHmac("sha256", adminSecret()).update("admin|" + exp).digest("hex"), exp };
}
async function tokenOk(p: unknown): Promise<boolean> {
  if (typeof p !== "string" || p.length > 300) return false;
  const m = /^cvt\.(\d{10,13})\.([a-f0-9]{64})$/.exec(p);
  if (!m || Number(m[1]) < Date.now() || !hasAdminKey()) return false;
  if (!sameText(createHmac("sha256", adminSecret()).update("admin|" + m[1]).digest("hex"), m[2])) return false;
  // Pases anulados con "Cerrar sesión en todos los dispositivos"
  let before = 0;
  try { const r = await readRowAt(GUARD_ROW); before = r && r.data && typeof r.data.revokedBefore === "number" ? r.data.revokedBefore : 0; } catch {}
  return Number(m[1]) - TOKEN_DAYS * 86400000 >= before;
}
// Tipo de dispositivo para el registro de entradas (sin guardar la IP completa)
function deviceOf(ua: string) {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Web0S|webOS|Tizen|SmartTV|SMART-TV|BRAVIA|AFT|CrKey/i.test(ua) ? "Smart TV" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Otro";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return os + " · " + br;
}
async function logEvent(ev: { kind: "login" | "lock" | "revoke"; device: string; net: string; id?: string }) {
  try {
    const r = await readRowAt(GUARD_ROW);
    const data = r && r.data && typeof r.data === "object" ? r.data : {};
    const log: any[] = Array.isArray(data.log) ? data.log : [];
    log.push({ at: Date.now(), ...ev });
    await writeRow(GUARD_ROW, { ...data, log: log.slice(-40) });
  } catch {}
}
async function readRowAt(id: number): Promise<{ data: any; at: string } | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${id}&select=data,updated_at`, { headers: baseHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error("read");
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? { data: rows[0].data, at: rows[0].updated_at } : null;
}
async function writeRow(id: number, data: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?on_conflict=id`, {
    method: "POST",
    headers: { ...baseHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error("write");
}
const ipKey = (req: Request) => {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "?";
  return createHash("sha256").update("cv-ip|" + ip, "utf8").digest("hex").slice(0, 24);
};
// Revisa si esta conexión está bloqueada por muchos intentos fallidos
async function guardCheck(key: string): Promise<number> {
  try {
    const r = await readRowAt(GUARD_ROW);
    const f = r && r.data && r.data.fails ? r.data.fails[key] : null;
    return f && f.until && f.until > Date.now() ? f.until : 0;
  } catch { return 0; }
}
async function guardRecord(key: string, ok: boolean): Promise<{ left: number; until: number }> {
  try {
    const r = await readRowAt(GUARD_ROW);
    const data = r && r.data && typeof r.data === "object" ? r.data : {};
    const fails: Record<string, { n: number; first: number; until: number }> = data.fails || {};
    const now = Date.now();
    // limpia registros viejos
    for (const k of Object.keys(fails)) if (now - fails[k].first > 86400000 && (!fails[k].until || fails[k].until < now)) delete fails[k];
    if (ok) { delete fails[key]; await writeRow(GUARD_ROW, { ...data, fails }); return { left: 5, until: 0 }; }
    const cur = fails[key] && now - fails[key].first < 15 * 60000 ? fails[key] : { n: 0, first: now, until: 0 };
    cur.n += 1;
    if (cur.n >= 5) { cur.until = now + 15 * 60000; cur.n = 0; cur.first = now; }
    fails[key] = cur;
    await writeRow(GUARD_ROW, { ...data, fails, lastFail: now });
    return { left: cur.until ? 0 : 5 - cur.n, until: cur.until };
  } catch { return { left: 1, until: 0 }; }
}
// Guarda una copia del catálogo actual (una por día de la semana; se renueva cada ~20 h)
async function backupIfDue() {
  try {
    const cur = await readRowAt(1);
    if (!cur || !Array.isArray(cur.data) || !cur.data.length) return;
    const slot = BACKUP_BASE + new Date(Date.now() - 5 * 3600000).getUTCDay();
    const prev = await readRowAt(slot).catch(() => null);
    if (prev && prev.data && prev.data.at && Date.now() - prev.data.at < 20 * 3600000) return;
    await writeRow(slot, { at: Date.now(), count: cur.data.length, movies: cur.data });
  } catch {}
}

// LEER catálogo (público: lo usan todos los dispositivos)
export async function GET() {
  // Obliga a que se ejecute en cada petición (compatible con cacheComponents)
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ error: "Servidor sin configurar" }, { status: 503, headers: noStore });
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.1&select=data`, {
      headers: baseHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Error leyendo catálogo" }, { status: 502, headers: noStore });
    }
    const rows = await res.json();
    const movies = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].data) ? rows[0].data : [];
    return NextResponse.json({ movies }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Error de conexión" }, { status: 502, headers: noStore });
  }
}

// GUARDAR catálogo (solo con la clave de administrador)
export async function POST(req: Request) {
  if (!SUPABASE_URL || !SERVICE_KEY || !hasAdminKey()) {
    return NextResponse.json({ error: "Servidor sin configurar" }, { status: 503, headers: noStore });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400, headers: noStore });
  }

  if (!body || typeof body !== "object") return NextResponse.json({ error: "Solicitud inválida" }, { status: 400, headers: noStore });
  const action = typeof body.action === "string" ? body.action.slice(0, 20) : "";

  // Iniciar sesión de administrador: clave → pase temporal (con bloqueo ante intentos repetidos)
  // (también acepta la forma antigua: { password, movies: null })
  const validToken = await tokenOk(body.password);
  const isLogin = action === "login" || (!validToken && body.movies === null);
  const device = deviceOf(req.headers.get("user-agent") || "");
  if (isLogin) {
    const key = ipKey(req);
    const locked = await guardCheck(key);
    if (locked) {
      const min = Math.max(1, Math.ceil((locked - Date.now()) / 60000));
      return NextResponse.json({ error: "Demasiados intentos. Espera " + min + " min.", lockedMin: min }, { status: 429, headers: noStore });
    }
    if (!passwordOk(body.password)) {
      await new Promise((r) => setTimeout(r, 900));
      const g = await guardRecord(key, false);
      if (g.until) await logEvent({ kind: "lock", device, net: key.slice(0, 6) });
      return NextResponse.json({ error: "Clave incorrecta", left: g.left, lockedMin: g.until ? 15 : 0 }, { status: g.until ? 429 : 401, headers: noStore });
    }
    await guardRecord(key, true);
    const t = makeToken();
    const loginId = createHash("sha256").update(t.token).digest("hex").slice(0, 12);
    await logEvent({ kind: "login", device, net: key.slice(0, 6), id: loginId });
    // Forma antigua: responde 400 como antes (la página nueva usa action:"login")
    return NextResponse.json({ ok: true, token: t.token, exp: t.exp, loginId, ...(action === "login" ? {} : { error: "Catálogo inválido" }) }, { status: action === "login" ? 200 : 400, headers: noStore });
  }

  // De aquí en adelante solo con el pase de administrador
  if (!validToken) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Sesión de administrador vencida", expired: true }, { status: 401, headers: noStore });
  }
  // Renovar el pase (para no tener que escribir la clave cada semana)
  if (action === "renew") {
    const t = makeToken();
    return NextResponse.json({ ok: true, token: t.token, exp: t.exp }, { headers: noStore });
  }
  // Registro de entradas al panel
  if (action === "logins") {
    try {
      const r = await readRowAt(GUARD_ROW);
      const log: any[] = r && r.data && Array.isArray(r.data.log) ? r.data.log : [];
      return NextResponse.json({ ok: true, log: log.slice().reverse(), revokedBefore: r && r.data ? r.data.revokedBefore || 0 : 0 }, { headers: noStore });
    } catch {
      return NextResponse.json({ error: "Error de conexión" }, { status: 502, headers: noStore });
    }
  }
  // Cerrar sesión de administrador en TODOS los dispositivos: anula todos los pases y le da uno nuevo solo a quien lo pidió
  if (action === "revokeAll") {
    try {
      const r = await readRowAt(GUARD_ROW);
      const data = r && r.data && typeof r.data === "object" ? r.data : {};
      await writeRow(GUARD_ROW, { ...data, revokedBefore: Date.now() });
      await new Promise((res) => setTimeout(res, 5));
      const t = makeToken();
      const loginId = createHash("sha256").update(t.token).digest("hex").slice(0, 12);
      await logEvent({ kind: "revoke", device, net: ipKey(req).slice(0, 6), id: loginId });
      return NextResponse.json({ ok: true, token: t.token, exp: t.exp, loginId }, { headers: noStore });
    } catch {
      return NextResponse.json({ error: "Error de conexión" }, { status: 502, headers: noStore });
    }
  }
  // Copias de seguridad: ver lista y restaurar
  if (action === "backups") {
    try {
      const list: { slot: number; at: number; count: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const r = await readRowAt(BACKUP_BASE + i).catch(() => null);
        if (r && r.data && r.data.at) list.push({ slot: i, at: r.data.at, count: r.data.count || 0 });
      }
      list.sort((a, b) => b.at - a.at);
      return NextResponse.json({ ok: true, backups: list }, { headers: noStore });
    } catch {
      return NextResponse.json({ error: "Error de conexión" }, { status: 502, headers: noStore });
    }
  }
  if (action === "restore") {
    const slot = Number(body.slot);
    if (!(slot >= 0 && slot <= 6)) return NextResponse.json({ error: "Copia inválida" }, { status: 400, headers: noStore });
    try {
      const r = await readRowAt(BACKUP_BASE + slot);
      if (!r || !r.data || !Array.isArray(r.data.movies)) return NextResponse.json({ error: "Esa copia no existe" }, { status: 404, headers: noStore });
      // Antes de restaurar se guarda el catálogo actual en la copia de hoy (por si te arrepientes)
      const cur = await readRowAt(1);
      if (cur && Array.isArray(cur.data) && cur.data.length) {
        const today = BACKUP_BASE + new Date(Date.now() - 5 * 3600000).getUTCDay();
        if (today !== BACKUP_BASE + slot) await writeRow(today, { at: Date.now(), count: cur.data.length, movies: cur.data });
      }
      await writeRow(1, r.data.movies);
      return NextResponse.json({ ok: true, count: r.data.movies.length }, { headers: noStore });
    } catch {
      return NextResponse.json({ error: "Error de conexión" }, { status: 502, headers: noStore });
    }
  }
  if (!Array.isArray(body.movies)) {
    return NextResponse.json({ error: "Catálogo inválido" }, { status: 400, headers: noStore });
  }
  if (JSON.stringify(body.movies).length > 3_000_000) {
    return NextResponse.json({ error: "Catálogo demasiado grande" }, { status: 413, headers: noStore });
  }

  // Protección: no se acepta un catálogo vacío ni uno que borre casi todo de golpe
  if (!body.movies.length && !body.allowEmpty) {
    return NextResponse.json({ error: "Catálogo vacío: no se guardó por seguridad" }, { status: 400, headers: noStore });
  }
  try {
    await backupIfDue();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?on_conflict=id`, {
      method: "POST",
      headers: { ...baseHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: 1, data: body.movies, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "No se pudo guardar" }, { status: 502, headers: noStore });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Error de conexión" }, { status: 502, headers: noStore });
  }
}
