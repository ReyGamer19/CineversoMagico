import { NextResponse, connection } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

// Chat de la comunidad de Cineverso Mágico.
// - Leer: cualquiera. Escribir: solo con cuenta.
// - No se permiten enlaces (solo los de cineversomagico.com).
// - El administrador puede fijar un mensaje, borrar mensajes y bloquear usuarios.
// Se guarda en la tabla "catalog", fila id = 6 (últimos 200 mensajes).

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_HASH = "29c7b21d3cde1ccfca37823fe7bb9eed806a4e2d145df2a531f1be576ee26031";
const ROW = 6;
const MAX_MSGS = 200;
const noStore = { "Cache-Control": "no-store, max-age=0" };

type Msg = { id: string; at: number; uid: string; name: string; avatar: string; text: string; admin?: boolean };
type Room = { msgs: Msg[]; pinned: string; banned: string[]; seen: Record<string, number>; last: Record<string, number> };
const emptyRoom = (): Room => ({ msgs: [], pinned: "¡Bienvenidos al chat de Cineverso! 🍿 Aquí puedes pedir películas, avisar si un video no funciona y conversar con la comunidad. Sé respetuoso. No se permiten enlaces.", banned: [], seen: {}, last: {} });

const sbHeaders = (key: string, bearer?: string): Record<string, string> => {
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  else if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
};

