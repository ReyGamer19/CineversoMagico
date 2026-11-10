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

type Sub = { endpoint: string; keys: { p256dh: string; auth: string }; created: number };

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
      subs = subs.filter((x) => x.endpoint !== endpoint);
      if (action === "subscribe") {
        const p256dh = str(s?.keys?.p256dh, 200), auth = str(s?.keys?.auth, 100);
        if (!p256dh || !auth) return NextResponse.json({ error: "Suscripción inválida" }, { status: 400, headers: noStore });
        subs.push({ endpoint, keys: { p256dh, auth }, created: Date.now() });
        if (subs.length > 5000) subs = subs.slice(subs.length - 5000);
      }
      await setRow(SUBS_ROW, { subs });
      return NextResponse.json({ ok: true, total: subs.length }, { headers: noStore });
    }

    if (action === "send") {
      if (!passwordOk(b?.password)) {
        await new Promise((r) => setTimeout(r, 800));
        return NextResponse.json({ error: "Clave incorrecta" }, { status: 401, headers: noStore });
      }
      const payload = JSON.stringify({
        title: str(b.title, 80) || "Cineverso Mágico",
        body: str(b.body, 200),
        image: str(b.image, 500) || undefined,
        url: str(b.url, 300) || "/",
        tag: str(b.tag, 60) || undefined,
      });
      const k = await vapidKeys();
      setVapidDetails("mailto:" + CONTACT, k.publicKey, k.privateKey);
      const data = (await getRow(SUBS_ROW)) || { subs: [] };
      const subs: Sub[] = Array.isArray(data.subs) ? data.subs : [];
      const dead = new Set<string>();
      let sent = 0, failed = 0;
      for (let i = 0; i < subs.length; i += 50) {
        const batch = subs.slice(i, i + 50);
        const results = await Promise.allSettled(batch.map((s) => sendNotification(s, payload, { TTL: 86400 })));
        results.forEach((r, j) => {
          if (r.status === "fulfilled") sent++;
          else {
            failed++;
            const code = (r.reason && (r.reason as any).statusCode) || 0;
            if (code === 404 || code === 410) dead.add(batch[j].endpoint);
          }
        });
      }
      if (dead.size) await setRow(SUBS_ROW, { subs: subs.filter((s) => !dead.has(s.endpoint)) });
      return NextResponse.json({ ok: true, sent, failed, removed: dead.size, total: subs.length }, { headers: noStore });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 502, headers: noStore });
  }
}
