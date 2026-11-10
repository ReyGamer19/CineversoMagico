import { NextResponse, connection } from "next/server";

// Comprueba un enlace de video desde el servidor (sin descargarlo) para saber
// por qué no se reproduce: bloqueado (403), borrado (404), caído, no es video, etc.
// Solo devuelve el estado, nunca el contenido.

const noStore = { "Cache-Control": "no-store, max-age=0" };

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\[?::1\]?$/.test(h) || h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function GET(req: Request) {
  await connection();
  const raw = new URL(req.url).searchParams.get("u") || "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ ok: false, status: 0, reason: "invalid" }, { status: 400, headers: noStore });
  }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
    return NextResponse.json({ ok: false, status: 0, reason: "invalid" }, { status: 400, headers: noStore });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(target.toString(), {
      headers: { Range: "bytes=0-1023" },
      redirect: "follow",
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    try { await res.body?.cancel(); } catch {}
    return NextResponse.json(
      { ok: res.ok, status: res.status, contentType: res.headers.get("content-type") || "", acceptsRanges: res.status === 206 },
      { headers: noStore }
    );
  } catch (e: any) {
    clearTimeout(timer);
    return NextResponse.json({ ok: false, status: 0, reason: e?.name === "AbortError" ? "timeout" : "network" }, { headers: noStore });
  }
}
