import { NextResponse, connection } from "next/server";

// Autocompletar fichas con TMDB (The Movie Database).
// Necesita la variable TMDB_API_KEY en Vercel (sirve la "API Key" v3 o el "API Read Access Token" v4).
// La clave se queda en el servidor: nunca llega al navegador.

const TMDB_KEY = (process.env.TMDB_API_KEY || "").trim();
const noStore = { "Cache-Control": "no-store, max-age=0" };
const IMG = "https://image.tmdb.org/t/p/";

const GENRE_MAP: Record<string, string> = {
  "acción": "Acción", "action & adventure": "Acción", "aventura": "Aventura", "animación": "Animación",
  "comedia": "Comedia", "crimen": "Crimen", "documental": "Documental", "drama": "Drama", "familia": "Familia",
  "fantasía": "Fantasía", "sci-fi & fantasy": "Ciencia ficción", "historia": "Historia", "terror": "Terror",
  "música": "Música", "misterio": "Misterio", "romance": "Romance", "ciencia ficción": "Ciencia ficción",
  "suspense": "Suspenso", "suspenso": "Suspenso", "bélica": "Bélica", "war & politics": "Bélica", "western": "Western",
  "kids": "Animación", "infantil": "Animación",
};

const AGE_MAP: Record<string, Record<string, string>> = {
  ES: { A: "ATP", APTA: "ATP", "7": "+7", "12": "+13", "13": "+13", "16": "+16", "18": "+18" },
  MX: { AA: "ATP", A: "ATP", B: "+13", B15: "+16", C: "+18", D: "+18" },
  US: { G: "ATP", "TV-Y": "ATP", "TV-G": "ATP", PG: "+7", "TV-Y7": "+7", "TV-PG": "+7", "PG-13": "+13", "TV-14": "+13", R: "+16", "TV-MA": "+18", "NC-17": "+18" },
};

async function tmdb(path: string, params: Record<string, string> = {}) {
  const url = new URL("https://api.themoviedb.org/3" + path);
  for (const k of Object.keys(params)) url.searchParams.set(k, params[k]);
  const headers: Record<string, string> = { accept: "application/json" };
  if (TMDB_KEY.startsWith("eyJ")) headers.Authorization = "Bearer " + TMDB_KEY;
  else url.searchParams.set("api_key", TMDB_KEY);
  const res = await fetch(url.toString(), { headers, cache: "no-store" });
  if (res.status === 401) throw new Error("bad_key");
  if (!res.ok) throw new Error("tmdb_" + res.status);
  return res.json();
}

