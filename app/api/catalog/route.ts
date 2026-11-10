import { NextResponse, connection } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

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

  if (!body || !passwordOk(body.password)) {
    // Pequeña espera para frenar a quien intente adivinar la clave
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401, headers: noStore });
  }
  if (!Array.isArray(body.movies)) {
    return NextResponse.json({ error: "Catálogo inválido" }, { status: 400, headers: noStore });
  }
  if (JSON.stringify(body.movies).length > 3_000_000) {
    return NextResponse.json({ error: "Catálogo demasiado grande" }, { status: 413, headers: noStore });
  }

  try {
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
