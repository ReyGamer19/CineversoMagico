import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// São Paulo: más cerca de Perú/Chile/Argentina. Quita esta línea si no la quieres.
export const preferredRegion = "gru1";

const MAX_PLAYLIST_BYTES = 2_000_000;

// Evita que el proxy se use para llegar a redes internas
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("::ffff:") || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

const text = (msg: string, status: number) =>
  new NextResponse(msg, { status, headers: { "Cache-Control": "no-store" } });

const proxify = (abs: string) => `/api/stream?url=${encodeURIComponent(abs)}`;

// Reescribe una lista .m3u8 para que sus segmentos también pasen por el proxy
function rewritePlaylist(body: string, base: URL): string {
  const abs = (u: string) => {
    try {
      return new URL(u, base).toString();
    } catch {
      return u;
    }
  };
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxify(abs(u))}"`);
      return proxify(abs(t));
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  // No servir como proxy a páginas de otros sitios
  if (req.headers.get("sec-fetch-site") === "cross-site") return text("No permitido", 403);

  const target = req.nextUrl.searchParams.get("url") || "";
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return text("URL inválida", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return text("Protocolo no permitido", 400);

  try {
    const { address } = await lookup(url.hostname);
    if (isPrivateIp(address)) return text("Destino no permitido", 403);
  } catch {
    return text("No se pudo resolver el servidor", 502);
  }

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0", ...(range ? { Range: range } : {}) },
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return text("El canal no responde", 504);
  }

  // Las redirecciones vuelven a pasar por este proxy (así se revisan otra vez)
  const location = upstream.headers.get("location");
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    try {
      const next = new URL(location, url).toString();
      return NextResponse.redirect(new URL(proxify(next), req.url), 307);
    } catch {
      return text("Redirección inválida", 502);
    }
  }

  if (!upstream.ok && upstream.status !== 206) return text("El canal devolvió un error", upstream.status);
  if (!upstream.body) return new Response(null, { status: upstream.status });

  const ctype = upstream.headers.get("content-type") || "";
  const isPlaylistType = /mpegurl/i.test(ctype) || /\.m3u8$/i.test(url.pathname);
  const isKnownMedia = !isPlaylistType && /^(video|audio)\//i.test(ctype);

  const headers = new Headers();
  for (const h of ["content-type", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  const reader = upstream.body.getReader();

  // Si no es claramente un video, mirar el inicio: muchas señales entregan la lista .m3u8
  // sin extensión ni tipo correcto (por ejemplo /play/a0xx).
  if (!isKnownMedia) {
    const first = await reader.read();
    const firstChunk = first.value ?? new Uint8Array();
    const head = new TextDecoder().decode(firstChunk.subarray(0, 32)).trimStart();

    if (head.startsWith("#EXTM3U")) {
      const parts: Buffer[] = [Buffer.from(firstChunk)];
      let total = firstChunk.length;
      while (!first.done) {
        const r = await reader.read();
        if (r.done) break;
        parts.push(Buffer.from(r.value));
        total += r.value.length;
        if (total > MAX_PLAYLIST_BYTES) {
          reader.cancel().catch(() => {});
          return text("Lista demasiado grande", 502);
        }
      }
      const rewritten = rewritePlaylist(Buffer.concat(parts).toString("utf-8"), url);
      return new Response(rewritten, {
        status: 200,
        headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" },
      });
    }

    // No era una lista: devolver el contenido tal cual, incluyendo el primer pedazo ya leído
    const firstDone = first.done;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (firstChunk.length) controller.enqueue(firstChunk);
        if (firstDone) controller.close();
      },
      async pull(controller) {
        const r = await reader.read();
        if (r.done) controller.close();
        else controller.enqueue(r.value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    if (upstream.ok) headers.set("Cache-Control", "public, max-age=30, s-maxage=30");
    return new Response(stream, { status: upstream.status, headers });
  }

  // Segmentos de video y otros archivos: se pasan tal cual
  if (!upstream.headers.get("content-encoding")) {
    const len = upstream.headers.get("content-length");
    if (len) headers.set("content-length", len);
  }
  // Los segmentos de HLS no cambian: la CDN puede reutilizarlos entre espectadores
  headers.set("Cache-Control", "public, max-age=30, s-maxage=30");
  const passthrough = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const r = await reader.read();
      if (r.done) controller.close();
      else controller.enqueue(r.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(passthrough, { status: upstream.status, headers });
}