async function readRoom(): Promise<{ room: Room; stamp: string | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${ROW}&select=data,updated_at`, { headers: sbHeaders(SERVICE_KEY), cache: "no-store" });
  if (!res.ok) throw new Error("read");
  const rows = await res.json();
  const r = Array.isArray(rows) && rows[0] ? rows[0] : null;
  const room = Object.assign(emptyRoom(), r && r.data ? r.data : {});
  return { room, stamp: r ? r.updated_at : null };
}

// Guarda solo si nadie más escribió entre medio (si no, vuelve a intentar con los datos nuevos)
async function updateRoom(change: (room: Room) => string | void): Promise<{ room: Room; error?: string }> {
  for (let i = 0; i < 5; i++) {
    const { room, stamp } = await readRoom();
    const err = change(room);
    if (err) return { room, error: err };
    const body = JSON.stringify({ id: ROW, data: room, updated_at: new Date().toISOString() });
    let res: Response;
    if (stamp) {
      res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${ROW}&updated_at=eq.${encodeURIComponent(stamp)}`, {
        method: "PATCH",
        headers: { ...sbHeaders(SERVICE_KEY), Prefer: "return=representation" },
        body,
      });
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows) && rows.length) return { room };
        continue; // alguien escribió al mismo tiempo: reintentar
      }
    } else {
      res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?on_conflict=id`, {
        method: "POST",
        headers: { ...sbHeaders(SERVICE_KEY), Prefer: "resolution=merge-duplicates,return=minimal" },
        body,
      });
      if (res.ok) return { room };
    }
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
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

// ¿Trae un enlace o una dirección web? (permitido solo cineversomagico.com)
function hasLink(text: string): boolean {
  const t = text.toLowerCase()
    .replace(/\s*(\.|\(punto\)|\[punto\]|\(dot\)|\[dot\]| punto | dot )\s*/g, ".")
    .replace(/https?:\/\/(www\.)?cineversomagico\.com\S*/g, "")
    .replace(/(^|\s)(www\.)?cineversomagico\.com\S*/g, " ");
  if (/https?:\/\/|www\.|t\.me\/|bit\.ly|tinyurl|wa\.me/.test(t)) return true;
  // dominio.algo (ej. pelis.to, descargas.net, gdrivelatino.org)
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
const online = (room: Room) => {
  const now = Date.now();
  return Object.values(room.seen || {}).filter((t) => now - t < 70000).length;
};

// LEER mensajes nuevos (desde ?since=)
export async function GET(req: Request) {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) return fail("Servidor sin configurar", 503);
  const sp = new URL(req.url).searchParams;
  const since = Number(sp.get("since") || 0) || 0;
  try {
    const { room } = await readRoom();
    const msgs = room.msgs.filter((m) => m.at > since).slice(-80);
    return NextResponse.json({ msgs, pinned: room.pinned, online: online(room), ids: room.msgs.map((m) => m.id) }, { headers: noStore });
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
    // Marca "en línea" (cada visita con el chat abierto)
    if (action === "ping") {
      const u = await currentUser();
      const key = u ? u.id : "g-" + str(b.vid, 40);
      if (!key || key === "g-") return NextResponse.json({ ok: true }, { headers: noStore });
      const { room } = await updateRoom((r) => {
        const now = Date.now();
        r.seen = r.seen || {};
        for (const k of Object.keys(r.seen)) if (now - r.seen[k] > 120000) delete r.seen[k];
        r.seen[key] = now;
      });
      return NextResponse.json({ ok: true, online: online(room) }, { headers: noStore });
    }

    if (action === "send") {
      const isAdmin = passwordOk(b?.password);
      const u = await currentUser();
      if (!u && !isAdmin) return fail("Inicia sesión para escribir en el chat", 401);
      const uid = u ? u.id : "admin";
      const text = str(b.text, 300);
      if (!text) return fail("Escribe un mensaje", 400);
      if (!isAdmin && hasLink(text)) return fail("🚫 No se permiten enlaces ni direcciones de páginas en el chat.", 422);
      const name = isAdmin ? (str(b.name, 24) || "Rey") : str(b.name, 24) || (u ? u.email.split("@")[0].slice(0, 20) : "Usuario");
      const avatar = /^\/[a-zA-Z0-9_\-./ %]+$/.test(str(b.avatar, 200)) ? str(b.avatar, 200) : "";
      const now = Date.now();
      const { room, error } = await updateRoom((r) => {
        if (!isAdmin && r.banned.indexOf(uid) !== -1) return "No puedes escribir en el chat.";
        r.last = r.last || {};
        if (!isAdmin && r.last[uid] && now - r.last[uid] < 3000) return "Espera unos segundos antes de enviar otro mensaje.";
        r.last[uid] = now;
        for (const k of Object.keys(r.last)) if (now - r.last[k] > 600000) delete r.last[k];
        r.msgs.push({ id: "m" + now.toString(36) + Math.random().toString(36).slice(2, 6), at: now, uid, name, avatar, text: isAdmin ? text : clean(text), admin: isAdmin || undefined });
        if (r.msgs.length > MAX_MSGS) r.msgs = r.msgs.slice(-MAX_MSGS);
      });
      if (error) return fail(error, 429);
      return NextResponse.json({ ok: true, last: room.msgs[room.msgs.length - 1] }, { headers: noStore });
    }

    // Administrador: borrar mensaje, bloquear/desbloquear, fijar mensaje
    if (action === "delete" || action === "ban" || action === "unban" || action === "pin" || action === "admin") {
      if (!passwordOk(b?.password)) {
        await new Promise((r) => setTimeout(r, 800));
        return fail("Clave incorrecta", 401);
      }
      const id = str(b.id, 40), uid = str(b.uid, 60);
      const { room } = await updateRoom((r) => {
        if (action === "delete") r.msgs = r.msgs.filter((m) => m.id !== id);
        if (action === "ban" && uid && r.banned.indexOf(uid) === -1) { r.banned.push(uid); r.msgs = r.msgs.filter((m) => m.uid !== uid); }
        if (action === "unban") r.banned = r.banned.filter((x) => x !== uid);
        if (action === "pin") r.pinned = str(b.text, 300);
      });
      return NextResponse.json({ ok: true, banned: room.banned, pinned: room.pinned, ids: room.msgs.map((m) => m.id) }, { headers: noStore });
    }
    return fail("Acción inválida", 400);
  } catch {
    return fail("El chat está muy ocupado, inténtalo de nuevo.", 503);
  }
}
