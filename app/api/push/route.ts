import { NextResponse, connection } from "next/server";
import { generateVAPIDKeys, setVapidDetails, sendNotification } from "web-push";
import { createHash, timingSafeEqual } from "node:crypto";

// Notificaciones push de Cineverso Mágico.
// - Las claves VAPID se crean solas la primera vez y se guardan en Supabase (tabla catalog, fila id = 3).
// - Las suscripciones de los dispositivos se guardan en la fila id = 4.
// No hace falta configurar nada en Vercel.

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_HASH = "29c7b21d3cde1ccfca37823fe7bb9eed806a4e2d145df2a531f1be576ee26031";
const CONTACT = process.env.ADMIN_EMAIL || "admin@cineversomagico.com";
const KEYS_ROW = 3;
const SUBS_ROW = 4;
const noStore = { "Cache-Control": "no-store, max-age=0" };

type Sub = { endpoint: string; keys: { p256dh: string; auth: string }; created: number; f?: { s: string[]; g: string[] } };

const headers = (): Record<string, string> => {
  const h: Record<string, string> = { apikey: SERVICE_KEY, "Content-Type": "application/json" };
  if (SERVICE_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
};
async function getRow(id: number): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${id}&select=data`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error("read");
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0].data : null;
}
async function setRow(id: number, data: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?on_conflict=id`, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error("write");
}
async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const k = await getRow(KEYS_ROW);
  if (k && k.publicKey && k.privateKey) return k;
  const fresh = generateVAPIDKeys();
  await setRow(KEYS_ROW, fresh);
  return fresh;
}

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
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const cleanFollows = (f: any): { s: string[]; g: string[] } | null => {
  if (!f || typeof f !== "object") return null;
  const arr = (a: any, n: number) => (Array.isArray(a) ? Array.from(new Set(a.filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim().slice(0, 60)))).slice(0, n) as string[] : []);
  return { s: arr(f.sagas, 50), g: arr(f.genres, 30) };
};

