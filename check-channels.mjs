#!/usr/bin/env node
// Verificador de canales de Cineverso Mágico
//
// Uso (desde la carpeta de tu proyecto, con Node 18 o superior):
//   node check-channels.mjs app/page.tsx
//
// Para cada canal comprueba: que la lista .m3u8 responda, que el primer segmento de video se
// descargue y qué códecs usa (H.264/AAC funcionan en todos lados; HEVC, MPEG-2 y AC-3 fallan
// en muchos navegadores y celulares). Genera reporte-canales.csv y reporte-canales.json.
//
// Opciones por variable de entorno (PowerShell: $env:CONCURRENCY=20; node check-channels.mjs ...):
//   CONCURRENCY  canales probados a la vez (por defecto 12)
//   TIMEOUT_MS   tiempo máximo por petición en ms (por defecto 12000)

import fs from "node:fs";

const FILE = process.argv[2] || "app/page.tsx";
const CONCURRENCY = Number(process.env.CONCURRENCY || 12);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------- 1) Leer los canales desde page.tsx ----------
function readChannels(file) {
  const src = fs.readFileSync(file, "utf8");
  const tag = "const [liveChannels] = useState<Channel[]>([";
  const a = src.indexOf(tag);
  if (a < 0) throw new Error(`No encontré la lista liveChannels en ${file}`);
  const b = src.indexOf("\n  ]);", a);
  const block = src.slice(a + tag.length, b);
  const out = [];
  for (const o of block.split(/\n\s{4}\},?\n/)) {
    const g = (k) => (o.match(new RegExp(`\\b${k}:\\s*"((?:[^"\\\\]|\\\\.)*)"`)) || [])[1];
    const id = g("id");
    if (!id) continue;
    out.push({
      id,
      name: g("name") || "",
      country: g("country") || "",
      category: g("category") || "",
      url: g("videoUrl") || "",
      embed: g("embedUrl") || "",
    });
  }
  return out;
}

// ---------- 2) Descarga limitada ----------
async function get(url, { range, maxBytes = 300_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, ...(range ? { Range: range } : {}) },
    });
    const chunks = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      while (total < maxBytes) {
        const r = await reader.read();
        if (r.done) break;
        chunks.push(Buffer.from(r.value));
        total += r.value.length;
      }
      reader.cancel().catch(() => {});
    }
    return {
      ok: res.ok || res.status === 206,
      status: res.status,
      ctype: res.headers.get("content-type") || "",
      url: res.url || url,
      buf: Buffer.concat(chunks),
    };
  } finally {
    clearTimeout(timer);
  }
}

const reason = (e) => {
  if (e?.name === "AbortError") return "sin respuesta (timeout)";
  const c = e?.cause?.code || e?.cause?.errors?.[0]?.code || e?.code;
  return c ? String(c) : String(e?.message || e);
};

// ---------- 3) Listas HLS ----------
const resolveUrl = (u, base) => {
  try {
    return new URL(u, base).toString();
  } catch {
    return u;
  }
};

function parseAttrs(s) {
  const out = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[2].replace(/^"|"$/g, "");
  return out;
}

function parsePlaylist(text, base) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const variants = [];
  const segments = [];
  let map = null;
  let key = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = parseAttrs(l.slice("#EXT-X-STREAM-INF:".length));
      const next = lines.slice(i + 1).find((x) => !x.startsWith("#"));
      if (next) variants.push({ ...attrs, uri: resolveUrl(next, base) });
    } else if (l.startsWith("#EXT-X-MAP:")) {
      const a = parseAttrs(l.slice("#EXT-X-MAP:".length));
      if (a.URI) map = resolveUrl(a.URI, base);
    } else if (l.startsWith("#EXT-X-KEY:")) {
      key = parseAttrs(l.slice("#EXT-X-KEY:".length));
    } else if (!l.startsWith("#")) {
      segments.push(resolveUrl(l, base));
    }
  }
  return { variants, segments: variants.length ? [] : segments, map, key };
}

