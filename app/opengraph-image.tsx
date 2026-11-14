import { ImageResponse } from "next/og";

// Imagen que muestran Facebook, WhatsApp, X y Telegram al compartir www.cineversomagico.com
export const alt = "Cineverso Mágico — Películas, series y TV en vivo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const holes = Array.from({ length: 22 });
  const strip = (top: boolean) => (
    <div style={{ position: "absolute", left: 0, right: 0, [top ? "top" : "bottom"]: 0, height: 34, background: "#050505", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 10px" }}>
      {holes.map((_, i) => <div key={i} style={{ width: 30, height: 16, borderRadius: 4, background: "rgba(255,255,255,.14)" }} />)}
    </div>
  );
  const posters = [
    { c1: "#1d4ed8", c2: "#7c3aed", r: -9, x: 0, y: 40 },
    { c1: "#be123c", c2: "#f59e0b", r: 6, x: 150, y: 0 },
    { c1: "#047857", c2: "#22d3ee", r: -2, x: 75, y: 120 },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: "#fff", fontFamily: "sans-serif", background: "#07060d", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: -200, top: -180, width: 680, height: 680, borderRadius: 680, background: "radial-gradient(circle, rgba(34,197,94,.55) 0%, rgba(34,197,94,0) 68%)" }} />
        <div style={{ position: "absolute", right: -180, bottom: -240, width: 720, height: 720, borderRadius: 720, background: "radial-gradient(circle, rgba(168,85,247,.5) 0%, rgba(168,85,247,0) 68%)" }} />
        <div style={{ position: "absolute", right: 300, top: -140, width: 400, height: 400, borderRadius: 400, background: "radial-gradient(circle, rgba(250,204,21,.25) 0%, rgba(250,204,21,0) 70%)" }} />
        {strip(true)}
        {strip(false)}

        {/* texto */}
        <div style={{ position: "absolute", left: 70, top: 88, width: 660, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 92, height: 92, borderRadius: 26, background: "linear-gradient(135deg,#22c55e,#a3e635)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 50px rgba(34,197,94,.55)" }}>
              <div style={{ width: 0, height: 0, borderTop: "22px solid transparent", borderBottom: "22px solid transparent", borderLeft: "36px solid #04130a", marginLeft: 8 }} />
            </div>
            <div style={{ display: "flex", padding: "8px 18px", borderRadius: 999, background: "rgba(34,197,94,.18)", border: "1px solid rgba(74,222,128,.5)", color: "#86efac", fontSize: 20, fontWeight: 800, letterSpacing: 3 }}>TU CINE EN CASA</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 22, fontSize: 84, fontWeight: 900, lineHeight: 0.95, letterSpacing: -3 }}>
            <div style={{ display: "flex" }}>Cineverso</div>
            <div style={{ display: "flex", color: "#4ade80" }}>Mágico</div>
          </div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 32, fontWeight: 700, color: "#e2e8f0" }}>Películas, series y TV en vivo.</div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            {["Estrenos", "TV en vivo", "Comunidad", "Reseñas"].map((t, i) => (
              <div key={t} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, fontSize: 22, fontWeight: 800, background: i === 0 ? "#facc15" : "rgba(255,255,255,.1)", color: i === 0 ? "#1a1200" : "#f1f5f9", border: "1px solid rgba(255,255,255,.16)" }}>{t}</div>
            ))}
          </div>
        </div>

        {/* pósters decorativos */}
        <div style={{ position: "absolute", right: 90, top: 92, width: 380, height: 460, display: "flex" }}>
          {posters.map((p, i) => (
            <div key={i} style={{ position: "absolute", left: p.x, top: p.y, width: 220, height: 320, borderRadius: 22, transform: `rotate(${p.r}deg)`, background: `linear-gradient(160deg, ${p.c1} 0%, ${p.c2} 100%)`, border: "4px solid rgba(255,255,255,.85)", boxShadow: "0 30px 60px rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {i === 2 && (
                <div style={{ width: 86, height: 86, borderRadius: 86, background: "rgba(255,255,255,.95)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(255,255,255,.5)" }}>
                  <div style={{ width: 0, height: 0, borderTop: "18px solid transparent", borderBottom: "18px solid transparent", borderLeft: "30px solid #07060d", marginLeft: 8 }} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: 72, bottom: 54, display: "flex", fontSize: 22, fontWeight: 800, color: "#a7f3d0", letterSpacing: 1 }}>www.cineversomagico.com</div>
      </div>
    ),
    { ...size }
  );
}