// Saga (colección de TMDB): nombre limpio y número de esta película según la fecha de estreno
const cleanSagaName = (n: string) =>
  String(n || "")
    .replace(/\s*[-–:]\s*colecci[oó]n\s*$/i, "")
    .replace(/^colecci[oó]n\s+(de\s+)?/i, "")
    .replace(/\s*\(colecci[oó]n\)\s*/i, " ")
    .replace(/\s+collection$/i, "")
    .replace(/\s*\((live[- ]?action|theatrical|animated|animada|animaci[oó]n|colecci[oó]n|collection|saga|franquicia|franchise|serie|series|trilog[ií]a|trilogy)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
async function sagaInfo(movieId: number, col: any): Promise<{ saga: string; sagaId: number; sagaOrder: number; sagaTotal: number } | null> {
  if (!col || !col.id) return null;
  try {
    const c: any = await tmdb("/collection/" + col.id, { language: "es-MX" });
    const parts: any[] = (c.parts || []).slice().sort((a: any, b: any) => {
      const x = a.release_date || "9999", y = b.release_date || "9999";
      return x < y ? -1 : x > y ? 1 : 0;
    });
    const idx = parts.findIndex((p) => p.id === movieId);
    const saga = cleanSagaName(c.name || col.name || "");
    if (!saga) return null;
    return { saga, sagaId: Number(col.id), sagaOrder: idx >= 0 ? idx + 1 : 0, sagaTotal: parts.length };
  } catch {
    return null;
  }
}

const fmtRuntime = (min: number) => (min > 0 ? (min >= 60 ? Math.floor(min / 60) + " h " + (min % 60) + " min" : min + " min") : "");

export async function GET(req: Request) {
  await connection();
  if (!TMDB_KEY) {
    return NextResponse.json({ error: "no_key" }, { status: 503, headers: noStore });
  }
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") === "tv" ? "tv" : "movie";
  const q = (sp.get("q") || "").trim().slice(0, 120);
  const id = (sp.get("id") || "").replace(/[^0-9]/g, "");

  try {
    // 0) Solo la saga de una película (para ordenar el catálogo ya subido): ?saga=1&q=Título&year=2023  o  ?saga=1&id=123
    if (sp.get("saga") && type === "movie") {
      let mid = Number(id) || 0;
      if (!mid) {
        if (!q) return NextResponse.json({ error: "Falta el título" }, { status: 400, headers: noStore });
        const year = (sp.get("year") || "").replace(/[^0-9]/g, "").slice(0, 4);
        const d: any = await tmdb("/search/movie", { query: q, language: "es-MX", include_adult: "false", ...(year ? { year } : {}) });
        let list: any[] = d.results || [];
        if (!list.length && year) { const d2: any = await tmdb("/search/movie", { query: q, language: "es-MX", include_adult: "false" }); list = d2.results || []; }
        const best = list.find((r: any) => year && String(r.release_date || "").slice(0, 4) === year) || list[0];
        if (!best) return NextResponse.json({ found: false }, { headers: noStore });
        mid = best.id;
      }
      const m: any = await tmdb("/movie/" + mid, { language: "es-MX" });
      const info = await sagaInfo(mid, m.belongs_to_collection);
      return NextResponse.json({ found: true, tmdbId: mid, title: m.title || "", ...(info || { saga: "", sagaId: 0, sagaOrder: 0, sagaTotal: 0 }) }, { headers: noStore });
    }

    // 1) Buscar por título
    if (!id) {
      if (!q) return NextResponse.json({ results: [] }, { headers: noStore });
      const d: any = await tmdb("/search/" + type, { query: q, language: "es-MX", include_adult: "false" });
      const results = (d.results || []).slice(0, 8).map((r: any) => ({
        id: r.id,
        title: r.title || r.name || "",
        original: r.original_title || r.original_name || "",
        year: String(r.release_date || r.first_air_date || "").slice(0, 4),
        poster: r.poster_path ? IMG + "w154" + r.poster_path : "",
      }));
      return NextResponse.json({ results }, { headers: noStore });
    }

    // 2) Detalles completos
    const extra = type === "movie" ? "credits,videos,release_dates" : "credits,videos,content_ratings";
    const d: any = await tmdb("/" + type + "/" + id, { language: "es-MX", append_to_response: extra, include_video_language: "es,en,null" });

    const genres: string[] = [];
    (d.genres || []).forEach((g: any) => {
      const name = GENRE_MAP[String(g.name || "").toLowerCase()];
      if (name && genres.indexOf(name) === -1) genres.push(name);
    });

    let ageRating = "";
    for (const country of ["ES", "MX", "US"]) {
      let cert = "";
      if (type === "movie") {
        const r = (d.release_dates?.results || []).find((x: any) => x.iso_3166_1 === country);
        cert = (r?.release_dates || []).map((x: any) => x.certification).find((c: string) => !!c) || "";
      } else {
        const r = (d.content_ratings?.results || []).find((x: any) => x.iso_3166_1 === country);
        cert = r?.rating || "";
      }
      const mapped = AGE_MAP[country][String(cert).toUpperCase().trim()];
      if (mapped) { ageRating = mapped; break; }
    }

    const crew = d.credits?.crew || [];
    const director =
      type === "movie"
        ? crew.filter((c: any) => c.job === "Director").map((c: any) => c.name).slice(0, 2).join(", ")
        : (d.created_by || []).map((c: any) => c.name).slice(0, 2).join(", ");
    const cast = (d.credits?.cast || []).slice(0, 6).map((c: any) => c.name).join(", ");

    const vids = (d.videos?.results || []).filter((v: any) => v.site === "YouTube");
    const pick =
      vids.find((v: any) => v.type === "Trailer" && v.iso_639_1 === "es") ||
      vids.find((v: any) => v.type === "Trailer") ||
      vids.find((v: any) => v.type === "Teaser") ||
      vids[0];
    const trailerUrl = pick ? "https://www.youtube.com/watch?v=" + pick.key : "";

    const runtime = type === "movie" ? d.runtime : (d.episode_run_time || [])[0];
    const saga = type === "movie" ? await sagaInfo(Number(id), d.belongs_to_collection) : null;
    const lang = String(d.original_language || "").toUpperCase();

    return NextResponse.json(
      {
        title: d.title || d.name || "",
        year: String(d.release_date || d.first_air_date || "").slice(0, 4),
        desc: d.overview || "",
        duration: fmtRuntime(runtime || 0),
        genres,
        ageRating,
        director,
        cast,
        trailerUrl,
        poster: d.poster_path ? IMG + "w500" + d.poster_path : "",
        backdrop: d.backdrop_path ? IMG + "w1280" + d.backdrop_path : "",
        rating: d.vote_average ? (Math.round(d.vote_average * 10) / 10).toFixed(1) : "",
        originalLanguage: lang,
        production: (d.production_companies || []).map((p: any) => p.name).slice(0, 2).join(", "),
        tmdbId: Number(id),
        saga: saga ? saga.saga : "",
        sagaId: saga ? saga.sagaId : 0,
        sagaOrder: saga ? saga.sagaOrder : 0,
        sagaTotal: saga ? saga.sagaTotal : 0,
      },
      { headers: noStore }
    );
  } catch (e: any) {
    if (e?.message === "bad_key") return NextResponse.json({ error: "bad_key" }, { status: 401, headers: noStore });
    return NextResponse.json({ error: "tmdb_error" }, { status: 502, headers: noStore });
  }
}
