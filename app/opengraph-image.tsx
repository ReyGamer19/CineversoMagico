import { ImageResponse } from "next/og";
import { connection } from "next/server";

// Imagen que muestran Facebook, WhatsApp, X y Telegram al compartir www.cineversomagico.com
// Usa tu logo real y los pósters y fondos reales de lo último que subiste (se actualiza solo).
export const alt = "Cineverso Mágico — Películas, series y TV en vivo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "https://www.cineversomagico.com";

// Descarga una imagen y la deja lista para dibujar (si falla o tarda, se omite)
async function asData(url: string, ms = 3500): Promise<string> {
  if (!/^https:\/\/[^\s"']+$/.test(url || "")) return "";
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    const ct = (r.headers.get("content-type") || "").split(";")[0];
    if (!r.ok || !/^image\/(png|jpe?g)$/i.test(ct)) return "";
    const buf = await r.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 4_000_000) return "";
    return "data:" + ct + ";base64," + Buffer.from(buf).toString("base64");
  } catch {
    return "";
  }
}
const sized = (u: string, s: string) => (/^https:\/\/image\.tmdb\.org\/t\/p\/(w\d+|original)\//.test(u) ? u.replace(/\/t\/p\/(w\d+|original)\//, "/t/p/" + s + "/") : u);

async function latestMovies(): Promise<any[]> {
  if (!SUPABASE_URL || !SERVICE_KEY) return [];
  try {
    const h: Record<string, string> = { apikey: SERVICE_KEY };
    if (SERVICE_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SERVICE_KEY}`;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog?id=eq.1&select=data`, { headers: h, cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const rows = await res.json();
    const list: any[] = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].data) ? rows[0].data : [];
    return list
      .filter((m) => m && !m.comingSoon && /^https:\/\//.test(m.bgImage || "") && !/unsplash\.com/.test(m.bgImage || ""))
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  } catch {
    return [];
  }
}

const Tri = ({ s, c }: { s: number; c: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill={c} /></svg>
);

export default async function Image() {
  await connection();
  const movies = await latestMovies();
  const picks = movies.slice(0, 5);
  const bdMovie = movies.find((m) => /^https:\/\//.test(m.backdrop || ""));
  const [logo, backdrop, ...posters] = await Promise.all([
    asData(SITE + "/icons/icon-512.png"),
    asData(bdMovie ? sized(bdMovie.backdrop, "w1280") : ""),
    ...picks.map((m) => asData(sized(m.bgImage, "w342"))),
  ]);
  const shown = picks.map((m, i) => ({ m, src: posters[i] })).filter((x) => x.src).slice(0, 5);

  const holes = Array.from({ length: 22 });
  const strip = (top: boolean) => (
    <div style={{ position: "absolute", left: 0, right: 0, [top ? "top" : "bottom"]: 0, height: 30, background: "#050505", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 10px" }}>
      {holes.map((_, i) => <div key={i} style={{ width: 28, height: 14, borderRadius: 4, background: "rgba(255,255,255,.14)" }} />)}
    </div>
  );
  // Abanico de pósters reales
  const fan = [
    { x: 0, y: 84, r: -12, w: 160 },
    { x: 92, y: 44, r: -5, w: 180 },
    { x: 200, y: 22, r: 2, w: 196 },
    { x: 322, y: 52, r: 9, w: 172 },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: "#fff", fontFamily: "sans-serif", background: "#07060d", overflow: "hidden" }}>
        {backdrop ? (
          <img src={backdrop} width={1200} height={675} style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 675, objectFit: "cover" }} />
        ) : null}
        <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, display: "flex", background: "linear-gradient(90deg, rgba(5,5,5,.97) 0%, rgba(5,5,5,.88) 42%, rgba(5,5,5,.45) 75%, rgba(5,5,5,.6) 100%)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 260, display: "flex", background: "linear-gradient(0deg, rgba(5,5,5,.95) 0%, rgba(5,5,5,0) 100%)" }} />
        <div style={{ position: "absolute", left: -200, top: -200, width: 640, height: 640, borderRadius: 640, background: "radial-gradient(circle, rgba(34,197,94,.35) 0%, rgba(34,197,94,0) 68%)" }} />
        {strip(true)}
        {strip(false)}

        {/* marca y texto */}
        <div style={{ position: "absolute", left: 64, top: 96, width: 560, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {logo ? (
              <img src={logo} width={84} height={84} style={{ borderRadius: 22, boxShadow: "0 0 40px rgba(34,197,94,.5)" }} />
            ) : (
              <div style={{ width: 84, height: 84, borderRadius: 22, background: "linear-gradient(135deg,#22c55e,#a3e635)", display: "flex", alignItems: "center", justifyContent: "center" }}><Tri s={44} c="#04130a" /></div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 50, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>Cineverso</div>
              <div style={{ display: "flex", fontSize: 50, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: "#4ade80" }}>Mágico</div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 38, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, width: 540 }}>Películas, series y TV en vivo, gratis.</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 22, color: "#cbd5e1", fontWeight: 600, lineHeight: 1.35 }}>Estrenos, sagas completas, reseñas y una comunidad para pedir lo que quieras ver.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 26px", borderRadius: 16, background: "#ffffff", color: "#050505", fontSize: 24, fontWeight: 900 }}>
              <Tri s={24} c="#050505" /> Ver ahora
            </div>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: "#a7f3d0" }}>www.cineversomagico.com</div>
          </div>
        </div>

        {/* pósters reales de lo último que subiste */}
        {shown.length >= 2 ? (
          <div style={{ position: "absolute", right: 44, top: 62, width: 500, height: 500, display: "flex" }}>
            {shown.slice(0, 4).map((x, i) => {
              const f = fan[i + (4 - Math.min(4, shown.length))] || fan[i];
              const h = Math.round(f.w * 1.5);
              return (
                <div key={i} style={{ position: "absolute", left: f.x, top: f.y, width: f.w, height: h, display: "flex", borderRadius: 18, overflow: "hidden", transform: `rotate(${f.r}deg)`, border: "3px solid rgba(255,255,255,.85)", boxShadow: "0 30px 60px rgba(0,0,0,.7)" }}>
                  <img src={x.src} width={f.w} height={h} style={{ width: f.w, height: h, objectFit: "cover" }} />
                </div>
              );
            })}
            <div style={{ position: "absolute", left: 135, top: 372, display: "flex", padding: "8px 18px", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>NUEVO EN CINEVERSO</div>
          </div>
        ) : (
          <div style={{ position: "absolute", right: 90, top: 90, width: 380, height: 460, display: "flex" }}>
            {[{ c1: "#1d4ed8", c2: "#7c3aed", r: -9, x: 0, y: 40 }, { c1: "#be123c", c2: "#f59e0b", r: 6, x: 150, y: 0 }, { c1: "#047857", c2: "#22d3ee", r: -2, x: 75, y: 120 }].map((p, i) => (
              <div key={i} style={{ position: "absolute", left: p.x, top: p.y, width: 220, height: 320, borderRadius: 22, transform: `rotate(${p.r}deg)`, background: `linear-gradient(160deg, ${p.c1} 0%, ${p.c2} 100%)`, border: "4px solid rgba(255,255,255,.85)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {i === 2 ? <div style={{ width: 86, height: 86, borderRadius: 86, background: "rgba(255,255,255,.95)", display: "flex", alignItems: "center", justifyContent: "center" }}><Tri s={40} c="#07060d" /></div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
