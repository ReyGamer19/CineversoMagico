import { NextResponse, connection } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

// Comunidad de Cineverso Mágico: reseñas con estrellas y listas de los usuarios.
// - Leer: cualquiera. Escribir: solo con cuenta.
// - Reseñas: tabla "catalog", fila id = 7  →  { byMovie: { [movieId]: Review[] } }
// - Listas:  tabla "catalog", fila id = 8  →  { lists: List[] }

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_HASH = "29c7b21d3cde1ccfca37823fe7bb9eed806a4e2d145df2a531f1be576ee26031";
const ROW_REVIEWS = 7;
const ROW_LISTS = 8;
const ROW_OWNER = 9; // { ownerUid } — la cuenta del dueño de la web (la registra el admin con su clave)
const noStore = { "Cache-Control": "no-store, max-age=0" };

type Review = { uid: string; name: string; avatar: string; badge?: string; stars: number; text: string; at: number };
type List = { id: string; uid: string; owner: string; avatar: string; name: string; desc: string; movieIds: string[]; followers: string[]; at: number; updated: number };

const sbHeaders = (key: string, bearer?: string): Record<string, string> => {
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  else if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
};
async function readRow(id: number): Promise<{ data: any; stamp: string | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${id}&select=data,updated_at`, { headers: sbHeaders(SERVICE_KEY), cache: "no-store" });
  if (!res.ok) throw new Error("read");
  const rows = await res.json();
  const r = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return { data: r && r.data ? r.data : null, stamp: r ? r.updated_at : null };
}
// Guarda solo si nadie escribió entre medio (si no, reintenta con los datos nuevos)
async function updateRow(id: number, empty: () => any, change: (d: any) => string | void): Promise<{ data: any; error?: string }> {
  for (let i = 0; i < 5; i++) {
    const { data: raw, stamp } = await readRow(id);
    const data = Object.assign(empty(), raw || {});
    const err = change(data);
    if (err) return { data, error: err };
    const body = JSON.stringify({ id, data, updated_at: new Date().toISOString() });
    if (stamp) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${id}&updated_at=eq.${encodeURIComponent(stamp)}`, {
        method: "PATCH", headers: { ...sbHeaders(SERVICE_KEY), Prefer: "return=representation" }, body,
      });
      if (res.ok) { const rows = await res.json().catch(() => []); if (Array.isArray(rows) && rows.length) return { data }; }
    } else {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?on_conflict=id`, {
        method: "POST", headers: { ...sbHeaders(SERVICE_KEY), Prefer: "resolution=merge-duplicates,return=minimal" }, body,
      });
      if (res.ok) return { data };
    }
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 150));
  }
  throw new Error("busy");
}
async function currentUser(): Promise<{ id: string; email: string } | null> {
  const store = await cookies();
  const at = store.get("cv_access")?.value;
  if (!at || !ANON_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: sbHeaders(ANON_KEY, at), cache: "no-store" });
  if (!res.ok) return null;
  const u = await res.json();
  return u && u.id ? { id: u.id, email: u.email || "" } : null;
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
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f​-‏⁠﻿]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

// Sin enlaces (solo cineversomagico.com) y groserías tapadas, igual que el chat
function hasLink(text: string): boolean {
  const t = text.toLowerCase()
    .replace(/\s*(\.|\(punto\)|\[punto\]|\(dot\)|\[dot\]| punto | dot )\s*/g, ".")
    .replace(/https?:\/\/(www\.)?cineversomagico\.com\S*/g, "")
    .replace(/(^|\s)(www\.)?cineversomagico\.com\S*/g, " ");
  if (/https?:\/\/|www\.|t\.me\/|bit\.ly|tinyurl|wa\.me/.test(t)) return true;
  return /\b[a-z0-9-]{2,}\.(com|net|org|io|co|to|tv|me|xyz|lat|cc|info|biz|site|online|top|club|link|live|app|pro|ws|in|es|mx|pe|ar|cl|us|uk|ru|su|li|ly|gg|nu|is|re|sh|vip|stream|movie|movies|film|fun|icu|mobi|one|zip|pw|tk|ml|ga|cf)\b/.test(t);
}
const BAD = ["puta", "puto", "mierda", "pendejo", "pendeja", "cabron", "cabrón", "verga", "conchatumadre", "ctm", "huevon", "huevón", "maricon", "maricón", "imbecil", "imbécil", "idiota", "estupido", "estúpido", "malparido", "hijo de puta", "hdp", "chinga", "culero", "zorra", "perra"];
function clean(text: string): string {
  let t = text;
  for (const w of BAD) {
    const re = new RegExp("(^|[^a-záéíóúñ])(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?=$|[^a-záéíóúñ])", "gi");
    t = t.replace(re, (_m, a, b) => a + b.charAt(0) + "*".repeat(Math.max(2, b.length - 1)));
  }
  return t;
}
const avatarOk = (v: unknown) => { const a = str(v, 200); return /^\/[a-zA-Z0-9_\-./ %]+$/.test(a) ? a : ""; };
async function ownerUid(): Promise<string> {
  try { const { data } = await readRow(ROW_OWNER); return data && typeof data.ownerUid === "string" ? data.ownerUid : ""; } catch { return ""; }
}
const summary = (list: Review[]) => {
  const n = list.length;
  const avg = n ? Math.round((list.reduce((s, r) => s + r.stars, 0) / n) * 10) / 10 : 0;
  return { avg, count: n };
};
const listOut = (l: List, uid?: string) => ({
  id: l.id, owner: l.owner, avatar: l.avatar, name: l.name, desc: l.desc, movieIds: l.movieIds,
  followers: l.followers.length, mine: !!uid && l.uid === uid, following: !!uid && l.followers.indexOf(uid) !== -1, updated: l.updated,
});

export async function GET(req: Request) {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) return fail("Servidor sin configurar", 503);
  const sp = new URL(req.url).searchParams;
  try {
    // Reseñas de una película
    const movie = str(sp.get("movie"), 40);
    if (movie) {
      const { data } = await readRow(ROW_REVIEWS);
      const list: Review[] = data && data.byMovie && Array.isArray(data.byMovie[movie]) ? data.byMovie[movie] : [];
      const u = await currentUser().catch(() => null);
      const reviews = list.slice().sort((a, b) => b.at - a.at).slice(0, 30).map((r) => ({ name: r.name, avatar: r.avatar, badge: r.badge || "", stars: r.stars, text: r.text, at: r.at, mine: !!u && r.uid === u.id }));
      return NextResponse.json({ ...summary(list), reviews }, { headers: noStore });
    }
    // Ranking: lo mejor valorado por la comunidad (promedio ponderado)
    if (sp.get("top")) {
      const { data } = await readRow(ROW_REVIEWS);
      const by: Record<string, Review[]> = data && data.byMovie ? data.byMovie : {};
      let all = 0, n = 0;
      for (const k of Object.keys(by)) for (const r of by[k]) { all += r.stars; n++; }
      const C = n ? all / n : 3.5, m = 3;
      const top = Object.keys(by)
        .map((id) => { const s = summary(by[id]); return { id, avg: s.avg, count: s.count, score: (s.count / (s.count + m)) * s.avg + (m / (s.count + m)) * C }; })
        .filter((x) => x.count >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      return NextResponse.json({ top, stars: Object.fromEntries(Object.keys(by).map((id) => [id, summary(by[id])])) }, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
    }
    // Listas de la comunidad
    if (sp.get("lists")) {
      const u = await currentUser().catch(() => null);
      const { data } = await readRow(ROW_LISTS);
      const lists: List[] = data && Array.isArray(data.lists) ? data.lists : [];
      const pub = lists.filter((l) => l.movieIds.length > 0)
        .sort((a, b) => b.followers.length - a.followers.length || b.updated - a.updated)
        .slice(0, 40).map((l) => listOut(l, u ? u.id : undefined));
      const mine = u ? lists.filter((l) => l.uid === u.id || l.followers.indexOf(u.id) !== -1).map((l) => listOut(l, u.id)) : [];
      return NextResponse.json({ lists: pub, mine }, { headers: noStore });
    }
    // Para los logros: cuántas reseñas y listas tiene el usuario
    if (sp.get("me")) {
      const u = await currentUser();
      if (!u) return NextResponse.json({ reviews: 0, lists: 0, follows: 0, owner: false }, { headers: noStore });
      const [{ data: rv }, { data: ls }, own] = await Promise.all([readRow(ROW_REVIEWS), readRow(ROW_LISTS), ownerUid()]);
      let reviews = 0;
      const by = rv && rv.byMovie ? rv.byMovie : {};
      for (const k of Object.keys(by)) if (by[k].some((r: Review) => r.uid === u.id)) reviews++;
      const lists: List[] = ls && Array.isArray(ls.lists) ? ls.lists : [];
      return NextResponse.json({ reviews, lists: lists.filter((l) => l.uid === u.id).length, follows: lists.filter((l) => l.followers.indexOf(u.id) !== -1).length, owner: !!own && own === u.id }, { headers: noStore });
    }
    return fail("Consulta inválida", 400);
  } catch {
    return fail("Error de conexión", 502);
  }
}

export async function POST(req: Request) {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) return fail("Servidor sin configurar", 503);
  let b: any;
  try { b = await req.json(); } catch { return fail("Solicitud inválida", 400); }
  const action = str(b?.action, 20);
  try {
    // Administrador: borrar una reseña o una lista
    if (action === "adminDeleteReview" || action === "adminDeleteList") {
      if (!passwordOk(b?.password)) { await new Promise((r) => setTimeout(r, 800)); return fail("Clave incorrecta", 401); }
      if (action === "adminDeleteReview") {
        const movie = str(b.movieId, 40), at = Number(b.at);
        await updateRow(ROW_REVIEWS, () => ({ byMovie: {} }), (d) => { if (Array.isArray(d.byMovie[movie])) d.byMovie[movie] = d.byMovie[movie].filter((r: Review) => r.at !== at); });
      } else {
        const id = str(b.id, 40);
        await updateRow(ROW_LISTS, () => ({ lists: [] }), (d) => { d.lists = d.lists.filter((l: List) => l.id !== id); });
      }
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    const u = await currentUser();
    if (!u) return fail("Inicia sesión para participar", 401);

    // El administrador registra SU cuenta como la del dueño (necesita la clave de la web)
    if (action === "claimOwner") {
      if (!passwordOk(b?.password)) { await new Promise((r) => setTimeout(r, 800)); return fail("Clave incorrecta", 401); }
      await updateRow(ROW_OWNER, () => ({}), (d) => { d.ownerUid = u.id; d.at = Date.now(); });
      return NextResponse.json({ ok: true, owner: true }, { headers: noStore });
    }

    if (action === "review") {
      const movie = str(b.movieId, 40);
      const stars = Math.round(Number(b.stars));
      const text = str(b.text, 160);
      if (!movie) return fail("Película inválida", 400);
      if (!(stars >= 1 && stars <= 5)) return fail("Elige de 1 a 5 estrellas", 400);
      if (text && hasLink(text)) return fail("🚫 No se permiten enlaces en las reseñas.", 422);
      const name = str(b.name, 24) || u.email.split("@")[0].slice(0, 20);
      // La corona 👑 es solo del dueño
      let badge = str(b.badge, 4);
      if (badge === "👑" && (await ownerUid()) !== u.id) badge = "";
      const { data } = await updateRow(ROW_REVIEWS, () => ({ byMovie: {} }), (d) => {
        const list: Review[] = Array.isArray(d.byMovie[movie]) ? d.byMovie[movie] : [];
        const rest = list.filter((r) => r.uid !== u.id);
        rest.push({ uid: u.id, name, avatar: avatarOk(b.avatar), badge, stars, text: clean(text), at: Date.now() });
        d.byMovie[movie] = rest.slice(-200);
      });
      return NextResponse.json({ ok: true, ...summary(data.byMovie[movie]) }, { headers: noStore });
    }
    if (action === "deleteReview") {
      const movie = str(b.movieId, 40);
      await updateRow(ROW_REVIEWS, () => ({ byMovie: {} }), (d) => { if (Array.isArray(d.byMovie[movie])) d.byMovie[movie] = d.byMovie[movie].filter((r: Review) => r.uid !== u.id); });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === "listSave") {
      const id = str(b.id, 40);
      const name = str(b.name, 50);
      const desc = str(b.desc, 140);
      const movieIds: string[] = Array.isArray(b.movieIds) ? b.movieIds.map((x: unknown) => String(x).slice(0, 40)).filter(Boolean).slice(0, 100) : [];
      if (!name) return fail("Ponle un nombre a tu lista", 400);
      if (hasLink(name) || hasLink(desc)) return fail("🚫 No se permiten enlaces.", 422);
      let saved: List | null = null;
      const { error } = await updateRow(ROW_LISTS, () => ({ lists: [] }), (d) => {
        const now = Date.now();
        if (id) {
          const l: List | undefined = d.lists.find((x: List) => x.id === id);
          if (!l || l.uid !== u.id) return "No puedes editar esta lista";
          l.name = clean(name); l.desc = clean(desc); l.movieIds = Array.from(new Set(movieIds)); l.updated = now;
          l.owner = str(b.owner, 24) || l.owner; l.avatar = avatarOk(b.avatar) || l.avatar;
          saved = l;
        } else {
          if (d.lists.filter((x: List) => x.uid === u.id).length >= 20) return "Puedes tener hasta 20 listas";
          const l: List = { id: "l" + now.toString(36) + Math.random().toString(36).slice(2, 5), uid: u.id, owner: str(b.owner, 24) || u.email.split("@")[0].slice(0, 20), avatar: avatarOk(b.avatar), name: clean(name), desc: clean(desc), movieIds: Array.from(new Set(movieIds)), followers: [], at: now, updated: now };
          d.lists.push(l);
          saved = l;
        }
      });
      if (error) return fail(error, 403);
      return NextResponse.json({ ok: true, list: saved ? listOut(saved, u.id) : null }, { headers: noStore });
    }
    if (action === "listDelete") {
      const id = str(b.id, 40);
      const { error } = await updateRow(ROW_LISTS, () => ({ lists: [] }), (d) => {
        const l = d.lists.find((x: List) => x.id === id);
        if (!l || l.uid !== u.id) return "No puedes borrar esta lista";
        d.lists = d.lists.filter((x: List) => x.id !== id);
      });
      if (error) return fail(error, 403);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    if (action === "listFollow") {
      const id = str(b.id, 40);
      let following = false, count = 0;
      const { error } = await updateRow(ROW_LISTS, () => ({ lists: [] }), (d) => {
        const l: List | undefined = d.lists.find((x: List) => x.id === id);
        if (!l) return "La lista ya no existe";
        if (l.uid === u.id) return "Es tu propia lista";
        const i = l.followers.indexOf(u.id);
        if (i === -1) l.followers.push(u.id); else l.followers.splice(i, 1);
        following = i === -1; count = l.followers.length;
      });
      if (error) return fail(error, 400);
      return NextResponse.json({ ok: true, following, followers: count }, { headers: noStore });
    }
    return fail("Acción inválida", 400);
  } catch {
    return fail("Está muy ocupado, inténtalo de nuevo.", 503);
  }
}