// ---------- 4) Códecs dentro de un segmento MPEG-TS (tablas PAT y PMT) ----------
function parseTs(buf) {
  let off = -1;
  const lim = Math.min(buf.length - 376, 1500);
  for (let i = 0; i < lim; i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) {
      off = i;
      break;
    }
  }
  if (off < 0) return null;
  let pmtPid = null;
  for (let p = off; p + 188 <= buf.length; p += 188) {
    if (buf[p] !== 0x47) break;
    const pusi = buf[p + 1] & 0x40;
    const pid = ((buf[p + 1] & 0x1f) << 8) | buf[p + 2];
    const afc = (buf[p + 3] >> 4) & 3;
    let q = p + 4;
    if (afc & 2) q += 1 + buf[q];
    if (!(afc & 1) || !pusi) continue;
    const s = q + 1 + buf[q];
    if (pid === 0 && pmtPid === null) {
      if (buf[s] !== 0) continue;
      const len = ((buf[s + 1] & 0x0f) << 8) | buf[s + 2];
      for (let e = s + 8; e + 4 <= s + 3 + len - 4; e += 4) {
        const prog = (buf[e] << 8) | buf[e + 1];
        const pp = ((buf[e + 2] & 0x1f) << 8) | buf[e + 3];
        if (prog !== 0) {
          pmtPid = pp;
          break;
        }
      }
    } else if (pmtPid !== null && pid === pmtPid) {
      const len = ((buf[s + 1] & 0x0f) << 8) | buf[s + 2];
      const pil = ((buf[s + 10] & 0x0f) << 8) | buf[s + 11];
      let e = s + 12 + pil;
      const end = Math.min(s + 3 + len - 4, p + 188);
      const streams = [];
      while (e + 5 <= end) {
        const type = buf[e];
        const esLen = ((buf[e + 3] & 0x0f) << 8) | buf[e + 4];
        const tags = [];
        for (let d = e + 5; d + 2 <= Math.min(e + 5 + esLen, end); d += 2 + buf[d + 1]) tags.push(buf[d]);
        streams.push({ type, tags });
        e += 5 + esLen;
      }
      return streams;
    }
  }
  return null;
}

function describeTs(streams) {
  const video = new Set();
  const audio = new Set();
  for (const s of streams) {
    switch (s.type) {
      case 0x1b: video.add("H.264"); break;
      case 0x24: video.add("HEVC"); break;
      case 0x01: case 0x02: video.add("MPEG-2"); break;
      case 0x10: video.add("MPEG-4"); break;
      case 0x0f: case 0x11: audio.add("AAC"); break;
      case 0x03: case 0x04: audio.add("MPEG-audio"); break;
      case 0x81: audio.add("AC-3"); break;
      case 0x87: audio.add("E-AC-3"); break;
      case 0x06:
        if (s.tags.includes(0x6a)) audio.add("AC-3");
        else if (s.tags.includes(0x7a)) audio.add("E-AC-3");
        break;
      default: break;
    }
  }
  return { video: [...video], audio: [...audio] };
}

// Segmentos fMP4/CMAF: buscar el nombre del códec en el archivo de inicialización
function describeMp4(buf) {
  const t = buf.toString("latin1");
  const video = [];
  const audio = [];
  if (/hvc1|hev1|dvh1|dvhe/.test(t)) video.push("HEVC");
  if (/avc1|avc3/.test(t)) video.push("H.264");
  if (/mp4a/.test(t)) audio.push("AAC");
  if (/ec-3/.test(t)) audio.push("E-AC-3");
  if (/ac-3/.test(t)) audio.push("AC-3");
  return { video, audio };
}

function codecIssues({ video, audio }) {
  const issues = [];
  if (video.includes("HEVC")) issues.push("VIDEO_HEVC");
  if (video.includes("MPEG-2")) issues.push("VIDEO_MPEG2");
  const goodAudio = audio.includes("AAC");
  if (audio.length && !goodAudio) {
    if (audio.includes("AC-3") || audio.includes("E-AC-3")) issues.push("AUDIO_AC3");
    else if (audio.includes("MPEG-audio")) issues.push("AUDIO_MPEG");
  }
  return issues;
}

function fromCodecString(codecs) {
  const video = [];
  const audio = [];
  if (/hvc1|hev1|dvh1/.test(codecs)) video.push("HEVC");
  if (/avc1|avc3/.test(codecs)) video.push("H.264");
  if (/mp4a\.40/.test(codecs)) audio.push("AAC");
  if (/ec-3/.test(codecs)) audio.push("E-AC-3");
  if (/ac-3/.test(codecs)) audio.push("AC-3");
  return { video, audio };
}

