import { connection } from "next/server";

// Enlace para compartir "Mi año en Cineverso": /resumen?n=...&t=...
// WhatsApp, Facebook, X y Telegram muestran la tarjeta como imagen de vista previa.
// Las personas que lo abren van a la página de inicio.

const esc = (t: unknown) =>
  String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export async function GET(req: Request) {
  await connection();
  const u = new URL(req.url);
  const origin = u.origin;
  const keep = new URLSearchParams();
  for (const k of ["n", "t", "h", "g", "p", "b", "f", "y"]) { const v = u.searchParams.get(k); if (v) keep.set(k, v.slice(0, 120)); }
  const name = (u.searchParams.get("n") || "").slice(0, 24);
  const title = (name ? "El año de " + name : "Mi año") + " en Cineverso Mágico 🍿";
  const desc = (u.searchParams.get("t") || "0") + " títulos, " + (u.searchParams.get("h") || "0") + " horas de cine y personalidad «" + (u.searchParams.get("p") || "Cinéfilo") + "». ¿Y tú? Descubre tu resumen en Cineverso Mágico.";
  const image = origin + "/api/resumen-img?" + keep.toString();
  const target = origin + "/";
  const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="Cineverso Mágico">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(origin + "/resumen?" + keep.toString())}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<style>body{background:#050505;color:#fff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>
</head><body><p>Abriendo Cineverso Mágico… <a style="color:#4ade80" href="${esc(target)}">Entrar</a></p>
<script>location.replace(${JSON.stringify(target)});</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
