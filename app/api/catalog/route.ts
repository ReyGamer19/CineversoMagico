import { NextResponse, connection } from "next/server";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// La guía de programación se guarda en la misma tabla "catalog", en la fila id = 2
// (el catálogo de películas usa la fila id = 1), así no hace falta crear otra tabla.
const EPG_ROW_ID = 2;

const baseHeaders = (): Record<string, string> => {
  const h: Record<string, string> = {
    apikey: SERVICE_KEY,
    "Content-Type": "application/json",
  };
  if (SERVICE_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
};

const noStore = { "Cache-Control": "no-store, max-age=0" };

// LEER la programación (pública: la usan todos los dispositivos)
export async function GET() {
  await connection();
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ error: "Servidor sin configurar" }, { status: 503, headers: noStore });
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.${EPG_ROW_ID}&select=data`, {
      headers: baseHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Error leyendo programación" }, { status: 502, headers: noStore });
    }
    const rows = await res.json();
    const data = Array.isArray(rows) && rows[0] ? rows[0].data : null;
    const schedule = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    return NextResponse.json({ schedule }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Error de conexión" }, { status: 502, headers: noStore });
  }
}

// GUARDAR la programación (solo con la clave de administrador)
export async function POST(req: Request) {
  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Servidor sin configurar" }, { status: 503, headers: noStore });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400, headers: noStore });
  }

  if (!body || body.password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401, headers: noStore });
  }
  const schedule = body.schedule;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    return NextResponse.json({ error: "Programación inválida" }, { status: 400, headers: noStore });
  }
  if (JSON.stringify(schedule).length > 1_000_000) {
    return NextResponse.json({ error: "Programación demasiado grande" }, { status: 413, headers: noStore });
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?on_conflict=id`, {
      method: "POST",
      headers: { ...baseHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: EPG_ROW_ID, data: schedule, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "No se pudo guardar" }, { status: 502, headers: noStore });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Error de conexión" }, { status: 502, headers: noStore });
  }
}