// ---------- 5) Probar un canal ----------
async function checkChannel(ch) {
  const base = { id: ch.id, canal: ch.name, pais: ch.country, categoria: ch.category, url: ch.url };
  const res = (estado, detalle = "", extra = {}) => ({
    ...base,
    estado,
    detalle,
    http: /^http:\/\//i.test(ch.url) ? "sí (usa proxy)" : "no",
    resolucion: "",
    video: "",
    audio: "",
    ...extra,
  });

  if (!ch.url) return res(ch.embed ? "EMBED" : "SIN_URL", ch.embed ? "enlace embebido (YouTube u otro)" : "");

  let r;
  try {
    r = await get(ch.url);
  } catch (e) {
    return res("MUERTO", reason(e));
  }
  if (!r.ok) return res("MUERTO", `HTTP ${r.status}`);

  if (/\.mp4(\?|$)/i.test(ch.url) || /^video\/mp4/i.test(r.ctype)) return res("OK", "MP4 directo");

  const text = r.buf.toString("utf8");
  if (!text.trimStart().startsWith("#EXTM3U")) {
    if (r.buf[0] === 0x47 || /mp2t/i.test(r.ctype)) {
      return res("SOLO_TS", "entrega video MPEG-TS crudo (no es HLS): el navegador no lo reproduce");
    }
    return res("NO_HLS", `no devuelve una lista HLS (${r.ctype || "tipo desconocido"})`);
  }

  let pl = parsePlaylist(text, r.url);
  let resolucion = "";
  let declared = { video: [], audio: [] };

  // Lista maestra: tomar calidades y códecs declarados, y seguir con la primera calidad
  if (pl.variants.length) {
    let maxH = 0;
    const codecs = [];
    for (const v of pl.variants) {
      const h = Number((v.RESOLUTION || "").split("x")[1] || 0);
      if (h > maxH) maxH = h;
      if (v.CODECS) codecs.push(v.CODECS);
    }
    resolucion = maxH ? `${maxH}p máx.` : "";
    declared = fromCodecString(codecs.join(","));
    try {
      const vr = await get(pl.variants[0].uri);
      if (!vr.ok) return res("MUERTO", `la calidad principal responde HTTP ${vr.status}`, { resolucion });
      pl = parsePlaylist(vr.buf.toString("utf8"), vr.url);
    } catch (e) {
      return res("MUERTO", `la calidad principal falla: ${reason(e)}`, { resolucion });
    }
  }

  if (pl.key && pl.key.METHOD && !/^(NONE|AES-128)$/i.test(pl.key.METHOD)) {
    return res("CIFRADO", `cifrado ${pl.key.METHOD} (DRM)`, { resolucion });
  }
  if (!pl.segments.length) {
    return res("OK", "lista sin segmentos todavía (puede estar iniciando)", { resolucion });
  }

  // Primer segmento: ¿se descarga y qué códecs trae?
  let codecs = declared;
  let detalle = "";
  try {
    let seg;
    if (pl.map) {
      const init = await get(pl.map, { maxBytes: 20_000 });
      if (init.ok) codecs = describeMp4(init.buf);
    }
    seg = await get(pl.segments[0], { range: "bytes=0-199999", maxBytes: 200_000 });
    if (!seg.ok) return res("SEGMENTOS_FALLAN", `el primer segmento responde HTTP ${seg.status}`, { resolucion });
    if (!pl.map) {
      const ts = parseTs(seg.buf);
      if (ts) codecs = describeTs(ts);
      else if (!codecs.video.length) detalle = "no pude leer los códecs del segmento";
    }
  } catch (e) {
    return res("SEGMENTOS_FALLAN", `el primer segmento falla: ${reason(e)}`, { resolucion });
  }

  const issues = codecIssues(codecs);
  const extra = { resolucion, video: codecs.video.join("+"), audio: codecs.audio.join("+") };
  if (issues.length) {
    return res(`CODEC_${issues.join("+")}`, "se reproduce solo en algunos dispositivos", extra);
  }
  return res("OK", detalle, extra);
}

// ---------- 6) Ejecutar ----------
const channels = readChannels(FILE);
console.log(`Probando ${channels.length} canales (${CONCURRENCY} a la vez)...\n`);

const results = new Array(channels.length);
let next = 0;
let done = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= channels.length) return;
    try {
      results[i] = await checkChannel(channels[i]);
    } catch (e) {
      results[i] = { id: channels[i].id, canal: channels[i].name, pais: channels[i].country, estado: "ERROR_SCRIPT", detalle: String(e) };
    }
    done++;
    if (done % 25 === 0 || done === channels.length) process.stdout.write(`  ${done}/${channels.length}\r`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log("\n");

// Resumen
const count = {};
for (const r of results) count[r.estado] = (count[r.estado] || 0) + 1;
console.log("RESUMEN");
for (const [k, v] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(34)} ${v}`);

const bad = results.filter((r) => !["OK", "EMBED"].includes(r.estado));
console.log(`\nCANALES CON PROBLEMAS: ${bad.length} de ${results.length}`);
for (const r of bad.slice(0, 60)) console.log(`  [${r.estado}] ${r.canal} (${r.pais}) - ${r.detalle}`);
if (bad.length > 60) console.log(`  ... y ${bad.length - 60} más en el reporte`);

// Archivos
const cols = ["id", "canal", "pais", "categoria", "estado", "detalle", "resolucion", "video", "audio", "http", "url"];
const csv = [cols.join(",")]
  .concat(results.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")))
  .join("\r\n");
fs.writeFileSync("reporte-canales.csv", "\uFEFF" + csv, "utf8");
fs.writeFileSync("reporte-canales.json", JSON.stringify(results, null, 2), "utf8");
console.log("\nListo. Se guardaron reporte-canales.csv (ábrelo con Excel) y reporte-canales.json");
