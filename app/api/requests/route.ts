import { NextResponse, connection } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

// Solicitudes de películas de los usuarios (solo con cuenta).
// Se guardan en la tabla "catalog", fila id = 5. El administrador las ve en su panel.

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_HASH = "29c7b21d3cde1ccfca37823fe7bb9eed806a4e2d145df2a531f1be576ee26031";
const ROW = 5;
const noStore = { "Cache-Control": "no-store, max-age=0" };

type Req = { id: string; at: number; uid: string; email: string; profile: string; title: string; note: string; status: "nueva" | "agregada" | "rechazada"; reply?: string };

const sbHeaders = (key: string, bearer?: string): Record<string, string> => {
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  else if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
};
async function getRow(): Promise<{ items: Req[] }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${ROW}&select=data`, { headers: sbHeaders(SERVICE_KEY), cache: "no-store" });
  if (!res.ok) throw new Error("read");
  const rows = await res.json();
  const d = Array.isArray(rows) && rows[0] && rows[0].data ? rows[0].data : null;
  return { items: d && Array.isArray(d.items) ? d.items : [] };
}
async function setRow(data: { items: Req[] }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?on_conflict=id`, {
    method: "POST",
    headers: { ...sbHeaders(SERVICE_KEY), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: ROW, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error("write");
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
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(req: Request) {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) return fail("Servidor sin configurar", 503);
  let b: any;
  try { b = await req.json(); } catch { return fail("Solicitud inválida", 400); }
  const action = str(b?.action, 20);
  try {
    // Usuario: enviar una solicitud
    if (action === "add") {
      const u = await currentUser();
      if (!u) return fail("Inicia sesión para pedir películas", 401);
      const title = str(b.title, 120);
      if (title.length < 2) return fail("Escribe el nombre de la película o serie", 400);
      const d = await getRow();
      const now = Date.now();
      const mine = d.items.filter((x) => x.uid === u.id && now - x.at < 86400000);
      if (mine.length >= 5) return fail("Puedes hacer hasta 5 pedidos por día. ¡Gracias por tu paciencia!", 429);
      if (d.items.some((x) => x.uid === u.id && x.status === "nueva" && x.title.toLowerCase() === title.toLowerCase())) return fail("Ya pediste ese título. Te avisaremos cuando esté.", 409);
      d.items.push({ id: "r" + now.toString(36) + Math.random().toString(36).slice(2, 5), at: now, uid: u.id, email: u.email, profile: str(b.profile, 30), title, note: str(b.note, 300), status: "nueva" });
      if (d.items.length > 1000) d.items = d.items.slice(-1000);
      await setRow(d);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    // Usuario: ver mis solicitudes
    if (action === "mine") {
      const u = await currentUser();
      if (!u) return fail("Inicia sesión", 401);
      const d = await getRow();
      const items = d.items.filter((x) => x.uid === u.id).slice(-20).reverse().map((x) => ({ id: x.id, at: x.at, title: x.title, status: x.status, reply: x.reply || "" }));
      return NextResponse.json({ ok: true, items }, { headers: noStore });
    }
    // Administrador
    if (action === "list" || action === "status" || action === "delete") {
      if (!passwordOk(b?.password)) {
        await new Promise((r) => setTimeout(r, 800));
        return fail("Clave incorrecta", 401);
      }
      const d = await getRow();
      if (action === "status") {
        const it = d.items.find((x) => x.id === str(b.id, 40));
        const st = str(b.status, 12);
        if (it && (st === "nueva" || st === "agregada" || st === "rechazada")) {
          it.status = st;
          it.reply = str(b.reply, 200);
          await setRow(d);
        }
      } else if (action === "delete") {
        const id = str(b.id, 40);
        d.items = d.items.filter((x) => x.id !== id);
        await setRow(d);
      }
      return NextResponse.json({ ok: true, items: d.items.slice().reverse() }, { headers: noStore });
    }
    return fail("Acción inválida", 400);
  } catch {
    return fail("Error de conexión", 502);
  }
}