const GENRE_EMOJI: Record<string, string> = { "Terror": "👻", "Acción": "💥", "Comedia": "😂", "Romance": "💘", "Animación": "✨", "Ciencia ficción": "🚀", "Drama": "🎭", "Aventura": "🧭", "Suspenso": "🔎", "Familia": "🏡", "Fantasía": "🐉" };
// Película de un aviso "m-ID" (para personalizar el aviso a quien sigue su saga o género)
async function movieForTag(tag: string): Promise<any> {
  const m = /^m-(.+)$/.exec(tag || "");
  if (!m) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.1&select=data`, { headers: headers(), cache: "no-store" });
    const rows = res.ok ? await res.json() : [];
    const list: any[] = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].data) ? rows[0].data : [];
    return list.find((x) => x && String(x.id) === m[1]) || null;
  } catch { return null; }
}

// Envía un aviso a todos los dispositivos suscritos y limpia los que ya no existen.
// Si el aviso es de una película, quien sigue su saga o su género recibe un aviso especial ("Llegó otra de Marvel").
async function sendToAll(msg: { title: string; body: string; image?: string; url?: string; tag?: string }, mv?: any) {
  const base = { title: msg.title || "Cineverso Mágico", body: msg.body || "", image: msg.image || undefined, url: msg.url || "/", tag: msg.tag || undefined };
  const payload = JSON.stringify(base);
  const personal = new Map<string, string>();
  const payloadFor = (s: Sub): string => {
    if (!mv || !s.f || /episodio/i.test(base.title)) return payload;
    const saga = typeof mv.saga === "string" && mv.saga && s.f.s.indexOf(mv.saga) !== -1 ? mv.saga : "";
    const gs: string[] = [mv.tag].concat(Array.isArray(mv.genres) ? mv.genres : []).filter((x: any) => typeof x === "string" && x);
    const genre = saga ? "" : gs.find((g) => s.f!.g.indexOf(g) !== -1) || "";
    if (!saga && !genre) return payload;
    const key = saga ? "s:" + saga : "g:" + genre;
    const hit = personal.get(key);
    if (hit) return hit;
    const soon = /Próximo/i.test(base.title);
    const what = saga ? "otra de " + saga : "una nueva de " + genre.toLowerCase() + " " + (GENRE_EMOJI[genre] || "🎬");
    const title = soon ? "🔔 Pronto llega " + what : "🔔 Llegó " + what;
    const body = String(mv.title || "") + (soon ? " · " + base.body : " ya está disponible. ¡Tú sigues " + (saga ? "esta saga" : "este género") + "!");
    const out = JSON.stringify({ ...base, title: title.slice(0, 80), body: body.slice(0, 200) });
    personal.set(key, out);
    return out;
  };
  const k = await vapidKeys();
  setVapidDetails("mailto:" + CONTACT, k.publicKey, k.privateKey);
  const data = (await getRow(SUBS_ROW)) || { subs: [] };
  const subs: Sub[] = Array.isArray(data.subs) ? data.subs : [];
  const dead = new Set<string>();
  let sent = 0, failed = 0;
  for (let i = 0; i < subs.length; i += 50) {
    const batch = subs.slice(i, i + 50);
    const results = await Promise.allSettled(batch.map((s) => sendNotification(s, payloadFor(s), { TTL: 86400, urgency: "high" })));
    results.forEach((r, j) => {
      if (r.status === "fulfilled") sent++;
      else {
        failed++;
        const code = (r.reason && (r.reason as any).statusCode) || 0;
        // 404/410: el dispositivo ya no existe. 401/403: suscrito con claves viejas (se volverá a suscribir solo)
        if (code === 404 || code === 410 || code === 401 || code === 403) dead.add(batch[j].endpoint);
      }
    });
  }
  if (dead.size) {
    const fresh = (await getRow(SUBS_ROW)) || { subs: [] };
    const list: Sub[] = Array.isArray(fresh.subs) ? fresh.subs : [];
    await setRow(SUBS_ROW, { ...fresh, subs: list.filter((s) => !dead.has(s.endpoint)) });
  }
  return { sent, failed, removed: dead.size, total: subs.length };
}

// Fecha de hoy en Perú (AAAA-MM-DD)
const todayLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

// Clave pública para que el navegador se suscriba
export async function GET() {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) return NextResponse.json({ error: "Servidor sin configurar" }, { status: 503, headers: noStore });
  try {
    const k = await vapidKeys();
    return NextResponse.json({ publicKey: k.publicKey }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 502, headers: noStore });
  }
}

export async function POST(req: Request) {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) return NextResponse.json({ error: "Servidor sin configurar" }, { status: 503, headers: noStore });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Solicitud inválida" }, { status: 400, headers: noStore }); }
  const action = str(b?.action, 20);

  try {
    if (action === "subscribe" || action === "unsubscribe") {
      const s = b?.sub;
      const endpoint = str(s?.endpoint, 1000);
      if (!/^https:\/\//.test(endpoint)) return NextResponse.json({ error: "Suscripción inválida" }, { status: 400, headers: noStore });
      const data = (await getRow(SUBS_ROW)) || { subs: [] };
      let subs: Sub[] = Array.isArray(data.subs) ? data.subs : [];
      const prevSub = subs.find((x) => x.endpoint === endpoint);
      subs = subs.filter((x) => x.endpoint !== endpoint);
      if (action === "subscribe") {
        const p256dh = str(s?.keys?.p256dh, 200), auth = str(s?.keys?.auth, 100);
        if (!p256dh || !auth) return NextResponse.json({ error: "Suscripción inválida" }, { status: 400, headers: noStore });
        const nf = cleanFollows(b?.follows);
        subs.push({ endpoint, keys: { p256dh, auth }, created: Date.now(), ...(nf ? { f: nf } : prevSub && prevSub.f ? { f: prevSub.f } : {}) });
        if (subs.length > 5000) subs = subs.slice(subs.length - 5000);
      }
      await setRow(SUBS_ROW, { ...data, subs });
      return NextResponse.json({ ok: true, total: subs.length }, { headers: noStore });
    }

    // Sagas y géneros que sigue este dispositivo (para los avisos especiales)
    if (action === "follows") {
      const endpoint = str(b?.endpoint, 1000);
      const nf = cleanFollows(b?.follows);
      if (!/^https:\/\//.test(endpoint) || !nf) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400, headers: noStore });
      const data = (await getRow(SUBS_ROW)) || { subs: [] };
      const subs: Sub[] = Array.isArray(data.subs) ? data.subs : [];
      const it = subs.find((x) => x.endpoint === endpoint);
      if (!it) return NextResponse.json({ ok: false, missing: true }, { headers: noStore });
      it.f = nf;
      await setRow(SUBS_ROW, { ...data, subs });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === "send") {
      if (!passwordOk(b?.password)) {
        await new Promise((r) => setTimeout(r, 800));
        return NextResponse.json({ error: "Clave incorrecta" }, { status: 401, headers: noStore });
      }
      const bm = b?.movie && typeof b.movie === "object" ? b.movie : null;
      const mv = bm
        ? { title: str(bm.title, 120), saga: str(bm.saga, 60), tag: str(bm.tag, 40), genres: Array.isArray(bm.genres) ? bm.genres.slice(0, 8).map((x: unknown) => str(x, 40)).filter(Boolean) : [] }
        : /Ya disponible|Nueva (película|serie)|Próximo estreno/.test(str(b.title, 80)) ? await movieForTag(str(b.tag, 60)) : null;
      const r = await sendToAll({ title: str(b.title, 80), body: str(b.body, 200), image: str(b.image, 500), url: str(b.url, 300), tag: str(b.tag, 60) }, mv);
      // Recuerda que ya se avisó de esta película (para no repetir el aviso automático)
      const m = /^m-(\d+)$/.exec(str(b.tag, 60));
      if (m && /Ya disponible|Nueva (película|serie)/.test(str(b.title, 80))) {
        const d = (await getRow(SUBS_ROW)) || { subs: [] };
        const notified: string[] = Array.isArray(d.notified) ? d.notified : [];
        if (notified.indexOf(m[1]) === -1) await setRow(SUBS_ROW, { ...d, notified: notified.concat(m[1]).slice(-2000) });
      }
      return NextResponse.json({ ok: true, ...r }, { headers: noStore });
    }

    // Revisión automática (la hace cualquier visita, como mucho cada 10 minutos):
    // si a un próximo estreno ya le llegó su fecha y tiene video, avisa a todos "¡Ya disponible!" una sola vez.
    if (action === "auto") {
      const d = (await getRow(SUBS_ROW)) || { subs: [] };
      const now = Date.now();
      // Avisos programados que ya llegaron a su hora (se revisa en cada llamada)
      const sched: any[] = Array.isArray(d.scheduled) ? d.scheduled : [];
      const dueS = sched.filter((x) => x && typeof x.at === "number" && x.at <= now);
      let schedSent = 0;
      if (dueS.length) {
        const ids = new Set(dueS.map((x) => x.id));
        // Se quitan primero de la lista para que no se envíen dos veces
        const fresh0 = (await getRow(SUBS_ROW)) || { subs: [] };
        await setRow(SUBS_ROW, { ...fresh0, scheduled: (Array.isArray(fresh0.scheduled) ? fresh0.scheduled : []).filter((x: any) => !ids.has(x.id)) });
        for (const it of dueS.slice(0, 5)) {
          const r = await sendToAll({ title: str(it.title, 80), body: str(it.body, 200), image: str(it.image, 500), url: str(it.url, 300) || "/", tag: str(it.tag, 60) });
          schedSent += r.sent;
        }
      }
      if (d.lastAuto && now - d.lastAuto < 3 * 60 * 1000) return NextResponse.json({ ok: true, skipped: true, schedSent }, { headers: noStore });
      const notified: string[] = Array.isArray(d.notified) ? d.notified : [];
      { const f1 = (await getRow(SUBS_ROW)) || { subs: [] }; await setRow(SUBS_ROW, { ...f1, lastAuto: now }); }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.1&select=data`, { headers: headers(), cache: "no-store" });
      const rows = res.ok ? await res.json() : [];
      const movies: any[] = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].data) ? rows[0].data : [];
      const today = todayLima();
      const due = movies.filter((mv) =>
        mv && mv.comingSoon && typeof mv.releaseDate === "string" && mv.releaseDate <= today &&
        typeof mv.videoUrl === "string" && /^https?:\/\//.test(mv.videoUrl) && !/gtv-videos-bucket/i.test(mv.videoUrl) &&
        notified.indexOf(String(mv.id)) === -1
      ).slice(0, 3);
      let sent = 0;
      for (const mv of due) {
        const r = await sendToAll({ title: "¡Ya disponible! 🍿", body: String(mv.title || "") + " ya se puede ver en Cineverso Mágico.", image: mv.backdrop || mv.bgImage, url: "/ver/" + mv.id, tag: "m-" + mv.id }, mv);
        sent += r.sent;
        notified.push(String(mv.id));
      }
      if (due.length) {
        const fresh = (await getRow(SUBS_ROW)) || { subs: [] };
        await setRow(SUBS_ROW, { ...fresh, lastAuto: now, notified: notified.slice(-2000) });
      }
      return NextResponse.json({ ok: true, released: due.length, sent }, { headers: noStore });
    }

    // Avisos programados (solo administrador)
    if (action === "schedule" || action === "unschedule" || action === "schedlist") {
      if (!passwordOk(b?.password)) {
        await new Promise((r) => setTimeout(r, 800));
        return NextResponse.json({ error: "Clave incorrecta" }, { status: 401, headers: noStore });
      }
      const d = (await getRow(SUBS_ROW)) || { subs: [] };
      let items: any[] = Array.isArray(d.scheduled) ? d.scheduled : [];
      if (action === "schedule") {
        const it = b?.item || {};
        const at = Number(it.at);
        if (!at || at < Date.now() - 60000 || at > Date.now() + 366 * 86400000) return NextResponse.json({ error: "Fecha inválida" }, { status: 400, headers: noStore });
        const title = str(it.title, 80), body = str(it.body, 200);
        if (!title || !body) return NextResponse.json({ error: "Falta el título o el mensaje" }, { status: 400, headers: noStore });
        items = items.concat({ id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at, title, body, url: str(it.url, 300) || "/", image: str(it.image, 500), tag: str(it.tag, 60) }).slice(-100);
        await setRow(SUBS_ROW, { ...d, scheduled: items });
      } else if (action === "unschedule") {
        const id = str(b?.id, 40);
        items = items.filter((x) => x.id !== id);
        await setRow(SUBS_ROW, { ...d, scheduled: items });
      }
      return NextResponse.json({ ok: true, items }, { headers: noStore });
    }

    // Cuántos dispositivos tienen la campanita activada (solo administrador)
    if (action === "count") {
      if (!passwordOk(b?.password)) return NextResponse.json({ error: "Clave incorrecta" }, { status: 401, headers: noStore });
      const d = (await getRow(SUBS_ROW)) || { subs: [] };
      return NextResponse.json({ ok: true, total: Array.isArray(d.subs) ? d.subs.length : 0 }, { headers: noStore });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 502, headers: noStore });
  }
}
