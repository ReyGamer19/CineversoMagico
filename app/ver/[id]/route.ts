import { connection } from "next/server";

// Enlace para compartir una película: /ver/ID
// WhatsApp, Facebook, X y Telegram leen estas etiquetas y muestran portada, título y sinopsis.
// Las personas son llevadas al instante a la ficha dentro de la página.

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const esc = (t: unknown) =>
  String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;
  // Facebook, WhatsApp y otros robots NO deben ser redirigidos: si lo son, leen la portada de la web en vez de la película
  const ua = req.headers.get("user-agent") || "";
  const bot = /facebookexternalhit|facebookcatalog|facebot|meta-externalagent|whatsapp|telegrambot|twitterbot|discordbot|slackbot|linkedinbot|pinterest|skypeuripreview|embedly|vkshare|redditbot|applebot|googlebot|bingbot|bytespider|iframely|mastodon|whatsapp/i.test(ua);
  let m: any = null;
  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      const h: Record<string, string> = { apikey: SERVICE_KEY };
      if (SERVICE_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SERVICE_KEY}`;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.1&select=data`, { headers: h, cache: "no-store" });
      if (res.ok) {
        const rows = await res.json();
        const list = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].data) ? rows[0].data : [];
        m = list.find((x: any) => String(x.id) === String(id)) || null;
      }
    } catch {}
  }
  const title = m ? `${m.title}${m.year ? " (" + m.year + ")" : ""} | Cineverso Mágico` : "Cineverso Mágico";
  const desc = m && m.desc ? String(m.desc).slice(0, 200) : "Películas, series y TV en vivo en Cineverso Mágico.";
  const image = (m && (m.backdrop || m.bgImage)) || origin + "/icons/icon-512.png";
  const target = origin + "/?ver=" + encodeURIComponent(id);
  const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="Cineverso Mágico">
<meta property="og:type" content="${m && m.type === "serie" ? "video.tv_show" : "video.movie"}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta property="og:url" content="${esc(origin + "/ver/" + encodeURIComponent(id))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="theme-color" content="#050505">
<link rel="icon" href="/icon.png">
<style>body{margin:0;background:#050505;color:#e5e7eb;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}a{color:#4ade80}</style>
</head><body>
<p>Abriendo <a href="${esc(target)}">${esc(m ? m.title : "Cineverso Mágico")}</a>…</p>
${bot ? "" : "<script>location.replace(" + JSON.stringify(target) + ");</script>"}
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", "Vary": "User-Agent" } });
}
