import { ImageResponse } from "next/og";

// Imagen para la vista previa de "Mi año en Cineverso" (WhatsApp, Facebook, X, Telegram).
// Diseño "boleto de cine": /api/resumen-img?n=Rey&t=12&h=18.5&g=Animación,Acción&p=Niño interior&b=5&f=1&y=2026&i=URL_DEL_POSTER

const clip = (v: string | null, max: number) => (v || "").replace(/[<>]/g, "").trim().slice(0, max);

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const name = clip(sp.get("n"), 20) || "Cinéfilo";
  const titles = String(Math.max(0, Math.min(9999, parseInt(sp.get("t") || "0", 10) || 0)));
  const hours = clip(sp.get("h"), 7) || "0";
  const genres = clip(sp.get("g"), 90).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3);
  const pers = clip(sp.get("p"), 34) || "Cinéfilo todoterreno";
  const badges = String(Math.max(0, Math.min(99, parseInt(sp.get("b") || "0", 10) || 0)));
  const owner = sp.get("f") === "1";
  const year = clip(sp.get("y"), 4) || "2026";
  const poster = /^https:\/\/[^\s"']+$/.test(sp.get("i") || "") ? (sp.get("i") as string) : "";

  const holes = Array.from({ length: 22 });
  const strip = (top: boolean) => (
    <div style={{ position: "absolute", left: 0, right: 0, [top ? "top" : "bottom"]: 0, height: 34, background: "#050505", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 10px" }}>
      {holes.map((_, i) => <div key={i} style={{ width: 30, height: 16, borderRadius: 4, background: "rgba(255,255,255,.14)" }} />)}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: "#fff", fontFamily: "sans-serif", background: "#07060d", overflow: "hidden" }}>
        {/* luces de fondo */}
        <div style={{ position: "absolute", left: -180, top: -160, width: 620, height: 620, borderRadius: 620, background: "radial-gradient(circle, rgba(34,197,94,.55) 0%, rgba(34,197,94,0) 68%)" }} />
        <div style={{ position: "absolute", right: -160, bottom: -220, width: 700, height: 700, borderRadius: 700, background: "radial-gradient(circle, rgba(168,85,247,.55) 0%, rgba(168,85,247,0) 68%)" }} />
        <div style={{ position: "absolute", right: 260, top: -120, width: 380, height: 380, borderRadius: 380, background: "radial-gradient(circle, rgba(250,204,21,.28) 0%, rgba(250,204,21,0) 70%)" }} />
        {/* año gigante de fondo */}
        <div style={{ position: "absolute", right: 30, top: 70, fontSize: 250, fontWeight: 900, color: "rgba(255,255,255,.05)", letterSpacing: -10 }}>{year}</div>
        {strip(true)}
        {strip(false)}

        {/* boleto */}
        <div style={{ position: "absolute", left: 56, top: 70, width: poster ? 720 : 1088, height: 448, display: "flex", flexDirection: "column", borderRadius: 34, padding: "34px 40px", background: "linear-gradient(135deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 100%)", border: "2px solid rgba(255,255,255,.16)", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
          {/* muescas del boleto */}
          <div style={{ position: "absolute", left: -22, top: 290, width: 44, height: 44, borderRadius: 44, background: "#07060d" }} />
          <div style={{ position: "absolute", right: -22, top: 290, width: 44, height: 44, borderRadius: 44, background: "#07060d" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#22c55e,#a3e635)", color: "#04130a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900 }}>CV</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Cineverso Mágico</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#4ade80", letterSpacing: 4 }}>{"TU AÑO EN CINEVERSO " + year}</div>
            </div>
            {owner && <div style={{ marginLeft: "auto", display: "flex", padding: "8px 16px", borderRadius: 999, background: "linear-gradient(90deg,#facc15,#f59e0b)", color: "#1a1200", fontSize: 18, fontWeight: 900 }}>FUNDADOR</div>}
          </div>
          <div style={{ display: "flex", fontSize: 74, fontWeight: 900, marginTop: 18, letterSpacing: -2 }}>{name}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            {[[titles, "títulos"], [hours, "horas"], [badges, "logros"]].map(([v, l], i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", padding: "12px 22px", borderRadius: 20, background: "rgba(0,0,0,.35)", border: "1px solid rgba(255,255,255,.12)" }}>
                <div style={{ fontSize: 46, fontWeight: 900, color: i === 0 ? "#4ade80" : i === 1 ? "#7dd3fc" : "#f9a8d4" }}>{v}</div>
                <div style={{ fontSize: 18, color: "#cbd5e1", fontWeight: 700 }}>{l}</div>
              </div>
            ))}
          </div>
          {/* línea punteada del boleto */}
          <div style={{ display: "flex", marginTop: 26, borderTop: "3px dashed rgba(255,255,255,.22)" }} />
          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 18, gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 17, color: "#94a3b8", fontWeight: 700, letterSpacing: 2 }}>PERSONALIDAD CINÉFILA</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#facc15" }}>{pers}</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {(genres.length ? genres : ["Por descubrir"]).slice(0, poster ? 2 : 3).map((g, i) => (
                <div key={i} style={{ display: "flex", padding: "8px 14px", borderRadius: 999, fontSize: 18, fontWeight: 800, background: i === 0 ? "rgba(34,197,94,.25)" : "rgba(255,255,255,.1)", color: i === 0 ? "#86efac" : "#e2e8f0", border: "1px solid rgba(255,255,255,.14)" }}>{g}</div>
              ))}
            </div>
          </div>
        </div>

        {/* póster de lo más visto */}
        {poster && (
          <div style={{ position: "absolute", right: 70, top: 62, display: "flex", flexDirection: "column", alignItems: "center", transform: "rotate(4deg)" }}>
            <div style={{ display: "flex", width: 300, height: 444, borderRadius: 24, overflow: "hidden", border: "4px solid rgba(255,255,255,.9)", boxShadow: "0 30px 70px rgba(0,0,0,.7), 0 0 60px rgba(250,204,21,.35)" }}>
              <img src={poster} width={300} height={444} style={{ objectFit: "cover" }} />
            </div>
            <div style={{ display: "flex", marginTop: 14, padding: "8px 18px", borderRadius: 999, background: "#fff", color: "#000", fontSize: 18, fontWeight: 900 }}>LO MÁS VISTO</div>
          </div>
        )}
        <div style={{ position: "absolute", left: 60, bottom: 50, display: "flex", fontSize: 20, fontWeight: 800, color: "#a7f3d0" }}>¿Y tú? Descubre tu año en cineversomagico.com</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } }
  );
}
