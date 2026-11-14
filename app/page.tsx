"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Info, Plus, Search, Bell, Sparkles, Check, 
  Tv, Shield, User, PlusCircle, Trash2, ChevronRight, X, AlertCircle, FileText, LogOut, Lock, Sparkle, Settings, Film, Radio, Globe, ChevronDown, Edit3, Share2, Cast, Maximize2, RefreshCw, ArrowLeft, SkipForward, SkipBack, Download, Home as HomeIcon, Bookmark, Shuffle, ThumbsUp, ThumbsDown
} from "lucide-react";
import Hls from "hls.js";
import { preconnect, preload } from "react-dom";

interface Profile {
  id: string;
  name: string;
  avatar: string;
  isKid: boolean;
  pin?: string;
  pinHash?: string;
  birthday?: string; // "MM-DD"
}

interface Episode {
  id: string;
  season: number;
  number: number;
  title: string;
  videoUrl: string;
  duration?: string;
  addedAt?: number;
}

interface Movie {
  id: number | string;
  title: string;
  subtitle?: string;
  rating: string;
  year: string;
  tag: string;
  type?: "pelicula" | "serie";
  desc: string;
  bgImage: string;
  videoUrl: string;
  backupVideoUrl?: string;
  img?: string;
  duration?: string;
  genres?: string[];
  cast?: string;
  director?: string;
  production?: string;
  originalLanguage?: string;
  ageRating?: string;
  trailerUrl?: string;
  episodes?: Episode[];
  addedAt?: number;
  backdrop?: string;
  introStart?: number;
  introEnd?: number;
  creditsStart?: number;
  comingSoon?: boolean;
  releaseDate?: string;
  saga?: string;
  sagaOrder?: number;
  sagaId?: number; // colección de TMDB
  tmdbId?: number;
}

interface ProgressItem {
  id: number | string;
  title: string;
  img: string;
  time: number;
  duration: number;
  updatedAt: number;
  episodeId?: string;
  episodeLabel?: string;
}

interface AccountUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

interface Channel {
  id: string;
  name: string;
  shortCode?: string;
  country: "Perú 🇵🇪" | "Chile 🇨🇱" | "Argentina 🇦🇷" | "España 🇪🇸" | "Ecuador 🇪🇨" | "Bolivia 🇧🇴" | "Italia 🇮🇹" | "Deportes ⚽" | "Internacional 🌍";
  category: "Señal Abierta" | "Deportes" | "Noticias" | "Entretenimiento" | "Regional";
  logo: string;
  currentShow: string;
  videoUrl?: string;
  embedUrl?: string;
}

// ================================================================
// ACCESO DE ADMINISTRADOR
// La clave NO se guarda aquí: solo su "huella" SHA-256. El script
// actualizar-cineverso.js la rellena con la clave que tú elijas.
// Para entrar al panel: abre tu página con  ?admin  al final de la URL.
// ================================================================
const ADMIN_HASH = ""; // la clave ahora se comprueba solo en el servidor (app/api/catalog/route.ts)

// SHA-256 en JavaScript puro (funciona incluso en navegadores de TV antiguos)
function sha256(ascii: string): string {
  const utf8 = unescape(encodeURIComponent(ascii));
  const rightRotate = (v: number, a: number) => (v >>> a) | (v << (32 - a));
  const K: number[] = [];
  const H: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = true;
      if (primeCounter < 8) H[primeCounter] = (Math.pow(candidate, 0.5) * 4294967296) | 0;
      K[primeCounter++] = (Math.pow(candidate, 1 / 3) * 4294967296) | 0;
    }
  }
  let msg = utf8 + "\x80";
  while ((msg.length % 64) - 56) msg += "\x00";
  const words: number[] = [];
  for (let i = 0; i < msg.length; i++) {
    words[i >> 2] |= msg.charCodeAt(i) << (((3 - i) % 4) * 8);
  }
  const bitLen = utf8.length * 8;
  words[words.length] = (bitLen / 4294967296) | 0;
  words[words.length] = bitLen | 0;
  let hash = H.slice(0, 8);
  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const old = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + K[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.length = 8;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    for (let k = 3; k + 1; k--) {
      const b = (hash[i] >> (k * 8)) & 255;
      out += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return out;
}

// Detecta navegadores de Smart TV (Samsung Tizen, LG webOS, Android TV, Fire TV, Roku, Hisense VIDAA, Philips, Sony, etc.)
function isSmartTvBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /SMART-TV|SmartTV|Tizen|Web0S|webOS|NetCast|HbbTV|Android TV|GoogleTV|AFT[A-Z]|BRAVIA|CrKey|Roku|VIDAA|Hisense|Philips|NETTV|Viera|AQUOS|TV Safari|Opera TV|TVHTML5|DTV|Toshiba|Vizio|SonyCEBrowser/i.test(navigator.userAgent);
}

// CSS de compatibilidad para navegadores antiguos (TVs). Solo se activa con la clase
// "tv-legacy" en <html>, así que NO cambia nada en celulares ni PCs modernos.
const LEGACY_RULES = `
html{color-scheme:dark}
.cv-splash{position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;background:#050505;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .45s;animation:cvHide .3s 5s forwards}
.cv-splash-logo{width:132px;height:132px;border-radius:30px;animation:cvPop .9s cubic-bezier(.2,.9,.3,1.3) both,cvGlow 2s ease-in-out .9s infinite}
.cv-splash-name{margin-top:22px;font-family:inherit;font-weight:900;font-size:22px;letter-spacing:.5px;background:linear-gradient(90deg,#4ade80,#34d399,#2dd4bf);-webkit-background-clip:text;background-clip:text;color:transparent;animation:cvFade .6s .35s both}
.cv-splash-bar{margin-top:22px;width:160px;height:3px;border-radius:3px;background:#1f2937;overflow:hidden}
.cv-splash-bar i{display:block;height:100%;background:#22c55e;animation:cvBar 1.1s ease-out both}
@keyframes cvPop{0%{transform:scale(.55);opacity:0}70%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}
@keyframes cvGlow{0%,100%{box-shadow:0 0 0 rgba(34,197,94,0)}50%{box-shadow:0 0 48px rgba(34,197,94,.45)}}
@keyframes cvFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes cvBar{from{width:0}to{width:100%}}
@keyframes cvHide{to{opacity:0;visibility:hidden}}
@keyframes cvPreview{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
html,body{background:#050505;margin:0}
html.tv-mode,html.tv-mode body{scrollbar-width:none;-ms-overflow-style:none;overflow-x:hidden}
html.tv-mode ::-webkit-scrollbar,html.tv-legacy ::-webkit-scrollbar{width:0 !important;height:0 !important;display:none;background:transparent}
html.tv-mode *:not(.animate-spin){-webkit-transition:none !important;transition:none !important;-webkit-animation:none !important;animation:none !important}
html.tv-mode *{-webkit-backdrop-filter:none !important;backdrop-filter:none !important}
html.tv-mode .group-hover\:scale-105,html.tv-mode .group:hover .group-hover\:scale-105,html.tv-mode .hover\:scale-105:hover{-webkit-transform:none !important;transform:none !important}
.inset-0{top:0;right:0;bottom:0;left:0}
html.tv-legacy button,html.tv-legacy input,html.tv-legacy select,html.tv-legacy textarea{font-family:inherit;line-height:inherit}
html.tv-legacy button:not([class*="bg-"]){background-color:transparent;background-image:none}
html.tv-legacy button:not([class*="border"]){border:0}
html.tv-legacy button:not([class*=" text-white"]):not([class*=" text-black"]):not([class*=" text-gray-"]):not([class*=" text-green-"]):not([class*=" text-red-"]):not([class*=" text-emerald-"]){color:inherit}
html.tv-legacy .bg-white{background-color:#fff}
html.tv-legacy .bg-green-500{background-color:#22c55e}
html.tv-legacy .bg-\\[\\#121212\\]{background-color:#121212}
html.tv-legacy .bg-\\[\\#181818\\]{background-color:#181818}
html.tv-legacy .bg-\\[\\#161616\\]{background-color:#161616}
html.tv-legacy .bg-\\[\\#050505\\]{background-color:#050505}
html.tv-legacy .bg-\\[\\#1a1a1a\\]{background-color:#1a1a1a}
html.tv-legacy .bg-\\[\\#1c1c1c\\]{background-color:#1c1c1c}
html.tv-legacy .bg-\\[\\#262626\\]\\/90,html.tv-legacy .bg-\\[\\#121212\\]\\/90{background-color:rgba(30,30,30,.9)}
html.tv-legacy .bg-white\\/10{background-color:rgba(255,255,255,.1)}
html.tv-legacy .bg-black\\/80,html.tv-legacy .bg-black\\/90{background-color:rgba(0,0,0,.88)}
html.tv-legacy .bg-black\\/85{background-color:rgba(0,0,0,.85)}
html.tv-legacy .flex[class*="gap-"]>*{margin-right:.6rem}
html.tv-legacy .flex[class*="gap-"]>*:last-child{margin-right:0}
html.tv-legacy .flex-col[class*="gap-"]>*{margin-right:0;margin-bottom:.6rem}
html.tv-legacy .flex-wrap[class*="gap-"]>*{margin-bottom:.5rem}
html.tv-legacy .aspect-\\[2\\/3\\]{position:relative;height:0;padding-top:150%}
html.tv-legacy .aspect-\\[2\\/3\\]>img{position:absolute;top:0;left:0;width:100%;height:100%}
html.tv-legacy .aspect-video{position:relative;height:0;padding-top:56.25%}
html.tv-legacy .aspect-video>video,html.tv-legacy .aspect-video>iframe{position:absolute;top:0;left:0;width:100%;height:100%}
html.tv-legacy .bg-clip-text{-webkit-background-clip:text;background-clip:text}
html.tv-legacy .fixed.inset-0{width:100%;height:100%}
html.tv-mode{font-size:112.5%}
html.tv-mode :focus{outline:4px solid #22c55e !important;outline-offset:3px;box-shadow:0 0 0 6px rgba(34,197,94,.35) !important}
html.tv-legacy :focus{outline:4px solid #22c55e !important;outline-offset:3px}
`;

// Los mismos arreglos se activan SOLO con CSS en navegadores sin aspect-ratio
// (funciona aunque el JavaScript de la TV falle)
const LEGACY_CSS = LEGACY_RULES + "@supports not (aspect-ratio: 1 / 1) {" + LEGACY_RULES.replace(/html\.tv-legacy/g, "html") + "}" +
  // iPhone/Android: con letra de 16px el celular no hace zoom al escribir en un campo
  "@media (max-width: 1023px) { input, select, textarea { font-size: 16px !important; } }" +
  "@keyframes cvWall{from{transform:translateY(0)}to{transform:translateY(-50%)}}@keyframes cvObPop{0%{opacity:0;transform:translateY(12px) scale(.85)}100%{opacity:1;transform:none}}.cv-ob-grad{background:linear-gradient(90deg,var(--ob),#fff 140%);-webkit-background-clip:text;background-clip:text;color:transparent}.cv-ob-card{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:18px;background:rgba(17,17,17,.82);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 20px 50px -10px rgba(0,0,0,.8);white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden}@media (prefers-reduced-motion:reduce){[style*=cvWall]{animation:none!important}}" +
  "@media (orientation:portrait) and (max-width:900px){.cv-pstage{flex:0 0 auto!important;padding:0!important}.cv-pstage>div{height:56.25vw!important;max-height:70vh;border-radius:0!important}}" + "@media (orientation:portrait){.cv-player:not(:fullscreen) .cv-tc-x{display:none!important}}@media (orientation:landscape){.cv-tc-p{display:none!important}}.cv-player:fullscreen .cv-tc-p{display:none!important}.cv-player:fullscreen .cv-tc-x{display:flex!important}" + ".cv-player:fullscreen .cv-ppanel,.cv-player:-webkit-full-screen .cv-ppanel{display:none!important}.cv-player:fullscreen .cv-pstage,.cv-player:-webkit-full-screen .cv-pstage{flex:1 1 auto!important;padding:0!important}.cv-player:fullscreen .cv-pstage>div,.cv-player:-webkit-full-screen .cv-pstage>div{height:100%!important;max-height:none!important;border-radius:0!important;border:0!important}@media (orientation:landscape) and (max-height:520px){.cv-touch .cv-ppanel{display:none!important}.cv-touch .cv-pstage{padding:0!important}.cv-touch .cv-pstage>div{border-radius:0!important;border:0!important}.cv-touch{padding-top:0!important}}" + "@media (max-height:520px){.cv-ppanel{padding-top:6px!important;column-gap:12px!important}.cv-ppanel>button{font-size:14px!important}.cv-pstage{padding:0!important}}" +
  "@keyframes cvRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}.cv-home>section,.cv-home>.cv-greet{animation:cvRise .55s cubic-bezier(.2,.7,.2,1) both}.cv-home>section:nth-of-type(2){animation-delay:.06s}.cv-home>section:nth-of-type(3){animation-delay:.12s}.cv-home>section:nth-of-type(4){animation-delay:.18s}.cv-home>section:nth-of-type(n+5){animation-delay:.24s}@keyframes cvConf{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(110vh) rotate(720deg)}}.cv-conf{position:fixed;top:-20px;width:10px;height:16px;border-radius:2px;z-index:95;pointer-events:none;animation:cvConf linear forwards}@keyframes cvStory{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}input[type=search]::-webkit-search-cancel-button,input[type=search]::-webkit-search-decoration{-webkit-appearance:none;appearance:none}@keyframes cvSpin{from{opacity:.35;transform:translateY(-18px) scale(.97)}to{opacity:1;transform:none}}@keyframes cvPick{0%{transform:scale(.82)}60%{transform:scale(1.07)}100%{transform:scale(1)}}@media (prefers-reduced-motion:reduce){.cv-home>section,.cv-home>.cv-greet,.cv-conf{animation:none!important}}" +
  ".cv-chat{position:fixed;top:0;left:0;right:0;bottom:0}@media (min-width:1024px){.cv-chat{top:auto;left:auto;right:24px;bottom:24px;width:400px;height:min(640px,calc(100vh - 110px))}}" +
  ".cv-rail{position:relative}.cv-rail-btn{display:none;position:absolute;top:4px;bottom:16px;width:56px;z-index:6;align-items:center;justify-content:center;border:0;cursor:pointer;color:#fff;opacity:.55;transition:opacity .2s,transform .2s}.cv-rail-l{left:0;background:linear-gradient(90deg,rgba(5,5,5,.92),rgba(5,5,5,0));border-radius:12px 0 0 12px}.cv-rail-r{right:0;background:linear-gradient(270deg,rgba(5,5,5,.92),rgba(5,5,5,0));border-radius:0 12px 12px 0}.cv-rail:hover .cv-rail-btn{opacity:1}.cv-rail-btn:hover svg{transform:scale(1.25)}.cv-rail-btn svg{transition:transform .2s;filter:drop-shadow(0 2px 6px rgba(0,0,0,.8))}@media (hover:hover) and (pointer:fine){.cv-rail-btn{display:flex}}";

// Se ejecuta antes que todo. Si el navegador es antiguo o la app no arranca,
// manda a la versión TV ultraligera (/tv.html), que funciona en cualquier Smart TV.
const TV_GUARD_JS = [
  "(function(){try{",
  "var s=location.search;",
  "if(/[?&](completa|admin)\\b/.test(s)){try{sessionStorage.setItem('cv_full','1')}catch(e){}return;}",
  "try{if(sessionStorage.getItem('cv_full')==='1')return;}catch(e){}",
  "var go=function(){if(!window.__cvReady)location.replace('/tv.html');};",
  "var tv=/SMART-TV|SmartTV|Tizen|Web0S|webOS|NetCast|HbbTV|Android TV|GoogleTV|AFT[A-Z]|BRAVIA|CrKey|Roku|VIDAA|Hisense|NETTV|Viera|AQUOS|Opera TV|TVHTML5|SonyCEBrowser/i.test(navigator.userAgent);",
  "var modern=false;try{new Function('var a={b:1};return a?.b??0');modern=typeof Promise!=='undefined'&&typeof fetch!=='undefined'&&!!window.CSS&&!!window.CSS.supports;}catch(e){}",
  "if(!modern){go();return;}",
  "window.addEventListener('error',function(ev){var m=String((ev&&ev.message)||'');if(/SyntaxError|Unexpected|is not defined|is not a function|undefined is not/i.test(m))setTimeout(go,1500);});",
  "if(tv)setTimeout(go,15000);",
  "}catch(e){}})();",
].join("");

const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]), select, textarea, video, [tabindex]:not([tabindex="-1"])';

// Tráiler de YouTube de fondo: solo se muestra cuando de verdad se está reproduciendo
// (si el navegador bloquea la reproducción automática, se queda la imagen de la película)
function YtBg({ vid, muted, title, style, onReady }: { vid: string; muted: boolean; title: string; style: { [k: string]: any }; onReady: (r: boolean) => void }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const cb = useRef(onReady);
  cb.current = onReady;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const cmd = (func: string, args: any[] = []) => {
    const w = ref.current && ref.current.contentWindow;
    if (!w) return;
    try { w.postMessage(JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" }), "*"); } catch (err) {}
  };
  // Activar o quitar el sonido SIN recargar el video (así sigue reproduciéndose)
  useEffect(() => {
    if (muted) cmd("mute");
    else { cmd("unMute"); cmd("setVolume", [100]); cmd("playVideo"); }
  }, [muted]);
  useEffect(() => {
    let timer: any = null;
    let last = -9;
    const set = (st: number) => {
      if (st === last) return;
      last = st;
      if (st === 1) {
        if (!mutedRef.current) { cmd("unMute"); cmd("setVolume", [100]); }
        if (!timer) timer = setTimeout(() => { timer = null; cb.current(true); }, 2600);
      } else if (st === 2 && !mutedRef.current) {
        // El navegador pausó al activar el sonido: vuelve a darle play
        cmd("playVideo");
      } else if (st !== 3) {
        if (timer) { clearTimeout(timer); timer = null; }
        cb.current(false);
      }
    };
    const onMsg = (e: MessageEvent) => {
      const f = ref.current;
      if (!f || e.source !== f.contentWindow) return;
      let d: any = e.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (err) { return; } }
      if (!d) return;
      if (d.event === "onStateChange" && typeof d.info === "number") set(d.info);
      else if (d.event === "infoDelivery" && d.info && typeof d.info.playerState === "number") set(d.info.playerState);
    };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); if (timer) clearTimeout(timer); cb.current(false); };
  }, [vid]);
  const ping = () => {
    const w = ref.current && ref.current.contentWindow;
    if (!w) return;
    try {
      w.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
      w.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"], id: 1, channel: "widget" }), "*");
    } catch (err) {}
  };
  const origin = typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
  return (
    <iframe
      ref={ref}
      src={"https://www.youtube.com/embed/" + vid + "?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&loop=1&playlist=" + vid + "&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&enablejsapi=1&origin=" + origin}
      title={title}
      allow="autoplay; encrypted-media"
      tabIndex={-1}
      onLoad={() => { ping(); setTimeout(ping, 400); setTimeout(ping, 1500); }}
      style={style}
    />
  );
}

// Controles propios del reproductor para celulares y tablets (estilo Netflix):
// tocar muestra/oculta, doble toque a los lados = ±10 s, toques seguidos se suman (+20, +30…),
// barra de tiempo grande, velocidad, ajuste de imagen y pantalla completa real.
function fmtClock(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(x).padStart(2, "0");
}
function TouchControls(props: {
  videoRef: { current: HTMLVideoElement | null };
  title: string;
  onBack: () => void;
  onCast: () => void;
  onFullscreen: () => void;
  isFull: boolean;
  fit: "contain" | "cover";
  onFit: () => void;
  rate: number;
  onRate: (r: number) => void;
  nextLabel: string;
  onNext: (() => void) | null;
  loading: boolean;
}) {
  const { videoRef } = props;
  const [paused, setPaused] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [show, setShow] = useState(true);
  const [scrub, setScrub] = useState<number | null>(null);
  const [bubble, setBubble] = useState<{ side: "l" | "r"; n: number; k: number } | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const hideT = useRef<any>(null);
  const lastTap = useRef<{ t: number; x: number }>({ t: 0, x: 0 });
  const singleT = useRef<any>(null);
  const pend = useRef<{ base: number; delta: number; t: any } | null>(null);

  const poke = (keep?: boolean) => {
    setShow(true);
    if (hideT.current) clearTimeout(hideT.current);
    if (keep) return;
    hideT.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) { setShow(false); setRateOpen(false); }
    }, 3500);
  };
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const upd = () => {
      if (!pend.current) setCur(v.currentTime || 0);
      setDur(isFinite(v.duration) ? v.duration : 0);
      setPaused(v.paused);
      try { const b = v.buffered; let end = 0; for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 1) end = Math.max(end, b.end(i)); setBuf(end); } catch (e) {}
    };
    const onPlay = () => { setPaused(false); poke(); };
    const onPause = () => { setPaused(true); poke(true); };
    const evs: [string, any][] = [["timeupdate", upd], ["durationchange", upd], ["loadedmetadata", upd], ["progress", upd], ["seeked", upd], ["play", onPlay], ["pause", onPause]];
    evs.forEach(([e, f]) => v.addEventListener(e, f));
    upd(); poke();
    return () => { evs.forEach(([e, f]) => v.removeEventListener(e, f)); if (hideT.current) clearTimeout(hideT.current); };
  }, [videoRef.current]);

  // ±10: los toques seguidos se suman y se aplica UN solo salto (más rápido y sin congelarse)
  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const p = pend.current || { base: v.currentTime || 0, delta: 0, t: null };
    if (p.t) clearTimeout(p.t);
    p.delta += delta;
    const d = isFinite(v.duration) ? v.duration : Infinity;
    const target = Math.max(0, Math.min(d - 1, p.base + p.delta));
    setCur(target);
    p.t = setTimeout(() => {
      pend.current = null;
      try { v.currentTime = target; } catch (e) {}
    }, 350);
    pend.current = p;
    setBubble({ side: delta < 0 ? "l" : "r", n: Math.abs(p.delta), k: Date.now() });
    poke();
  };
  useEffect(() => { if (!bubble) return; const t = setTimeout(() => setBubble(null), 800); return () => clearTimeout(t); }, [bubble && bubble.k]);
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { const r: any = v.play(); if (r && r.catch) r.catch(() => {}); } else v.pause();
    poke();
  };
  // Toque simple: muestra/oculta. Doble toque a la izquierda/derecha: −10/+10
  const onSurface = (e: any) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const now = Date.now();
    const dbl = now - lastTap.current.t < 300 && Math.abs(x - lastTap.current.x) < 0.25;
    lastTap.current = { t: now, x };
    if (dbl && (x < 0.4 || x > 0.6)) {
      if (singleT.current) clearTimeout(singleT.current);
      seekBy(x < 0.4 ? -10 : 10);
      return;
    }
    if (singleT.current) clearTimeout(singleT.current);
    singleT.current = setTimeout(() => { if (show && !bubble) { setShow(false); setRateOpen(false); } else poke(); }, 260);
  };
  const shownT = scrub !== null ? scrub : cur;
  const pct = dur ? (shownT / dur) * 100 : 0;
  const bufPct = dur ? Math.min(100, (buf / dur) * 100) : 0;
  const btn = "flex items-center justify-center rounded-full text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500";
  const chip = "flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-full text-xs font-bold text-white whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500";
  return (
    <div className="absolute inset-0 z-[31] select-none" style={{ WebkitTapHighlightColor: "transparent" }}>
      <div className="absolute inset-0" onClick={onSurface} />
      {bubble && (
        <div className={"absolute top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center " + (bubble.side === "l" ? "left-[4%]" : "right-[4%]")}>
          <span className="w-20 h-20 portrait:w-16 portrait:h-16 rounded-full bg-black/60 flex flex-col items-center justify-center text-white font-black text-lg" style={{ animation: "cvPick .35s ease-out" }}>
            {bubble.side === "l" ? "«" : "»"}<span className="text-sm">{bubble.side === "l" ? "−" : "+"}{bubble.n} s</span>
          </span>
        </div>
      )}
      {props.loading && !show && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="w-12 h-12 rounded-full border-4 border-white/20 border-t-green-500 animate-spin" /></div>
      )}
      <div className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: show ? 1 : 0 }}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80" />
        {/* arriba: volver + título · transmitir */}
        <div className={"cv-tc-x absolute left-0 right-0 top-0 flex items-center gap-2 px-3 pt-2 " + (show ? "pointer-events-auto" : "")} style={{ paddingTop: "max(8px, env(safe-area-inset-top))", paddingLeft: "max(12px, env(safe-area-inset-left))", paddingRight: "max(12px, env(safe-area-inset-right))" }}>
          <button onClick={props.onBack} aria-label="Volver" className={btn + " w-10 h-10 shrink-0 hover:bg-white/10"}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <p className="flex-1 min-w-0 truncate text-white font-black text-sm sm:text-base">{props.title}</p>
          <button onClick={props.onCast} aria-label="Transmitir a la TV" className={btn + " w-10 h-10 shrink-0 hover:bg-white/10"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" /><line x1="2" y1="20" x2="2.01" y2="20" /></svg>
          </button>
        </div>
        {/* centro: −10 · play/pausa · +10 */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 portrait:-translate-y-[60%] flex items-center justify-center gap-[10vw]">
          <button onClick={() => seekBy(-10)} aria-label="Retroceder 10 segundos" className={btn + " w-12 h-12 sm:w-14 sm:h-14 portrait:w-10 portrait:h-10 bg-black/35 " + (show ? "pointer-events-auto" : "")}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 9 9 9" /><text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">10</text></svg>
          </button>
          <button onClick={togglePlay} aria-label={paused ? "Reproducir" : "Pausar"} className={btn + " w-16 h-16 sm:w-20 sm:h-20 portrait:w-14 portrait:h-14 bg-black/40 " + (show ? "pointer-events-auto" : "")}>
            {props.loading && !paused ? <span className="w-10 h-10 rounded-full border-4 border-white/20 border-t-green-500 animate-spin" /> : paused ? (
              <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            )}
          </button>
          <button onClick={() => seekBy(10)} aria-label="Adelantar 10 segundos" className={btn + " w-12 h-12 sm:w-14 sm:h-14 portrait:w-10 portrait:h-10 bg-black/35 " + (show ? "pointer-events-auto" : "")}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" /><text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">10</text></svg>
          </button>
        </div>
        {/* abajo: tiempo + barra · velocidad · ajuste · siguiente · pantalla completa */}
        <div className={"absolute left-0 right-0 bottom-0 px-3 pb-2 " + (show ? "pointer-events-auto" : "")} style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))", paddingLeft: "max(12px, env(safe-area-inset-left))", paddingRight: "max(12px, env(safe-area-inset-right))" }}>
          <div className="flex items-center gap-3">
            <span className="text-[11px] sm:text-xs font-bold text-white tabular-nums w-14 text-right">{fmtClock(shownT)}</span>
            <div className="relative flex-1 h-8 flex items-center">
              <div className="absolute left-0 right-0 h-1.5 rounded-full bg-white/25 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: bufPct + "%" }} />
                <div className="absolute inset-y-0 left-0 bg-green-500" style={{ width: pct + "%" }} />
              </div>
              <div className="absolute w-4 h-4 rounded-full bg-green-400 shadow -translate-x-1/2 pointer-events-none" style={{ left: pct + "%" }} />
              <input
                type="range" min={0} max={dur || 0} step={1} value={shownT}
                aria-label="Posición de la película"
                onChange={(e) => { setScrub(Number(e.target.value)); poke(true); }}
                onPointerUp={() => { const v = videoRef.current; if (v && scrub !== null) { try { v.currentTime = scrub; } catch (err) {} setCur(scrub); } setScrub(null); poke(); }}
                onTouchEnd={() => { const v = videoRef.current; if (v && scrub !== null) { try { v.currentTime = scrub; } catch (err) {} setCur(scrub); } setScrub(null); poke(); }}
                onKeyUp={() => { const v = videoRef.current; if (v && scrub !== null) { try { v.currentTime = scrub; } catch (err) {} } setScrub(null); }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-white/80 tabular-nums w-14">-{fmtClock(Math.max(0, dur - shownT))}</span>
            <button onClick={() => { props.onFullscreen(); poke(); }} aria-label={props.isFull ? "Salir de pantalla completa" : "Pantalla completa"} className={"cv-tc-p " + btn + " w-9 h-9 shrink-0 hover:bg-white/10"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" /></svg>
            </button>
          </div>
          <div className="cv-tc-x flex items-center gap-2 mt-1 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
            <div className="relative shrink-0">
              <button onClick={() => { setRateOpen((o) => !o); poke(true); }} className={chip}>⏩ {props.rate === 1 ? "Velocidad" : props.rate + "x"}</button>
            </div>
            <button onClick={() => { props.onFit(); poke(); }} className={chip + " shrink-0"}>{props.fit === "cover" ? "⤡ Ver completa" : "⤢ Llenar pantalla"}</button>
            {props.onNext && <button onClick={props.onNext} className={chip + " shrink-0 !bg-white !text-black"}>⏭ {props.nextLabel}</button>}
            <span className="flex-1" />
            <button onClick={() => { props.onFullscreen(); poke(); }} aria-label={props.isFull ? "Salir de pantalla completa" : "Pantalla completa"} className={chip + " shrink-0"}>
              {props.isFull ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" /></svg>
              )}
              <span className="hidden sm:inline">{props.isFull ? "Salir" : "Pantalla completa"}</span>
            </button>
          </div>
        </div>
      </div>
      {rateOpen && show && (
        <div className="absolute left-3 bottom-16 bg-[#141414]/95 border border-gray-700 rounded-xl p-1.5 flex flex-col min-w-[110px] shadow-2xl z-10">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
            <button key={"tr-" + r} onClick={() => { props.onRate(r); setRateOpen(false); poke(); }} className={"text-xs font-bold px-3 py-2 rounded-lg text-left cursor-pointer " + (props.rate === r ? "bg-green-500 text-black" : "text-gray-200 hover:bg-white/10")}>{r === 1 ? "Normal" : r + "x"}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Fila horizontal con flechas ‹ › a los lados (como en las plataformas de streaming).
// Las flechas aparecen en PC y TV con puntero; en celular se desliza con el dedo.
function Rail({ className, style, children }: { className: string; style?: { [k: string]: any }; children?: any }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanL(el.scrollLeft > 8);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };
  useEffect(() => {
    update();
    const el = ref.current;
    let ro: any = null;
    try {
      const RO = (window as any).ResizeObserver;
      if (RO && el) { ro = new RO(update); ro.observe(el); }
    } catch (e) {}
    window.addEventListener("resize", update);
    const t = setTimeout(update, 600);
    return () => { window.removeEventListener("resize", update); clearTimeout(t); if (ro) ro.disconnect(); };
  }, []);
  useEffect(() => { update(); });
  const go = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    const d = dir * Math.max(200, el.clientWidth * 0.85);
    try { el.scrollBy({ left: d, behavior: "smooth" }); } catch (e) { el.scrollLeft += d; }
  };
  const arrow = (dir: number) => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={dir < 0 ? "Anteriores" : "Siguientes"}
      onClick={() => go(dir)}
      className={"cv-rail-btn " + (dir < 0 ? "cv-rail-l" : "cv-rail-r")}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {dir < 0 ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
  return (
    <div className="cv-rail">
      <div ref={ref} className={className} style={style} onScroll={update}>{children}</div>
      {canL && arrow(-1)}
      {canR && arrow(1)}
    </div>
  );
}

export default function Home() {
  const myAvatars: { name: string; file: string; cv?: boolean }[] = [
    // Avatares originales de Cineverso
    { name: "Palomitas", file: "/avatares/cv/palomitas.svg", cv: true },
    { name: "Claqueta", file: "/avatares/cv/claqueta.svg", cv: true },
    { name: "Robot", file: "/avatares/cv/robot.svg", cv: true },
    { name: "Gato 3D", file: "/avatares/cv/gato3d.svg", cv: true },
    { name: "Dragoncito", file: "/avatares/cv/dragoncito.svg", cv: true },
    { name: "Estrella", file: "/avatares/cv/estrella.svg", cv: true },
    { name: "Fantasma", file: "/avatares/cv/fantasma.svg", cv: true },
    { name: "Astronauta", file: "/avatares/cv/astronauta.svg", cv: true },
    { name: "Búho", file: "/avatares/cv/buho.svg", cv: true },
    { name: "Zorro", file: "/avatares/cv/zorro.svg", cv: true },
    { name: "Pulpo", file: "/avatares/cv/pulpo.svg", cv: true },
    { name: "Pingüino", file: "/avatares/cv/pinguino.svg", cv: true },
    { name: "Unicornio", file: "/avatares/cv/unicornio.svg", cv: true },
    { name: "Perrito", file: "/avatares/cv/perrito.svg", cv: true },
    { name: "Cactus", file: "/avatares/cv/cactus.svg", cv: true },
    { name: "Cohete", file: "/avatares/cv/cohete.svg", cv: true },
    { name: "Bebé Jefazo 1", file: "/avatares/bebe jefazo1.png" },
    { name: "Bebé Jefazo 2", file: "/avatares/bebe jefazo2.png" },
    { name: "Bebé Jefazo 3", file: "/avatares/bebe jefazo3.png" },
    { name: "Bebé Jefazo 4", file: "/avatares/bebe jefazo4.png" },
    { name: "Big Mouth 1", file: "/avatares/bigmouth1.png" },
    { name: "Big Mouth 2", file: "/avatares/bigmouth2.png" },
    { name: "Big Mouth 3", file: "/avatares/bigmouth3.png" },
    { name: "BoJack 1", file: "/avatares/bojack1.png" },
    { name: "BoJack 2", file: "/avatares/bojack2.png" },
    { name: "BoJack 3", file: "/avatares/bojack3.png" },
    { name: "BoJack 4", file: "/avatares/bojack4.png" },
    { name: "Carmen 1", file: "/avatares/carmen1.png" },
    { name: "Carmen 2", file: "/avatares/Carmen2.png" },
    { name: "Carmen 3", file: "/avatares/carmen3.png" },
    { name: "Carmen 4", file: "/avatares/carmen4.png" },
  ];

  const [activeTab, setActiveTab] = useState<"inicio" | "explorar" | "tv" | "milista" | "cuenta" | "admin">("inicio");
  
  // Estados para Modal de Info de Película y Reproductor
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [movieModalTab, setMovieModalTab] = useState<"detalles" | "reparto" | "similares">("detalles");
  const [modalSeason, setModalSeason] = useState(1);
  const [myList, setMyList] = useState<string[]>([]);

  // Estado para el Instalador PWA
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  // Estados de Exploración Avanzada
  const [exploreSearch, setExploreSearch] = useState("");
  const [exploreTypeFilter, setExploreTypeFilter] = useState<"todos" | "pelicula" | "serie">("todos");
  const [exploreGenreFilter, setExploreGenreFilter] = useState("Todos");
  const [exploreYearFilter, setExploreYearFilter] = useState("Cualquier año");

  const genresList = [
    "Acción", "Aventura", "Animación", "Comedia", "Crimen", "Documental", 
    "Drama", "Familia", "Fantasía", "Historia", "Terror", "Música", 
    "Misterio", "Romance", "Ciencia ficción", "Suspenso", "Bélica", "Western"
  ];

  // Configuración del dispositivo
  const [tvMode, setTvMode] = useState(false);
  const [skipAdsNotice, setSkipAdsNotice] = useState(true);
  const [continueWatchingList, setContinueWatchingList] = useState<ProgressItem[]>([]);
  // Historial de lo visto (no se borra al terminar), lo que sigue y las insignias de temporada
  const [watchHistory, setWatchHistory] = useState<{ id: string; at: number; pct: number; mins: number }[]>([]);
  const [follows, setFollows] = useState<{ sagas: string[]; genres: string[] }>({ sagas: [], genres: [] });
  const [seasonBadges, setSeasonBadges] = useState<string[]>([]);
  const [challengesDone, setChallengesDone] = useState<string[]>([]);
  // Avisos personales: reacciones a mis reseñas
  const [inbox, setInbox] = useState<{ at: number; from: string; avatar: string; emoji: string; movieId: string }[]>([]);

  // CANALES DE TV EN VIVO COMPLETO
  const [liveChannels] = useState<Channel[]>([
    {
      id: "pe-atv",
      name: "ATV HD",
      shortCode: "ATV",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "/logos/ATV.png",
      currentShow: "Señal Abierta ATV En Vivo",
      videoUrl: "https://ddycmnicl95kp.cloudfront.net/live/1wk5g7itgjof/master.m3u8"
    },
    {
      id: "pe-atvsur",
      name: "ATV Sur",
      shortCode: "ATVS",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal Regional Sur",
      videoUrl: "https://ddycmnicl95kp.cloudfront.net/live/jryddd3ktckq/master.m3u8"
    },
    {
      id: "pe-atvmas",
      name: "ATV+ Noticias",
      shortCode: "ATV+",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "/logos/ATV+.png",
      currentShow: "ATV+ Noticias 24/7",
      videoUrl: "https://ddycmnicl95kp.cloudfront.net/live/32nynqn38go4/master.m3u8"
    },
    {
      id: "pe-rpp",
      name: "RPP Noticias TV",
      shortCode: "RPP",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "/logos/rpp.png",
      currentShow: "Amplios Opinión & Noticias",
      videoUrl: "http://190.93.224.42/RPP/index.m3u8"
    },
    {
      id: "pe-exitosatv",
      name: "Exitosa TV",
      shortCode: "EX",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "/logos/exitosa.png",
      currentShow: "Exitosa Noticias En Vivo",
      videoUrl: "https://luna-1-video.mediaserver.digital/exitosatv_server2_3d41s0d1/index.m3u8"
    },
    {
      id: "pe-nativa",
      name: "Nativa Deportes & TV",
      shortCode: "NAT",
      country: "Perú 🇵🇪",
      category: "Deportes",
      logo: "/logos/nativa.png",
      currentShow: "Deportes & Actualidad",
      videoUrl: "https://oneplay.iptvperu.tv:1936/static/nativa1.stream/playlist.m3u8"
    },
    {
      id: "pe-usmptv",
      name: "USMP TV",
      shortCode: "USMP",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "/logos/usmptv.png",
      currentShow: "Cultura y Educación",
      videoUrl: "https://stream.usmptvmedia.net.pe/hls/web_hls/index.m3u8"
    },
    {
      id: "pe-bethel",
      name: "Bethel TV",
      shortCode: "BET",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "/logos/bethel.png",
      currentShow: "Mensaje de Fe y Bienestar",
      videoUrl: "https://alfa.betheltv.tv/srt/3_abr/playlist.m3u8"
    },
    {
      id: "pe-soltv",
      name: "SOL TV Trujillo",
      shortCode: "SOL",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=200&auto=format&fit=crop",
      currentShow: "Noticias del Norte del Perú",
      videoUrl: "https://5790d294af2dc.streamlock.net/streamtv/streamtv/playlist.m3u8"
    },
    {
      id: "pe-tvperu",
      name: "TV Perú Oficial",
      shortCode: "TVP",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1512486130939-2c4f79935e4f?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal Abierta 24/7",
      videoUrl: "https://cdnhd.iblups.net/hls/777b4d4cc0984575a7d14f6ee57dbcaf7.m3u8"
    },
    {
      id: "pe-panamericana",
      name: "Panamericana TV",
      shortCode: "PT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Panorama & Noticias",
      videoUrl: "http://45.171.108.253:8888/PANAMERICANA/index.m3u8"
    },
    {
      id: "pe-willax",
      name: "Willax Televisión",
      shortCode: "WIL",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200&auto=format&fit=crop",
      currentShow: "Combutters / Noticiero",
      videoUrl: "http://190.93.224.42/WILLAX/index.m3u8"
    },
    {
      id: "pe-latina",
      name: "Latina Noticias",
      shortCode: "LN",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=200&auto=format&fit=crop",
      currentShow: "Latina Noticias 24/7",
      embedUrl: "https://www.youtube.com/embed/sLzfveqNEJc"
    },
    {
      id: "pe-36tv",
      name: "36 TV Huacho",
      shortCode: "36T",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://live-evg10.tv360.bitel.com.pe/bitel/36tvSRT/playlist.m3u8"
    },
    {
      id: "pe-americatv-alt",
      name: "América TV (Directo)",
      shortCode: "AT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal Abierta",
      videoUrl: "http://190.93.224.42/AMERICA-TV/index.m3u8"
    },
    {
      id: "pe-canal8",
      name: "Canal 8 Perú",
      shortCode: "C8",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Transmisión Regional",
      videoUrl: "https://live.obslivestream.com/canal8/index.m3u8"
    },
    {
      id: "pe-mastv",
      name: "Más TV Perú",
      shortCode: "MTV",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&auto=format&fit=crop",
      currentShow: "Entretenimiento 24/7",
      videoUrl: "https://live-evg11.tv360.bitel.com.pe/bitel/mastvSRT/playlist.m3u8"
    },
    {
      id: "pe-onda",
      name: "Onda Tv",
      shortCode: "ON",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/onda/playlist.m3u8"
    },
    {
      id: "pe-agro",
      name: "Agro TV",
      shortCode: "AG",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/agroSRT/playlist.m3u8"
    },
    {
      id: "pe-amazonica",
      name: "Amazonica TV",
      shortCode: "AMZ",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/amazonicatvSRT/playlist.m3u8"
    },
    {
      id: "pe-antenasur",
      name: "Antena SUR",
      shortCode: "AS",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://cloudpro.servidoresdestream.com:8081/8010/index.m3u8"
    },
    {
      id: "pe-canal21huancayo",
      name: "Canal 21 Huancayo",
      shortCode: "C21",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://play.agenciastreaming.com:8081/tvwanka/tracks-v1/index.fmp4.m3u8"
    },
    {
      id: "pe-casmatv",
      name: "Casma TV",
      shortCode: "CSM",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/casmatvSRT-TRA/playlist.m3u8"
    },
    {
      id: "pe-dtv",
      name: "DTV (Peru)",
      shortCode: "DTV",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/sabormixtvSRT/playlist.m3u8"
    },
    {
      id: "pe-folkloretv",
      name: "Folklore TV",
      shortCode: "FOLK",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://play.folkloretv.pe/StreamSD/index.m3u8"
    },
    {
      id: "pe-forotv",
      name: "Foro TV",
      shortCode: "FORO",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://mc.servidor.stream:19360/8274/8274.m3u8"
    },
    {
      id: "pe-huachotv",
      name: "Huacho Peru TV",
      shortCode: "HCH",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://tv.huachotv.com/stream.m3u8"
    },
    {
      id: "pe-lidertv",
      name: "Lider TV (Peru)",
      shortCode: "LID",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://chankillo.agenciastreaming.com/lidertv/index.m3u8"
    },
    {
      id: "pe-mieltv",
      name: "Miel TV",
      shortCode: "MIEL",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/mieltvSRT/playlist.m3u8"
    },
    {
      id: "pe-nativasatipo",
      name: "Nativa TV Satipo",
      shortCode: "NATS",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/nativachanchamayoSRT/playlist.m3u8"
    },
    {
      id: "pe-unitel",
      name: "Unitel (Peru)",
      shortCode: "UNI",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://play.agenciastreaming.com:8081/uniteltv/index.m3u8"
    },

    // CHILE 🇨🇱
    {
      id: "cl-tvn",
      name: "TVN Chile HD",
      shortCode: "TVN",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?q=80&w=200&auto=format&fit=crop",
      currentShow: "Televisión Nacional de Chile",
      videoUrl: "http://15.204.246.24:8080/TVNHD/index.m3u8"
    },
    {
      id: "cl-24horas",
      name: "24 Horas TVN",
      shortCode: "24H",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?q=80&w=200&auto=format&fit=crop",
      currentShow: "24 Horas Central",
      embedUrl: "https://www.youtube.com/embed/VGaoFnRtL7s"
    },
    {
      id: "cl-teletrece",
      name: "T13 Teletrece",
      shortCode: "T13",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&auto=format&fit=crop",
      currentShow: "T13 En Vivo 24/7",
      embedUrl: "https://www.youtube.com/embed/oy1dvCRd42s"
    },
    {
      id: "cl-tvmas",
      name: "TV+ Chile",
      shortCode: "TV+",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal Oficial TV+",
      videoUrl: "https://redirector.rudo.video/hls-video/ey6283je82983je9823je8jowowiekldk9838274/tvmas/tvmas.smil/playlist.m3u8?did=h5cl15920770042f7a4dd9c5a77c21873fa8d1d0b8a43a&ndvc=0"
    },
    {
      id: "cl-aysentv",
      name: "Aysén TV",
      shortCode: "AYS",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200&auto=format&fit=crop",
      currentShow: "Transmisión Regional",
      videoUrl: "https://v2.tustreaming.cl/aysentv/tracks-v1a1/mono.ts.m3u8"
    },
    {
      id: "cl-canal21nuble",
      name: "Canal 21 Ñuble",
      shortCode: "C21",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal Regional Ñuble",
      videoUrl: "https://tls-cl.cdnz.cl/canal21tv/live/playlist.m3u8"
    },
    {
      id: "cl-margamargatv",
      name: "Marga Marga TV",
      shortCode: "MMT",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?q=80&w=200&auto=format&fit=crop",
      currentShow: "En Vivo Marga Marga",
      videoUrl: "https://v1.tustreaming.cl/margamargatv/index.m3u8"
    },
    {
      id: "cl-miradiotv",
      name: "Mi Radio TV",
      shortCode: "MRT",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Mi Radio TV En Vivo",
      videoUrl: "https://scl.edge.grupoz.cl/miradio2/live/playlist.m3u8"
    },
    {
      id: "cl-puranoticiatv",
      name: "Puranoticia TV",
      shortCode: "PRN",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200&auto=format&fit=crop",
      currentShow: "Información 24h",
      videoUrl: "https://pnt.janus.cl/playlist/stream.m3u8?t=0&q=0&s=&p=&id=mvz2houd&d=w"
    },
    {
      id: "cl-antofagasta",
      name: "Antofagasta TV",
      shortCode: "ATV",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal En Directo Antofagasta",
      videoUrl: "https://unlimited6-cl.dps.live/atv/atv.smil/playlist.m3u8"
    },
    {
      id: "cl-13c",
      name: "13C",
      shortCode: "13C",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://origin.dpsgo.com/ssai/event/GI-9cp_bT8KcerLpZwkuhw/master.m3u8"
    },
    {
      id: "cl-13realities",
      name: "13 Realities",
      shortCode: "13R",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://origin.dpsgo.com/ssai/event/g7_JOM0ORki9SR5RKHe-Kw/master.m3u8"
    },
    {
      id: "cl-13t",
      name: "13T",
      shortCode: "13T",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://origin.dpsgo.com/ssai/event/f4TrySe8SoiGF8Lu3EIq1g/master.m3u8"
    },
    {
      id: "cl-adntv",
      name: "ADN TV",
      shortCode: "ADN",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://redirector.rudo.video/hls-video/931b584451fa6dd1313ee66efbfd5802e3f3bcea/adntv/adntv.smil/playlist.m3u8"
    },
    {
      id: "cl-amcanal",
      name: "AM Canal",
      shortCode: "AMC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://streaming.bitsur.cl:3534/live/vdo1102live.m3u8"
    },
    {
      id: "cl-biobiotv",
      name: "Bio Bio TV",
      shortCode: "BBT",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://redirector.rudo.video/hls-video/339f69c6122f6d8f4574732c235f09b7683e31a5/bbtv/bbtv.smil/playlist.m3u8"
    },
    {
      id: "cl-canal2quellon",
      name: "Canal 2 Quellon",
      shortCode: "C2Q",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://pantera1-100gb-cl-movistar.dps.live/tvquellon/tvquellon.smil/playlist.m3u8"
    },
    {
      id: "cl-canal9biobio",
      name: "Canal 9 Bio-Bio",
      shortCode: "C9B",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://unlimited6-cl.dps.live/c9/c9.smil/playlist.m3u8"
    },
    {
      id: "cl-canal13",
      name: "Canal 13",
      shortCode: "C13",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "http://15.204.246.24:8080/Canal13HD/index.m3u8"
    },
    {
      id: "cl-caracolatv",
      name: "Caracola TV",
      shortCode: "CAR",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://wifispeed.trapemn.tv:1936/comunales/caracola-tv/chunks.m3u8"
    },
    {
      id: "cl-centraltv",
      name: "Central TV",
      shortCode: "CEN",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://freya.mivideo.pro/centraltv/video.m3u8"
    },
    {
      id: "cl-chilevision",
      name: "ChileVision",
      shortCode: "CHV",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "http://15.204.246.24:8080/CHVHD/index.m3u8"
    },
    {
      id: "cl-estaciontv",
      name: "Estacion TV",
      shortCode: "EST",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://unlimited1-cl-isp.dps.live/supersonikatv/supersonikatv.smil/playlist.m3u8"
    },
    {
      id: "cl-iquiquetv",
      name: "Iquique TV",
      shortCode: "ITV",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://origin.skarnetchile.com:8081/iquiquetv-hd/index.m3u8"
    },
    {
      id: "cl-juntostv",
      name: "Juntos TV",
      shortCode: "JNT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://video.juntostvchile.cl:8879/hls/web-jntv.m3u8"
    },
    {
      id: "cl-mega2",
      name: "Mega 2",
      shortCode: "MG2",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "http://15.204.246.24:8080/Mega2HD/index.m3u8"
    },
    {
      id: "cl-mega",
      name: "Mega",
      shortCode: "MGA",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "http://tr.live.clarovtrcdn.vtrplay.com/megahdchi/vxfmt=dp/playlist.m3u8?device_profile=STB_HLS_VCAS_LIVE_HD"
    },
    {
      id: "cl-megaficcion",
      name: "Mega Ficcion",
      shortCode: "MGF",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "http://15.204.196.147:22880/MEGAFICCION-MEGAMEDIA-EE.UU-PROVEEDOR/index.m3u8"
    },
    {
      id: "cl-televida",
      name: "Televida",
      shortCode: "TVD",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://tls-cl.cdnz.cl/televida/live/playlist.m3u8"
    },

    // ARGENTINA 🇦🇷
    {
      id: "ar-canal26",
      name: "Canal 26",
      shortCode: "C26",
      country: "Argentina 🇦🇷",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200&auto=format&fit=crop",
      currentShow: "Noticias y Actualidad",
      videoUrl: "https://stream-gtlc.telecentro.net.ar/hls/canal26hls/main.m3u8"
    },
    {
      id: "ar-htv",
      name: "HTV Argentina",
      shortCode: "HTV",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&auto=format&fit=crop",
      currentShow: "Música Latina",
      videoUrl: "http://45.134.141.161:2200/ARG/HTV/index.m3u8"
    },
    {
      id: "ar-stream12",
      name: "Stream 12 Argentina",
      shortCode: "S12",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Vivo",
      videoUrl: "https://streamtv12.ddns.net:5443/LiveApp/streams/193945633734205616732920.m3u8"
    },
    {
      id: "ar-neotv",
      name: "Neo TV Digital",
      shortCode: "NEO",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=200&auto=format&fit=crop",
      currentShow: "Programación General",
      videoUrl: "https://videostream.shockmedia.com.ar:19360/neotvdigital/neotvdigital.m3u8"
    },
    {
      id: "ar-rtn",
      name: "RTN Neuquén",
      shortCode: "RTN",
      country: "Argentina 🇦🇷",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=200&auto=format&fit=crop",
      currentShow: "Televisión de Neuquén",
      videoUrl: "https://media.neuquen.gov.ar/rtn/television/media.m3u8"
    },
    {
      id: "ar-telemax",
      name: "Telemax",
      shortCode: "TMX",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=200&auto=format&fit=crop",
      currentShow: "Música y Entretenimiento",
      videoUrl: "https://stream-gtlc.telecentro.net.ar/hls/telemaxhls/main.m3u8"
    },
    {
      id: "ar-tvmana",
      name: "TV Mana Argentina",
      shortCode: "MNA",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Directo",
      videoUrl: "https://w2.manasat.com/tvmana-ar/smil:tvmana-ar.smil/playlist.m3u8"
    },
    {
      id: "ar-tn",
      name: "Todo Noticias (TN)",
      shortCode: "TN",
      country: "Argentina 🇦🇷",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200&auto=format&fit=crop",
      currentShow: "TN En Vivo 24/7",
      embedUrl: "https://www.youtube.com/embed/cb12KmMMDJA"
    },
    {
      id: "ar-america",
      name: "América TV",
      shortCode: "AMA",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=200&auto=format&fit=crop",
      currentShow: "América TV En Vivo",
      embedUrl: "https://www.youtube.com/embed/zcWXboTnous"
    },
    {
      id: "ar-c5n",
      name: "C5N",
      shortCode: "C5N",
      country: "Argentina 🇦🇷",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Noticias de Argentina y el Mundo",
      embedUrl: "https://www.youtube.com/embed/1ivxAla_IvE"
    },

    // BOLIVIA 🇧🇴
    {
      id: "bo-play1",
      name: "Bolivia Stream 1",
      shortCode: "BS1",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal en Directo",
      videoUrl: "http://190.181.61.93:8000/play/a001/index.m3u8"
    },
    {
      id: "bo-ftvhd",
      name: "F TV HD Bolivia",
      shortCode: "FTV",
      country: "Bolivia 🇧🇴",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=200&auto=format&fit=crop",
      currentShow: "F TV En Vivo",
      videoUrl: "https://master.tucableip.com/ftvhd/index.m3u8"
    },
    {
      id: "bo-play2",
      name: "Bolivia Stream 2",
      shortCode: "BS2",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&auto=format&fit=crop",
      currentShow: "Programación Nacional",
      videoUrl: "http://190.181.61.93:8000/play/a00n/index.m3u8"
    },
    {
      id: "bo-telefehd",
      name: "Telefe HD Bolivia",
      shortCode: "TLF",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal Internacional",
      videoUrl: "https://59d39900ebfb8.streamlock.net/telefehd/telefehd/playlist.m3u8"
    },
    {
      id: "bo-play3",
      name: "Bolivia Stream 3",
      shortCode: "BS3",
      country: "Bolivia 🇧🇴",
      category: "Regional",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Señal Local",
      videoUrl: "http://190.181.61.93:8000/play/1909/index.m3u8"
    },
    {
      id: "bo-reduno",
      name: "Red Uno Bolivia",
      shortCode: "RUN",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?q=80&w=200&auto=format&fit=crop",
      currentShow: "Notivisión",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
    },

    // ITALIA 🇮🇹
    {
      id: "it-router",
      name: "Router TV Italia",
      shortCode: "RTR",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&auto=format&fit=crop",
      currentShow: "Transmisión en Vivo",
      videoUrl: "https://router.xdevel.com/video0s975363-69/stream/playlist.m3u8"
    },
    {
      id: "it-italia2",
      name: "Mediaset Italia 2",
      shortCode: "IT2",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Programación Juvenil e Interés",
      videoUrl: "https://59d7d6f47d7fc.streamlock.net/italia2/italia2/playlist.m3u8"
    },
    {
      id: "it-fishing",
      name: "Fishing TV Italia",
      shortCode: "FSH",
      country: "Italia 🇮🇹",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Pesca y Aventura",
      videoUrl: "https://fms.premio.link/fishingtv/playlist.m3u8"
    },
    {
      id: "it-raiscuola",
      name: "RAI Scuola",
      shortCode: "RAI",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=200&auto=format&fit=crop",
      currentShow: "Cultura y Educación",
      videoUrl: "https://d3k8wzt41aflvx.cloudfront.net/RAIScuola/Live.m3u8"
    },
    {
      id: "it-jcn",
      name: "JCN Italia",
      shortCode: "JCN",
      country: "Italia 🇮🇹",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200&auto=format&fit=crop",
      currentShow: "News & More",
      videoUrl: "https://1601580044.rsc.cdn77.org/live/_jcn_/amlst:CHANNEL_2/playlist.m3u8"
    },
    {
      id: "it-mediaseteu",
      name: "Mediaset EU",
      shortCode: "MSE",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=200&auto=format&fit=crop",
      currentShow: "Mediaset En Vivo",
      videoUrl: "https://d3k8wzt41aflvx.cloudfront.net/MediasetEU/Live.m3u8"
    },
    {
      id: "it-medjugorje",
      name: "Medjugorje Italia TV",
      shortCode: "MED",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=200&auto=format&fit=crop",
      currentShow: "Transmisión Religiosa",
      videoUrl: "https://5f22d76e220e1.streamlock.net/medjugorjeitaliatv/medjugorjeitaliatv/playlist.m3u8"
    },

    // ESPAÑA 🇪🇸
    {
      id: "es-cinewestern",
      name: "Cine Western ES",
      shortCode: "WES",
      country: "España 🇪🇸",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Películas del Oeste",
      videoUrl: "https://d2nq34q0i1r3la.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-awohw8g217ho8/CineWestern_ES.m3u8"
    },
    {
      id: "es-eurosport1",
      name: "Eurosport 1 HD",
      shortCode: "EU1",
      country: "España 🇪🇸",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Deportes en Vivo",
      videoUrl: "http://45.134.141.161:2200/ARG/Eurosport_1_HD/index.m3u8"
    },
    {
      id: "es-eurosport2",
      name: "Eurosport 2 HD",
      shortCode: "EU2",
      country: "España 🇪🇸",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Deportes Alternativos",
      videoUrl: "http://45.134.141.161:2200/ARG/Eurosport_2_HD/index.m3u8"
    },
    {
      id: "es-rakutenfifa",
      name: "Rakuten TV FIFA Plus",
      shortCode: "FIF",
      country: "España 🇪🇸",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Fútbol y Documentales",
      videoUrl: "https://d63fabad.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWVzX0ZJRkFQbHVzU3BhbmlzaF9ITFM/playlist.m3u8"
    },
    {
      id: "es-mytimespain",
      name: "My Time Spain",
      shortCode: "MTS",
      country: "España 🇪🇸",
      category: "Entretenimiento",
      logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop",
      currentShow: "Series y Estilo de Vida",
      videoUrl: "https://appletree-mytimespain-rakuten.amagi.tv/playlist.m3u8"
    },
    {
      id: "es-24h",
      name: "TVE 24h España",
      shortCode: "24H",
      country: "España 🇪🇸",
      category: "Noticias",
      logo: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200&auto=format&fit=crop",
      currentShow: "Noticias Internacionales",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
    },

    // DEPORTES (ESPN) ⚽
    {
      id: "dep-espn",
      name: "ESPN HD",
      shortCode: "ESP",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Centro de Deportes & Fútbol en Vivo",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN/ESPN.isml/ESPN.m3u8"
    },
    {
      id: "dep-espn4",
      name: "ESPN 4",
      shortCode: "ES4",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Transmisión en Vivo",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_4/ESPN_4.isml/ESPN_4.m3u8"
    },
    {
      id: "dep-espn5",
      name: "ESPN 5",
      shortCode: "ES5",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Transmisión en Vivo",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_5/ESPN_5.isml/ESPN_5.m3u8"
    },
    {
      id: "dep-espn6",
      name: "ESPN 6",
      shortCode: "ES6",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Transmisión en Vivo",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_6/ESPN_6.isml/ESPN_6.m3u8"
    },
    {
      id: "dep-espn7",
      name: "ESPN 7",
      shortCode: "ES7",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=200&auto=format&fit=crop",
      currentShow: "Transmisión en Vivo",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_7/ESPN_7.isml/ESPN_7.m3u8"
    },

    // ECUADOR 🇪🇨
    {
      id: "ec-1",
      name: "Ecuavisa",
      shortCode: "ECU",
      country: "Ecuador 🇪🇨",
      category: "Señal Abierta",
      logo: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&auto=format&fit=crop",
      currentShow: "Telemundo Ecuador",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
    }
  ]);

  const [activeChannel, setActiveChannel] = useState<Channel>(liveChannels[0]);
  const [selectedCountryFilter, setSelectedCountryFilter] = useState<string>("Todos");
  const [searchGuide, setSearchGuide] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeChannel.embedUrl || !activeChannel.videoUrl) return;

    let hls: Hls | null = null;

    // Intenta con sonido; si el celular lo bloquea, arranca en silencio
    const tryPlay = () => {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    };

    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(activeChannel.videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = activeChannel.videoUrl;
      video.addEventListener("loadedmetadata", tryPlay, { once: true });
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [activeChannel]);

  const countryOrder = ["Perú 🇵🇪", "Chile 🇨🇱", "Argentina 🇦🇷", "Bolivia 🇧🇴", "Italia 🇮🇹", "España 🇪🇸", "Ecuador 🇪🇨", "Deportes ⚽", "Internacional 🌍"];
  
  const channelsGroupedByCountry = countryOrder.reduce((acc, countryName) => {
    const matchingChannels = liveChannels.filter(ch => {
      const matchesC = ch.country === countryName;
      const matchesSearch = searchGuide === "" ? true : ch.name.toLowerCase().includes(searchGuide.toLowerCase()) || (ch.shortCode && ch.shortCode.toLowerCase().includes(searchGuide.toLowerCase()));
      const matchesCountryTab = selectedCountryFilter === "Todos" ? true : selectedCountryFilter === "Deportes" ? ch.category === "Deportes" || ch.country.includes("Deportes") : ch.country.toLowerCase().includes(selectedCountryFilter.toLowerCase());
      return matchesC && matchesSearch && matchesCountryTab;
    });
    if (matchingChannels.length > 0) {
      acc[countryName] = matchingChannels;
    }
    return acc;
  }, {} as Record<string, Channel[]>);

  // Autenticación por Gmail
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerStep, setRegisterStep] = useState<"form" | "verify" | "success" | "forgot" | "reset" | "resetlink">("form");
  const [showPass, setShowPass] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [resetTokens, setResetTokens] = useState<{ at: string; rt: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [isGuest, setIsGuest] = useState(true);

  // Perfiles
  const guestProfile: Profile = { id: "invitado", name: "Invitado", avatar: "/avatares/bojack1.png", isKid: false };
  const reyProfile: Profile = { id: "admin-rey", name: "Rey", avatar: "/avatares/bojack1.png", isKid: false };
  // ¿Hay una cuenta con sesión iniciada? (se actualiza más abajo)
  const loggedInRef = useRef(false);
  // En el dispositivo del administrador, el perfil automático de su cuenta pasa a llamarse "Rey" (se guarda en la cuenta y se ve igual en todos sus dispositivos)
  const adminNameProfiles = (list: Profile[]): Profile[] => {
    const real = list.filter((p) => p.id !== "invitado" && p.id !== "admin-rey");
    if (real.length === 1 && (real[0] as any).auto && real[0].name !== "Rey") {
      const r = { ...real[0], name: "Rey" } as any;
      delete r.auto;
      return [r];
    }
    return real;
  };
  const [profiles, setProfiles] = useState<Profile[]>([guestProfile]);
  const [activeProfile, setActiveProfile] = useState<Profile>(profiles[0]);
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);

  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAvatar, setNewProfileAvatar] = useState(myAvatars[0].file);
  const [newProfileIsKid, setNewProfileIsKid] = useState(false);
  const [newProfilePin, setNewProfilePin] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const [toastMessage, setToastMessage] = useState("");
  const [avatarSearch, setAvatarSearch] = useState("");

  const filteredAvatars = myAvatars.filter(av => 
    av.name.toLowerCase().includes(avatarSearch.toLowerCase())
  );

  // Panel Admin y Estados de Formulario
  const [newMovieTitle, setNewMovieTitle] = useState("");
  const [newMovieDesc, setNewMovieDesc] = useState("");
  const [newMovieCategory, setNewMovieCategory] = useState("Acción");
  const [newMovieType, setNewMovieType] = useState<"pelicula" | "serie">("pelicula");
  const [newMovieImage, setNewMovieImage] = useState("");
  const [newMovieVideoUrl, setNewMovieVideoUrl] = useState("");
  const [newMovieYear, setNewMovieYear] = useState("");
  const [newMovieDuration, setNewMovieDuration] = useState("");
  const [newMovieAge, setNewMovieAge] = useState("");
  const [newMovieDirector, setNewMovieDirector] = useState("");
  const [newMovieCast, setNewMovieCast] = useState("");
  const [newMovieTrailer, setNewMovieTrailer] = useState("");
  const [detectingDuration, setDetectingDuration] = useState(false);
  const [newEpisodes, setNewEpisodes] = useState<Episode[]>([]);
  const [newComingSoon, setNewComingSoon] = useState(false);
  const [newReleaseDate, setNewReleaseDate] = useState("");
  const [notifyAll, setNotifyAll] = useState(true);
  const [newMovieSaga, setNewMovieSaga] = useState("");
  const [newMovieSagaOrder, setNewMovieSagaOrder] = useState("");
  // Top 10 automático (lo más visto de la semana)
  const [topIds, setTopIds] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/stats?top=1").then((r) => (r.ok ? r.json() : null)).then((d: any) => {
      if (d && Array.isArray(d.top)) setTopIds(d.top.map((x: any) => String(x.id)));
    }).catch(() => {});
  }, []);
  // Ahorro de datos: sin tráileres automáticos
  const [dataSaver, setDataSaver] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("cv_datasaver");
      if (v === "1" || v === "0") { setDataSaver(v === "1"); return; }
      const c: any = (navigator as any).connection;
      if (c && (c.saveData || /(^|-)2g$/.test(String(c.effectiveType || "")))) setDataSaver(true);
    } catch (e) {}
  }, []);
  // ---------- Imágenes livianas ----------
  // Las imágenes de TMDB se piden del tamaño justo para cada pantalla (y más chicas con Ahorro de datos).
  const [smallScreen, setSmallScreen] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia("(max-width: 767px)");
      const upd = () => setSmallScreen(mq.matches);
      upd();
      if (mq.addEventListener) mq.addEventListener("change", upd); else if ((mq as any).addListener) (mq as any).addListener(upd);
      return () => { try { if (mq.removeEventListener) mq.removeEventListener("change", upd); else if ((mq as any).removeListener) (mq as any).removeListener(upd); } catch (e) {} };
    } catch (e) {}
  }, []);
  const tmdbSized = (url: string | undefined, size: string) => {
    const u = url || "";
    return /^https:\/\/image\.tmdb\.org\/t\/p\/(w\d+|original)\//.test(u) ? u.replace(/\/t\/p\/(w\d+|original)\//, "/t/p/" + size + "/") : u;
  };
  // Póster (tarjetas y miniaturas)
  const posterSrc = (m: { bgImage?: string } | null | undefined) => tmdbSized(m ? m.bgImage : "", dataSaver ? "w185" : "w342");
  // Imagen ancha (portada, ficha, Continuar viendo)
  const wideSrc = (m: { backdrop?: string; bgImage?: string } | null | undefined, big?: boolean) => {
    if (!m) return "";
    if (m.backdrop) return tmdbSized(m.backdrop, !big || dataSaver || smallScreen ? "w780" : "w1280");
    return tmdbSized(m.bgImage, dataSaver ? "w342" : "w780");
  };
  const toggleDataSaver = () => {
    const v = !dataSaver;
    setDataSaver(v);
    try { localStorage.setItem("cv_datasaver", v ? "1" : "0"); } catch (e) {}
    showToast(v ? "📶 Ahorro de datos activado: sin tráileres automáticos e imágenes más livianas." : "Ahorro de datos desactivado.");
  };
  // Compartir
  const [shareTarget, setShareTarget] = useState<Movie | null>(null);
  // Revisión de enlaces (panel)
  const [linkIssues, setLinkIssues] = useState<{ id: string; title: string; where: string; reason: string }[]>([]);
  const [linkCheck, setLinkCheck] = useState<{ running: boolean; done: number; total: number; at: number }>({ running: false, done: 0, total: 0, at: 0 });
  // Avisos programados (panel)
  const [schedList, setSchedList] = useState<{ id: string; at: number; title: string; body: string; url?: string; image?: string }[]>([]);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedBody, setSchedBody] = useState("");
  const [schedMovieId, setSchedMovieId] = useState("");
  const [schedAt, setSchedAt] = useState("");
  const [newIntroStart, setNewIntroStart] = useState("");
  const [newIntroEnd, setNewIntroEnd] = useState("");
  const [newCreditsStart, setNewCreditsStart] = useState("");
  const [tmdbExtra, setTmdbExtra] = useState<{ genres?: string[]; rating?: string; production?: string; originalLanguage?: string; backdrop?: string; tmdbId?: number; sagaId?: number } | null>(null);
  const [tmdbResults, setTmdbResults] = useState<{ id: number; title: string; original: string; year: string; poster: string }[] | null>(null);
  const [tmdbBusy, setTmdbBusy] = useState(false);
  const [epSeason, setEpSeason] = useState("1");
  const [epNumber, setEpNumber] = useState("1");
  const [epTitle, setEpTitle] = useState("");
  const [epUrl, setEpUrl] = useState("");
  const [editingMovieId, setEditingMovieId] = useState<number | string | null>(null);

  // Catálogo Base por defecto
  // Arranca vacío (sin películas de ejemplo): así Google y la primera carga nunca muestran títulos que no son tuyos
  const [customMovies, setCustomMovies] = useState<Movie[]>([]);
  // ¿Ya está el catálogo real (del servidor o de la copia guardada)? Hasta entonces se ve la pantalla de carga
  const [catalogReady, setCatalogReady] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Perfil Niños: solo contenido infantil (ATP / +7, o Animación y Familia sin clasificación)
  // Perfil Niños: SOLO la categoría Animación (y nunca algo marcado +13, +16 o +18)
  const isKidFriendly = (m: Movie) => {
    if (m.ageRating && m.ageRating !== "ATP" && m.ageRating !== "+7") return false;
    const g = [m.tag].concat(m.genres || []).map((x) => String(x || "").toLowerCase());
    return g.some((x) => x.indexOf("anim") !== -1);
  };
  const kidsMode = !!activeProfile.isKid;
  // Sagas: "Marvel", "marvel " y "MARVEL" son la misma (se muestra con el primer nombre escrito)
  const sagaCanon: Record<string, string> = {};
  // TMDB a veces agrega "(Live-Action)", "(Theatrical)", "- Colección"…: se muestran sin eso
  const sagaClean = (n: string) => n.replace(/\s*\((live[- ]?action|theatrical|animated|animada|animaci[oó]n|colecci[oó]n|collection|saga|franquicia|franchise|serie|series|trilog[ií]a|trilogy)\)\s*$/i, "").replace(/\s*[-–:]\s*colecci[oó]n\s*$/i, "").replace(/\s+collection$/i, "").trim() || n.trim();
  customMovies.forEach((m) => { if (m.saga && m.saga.trim()) { const k = sagaClean(m.saga).toLowerCase(); if (!sagaCanon[k]) sagaCanon[k] = sagaClean(m.saga); } });
  const sagaFix = (m: Movie): Movie => { if (!m.saga) return m; const c = sagaCanon[sagaClean(m.saga).toLowerCase()]; return c && c !== m.saga ? { ...m, saga: c } : m; };
  const catalogAll: Movie[] = (kidsMode ? customMovies.filter(isKidFriendly) : customMovies).map(sagaFix);
  // Fecha de hoy "AAAA-MM-DD" (se lee en el navegador; al compilar queda vacía)
  const [todayStr, setTodayStr] = useState("");
  useEffect(() => {
    const upd = () => {
      const d = new Date();
      setTodayStr(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
    };
    upd();
    const t = setInterval(upd, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  // Un próximo estreno pasa solo a las películas cuando llega su fecha y ya tiene video
  const isNewMovie = (m: Movie) => !!(m.addedAt && nowTs && nowTs - m.addedAt < 7 * 86400000);
  const isNewMovie30 = (m: Movie) => !!(m.addedAt && nowTs && nowTs - m.addedAt < 30 * 86400000);
  // Nombre corto dentro de la saga: "Los juegos del hambre: En llamas" → "En llamas"
  const sagaShort = (m: Movie, i: number) => {
    const nt = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = m.title.trim();
    const sg = (m.saga || "").trim();
    if (sg && nt(t).startsWith(nt(sg))) {
      const rest = t.slice(sg.length).replace(/^[\s:·\-–—,.]+/, "").trim();
      if (rest) return /^\d+$/.test(rest) ? "Parte " + rest : rest.charAt(0).toUpperCase() + rest.slice(1);
      return i === 0 ? "Parte 1" : t;
    }
    return t;
  };
  const sagaSort = (a: Movie, b: Movie) => (a.sagaOrder || 999) - (b.sagaOrder || 999) || String(a.year).localeCompare(String(b.year)) || a.title.localeCompare(b.title);
  // Siguiente película de la misma saga
  const nextInSaga = (m: Movie | null): Movie | null => {
    if (!m || !m.saga || m.type === "serie") return null;
    const list = catalog.filter((x) => x.saga === m.saga && x.type !== "serie").sort(sagaSort);
    const i = list.findIndex((x) => String(x.id) === String(m.id));
    return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  };
  // Nombre de saga para una película nueva: si ya existe (mismo id de TMDB o mismo nombre), se usa el de siempre
  const sagaNameFor = (name: string, sagaId?: number) => {
    const byId = sagaId ? customMovies.find((x) => x.sagaId === sagaId && x.saga) : undefined;
    if (byId && byId.saga) return sagaClean(byId.saga);
    return sagaCanon[sagaClean(name).toLowerCase()] || sagaClean(name);
  };
  const isUpcoming = (m: Movie) =>
    !!m.comingSoon && !(m.releaseDate && todayStr && m.releaseDate <= todayStr && m.videoUrl && !/gtv-videos-bucket/i.test(m.videoUrl));
  // Lo que se puede ver ya (sin próximos estrenos)
  const catalog: Movie[] = catalogAll.filter((m) => !isUpcoming(m));
  // Próximos estrenos, ordenados por fecha
  const upcoming: Movie[] = catalogAll
    .filter((m) => isUpcoming(m))
    .sort((a, b) => String(a.releaseDate || "9999").localeCompare(String(b.releaseDate || "9999")));
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fmtRelease = (d?: string) => {
    const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? parseInt(m[3], 10) + " " + MESES[parseInt(m[2], 10) - 1] + " " + m[1] : "Muy pronto";
  };

  // ¿Este dispositivo es del administrador? (solo afecta a la interfaz; el servidor
  // vuelve a comprobar la clave ADMIN_PASSWORD antes de guardar cualquier cosa)
  const wantsAdmin = (): boolean => {
    try { return /[?&]admin\b/.test(window.location.search); } catch (e) { return false; }
  };

  const readAdminDevice = (): boolean => {
    try {
      const key = localStorage.getItem("cineverso_admin_key");
      if (ADMIN_HASH.length === 64 && key === ADMIN_HASH) return true;
      if (key === "server" && localStorage.getItem("cineverso_admin_pass")) return true;
    } catch (e) {}
    return false;
  };

  // true = el catálogo viene de Supabase (/api/catalog) y los cambios se publican al instante
  const [serverCatalog, setServerCatalog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let adminLocal: Movie[] | null = null;
    try {
      if (readAdminDevice() && wantsAdmin()) {
        const saved = localStorage.getItem("cineverso_custom_movies");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) adminLocal = parsed;
        }
      } else if (!readAdminDevice()) {
        // Visitantes: limpiar copias viejas que se guardaron antes por error
        localStorage.removeItem("cineverso_custom_movies");
      }
    } catch (e) {
      console.error("Error cargando localStorage:", e);
    }

    // Copia del último catálogo: la próxima visita lo muestra al instante (luego se actualiza solo)
    try {
      const cached = JSON.parse(localStorage.getItem("cv_catalog_cache") || "null");
      if (cached && Array.isArray(cached.list) && cached.list.length > 0 && !adminLocal) {
        setCustomMovies(cached.list);
        setCatalogReady(true);
      }
    } catch (e) {}

    const finish = (list: Movie[] | null, fromServer: boolean) => {
      if (cancelled) return;
      if (list && list.length > 0) {
        setCustomMovies(list);
        if (fromServer) {
          try { localStorage.setItem("cv_catalog_cache", JSON.stringify({ at: Date.now(), list })); } catch (e) {}
        }
      }
      setServerCatalog(fromServer);
      setIsMounted(true);
      setCatalogReady(true);
    };

    const loadStaticFile = (serverWorks: boolean) =>
      fetch("/catalogo.json?v=" + Date.now(), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((data) => {
          const fileList = Array.isArray(data) && data.length > 0 ? (data as Movie[]) : null;
          // Admin con servidor vacío: usa sus películas locales para poder publicarlas
          finish(adminLocal || fileList, serverWorks);
        });

    // 1º Supabase (/api/catalog)  →  2º /catalogo.json  →  3º catálogo de ejemplo
    fetch("/api/catalog?v=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        const serverWorks = !!(d && Array.isArray(d.movies));
        if (serverWorks && d.movies.length > 0) finish(d.movies as Movie[], true);
        else return loadStaticFile(serverWorks);
      });
    return () => { cancelled = true; };
  }, []);

  // Modo invitado: no se guarda nada. Se borran perfiles viejos que quedaron guardados antes.
  useEffect(() => {
    try { localStorage.removeItem("cineverso_profiles"); } catch (e) {}
  }, []);

  // ===== ADMIN: solo con clave =====
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  const [adminPassError, setAdminPassError] = useState("");
  const [adminChecking, setAdminChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const showToast = (msg: string, ms = 4000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), ms);
  };

  // El panel solo aparece si la dirección tiene ?admin. Con la dirección normal
  // hasta tú ves la página como cualquier visitante.
  useEffect(() => {
    const adminDevice = readAdminDevice();
    if (wantsAdmin() && adminDevice) setIsAdmin(true);
    if (wantsAdmin() && !adminDevice) setShowAdminLogin(true);
  }, []);

  // Inicio de sesión de administrador: la clave se cambia por un pase temporal (7 días) firmado por el servidor
  const adminLoginCall = (password: string) =>
    fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", password }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ status: r.status, d })))
      .catch(() => ({ status: 0, d: {} as any }));
  // Seguridad: si este dispositivo guardaba la CLAVE (versión anterior), se cambia sola por un pase.
  // Si el pase está por vencer, se renueva.
  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!saved) return;
    const store = (t: string) => { try { localStorage.setItem("cineverso_admin_pass", t); } catch (e) {} };
    const m = /^cvt\.(\d+)\./.exec(saved);
    if (!m) {
      adminLoginCall(saved).then(({ status, d }) => {
        if (status === 200 && d.token) { store(d.token); try { if (d.loginId) localStorage.setItem("cv_admin_login_id", d.loginId); } catch (e) {} }
        else if (status === 401) { try { localStorage.removeItem("cineverso_admin_pass"); } catch (e) {} }
      });
      return;
    }
    if (Number(m[1]) - Date.now() < 3 * 86400000) {
      fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "renew", password: saved }) })
        .then((r) => r.json().catch(() => ({})).then((d: any) => ({ status: r.status, d })))
        .then(({ status, d }) => { if (status === 200 && d.token) store(d.token); else if (status === 401) { try { localStorage.removeItem("cineverso_admin_pass"); } catch (e) {} } })
        .catch(() => {});
    }
  }, []);
  // Copias de seguridad del catálogo (panel)
  const [backups, setBackups] = useState<{ slot: number; at: number; count: number }[] | null>(null);
  const adminPass = () => { try { return localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) { return ""; } };
  const loadBackups = () => {
    fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "backups", password: adminPass() }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ status: r.status, d })))
      .then(({ status, d }) => { if (status === 200) setBackups(d.backups || []); else if (status === 401) { setServerPassError("Por seguridad, vuelve a escribir tu clave de administrador."); setShowServerPass(true); } })
      .catch(() => {});
  };
  const restoreBackup = (b: { slot: number; at: number; count: number }) => {
    if (!window.confirm("¿Restaurar el catálogo como estaba el " + new Date(b.at).toLocaleString("es-PE", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " (" + b.count + " títulos)?\n\nEl catálogo actual queda guardado como copia de hoy, por si te arrepientes.")) return;
    fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", slot: b.slot, password: adminPass() }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ status: r.status, d })))
      .then(({ status, d }) => {
        if (status === 200) {
          showToast("🛡️ Catálogo restaurado (" + d.count + " títulos). Recargando…", 5000);
          setTimeout(() => { try { localStorage.removeItem("cv_catalog_cache"); } catch (e) {} window.location.reload(); }, 1500);
        } else showToast("No se pudo restaurar (" + ((d && d.error) || status) + ").", 6000);
      })
      .catch(() => showToast("Sin conexión."));
  };
  // Registro de entradas al panel y "cerrar sesión en todos los dispositivos"
  const [adminLog, setAdminLog] = useState<{ at: number; kind: string; device: string; net: string; id?: string }[] | null>(null);
  const myLoginId = () => { try { return localStorage.getItem("cv_admin_login_id") || ""; } catch (e) { return ""; } };
  const loadAdminLog = () => {
    fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logins", password: adminPass() }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ status: r.status, d })))
      .then(({ status, d }) => { if (status === 200) setAdminLog(d.log || []); })
      .catch(() => {});
  };
  const revokeAllAdmins = () => {
    if (!window.confirm("¿Cerrar la sesión de administrador en TODOS los demás dispositivos?\n\nCualquier otro celular, PC o TV (incluido alguien que no seas tú) perderá el acceso al instante. Este dispositivo sigue conectado.")) return;
    fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revokeAll", password: adminPass() }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ status: r.status, d })))
      .then(({ status, d }) => {
        if (status === 200 && d.token) {
          try { localStorage.setItem("cineverso_admin_pass", d.token); if (d.loginId) localStorage.setItem("cv_admin_login_id", d.loginId); } catch (e) {}
          showToast("🚨 Listo: se cerró la sesión de administrador en todos los demás dispositivos.", 7000);
          loadAdminLog();
        } else if (status === 401) { setServerPassError("Por seguridad, vuelve a escribir tu clave de administrador."); setShowServerPass(true); }
        else showToast("No se pudo (" + ((d && d.error) || status) + ").", 6000);
      })
      .catch(() => showToast("Sin conexión."));
  };
  useEffect(() => { if (activeTab === "admin" && isAdmin) { const t = setTimeout(loadAdminLog, 1500); return () => clearTimeout(t); } }, [activeTab, isAdmin]);
  const adminLogoutDevice = () => {
    if (!window.confirm("¿Cerrar la sesión de administrador en este dispositivo?")) return;
    try { localStorage.removeItem("cineverso_admin_pass"); localStorage.removeItem("cineverso_admin_key"); } catch (e) {}
    setIsAdmin(false);
    setActiveTab("inicio");
    showToast("🔒 Sesión de administrador cerrada en este dispositivo.");
  };
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminChecking) return;
    const pass = adminPassInput;
    setAdminChecking(true);
    setAdminPassError("");
    // El servidor comprueba la clave sin modificar nada (movies:null a propósito):
    // clave correcta -> 400 "Catálogo inválido"; incorrecta -> 401.
    adminLoginCall(pass)
      .then(({ status, d }) => {
        setAdminChecking(false);
        if (status === 200 && d.token) {
          try {
            localStorage.setItem("cineverso_admin_key", "server");
            // Solo se guarda el pase temporal firmado por el servidor, nunca la clave
            localStorage.setItem("cineverso_admin_pass", d.token);
            if (d.loginId) localStorage.setItem("cv_admin_login_id", d.loginId);
          } catch (err) {}
          setIsAdmin(true);
          setShowAdminLogin(false);
          setAdminPassInput("");
          setActiveTab("admin");
          showToast("Sesión de administrador iniciada. Los cambios se publicarán para todos.");
        } else if (status === 429) setAdminPassError("🔒 Demasiados intentos fallidos. Por seguridad espera " + (d.lockedMin || 15) + " minutos.");
        else if (status === 401) setAdminPassError("Clave incorrecta." + (typeof d.left === "number" && d.left <= 3 ? " Te quedan " + d.left + " intento" + (d.left === 1 ? "" : "s") + " antes del bloqueo." : ""));
        else if (status === 503) setAdminPassError("El servidor no tiene la clave configurada todavía. Vuelve a ejecutar el actualizador con tu clave.");
        else setAdminPassError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
      });
  };

  useEffect(() => {
    if (!isMounted || !isAdmin) return;
    try {
      if (customMovies.length > 0) {
        localStorage.setItem("cineverso_custom_movies", JSON.stringify(customMovies));
      }
    } catch (e) {
      console.error("Error guardando en localStorage:", e);
    }
  }, [customMovies, isMounted, isAdmin]);

  // Guarda el catálogo: en pantalla + en Supabase (para todos los dispositivos)
  const saveCatalog = (list: Movie[], okMsg: string) => {
    setCustomMovies(list);
    let pass = "";
    try { pass = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!pass) {
      pendingSaveRef.current = () => saveCatalog(list, okMsg);
      setServerPassError("");
      setShowServerPass(true);
      return;
    }
    setSyncing(true);
    fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass, movies: list }),
    })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, status: r.status, d })))
      .then(({ ok, status, d }) => {
        setSyncing(false);
        if (ok) {
          setServerCatalog(true);
          showToast(okMsg + " ✔ Publicado en todos los dispositivos.");
        } else if (status === 401) {
          try { localStorage.removeItem("cineverso_admin_pass"); } catch (e) {}
          showToast("Tu clave guardada ya no es válida. Vuelve a entrar con ?admin.", 7000);
        } else {
          showToast("No se pudo publicar (" + ((d && d.error) || status) + "). Se guardó solo en este navegador.", 7000);
        }
      })
      .catch(() => {
        setSyncing(false);
        showToast("Sin conexión con el servidor. Se guardó solo en este navegador.", 6000);
      });
  };

  // Cuando el admin inicia sesión aparece su perfil "Rey" (no se guarda para visitantes)
  useEffect(() => {
    const adminProfile = reyProfile;
    if (isAdmin && loggedInRef.current) {
      // Con cuenta: el admin ve exactamente los mismos perfiles que en sus otros dispositivos
      setProfiles((prev) => {
        const next = adminNameProfiles(prev);
        setActiveProfile((cur) => next.find((p) => p.id === cur.id) || next[0]);
        return next.length ? next : prev;
      });
    } else if (isAdmin) {
      setProfiles((prev) => (prev.some((p) => p.id === "admin-rey") ? prev : [adminProfile].concat(prev.filter((p) => p.id !== "invitado"))));
      setActiveProfile(adminProfile);
    } else {
      setProfiles((prev) => {
        const rest = prev.filter((p) => p.id !== "admin-rey");
        return rest.length ? rest : [guestProfile];
      });
      setActiveProfile((prev) => (prev.id === "admin-rey" ? guestProfile : prev));
    }
  }, [isAdmin]);

  // Clave del servidor (ADMIN_PASSWORD de Vercel): sin ella no se puede publicar nada
  const [showServerPass, setShowServerPass] = useState(false);
  const [serverPassInput, setServerPassInput] = useState("");
  const [serverPassError, setServerPassError] = useState("");
  const [serverPassBusy, setServerPassBusy] = useState(false);
  const [hasServerPass, setHasServerPass] = useState(false);
  const pendingSaveRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    try { setHasServerPass(!!localStorage.getItem("cineverso_admin_pass")); } catch (e) {}
  }, [isAdmin, showServerPass]);

  const submitServerPass = (e: React.FormEvent) => {
    e.preventDefault();
    if (serverPassBusy) return;
    setServerPassBusy(true);
    setServerPassError("");
    adminLoginCall(serverPassInput)
      .then(({ status, d }) => {
        setServerPassBusy(false);
        if (status === 200 && d.token) {
          try { localStorage.setItem("cineverso_admin_key", "server"); localStorage.setItem("cineverso_admin_pass", d.token); if (d.loginId) localStorage.setItem("cv_admin_login_id", d.loginId); } catch (err) {}
          setHasServerPass(true);
          setShowServerPass(false);
          setServerPassInput("");
          const next = pendingSaveRef.current;
          pendingSaveRef.current = null;
          if (next) next();
          else showToast("Listo: ahora tus cambios se publican para todos.");
        } else if (status === 429) {
          setServerPassError("🔒 Demasiados intentos fallidos. Por seguridad espera " + (d.lockedMin || 15) + " minutos.");
        } else if (status === 401) {
          setServerPassError("Clave incorrecta." + (typeof d.left === "number" && d.left <= 3 ? " Te quedan " + d.left + " intento" + (d.left === 1 ? "" : "s") + "." : ""));
        } else if (status === 503) {
          setServerPassError("El servidor no tiene la clave configurada todavía. Vuelve a ejecutar el actualizador con tu clave.");
        } else {
          setServerPassError("No se pudo conectar con el servidor (código " + status + "). Inténtalo de nuevo.");
        }
      });
  };

  type CatalogOp = { type: "upsert"; movie: Movie } | { type: "delete"; id: number | string } | { type: "upsertMany"; movies: Movie[] } | { type: "patchMany"; patches: { id: number | string; fields: Partial<Movie> }[] };
  const applyOp = (list: Movie[], op: CatalogOp): Movie[] => {
    // Cambia solo algunos datos (por ejemplo la saga) sin tocar el resto de cada película
    if (op.type === "patchMany") return list.map((m) => { const p = op.patches.find((x) => String(x.id) === String(m.id)); return p ? { ...m, ...p.fields } : m; });
    if (op.type === "delete") return list.filter((m) => String(m.id) !== String(op.id));
    if (op.type === "upsertMany") return op.movies.reduce((acc, mv) => applyOp(acc, { type: "upsert", movie: mv }), list);
    const exists = list.some((m) => String(m.id) === String(op.movie.id));
    return exists ? list.map((m) => (String(m.id) === String(op.movie.id) ? op.movie : m)) : [op.movie].concat(list);
  };

  // Guarda UN cambio sin pisar el resto: primero lee el catálogo actual del servidor,
  // le aplica solo este cambio y lo vuelve a guardar. Así una copia vieja en otro
  // dispositivo ya no puede borrar ni reemplazar tus enlaces.
  const saveChange = (op: CatalogOp, okMsg: string) => {
    let pass = "";
    try { pass = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!pass) {
      // No guardamos nada a medias: pedimos la clave del servidor y luego seguimos
      pendingSaveRef.current = () => saveChange(op, okMsg);
      setServerPassError("");
      setShowServerPass(true);
      return;
    }
    setCustomMovies((prev) => applyOp(prev, op));
    setSyncing(true);
    fetch("/api/catalog?v=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d: any) => {
        if (!d || !Array.isArray(d.movies)) {
          setSyncing(false);
          showToast("No se pudo leer el catálogo del servidor; el cambio NO se publicó. Inténtalo de nuevo.", 7000);
          return;
        }
        const finalList = applyOp(d.movies.length ? (d.movies as Movie[]) : customMovies, op);
        return fetch("/api/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pass, movies: finalList }),
        })
          .then((r) => r.json().catch(() => ({})).then((x: any) => ({ ok: r.ok, status: r.status, x })))
          .then(({ ok, status, x }) => {
            setSyncing(false);
            if (ok) {
              setCustomMovies(finalList);
              setServerCatalog(true);
              showToast(okMsg + " ✔ Publicado en todos los dispositivos.");
            } else if (status === 401) {
              // El pase de administrador venció: se pide la clave y se vuelve a intentar este mismo cambio
              try { localStorage.removeItem("cineverso_admin_pass"); } catch (e) {}
              pendingSaveRef.current = () => saveChange(op, okMsg);
              setServerPassError("Por seguridad, vuelve a escribir tu clave de administrador.");
              setShowServerPass(true);
            } else {
              showToast("No se pudo publicar (" + ((x && x.error) || status) + ").", 7000);
            }
          });
      })
      .catch(() => {
        setSyncing(false);
        showToast("Sin conexión con el servidor. El cambio no se publicó.", 6000);
      });
  };

  // Al abrir el panel, carga siempre la versión más nueva del servidor
  useEffect(() => {
    if (activeTab !== "admin" || !isAdmin) return;
    fetch("/api/catalog?v=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d: any) => {
        if (d && Array.isArray(d.movies) && d.movies.length) {
          setCustomMovies(d.movies);
          setServerCatalog(true);
        }
      });
  }, [activeTab, isAdmin]);

  // Panel de estadísticas
  const [statsDays, setStatsDays] = useState(7);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [dropoffFor, setDropoffFor] = useState<string | null>(null);
  const loadStats = (days: number) => {
    let pass = "";
    try { pass = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!pass) { setStatsError("Vuelve a entrar con ?admin para ver las estadísticas."); return; }
    setStatsLoading(true);
    setStatsError("");
    fetch("/api/stats?days=" + days, { cache: "no-store", headers: { "x-admin-key": pass } })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        setStatsLoading(false);
        if (ok) setStats(d);
        else setStatsError((d && d.error) || "No se pudieron cargar las estadísticas.");
      })
      .catch(() => { setStatsLoading(false); setStatsError("Sin conexión con el servidor."); });
  };
  useEffect(() => {
    if (activeTab === "admin" && isAdmin) loadStats(statsDays);
  }, [activeTab, isAdmin, statsDays]);

  // ---------- Revisión automática de enlaces de video ----------
  const runLinkCheck = (force?: boolean) => {
    if (linkCheck.running) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem("cv_linkcheck") || "null");
      if (!force && saved && Date.now() - saved.at < 6 * 3600 * 1000) {
        setLinkIssues(saved.issues || []);
        setLinkCheck({ running: false, done: saved.total || 0, total: saved.total || 0, at: saved.at });
        return;
      }
    } catch (e) {}
    const jobs: { id: string; title: string; where: string; url: string }[] = [];
    const skip = (u: string) => !u || !/^https?:\/\//i.test(u) || /gtv-videos-bucket|youtube\.com|youtu\.be|drive\.google|\/embed\//i.test(u);
    catalogAll.forEach((m) => {
      if (!skip(m.videoUrl)) jobs.push({ id: String(m.id), title: m.title, where: "Película", url: m.videoUrl });
      (m.episodes || []).forEach((ep) => { if (!skip(ep.videoUrl)) jobs.push({ id: String(m.id), title: m.title, where: "T" + ep.season + " E" + ep.number, url: ep.videoUrl }); });
    });
    const list = jobs.slice(0, 300);
    const issues: { id: string; title: string; where: string; reason: string }[] = [];
    let done = 0, next = 0;
    setLinkCheck({ running: true, done: 0, total: list.length, at: 0 });
    const finish = () => {
      const at = Date.now();
      setLinkIssues(issues.slice());
      setLinkCheck({ running: false, done: list.length, total: list.length, at });
      try { sessionStorage.setItem("cv_linkcheck", JSON.stringify({ at, total: list.length, issues })); } catch (e) {}
    };
    if (!list.length) { finish(); return; }
    const worker = (): Promise<void> => {
      if (next >= list.length) return Promise.resolve();
      const j = list[next++];
      return fetch("/api/video-check?u=" + encodeURIComponent(j.url), { cache: "no-store" })
        .then((r) => r.json())
        .then((d: any) => {
          const ct = String((d && d.contentType) || "");
          let reason = "";
          if (!d || (!d.ok && d.status !== 206)) {
            reason = d && d.status === 403 ? "Bloqueado (403)" : d && d.status === 404 ? "Borrado o no existe (404)" : d && d.reason === "timeout" ? "No responde (muy lento)" : d && d.status ? "Error " + d.status : "No se pudo conectar";
          } else if (/text\/html/i.test(ct)) reason = "El enlace abre una página, no un video";
          if (reason) issues.push({ id: j.id, title: j.title, where: j.where, reason });
        })
        .catch(() => {})
        .then(() => { done++; setLinkCheck((c) => ({ ...c, done })); return worker(); });
    };
    Promise.all([worker(), worker(), worker(), worker()]).then(finish);
  };
  useEffect(() => {
    if (activeTab !== "admin" || !isAdmin || !catalogAll.length) return;
    const t = setTimeout(() => runLinkCheck(false), 1500);
    return () => clearTimeout(t);
  }, [activeTab, isAdmin, catalogAll.length]);

  // ---------- Avisos programados ----------
  const adminPassOf = () => { try { return localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) { return ""; } };
  const loadSched = () => {
    const pass = adminPassOf();
    if (!pass) return;
    fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "schedlist", password: pass }) })
      .then((r) => r.json()).then((d: any) => { if (d && Array.isArray(d.items)) setSchedList(d.items); }).catch(() => {});
  };
  useEffect(() => {
    if (activeTab !== "admin" || !isAdmin) return;
    loadSched();
    // Mientras el panel está abierto, revisa cada minuto si toca enviar algún aviso
    const iv = setInterval(() => {
      fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto" }) })
        .then(() => loadSched()).catch(() => {});
    }, 60000);
    return () => clearInterval(iv);
  }, [activeTab, isAdmin]);
  const addSched = () => {
    const pass = adminPassOf();
    if (!pass) { showToast("Para programar avisos vuelve a entrar con ?admin.", 6000); return; }
    const at = schedAt ? new Date(schedAt).getTime() : NaN;
    if (!at || isNaN(at)) { showToast("Elige el día y la hora del aviso."); return; }
    if (at < Date.now() + 60000) { showToast("Elige una hora en el futuro."); return; }
    const mv = catalogAll.find((x) => String(x.id) === schedMovieId);
    const title = schedTitle.trim() || (mv ? (mv.comingSoon ? "Próximo estreno 🎬" : "¡Ya disponible! 🍿") : "");
    const body = schedBody.trim() || (mv ? mv.title + (mv.comingSoon ? " llega pronto a Cineverso Mágico." : " ya se puede ver en Cineverso Mágico.") : "");
    if (!title || !body) { showToast("Escribe el título y el mensaje del aviso (o elige una película)."); return; }
    const item = { at, title, body, url: mv ? "/ver/" + mv.id : "/", image: mv ? mv.backdrop || mv.bgImage : "", tag: mv ? "m-" + mv.id : "" };
    fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "schedule", password: pass, item }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && Array.isArray(d.items)) {
          setSchedList(d.items);
          setSchedTitle(""); setSchedBody(""); setSchedMovieId(""); setSchedAt("");
          showToast("⏰ Aviso programado para el " + new Date(at).toLocaleString("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
        } else showToast("No se pudo programar (" + ((d && d.error) || "error") + ").");
      })
      .catch(() => showToast("No se pudo programar el aviso."));
  };
  const removeSched = (id: string) => {
    const pass = adminPassOf();
    fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unschedule", password: pass, id }) })
      .then((r) => r.json()).then((d: any) => { if (d && Array.isArray(d.items)) setSchedList(d.items); }).catch(() => {});
  };

  // Estrenar un próximo estreno con un solo clic
  const releaseNow = (m: Movie) => {
    let url = m.videoUrl || "";
    if (!url || /gtv-videos-bucket/i.test(url)) {
      url = (window.prompt("Pega el enlace del video de \"" + m.title + "\":", "") || "").trim();
      if (!url) return;
    }
    const avisar = window.confirm("¿Avisar a todos que \"" + m.title + "\" ya está disponible?");
    const released: Movie = { ...m, videoUrl: url, comingSoon: undefined, releaseDate: undefined, addedAt: Date.now() };
    saveChange({ type: "upsert", movie: released }, "¡Estrenada! Ya aparece con las demás películas.");
    if (avisar) sendPush({ title: "¡Ya disponible! 🍿", body: m.title + " ya se puede ver en Cineverso Mágico.", image: m.backdrop || m.bgImage, url: "/ver/" + m.id, tag: "m-" + m.id }, m);
  };

  // Probar un enlace desde el panel
  const [linkStatus, setLinkStatus] = useState<Record<string, string>>({});
  const testLink = (movie: Movie) => {
    const key = String(movie.id);
    setLinkStatus((p) => ({ ...p, [key]: "Probando..." }));
    fetch("/api/video-check?u=" + encodeURIComponent(movie.videoUrl || ""), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d: any) => {
        let t = "✖ No se pudo comprobar";
        if (d) {
          const st = d.status || 0;
          const ct = String(d.contentType || "");
          if (st === 200 || st === 206) t = ct && !/video|octet-stream|mpegurl|mp2t/i.test(ct) ? "✖ No es un video directo (" + ct + ")" : "✔ Funciona (" + st + ")";
          else if (st === 0) t = "✖ El servidor no responde";
          else t = "✖ Error " + st + (st === 403 ? " (bloqueado/retirado)" : st === 404 ? " (no existe)" : "");
        }
        setLinkStatus((p) => ({ ...p, [key]: t }));
      });
  };

  useEffect(() => {
    if (kidsMode && (activeTab === "tv" || activeTab === "admin")) setActiveTab("inicio");
  }, [kidsMode, activeTab]);

  const handleAdminLogout = () => {
    try {
      localStorage.removeItem("cineverso_admin_key");
      localStorage.removeItem("cineverso_admin_pass");
    } catch (err) {}
    setIsAdmin(false);
    setActiveTab("inicio");
    try { window.history.replaceState(null, "", window.location.pathname); } catch (err) {}
  };

  const handleExportCatalog = () => {
    try {
      const blob = new Blob([JSON.stringify(customMovies, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "catalogo.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setToastMessage("catalogo.json descargado. Publícalo con el comando de la terminal.");
      setTimeout(() => setToastMessage(""), 5000);
    } catch (err) {
      alert("No se pudo exportar el catálogo.");
    }
  };

  // Portada que cambia sola (hasta 5 títulos)
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const heroList = catalog.slice(0, 5);
  useEffect(() => {
    if (heroList.length < 2 || heroPaused) return;
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % heroList.length), 9000);
    return () => clearInterval(t);
  }, [heroList.length, heroPaused]);
  const [heroTrailerOn, setHeroTrailerOn] = useState(false);
  const [heroTrailerReady, setHeroTrailerReady] = useState(false);
  const [heroMuted, setHeroMuted] = useState(true);
  const heroMutedRef = useRef(true);
  heroMutedRef.current = heroMuted;
  const heroMovie: Movie = heroList[heroIndex % Math.max(1, heroList.length)] || catalog[0] || customMovies[0] || {
    id: 101,
    title: "APOCALYPSE Z",
    subtitle: "NEW WORLD",
    rating: "8.8",
    year: "2026",
    tag: "Acción",
    desc: "Tras el brote del virus TSJ, las Islas Canarias son el último refugio de Europa.",
    bgImage: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1600&auto=format&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    duration: "2 h 10 min",
    genres: ["Acción", "Suspenso"],
    cast: "Francisco Ortiz, Jose María Yazpik",
    director: "Carles Torrens",
    production: "Nostromo Pictures",
    originalLanguage: "ES"
  };
  // Carga rápida: conexión anticipada al servidor de imágenes y la imagen de portada primero
  try {
    preconnect("https://image.tmdb.org");
    const heroImg = wideSrc(heroMovie, true);
    if (heroImg && catalogReady) preload(heroImg, { as: "image", fetchPriority: "high" });
  } catch (e) {}
  // La siguiente imagen de la portada se descarga antes de que llegue su turno
  useEffect(() => {
    if (heroList.length < 2) return;
    const next = heroList[(heroIndex + 1) % heroList.length];
    const t = setTimeout(() => { try { const im = new Image(); im.decoding = "async"; im.src = wideSrc(next, true); } catch (e) {} }, 2500);
    return () => clearTimeout(t);
  }, [heroIndex, heroList.length, smallScreen, dataSaver]);


  // ================================================================
  // COMPATIBILIDAD SMART TV (control remoto, tecla Atrás, CSS antiguo)
  // ================================================================
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const [playerError, setPlayerError] = useState("");
  const [usingBackup, setUsingBackup] = useState(false);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // Pantalla de carga con el logo CV (una vez por sesión)
  const [showSplash, setShowSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);
  const [splashMinDone, setSplashMinDone] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("cv_splash") === "1"; sessionStorage.setItem("cv_splash", "1"); } catch (e) {}
    const t = setTimeout(() => setSplashMinDone(true), seen ? 0 : 1300);
    // Por seguridad: si el servidor tarda demasiado, se muestra la web igual
    const safety = setTimeout(() => setCatalogReady(true), 9000);
    return () => { clearTimeout(t); clearTimeout(safety); };
  }, []);
  // La pantalla de carga se quita solo cuando ya está el catálogo real (sin mostrar películas de ejemplo)
  useEffect(() => {
    if (!splashMinDone || !catalogReady) return;
    setSplashFade(true);
    const t2 = setTimeout(() => setShowSplash(false), 450);
    return () => clearTimeout(t2);
  }, [splashMinDone, catalogReady]);

  // Avisa al guardián de TV que la app arrancó bien
  useEffect(() => {
    try { (window as any).__cvReady = true; } catch (e) {}
  }, []);

  // Enlaces compartidos (/ver/ID -> /?ver=ID): abre la ficha de esa película
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (!isMounted || deepLinkDone.current) return;
    deepLinkDone.current = true;
    try {
      const v = new URLSearchParams(window.location.search).get("ver");
      if (!v) return;
      const m = customMovies.find((x) => String(x.id) === v);
      if (m) setSelectedMovie(m);
      const params = new URLSearchParams(window.location.search);
      params.delete("ver");
      const q = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (q ? "?" + q : ""));
    } catch (e) {}
  }, [isMounted, customMovies]);

  // App instalable + carga rápida: registra el service worker (/sw.js)
  useEffect(() => {
    try {
      if ("serviceWorker" in navigator && window.location.protocol === "https:") {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    } catch (e) {}
  }, []);

  // Detecta navegador antiguo y Smart TV
  useEffect(() => {
    const html = document.documentElement;
    let legacy = false;
    try {
      const w = window as any;
      legacy = !(w.CSS && w.CSS.supports) || !w.CSS.supports("aspect-ratio", "1 / 1") || !w.CSS.supports("inset", "0");
    } catch (e) {
      legacy = true;
    }
    if (legacy) html.classList.add("tv-legacy");
    let savedTv: string | null = null;
    try { savedTv = localStorage.getItem("cineverso_tv_mode"); } catch (e) {}
    if (savedTv === "1" || (savedTv === null && isSmartTvBrowser())) setTvMode(true);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (tvMode) html.classList.add("tv-mode");
    else html.classList.remove("tv-mode");
    try { localStorage.setItem("cineverso_tv_mode", tvMode ? "1" : "0"); } catch (e) {}
  }, [tvMode]);

  // Estado actual para el manejador de teclas (sin volver a registrarlo)
  const keyStateRef = useRef({ selectedMovie, isPlaying, showAddProfileModal, showAdminLogin, activeTab, tvMode });
  keyStateRef.current = { selectedMovie, isPlaying, showAddProfileModal, showAdminLogin, activeTab, tvMode };

  useEffect(() => {
    const getScope = (): ParentNode => {
      const modals = document.querySelectorAll("[data-tv-modal]");
      return modals.length ? modals[modals.length - 1] : document;
    };
    const isVisible = (el: HTMLElement) => {
      if (!el.getClientRects || !el.getClientRects().length) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const getFocusable = (): HTMLElement[] => {
      const list = getScope().querySelectorAll(FOCUSABLE_SELECTOR);
      const out: HTMLElement[] = [];
      for (let i = 0; i < list.length; i++) {
        const el = list[i] as HTMLElement;
        if (isVisible(el)) out.push(el);
      }
      return out;
    };
    // Recordamos a dónde movimos el foco nosotros. Si el navegador de la TV
    // (LG, Samsung...) intenta moverlo otra vez por su cuenta, lo devolvemos.
    let ourTarget: HTMLElement | null = null;
    let ourTime = 0;
    let lastArrowTime = 0;
    const onFocusIn = (ev: FocusEvent) => {
      if (!ourTarget) return;
      if (Date.now() - ourTime < 250 && ev.target !== ourTarget && document.contains(ourTarget)) {
        const t = ourTarget;
        try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
      }
    };
    document.addEventListener("focusin", onFocusIn, true);

    const focusEl = (el: HTMLElement) => {
      ourTarget = el;
      ourTime = Date.now();
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      try {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (e) {
        el.scrollIntoView(false);
      }
      // Que no quede tapado por la barra superior fija
      const r = el.getBoundingClientRect();
      const h = window.innerHeight || 720;
      if (r.top < 90) window.scrollBy(0, r.top - 110);
      else if (r.bottom > h - 10) window.scrollBy(0, r.bottom - h + 30);
    };
    const moveFocus = (dir: "up" | "down" | "left" | "right"): boolean => {
      const items = getFocusable();
      if (!items.length) return false;
      const current = document.activeElement as HTMLElement | null;
      if (!current || current === document.body || items.indexOf(current) === -1) {
        focusEl(items[0]);
        return true;
      }
      const c = current.getBoundingClientRect();
      const cx = c.left + c.width / 2;
      const cy = c.top + c.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        if (el === current || el.contains(current) || current.contains(el)) continue;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        let primary = 0;
        let secondary = 0;
        if (dir === "right" || dir === "left") {
          primary = dir === "right" ? x - cx : cx - x;
          if (primary <= 1) continue;
          const overlapV = r.top < c.bottom && r.bottom > c.top;
          secondary = overlapV ? 0 : Math.abs(y - cy) * 3;
        } else {
          primary = dir === "down" ? y - cy : cy - y;
          if (primary <= 1) continue;
          const overlapH = r.left < c.right && r.right > c.left;
          secondary = Math.abs(x - cx) * (overlapH ? 0.3 : 1.5);
        }
        const score = primary + secondary;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best) {
        focusEl(best);
        return true;
      }
      if (dir === "up") window.scrollTo(0, 0);
      return false;
    };

    const BACK_CODES = [27, 461, 10009, 166];
    const onKey = (e: KeyboardEvent) => {
      const code = e.keyCode || (e as any).which || 0;
      const key = e.key || "";
      const target = e.target as HTMLElement;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      const st = keyStateRef.current;
      const tvNav = st.tvMode || document.documentElement.classList.contains("tv-legacy");

      // Tecla ATRÁS del control (Samsung, LG, Android TV, Escape, Retroceso)
      const isBack =
        BACK_CODES.indexOf(code) !== -1 ||
        key === "GoBack" || key === "BrowserBack" || key === "Back" || key === "Escape" ||
        (code === 8 && tvNav && !typing);
      if (isBack) {
        // Primero cierra los avisos pequeños (iniciar sesión, clave...)
        const closers = document.querySelectorAll("[data-close-on-back]");
        if (closers.length) {
          (closers[closers.length - 1] as HTMLElement).click();
          e.preventDefault();
          return;
        }
        if (st.isPlaying) setIsPlaying(false);
        else if (st.selectedMovie) setSelectedMovie(null);
        else if (st.showAdminLogin) setShowAdminLogin(false);
        else if (st.showAddProfileModal) setShowAddProfileModal(false);
        else if (st.activeTab !== "inicio") setActiveTab("inicio");
        else return; // en Inicio deja que la TV salga del navegador
        e.preventDefault();
        return;
      }

      // Teclas multimedia del control
      const video = playerRef.current || videoRef.current;
      if (video) {
        if (code === 415 || code === 19 || code === 10252 || code === 179 || key === "MediaPlayPause" || key === "MediaPlay" || key === "MediaPause") {
          if (video.paused) { const p = video.play(); if (p && p.catch) p.catch(() => {}); } else video.pause();
          e.preventDefault();
          return;
        }
        if (code === 417 || code === 228 || key === "MediaFastForward") {
          try { video.currentTime = video.currentTime + 10; } catch (err) {}
          e.preventDefault();
          return;
        }
        if (code === 412 || code === 227 || key === "MediaRewind") {
          try { video.currentTime = Math.max(0, video.currentTime - 10); } catch (err) {}
          e.preventDefault();
          return;
        }
      }

      // OK / Enter
      if (code === 13 || key === "Enter") {
        if (tag === "video") {
          const v = target as HTMLVideoElement;
          if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
          e.preventDefault();
          return;
        }
        if (!typing && tag !== "button" && tag !== "a" && target && target.getAttribute && target.getAttribute("tabindex") !== null) {
          e.preventDefault();
          target.click();
        }
        return;
      }

      // Flechas
      let dir: "up" | "down" | "left" | "right" | null = null;
      if (code === 37 || key === "ArrowLeft" || key === "Left") dir = "left";
      else if (code === 38 || key === "ArrowUp" || key === "Up") dir = "up";
      else if (code === 39 || key === "ArrowRight" || key === "Right") dir = "right";
      else if (code === 40 || key === "ArrowDown" || key === "Down") dir = "down";
      if (!dir || !tvNav) return;
      if (tag === "select") return;
      if (typing && (dir === "left" || dir === "right")) return;
      if (tag === "video" && (dir === "left" || dir === "right")) {
        const v = target as HTMLVideoElement;
        try { v.currentTime = Math.max(0, v.currentTime + (dir === "right" ? 10 : -10)); } catch (err) {}
        e.preventDefault();
        return;
      }
      // Siempre bloqueamos la navegación propia de la TV para que no se mueva doble
      e.preventDefault();
      // Ignora la tecla repetida/rebotada que algunos controles envían dos veces seguidas
      const now = Date.now();
      if (now - lastArrowTime < 140) return;
      lastArrowTime = now;
      moveFocus(dir);
    };

    // Fase de captura: actuamos antes que el navegador de la TV
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, []);

  // Al abrir la ficha o el reproductor, el foco va al botón principal; al cerrar, vuelve donde estaba
  useEffect(() => {
    if (selectedMovie) {
      if (!lastFocusRef.current) lastFocusRef.current = document.activeElement as HTMLElement;
      const t = setTimeout(() => {
        const modals = document.querySelectorAll("[data-tv-modal]");
        const scope = modals.length ? modals[modals.length - 1] : document;
        const el = scope.querySelector("[data-autofocus]") as HTMLElement | null;
        if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
        const box = document.querySelector("[data-detail-modal]") as HTMLElement | null;
        if (box && !isPlaying) box.scrollTop = 0;
      }, 80);
      return () => clearTimeout(t);
    } else if (lastFocusRef.current) {
      const el = lastFocusRef.current;
      lastFocusRef.current = null;
      setTimeout(() => { try { el.focus(); } catch (e) {} }, 50);
    }
  }, [selectedMovie, isPlaying]);

  // En TV, al entrar a Inicio el foco empieza en "Reproducir"
  useEffect(() => {
    if (!tvMode || activeTab !== "inicio" || selectedMovie) return;
    const t = setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body) {
        const el = document.querySelector("[data-autofocus-home]") as HTMLElement | null;
        if (el) el.focus();
      }
    }, 300);
    return () => clearTimeout(t);
  }, [tvMode, activeTab, selectedMovie]);

  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const currentEpisodeRef = useRef<Episode | null>(null);
  currentEpisodeRef.current = currentEpisode;
  const [nextUp, setNextUp] = useState<{ ep: Episode; secs: number } | null>(null);
  // "intro" | "credits" | "" -> qué botón de saltar se muestra (solo cambia el estado cuando hace falta)
  const [skipMode, setSkipMode] = useState<"" | "intro" | "credits">("");
  const skipModeRef = useRef<"" | "intro" | "credits">("");
  const updateSkip = (t: number, m: Movie | null) => {
    let mode: "" | "intro" | "credits" = "";
    if (m) {
      if (m.introEnd && t >= (m.introStart || 0) && t < m.introEnd - 1) mode = "intro";
      else if (m.creditsStart && t >= m.creditsStart) mode = "credits";
    }
    if (mode !== skipModeRef.current) {
      skipModeRef.current = mode;
      setSkipMode(mode);
    }
  };
  // Reproductor de películas: MP4 directo o HLS (.m3u8), autoplay con respaldo en silencio
  useEffect(() => {
    if (!isPlaying || !selectedMovie) return;
    const video = playerRef.current;
    if (!video) return;
    setPlayerError("");
    const ep = currentEpisodeRef.current;
    const src = ep ? ep.videoUrl : usingBackup && selectedMovie.backupVideoUrl ? selectedMovie.backupVideoUrl : selectedMovie.videoUrl || heroMovie.videoUrl;
    let hls: Hls | null = null;
    const tryPlay = () => {
      const p = video.play();
      if (p && p.catch) {
        p.catch(() => {
          video.muted = true;
          const p2 = video.play();
          if (p2 && p2.catch) p2.catch(() => {});
        });
      }
    };
    const savedAny = progressRef.current.find((p) => String(p.id) === String(selectedMovie.id));
    const saved = savedAny && (!ep || savedAny.episodeId === ep.id) ? savedAny : undefined;
    const onMeta = () => {
      if (saved && saved.time > 5 && (!video.duration || saved.time < video.duration - 60)) {
        try { video.currentTime = saved.time; } catch (e) {}
      }
    };
    video.addEventListener("loadedmetadata", onMeta);
    const movieForProgress = selectedMovie;
    const isHlsSrc = /\.m3u8(\?|$)/i.test(src);
    if (isHlsSrc && !video.canPlayType("application/vnd.apple.mpegurl") && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
      hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
        if (data && data.fatal) setPlayerError("No se pudo cargar este video en este dispositivo.");
      });
    } else {
      video.src = src;
      video.load();
      tryPlay();
    }
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      try { recordProgress(video, movieForProgress, true); } catch (e) {}
      if (hls) hls.destroy();
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch (e) {}
    };
  }, [isPlaying, selectedMovie, usingBackup, currentEpisode]);

  // Barras del reproductor: se ocultan solas a los 4 s y vuelven con cualquier tecla/movimiento
  const [playerUi, setPlayerUi] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoFit, setVideoFit] = useState<"contain" | "cover">("contain");
  const uiTimer = useRef<any>(null);
  const playerUiRef = useRef(true);
  playerUiRef.current = playerUi;
  const wakePlayerUi = () => {
    if (!playerUiRef.current) setPlayerUi(true);
    if (uiTimer.current) clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => {
      const v = playerRef.current;
      // Solo se ocultan si el video está sonando y el foco está en el video (no en un botón)
      if (v && !v.paused && (document.activeElement === v || document.activeElement === document.body)) setPlayerUi(false);
    }, 4000);
  };
  useEffect(() => {
    if (!isPlaying) return;
    wakePlayerUi();
    const onKey = () => wakePlayerUi();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (uiTimer.current) clearTimeout(uiTimer.current);
    };
  }, [isPlaying]);
  useEffect(() => {
    try {
      const f = localStorage.getItem("cineverso_video_fit");
      if (f === "cover" || f === "contain") setVideoFit(f);
    } catch (e) {}
  }, []);
  // Celulares y tablets: controles propios (estilo Netflix) y pantalla completa real
  const [touchUi, setTouchUi] = useState(false);
  useEffect(() => { try { setTouchUi(!tvMode && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (e) {} }, [tvMode]);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const d: any = document;
    const upd = () => setIsFull(!!(d.fullscreenElement || d.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", upd);
    document.addEventListener("webkitfullscreenchange", upd);
    return () => { document.removeEventListener("fullscreenchange", upd); document.removeEventListener("webkitfullscreenchange", upd); };
  }, []);
  const toggleTouchFullscreen = () => {
    const d: any = document;
    const v: any = playerRef.current;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      try { const ex = d.exitFullscreen || d.webkitExitFullscreen; const r = ex && ex.call(d); if (r && r.catch) r.catch(() => {}); } catch (e) {}
      try { (screen as any).orientation.unlock(); } catch (e) {}
      return;
    }
    const box: any = playerShellRef.current;
    const req = box && (box.requestFullscreen || box.webkitRequestFullscreen);
    const native = () => { try { if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen(); } catch (e) {} };
    if (req) {
      try {
        Promise.resolve(req.call(box))
          .then(() => { try { const o: any = (screen as any).orientation; if (o && o.lock) o.lock("landscape").catch(() => {}); } catch (e) {} })
          .catch(native);
      } catch (e) { native(); }
      return;
    }
    // iPhone: Safari solo deja poner en pantalla completa el video (reproductor de Apple)
    native();
  };
  useEffect(() => {
    if (isPlaying) return;
    const d: any = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { try { const ex = d.exitFullscreen || d.webkitExitFullscreen; const r = ex && ex.call(d); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  }, [isPlaying]);
  const toggleVideoFit = () => {
    const next = videoFit === "cover" ? "contain" : "cover";
    setVideoFit(next);
    try { localStorage.setItem("cineverso_video_fit", next); } catch (e) {}
    showToast(next === "cover" ? "Llenando la pantalla (se recortan un poco los bordes)." : "Mostrando la imagen completa.");
  };

  // Portadas en TV: altura exacta 2:3 calculada con el ancho real (algunas TVs calculan mal el CSS)
  useEffect(() => {
    const html = document.documentElement;
    if (!tvMode && !html.classList.contains("tv-legacy")) return;
    let pending = false;
    const fix = () => {
      pending = false;
      const boxes = document.querySelectorAll(".aspect-\\[2\\/3\\]");
      for (let i = 0; i < boxes.length; i++) {
        const el = boxes[i] as HTMLElement;
        const w = el.offsetWidth;
        if (!w) continue;
        const ratio = 1.5;
        el.style.paddingTop = "0px";
        el.style.height = Math.round(w * ratio) + "px";
        el.style.position = "relative";
        const im = el.querySelector("img") as HTMLElement | null;
        if (im) {
          im.style.position = "absolute";
          im.style.top = "0";
          im.style.left = "0";
          im.style.width = "100%";
          im.style.height = "100%";
          im.style.objectFit = "cover";
        }
      }
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      setTimeout(fix, 60);
    };
    fix();
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
    if (mo) mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (mo) mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [tvMode]);

  useEffect(() => {
    const lock = !!selectedMovie;
    document.body.style.overflow = lock ? "hidden" : "";
    document.documentElement.style.overflow = lock ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [selectedMovie]);

  // Cuando aparece el error, el foco va directo a "Reintentar" (funciona con el control remoto)
  useEffect(() => {
    if (!playerError) return;
    const t = setTimeout(() => {
      const modals = document.querySelectorAll("[data-tv-modal]");
      const scope = modals.length ? modals[modals.length - 1] : document;
      const el = scope.querySelector("[data-autofocus]") as HTMLElement | null;
      if (el) { try { el.focus(); } catch (e) {} }
    }, 60);
    return () => clearTimeout(t);
  }, [playerError]);

  // Pregunta al servidor qué pasa con el enlace (bloqueado, borrado, lento...) para mostrar la causa real
  const diagnoseVideo = (url: string, code: number) => {
    const fallback = code === 2
      ? "Se cortó la conexión con el servidor del video. Pulsa Reintentar."
      : "El video no se pudo abrir. Pulsa Reintentar; si vuelve a fallar, el enlace necesita revisarse.";
    if (!url) { setPlayerError("Esta película no tiene enlace de video."); return; }
    fetch("/api/video-check?u=" + encodeURIComponent(url), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d: any) => {
        if (!d) { setPlayerError(fallback); return; }
        const st = d.status || 0;
        const ct = String(d.contentType || "");
        if (st === 401 || st === 403) setPlayerError("El servidor bloqueó este video (error " + st + "). Suele pasar cuando el archivo fue retirado. Hay que reemplazar el enlace desde el panel.");
        else if (st === 404 || st === 410) setPlayerError("Este archivo ya no existe en el servidor (error " + st + "). Hay que reemplazar el enlace desde el panel.");
        else if (st === 429) setPlayerError("El servidor del video está recibiendo demasiadas peticiones. Espera un minuto y pulsa Reintentar.");
        else if (st >= 500) setPlayerError("El servidor del video está caído en este momento (error " + st + "). Inténtalo más tarde.");
        else if (st === 0) setPlayerError("El servidor del video no responde. Revisa tu internet o inténtalo más tarde.");
        else if (ct && !/video|octet-stream|mpegurl|mp2t/i.test(ct)) setPlayerError("El enlace no es un video directo (es una página web). En el panel hay que poner el enlace directo al archivo .mp4.");
        else setPlayerError(fallback);
      });
  };

  // Series: episodio que se está viendo + aviso de "Siguiente episodio"
  const sortedEpisodes = (m: Movie | null) =>
    (m && m.episodes ? m.episodes.slice() : []).sort((a, b) => a.season - b.season || a.number - b.number);
  const nextEpisodeOf = (m: Movie | null, ep: Episode | null) => {
    if (!m || !ep) return null;
    const list = sortedEpisodes(m);
    const i = list.findIndex((x) => x.id === ep.id);
    return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  };
  const playEpisode = (movie: Movie, ep: Episode) => {
    setNextUp(null);
    setUsingBackup(false);
    setPlayerError("");
    setSelectedMovie(movie);
    setCurrentEpisode(ep);
    setIsPlaying(true);
  };
  const startPlayback = (movie: Movie) => {
    if (movie.comingSoon) {
      setSelectedMovie(movie);
      showToast("Estreno: " + fmtRelease(movie.releaseDate) + ". Activa los avisos y te contamos cuando esté disponible.", 6000);
      return;
    }
    const eps = sortedEpisodes(movie);
    if (movie.type === "serie" && eps.length) {
      const saved = progressRef.current.find((p) => String(p.id) === String(movie.id));
      const ep = (saved && saved.episodeId && eps.find((x) => x.id === saved.episodeId)) || eps[0];
      playEpisode(movie, ep);
      return;
    }
    setNextUp(null);
    setCurrentEpisode(null);
    setUsingBackup(false);
    setPlayerError("");
    setSelectedMovie(movie);
    setIsPlaying(true);
  };
  // cuenta regresiva del siguiente episodio
  useEffect(() => {
    if (!nextUp) return;
    if (nextUp.secs <= 0) {
      if (selectedMovie) playEpisode(selectedMovie, nextUp.ep);
      return;
    }
    const t = setTimeout(() => setNextUp((n) => (n ? { ep: n.ep, secs: n.secs - 1 } : n)), 1000);
    return () => clearTimeout(t);
  }, [nextUp]);
  useEffect(() => { if (!isPlaying) { setNextUp(null); } skipModeRef.current = ""; setSkipMode(""); }, [isPlaying, currentEpisode]);
  // Sagas: al llegar a los créditos (o al terminar) se ofrece la siguiente parte
  const [nextSaga, setNextSaga] = useState<{ m: Movie; secs: number } | null>(null);
  const nextSagaDismissed = useRef("");
  useEffect(() => { if (!isPlaying) setNextSaga(null); nextSagaDismissed.current = ""; }, [isPlaying, selectedMovie && selectedMovie.id]);
  const offerNextSaga = (secs: number) => {
    if (!selectedMovie || currentEpisode || nextSaga) return false;
    if (nextSagaDismissed.current === String(selectedMovie.id)) return false;
    const nx = nextInSaga(selectedMovie);
    if (!nx) return false;
    setNextSaga({ m: nx, secs });
    return true;
  };
  useEffect(() => { if (skipMode === "credits" && isPlaying) offerNextSaga(15); }, [skipMode, isPlaying]);
  useEffect(() => {
    if (!nextSaga) return;
    if (nextSaga.secs <= 0) { const m = nextSaga.m; setNextSaga(null); startPlayback(m); return; }
    const t = setTimeout(() => setNextSaga((n) => (n ? { m: n.m, secs: n.secs - 1 } : n)), 1000);
    return () => clearTimeout(t);
  }, [nextSaga]);
  // En TV, cuando aparece "Saltar intro" el control remoto lo puede pulsar con OK al instante
  useEffect(() => {
    if (!skipMode || !tvMode) return;
    const t = setTimeout(() => {
      const b = document.querySelector("[data-skip-btn]") as HTMLElement | null;
      if (b) { try { b.focus(); } catch (e) {} }
    }, 50);
    return () => clearTimeout(t);
  }, [skipMode, tvMode]);

  const requestFullscreenSafe = () => {
    const el: any = playerRef.current || document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (fn) {
      try {
        const r = fn.call(el);
        if (r && r.catch) r.catch(() => {});
      } catch (e) {}
    }
  };

  // TRANSMITIR a TV: AirPlay (iPhone/iPad/Mac) o Chromecast / TV compatible (Chrome, Android)
  const handleCast = () => {
    const v: any = playerRef.current;
    if (!v) return;
    try {
      if (typeof v.webkitShowPlaybackTargetPicker === "function") {
        v.webkitShowPlaybackTargetPicker();
        return;
      }
      if (v.remote && typeof v.remote.prompt === "function") {
        v.remote
          .prompt()
          .then(() => showToast("Conectando con tu TV..."))
          .catch((err: any) => {
            const n = err && err.name;
            if (n === "NotFoundError") showToast("No se encontró ninguna TV o Chromecast. Revisa que estén en la misma red Wi-Fi.", 7000);
            else if (n === "NotSupportedError") showToast("Este video no se puede transmitir desde aquí. En Chrome usa el menú ⋮ → Transmitir.", 7000);
            else if (n !== "AbortError" && n !== "NotAllowedError") showToast("No se pudo transmitir. Inténtalo de nuevo.", 5000);
          });
        return;
      }
    } catch (e) {}
    showToast("Tu navegador no permite transmitir desde la página. En Chrome usa el menú ⋮ → Transmitir; en iPhone usa AirPlay.", 8000);
  };

  // Avisos cuando la TV se conecta o se desconecta
  useEffect(() => {
    if (!isPlaying) return;
    const v: any = playerRef.current;
    if (!v || !v.remote || !v.remote.addEventListener) return;
    const onConnect = () => showToast("Transmitiendo a tu TV.");
    const onDisconnect = () => showToast("Transmisión terminada.");
    v.remote.addEventListener("connect", onConnect);
    v.remote.addEventListener("disconnect", onDisconnect);
    return () => {
      v.remote.removeEventListener("connect", onConnect);
      v.remote.removeEventListener("disconnect", onDisconnect);
    };
  }, [isPlaying]);

  // Compartir: enlace /ver/ID con portada y título para WhatsApp, Facebook, etc.
  const shareMovie = (m: Movie) => { setShareTarget(m); };
  const shareUrlOf = (m: Movie) => window.location.origin + "/ver/" + encodeURIComponent(String(m.id));
  const shareNative = (m: Movie) => {
    const url = shareUrlOf(m);
    const nav: any = navigator;
    if (nav.share) {
      nav.share({ title: m.title + " | Cineverso Mágico", text: "Mira " + m.title + " en Cineverso Mágico 🍿", url }).catch(() => {});
      return;
    }
    try {
      if (nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(url).then(() => showToast("¡Enlace copiado! Pégalo en WhatsApp o Facebook.")).catch(() => showToast(url, 8000));
        return;
      }
    } catch (e) {}
    showToast(url, 8000);
  };

  const copyLinkSafe = () => {
    const url = window.location.origin + window.location.pathname;
    const done = () => {
      setToastMessage("¡Enlace copiado al portapapeles!");
      setTimeout(() => setToastMessage(""), 3000);
    };
    try {
      const nav: any = navigator;
      if (nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(url).then(done).catch(() => {
          setToastMessage(url);
          setTimeout(() => setToastMessage(""), 6000);
        });
        return;
      }
    } catch (e) {}
    setToastMessage(url);
    setTimeout(() => setToastMessage(""), 6000);
  };

  // YouTube: saca el ID de cualquier formato de enlace
  const youtubeId = (url?: string): string => {
    if (!url) return "";
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : "";
  };

  // El tráiler arranca 2 s después de mostrar la portada (no en TVs con navegador antiguo)
  useEffect(() => {
    setHeroTrailerOn(false);
    setHeroTrailerReady(false);
    if (!heroMovie.trailerUrl || activeTab !== "inicio" || selectedMovie || dataSaver) return;
    if (document.documentElement.classList.contains("tv-legacy")) return;
    const t = setTimeout(() => setHeroTrailerOn(true), 2000);
    // YouTube no avisa cuando termina: pasamos a la siguiente a los 45 s
    const t2 = youtubeId(heroMovie.trailerUrl) ? setTimeout(() => { if (!heroMutedRef.current) return; setHeroTrailerOn(false); setHeroIndex((i) => i + 1); }, 47000) : null;
    return () => { clearTimeout(t); if (t2) clearTimeout(t2); };
  }, [heroMovie.id, heroMovie.trailerUrl, activeTab, selectedMovie, dataSaver]);

  // Mientras suena el tráiler, la portada no cambia sola
  useEffect(() => {
    if (heroTrailerOn) setHeroPaused(true);
    else setHeroPaused(false);
  }, [heroTrailerOn]);

  // Tráiler dentro de la ficha (como Netflix): empieza solo, sin sonido
  const [modalTrailerOn, setModalTrailerOn] = useState(false);
  const [modalTrailerReady, setModalTrailerReady] = useState(false);
  const [modalMuted, setModalMuted] = useState(true);
  useEffect(() => {
    setModalTrailerOn(false);
    setModalTrailerReady(false);
    setModalMuted(true);
    if (!selectedMovie || isPlaying || !selectedMovie.trailerUrl || dataSaver) return;
    if (document.documentElement.classList.contains("tv-legacy")) return;
    const t = setTimeout(() => setModalTrailerOn(true), 1200);
    return () => clearTimeout(t);
  }, [selectedMovie && selectedMovie.id, isPlaying, dataSaver]);

  const handleSaveMovie = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert("Acceso denegado. Solo el administrador puede gestionar películas.");
      return;
    }
    if (newMovieType === "serie" && !newMovieVideoUrl && newEpisodes.length) {
      // la serie usa el enlace de su primer episodio como enlace principal
      setNewMovieVideoUrl(newEpisodes[0].videoUrl);
    }
    const mainUrl = newMovieVideoUrl || (newMovieType === "serie" && newEpisodes.length ? newEpisodes[0].videoUrl : "");
    if (!newMovieTitle || (!mainUrl && !newComingSoon)) {
      alert(newMovieType === "serie" ? "Ingresa el título y agrega al menos un episodio." : "Por favor ingresa al menos el título y el enlace del vídeo.");
      return;
    }
    if (/gtv-videos-bucket|BigBuckBunny|ElephantsDream|ForBiggerBlazes/i.test(mainUrl)) {
      if (!confirm("Ese enlace es un VIDEO DE EJEMPLO de Google, no tu película. ¿Quieres guardarlo igual?")) return;
    }

    // ¿Esta película ya estaba en "Próximos estrenos"? (mismo título) -> se estrena esa ficha, no se duplica
    const norm = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    let targetId: any = editingMovieId;
    if (!targetId && !newComingSoon) {
      const twin = customMovies.find((x) => x.comingSoon && norm(x.title) === norm(newMovieTitle));
      if (twin && confirm("\"" + twin.title + "\" está en Próximos estrenos.\n\n¿Es su estreno? Se quitará de Próximos estrenos (sin duplicarse) y aparecerá con las demás películas.")) {
        targetId = twin.id;
      }
    }
    // Si un próximo estreno ya tiene video, preguntar si se estrena ahora
    let comingFinal = newComingSoon;
    if (targetId && newComingSoon && mainUrl) {
      const prev = customMovies.find((x) => String(x.id) === String(targetId));
      if (prev && prev.comingSoon && confirm("\"" + newMovieTitle + "\" ya tiene video.\n\n¿Se estrena ahora? Pulsa Aceptar para quitarla de Próximos estrenos y avisar a todos, o Cancelar para dejarla como próximo estreno.")) {
        comingFinal = false;
      }
    }

    if (targetId) {
      const m = customMovies.find((x) => String(x.id) === String(targetId));
      if (m) {
        const { backupVideoUrl: _oldBackup, ...rest } = m;
        const updated: Movie = {
          ...rest,
          saga: newMovieSaga.trim() || undefined,
          sagaOrder: parseInt(newMovieSagaOrder, 10) || undefined,
          title: newMovieTitle,
          tag: newMovieCategory,
          type: newMovieType,
          desc: newMovieDesc || m.desc,
          bgImage: newMovieImage || m.bgImage,
          img: newMovieImage || m.img,
          videoUrl: mainUrl.trim(),
          year: newMovieYear.trim() || m.year,
          duration: newMovieDuration.trim() || undefined,
          ageRating: newMovieAge || undefined,
          director: newMovieDirector.trim() || undefined,
          cast: newMovieCast.trim() || undefined,
          trailerUrl: newMovieTrailer.trim() || undefined,
          episodes: newMovieType === "serie" ? newEpisodes : undefined,
          // al estrenarse cuenta como novedad de hoy (sale primero en la campanita)
          addedAt: m.comingSoon && !comingFinal ? Date.now() : m.addedAt || movieTime(m) || undefined,
          introStart: parseClock(newIntroStart),
          introEnd: parseClock(newIntroEnd),
          creditsStart: parseClock(newCreditsStart),
          comingSoon: comingFinal || undefined,
          releaseDate: comingFinal ? newReleaseDate || undefined : undefined,
          ...(tmdbExtra ? {
            rating: tmdbExtra.rating || m.rating,
            production: tmdbExtra.production || m.production,
            originalLanguage: tmdbExtra.originalLanguage || m.originalLanguage,
            backdrop: tmdbExtra.backdrop || m.backdrop,
            tmdbId: tmdbExtra.tmdbId || m.tmdbId,
            sagaId: newMovieSaga.trim() ? tmdbExtra.sagaId || m.sagaId : undefined,
          } : {}),
          genres: tmdbExtra && tmdbExtra.genres && tmdbExtra.genres.length
            ? [newMovieCategory].concat(tmdbExtra.genres.filter((g) => g !== newMovieCategory))
            : m.genres && m.genres.length ? (m.genres.indexOf(newMovieCategory) === -1 ? [newMovieCategory].concat(m.genres.filter((g) => g !== m.tag)) : m.genres) : [newMovieCategory]
        };
        saveChange({ type: "upsert", movie: updated }, m.comingSoon && !comingFinal ? "¡Estrenada! Ya aparece con las demás películas." : "¡Contenido actualizado!");
        if (!updated.comingSoon) fulfillRequestsFor(updated);
        if (notifyAll) {
          if (m.comingSoon && !comingFinal) sendPush({ title: "¡Ya disponible! 🍿", body: updated.title + " ya se puede ver en Cineverso Mágico.", image: updated.backdrop || updated.bgImage, url: "/ver/" + updated.id, tag: "m-" + updated.id }, updated);
          else if (!m.comingSoon && comingFinal) sendPush({ title: "Próximo estreno 🎬", body: updated.title + " llega el " + fmtRelease(updated.releaseDate) + ".", image: updated.backdrop || updated.bgImage, url: "/ver/" + updated.id, tag: "m-" + updated.id }, updated);
        }
      }
      setEditingMovieId(null);
    } else {
      const createdMovie: Movie = {
        id: Date.now(),
        saga: newMovieSaga.trim() || undefined,
        sagaOrder: parseInt(newMovieSagaOrder, 10) || undefined,
        title: newMovieTitle,
        rating: "8.5",
        year: newMovieYear.trim() || String(new Date().getFullYear()),
        tag: newMovieCategory,
        type: newMovieType,
        desc: newMovieDesc || "Contenido añadido desde el panel de administración.",
        bgImage: newMovieImage || "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
        img: newMovieImage || "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
        videoUrl: mainUrl.trim(),
        duration: newMovieDuration.trim() || undefined,
        genres: tmdbExtra && tmdbExtra.genres && tmdbExtra.genres.length ? [newMovieCategory].concat(tmdbExtra.genres.filter((g) => g !== newMovieCategory)) : [newMovieCategory],
        cast: newMovieCast.trim() || undefined,
        director: newMovieDirector.trim() || undefined,
        ageRating: newMovieAge || undefined,
        trailerUrl: newMovieTrailer.trim() || undefined,
        episodes: newMovieType === "serie" ? newEpisodes : undefined,
        addedAt: Date.now(),
        introStart: parseClock(newIntroStart),
        introEnd: parseClock(newIntroEnd),
        creditsStart: parseClock(newCreditsStart),
        comingSoon: newComingSoon || undefined,
        releaseDate: newComingSoon ? newReleaseDate || undefined : undefined,
        originalLanguage: (tmdbExtra && tmdbExtra.originalLanguage) || "ES",
        ...(tmdbExtra ? { rating: tmdbExtra.rating || "8.0", production: tmdbExtra.production, backdrop: tmdbExtra.backdrop, tmdbId: tmdbExtra.tmdbId, sagaId: newMovieSaga.trim() ? tmdbExtra.sagaId : undefined } : {}),
      };

      saveChange({ type: "upsert", movie: createdMovie }, "¡Película agregada!");
      if (!createdMovie.comingSoon) fulfillRequestsFor(createdMovie);
      if (notifyAll) {
        const img = createdMovie.backdrop || createdMovie.bgImage;
        if (createdMovie.comingSoon) sendPush({ title: "Próximo estreno 🎬", body: createdMovie.title + " llega el " + fmtRelease(createdMovie.releaseDate) + ".", image: img, url: "/ver/" + createdMovie.id, tag: "m-" + createdMovie.id }, createdMovie);
        else sendPush({ title: createdMovie.type === "serie" ? "Nueva serie 🍿" : "Nueva película 🍿", body: createdMovie.title + " ya está disponible en Cineverso Mágico.", image: img, url: "/ver/" + createdMovie.id, tag: "m-" + createdMovie.id }, createdMovie);
      }
    }

    resetMovieForm();
  };

  const resetMovieForm = () => {
    setNewMovieSaga("");
    setNewMovieSagaOrder("");
    setNewMovieTitle("");
    setNewMovieDesc("");
    setNewMovieImage("");
    setNewMovieVideoUrl("");
    setNewMovieYear("");
    setNewMovieDuration("");
    setNewMovieAge("");
    setNewMovieDirector("");
    setNewMovieCast("");
    setNewMovieTrailer("");
    setNewEpisodes([]);
    setNewIntroStart("");
    setNewIntroEnd("");
    setNewCreditsStart("");
    setNewComingSoon(false);
    setNewReleaseDate("");
    setTmdbExtra(null);
    setTmdbResults(null);
    setEpSeason("1");
    setEpNumber("1");
    setEpTitle("");
    setEpUrl("");
  };

  const addEpisode = () => {
    const season = parseInt(epSeason, 10) || 1, number = parseInt(epNumber, 10) || 1;
    if (!epUrl.trim()) { showToast("Pega el enlace del episodio."); return; }
    const ep: Episode = { id: "s" + season + "e" + number + "-" + Date.now(), season, number, title: epTitle.trim() || "Episodio " + number, videoUrl: epUrl.trim(), addedAt: Date.now() };
    setNewEpisodes((prev) =>
      prev.filter((x) => !(x.season === season && x.number === number)).concat([ep]).sort((a, b) => a.season - b.season || a.number - b.number)
    );
    setEpNumber(String(number + 1));
    setEpTitle("");
    setEpUrl("");
  };

  // "1:25" -> 85 segundos ; "1:02:10" -> 3730
  const parseClock = (t: string): number | undefined => {
    const v = (t || "").trim();
    if (!v) return undefined;
    const parts = v.split(":").map((x) => parseInt(x, 10));
    if (parts.some((x) => isNaN(x) || x < 0)) return undefined;
    return parts.reduce((acc, x) => acc * 60 + x, 0);
  };
  const fmtClock = (n?: number) => {
    if (n === undefined || n === null || !isFinite(n)) return "";
    const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = Math.floor(n % 60);
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(sec).padStart(2, "0");
  };

  // ---------- Autocompletar con TMDB ----------
  const tmdbErrorMsg = (status: number, d: any) =>
    status === 503 || (d && d.error === "no_key")
      ? "Falta la clave de TMDB. Agrega TMDB_API_KEY en Vercel → Settings → Environment Variables y luego Redeploy."
      : status === 401 || (d && d.error === "bad_key")
      ? "La clave de TMDB no es válida. Revisa TMDB_API_KEY en Vercel."
      : "No se pudo conectar con TMDB. Inténtalo de nuevo.";
  const searchTmdb = () => {
    const q = newMovieTitle.trim();
    if (!q) { showToast("Escribe primero el título."); return; }
    setTmdbBusy(true);
    setTmdbResults(null);
    fetch("/api/tmdb?type=" + (newMovieType === "serie" ? "tv" : "movie") + "&q=" + encodeURIComponent(q), { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ status: r.status, d })))
      .then(({ status, d }) => {
        setTmdbBusy(false);
        if (status !== 200) { showToast(tmdbErrorMsg(status, d), 8000); return; }
        if (!d.results || !d.results.length) { showToast("No encontré resultados. Prueba con el título original en inglés."); return; }
        setTmdbResults(d.results);
      })
      .catch(() => { setTmdbBusy(false); showToast("No se pudo conectar con TMDB."); });
  };
  const applyTmdb = (id: number) => {
    setTmdbBusy(true);
    fetch("/api/tmdb?type=" + (newMovieType === "serie" ? "tv" : "movie") + "&id=" + id, { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ status: r.status, d })))
      .then(({ status, d }) => {
        setTmdbBusy(false);
        if (status !== 200) { showToast(tmdbErrorMsg(status, d), 8000); return; }
        setTmdbResults(null);
        if (d.title) setNewMovieTitle(d.title);
        if (d.desc) setNewMovieDesc(d.desc);
        if (d.year) setNewMovieYear(d.year);
        if (d.duration) setNewMovieDuration(d.duration);
        if (d.ageRating) setNewMovieAge(d.ageRating);
        if (d.director) setNewMovieDirector(d.director);
        if (d.cast) setNewMovieCast(d.cast);
        if (d.trailerUrl) setNewMovieTrailer(d.trailerUrl);
        if (d.poster) setNewMovieImage(d.poster);
        const gs: string[] = Array.isArray(d.genres) ? d.genres : [];
        const main = gs.find((g) => genresList.indexOf(g) !== -1);
        if (main) setNewMovieCategory(main);
        setTmdbExtra({ genres: gs, rating: d.rating, production: d.production, originalLanguage: d.originalLanguage, backdrop: d.backdrop, tmdbId: d.tmdbId || undefined, sagaId: d.sagaId || undefined });
        // Saga y número automáticos (si la película es parte de una colección en TMDB)
        if (d.saga) {
          setNewMovieSaga(sagaNameFor(d.saga, d.sagaId));
          if (d.sagaOrder) setNewMovieSagaOrder(String(d.sagaOrder));
        }
        showToast(d.saga ? "✔ Ficha completada. Saga «" + sagaNameFor(d.saga, d.sagaId) + "» · parte " + (d.sagaOrder || "?") + (d.sagaTotal ? " de " + d.sagaTotal : "") + ". Revisa y pulsa Guardar." : "✔ Ficha completada. Revisa los datos y pulsa Guardar.", 6000);
      })
      .catch(() => { setTmdbBusy(false); showToast("No se pudo conectar con TMDB."); });
  };

  // Lee la duración real del archivo de video (sin descargarlo entero)
  const detectDuration = () => {
    const url = newMovieVideoUrl.trim();
    if (!url) { showToast("Primero pega el enlace del video."); return; }
    setDetectingDuration(true);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let done = false;
    const finish = (msg?: string) => {
      if (done) return;
      done = true;
      setDetectingDuration(false);
      try { v.removeAttribute("src"); v.load(); } catch (e) {}
      if (msg) showToast(msg, 5000);
    };
    v.onloadedmetadata = () => {
      const secs = Math.round(v.duration || 0);
      if (!secs || !isFinite(secs)) { finish("No se pudo leer la duración de ese video."); return; }
      const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
      setNewMovieDuration(h ? h + " h " + m + " min" : m + " min");
      finish("Duración detectada.");
    };
    v.onerror = () => finish("No se pudo abrir el video para leer su duración.");
    setTimeout(() => finish("El video tardó demasiado en responder."), 20000);
    v.src = url;
  };

  const handleEditClick = (movie: Movie) => {
    setEditingMovieId(movie.id);
    setNewMovieTitle(movie.title);
    setNewMovieDesc(movie.desc);
    setNewMovieCategory(movie.tag || "Acción");
    setNewMovieType(movie.type || "pelicula");
    setNewMovieImage(movie.bgImage || "");
    setNewMovieVideoUrl(movie.videoUrl || "");
    setNewMovieYear(movie.year || "");
    setNewMovieDuration(movie.duration || "");
    setNewMovieAge(movie.ageRating || "");
    setNewMovieDirector(movie.director || "");
    setNewMovieCast(movie.cast || "");
    setNewMovieTrailer(movie.trailerUrl || "");
    setNewMovieSaga(movie.saga || "");
    setNewMovieSagaOrder(movie.sagaOrder ? String(movie.sagaOrder) : "");
    const eps = movie.episodes || [];
    setNewEpisodes(eps);
    setNewComingSoon(!!movie.comingSoon);
    setNewReleaseDate(movie.releaseDate || "");
    setNewIntroStart(fmtClock(movie.introStart));
    setNewIntroEnd(fmtClock(movie.introEnd));
    setNewCreditsStart(fmtClock(movie.creditsStart));
    setTmdbExtra(null);
    setTmdbResults(null);
    const last = eps[eps.length - 1];
    setEpSeason(String(last ? last.season : 1));
    setEpNumber(String(last ? last.number + 1 : 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteMovie = (id: number | string) => {
    if (confirm("¿Estás seguro de eliminar este contenido del catálogo?")) {
      saveChange({ type: "delete", id }, "Contenido eliminado.");
      if (editingMovieId === id) {
        setEditingMovieId(null);
        resetMovieForm();
      }
    }
  };

  // ================================================================
  // CUENTAS REALES (/api/account + Supabase)
  // Invitado: nada se guarda. Con sesión: perfiles, Mi Lista y
  // "Continuar viendo" se guardan en el servidor para todos sus dispositivos.
  // ================================================================
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [accountChecked, setAccountChecked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notifSeen, setNotifSeen] = useState(0);
  const isAdminRef = useRef(false);
  isAdminRef.current = isAdmin;
  const progressRef = useRef<ProgressItem[]>([]);
  progressRef.current = continueWatchingList;

  const postAccount = (payload: any) =>
    fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    }).then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, status: r.status, d })));

  const applyAccountData = (data: any, userEmail: string) => {
    let loaded: Profile[] =
      data && Array.isArray(data.profiles)
        ? data.profiles.filter(
            (p: any) => p && typeof p.id === "string" && typeof p.name === "string" &&
              p.id !== "admin-rey" && p.id !== "invitado"
          )
        : [];
    // Administrador: su perfil es "Rey"; no se crea (ni se muestra) el perfil automático con el nombre del correo
    const autoName = (() => {
      const b0 = (userEmail.split("@")[0] || "").replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "");
      return b0 ? b0.charAt(0).toUpperCase() + b0.slice(1, 20) : "";
    })();
    if (!loaded.length) {
      const base = (userEmail.split("@")[0] || "Perfil").replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "");
      const name = base ? base.charAt(0).toUpperCase() + base.slice(1, 20) : "Perfil 1";
      loaded = [{ id: "p-" + Date.now(), name, avatar: myAvatars[0].file, isKid: false, auto: true } as any];
    }
    // Perfil automático que quedó con el nombre del correo: se marca como tal para poder renombrarlo
    if (loaded.length === 1 && autoName && loaded[0].name === autoName) loaded = [{ ...(loaded[0] as any), auto: true }];
    // Misma cuenta = mismos perfiles en TODOS los dispositivos (también en el del administrador)
    if (isAdminRef.current) loaded = adminNameProfiles(loaded);
    const active = loaded.find((p) => data && p.id === data.activeProfileId) || loaded[0];
    loggedInRef.current = true;
    setProfiles(loaded);
    setActiveProfile(active);
    setMyList(data && Array.isArray(data.myList) ? data.myList : []);
    setRatings(data && data.ratings && typeof data.ratings === "object" ? data.ratings : {});
    setNotifSeen(data && typeof data.notifSeen === "number" ? data.notifSeen : 0);
    setWatchHistory(data && Array.isArray(data.history) ? data.history.filter((h: any) => h && h.id !== undefined && typeof h.at === "number").map((h: any) => ({ id: String(h.id), at: h.at, pct: Number(h.pct) || 0, mins: Number(h.mins) || 0 })) : []);
    setFollows(data && data.follows && typeof data.follows === "object" ? { sagas: Array.isArray(data.follows.sagas) ? data.follows.sagas : [], genres: Array.isArray(data.follows.genres) ? data.follows.genres : [] } : { sagas: [], genres: [] });
    setSeasonBadges(data && Array.isArray(data.seasonBadges) ? data.seasonBadges : []);
    setChallengesDone(data && Array.isArray(data.challengesDone) ? data.challengesDone : []);
    setContinueWatchingList(
      data && Array.isArray(data.progress)
        ? data.progress.filter((x: any) => x && x.id !== undefined && typeof x.time === "number" && typeof x.duration === "number")
        : []
    );
  };

  // ¿Ya había una sesión iniciada en este dispositivo?
  useEffect(() => {
    fetch("/api/account", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d: any) => {
        if (d && d.user) {
          setAccountUser(d.user);
          setIsGuest(false);
          setEmail(d.user.email || "");
          applyAccountData(d.data, d.user.email || "");
          setAccountLoaded(true);
        }
        setAccountChecked(true);
      });
  }, []);

  // Guarda los datos de la cuenta en el servidor (solo con sesión iniciada)
  useEffect(() => {
    if (!accountUser || !accountLoaded) return;
    const t = setTimeout(() => {
      const data = {
        profiles: profiles.filter((p) => p.id !== "admin-rey" && p.id !== "invitado"),
        activeProfileId: activeProfile.id === "admin-rey" ? "" : activeProfile.id,
        myList,
        progress: continueWatchingList.slice(0, 50),
        ratings,
        notifSeen,
        history: watchHistory.slice(0, 400),
        follows,
        seasonBadges,
        challengesDone,
      };
      fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ data }),
      })
        .then((r) => {
          if (r.status === 401) {
            loggedInRef.current = false;
            setAccountUser(null);
            setIsGuest(true);
            setAccountLoaded(false);
            showToast("Tu sesión venció. Vuelve a iniciar sesión para seguir guardando.", 6000);
          }
        })
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [profiles, activeProfile, myList, continueWatchingList, ratings, notifSeen, watchHistory, follows, seasonBadges, challengesDone, accountUser, accountLoaded]);

  const onLoggedIn = (d: any, isNew?: boolean, isReset?: boolean) => {
    setAccountUser(d.user);
    setIsGuest(false);
    setRegisterStep("form");
    setPassword("");
    setInputCode("");
    setAuthError("");
    applyAccountData(d.data, d.user.email || email);
    setAccountLoaded(true);
    // Sale de la pantalla de cuenta y entra a la web con su perfil (ya no como Invitado)
    resetMobileZoom();
    setShowPass(false);
    setSelectedMovie(null);
    setActiveTab("inicio");
    try { window.scrollTo(0, 0); } catch (e) {}
    if (isReset) {
      // Solo cambió la contraseña: sigue con la misma cuenta y el mismo perfil de antes
      try { sessionStorage.setItem("cv_who", "1"); } catch (e) {}
      showToast("¡Contraseña cambiada! Entraste con tu misma cuenta. 🔐", 5000);
    } else if (isNew) {
      // Cuenta recién creada: entra directo con su perfil
      try { sessionStorage.setItem("cv_who", "1"); } catch (e) {}
      const base = ((d.user.email || email).split("@")[0] || "").replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "");
      showToast("¡Bienvenido" + (base ? ", " + base.charAt(0).toUpperCase() + base.slice(1, 20) : "") + "! Tu cuenta está lista. 🍿", 5000);
    } else {
      // Cuenta existente: pregunta "¿Quién está viendo?"
      try { sessionStorage.removeItem("cv_who"); } catch (e) {}
      showToast("¡Sesión iniciada! Tus datos se guardarán en todos tus dispositivos.");
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    setAuthError("");
    setAuthBusy(true);
    postAccount({ action: authMode, email, password })
      .then(({ ok, status, d }) => {
        setAuthBusy(false);
        if (ok && d.user) { onLoggedIn(d); return; }
        if (ok && d.pending) {
          setRegisterStep("verify");
          showToast("Te enviamos un código a " + email, 6000);
          return;
        }
        if (status === 403 && d.needsVerification) {
          setRegisterStep("verify");
          setAuthError(d.error || "Verifica tu correo.");
          return;
        }
        setAuthError((d && d.error) || "No se pudo conectar. Inténtalo de nuevo.");
      })
      .catch(() => {
        setAuthBusy(false);
        setAuthError("Sin conexión con el servidor.");
      });
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    setAuthError("");
    setAuthBusy(true);
    postAccount({ action: "verify", email, code: inputCode })
      .then(({ ok, d }) => {
        setAuthBusy(false);
        if (ok && d.user) onLoggedIn(d, !(d.data && Array.isArray(d.data.profiles) && d.data.profiles.length));
        else setAuthError((d && d.error) || "Código incorrecto.");
      })
      .catch(() => {
        setAuthBusy(false);
        setAuthError("Sin conexión con el servidor.");
      });
  };

  const handleResendCode = () => {
    if (authBusy) return;
    setAuthBusy(true);
    postAccount({ action: "resend", email })
      .then(({ ok, d }) => {
        setAuthBusy(false);
        if (ok) showToast("Código reenviado a " + email);
        else setAuthError((d && d.error) || "No se pudo reenviar el código.");
      })
      .catch(() => {
        setAuthBusy(false);
        setAuthError("Sin conexión con el servidor.");
      });
  };

  // Quita el zoom que dejó el teclado del celular y vuelve a la vista normal
  const resetMobileZoom = () => {
    try { (document.activeElement as HTMLElement | null)?.blur(); } catch (e) {}
    try {
      const m = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      if (!m) return;
      const orig = m.getAttribute("content") || "width=device-width, initial-scale=1, viewport-fit=cover";
      m.setAttribute("content", orig.replace(/,?\s*maximum-scale=[^,]*/g, "") + ", maximum-scale=1");
      setTimeout(() => m.setAttribute("content", orig), 400);
    } catch (e) {}
  };

  // ---------- Olvidé mi contraseña ----------
  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    setAuthError("");
    setAuthBusy(true);
    postAccount({ action: "recover", email })
      .then(({ ok, d }) => {
        setAuthBusy(false);
        if (ok) {
          setRegisterStep("reset");
          setInputCode("");
          setNewPass("");
          showToast("Si ese correo tiene cuenta, te enviamos un código para cambiar la contraseña.", 7000);
        } else setAuthError((d && d.error) || "No se pudo enviar el correo.");
      })
      .catch(() => { setAuthBusy(false); setAuthError("Sin conexión con el servidor."); });
  };
  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    if (newPass.length < 6) { setAuthError("La contraseña debe tener al menos 6 caracteres."); return; }
    setAuthError("");
    setAuthBusy(true);
    const payload = registerStep === "resetlink" && resetTokens
      ? { action: "reset_link", accessToken: resetTokens.at, refreshToken: resetTokens.rt, password: newPass }
      : { action: "reset", email, code: inputCode, password: newPass };
    postAccount(payload)
      .then(({ ok, d }) => {
        setAuthBusy(false);
        if (ok && d.user) {
          setNewPass("");
          setResetTokens(null);
          onLoggedIn(d, false, true);
        } else setAuthError((d && d.error) || "No se pudo cambiar la contraseña.");
      })
      .catch(() => { setAuthBusy(false); setAuthError("Sin conexión con el servidor."); });
  };
  // Si llega desde el enlace del correo de recuperación (#access_token=...&type=recovery)
  useEffect(() => {
    try {
      const h = window.location.hash.replace(/^#/, "");
      if (!/type=recovery/.test(h)) return;
      const q = new URLSearchParams(h);
      const at = q.get("access_token") || "";
      if (!at) return;
      setResetTokens({ at, rt: q.get("refresh_token") || "" });
      setRegisterStep("resetlink");
      setActiveTab("cuenta");
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (e) {}
  }, []);

  const handleLogout = () => {
    const reset = () => {
      loggedInRef.current = false;
      setAccountUser(null);
      setAccountLoaded(false);
      setIsGuest(true);
      setRegisterStep("form");
      setPassword("");
      setAuthError("");
      setProfiles(isAdminRef.current ? [reyProfile, guestProfile] : [guestProfile]);
      setActiveProfile(isAdminRef.current ? reyProfile : guestProfile);
      setMyList([]);
      setContinueWatchingList([]);
      setRatings({});
      setNotifSeen(0);
      setWatchHistory([]);
      setFollows({ sagas: [], genres: [] });
      setSeasonBadges([]);
      setChallengesDone([]);
      showToast("Sesión cerrada.");
    };
    postAccount({ action: "logout" }).then(reset, reset);
  };

  // ---------- Estadísticas anónimas ----------
  const sendStat = (payload: any) => {
    if (isAdminRef.current) return; // tus propias visitas no cuentan
    try {
      const body = JSON.stringify(payload);
      const nav: any = navigator;
      if (nav.sendBeacon && nav.sendBeacon("/api/stats", new Blob([body], { type: "text/plain" }))) return;
      fetch("/api/stats", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch (e) {}
  };
  const deviceKind = () => {
    try {
      if (tvMode || isSmartTvBrowser() || document.documentElement.classList.contains("tv-legacy")) return "tv";
      if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return "mobile";
    } catch (e) {}
    return "desktop";
  };
  const accountUserRef = useRef<AccountUser | null>(null);
  accountUserRef.current = accountUser;
  useEffect(() => {
    let sent = false;
    try { sent = sessionStorage.getItem("cv_visit") === "1"; sessionStorage.setItem("cv_visit", "1"); } catch (e) {}
    if (sent) return;
    const t = setTimeout(() => {
      let vid = "";
      try {
        vid = localStorage.getItem("cv_vid") || "";
        if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("cv_vid", vid); }
      } catch (e) {}
      sendStat({ type: "visit", device: deviceKind(), vid, logged: !!accountUserRef.current });
    }, 4000);
    return () => clearTimeout(t);
  }, []);
  // Seguimiento de cada reproducción: inicio, segundos vistos y hasta qué % llegó
  const watchRef = useRef<{ id: string; title: string; maxPct: number; secs: number; lastT: number; played: boolean } | null>(null);
  const flushWatch = () => {
    const w = watchRef.current;
    watchRef.current = null;
    if (w && w.played && w.secs >= 10) sendStat({ type: "watch", movieId: w.id, title: w.title, pct: Math.round(w.maxPct), secs: Math.round(w.secs) });
    if (w && w.played && w.secs >= 10) addHistory(w.id, w.maxPct, w.secs);
  };
  const trackTime = (video: HTMLVideoElement, m: Movie) => {
    const w = watchRef.current;
    if (!w || w.id !== String(m.id)) return;
    const t = video.currentTime || 0;
    const d = t - w.lastT;
    if (d > 0 && d < 5) w.secs += d;
    w.lastT = t;
    if (video.duration && isFinite(video.duration)) w.maxPct = Math.max(w.maxPct, (t / video.duration) * 100);
  };
  const trackPlaying = (m: Movie) => {
    const w = watchRef.current;
    if (w && w.id === String(m.id)) {
      if (!w.played) { w.played = true; sendStat({ type: "play", movieId: String(m.id), title: m.title }); }
      return;
    }
    flushWatch();
    watchRef.current = { id: String(m.id), title: m.title, maxPct: 0, secs: 0, lastT: 0, played: true };
    sendStat({ type: "play", movieId: String(m.id), title: m.title });
  };
  useEffect(() => { if (!isPlaying) flushWatch(); }, [isPlaying]);
  useEffect(() => {
    const onHide = () => flushWatch();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // ---------- Avisos push ----------
  const [pushState, setPushState] = useState<"unsupported" | "ios-install" | "default" | "denied" | "subscribed">("default");
  useEffect(() => {
    try {
      const w = window as any;
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const standalone = (w.matchMedia && w.matchMedia("(display-mode: standalone)").matches) || (navigator as any).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in w) || !("Notification" in w)) {
        setPushState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") { setPushState("denied"); return; }
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription().then((sub) => ({ reg, sub })))
        .then(({ reg, sub }) => {
          if (!sub) return;
          setPushState("subscribed");
          // Vuelve a registrar este dispositivo en el servidor en cada visita (por si se perdió),
          // y si las claves del servidor cambiaron, se suscribe de nuevo solo.
          return fetch("/api/push", { cache: "no-store" })
            .then((r) => r.json())
            .then((d: any) => {
              if (!d || !d.publicKey) return;
              let same = true;
              try {
                const cur = sub.options && sub.options.applicationServerKey;
                if (cur) {
                  const a = new Uint8Array(cur as ArrayBuffer), bk = b64ToBytes(d.publicKey);
                  same = a.length === bk.length && a.every((v, i) => v === bk[i]);
                }
              } catch (e) {}
              const ready = same
                ? Promise.resolve(sub)
                : sub.unsubscribe().then(() => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(d.publicKey) }));
              return ready.then((s2: any) =>
                fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", sub: s2.toJSON ? s2.toJSON() : s2 }) })
              );
            });
        })
        .catch(() => {});
    } catch (e) { setPushState("unsupported"); }
  }, []);
  // Revisa (en el servidor) si algún próximo estreno ya llegó a su fecha para avisar a todos
  useEffect(() => {
    const t = setTimeout(() => {
      try { fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto" }), keepalive: true }).catch(() => {}); } catch (e) {}
    }, 6000);
    return () => clearTimeout(t);
  }, []);
  const b64ToBytes = (b64: string) => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };
  const enablePush = () => {
    if (pushState === "subscribed") { showToast("Los avisos ya están activados en este dispositivo ✔"); return; }
    if (pushState === "ios-install") { showToast("En iPhone primero instala la app: botón Compartir → \"Agregar a pantalla de inicio\". Luego ábrela desde el ícono y activa los avisos.", 9000); return; }
    if (pushState === "unsupported") { showToast("Este navegador no permite avisos. Prueba con Chrome o Edge.", 6000); return; }
    if (pushState === "denied") { showToast("Bloqueaste los avisos. Actívalos en el candado 🔒 junto a la dirección de la página.", 8000); return; }
    Notification.requestPermission()
      .then((perm) => {
        if (perm !== "granted") { setPushState(perm === "denied" ? "denied" : "default"); throw new Error("no"); }
        return Promise.all([
          navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready),
          fetch("/api/push", { cache: "no-store" }).then((r) => r.json()),
        ]);
      })
      .then(([reg, d]: any) =>
        reg.pushManager.getSubscription().then((old: any) => old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(d.publicKey) }))
      )
      .then((sub: any) =>
        fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", sub: sub.toJSON ? sub.toJSON() : sub }) })
      )
      .then((r: any) => {
        if (r && r.ok) { setPushState("subscribed"); showToast("🔔 ¡Listo! Te avisaremos de estrenos y películas nuevas."); }
        else showToast("No se pudieron activar los avisos. Inténtalo de nuevo.");
      })
      .catch((e: any) => { if (!e || e.message !== "no") showToast("No se pudieron activar los avisos en este dispositivo."); });
  };
  // ---------- Bienvenida (solo la primera vez, para quien no tiene sesión) ----------
  const [onboard, setOnboard] = useState(false);
  const [onboardStep, setOnboardStep] = useState(0);
  const onboardTouch = useRef(0);
  useEffect(() => {
    if (!accountChecked || showSplash || accountUser || isAdmin) return;
    try {
      if (localStorage.getItem("cv_onboard_done")) return;
      const q = window.location.search;
      if (/[?&](ver|admin|sala|lista)\b/.test(q)) return;
    } catch (e) { return; }
    setOnboardStep(0);
    setOnboard(true);
  }, [accountChecked, showSplash, accountUser, isAdmin]);
  const closeOnboard = (goLogin: boolean) => {
    try { localStorage.setItem("cv_onboard_done", "1"); } catch (e) {}
    setOnboard(false);
    if (goLogin) {
      setActiveTab("cuenta");
      setAuthMode("register");
      try { window.scrollTo(0, 0); } catch (e) {}
    }
  };
  useEffect(() => {
    if (!onboard) return;
    const t = setTimeout(() => {
      const el = document.querySelector("[data-onboard] [data-autofocus]") as HTMLElement | null;
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
    }, 120);
    return () => clearTimeout(t);
  }, [onboard, onboardStep]);

  // ---------- Comunidad: reseñas con estrellas ----------
  const [commStars, setCommStars] = useState<Record<string, { avg: number; count: number }>>({});
  const [commTop, setCommTop] = useState<string[]>([]);
  const loadCommTop = () => {
    fetch("/api/community?top=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: any) => {
      if (!d) return;
      if (d.stars) setCommStars(d.stars);
      if (Array.isArray(d.top)) setCommTop(d.top.map((x: any) => String(x.id)));
    }).catch(() => {});
  };
  useEffect(() => { loadCommTop(); }, []);
  const [revData, setRevData] = useState<{ avg: number; count: number; reviews: { name: string; avatar: string; badge: string; stars: number; text: string; at: number; mine: boolean; reacts?: Record<string, number>; myReact?: string }[] } | null>(null);
  const [revStars, setRevStars] = useState(0);
  const [revHover, setRevHover] = useState(0);
  const [revText, setRevText] = useState("");
  const [revBusy, setRevBusy] = useState(false);
  const loadReviews = (id: string) => {
    fetch("/api/community?movie=" + encodeURIComponent(id), { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!d) return;
        setRevData(d);
        const mine = (d.reviews || []).find((x: any) => x.mine);
        if (mine) { setRevStars(mine.stars); setRevText(mine.text); }
      })
      .catch(() => {});
  };
  useEffect(() => {
    setRevData(null); setRevStars(0); setRevHover(0); setRevText("");
    if (selectedMovie && !selectedMovie.comingSoon) loadReviews(String(selectedMovie.id));
  }, [selectedMovie && selectedMovie.id]);
  const commPost = (body: any) =>
    fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, status: r.status, d })))
      .then((res) => {
        if (res.status === 401 && accountUser) {
          // La sesión se renueva sola y se vuelve a intentar una vez
          return fetch("/api/account", { cache: "no-store", credentials: "same-origin" }).then(() =>
            fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
              .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, status: r.status, d })))
          );
        }
        return res;
      });
  // ---------- Reacciones a reseñas ----------
  const REACTS = ["❤️", "😂", "😮", "👏"];
  const reactReview = (at: number, emoji: string) => {
    if (!selectedMovie) return;
    if (!accountUser) { showToast("Inicia sesión para reaccionar a las reseñas."); return; }
    const movieId = String(selectedMovie.id);
    const apply = (reacts: Record<string, number>, myReact: string) =>
      setRevData((d) => (d ? { ...d, reviews: d.reviews.map((x) => (x.at === at ? { ...x, reacts, myReact } : x)) } : d));
    const cur = revData && revData.reviews.find((x) => x.at === at);
    if (cur) {
      // Se ve al instante; luego el servidor confirma
      const reacts = { ...(cur.reacts || {}) };
      if (cur.myReact) reacts[cur.myReact] = Math.max(0, (reacts[cur.myReact] || 1) - 1);
      const mine = cur.myReact === emoji ? "" : emoji;
      if (mine) reacts[mine] = (reacts[mine] || 0) + 1;
      apply(reacts, mine);
    }
    commPost({ action: "react", movieId, at, emoji, name: activeProfile.name, avatar: activeProfile.avatar }).then(({ ok, d }) => {
      if (!ok) { showToast((d && d.error) || "No se pudo reaccionar."); loadReviews(movieId); return; }
      apply(d.reacts || {}, d.myReact || "");
    });
  };
  const loadInbox = () => {
    if (!accountUser) return;
    fetch("/api/community?inbox=1", { cache: "no-store", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((d: any) => {
      if (!d || !Array.isArray(d.items)) return;
      setInbox(d.items);
      // Aviso emergente de la reacción más nueva que aún no vio
      let seen = 0;
      try { seen = Number(localStorage.getItem("cv_inbox_seen") || 0); } catch (e) {}
      const fresh = d.items.filter((x: any) => x.at > seen);
      if (fresh.length) {
        const x = fresh[0];
        const mv = catalogAll.find((m) => String(m.id) === x.movieId);
        const verb = x.emoji === "👏" ? x.from + " aplaudió" : "A " + x.from + " " + ({ "❤️": "le encantó", "😂": "le hizo reír", "😮": "le sorprendió" } as Record<string, string>)[x.emoji];
        if (seen) showToast(x.emoji + " " + verb + " tu reseña" + (mv ? " de «" + mv.title + "»" : "") + (fresh.length > 1 ? " (y " + (fresh.length - 1) + " más)" : ""), 7000);
        try { localStorage.setItem("cv_inbox_seen", String(x.at)); } catch (e) {}
      } else if (!seen) {
        try { localStorage.setItem("cv_inbox_seen", String(Date.now())); } catch (e) {}
      }
    }).catch(() => {});
  };
  useEffect(() => {
    setInbox([]);
    if (!accountUser) return;
    const t0 = setTimeout(loadInbox, 3000);
    const t = setInterval(() => { if (!document.hidden) loadInbox(); }, 90000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [accountUser && accountUser.id]);
  const submitReview = () => {
    if (!selectedMovie || revBusy) return;
    if (!accountUser) { showToast("Inicia sesión para dejar tu reseña."); return; }
    if (!revStars) { showToast("Elige de 1 a 5 estrellas ⭐"); return; }
    setRevBusy(true);
    const id = String(selectedMovie.id);
    commPost({ action: "review", movieId: id, stars: revStars, text: revText, name: activeProfile.name, avatar: activeProfile.avatar, badge: topBadge ? topBadge.icon : "" })
      .then(({ ok, d }) => {
        setRevBusy(false);
        if (ok) {
          showToast("⭐ ¡Gracias por tu reseña!");
          setCommStars((cs) => ({ ...cs, [id]: { avg: d.avg, count: d.count } }));
          loadReviews(id);
          setMeCounts((c) => ({ ...c, reviews: Math.max(c.reviews, 1) }));
          loadMeCounts();
        } else showToast((d && d.error) || "No se pudo publicar.", 6000);
      })
      .catch(() => { setRevBusy(false); showToast("Sin conexión."); });
  };
  const deleteMyReview = () => {
    if (!selectedMovie) return;
    const id = String(selectedMovie.id);
    commPost({ action: "deleteReview", movieId: id }).then(() => { setRevStars(0); setRevText(""); loadReviews(id); loadCommTop(); loadMeCounts(); });
  };
  const starRow = (val: number, size: number) => (
    <span className="inline-flex items-center gap-0.5" aria-label={val + " de 5 estrellas"}>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} width={size} height={size} viewBox="0 0 24 24" fill={val >= k - 0.25 ? "#facc15" : val >= k - 0.75 ? "url(#cvHalf)" : "none"} stroke="#facc15" strokeWidth="1.6" strokeLinejoin="round">
          <defs><linearGradient id="cvHalf"><stop offset="50%" stopColor="#facc15" /><stop offset="50%" stopColor="transparent" /></linearGradient></defs>
          <path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" />
        </svg>
      ))}
    </span>
  );

  // ---------- Comunidad: listas ----------
  type CommList = { id: string; owner: string; avatar: string; name: string; desc: string; movieIds: string[]; followers: number; mine: boolean; following: boolean; updated: number };
  const [commLists, setCommLists] = useState<CommList[]>([]);
  const [myLists, setMyLists] = useState<CommList[]>([]);
  const [viewList, setViewList] = useState<CommList | null>(null);
  const [listPickFor, setListPickFor] = useState<Movie | null>(null);
  const [listEdit, setListEdit] = useState<{ id?: string; name: string; desc: string; movieIds: string[] } | null>(null);
  const loadLists = () => {
    fetch("/api/community?lists=1", { cache: "no-store", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((d: any) => {
      if (!d) return;
      setCommLists(d.lists || []);
      setMyLists(d.mine || []);
    }).catch(() => {});
  };
  useEffect(() => { loadLists(); }, [accountUser && accountUser.email]);
  // Enlace compartido de una lista: /?lista=ID
  useEffect(() => {
    if (!commLists.length && !myLists.length) return;
    let id = "";
    try { id = new URLSearchParams(window.location.search).get("lista") || ""; } catch (e) {}
    if (!id) return;
    const l = commLists.concat(myLists).find((x) => x.id === id);
    if (l) setViewList(l);
    try { history.replaceState(null, "", window.location.pathname); } catch (e) {}
  }, [commLists.length, myLists.length]);
  const saveList = (data: { id?: string; name: string; desc: string; movieIds: string[] }, msg?: string) =>
    commPost({ action: "listSave", ...data, owner: activeProfile.name, avatar: activeProfile.avatar }).then(({ ok, d }) => {
      if (ok) { if (msg) showToast(msg); loadLists(); loadMeCounts(); return d.list as CommList; }
      showToast((d && d.error) || "No se pudo guardar la lista.", 6000);
      return null;
    });
  const toggleFollow = (l: CommList) => {
    if (!accountUser) { showToast("Inicia sesión para seguir listas."); return; }
    commPost({ action: "listFollow", id: l.id }).then(({ ok, d }) => {
      if (!ok) { showToast((d && d.error) || "No se pudo."); return; }
      showToast(d.following ? "📂 Ahora sigues esta lista. La verás en Mi Lista." : "Dejaste de seguir la lista.");
      setViewList((v) => (v && v.id === l.id ? { ...v, following: d.following, followers: d.followers } : v));
      loadLists();
    });
  };
  const addMovieToList = (l: CommList, mv: Movie) => {
    const id = String(mv.id);
    if (l.movieIds.indexOf(id) !== -1) { showToast("Ya está en «" + l.name + "»"); return; }
    saveList({ id: l.id, name: l.name, desc: l.desc, movieIds: l.movieIds.concat(id) }, "📂 Agregada a «" + l.name + "»");
    setListPickFor(null);
  };
  const listCover = (l: CommList) => l.movieIds.map((id) => catalogAll.find((x) => String(x.id) === id)).filter(Boolean).slice(0, 4) as Movie[];

  // ---------- Logros e insignias ----------
  const [meCounts, setMeCounts] = useState({ reviews: 0, lists: 0, follows: 0 });
  // ¿Esta cuenta es la del dueño de la web? (lo confirma el servidor)
  const [isOwner, setIsOwner] = useState(false);
  const [meLoaded, setMeLoaded] = useState(false);
  const loadMeCounts = () => {
    if (!accountUser) return;
    fetch("/api/community?me=1", { cache: "no-store", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((d: any) => {
      if (d) { setMeCounts({ reviews: d.reviews || 0, lists: d.lists || 0, follows: d.follows || 0 }); setIsOwner(!!d.owner); setMeLoaded(true); }
    }).catch(() => {});
  };
  useEffect(() => { setIsOwner(false); setMeLoaded(false); loadMeCounts(); }, [accountUser && accountUser.email]);
  // En el dispositivo del admin (con su clave), su cuenta queda registrada como la del dueño: la 👑 se ve en todos sus dispositivos
  useEffect(() => {
    if (!isAdmin || !accountUser || !meLoaded || isOwner) return;
    let password = "";
    try { password = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!password) return;
    commPost({ action: "claimOwner", password }).then(({ ok }) => { if (ok) { setIsOwner(true); showToast("👑 Tu cuenta quedó registrada como la del Fundador de Cineverso."); } });
  }, [isAdmin, accountUser && accountUser.email, meLoaded, isOwner]);
  const watched = continueWatchingList.filter((p) => p.duration > 0 && p.time / p.duration > 0.15);
  const watchedMovies = watched.map((p) => catalogAll.find((x) => String(x.id) === String(p.id))).filter(Boolean) as Movie[];
  const genresSeen = new Set(watchedMovies.map((m) => m.tag).filter(Boolean));
  const episodesSeen = watched.filter((p) => p.episodeId).length;
  const finished = continueWatchingList.filter((p) => p.duration > 0 && p.time / p.duration > 0.9).length;
  const ratingsCount = Object.keys(ratings).length;
  const BADGES: { id: string; icon: string; name: string; desc: string; have: number; need: number }[] = [
    { id: "estreno", icon: "🎬", name: "Primera función", desc: "Mira tu primer título", have: watched.length, need: 1 },
    { id: "cinefilo", icon: "🍿", name: "Cinéfilo", desc: "Mira 10 títulos", have: watched.length, need: 10 },
    { id: "maraton", icon: "🏃", name: "Maratonista", desc: "Mira 5 episodios de series", have: episodesSeen, need: 5 },
    { id: "final", icon: "🏁", name: "Hasta el final", desc: "Termina 3 títulos completos", have: finished, need: 3 },
    { id: "explorador", icon: "🧭", name: "Explorador", desc: "Mira títulos de 5 géneros distintos", have: genresSeen.size, need: 5 },
    { id: "coleccion", icon: "❤️", name: "Coleccionista", desc: "Guarda 10 títulos en Mi Lista", have: myList.length, need: 10 },
    { id: "critico", icon: "👍", name: "Crítico", desc: "Califica 5 títulos con 👍 o 👎", have: ratingsCount, need: 5 },
    { id: "resenista", icon: "✍️", name: "Reseñista", desc: "Publica 3 reseñas con estrellas", have: meCounts.reviews, need: 3 },
    { id: "curador", icon: "📂", name: "Curador", desc: "Crea una lista para la comunidad", have: meCounts.lists, need: 1 },
    { id: "aldia", icon: "🔔", name: "Siempre al día", desc: "Activa la campanita de estrenos", have: pushState === "subscribed" ? 1 : 0, need: 1 },
    { id: "pionero", icon: "🌟", name: "Pionero", desc: "Únete a Cineverso en su primer año", have: accountUser && new Date().getFullYear() <= 2027 ? 1 : 0, need: 1 },
  ];
  const unlocked = accountUser ? BADGES.filter((b) => b.have >= b.need) : [];
  const BADGE_RANK = ["cinefilo", "resenista", "maraton", "curador", "explorador", "final", "critico", "coleccion", "aldia", "estreno", "pionero"];
  const OWNER_BADGE = { id: "fundador", icon: "👑", name: "Fundador", desc: "Creador y dueño de Cineverso Mágico", have: 1, need: 1 };
  const topBadge = isOwner ? OWNER_BADGE : unlocked.slice().sort((a, b) => BADGE_RANK.indexOf(a.id) - BADGE_RANK.indexOf(b.id))[0];
  // Aviso cuando se desbloquea un logro nuevo
  const unlockedKey = unlocked.map((b) => b.id).join(",");
  // Durante los primeros segundos (mientras cargan los datos) solo se anota, sin avisar
  const badgesSettled = useRef(false);
  useEffect(() => {
    badgesSettled.current = false;
    if (!accountLoaded) return;
    const t = setTimeout(() => { badgesSettled.current = true; }, 6000);
    return () => clearTimeout(t);
  }, [accountLoaded, activeProfile.id]);
  useEffect(() => {
    if (!accountUser || !accountLoaded) return;
    const key = "cv_badges_" + activeProfile.id;
    let seen: string[] | null = null;
    try { seen = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    const now = unlocked.map((b) => b.id);
    if (seen && badgesSettled.current) {
      const fresh = unlocked.filter((b) => (seen as string[]).indexOf(b.id) === -1);
      if (fresh.length) showToast("🏅 ¡Logro desbloqueado! " + fresh[0].icon + " " + fresh[0].name, 6000);
    }
    const merged = Array.from(new Set((seen || []).concat(now)));
    try { localStorage.setItem(key, JSON.stringify(merged)); } catch (e) {}
  }, [unlockedKey, activeProfile.id, accountLoaded]);

  // ---------- Reproductor: velocidad e imagen flotante ----------
  const [playRate, setPlayRate] = useState(1);
  const [rateOpen, setRateOpen] = useState(false);
  useEffect(() => { const v = playerRef.current; if (v) { try { v.playbackRate = playRate; } catch (e) {} } }, [playRate, isPlaying]);
  useEffect(() => { if (!isPlaying) { setPlayRate(1); setRateOpen(false); } }, [isPlaying]);
  const pipSupported = typeof document !== "undefined" && !!(document as any).pictureInPictureEnabled;
  const togglePip = () => {
    const v: any = playerRef.current;
    if (!v) return;
    try {
      if ((document as any).pictureInPictureElement) (document as any).exitPictureInPicture();
      else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => showToast("Tu navegador no permite la imagen flotante con este video."));
      else if (v.webkitSetPresentationMode) v.webkitSetPresentationMode("picture-in-picture");
    } catch (e) { showToast("Tu navegador no permite la imagen flotante."); }
  };

  // ---------- Chat de la comunidad ----------
  type ChatMsg = { id: string; at: number; uid: string; name: string; avatar: string; text: string; admin?: boolean };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatPinned, setChatPinned] = useState("");
  const [chatOnline, setChatOnline] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [chatPinEdit, setChatPinEdit] = useState("");
  const chatSinceRef = useRef(0);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  useEffect(() => {
    const lock = onboard || (chatOpen && typeof window !== "undefined" && window.innerWidth < 1024);
    if (!lock) return;
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overflow, body.style.overflow, body.style.position, body.style.top, body.style.width];
    const y = window.scrollY;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = -y + "px";
    body.style.width = "100%";
    return () => {
      html.style.overflow = prev[0]; body.style.overflow = prev[1]; body.style.position = prev[2]; body.style.top = prev[3]; body.style.width = prev[4];
      window.scrollTo(0, y);
    };
  }, [onboard, chatOpen]);
  const pollChat = () => {
    if (typeof document !== "undefined" && document.hidden) return Promise.resolve();
    return fetch("/api/chat?since=" + chatSinceRef.current, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!d || !Array.isArray(d.msgs)) return;
        setChatPinned(d.pinned || "");
        setChatOnline(d.online || 0);
        const ids: string[] | null = Array.isArray(d.ids) ? d.ids : null;
        setChatMsgs((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          let next = prev.concat((d.msgs as ChatMsg[]).filter((m) => !seen.has(m.id)));
          if (ids) { const keep = new Set(ids); next = next.filter((m) => keep.has(m.id)); }
          return next.slice(-200);
        });
        if (d.msgs.length) {
          const lastAt = d.msgs[d.msgs.length - 1].at;
          let lastRead = 0;
          try { lastRead = Number(localStorage.getItem("cv_chat_read") || 0); } catch (e) {}
          if (chatOpenRef.current) { try { localStorage.setItem("cv_chat_read", String(lastAt)); } catch (e) {} setChatUnread(0); }
          else if (chatSinceRef.current) setChatUnread((n) => n + (d.msgs as ChatMsg[]).filter((m) => m.at > lastRead).length);
          else setChatUnread((d.msgs as ChatMsg[]).filter((m) => m.at > lastRead).length > 0 ? Math.min(9, (d.msgs as ChatMsg[]).filter((m) => m.at > lastRead).length) : 0);
          chatSinceRef.current = Math.max(chatSinceRef.current, lastAt);
        }
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (tvMode) return;
    pollChat();
    const iv = setInterval(pollChat, chatOpen ? 3000 : 30000);
    return () => clearInterval(iv);
  }, [chatOpen, tvMode]);
  useEffect(() => {
    if (!chatOpen) return;
    setChatUnread(0);
    try { if (chatSinceRef.current) localStorage.setItem("cv_chat_read", String(chatSinceRef.current)); } catch (e) {}
    const ping = () => {
      let vid = "";
      try { vid = localStorage.getItem("cv_vid") || ""; } catch (e) {}
      fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ping", vid }) })
        .then((r) => r.json()).then((d: any) => { if (d && d.online) setChatOnline(d.online); }).catch(() => {});
    };
    ping();
    const iv = setInterval(ping, 40000);
    return () => clearInterval(iv);
  }, [chatOpen]);
  // Baja al último mensaje cuando llegan nuevos
  useEffect(() => {
    const el = chatListRef.current;
    if (!el || !chatOpen) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160 || chatMsgs.length < 3) el.scrollTop = el.scrollHeight;
  }, [chatMsgs.length, chatOpen]);
  useEffect(() => {
    if (!chatOpen) return;
    const t = setTimeout(() => { const el = chatListRef.current; if (el) el.scrollTop = el.scrollHeight; }, 60);
    return () => clearTimeout(t);
  }, [chatOpen]);
  const sendChat = (retried?: boolean) => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    if (!accountUser && !isAdmin) { setChatErr("Inicia sesión para escribir."); return; }
    setChatBusy(true);
    setChatErr("");
    const body: any = { action: "send", text, name: activeProfile.name, avatar: activeProfile.avatar };
    if (isAdmin) { try { body.password = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {} }
    fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, status: r.status, d })))
      .then(({ ok, status, d }) => {
        if (status === 401 && !retried && accountUser) {
          // La sesión se renueva sola y se vuelve a intentar
          return fetch("/api/account", { cache: "no-store", credentials: "same-origin" }).then(() => { setChatBusy(false); sendChat(true); });
        }
        setChatBusy(false);
        if (ok && d.last) {
          setChatInput("");
          setChatMsgs((prev) => (prev.some((m) => m.id === d.last.id) ? prev : prev.concat(d.last)));
          chatSinceRef.current = Math.max(chatSinceRef.current, d.last.at);
          setTimeout(() => { const el = chatListRef.current; if (el) el.scrollTop = el.scrollHeight; }, 50);
        } else setChatErr((d && d.error) || "No se pudo enviar.");
      })
      .catch(() => { setChatBusy(false); setChatErr("Sin conexión."); });
  };
  const chatAdmin = (action: string, extra: any) => {
    let password = "";
    try { password = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    return fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, password, ...extra }) })
      .then((r) => r.json())
      .then((d: any) => {
        if (d && Array.isArray(d.ids)) { const keep = new Set(d.ids); setChatMsgs((prev) => prev.filter((m) => keep.has(m.id))); }
        if (d && typeof d.pinned === "string") setChatPinned(d.pinned);
        return d;
      })
      .catch(() => null);
  };
  const nameColor = (s2: string) => {
    let h = 0;
    for (let i = 0; i < s2.length; i++) h = (h * 31 + s2.charCodeAt(i)) % 360;
    return "hsl(" + h + ",70%,62%)";
  };
  const fmtChatTime = (t: number) => {
    const d = new Date(t);
    const today = new Date();
    const hm = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === today.toDateString() ? hm : d.toLocaleDateString("es-PE", { day: "numeric", month: "short" }) + " · " + hm;
  };

  // ---------- Pedidos de películas ----------
  const [reqTitle, setReqTitle] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqBusy, setReqBusy] = useState(false);
  const [myReqs, setMyReqs] = useState<{ id: string; at: number; title: string; status: string; reply: string }[]>([]);
  const [adminReqs, setAdminReqs] = useState<{ id: string; at: number; email: string; profile: string; title: string; note: string; status: string }[]>([]);
  const loadMyReqs = () => {
    fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "mine" }) })
      .then((r) => r.json()).then((d: any) => { if (d && Array.isArray(d.items)) setMyReqs(d.items); }).catch(() => {});
  };
  useEffect(() => { if (activeTab === "cuenta" && accountUser) loadMyReqs(); }, [activeTab, accountUser]);
  const sendRequest = () => {
    if (reqBusy) return;
    if (reqTitle.trim().length < 2) { showToast("Escribe el nombre de la película o serie."); return; }
    setReqBusy(true);
    fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "add", title: reqTitle, note: reqNote, profile: activeProfile.name }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        setReqBusy(false);
        if (ok) { setReqTitle(""); setReqNote(""); showToast("📬 ¡Pedido enviado! Te avisaremos cuando esté disponible."); loadMyReqs(); }
        else showToast((d && d.error) || "No se pudo enviar el pedido.", 6000);
      })
      .catch(() => { setReqBusy(false); showToast("Sin conexión."); });
  };
  const adminReqCall = (action: string, extra?: any) => {
    let password = "";
    try { password = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!password) return;
    fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, password, ...(extra || {}) }) })
      .then((r) => r.json()).then((d: any) => { if (d && Array.isArray(d.items)) setAdminReqs(d.items); }).catch(() => {});
  };
  useEffect(() => { if (activeTab === "admin" && isAdmin) adminReqCall("list"); }, [activeTab, isAdmin]);
  const [showDoneReqs, setShowDoneReqs] = useState(false);
  const normT = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const titleMatches = (a: string, b: string) => {
    const x = normT(a), y = normT(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return Math.min(x.length, y.length) >= 4 && (x.indexOf(y) !== -1 || y.indexOf(x) !== -1);
  };
  // Mensaje del administrador en el chat
  const chatAdminPost = (text: string) => {
    let password = "";
    try { password = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!password) return;
    fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", password, text, name: "Cineverso", avatar: "/avatares/cv/palomitas.svg" }) })
      .then((r) => r.json()).then((d: any) => { if (d && d.last) setChatMsgs((prev) => (prev.some((m) => m.id === d.last.id) ? prev : prev.concat(d.last))); }).catch(() => {});
  };
  const announceRequests = (reqs: { profile: string; title: string }[], mv?: Movie) => {
    if (!reqs.length) return;
    const names = Array.from(new Set(reqs.map((r) => r.profile).filter(Boolean))).slice(0, 4);
    const title = mv ? mv.title : reqs[0].title;
    const link = mv ? " Míralo aquí: " + window.location.origin + "/ver/" + mv.id : "";
    chatAdminPost("🍿 ¡Ya está disponible «" + title + "»!" + (names.length ? " Gracias " + names.join(", ") + " por pedirla." : "") + link);
  };
  // Marca como atendidos los pedidos que coinciden con una película recién subida y lo anuncia en el chat
  const fulfillRequestsFor = (mv: Movie) => {
    const hits = adminReqs.filter((r) => r.status === "nueva" && titleMatches(r.title, mv.title));
    if (!hits.length) return;
    hits.forEach((r) => adminReqCall("status", { id: r.id, status: "agregada", reply: "¡Ya está disponible! 🍿" }));
    announceRequests(hits, mv);
    showToast("📬 " + hits.length + " pedido" + (hits.length === 1 ? "" : "s") + " atendido" + (hits.length === 1 ? "" : "s") + " y anunciado" + (hits.length === 1 ? "" : "s") + " en el chat.", 6000);
  };
  const markReqDone = (r: { id: string; profile: string; title: string }) => {
    adminReqCall("status", { id: r.id, status: "agregada", reply: "¡Ya está disponible! 🍿" });
    const mv = catalogAll.find((x) => !x.comingSoon && titleMatches(x.title, r.title));
    announceRequests([r], mv);
    showToast("✔ Pedido atendido y anunciado en el chat.");
  };

  // ---------- Agregar varias películas a la vez ----------
  type BulkItem = { line: string; title: string; url: string; status: "pendiente" | "buscando" | "listo" | "sin-datos"; include: boolean; movie?: Movie };
  const [bulkText, setBulkText] = useState("");
  const [bulkType, setBulkType] = useState<"pelicula" | "serie">("pelicula");
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotify, setBulkNotify] = useState(true);
  const runBulk = () => {
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40);
    if (!lines.length) { showToast("Pega una película por línea: Título | enlace del video"); return; }
    const items: BulkItem[] = lines.map((line) => {
      const um = line.match(/https?:\/\/\S+/);
      const url = um ? um[0] : "";
      const title = line.replace(url, "").replace(/[|;\t]+/g, " ").replace(/\s+-\s*$/, "").replace(/\s+/g, " ").trim();
      return { line, title, url, status: "pendiente", include: !!(title && url) };
    });
    setBulkItems(items);
    setBulkBusy(true);
    const kind = bulkType === "serie" ? "tv" : "movie";
    let i = 0;
    const step = (): Promise<void> => {
      if (i >= items.length) return Promise.resolve();
      const idx = i++;
      const it = items[idx];
      if (!it.title || !it.url) { items[idx] = { ...it, status: "sin-datos", include: false }; setBulkItems(items.slice()); return step(); }
      items[idx] = { ...it, status: "buscando" };
      setBulkItems(items.slice());
      const base: Movie = {
        id: Date.now() + idx, title: it.title, rating: "8.0", year: String(new Date().getFullYear()), tag: "Acción", type: bulkType,
        desc: "Contenido añadido desde el panel de administración.",
        bgImage: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
        img: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
        videoUrl: it.url, addedAt: Date.now(), originalLanguage: "ES",
      };
      return fetch("/api/tmdb?type=" + kind + "&q=" + encodeURIComponent(it.title), { cache: "no-store" })
        .then((r) => r.json())
        .then((d: any) => {
          const first = d && Array.isArray(d.results) && d.results[0];
          if (!first) throw new Error("none");
          return fetch("/api/tmdb?type=" + kind + "&id=" + first.id, { cache: "no-store" }).then((r) => r.json());
        })
        .then((d: any) => {
          const gs: string[] = Array.isArray(d.genres) ? d.genres : [];
          const main = gs.find((g) => genresList.indexOf(g) !== -1) || "Acción";
          const mv: Movie = {
            ...base,
            title: d.title || base.title, year: d.year || base.year, desc: d.desc || base.desc, duration: d.duration || undefined,
            ageRating: d.ageRating || undefined, director: d.director || undefined, cast: d.cast || undefined, trailerUrl: d.trailerUrl || undefined,
            bgImage: d.poster || base.bgImage, img: d.poster || base.img, backdrop: d.backdrop || undefined, rating: d.rating || "8.0",
            production: d.production || undefined, originalLanguage: d.originalLanguage || "ES", tag: main,
            genres: [main].concat(gs.filter((g) => g !== main)),
            tmdbId: d.tmdbId || undefined,
            ...(d.saga ? { saga: sagaNameFor(d.saga, d.sagaId), sagaOrder: d.sagaOrder || undefined, sagaId: d.sagaId || undefined } : {}),
          };
          items[idx] = { ...it, status: "listo", include: true, movie: mv };
        })
        .catch(() => { items[idx] = { ...it, status: "sin-datos", include: true, movie: { ...base, genres: ["Acción"] } }; })
        .then(() => { setBulkItems(items.slice()); return step(); });
    };
    step().then(() => setBulkBusy(false));
  };
  const saveBulk = () => {
    const movies = bulkItems.filter((x) => x.include && x.movie).map((x) => x.movie as Movie);
    if (!movies.length) { showToast("No hay películas marcadas para agregar."); return; }
    movies.forEach((mv) => fulfillRequestsFor(mv));
    saveChange({ type: "upsertMany", movies }, "¡" + movies.length + " película" + (movies.length === 1 ? "" : "s") + " agregada" + (movies.length === 1 ? "" : "s") + "!");
    if (bulkNotify) {
      const first = movies[0];
      sendPush({
        title: movies.length === 1 ? (first.type === "serie" ? "Nueva serie 🍿" : "Nueva película 🍿") : movies.length + " estrenos nuevos 🍿",
        body: movies.length === 1 ? first.title + " ya está disponible en Cineverso Mágico." : movies.slice(0, 3).map((m) => m.title).join(", ") + (movies.length > 3 ? " y más" : "") + " ya están en Cineverso Mágico.",
        image: first.backdrop || first.bgImage, url: movies.length === 1 ? "/ver/" + first.id : "/", tag: movies.length === 1 ? "m-" + first.id : "lote-" + Date.now(),
      }, movies.length === 1 ? first : undefined);
    }
    setBulkItems([]);
    setBulkText("");
  };


  // Administrador: enviar un aviso a todos los dispositivos suscritos
  const sendPush = (msg: { title: string; body: string; image?: string; url?: string; tag?: string }, mv?: Movie) => {
    let pass = "";
    try { pass = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!pass) { showToast("Para enviar avisos vuelve a entrar con ?admin.", 6000); return; }
    fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", password: pass, ...msg, movie: mv ? { title: mv.title, saga: mv.saga || "", tag: mv.tag || "", genres: mv.genres || [] } : undefined }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          const total = d.total || 0, sent = d.sent || 0;
          if (!total) showToast("📣 Todavía nadie activó la campanita 🔔. Cuando alguien la active, le llegarán los avisos.", 7000);
          else showToast("📣 Aviso enviado a " + sent + " de " + total + " dispositivo" + (total === 1 ? "" : "s") + (d.removed ? " (se limpiaron " + d.removed + " que ya no existen)" : "") + ".", 6000);
        }
        else showToast("No se pudo enviar el aviso (" + ((d && d.error) || "error") + ").", 6000);
      })
      .catch(() => showToast("No se pudo enviar el aviso."));
  };

  // ---------- 👍 / 👎 ----------
  const rateMovie = (m: Movie | null, v: 1 | -1) => {
    if (!m) return;
    if (!accountUser) { setShowLoginPrompt(true); return; }
    const k = String(m.id);
    setRatings((prev) => {
      const next = { ...prev };
      if (next[k] === v) delete next[k];
      else next[k] = v;
      return next;
    });
    showToast(ratings[k] === v ? "Calificación quitada." : v === 1 ? "👍 ¡Te gustó! Te recomendaremos más como esta." : "👎 Entendido, te mostraremos menos como esta.");
  };

  // ---------- Notificaciones ----------
  const [showNotif, setShowNotif] = useState(false);
  // Hora actual leída en el navegador (Next.js no permite leerla al compilar)
  const [nowTs, setNowTs] = useState(0);
  // ---------- Saludos con personalidad, cumpleaños y fechas especiales ----------
  const [greetHidden, setGreetHidden] = useState(false);
  const special = (() => {
    if (!todayStr) return null;
    const d = new Date(todayStr + "T12:00:00");
    const md = todayStr.slice(5);
    const dow = d.getDay(), dom = d.getDate(), mon = d.getMonth() + 1;
    const nthSunday = (n: number) => dow === 0 && Math.ceil(dom / 7) === n;
    if (md === "01-01") return { icon: "🎆", text: "¡Feliz Año Nuevo! Que este año venga lleno de buenas películas.", genre: "", tone: "#facc15" };
    if (md === "02-14") return { icon: "💘", text: "¡Feliz San Valentín! Hoy toca algo romántico.", genre: "Romance", tone: "#f472b6" };
    if (mon === 5 && nthSunday(2)) return { icon: "💐", text: "¡Feliz Día de la Madre! Una película para ver juntos hoy.", genre: "Familia", tone: "#f9a8d4" };
    if (mon === 6 && nthSunday(3)) return { icon: "👔", text: "¡Feliz Día del Padre! Elige una de acción para papá.", genre: "Acción", tone: "#60a5fa" };
    if (md === "07-28" || md === "07-29") return { icon: "🇵🇪", text: "¡Felices Fiestas Patrias! Celebra con una buena maratón.", genre: "", tone: "#ef4444" };
    if (md === "10-31") return { icon: "🎃", text: "¡Feliz Halloween! ¿Te atreves con una de terror?", genre: "Terror", tone: "#fb923c" };
    if (md === "12-24" || md === "12-25") return { icon: "🎄", text: "¡Feliz Navidad! Películas para ver en familia.", genre: "Familia", tone: "#22c55e" };
    if (md === "12-31") return { icon: "🥂", text: "¡Último día del año! Mira tu resumen: «Tu año en Cineverso».", genre: "", tone: "#facc15" };
    return null;
  })();
  const isBirthday = !!(todayStr && activeProfile.birthday && activeProfile.birthday === todayStr.slice(5) && activeProfile.id !== "invitado");
  const greetText = (() => {
    const h = nowTs ? new Date(nowTs).getHours() : 12;
    const hi = h < 5 ? "¡Buenas noches" : h < 12 ? "¡Buenos días" : h < 19 ? "¡Buenas tardes" : "¡Buenas noches";
    const name = activeProfile.id === "invitado" ? "" : ", " + activeProfile.name;
    const extra = h < 5 ? " Trasnochando, ¿eh? 🌙" : h < 12 ? " ☀️" : h < 19 ? " 🍿" : " 🌙";
    return hi + name + "!" + extra;
  })();
  const resumeItem = continueWatchingList.find((p) => p.duration > 0 && p.time / p.duration < 0.92);
  const resumeMovie = resumeItem ? catalogAll.find((x) => String(x.id) === String(resumeItem.id)) : undefined;
  const specialRow = special && special.genre ? catalog.filter((m) => m.tag === special.genre || (m.genres || []).indexOf(special.genre) !== -1).slice(0, 15) : [];

  // ---------- Tu año en Cineverso ----------
  const [wrapOpen, setWrapOpen] = useState(false);
  const [wrapStep, setWrapStep] = useState(0);
  const [wrapBusy, setWrapBusy] = useState(false);
  const wrapYear = todayStr ? Number(todayStr.slice(0, 4)) : 2026;
  const wrapStats = (() => {
    const items = continueWatchingList.filter((p) => p.duration > 0 && p.time / p.duration > 0.15);
    const seen = new Map<string, { m: Movie; secs: number }>();
    items.forEach((p) => {
      const m = catalogAll.find((x) => String(x.id) === String(p.id));
      if (!m) return;
      const cur = seen.get(String(m.id));
      const secs = Math.min(p.time, p.duration);
      seen.set(String(m.id), { m, secs: (cur ? cur.secs : 0) + secs });
    });
    const list = Array.from(seen.values());
    const minutes = Math.round(list.reduce((a, x) => a + x.secs, 0) / 60);
    const gcount: Record<string, number> = {};
    list.forEach((x) => { const g = x.m.tag; if (g) gcount[g] = (gcount[g] || 0) + 1; });
    const topGenres = Object.keys(gcount).sort((a, b) => gcount[b] - gcount[a]).slice(0, 3);
    const top = list.slice().sort((a, b) => b.secs - a.secs)[0];
    const PERS: Record<string, { t: string; d: string }> = {
      "Terror": { t: "Alma valiente 🎃", d: "No le temes a nada: la oscuridad es tu zona de confort." },
      "Acción": { t: "Pura adrenalina 💥", d: "Explosiones, persecuciones y héroes: tu combustible." },
      "Comedia": { t: "Rey de las risas 😂", d: "Para ti, una buena película es la que te hace reír." },
      "Romance": { t: "Corazón de cine 💘", d: "Las historias de amor siempre te atrapan." },
      "Animación": { t: "Niño interior ✨", d: "La animación te recuerda que la magia existe." },
      "Ciencia ficción": { t: "Viajero del futuro 🚀", d: "Otros mundos y otras épocas son tu hogar." },
      "Drama": { t: "Alma profunda 🎭", d: "Te quedas con las historias que te hacen sentir." },
      "Aventura": { t: "Explorador nato 🧭", d: "Siempre listo para una nueva expedición." },
      "Suspenso": { t: "Detective de sofá 🔎", d: "Nadie adivina los giros finales como tú." },
      "Familia": { t: "Corazón de hogar 🏡", d: "Lo mejor del cine es compartirlo con los tuyos." },
      "Fantasía": { t: "Soñador épico 🐉", d: "Dragones, magia y reinos lejanos: lo tuyo." },
    };
    const pers = topGenres[0] && PERS[topGenres[0]] ? PERS[topGenres[0]] : { t: "Cinéfilo todoterreno 🍿", d: "Te gusta un poco de todo: el cine es tu casa." };
    return { titles: list.length, minutes, hours: Math.round(minutes / 6) / 10, topGenres, gcount, top: top ? top.m : undefined, pers, badges: unlocked.length + (isOwner ? 1 : 0) };
  })();
  const loadImg = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) { resolve(null); return; }
    const im = new Image();
    im.crossOrigin = "anonymous";
    const t = setTimeout(() => resolve(null), 5000);
    im.onload = () => { clearTimeout(t); resolve(im); };
    im.onerror = () => { clearTimeout(t); resolve(null); };
    im.src = src;
  });
  // Dibuja la tarjeta para historias (1080 x 1920), estilo "boleto de cine", y la devuelve como PNG
  const makeWrapCard = async (withImages: boolean): Promise<Blob | null> => {
    const W = 1080, H = 1920;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    if (!g) return null;
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    };
    const txt = (t: string, x: number, y: number, size: number, color: string, weight = "800", align: CanvasTextAlign = "left", spacing = 0) => {
      g.font = weight + " " + size + "px Arial, Helvetica, sans-serif"; g.fillStyle = color; g.textAlign = align;
      if (spacing && align === "left") { let cx = x; for (const ch of t) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + spacing; } }
      else g.fillText(t, x, y);
    };
    const glow = (x: number, y: number, r: number, col: string) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // fondo con luces
    g.fillStyle = "#07060d"; g.fillRect(0, 0, W, H);
    glow(120, 260, 760, "rgba(34,197,94,.45)");
    glow(980, 1650, 900, "rgba(168,85,247,.45)");
    glow(900, 420, 520, "rgba(250,204,21,.22)");
    // año gigante de fondo
    g.save(); g.globalAlpha = 0.06; txt(String(wrapYear), W / 2, 1180, 430, "#ffffff", "900", "center"); g.restore();
    // tiras de película a los lados
    for (const sx of [0, W - 46]) {
      g.fillStyle = "#030303"; g.fillRect(sx, 0, 46, H);
      g.fillStyle = "rgba(255,255,255,.14)";
      for (let yy = 18; yy < H; yy += 58) { rr(sx + 11, yy, 24, 34, 6); g.fill(); }
    }
    const L = 96, R = W - 96, CW = R - L;
    // encabezado
    const lg = g.createLinearGradient(L, 110, L + 96, 206); lg.addColorStop(0, "#22c55e"); lg.addColorStop(1, "#a3e635");
    g.fillStyle = lg; rr(L, 110, 96, 96, 26); g.fill();
    txt("CV", L + 48, 176, 44, "#04130a", "900", "center");
    txt("Cineverso Mágico", L + 124, 152, 40, "#ffffff", "800");
    txt("TU AÑO EN CINEVERSO " + wrapYear, L + 124, 196, 26, "#4ade80", "900", "left", 4);
    // nombre
    let y = 330;
    const nm = activeProfile.name.length > 14 ? activeProfile.name.slice(0, 13) + "…" : activeProfile.name;
    txt(nm, L, y + 40, 112, "#ffffff", "900");
    if (isOwner) {
      g.font = "900 112px Arial"; const nw = g.measureText(nm).width;
      const gx = Math.min(L + nw + 26, R - 230);
      const gold = g.createLinearGradient(gx, 0, gx + 230, 0); gold.addColorStop(0, "#facc15"); gold.addColorStop(1, "#f59e0b");
      g.fillStyle = gold; rr(gx, y - 22, 230, 64, 32); g.fill();
      txt("FUNDADOR", gx + 115, y + 22, 30, "#1a1200", "900", "center");
    }
    y += 110;
    // póster de lo más visto (inclinado, con brillo)
    if (withImages && wrapStats.top) {
      const im = await loadImg(wrapStats.top.bgImage || wrapStats.top.backdrop || "");
      if (im) {
        const pw = 366, ph = 540, cx = W / 2, cy = y + ph / 2 + 20;
        g.save(); g.translate(cx, cy); g.rotate(-0.05);
        g.shadowColor = "rgba(250,204,21,.55)"; g.shadowBlur = 90;
        g.fillStyle = "#ffffff"; rr(-pw / 2 - 10, -ph / 2 - 10, pw + 20, ph + 20, 34); g.fill();
        g.shadowBlur = 0;
        g.save(); rr(-pw / 2, -ph / 2, pw, ph, 26); g.clip();
        const r = Math.max(pw / im.width, ph / im.height);
        g.drawImage(im, -im.width * r / 2, -im.height * r / 2, im.width * r, im.height * r);
        g.restore(); g.restore();
        // etiqueta
        g.fillStyle = "#ffffff"; rr(cx - 150, y + ph + 30, 300, 64, 32); g.fill();
        txt("LO MÁS VISTO", cx, y + ph + 74, 28, "#000000", "900", "center");
        const tt = wrapStats.top.title.length > 28 ? wrapStats.top.title.slice(0, 27) + "…" : wrapStats.top.title;
        txt(tt, cx, y + ph + 140, 44, "#ffffff", "900", "center");
        y += ph + 185;
      } else y += 30;
    } else y += 30;
    // boleto
    const ty = Math.max(y, 1130), th = 520;
    g.save();
    g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 60;
    const tk = g.createLinearGradient(L, ty, R, ty + th); tk.addColorStop(0, "rgba(255,255,255,.14)"); tk.addColorStop(1, "rgba(255,255,255,.05)");
    g.fillStyle = tk; rr(L, ty, CW, th, 40); g.fill();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 3; rr(L, ty, CW, th, 40); g.stroke();
    // números
    const stats: [string, string, string][] = [[String(wrapStats.titles), "títulos", "#4ade80"], [String(wrapStats.hours), "horas", "#7dd3fc"], [String(wrapStats.badges), "logros", "#f9a8d4"]];
    const bw = (CW - 80 - 40) / 3;
    stats.forEach(([v, l, col], i) => {
      const bx = L + 40 + i * (bw + 20);
      g.fillStyle = "rgba(0,0,0,.35)"; rr(bx, ty + 40, bw, 176, 26); g.fill();
      g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 2; rr(bx, ty + 40, bw, 176, 26); g.stroke();
      txt(v, bx + bw / 2, ty + 140, 80, col, "900", "center");
      txt(l, bx + bw / 2, ty + 188, 30, "#cbd5e1", "700", "center");
    });
    // línea punteada con muescas
    const dy = ty + 262;
    g.fillStyle = "#07060d"; g.beginPath(); g.arc(L, dy, 30, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(R, dy, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 4; g.setLineDash([16, 14]); g.beginPath(); g.moveTo(L + 50, dy); g.lineTo(R - 50, dy); g.stroke(); g.setLineDash([]);
    // personalidad + géneros
    txt("PERSONALIDAD CINÉFILA", L + 40, dy + 62, 26, "#94a3b8", "800", "left", 3);
    const pers = wrapStats.pers.t.replace(/[^\u0000-ɏ\s]/g, "").trim();
    txt(pers, L + 40, dy + 128, 58, "#facc15", "900");
    let gx = L + 40;
    (wrapStats.topGenres.length ? wrapStats.topGenres : ["Por descubrir"]).forEach((gn, i) => {
      g.font = "800 28px Arial"; const w = g.measureText(gn).width + 44;
      if (gx + w > R - 40) return;
      g.fillStyle = i === 0 ? "rgba(34,197,94,.28)" : "rgba(255,255,255,.1)"; rr(gx, dy + 160, w, 56, 28); g.fill();
      txt(gn, gx + 22, dy + 198, 28, i === 0 ? "#86efac" : "#e2e8f0", "800");
      gx += w + 14;
    });
    // llamado final
    const cy2 = H - 150;
    const cg = g.createLinearGradient(L, cy2, R, cy2); cg.addColorStop(0, "#22c55e"); cg.addColorStop(1, "#a3e635");
    g.fillStyle = cg; rr(L + 40, cy2, CW - 80, 92, 46); g.fill();
    txt("¿Y tú? Descubre tu año en cineversomagico.com", W / 2, cy2 + 58, 32, "#04130a", "900", "center");
    return await new Promise<Blob | null>((resolve) => { try { c.toBlob((b) => resolve(b), "image/png"); } catch (e) { resolve(null); } });
  };
  // ================================================================
  // A TU GUSTO: Sorpréndeme personalizado, "Porque viste…", seguir sagas y géneros,
  // retos del mes y votaciones de la comunidad
  // ================================================================
  const addHistory = (id: string, pct: number, secs: number) => {
    const at = Date.now();
    setWatchHistory((prev) => {
      const cur = prev.find((h) => h.id === id);
      const item = { id, at, pct: Math.max(cur ? cur.pct : 0, Math.min(100, Math.round(pct || 0))), mins: Math.round(((cur ? cur.mins : 0) + secs / 60) * 10) / 10 };
      return [item].concat(prev.filter((h) => h.id !== id)).slice(0, 400);
    });
  };
  // Sin cuenta: lo mismo se guarda en este dispositivo
  const guestDataLoaded = useRef(false);
  useEffect(() => {
    if (!accountChecked || accountUser || guestDataLoaded.current) return;
    guestDataLoaded.current = true;
    try {
      const g = JSON.parse(localStorage.getItem("cv_taste_guest") || "null");
      if (g && typeof g === "object") {
        if (Array.isArray(g.history)) setWatchHistory(g.history.filter((h: any) => h && typeof h.id === "string" && typeof h.at === "number"));
        if (g.follows && Array.isArray(g.follows.sagas) && Array.isArray(g.follows.genres)) setFollows({ sagas: g.follows.sagas, genres: g.follows.genres });
        if (Array.isArray(g.seasonBadges)) setSeasonBadges(g.seasonBadges);
        if (Array.isArray(g.challengesDone)) setChallengesDone(g.challengesDone);
      }
    } catch (e) {}
  }, [accountChecked, accountUser]);
  useEffect(() => { if (accountUser) guestDataLoaded.current = false; }, [accountUser]);
  useEffect(() => {
    if (accountUser || !accountChecked || !guestDataLoaded.current) return;
    try { localStorage.setItem("cv_taste_guest", JSON.stringify({ history: watchHistory.slice(0, 300), follows, seasonBadges, challengesDone })); } catch (e) {}
  }, [watchHistory, follows, seasonBadges, challengesDone, accountUser, accountChecked]);

  const genresOf = (m: Movie) => Array.from(new Set([m.tag].concat(m.genres || []).filter(Boolean) as string[]));
  const castOf = (m: Movie) => (m.cast || "").split(",").map((x) => x.trim()).filter((x) => x.length > 2).slice(0, 4);
  // Todo lo que vio: historial + "Continuar viendo"
  const seenMap = (() => {
    const map = new Map<string, { at: number; pct: number; mins: number }>();
    watchHistory.forEach((h) => map.set(h.id, { at: h.at, pct: h.pct, mins: h.mins }));
    continueWatchingList.forEach((p) => {
      const id = String(p.id);
      const pct = p.duration > 0 ? (p.time / p.duration) * 100 : 0;
      const cur = map.get(id);
      if (!cur) map.set(id, { at: p.updatedAt || 0, pct, mins: p.time / 60 });
      else map.set(id, { at: Math.max(cur.at, p.updatedAt || 0), pct: Math.max(cur.pct, pct), mins: Math.max(cur.mins, p.time / 60) });
    });
    return map;
  })();
  const seenOk = (x: { pct: number; mins: number }) => x.pct >= 15 || x.mins >= 10;
  const seenIds = new Set(Array.from(seenMap.keys()).filter((k) => seenOk(seenMap.get(k) as any)));
  // Perfil de gustos
  const taste = (() => {
    const g: Record<string, number> = {}, sg: Record<string, number> = {}, cast: Record<string, number> = {};
    const add = (m: Movie, w: number) => {
      genresOf(m).forEach((x, i) => { g[x] = (g[x] || 0) + (i === 0 ? w : w * 0.6); });
      if (m.saga) sg[m.saga] = (sg[m.saga] || 0) + w;
      castOf(m).forEach((c) => { cast[c] = (cast[c] || 0) + w * 0.5; });
    };
    catalogAll.forEach((m) => {
      const id = String(m.id);
      const s = seenMap.get(id);
      if (s && seenOk(s)) add(m, s.pct >= 85 ? 3 : 2);
      const r = ratings[id];
      if (r === 1) add(m, 3); else if (r === -1) add(m, -3);
      if (myList.indexOf(m.title) !== -1) add(m, 1);
    });
    follows.genres.forEach((x) => { g[x] = (g[x] || 0) + 2; });
    follows.sagas.forEach((x) => { sg[x] = (sg[x] || 0) + 3; });
    const topG = Object.keys(g).filter((k) => g[k] > 0).sort((a, b) => g[b] - g[a]);
    return { g, sg, cast, topG, has: topG.length > 0 };
  })();
  const tasteScore = (m: Movie) => {
    let s = 0;
    genresOf(m).forEach((x) => { s += taste.g[x] || 0; });
    if (m.saga) s += (taste.sg[m.saga] || 0) * 1.5;
    castOf(m).forEach((c) => { s += taste.cast[c] || 0; });
    const cs = commStars[String(m.id)];
    if (cs && cs.count) s += (cs.avg - 3) * 0.8;
    if (isNewMovie30(m)) s += 0.5;
    return s;
  };
  const tasteWhy = (m: Movie) => {
    if (m.saga && (taste.sg[m.saga] || 0) > 0) return follows.sagas.indexOf(m.saga) !== -1 ? "Sigues la saga «" + m.saga + "»: esta todavía no la ves 🎞️" : "Te gustó la saga «" + m.saga + "»: sigue con esta 🎞️";
    const gs = genresOf(m).filter((x) => taste.topG.slice(0, 4).indexOf(x) !== -1).slice(0, 2);
    const actor = castOf(m).find((c) => (taste.cast[c] || 0) > 0.9);
    if (gs.length && actor) return "Te gusta " + gs.map((x) => x.toLowerCase()).join(" y ") + ", y sale " + actor + " 👀";
    if (gs.length) return "Te gusta " + gs.map((x) => x.toLowerCase()).join(" y ") + ": prueba esta 👀";
    if (actor) return "Sale " + actor + ", que ya viste en otras 🎬";
    return "Algo distinto para variar 🎲";
  };
  const pickSurprise = (exclude: string): { m: Movie; why: string } | null => {
    const playable = catalog.filter((m) => String(m.id) !== exclude);
    const fresh = playable.filter((m) => !seenIds.has(String(m.id)) && ratings[String(m.id)] !== -1);
    const base = fresh.length ? fresh : playable;
    if (!base.length) return null;
    if (!taste.has) {
      const tops = commTop.map((id) => base.find((x) => String(x.id) === id)).filter(Boolean) as Movie[];
      const from = tops.length ? tops.slice(0, 10) : base;
      const m = from[Math.floor(Math.random() * from.length)];
      return { m, why: tops.length ? "Aún no conocemos tus gustos: esta es de lo mejor valorado por la comunidad ⭐" : "Aún no conocemos tus gustos. ¡Mira algo y aprenderemos de ti! 🍿" };
    }
    // Se elige al azar entre las que más encajan (las de mayor puntaje tienen mucha más probabilidad)
    const top = base.map((m) => ({ m, s: tasteScore(m) })).sort((a, b) => b.s - a.s).slice(0, 6);
    const minS = Math.min.apply(null, top.map((x) => x.s));
    const w = top.map((x) => Math.pow(x.s - minS + 0.5, 2));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    let chosen = top[0];
    for (let i = 0; i < top.length; i++) { r -= w[i]; if (r <= 0) { chosen = top[i]; break; } }
    return { m: chosen.m, why: fresh.length ? tasteWhy(chosen.m) : "¡Ya viste casi todo! Esta te puede gustar de nuevo 🔁" };
  };
  // Ruleta de Sorpréndeme
  const [surprise, setSurprise] = useState<{ phase: "spin" | "done"; reel: Movie[]; idx: number; pick: Movie; why: string } | null>(null);
  const startSurprise = (exclude?: string) => {
    const p = pickSurprise(exclude || "");
    if (!p) { showToast("Todavía no hay películas para elegir."); return; }
    let reduce = false;
    try { reduce = !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    const others = catalog.filter((x) => x.id !== p.m.id && x.bgImage);
    const reel: Movie[] = [];
    for (let i = 0; i < 15 && others.length; i++) reel.push(others[Math.floor(Math.random() * others.length)]);
    reel.push(p.m);
    setSurprise({ phase: reduce || reel.length < 3 ? "done" : "spin", reel, idx: reduce ? reel.length - 1 : 0, pick: p.m, why: p.why });
  };
  useEffect(() => {
    if (!surprise || surprise.phase !== "spin") return;
    let alive = true, i = 0;
    const n = surprise.reel.length;
    const step = () => {
      if (!alive) return;
      i++;
      if (i >= n - 1) { setSurprise((s) => (s ? { ...s, idx: n - 1, phase: "done" } : s)); return; }
      setSurprise((s) => (s ? { ...s, idx: i } : s));
      setTimeout(step, 60 + i * i * 1.3);
    };
    const t = setTimeout(step, 90);
    return () => { alive = false; clearTimeout(t); };
  }, [surprise && surprise.phase, surprise && String(surprise.pick.id)]);

  useEffect(() => {
    if (!surprise) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack" || e.keyCode === 461 || e.keyCode === 10009) { e.preventDefault(); e.stopPropagation(); setSurprise(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [!!surprise]);
  // "Porque viste…": hasta 2 filas con títulos parecidos a lo último que vio
  const similarity = (a: Movie, b: Movie) => {
    let s = 0;
    if (a.saga && a.saga === b.saga) s += 6;
    const ga = genresOf(a), gb = genresOf(b);
    ga.forEach((x) => { if (gb.indexOf(x) !== -1) s += 2; });
    if (a.tag && a.tag === b.tag) s += 1;
    const ca = castOf(a), cb = castOf(b);
    ca.forEach((x) => { if (cb.indexOf(x) !== -1) s += 2; });
    if (a.director && b.director && a.director === b.director) s += 2;
    const ya = parseInt(a.year, 10), yb = parseInt(b.year, 10);
    if (ya && yb && Math.abs(ya - yb) <= 5) s += 1;
    if ((a.type || "pelicula") === (b.type || "pelicula")) s += 1;
    return s;
  };
  const becauseRows = (() => {
    const out: { anchor: Movie; items: Movie[] }[] = [];
    const used = new Set<string>();
    const anchors = Array.from(seenMap.keys())
      .filter((k) => { const v = seenMap.get(k) as any; return (v.pct >= 40 || ratings[k] === 1) && ratings[k] !== -1; })
      .sort((a, b) => (seenMap.get(b) as any).at - (seenMap.get(a) as any).at)
      .map((k) => catalog.find((x) => String(x.id) === k))
      .filter(Boolean) as Movie[];
    for (const a of anchors) {
      if (out.length >= 2) break;
      if (out.some((r) => r.anchor.saga && r.anchor.saga === a.saga)) continue;
      const items = catalog
        .filter((b) => b.id !== a.id && !seenIds.has(String(b.id)) && ratings[String(b.id)] !== -1 && !used.has(String(b.id)))
        .map((b) => ({ b, s: similarity(a, b) }))
        .filter((x) => x.s >= 3)
        .sort((x, y) => y.s - x.s)
        .slice(0, 15)
        .map((x) => x.b);
      if (items.length >= 2) { items.forEach((x) => used.add(String(x.id))); out.push({ anchor: a, items }); }
    }
    return out;
  })();

  // ---------- Seguir sagas y géneros ----------
  const isFollowing = (kind: "saga" | "genre", name: string) => (kind === "saga" ? follows.sagas : follows.genres).indexOf(name) !== -1;
  const toggleFollowTopic = (kind: "saga" | "genre", name: string) => {
    if (!name) return;
    const on = !isFollowing(kind, name);
    setFollows((f) => {
      const key = kind === "saga" ? "sagas" : "genres";
      const cur = f[key].filter((x) => x !== name);
      return { ...f, [key]: on ? cur.concat(name).slice(-50) : cur };
    });
    if (!on) { showToast("Dejaste de seguir «" + name + "»."); return; }
    showToast("🔔 Sigues «" + name + "». Te avisaremos cuando llegue " + (kind === "saga" ? "otra de esta saga." : "algo nuevo de este género.") + (pushState === "subscribed" ? "" : " Activa la campanita 🔔 para recibir el aviso en tu celular."), 7000);
  };
  // El servidor de avisos sabe qué sigue este dispositivo
  useEffect(() => {
    if (pushState !== "subscribed") return;
    const t = setTimeout(() => {
      try {
        navigator.serviceWorker.ready
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => {
            if (!sub) return;
            return fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "follows", endpoint: sub.endpoint, follows }) });
          })
          .catch(() => {});
      } catch (e) {}
    }, 1500);
    return () => clearTimeout(t);
  }, [pushState, follows.sagas.join("|"), follows.genres.join("|")]);
  const followMatch = (m: Movie): { kind: "saga" | "genre"; name: string } | null => {
    if (m.saga && follows.sagas.indexOf(m.saga) !== -1) return { kind: "saga", name: m.saga };
    const g = genresOf(m).find((x) => follows.genres.indexOf(x) !== -1);
    return g ? { kind: "genre", name: g } : null;
  };
  const followedNew = catalog.filter((m) => isNewMovie30(m) && !seenIds.has(String(m.id)) && !!followMatch(m)).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 15);
  const allSagas = Array.from(new Set(catalogAll.map((m) => m.saga).filter(Boolean) as string[])).sort();
  const allGenres = (() => {
    const c: Record<string, number> = {};
    catalogAll.forEach((m) => genresOf(m).forEach((g) => { c[g] = (c[g] || 0) + 1; }));
    return Object.keys(c).sort((a, b) => c[b] - c[a]);
  })();

  // ---------- Retos del mes ----------
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MONTH_THEME: { g: string; name: string; icon: string }[] = [
    { g: "Aventura", name: "Año nuevo, aventura nueva", icon: "🧭" },
    { g: "Romance", name: "Mes del amor", icon: "💘" },
    { g: "Comedia", name: "Marzo de risas", icon: "😂" },
    { g: "Animación", name: "Abril animado", icon: "✨" },
    { g: "Familia", name: "Mayo en familia", icon: "💐" },
    { g: "Acción", name: "Junio de acción", icon: "💥" },
    { g: "Drama", name: "Julio de grandes historias", icon: "🎭" },
    { g: "Ciencia ficción", name: "Agosto galáctico", icon: "🚀" },
    { g: "Fantasía", name: "Septiembre mágico", icon: "🐉" },
    { g: "Terror", name: "Octubre de terror", icon: "🎃" },
    { g: "Suspenso", name: "Noviembre de suspenso", icon: "🔎" },
    { g: "Familia", name: "Navidad en familia", icon: "🎄" },
  ];
  const GENRE_ICON: Record<string, string> = { "Terror": "👻", "Acción": "💥", "Comedia": "😂", "Romance": "💘", "Animación": "✨", "Ciencia ficción": "🚀", "Drama": "🎭", "Aventura": "🧭", "Suspenso": "🔎", "Familia": "🏡", "Fantasía": "🐉" };
  const monthKey = todayStr ? todayStr.slice(0, 7) : "";
  const monthLabel = (key: string) => { const mm = parseInt(key.slice(5, 7), 10); return mm ? MONTHS[mm - 1].charAt(0).toUpperCase() + MONTHS[mm - 1].slice(1) + " " + key.slice(0, 4) : key; };
  const seasonIcon = (key: string) => { const mm = parseInt(key.slice(5, 7), 10); return mm ? MONTH_THEME[mm - 1].icon : "🏆"; };
  const challenges = (() => {
    if (!monthKey || !catalog.length) return null;
    const y = parseInt(monthKey.slice(0, 4), 10), mo = parseInt(monthKey.slice(5, 7), 10);
    const start = new Date(y, mo - 1, 1).getTime();
    const theme = MONTH_THEME[mo - 1];
    const countG = (g: string) => catalog.filter((m) => genresOf(m).indexOf(g) !== -1).length;
    let g = theme.g, name = theme.name;
    let icon = theme.icon;
    if (countG(g) < 3) { g = allGenres.find((x) => countG(x) >= 3) || allGenres[0] || ""; name = "Mes de " + (g || "cine").toLowerCase(); icon = GENRE_ICON[g] || "🎬"; }
    const monthSeen = Array.from(seenMap.keys())
      .filter((k) => { const v = seenMap.get(k) as any; return v.at >= start && seenOk(v); })
      .map((k) => catalogAll.find((x) => String(x.id) === k))
      .filter(Boolean) as Movie[];
    const needG = Math.max(1, Math.min(5, countG(g)));
    const needM = Math.max(1, Math.min(8, catalog.length));
    const genresThisMonth = new Set<string>();
    monthSeen.forEach((m) => { if (m.tag) genresThisMonth.add(m.tag); });
    const needE = Math.max(1, Math.min(3, allGenres.length));
    const list = [
      { id: "genero", icon, text: "Mira " + needG + " de " + (g || "cine").toLowerCase(), have: monthSeen.filter((m) => genresOf(m).indexOf(g) !== -1).length, need: needG, genre: g },
      { id: "maraton", icon: "🍿", text: "Mira " + needM + " títulos este mes", have: monthSeen.length, need: needM, genre: "" },
      { id: "explora", icon: "🧭", text: "Mira " + needE + " géneros distintos", have: genresThisMonth.size, need: needE, genre: "" },
    ].map((c) => ({ ...c, done: c.have >= c.need }));
    return { key: monthKey, name, icon, label: monthLabel(monthKey), list, all: list.every((c) => c.done) };
  })();
  const [celebrate, setCelebrate] = useState(0);
  useEffect(() => { if (!celebrate) return; const t = setTimeout(() => setCelebrate(0), 6000); return () => clearTimeout(t); }, [celebrate]);
  // Primeros segundos (mientras cargan los datos): solo se anota, sin festejar
  const challengeSettled = useRef(false);
  useEffect(() => {
    challengeSettled.current = false;
    if (!accountChecked) return;
    const t = setTimeout(() => { challengeSettled.current = true; }, 6000);
    return () => clearTimeout(t);
  }, [accountChecked, accountUser && accountUser.id, accountLoaded]);
  const challengeKey = challenges ? challenges.key + ":" + challenges.list.map((c) => c.id + (c.done ? 1 : 0)).join(",") : "";
  useEffect(() => {
    if (!challenges) return;
    if (accountUser && !accountLoaded) return;
    const fresh = challenges.list.filter((c) => c.done && challengesDone.indexOf(challenges.key + ":" + c.id) === -1);
    const earned = challenges.all && seasonBadges.indexOf(challenges.key) === -1;
    if (!fresh.length && !earned) return;
    if (fresh.length) setChallengesDone((prev) => prev.concat(fresh.map((c) => challenges.key + ":" + c.id)).slice(-720));
    if (earned) setSeasonBadges((prev) => (prev.indexOf(challenges.key) === -1 ? prev.concat(challenges.key) : prev));
    if (!challengeSettled.current) return;
    if (earned) { showToast("🏅 ¡Completaste los retos! Ganaste la insignia «" + challenges.icon + " " + challenges.label + "»", 8000); setCelebrate(Date.now()); }
    else { showToast("🏆 ¡Reto cumplido! " + fresh[0].icon + " " + fresh[0].text, 6000); setCelebrate(Date.now()); }
  }, [challengeKey, accountLoaded, accountUser && accountUser.id]);

  // ---------- Votaciones ----------
  type PollView = { id: string; q: string; open: boolean; at: number; closedAt: number; winner: string; total: number; mine: string; opts: { id: string; label: string; img: string; movieId: string; count: number }[] };
  const [polls, setPolls] = useState<PollView[]>([]);
  const [pollBusy, setPollBusy] = useState("");
  const loadPolls = () => {
    fetch("/api/community?polls=1", { cache: "no-store", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((d: any) => { if (d && Array.isArray(d.polls)) setPolls(d.polls); }).catch(() => {});
  };
  useEffect(() => {
    loadPolls();
    const t = setInterval(() => { if (!document.hidden) loadPolls(); }, 45000);
    return () => clearInterval(t);
  }, [accountUser && accountUser.id]);
  const votePoll = (p: PollView, opt: string) => {
    if (!accountUser) { showToast("Inicia sesión para votar 🗳️ (Cuenta → Iniciar sesión)."); return; }
    if (!p.open || pollBusy) return;
    setPollBusy(p.id + ":" + opt);
    commPost({ action: "pollVote", id: p.id, opt }).then(({ ok, d }) => {
      setPollBusy("");
      if (!ok) { showToast((d && d.error) || "No se pudo votar."); return; }
      if (d.poll) setPolls((prev) => prev.map((x) => (x.id === p.id ? d.poll : x)));
      showToast(p.mine ? "🗳️ Cambiaste tu voto." : "🗳️ ¡Gracias por votar!");
    });
  };
  // Administrador
  const [adminPolls, setAdminPolls] = useState<PollView[]>([]);
  const [pollQ, setPollQ] = useState("¿Qué agregamos esta semana?");
  const [pollOpts, setPollOpts] = useState("");
  const adminPollCall = (action: string, extra: any) => {
    let password = "";
    try { password = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!password) { showToast("Vuelve a entrar con ?admin para usar esto.", 6000); return Promise.resolve(null as any); }
    return fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, password, ...extra }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, d })))
      .catch(() => ({ ok: false, d: { error: "Sin conexión" } }));
  };
  const loadAdminPolls = () => {
    fetch("/api/community?polls=1&all=1", { cache: "no-store", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((d: any) => { if (d && Array.isArray(d.polls)) setAdminPolls(d.polls); }).catch(() => {});
  };
  useEffect(() => { if (activeTab === "admin" && isAdmin) loadAdminPolls(); }, [activeTab, isAdmin]);
  // ---------- Ordenar sagas con TMDB (administrador) ----------
  type SagaHit = { id: string; title: string; year: string; saga: string; sagaOrder: number; sagaId: number; tmdbId: number; prev: string; prevOrder: number; include: boolean };
  const [sagaScan, setSagaScan] = useState<{ busy: boolean; done: number; total: number; hits: SagaHit[]; noKey?: boolean } | null>(null);
  const scanSagas = () => {
    if (sagaScan && sagaScan.busy) return;
    const movies = customMovies.filter((m) => m.type !== "serie" && m.title);
    if (!movies.length) { showToast("No hay películas para revisar."); return; }
    const hits: SagaHit[] = [];
    let i = 0, stop = false;
    setSagaScan({ busy: true, done: 0, total: movies.length, hits: [] });
    const nameById: Record<number, string> = {};
    const step = (): Promise<void> => {
      if (stop || i >= movies.length) return Promise.resolve();
      const m = movies[i++];
      const url = "/api/tmdb?type=movie&saga=1&" + (m.tmdbId ? "id=" + m.tmdbId : "q=" + encodeURIComponent(m.title) + "&year=" + encodeURIComponent(String(m.year || "").slice(0, 4)));
      return fetch(url, { cache: "no-store" })
        .then((r) => { if (r.status === 503 || r.status === 401) { stop = true; return null; } return r.ok ? r.json() : null; })
        .catch(() => null)
        .then((d: any) => {
          if (d && d.found && d.saga) {
            // Todas las partes de una misma colección quedan con el mismo nombre
            const name = nameById[d.sagaId] || sagaNameFor(d.saga, d.sagaId);
            nameById[d.sagaId] = name;
            const changed = (m.saga || "") !== name || (m.sagaOrder || 0) !== (d.sagaOrder || 0);
            if (changed) hits.push({ id: String(m.id), title: m.title, year: m.year, saga: name, sagaOrder: d.sagaOrder || 0, sagaId: d.sagaId, tmdbId: d.tmdbId, prev: m.saga || "", prevOrder: m.sagaOrder || 0, include: true });
          }
          setSagaScan({ busy: true, done: i, total: movies.length, hits: hits.slice() });
          return new Promise<void>((res) => setTimeout(res, 120)).then(step);
        });
    };
    step().then(() => {
      setSagaScan({ busy: false, done: i, total: movies.length, hits: hits.slice(), noKey: stop });
      if (stop) showToast("Falta la clave de TMDB en Vercel (TMDB_API_KEY). Sin ella no se pueden buscar las sagas.", 8000);
      else if (!hits.length) showToast("✔ Revisé " + movies.length + " películas: tus sagas ya están completas y en orden.", 6000);
    });
  };
  const saveSagaScan = () => {
    if (!sagaScan) return;
    const sel = sagaScan.hits.filter((h) => h.include);
    if (!sel.length) { showToast("No marcaste ninguna."); return; }
    saveChange({ type: "patchMany", patches: sel.map((h) => ({ id: h.id, fields: { saga: h.saga, sagaOrder: h.sagaOrder || undefined, sagaId: h.sagaId, tmdbId: h.tmdbId } })) }, "🎞️ ¡Listo! " + sel.length + " película" + (sel.length === 1 ? "" : "s") + " ordenada" + (sel.length === 1 ? "" : "s") + " en su saga.");
    setSagaScan(null);
  };
  const pollFromRequests = () => {
    const counts: Record<string, { title: string; n: number }> = {};
    adminReqs.filter((r) => r.status === "nueva").forEach((r) => {
      const k = r.title.trim().toLowerCase();
      if (!k) return;
      counts[k] = counts[k] ? { title: counts[k].title, n: counts[k].n + 1 } : { title: r.title.trim(), n: 1 };
    });
    const top = Object.keys(counts).sort((a, b) => counts[b].n - counts[a].n).slice(0, 4).map((k) => counts[k].title);
    if (!top.length) { showToast("Todavía no hay pedidos nuevos. Escribe las opciones a mano.", 6000); return; }
    setPollOpts(top.join("\n"));
    showToast(top.length === 1 ? "Se agregó el pedido más pedido. Escribe al menos otra opción debajo." : "Listo: se llenaron las opciones con los " + top.length + " pedidos más pedidos.", 6000);
  };
  const createPoll = () => {
    const opts = pollOpts.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6);
    if (!pollQ.trim()) { showToast("Escribe la pregunta."); return; }
    if (opts.length < 2) { showToast("Escribe al menos 2 opciones, una por línea."); return; }
    const withImg = opts.map((label) => {
      const mv = catalogAll.find((m) => m.title.toLowerCase() === label.toLowerCase());
      return { label, img: mv && /^https:\/\//.test(mv.bgImage || "") ? mv.bgImage : "", movieId: mv ? String(mv.id) : "" };
    });
    adminPollCall("adminPollCreate", { q: pollQ.trim(), opts: withImg }).then((res) => {
      if (!res) return;
      if (!res.ok) { showToast((res.d && res.d.error) || "No se pudo crear."); return; }
      showToast("🗳️ ¡Votación publicada! Ya aparece en la portada.");
      chatAdminPost("🗳️ ¡Nueva votación! " + pollQ.trim() + " Vota en la portada de Cineverso.");
      setPollOpts("");
      loadAdminPolls(); loadPolls();
    });
  };
  const closePoll = (p: PollView) => {
    if (!window.confirm("¿Cerrar la votación «" + p.q + "» y anunciar el ganador en el chat?")) return;
    adminPollCall("adminPollClose", { id: p.id }).then((res) => {
      if (!res) return;
      if (!res.ok) { showToast((res.d && res.d.error) || "No se pudo cerrar."); return; }
      const pr: PollView = res.d.poll;
      const win = pr && pr.opts.find((o) => o.id === pr.winner);
      if (win) chatAdminPost("🏆 ¡Terminó la votación! «" + pr.q + "» Ganó «" + win.label + "» con " + win.count + " voto" + (win.count === 1 ? "" : "s") + ". ¡Gracias a todos por votar! 🗳️");
      showToast(win ? "Votación cerrada. Ganó «" + win.label + "» y se anunció en el chat." : "Votación cerrada (nadie votó).", 6000);
      loadAdminPolls(); loadPolls();
    });
  };
  const deletePoll = (p: PollView) => {
    if (!window.confirm("¿Borrar la votación «" + p.q + "»?")) return;
    adminPollCall("adminPollDelete", { id: p.id }).then((res) => { if (res && res.ok) { loadAdminPolls(); loadPolls(); } });
  };
  const pollCard = (p: PollView, compact: boolean) => {
    const showRes = !p.open || !!p.mine || isAdmin;
    return (
      <div key={"poll-" + p.id} className="rounded-3xl p-4 sm:p-6 border border-purple-400/30 overflow-hidden relative" style={{ background: "linear-gradient(125deg, rgba(168,85,247,.22) 0%, rgba(17,17,17,.95) 45%, rgba(34,197,94,.14) 100%)" }}>
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl sm:text-4xl leading-none">{p.open ? "🗳️" : "🏆"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black tracking-widest uppercase" style={{ color: p.open ? "#d8b4fe" : "#facc15" }}>{p.open ? "Votación de la comunidad" : "Votación cerrada"}</p>
            <p className="text-lg sm:text-2xl font-black text-white leading-tight">{p.q}</p>
            <p className="text-xs text-gray-400 mt-1">{p.total} voto{p.total === 1 ? "" : "s"}{p.open ? (p.mine ? " · Puedes cambiar tu voto mientras siga abierta" : accountUser ? " · Toca una opción para votar" : " · Inicia sesión para votar") : ""}</p>
          </div>
        </div>
        <div className={"grid gap-2.5 " + (compact ? "" : "sm:grid-cols-2")}>
          {p.opts.map((o) => {
            const pct = p.total ? Math.round((o.count / p.total) * 100) : 0;
            const mine = p.mine === o.id, win = !p.open && p.winner === o.id;
            const mv = o.movieId ? catalogAll.find((x) => String(x.id) === o.movieId) : undefined;
            return (
              <button key={o.id} disabled={!p.open || !!pollBusy} onClick={() => votePoll(p, o.id)} className={"relative text-left rounded-2xl overflow-hidden border flex items-center gap-3 p-2.5 pr-4 cursor-pointer disabled:cursor-default focus:outline-none focus:ring-4 focus:ring-purple-400 transition " + (mine ? "border-green-400 bg-green-500/10" : win ? "border-yellow-400 bg-yellow-400/10" : "border-white/10 bg-black/30 hover:border-purple-300/60")}>
                {showRes && <span className="absolute inset-y-0 left-0 rounded-2xl" style={{ width: pct + "%", background: win ? "rgba(250,204,21,.18)" : mine ? "rgba(34,197,94,.18)" : "rgba(168,85,247,.16)", transition: "width .6s cubic-bezier(.2,.7,.2,1)" }} />}
                {o.img ? <img decoding="async" src={o.img} alt="" loading="lazy" className="relative w-10 h-14 rounded-lg object-cover shrink-0" /> : <span className="relative w-10 h-14 rounded-lg bg-white/5 flex items-center justify-center text-xl shrink-0">🎬</span>}
                <span className="relative flex-1 min-w-0">
                  <span className="block text-sm sm:text-base font-bold text-white truncate">{win ? "🏆 " : ""}{o.label}</span>
                  <span className="block text-[11px] text-gray-400">{mine ? "✔ Tu voto" : win ? "¡Ganadora!" : mv ? "Ya está en Cineverso" : p.open ? "Votar" : ""}</span>
                </span>
                {showRes && <span className="relative text-sm font-black" style={{ color: win ? "#facc15" : "#e9d5ff" }}>{pct}%</span>}
                {pollBusy === p.id + ":" + o.id && <span className="relative text-xs text-gray-300">…</span>}
              </button>
            );
          })}
        </div>
        {!p.open && p.winner && (() => { const w = p.opts.find((o) => o.id === p.winner); const mv = w && w.movieId ? catalogAll.find((x) => String(x.id) === w.movieId) : undefined; return mv ? <button onClick={() => setSelectedMovie(mv)} className="mt-4 bg-white text-black font-black text-sm px-5 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">▶ Ver «{mv.title}»</button> : null; })()}
        {!accountUser && p.open && <button onClick={() => setActiveTab("cuenta")} className="mt-4 bg-purple-500 hover:bg-purple-400 text-white font-black text-sm px-5 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/60">Iniciar sesión para votar</button>}
      </div>
    );
  };
  const wrapCard = async (): Promise<Blob | null> => {
    let b: Blob | null = null;
    try { b = await makeWrapCard(true); } catch (e) { b = null; }
    if (!b) { try { b = await makeWrapCard(false); } catch (e) { b = null; } }
    return b;
  };
  const shareWrap = async (target: "share" | "download" | "whatsapp" | "facebook") => {
    if (wrapBusy) return;
    // Enlace con vista previa: WhatsApp y Facebook muestran la tarjeta como IMAGEN al pegar este enlace
    const q = new URLSearchParams({
      n: activeProfile.name, t: String(wrapStats.titles), h: String(wrapStats.hours), g: wrapStats.topGenres.join(","),
      p: wrapStats.pers.t.replace(/[^\u0000-\u024F\s]/g, "").trim(), b: String(wrapStats.badges), f: isOwner ? "1" : "0", y: String(wrapYear),
      i: wrapStats.top && /^https:\/\//.test(wrapStats.top.bgImage || "") ? wrapStats.top.bgImage : "",
    });
    const url = window.location.origin + "/resumen?" + q.toString();
    const text = "🍿 Mi año en Cineverso Mágico: " + wrapStats.titles + " títulos, " + wrapStats.hours + " horas de cine y mi personalidad es «" + wrapStats.pers.t + "». ¿Y tú?";
    if (target === "whatsapp") { window.open("https://wa.me/?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener"); return; }
    if (target === "facebook") { window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url), "_blank", "noopener"); return; }
    setWrapBusy(true);
    const blob = await wrapCard();
    setWrapBusy(false);
    if (!blob) { showToast("No se pudo crear la imagen en este dispositivo."); return; }
    const file = new File([blob], "mi-año-en-cineverso-" + wrapYear + ".png", { type: "image/png" });
    const nav: any = navigator;
    if (target === "share" && nav.canShare && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], title: "Mi año en Cineverso", text }); return; } catch (e) { return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast(target === "share" ? "📥 Imagen descargada. Súbela a tus historias de Instagram, TikTok, Facebook o WhatsApp." : "📥 ¡Imagen descargada!", 6000);
  };

  useEffect(() => {
    setNowTs(Date.now());
    const t = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const movieTime = (m: Movie) => m.addedAt || (typeof m.id === "number" && m.id > 1e12 ? m.id : 0);
  const notifications = (() => {
    const out: { key: string; title: string; text: string; time: number; movie: Movie }[] = [];
    if (!nowTs) return out;
    const limit = nowTs - 45 * 24 * 3600 * 1000;
    catalogAll.forEach((m) => {
      const t = movieTime(m);
      // Si sigue su saga o su género, el aviso lo dice
      const fSaga = m.saga && follows.sagas.indexOf(m.saga) !== -1 ? m.saga : "";
      const fGenre = fSaga ? "" : ([m.tag].concat(m.genres || []).filter(Boolean) as string[]).find((g) => follows.genres.indexOf(g) !== -1) || "";
      const fText = fSaga ? "🔔 Llegó otra de " + fSaga : fGenre ? "🔔 Nueva de " + fGenre.toLowerCase() + " (lo sigues)" : "";
      if (t > limit) out.push({ key: "m-" + m.id, title: m.title, text: m.comingSoon ? (fText ? fText.replace("Llegó", "Pronto llega") + " · " : "") + "Próximo estreno: " + fmtRelease(m.releaseDate) : fText || (m.type === "serie" ? "Nueva serie disponible" : "Nueva película disponible"), time: t, movie: m });
      (m.episodes || []).forEach((ep) => {
        if (ep.addedAt && ep.addedAt > limit && ep.addedAt - t > 60000) {
          out.push({ key: "e-" + m.id + "-" + ep.id, title: m.title, text: "Nuevo episodio: T" + ep.season + ":E" + ep.number + " · " + ep.title, time: ep.addedAt, movie: m });
        }
      });
    });
    // Reacciones a mis reseñas
    const REACT_TEXT: Record<string, string> = { "❤️": "le encantó", "😂": "le hizo reír", "😮": "le sorprendió", "👏": "aplaudió" };
    inbox.forEach((x) => {
      const mv = catalogAll.find((m) => String(m.id) === x.movieId);
      if (!mv) return;
      const t = x.emoji === "👏" ? x.emoji + " " + x.from + " aplaudió tu reseña" : x.emoji + " A " + x.from + " " + (REACT_TEXT[x.emoji] || "le gustó") + " tu reseña";
      out.push({ key: "r-" + x.at + "-" + x.from, title: mv.title, text: t, time: x.at, movie: mv });
    });
    return out.sort((a, b) => b.time - a.time).slice(0, 20);
  })();
  const unreadCount = notifications.filter((n) => n.time > notifSeen).length;
  useEffect(() => {
    if (!showNotif) return;
    const t = setTimeout(() => {
      const modals = document.querySelectorAll("[data-tv-modal]");
      const scope = modals.length ? modals[modals.length - 1] : document;
      const el = (scope.querySelector("[data-autofocus]") || scope.querySelector("button")) as HTMLElement | null;
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
    }, 60);
    return () => clearTimeout(t);
  }, [showNotif]);

  const openNotifications = () => {
    setShowNotif((v) => !v);
    if (notifications.length) setNotifSeen(Date.now());
  };
  const timeAgo = (t: number) => {
    const d = Math.max(0, nowTs - t), min = Math.round(d / 60000);
    if (min < 60) return "hace " + Math.max(1, min) + " min";
    const h = Math.round(min / 60);
    if (h < 24) return "hace " + h + " h";
    const days = Math.round(h / 24);
    return "hace " + days + (days === 1 ? " día" : " días");
  };

  // ---------- ¿Quién está viendo? + PIN del perfil Niños ----------
  const [showWho, setShowWho] = useState(false);
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);
  const [pinAction, setPinAction] = useState<"switch" | "account">("switch");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const pinHashOf = (pin: string) => sha256("cv-pin:" + pin);
  useEffect(() => {
    if (!accountUser || !accountLoaded) return;
    let seen = false;
    try { seen = sessionStorage.getItem("cv_who") === "1"; } catch (e) {}
    if (!seen && profiles.filter((p) => p.id !== "admin-rey").length >= 1 && (!isAdminRef.current || loggedInRef.current)) setShowWho(true);
  }, [accountUser, accountLoaded]);
  useEffect(() => {
    if (!showWho && !pinTarget) return;
    const t = setTimeout(() => {
      const modals = document.querySelectorAll("[data-tv-modal]");
      const scope = modals.length ? modals[modals.length - 1] : document;
      const el = (scope.querySelector("[data-autofocus]") || scope.querySelector("[tabindex='0'], input, button")) as HTMLElement | null;
      if (el) { try { el.focus(); } catch (e) {} }
    }, 80);
    return () => clearTimeout(t);
  }, [showWho, pinTarget]);

  const doSwitch = (p: Profile) => {
    setActiveProfile(p);
    setShowWho(false);
    setActiveTab("inicio");
    try { sessionStorage.setItem("cv_who", "1"); } catch (e) {}
    try { window.scrollTo(0, 0); } catch (e) {}
  };
  // Salir del perfil Niños pide el PIN
  const requestProfileSwitch = (p: Profile) => {
    if (activeProfile.isKid && activeProfile.pinHash && p.id !== activeProfile.id) {
      setPinAction("switch"); setPinTarget(p); setPinInput(""); setPinError("");
      return;
    }
    doSwitch(p);
  };
  const openAccountSafe = () => {
    if (activeProfile.isKid && activeProfile.pinHash) {
      setPinAction("account"); setPinTarget(activeProfile); setPinInput(""); setPinError("");
      return;
    }
    setShowWho(false);
    setActiveTab("cuenta");
  };
  const submitPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile.pinHash || pinHashOf(pinInput) !== activeProfile.pinHash) {
      setPinError("PIN incorrecto.");
      setPinInput("");
      return;
    }
    const target = pinTarget;
    setPinTarget(null);
    if (pinAction === "account") { setShowWho(false); setActiveTab("cuenta"); }
    else if (target) doSwitch(target);
  };

  // MI LISTA: solo para quienes iniciaron sesión con su correo
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const inMyList = (m: Movie | null) => !!m && myList.indexOf(m.title) !== -1;
  const toggleMyList = (m: Movie | null) => {
    if (!m) return;
    if (!accountUser) {
      setShowLoginPrompt(true);
      return;
    }
    if (myList.indexOf(m.title) !== -1) {
      setMyList((prev) => prev.filter((t) => t !== m.title));
      showToast("Quitado de Mi Lista.");
    } else {
      setMyList((prev) => (prev.indexOf(m.title) !== -1 ? prev : [m.title].concat(prev)));
      showToast("¡Añadido a Mi Lista!");
    }
  };
  useEffect(() => {
    if (!showLoginPrompt) return;
    const t = setTimeout(() => {
      const modals = document.querySelectorAll("[data-tv-modal]");
      const scope = modals.length ? modals[modals.length - 1] : document;
      const el = scope.querySelector("[data-autofocus]") as HTMLElement | null;
      if (el) { try { el.focus(); } catch (e) {} }
    }, 60);
    return () => clearTimeout(t);
  }, [showLoginPrompt]);

  const goToLogin = () => {
    setShowLoginPrompt(false);
    setIsPlaying(false);
    setSelectedMovie(null);
    setAuthMode("login");
    setActiveTab("cuenta");
    try { window.scrollTo(0, 0); } catch (e) {}
  };

  // Semilla diaria para variar las recomendaciones (se lee en el navegador, no al compilar)
  const [recoSeed, setRecoSeed] = useState(1);
  useEffect(() => {
    try { setRecoSeed(new Date().getDate()); } catch (e) {}
  }, []);

  // Recomendado para ti: géneros de tu lista y de lo que estás viendo
  const recommended = (() => {
    const likedTags: Record<string, number> = {};
    catalog.forEach((m) => {
      const r = ratings[String(m.id)] || 0;
      const w = (myList.indexOf(m.title) !== -1 ? 2 : 0) + (continueWatchingList.some((p) => String(p.id) === String(m.id)) ? 1 : 0) + (r === 1 ? 3 : r === -1 ? -2 : 0);
      if (w && m.tag) likedTags[m.tag] = (likedTags[m.tag] || 0) + w;
    });
    const day = recoSeed;
    const hash = (x: string) => { let h = day; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) % 100000; return h; };
    return catalog
      // Solo lo que todavía no ha visto (ni está en Mi Lista ni marcó 👎)
      .filter((m) => myList.indexOf(m.title) === -1 && ratings[String(m.id)] !== -1 && !seenIds.has(String(m.id)) && !continueWatchingList.some((p) => String(p.id) === String(m.id)))
      .map((m) => ({ m, score: (likedTags[m.tag] || 0) * 1000 + (hash(String(m.id)) % 1000) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.m);
  })();

  // Vista previa flotante (solo con mouse; en TV y celular se abre la ficha normal)
  const [hoverCapable, setHoverCapable] = useState(false);
  const [preview, setPreview] = useState<{ m: Movie; left: number; top: number } | null>(null);
  const previewTimer = useRef<any>(null);
  const previewHover = useRef(false);
  useEffect(() => {
    try { setHoverCapable(!!window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches); } catch (e) {}
    const close = () => setPreview(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, []);
  useEffect(() => { if (selectedMovie) setPreview(null); }, [selectedMovie]);
  const openPreview = (m: Movie, el: HTMLElement) => {
    if (!hoverCapable || tvMode) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const W = 320;
      let left = r.left + r.width / 2 - W / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - W - 12));
      let top = r.top - 24;
      top = Math.max(70, Math.min(top, window.innerHeight - 380));
      setPreview({ m, left, top });
    }, 450);
  };
  const leaveCard = () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setTimeout(() => { if (!previewHover.current) setPreview(null); }, 150);
  };

  const surpriseMe = () => {
    if (!catalog.length) return;
    startSurprise();
  };

  // Progreso de "Continuar viendo" (cada 15 s, al pausar y al cerrar)
  const lastProgressSave = useRef(0);
  const recordProgress = (video: HTMLVideoElement, movie: Movie, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastProgressSave.current < 15000) return;
    lastProgressSave.current = now;
    const time = Math.floor(video.currentTime || 0);
    const duration = Math.floor(video.duration || 0);
    if (!duration || !isFinite(duration) || time < 5) return;
    setContinueWatchingList((prev) => {
      const rest = prev.filter((p) => String(p.id) !== String(movie.id));
      if (duration - time < 60) return rest; // terminada
      const ep = currentEpisodeRef.current;
      return [{ id: movie.id, title: movie.title, img: movie.img || movie.bgImage, time, duration, updatedAt: now, episodeId: ep ? ep.id : undefined, episodeLabel: ep ? "T" + ep.season + ":E" + ep.number + " · " + ep.title : undefined } as ProgressItem].concat(rest).slice(0, 50);
    });
  };

  const formatRemaining = (secs: number) => {
    const m = Math.max(1, Math.round(secs / 60));
    return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min";
  };

  const handleCreateProfile = () => {
    if (!newProfileName) {
      alert("Ingresa un nombre para el perfil.");
      return;
    }

    if (newProfileName.trim().toLowerCase() === "rey" && !isAdmin) {
      setUsernameError("Nombre de Usuario no disponible");
      return;
    }

    const maxProfiles = isGuest ? 3 : 5;
    if (profiles.length >= maxProfiles) {
      alert(`Has alcanzado el límite de ${maxProfiles} perfiles permitidos.`);
      return;
    }

    if (newProfileIsKid && !/^\d{4}$/.test(newProfilePin)) {
      setUsernameError("El perfil Niños necesita un PIN de 4 números (se pide para salir de él).");
      return;
    }
    const newP: Profile = {
      id: Date.now().toString(),
      name: newProfileName,
      avatar: newProfileAvatar,
      isKid: newProfileIsKid,
      pinHash: newProfileIsKid ? pinHashOf(newProfilePin) : undefined
    };

    const updatedProfiles = [...profiles, newP];
    setProfiles(updatedProfiles);
    setShowAddProfileModal(false);
    setNewProfileName("");
    setNewProfilePin("");
    setNewProfileIsKid(false);
    setUsernameError("");
  };

  // ---------- Editar perfil (lápiz) ----------
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [editIsKid, setEditIsKid] = useState(false);
  const [editPin, setEditPin] = useState("");
  const [editError, setEditError] = useState("");
  const [editConfirmDelete, setEditConfirmDelete] = useState(false);
  const [editSearch, setEditSearch] = useState("");
  const [editBirthday, setEditBirthday] = useState("");
  const [whoManage, setWhoManage] = useState(false);
  useEffect(() => {
    if (!editProfile) return;
    const t = setTimeout(() => {
      const modals = document.querySelectorAll("[data-tv-modal]");
      const scope = modals.length ? modals[modals.length - 1] : document;
      const el = scope.querySelector("[data-autofocus]") as HTMLElement | null;
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
    }, 80);
    return () => clearTimeout(t);
  }, [editProfile && editProfile.id]);
  const canEditProfile = (p: Profile) => p.id !== "invitado" && p.id !== "admin-rey";
  const openEditProfile = (p: Profile) => {
    if (!canEditProfile(p)) return;
    // Un perfil Niños con PIN no puede editar perfiles sin el PIN
    if (activeProfile.isKid && activeProfile.pinHash) { openAccountSafe(); return; }
    setEditProfile(p);
    setEditName(p.name);
    setEditAvatar(p.avatar);
    setEditIsKid(!!p.isKid);
    setEditPin("");
    setEditError("");
    setEditConfirmDelete(false);
    setEditSearch("");
    setEditBirthday(p.birthday || "");
  };
  const saveEditProfile = () => {
    if (!editProfile) return;
    const name = editName.trim().replace(/\s+/g, " ");
    if (!name) { setEditError("Escribe un nombre para el perfil."); return; }
    // "Rey" está reservado solo para NUEVOS nombres: si el perfil ya se llama así (tu cuenta), se puede guardar igual
    if (name.toLowerCase() === "rey" && !isAdmin && editProfile.name.trim().toLowerCase() !== "rey") { setEditError("Ese nombre no está disponible."); return; }
    if (profiles.some((x) => x.id !== editProfile.id && x.name.trim().toLowerCase() === name.toLowerCase())) { setEditError("Ya tienes un perfil con ese nombre."); return; }
    let pinHash = editProfile.pinHash;
    if (editIsKid) {
      if (editPin) {
        if (!/^\d{4}$/.test(editPin)) { setEditError("El PIN debe tener 4 números."); return; }
        pinHash = pinHashOf(editPin);
      } else if (!pinHash) { setEditError("El perfil Niños necesita un PIN de 4 números."); return; }
    } else pinHash = undefined;
    const bd = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(editBirthday) ? editBirthday : undefined;
    const upd: Profile = { ...editProfile, name, avatar: editAvatar || editProfile.avatar, isKid: editIsKid, pinHash, birthday: bd };
    delete (upd as any).auto;
    setProfiles((list) => list.map((x) => (x.id === upd.id ? upd : x)));
    if (activeProfile.id === upd.id) setActiveProfile(upd);
    setEditProfile(null);
    showToast("Perfil actualizado ✓");
  };
  const deleteEditProfile = () => {
    if (!editProfile) return;
    if (editProfile.id === activeProfile.id) { setEditError("No puedes borrar el perfil que estás usando. Cambia a otro primero."); return; }
    if (!editConfirmDelete) { setEditConfirmDelete(true); return; }
    const id = editProfile.id;
    setProfiles((list) => list.filter((x) => x.id !== id));
    setEditProfile(null);
    showToast("Perfil eliminado");
  };

  const handleSelectProfile = (p: Profile) => {
    requestProfileSwitch(p);
  };

  // ---------- Búsqueda inteligente ----------
  // Encuentra aunque escribas mal ("jugos del ambre"), sin tildes, y también por actor, director, saga, género o año.
  const normTxt = (t: string | undefined) => (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const lev = (a: string, b: string, max: number) => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  };
  const STOP = ["de", "la", "el", "los", "las", "y", "del", "en", "a", "un", "una", "the", "of"];
  // ¿Qué tan bien coincide una palabra buscada con una palabra del título? (0 = nada)
  const wordHit = (q: string, w: string) => {
    if (w === q) return 1.2;
    if (w.startsWith(q)) return q.length >= 3 || w.length <= 3 ? 1 : 0.6;
    if (q.length >= 4) {
      const tol = q.length >= 7 ? 2 : 1;
      if (lev(q, w, tol) <= tol) return 0.75;
      if (w.length > q.length && lev(q, w.slice(0, q.length), tol) <= tol) return 0.65;
    }
    return 0;
  };
  const searchIndex = catalog.map((m) => ({
    m,
    fields: [
      { k: "title", w: 10, words: normTxt(m.title + " " + (m.subtitle || "")).split(" ").filter(Boolean) },
      { k: "saga", w: 7, words: normTxt(m.saga).split(" ").filter(Boolean) },
      { k: "cast", w: 6, words: normTxt(m.cast).split(" ").filter(Boolean) },
      { k: "director", w: 5, words: normTxt(m.director).split(" ").filter(Boolean) },
      { k: "genre", w: 3, words: normTxt(genresOf(m).join(" ")).split(" ").filter(Boolean) },
      { k: "year", w: 2, words: [String(m.year || "")] },
    ],
    titleN: normTxt(m.title + " " + (m.subtitle || "")),
  }));
  const searchQ = normTxt(exploreSearch);
  const searchTokens = searchQ.split(" ").filter((t) => t && STOP.indexOf(t) === -1);
  const searchHits = (() => {
    const out = new Map<string, { score: number; why: string }>();
    if (!searchQ) return out;
    const toks = searchTokens.length ? searchTokens : searchQ.split(" ").filter(Boolean);
    searchIndex.forEach((it) => {
      let score = 0;
      const kinds: Record<string, number> = {};
      for (const t of toks) {
        let best = 0, bestK = "";
        for (const f of it.fields) {
          for (const w of f.words) {
            const h = wordHit(t, w) * f.w;
            if (h > best) { best = h; bestK = f.k; }
          }
        }
        if (!best) return; // todas las palabras deben coincidir
        score += best;
        kinds[bestK] = (kinds[bestK] || 0) + 1;
      }
      if (it.titleN.indexOf(searchQ) !== -1) score += 15;
      const main = Object.keys(kinds).sort((a, b) => kinds[b] - kinds[a])[0];
      let why = "";
      const m = it.m;
      const pick = (list: string) => list.split(",").map((x) => x.trim()).find((x) => toks.every((t) => normTxt(x).split(" ").some((w) => wordHit(t, w) > 0))) || "";
      if (main === "cast") { const a = pick(m.cast || ""); if (a) why = "🎭 " + a; }
      else if (main === "director") { const d = pick(m.director || ""); if (d) why = "🎬 Dir. " + d; }
      else if (main === "saga" && m.saga) why = "🎞️ " + m.saga;
      out.set(String(m.id), { score, why });
    });
    return out;
  })();
  // Personas que coinciden (para los atajos "🎭 Jennifer Lawrence · 4 títulos")
  const searchPeople = (() => {
    if (searchTokens.length === 0 || searchQ.length < 3) return [] as { name: string; role: string; n: number }[];
    const map: Record<string, { name: string; role: string; n: number }> = {};
    catalog.forEach((m) => {
      ([["🎭", m.cast || ""], ["🎬", m.director || ""]] as [string, string][]).forEach(([role, list]) => {
        list.split(",").map((x) => x.trim()).filter(Boolean).forEach((name) => {
          const ws = normTxt(name).split(" ");
          if (!searchTokens.every((t) => ws.some((w) => wordHit(t, w) > 0))) return;
          const k = normTxt(name);
          map[k] = map[k] ? { ...map[k], n: map[k].n + 1 } : { name, role, n: 1 };
        });
      });
    });
    return Object.keys(map).map((k) => map[k]).sort((a, b) => b.n - a.n).slice(0, 4);
  })();
  const [searchFocus, setSearchFocus] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);
  const voiceRef = useRef<any>(null);
  const exploreInputRef = useRef<HTMLInputElement | null>(null);
  // En iPhone/iPad no se muestra: el teclado ya trae su propio micrófono (dictado) y Safari deja el micrófono encendido
  useEffect(() => {
    try {
      const w = window as any;
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
      setVoiceOk(!ios && !tvMode && !!(w.SpeechRecognition || w.webkitSpeechRecognition));
    } catch (e) {}
  }, [tvMode]);
  // El micrófono se apaga solo: al terminar de hablar, a los 8 s, al salir de Explorar o al cambiar de app
  const stopVoice = () => {
    const r = voiceRef.current;
    voiceRef.current = null;
    setListening(false);
    if (r) { try { r.onresult = null; r.onend = null; r.onerror = null; } catch (e) {} try { r.abort(); } catch (e) { try { r.stop(); } catch (e2) {} } }
  };
  useEffect(() => { if (activeTab !== "explorar") stopVoice(); }, [activeTab]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) stopVoice(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", stopVoice);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", stopVoice); stopVoice(); };
  }, []);
  useEffect(() => {
    if (activeTab !== "explorar" || tvMode) return;
    const t = setTimeout(() => { try { if (exploreInputRef.current && !exploreSearch) exploreInputRef.current.focus({ preventScroll: true } as any); } catch (e) {} }, 250);
    return () => clearTimeout(t);
  }, [activeTab]);
  const startVoice = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { showToast("Tu navegador no permite buscar por voz."); return; }
    if (listening || voiceRef.current) { stopVoice(); return; }
    try {
      const r = new SR();
      r.lang = "es-PE"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      const limit = setTimeout(() => { if (voiceRef.current === r) stopVoice(); }, 8000);
      r.onresult = (ev: any) => {
        let txt = "", final = false;
        for (let i = 0; i < ev.results.length; i++) { txt += ev.results[i][0].transcript; if (ev.results[i].isFinal) final = true; }
        setExploreSearch(txt.replace(/[.¿?¡!]+$/g, "").trim());
        if (final) { clearTimeout(limit); stopVoice(); try { exploreInputRef.current && exploreInputRef.current.blur(); } catch (e) {} }
      };
      r.onerror = (ev: any) => { clearTimeout(limit); stopVoice(); if (ev && ev.error === "not-allowed") showToast("Permite el micrófono para buscar por voz 🎤", 6000); };
      r.onend = () => { clearTimeout(limit); if (voiceRef.current === r) { voiceRef.current = null; setListening(false); } };
      voiceRef.current = r;
      setListening(true);
      r.start();
    } catch (e) { stopVoice(); showToast("No se pudo usar el micrófono."); }
  };

  const filteredExploreMovies = catalog.filter((movie) => {
    const matchesSearch = exploreSearch.trim() === "" || searchHits.has(String(movie.id));
    const matchesType = exploreTypeFilter === "todos" || movie.type === exploreTypeFilter;
    const matchesGenre = exploreGenreFilter === "Todos" || (exploreGenreFilter === "Novedades" ? isNewMovie30(movie) : !!(movie.tag && movie.tag.toLowerCase() === exploreGenreFilter.toLowerCase()));
    const matchesYear = exploreYearFilter === "Cualquier año" || movie.year === exploreYearFilter;
    
    return matchesSearch && matchesType && matchesGenre && matchesYear;
  }).sort((a, b) => {
    if (searchQ) return ((searchHits.get(String(b.id)) || { score: 0 }).score) - ((searchHits.get(String(a.id)) || { score: 0 }).score);
    return exploreGenreFilter === "Novedades" ? (b.addedAt || 0) - (a.addedAt || 0) : 0;
  });
  const searchSuggest = searchQ ? catalog.filter((m) => searchHits.has(String(m.id))).sort((a, b) => (searchHits.get(String(b.id)) as any).score - (searchHits.get(String(a.id)) as any).score).slice(0, 6) : [];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-green-500 selection:text-black overflow-x-hidden pb-24 lg:pb-0">
      <script dangerouslySetInnerHTML={{ __html: TV_GUARD_JS }} />
      <style dangerouslySetInnerHTML={{ __html: LEGACY_CSS }} />
      {showSplash && (
        <div className="cv-splash" style={{ opacity: splashFade ? 0 : 1 }} aria-hidden="true">
          <img src="/icons/icon-512.png" alt="" className="cv-splash-logo" />
          <div className="cv-splash-name">Cineverso Mágico</div>
          <div className="cv-splash-bar"><i /></div>
        </div>
      )}
      {preview && (
        <div
          onMouseEnter={() => { previewHover.current = true; }}
          onMouseLeave={() => { previewHover.current = false; setPreview(null); }}
          className="fixed z-[45] bg-[#181818] rounded-xl overflow-hidden shadow-2xl border border-gray-800"
          style={{ left: preview.left, top: preview.top, width: 320, animation: "cvPreview .18s ease-out" }}
        >
          <div className="relative cursor-pointer" style={{ height: 180 }} onClick={() => { setSelectedMovie(preview.m); setPreview(null); }}>
            <img decoding="async" loading="lazy" src={wideSrc(preview.m)} alt={preview.m.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent" />
            <p className="absolute left-3 bottom-2 right-3 text-base font-black text-white truncate">{preview.m.title}</p>
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={() => { const m = preview.m; setPreview(null); startPlayback(m); }} aria-label="Reproducir" className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center cursor-pointer hover:bg-gray-200">
                <Play className="w-4 h-4 fill-black ml-0.5" />
              </button>
              <button onClick={() => toggleMyList(preview.m)} aria-label="Mi Lista" className="w-9 h-9 rounded-full border border-gray-500 text-white flex items-center justify-center cursor-pointer hover:border-white">
                {inMyList(preview.m) ? <Check className="w-4 h-4 text-green-400" /> : <Plus className="w-4 h-4" />}
              </button>
              <button onClick={() => rateMovie(preview.m, 1)} aria-label="Me gusta" className={`w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer ${ratings[String(preview.m.id)] === 1 ? "bg-green-500 border-green-500 text-black" : "border-gray-500 text-white hover:border-white"}`}>
                <ThumbsUp className="w-4 h-4" />
              </button>
              <button onClick={() => { setSelectedMovie(preview.m); setPreview(null); }} aria-label="Más información" className="ml-auto w-9 h-9 rounded-full border border-gray-500 text-white flex items-center justify-center cursor-pointer hover:border-white">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold flex-wrap">
              <span className="text-green-400">★ {preview.m.rating}</span>
              <span className="text-gray-300">{preview.m.year}</span>
              {preview.m.ageRating && <span className="border border-gray-500 text-gray-200 px-1 rounded">{preview.m.ageRating}</span>}
              {preview.m.duration && <span className="text-gray-300">{preview.m.duration}</span>}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{preview.m.desc}</p>
            <p className="text-[11px] text-gray-300">{(preview.m.genres && preview.m.genres.length ? preview.m.genres : [preview.m.tag]).join(" · ")}</p>
          </div>
        </div>
      )}
      {/* Navegación Superior Optimizada para Smart TV */}
      <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-6 md:px-12 h-14 lg:h-16 bg-black/90 backdrop-blur-md border-b border-gray-900/80 gap-3">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <div onClick={() => setActiveTab("inicio")} tabIndex={0} role="button" aria-label="Inicio" className="flex items-center gap-2 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-green-500 rounded-lg p-1">
            <img src="/icons/icon-192.png" alt="CV" className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg" />
            <span className="whitespace-nowrap text-base sm:text-xl xl:text-2xl font-black tracking-wide bg-gradient-to-r from-green-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent flex items-center gap-1.5">
              Cineverso Magico <Sparkle className="hidden sm:block w-4 h-4 text-emerald-400 animate-pulse" />
            </span>
          </div>
          <div className="hidden lg:flex items-center gap-2 xl:gap-4 text-sm font-medium text-gray-300 whitespace-nowrap">
            <button 
              onClick={() => setActiveTab("inicio")} 
              className={`px-3 py-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-green-500 ${activeTab === "inicio" ? "bg-white/10 text-white font-bold border border-green-500/50" : "hover:text-green-400"}`}
            >
              Inicio
            </button>
            <button 
              onClick={() => setActiveTab("explorar")} 
              className={`px-3 py-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-green-500 ${activeTab === "explorar" ? "bg-white/10 text-white font-bold border border-green-500/50" : "hover:text-green-400"}`}
            >
              Explorar
            </button>
            {!kidsMode && (
            <button 
              onClick={() => setActiveTab("tv")} 
              className={`px-3 py-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-green-500 ${activeTab === "tv" ? "bg-white/10 text-white font-bold border border-green-500/50" : "hover:text-green-400"}`}
            >
              TV en vivo
            </button>
            )}
            <button 
              onClick={() => setActiveTab("milista")} 
              className={`px-3 py-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-green-500 ${activeTab === "milista" ? "bg-white/10 text-white font-bold border border-green-500/50" : "hover:text-green-400"}`}
            >
              Mi Lista ({myList.length})
            </button>
            
            {isAdmin && (
              <button 
                onClick={() => setActiveTab("admin")} 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-green-400 font-bold focus:outline-none focus:ring-2 focus:ring-green-500 ${activeTab === "admin" ? "bg-green-500/10 border border-green-500" : "hover:text-green-300"}`}
              >
                <Settings className="w-4 h-4" /> Panel de administración
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-gray-300 ml-auto">
          {isAdmin && (
            <button onClick={() => setActiveTab("admin")} className="lg:hidden p-2 rounded-full text-green-400 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Panel de administración">
              <Settings className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={surpriseMe}
            className="flex items-center gap-1.5 p-2 2xl:px-3 2xl:py-1.5 rounded-full 2xl:rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            aria-label="Sorpréndeme"
          >
            <Shuffle className="w-5 h-5 2xl:w-4 2xl:h-4" /> <span className="hidden 2xl:inline">Sorpréndeme</span>
          </button>
          <button 
            onClick={() => setActiveTab("explorar")}
            className="p-2 rounded-full hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            aria-label="Buscar"
          >
            <Search className="w-5 h-5 cursor-pointer hover:text-white" />
          </button>
          
          {kidsMode && <span className="hidden sm:inline text-[11px] font-black text-black bg-yellow-400 px-2 py-0.5 rounded-full">NIÑOS</span>}
          <div className="relative">
            <button
              onClick={openNotifications}
              aria-label="Notificaciones"
              className="relative p-2 rounded-full text-gray-300 hover:text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-green-500 text-black text-[10px] font-black flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </button>
            {showNotif && (
              <>
                {/* fondo: tocar fuera cierra el panel */}
                <div className="fixed inset-0" style={{ zIndex: 48, background: "rgba(0,0,0,.35)" }} onClick={() => setShowNotif(false)} aria-hidden="true" />
                <div
                  data-tv-modal
                  role="dialog"
                  aria-label="Novedades"
                  className="fixed left-2 right-2 sm:left-auto sm:right-4 md:right-12 bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                  style={{ top: 66, zIndex: 49, maxHeight: "calc(100vh - 160px)", width: "auto", maxWidth: 440 }}
                >
                  <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 shrink-0">
                    <Bell className="w-4 h-4 text-green-400" />
                    <span className="text-base font-bold text-white">Novedades</span>
                    <button
                      data-close-on-back
                      onClick={() => setShowNotif(false)}
                      className="ml-auto text-gray-400 hover:text-white p-2 -mr-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      aria-label="Cerrar"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Activar avisos: cambia según el dispositivo */}
                  <div className="px-4 py-3 border-b border-gray-800 shrink-0">
                    {pushState === "subscribed" ? (
                      <p className="text-xs text-green-400 font-bold">✔ Avisos activados en este dispositivo</p>
                    ) : tvMode || pushState === "unsupported" ? (
                      <p className="text-xs text-gray-400">Este dispositivo no permite avisos emergentes. Aquí verás siempre las novedades.</p>
                    ) : pushState === "ios-install" ? (
                      <div className="text-xs text-gray-300 space-y-1">
                        <p className="font-bold text-white">🔔 Avisos en iPhone / iPad</p>
                        <p>1. Toca el botón <b>Compartir</b> de Safari (cuadro con flecha ↑).</p>
                        <p>2. Elige <b>"Agregar a pantalla de inicio"</b>.</p>
                        <p>3. Abre Cineverso desde ese ícono y vuelve aquí para activar los avisos.</p>
                      </div>
                    ) : pushState === "denied" ? (
                      <p className="text-xs text-yellow-300">Bloqueaste los avisos. Para activarlos toca el candado 🔒 junto a la dirección de la página → Notificaciones → Permitir.</p>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <p className="text-xs text-gray-300 flex-1">Recibe un aviso cuando agreguemos películas o estrenos, aunque tengas la página cerrada.</p>
                        <button
                          data-autofocus
                          onClick={enablePush}
                          className="shrink-0 bg-white hover:bg-gray-200 text-black text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                        >
                          🔔 Activar avisos
                        </button>
                      </div>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-sm text-gray-500 text-center">No hay novedades por ahora.</p>
                  ) : (
                    <div className="overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: "touch" }}>
                      {notifications.map((n) => (
                        <button
                          key={n.key}
                          onClick={() => { setShowNotif(false); setSelectedMovie(n.movie); }}
                          className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-[#1c1c1c] border-b border-gray-900 focus:outline-none focus:bg-[#1c1c1c] focus:ring-2 focus:ring-inset focus:ring-green-500"
                        >
                          <img decoding="async" src={wideSrc(n.movie)} alt="" loading="lazy" className="shrink-0 rounded-lg object-cover bg-gray-900" style={{ width: 96, height: 54 }} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-white line-clamp-2 leading-snug">{n.title}</span>
                            <span className="block text-xs text-gray-400 line-clamp-2">{n.text}</span>
                            <span className="block text-[11px] text-gray-500 mt-0.5">{timeAgo(n.time)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <div 
            onClick={() => (accountUser ? setShowWho(true) : setActiveTab("cuenta"))} 
            tabIndex={0}
            className="shrink-0 flex items-center gap-2 cursor-pointer bg-[#121212] p-0.5 sm:p-1 sm:pr-3 rounded-xl border border-gray-800 hover:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition touch-manipulation"
          >
            <img src={activeProfile.avatar} alt={activeProfile.name} className="w-8 h-8 sm:w-7 sm:h-7 shrink-0 rounded-lg object-cover object-top bg-gray-900" />
            <span className="hidden sm:inline text-xs font-bold text-white max-w-[100px] truncate">{activeProfile.name}</span>
          </div>
        </div>
      </nav>

      {/* VISTA INICIO */}
      {activeTab === "inicio" && catalog.length === 0 && (
        <div className="pt-28 pb-24 px-6 sm:px-12 max-w-4xl mx-auto text-center space-y-5">
          <img src="/icons/icon-192.png" alt="Cineverso Mágico" className="w-20 h-20 rounded-2xl mx-auto" />
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white">Cineverso <span className="text-green-400">Mágico</span></h1>
          <p className="text-lg sm:text-xl text-gray-300">Películas, series y TV en vivo gratis 🍿 Estrenos, sagas completas, reseñas y una comunidad para pedir lo que quieras ver.</p>
          <p className="text-sm text-gray-500">{catalogReady ? "No se pudo cargar el catálogo. Revisa tu conexión y vuelve a intentarlo." : "Cargando el catálogo…"}</p>
          {catalogReady && <button onClick={() => window.location.reload()} className="bg-white text-black font-bold px-6 py-3 rounded-xl cursor-pointer">Reintentar</button>}
        </div>
      )}
      {activeTab === "inicio" && catalog.length > 0 && (() => {
        const posterCard = (m: Movie, key: string) => (
          <div
            key={key}
            onClick={() => setSelectedMovie(m)}
            onMouseEnter={(e) => openPreview(m, e.currentTarget)}
            onMouseLeave={leaveCard}
            tabIndex={0}
            className="group shrink-0 cursor-pointer rounded-xl focus:outline-none focus:ring-4 focus:ring-green-500"
            style={{ width: 160 }}
          >
            <div className="relative overflow-hidden rounded-xl bg-gray-900 border border-gray-800 group-hover:border-green-500" style={{ width: 160, height: 240 }}>
              <img decoding="async" src={posterSrc(m)} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
              {m.tag && <span className="absolute top-2 left-2 text-[10px] text-green-400 font-bold uppercase bg-black/70 px-2 py-0.5 rounded">{m.tag}</span>}
              {inMyList(m) && <span className="absolute top-2 right-2 bg-green-500 text-black rounded-full p-0.5"><Check className="w-3 h-3" /></span>}
              {commStars[String(m.id)] && commStars[String(m.id)].count > 0 && <span className={"absolute right-2 bg-black/80 " + (inMyList(m) ? "top-8" : "top-2") + " text-yellow-400 text-[10px] font-black px-1.5 py-0.5 rounded"}>★ {commStars[String(m.id)].avg.toFixed(1)}</span>}
              {isNewMovie(m) && <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-black tracking-wider text-white bg-red-600 py-0.5">NUEVO</span>}
            </div>
            <h4 className="text-xs sm:text-sm font-semibold mt-2 text-gray-200 truncate group-hover:text-green-400">{m.title}</h4>
          </div>
        );
        const row = (title: string, items: Movie[], keyPrefix: string, icon?: any, follow?: { kind: "saga" | "genre"; name: string }) =>
          items.length ? (
            <section key={keyPrefix}>
              <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white flex items-center gap-2">
                {icon}<span className="min-w-0 truncate">{title}</span>
                {follow && (
                  <button onClick={() => toggleFollowTopic(follow.kind, follow.name)} className={"shrink-0 ml-1 text-[11px] sm:text-xs font-black px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 " + (isFollowing(follow.kind, follow.name) ? "bg-green-500 text-black border-green-500" : "bg-white/5 text-gray-200 border-white/15 hover:border-green-400")} aria-pressed={isFollowing(follow.kind, follow.name)}>
                    {isFollowing(follow.kind, follow.name) ? "✓ Siguiendo" : "🔔 Seguir"}
                  </button>
                )}
              </h2>
              <Rail className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                {items.map((m) => posterCard(m, keyPrefix + "-" + m.id))}
              </Rail>
            </section>
          ) : null;
        const groups: Record<string, Movie[]> = {};
        const groupOrder: string[] = [];
        catalog.forEach((m) => {
          const g = m.tag || "Otros";
          if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
          groups[g].push(m);
        });
        // Top 10: lo más visto de la semana; si aún no hay datos, lo más nuevo
        const topList: Movie[] = [];
        topIds.forEach((id) => { const mv = catalog.find((x) => String(x.id) === id); if (mv && topList.length < 10) topList.push(mv); });
        catalog.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).forEach((mv) => { if (topList.length < 10 && topList.indexOf(mv) === -1) topList.push(mv); });
        const topIsReal = topIds.some((id) => catalog.some((x) => String(x.id) === id));
        // Novedades: lo agregado en los últimos 30 días, lo más nuevo primero
        const novedades = catalog.filter(isNewMovie30).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        // Sagas con 2 o más títulos
        const sagas: Record<string, Movie[]> = {};
        catalog.forEach((mv) => { if (mv.saga) { (sagas[mv.saga] = sagas[mv.saga] || []).push(mv); } });
        const sagaNames = Object.keys(sagas).filter((k) => sagas[k].length >= 2);
        const continueItems = continueWatchingList
          .map((p) => ({ p, m: catalog.find((x) => String(x.id) === String(p.id)) }))
          .filter((x) => !!x.m) as { p: ProgressItem; m: Movie }[];
        return (
          <div className="pt-14 lg:pt-16">
            {/* Portada */}
            <div
              className="relative w-full bg-cover bg-center flex items-end overflow-hidden"
              style={{ backgroundImage: `url(${wideSrc(heroMovie, true)})`, minHeight: "68vh" }}
              onMouseEnter={() => setHeroPaused(true)}
              onMouseLeave={() => { if (!heroTrailerOn) setHeroPaused(false); }}
            >
              {heroTrailerOn && heroMovie.trailerUrl && (
                youtubeId(heroMovie.trailerUrl) ? (
                  <YtBg
                    key={"yt-" + heroMovie.id}
                    vid={youtubeId(heroMovie.trailerUrl)}
                    muted={heroMuted}
                    title={"Tráiler de " + heroMovie.title}
                    onReady={setHeroTrailerReady}
                    style={{ position: "absolute", top: "50%", left: "50%", width: "177.78vh", minWidth: "100%", height: "56.25vw", minHeight: "100%", transform: "translate(-50%,-50%) scale(1.36)", border: 0, pointerEvents: "none", opacity: heroTrailerReady ? 1 : 0, transition: "opacity .8s" }}
                  />
                ) : (
                  <video
                    key={"tr-" + heroMovie.id}
                    src={heroMovie.trailerUrl}
                    autoPlay
                    muted={heroMuted}
                    ref={(v) => { if (v && v.muted !== heroMuted) { v.muted = heroMuted; if (!heroMuted) { v.volume = 1; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); } } }}
                    playsInline
                    preload="auto"
                    tabIndex={-1}
                    onPlaying={() => setHeroTrailerReady(true)}
                    onEnded={() => { setHeroTrailerOn(false); setHeroIndex((i) => i + 1); }}
                    onError={() => setHeroTrailerOn(false)}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", opacity: heroTrailerReady ? 1 : 0, transition: "opacity .8s" }}
                  />
                )
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-black/60" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/60 to-transparent" />
              <div className="relative z-10 px-4 sm:px-6 md:px-12 max-w-3xl w-full pb-14 pt-10">
                <h1 className={(heroMovie.title.length > 38 ? "text-2xl sm:text-4xl md:text-5xl" : "text-3xl sm:text-5xl md:text-6xl") + " font-black tracking-tight uppercase leading-tight text-white drop-shadow-lg"}>
                  {heroMovie.title}
                  {heroMovie.subtitle && <span className="block text-xl sm:text-3xl text-orange-500 mt-1 font-extrabold">{heroMovie.subtitle}</span>}
                </h1>
                <div className="flex items-center gap-3 my-3 sm:my-4 text-xs sm:text-sm font-semibold flex-wrap">
                  <span className="text-green-400 font-bold">★ {heroMovie.rating}</span>
                  <span className="text-gray-300">{heroMovie.year}</span>
                  {heroMovie.ageRating && <span className="border border-gray-400 text-gray-200 px-1.5 rounded text-[11px] font-bold">{heroMovie.ageRating}</span>}
                  {heroMovie.duration && <span className="text-gray-300">{heroMovie.duration}</span>}
                  <span className="bg-[#121212] border border-gray-800 text-gray-200 px-2.5 py-0.5 rounded font-medium">{heroMovie.tag}</span>
                </div>
                <p className="text-gray-300 text-xs sm:text-sm md:text-base leading-relaxed mb-6 line-clamp-3 max-w-2xl" style={{ transition: "opacity .6s", opacity: heroTrailerReady ? 0.55 : 1 }}>{heroMovie.desc}</p>
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    data-autofocus-home
                    onClick={() => startPlayback(heroMovie)}
                    onFocus={() => setHeroPaused(true)}
                    onBlur={() => setHeroPaused(false)}
                    className="flex-1 sm:flex-none justify-center min-w-0 flex items-center gap-2 bg-white text-black font-bold px-4 sm:px-6 py-3 rounded-xl hover:bg-gray-200 focus:outline-none focus:ring-4 focus:ring-green-500 transition cursor-pointer text-sm sm:text-base shadow-lg whitespace-nowrap"
                  >
                    <Play className="w-5 h-5 fill-black shrink-0" /> Reproducir
                  </button>
                  <button
                    onClick={() => setSelectedMovie(heroMovie)}
                    onFocus={() => setHeroPaused(true)}
                    onBlur={() => setHeroPaused(false)}
                    className="shrink-0 flex items-center gap-2 bg-[#121212]/90 text-white font-medium px-4 sm:px-5 py-3 rounded-xl border border-gray-800 hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-green-500 transition cursor-pointer text-sm sm:text-base whitespace-nowrap"
                  >
                    <Info className="w-5 h-5" /> <span className="hidden sm:inline">Más información</span><span className="sm:hidden">Info</span>
                  </button>
                  <button
                    onClick={() => toggleMyList(heroMovie)}
                    onFocus={() => setHeroPaused(true)}
                    onBlur={() => setHeroPaused(false)}
                    className="shrink-0 p-3 rounded-full bg-[#121212]/90 border border-gray-600 hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-green-500 transition cursor-pointer"
                    aria-label={inMyList(heroMovie) ? "Quitar de Mi Lista" : "Agregar a Mi Lista"}
                  >
                    {inMyList(heroMovie) ? <Check className="w-5 h-5 text-green-400" /> : <Plus className="w-5 h-5" />}
                  </button>
                  {/* Sonido del tráiler: en la misma fila que los botones, al final (celular, PC y TV) */}
                  {heroTrailerOn && heroTrailerReady && heroMovie.trailerUrl && (
                    <button
                      onClick={() => setHeroMuted((m) => !m)}
                      onFocus={() => setHeroPaused(true)}
                      onBlur={() => setHeroPaused(false)}
                      aria-label={heroMuted ? "Activar sonido del tráiler" : "Silenciar tráiler"}
                      className="shrink-0 p-3 rounded-full bg-black/40 border border-gray-500 text-white hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-green-500 transition cursor-pointer"
                    >
                      {heroMuted ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {heroList.length > 1 && (
                <div className="absolute z-10 bottom-5 left-0 right-0 flex justify-center gap-2">
                  {heroList.map((m, i) => (
                    <button
                      key={"dot-" + m.id}
                      onClick={() => setHeroIndex(i)}
                      aria-label={"Ver " + m.title}
                      className="rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                      style={{ height: 6, width: i === heroIndex % heroList.length ? 28 : 8, background: i === heroIndex % heroList.length ? "#fff" : "rgba(255,255,255,.4)" }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="cv-home px-4 sm:px-6 md:px-12 space-y-8 relative z-20 pb-20 w-full overflow-x-hidden mt-2">
              {/* Saludo con personalidad / cumpleaños / fecha especial */}
              {!greetHidden && nowTs > 0 && (
                <div className="cv-greet relative flex items-center gap-4 rounded-2xl px-4 sm:px-5 py-3.5 border border-white/10 overflow-hidden" style={{ background: isBirthday ? "linear-gradient(110deg, rgba(244,114,182,.25), rgba(250,204,21,.18))" : special ? "linear-gradient(110deg, " + special.tone + "33, rgba(255,255,255,.03))" : "linear-gradient(110deg, rgba(34,197,94,.14), rgba(255,255,255,.02))" }}>
                  <span className="text-3xl sm:text-4xl leading-none shrink-0">{isBirthday ? "🎂" : special ? special.icon : "👋"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-black text-white">{isBirthday ? "¡Feliz cumpleaños, " + activeProfile.name + "! 🎉" : greetText}</p>
                    <p className="text-xs sm:text-sm text-gray-300 truncate">
                      {isBirthday ? "Hoy es tu día: la película la eliges tú. ¡Que lo disfrutes!" : special ? special.text : resumeMovie ? "¿Seguimos con «" + resumeMovie.title + "»?" : "¿Qué te provoca ver hoy?"}
                    </p>
                  </div>
                  {resumeMovie && !isBirthday && !special && (
                    <button onClick={() => setSelectedMovie(resumeMovie)} className="shrink-0 bg-white text-black font-bold text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">▶ Seguir</button>
                  )}
                  {todayStr.slice(5, 7) === "12" && accountUser && !resumeMovie && (
                    <button onClick={() => { setWrapStep(0); setWrapOpen(true); }} className="shrink-0 bg-green-500 text-black font-bold text-xs sm:text-sm px-3 py-2 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/60">🎁 Mi año</button>
                  )}
                  <button onClick={() => setGreetHidden(true)} aria-label="Cerrar saludo" className="shrink-0 w-8 h-8 rounded-full text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">✕</button>
                </div>
              )}
              {/* Diciembre: invitación al resumen anual */}
              {todayStr.slice(5, 7) === "12" && accountUser && wrapStats.titles > 0 && (
                <section>
                  <button onClick={() => { setWrapStep(0); setWrapOpen(true); }} className="w-full text-left rounded-3xl p-5 sm:p-7 flex items-center gap-5 cursor-pointer border border-green-500/30 focus:outline-none focus:ring-4 focus:ring-green-500" style={{ background: "linear-gradient(115deg, #0b2a17 0%, #101010 55%, #2a1748 100%)" }}>
                    <span className="text-5xl">🎁</span>
                    <span className="flex-1">
                      <span className="block text-xs font-black tracking-widest text-green-400 uppercase">Ya está listo</span>
                      <span className="block text-xl sm:text-3xl font-black text-white">Tu año en Cineverso {wrapYear}</span>
                      <span className="block text-sm text-gray-300">{wrapStats.titles} títulos · {wrapStats.hours} horas · descubre tu personalidad cinéfila</span>
                    </span>
                    <span className="hidden sm:inline-block bg-white text-black font-black px-5 py-3 rounded-2xl">Ver mi resumen ›</span>
                  </button>
                </section>
              )}
              {/* Fila especial del día (Halloween, San Valentín, Navidad…) */}
              {special && specialRow.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">{special.icon} Especial de hoy: {special.genre}</h2>
                  <Rail className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {specialRow.map((m) => posterCard(m, "sp-" + m.id))}
                  </Rail>
                </section>
              )}
              {/* Continuar viendo (tarjetas horizontales con progreso) */}
              {continueItems.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">Continuar viendo</h2>
                  <Rail className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {continueItems.map(({ p, m }) => {
                      const pct = Math.min(100, Math.round((p.time / p.duration) * 100));
                      return (
                        <div
                          key={"cw-" + p.id}
                          onClick={() => startPlayback(m)}
                          tabIndex={0}
                          className="group shrink-0 relative overflow-hidden rounded-xl bg-gray-900 border border-gray-800 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                          style={{ width: 300, height: 168 }}
                        >
                          <img decoding="async" src={wideSrc(m)} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          <div className="absolute left-3 right-3 bottom-4">
                            <p className="text-sm font-bold text-white truncate">{m.title}</p>
                            <p className="text-[11px] text-gray-300 truncate">{p.episodeLabel ? p.episodeLabel + " · " : ""}Quedan {formatRemaining(p.duration - p.time)}</p>
                          </div>
                          <div className="absolute left-0 right-0 bottom-0 h-1 bg-gray-700">
                            <div className="h-full bg-green-500" style={{ width: pct + "%" }} />
                          </div>
                        </div>
                      );
                    })}
                  </Rail>
                </section>
              )}

              {/* Votación de la comunidad */}
              {polls.length > 0 && <section>{pollCard(polls[0], false)}</section>}
              {/* Retos del mes */}
              {challenges && (
                <section>
                  <div className="rounded-3xl p-4 sm:p-6 border border-yellow-400/25 relative overflow-hidden" style={{ background: "linear-gradient(120deg, rgba(250,204,21,.14) 0%, rgba(17,17,17,.96) 42%, rgba(34,197,94,.12) 100%)" }}>
                    <div className="flex items-start gap-3 mb-4">
                      <span className="text-3xl sm:text-4xl leading-none">{challenges.all ? "🏅" : "🏆"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black tracking-widest uppercase text-yellow-300">Retos de {MONTHS[parseInt(challenges.key.slice(5, 7), 10) - 1]}</p>
                        <p className="text-lg sm:text-2xl font-black text-white leading-tight">{challenges.icon} {challenges.name}</p>
                        <p className="text-xs text-gray-400 mt-1">{challenges.all ? "¡Completaste todo! Ganaste la insignia «" + challenges.label + "» 🎉" : "Completa los 3 retos y gana la insignia exclusiva «" + challenges.label + "»."}</p>
                      </div>
                      {challenges.all && <span className="hidden sm:flex shrink-0 w-14 h-14 rounded-full items-center justify-center text-2xl border-2 border-yellow-300" style={{ background: "radial-gradient(circle, rgba(250,204,21,.45), rgba(250,204,21,.05))" }}>{challenges.icon}</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {challenges.list.map((c) => {
                        const pct = Math.min(100, Math.round((Math.min(c.have, c.need) / c.need) * 100));
                        return (
                          <div key={c.id} onClick={() => { if (c.genre && !c.done) { setExploreGenreFilter(c.genre); setActiveTab("explorar"); try { window.scrollTo(0, 0); } catch (e) {} } }} className={"rounded-2xl p-3 border flex flex-col gap-2 " + (c.done ? "bg-yellow-400/10 border-yellow-400/50" : "bg-black/30 border-white/10") + (c.genre && !c.done ? " cursor-pointer hover:border-yellow-300/60" : "")}>
                            <div className="flex items-center gap-2">
                              <span className="text-xl leading-none">{c.done ? "✅" : c.icon}</span>
                              <span className="text-sm font-bold text-white leading-tight flex-1">{c.text}</span>
                              <span className="text-xs font-black" style={{ color: c.done ? "#facc15" : "#9ca3af" }}>{Math.min(c.have, c.need)}/{c.need}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: c.done ? "linear-gradient(90deg,#facc15,#f59e0b)" : "linear-gradient(90deg,#22c55e,#a3e635)", transition: "width .8s cubic-bezier(.2,.7,.2,1)" }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}
              {/* Próximos estrenos */}
              {upcoming.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">Próximos estrenos</h2>
                  <Rail className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {upcoming.map((m) => (
                      <div key={"up-" + m.id} className="shrink-0" style={{ width: 300 }}>
                        <div
                          onClick={() => setSelectedMovie(m)}
                          tabIndex={0}
                          className="relative overflow-hidden rounded-xl bg-gray-900 border border-gray-800 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                          style={{ width: 300, height: 168 }}
                        >
                          <img decoding="async" src={wideSrc(m)} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          <span className="absolute top-2 left-2 bg-green-500 text-black text-[11px] font-black px-2 py-0.5 rounded">ESTRENO {fmtRelease(m.releaseDate).toUpperCase()}</span>
                          <p className="absolute left-3 right-3 bottom-3 text-sm font-bold text-white truncate">{m.title}</p>
                        </div>
                        <button
                          onClick={enablePush}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          {pushState === "subscribed" ? "✔ Te avisaremos" : "🔔 Avísame del estreno"}
                        </button>
                      </div>
                    ))}
                  </Rail>
                </section>
              )}

              {/* Novedades */}
              {novedades.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg sm:text-2xl font-bold text-white">🆕 Novedades</h2>
                    <button onClick={() => { setExploreGenreFilter("Novedades"); setActiveTab("explorar"); try { window.scrollTo(0, 0); } catch (e) {} }} className="text-xs sm:text-sm font-bold text-green-400 hover:underline cursor-pointer rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500">Ver todo ›</button>
                  </div>
                  <Rail className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {novedades.slice(0, 15).map((m) => posterCard(m, "nov-" + m.id))}
                  </Rail>
                </section>
              )}

              {/* Novedades de lo que sigue */}
              {followedNew.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">🔔 Novedades de lo que sigues</h2>
                  <Rail className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {followedNew.map((m) => posterCard(m, "fol-" + m.id))}
                  </Rail>
                </section>
              )}
              {/* Top 10 de la semana (automático) */}
              {catalog.length >= 3 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">{topIsReal ? "Top 10 de la semana" : "Top 10 de hoy"}</h2>
                  <Rail className="flex overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {topList.map((m, i) => (
                      <div key={"top-" + m.id} className="shrink-0 flex items-end" style={{ marginRight: 18 }}>
                        <span
                          aria-hidden="true"
                          style={{ fontSize: "clamp(96px, 22vw, 150px)", lineHeight: 0.8, fontWeight: 900, color: "#050505", WebkitTextStroke: "3px #4b5563", marginRight: -14, letterSpacing: -6, userSelect: "none" }}
                        >
                          {i + 1}
                        </span>
                        <div
                          onClick={() => setSelectedMovie(m)}
                          onMouseEnter={(e) => openPreview(m, e.currentTarget)}
                          onMouseLeave={leaveCard}
                          tabIndex={0}
                          className="relative overflow-hidden rounded-xl bg-gray-900 border border-gray-800 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                          style={{ width: 130, height: 195 }}
                        >
                          <img decoding="async" src={posterSrc(m)} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
                        </div>
                      </div>
                    ))}
                  </Rail>
                </section>
              )}

              {/* Lo mejor valorado por la comunidad */}
              {commTop.map((id) => catalog.find((x) => String(x.id) === id)).filter(Boolean).length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">🏆 Lo mejor valorado por la comunidad</h2>
                  <Rail className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {(commTop.map((id) => catalog.find((x) => String(x.id) === id)).filter(Boolean) as Movie[]).slice(0, 15).map((m) => posterCard(m, "best-" + m.id))}
                  </Rail>
                </section>
              )}
              {/* Listas de la comunidad */}
              {commLists.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">📂 Listas de la comunidad</h2>
                  <Rail className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {commLists.slice(0, 20).map((l) => (
                      <div key={"cl-" + l.id} onClick={() => setViewList(l)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setViewList(l); }} className="shrink-0 w-[240px] cursor-pointer rounded-2xl bg-[#111] border border-gray-800 hover:border-green-500 overflow-hidden focus:outline-none focus:ring-4 focus:ring-green-500">
                        <div className="grid grid-cols-4 h-[96px] bg-gray-900">
                          {listCover(l).map((m) => <img decoding="async" key={"lc-" + l.id + m.id} src={posterSrc(m)} alt="" loading="lazy" className="w-full h-full object-cover" />)}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-bold text-white truncate">{l.name}</p>
                          <p className="text-[11px] text-gray-400 truncate">de {l.owner} · {l.movieIds.length} títulos · {l.followers} seguidor{l.followers === 1 ? "" : "es"}</p>
                        </div>
                      </div>
                    ))}
                  </Rail>
                </section>
              )}
              {becauseRows.map((r) => row("Porque viste «" + r.anchor.title + "»", r.items, "bc-" + r.anchor.id, <span>🎯</span>))}
              {row("Recomendado para ti", recommended, "rec", <Sparkle className="w-5 h-5 text-green-400" />)}
              {sagaNames.map((sg) => row("Saga: " + sg, sagas[sg].slice().sort(sagaSort), "saga-" + sg, <span>🎞️</span>, { kind: "saga", name: sg }))}
              {row(isAdmin ? "Tus Películas Subidas" : "Recién agregadas", catalog, "new")}
              {groupOrder.filter((g) => groups[g].length >= 2).map((g) => row(g, groups[g], "g-" + g, undefined, { kind: "genre", name: g }))}
            </div>
          </div>
        );
      })()}

      {/* VISTA EXPLORAR */}
      {activeTab === "explorar" && (
        <div className="pt-24 px-4 sm:px-6 md:px-12 pb-24 max-w-7xl mx-auto space-y-6 w-full overflow-x-hidden">
          <div className="relative max-w-xl z-30">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-500 pointer-events-none" />
            <input 
              ref={exploreInputRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={listening ? "Te escucho… di una película o actor" : "Buscar títulos, actores, sagas…"}
              value={exploreSearch}
              onChange={(e) => setExploreSearch(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setTimeout(() => setSearchFocus(false), 180)}
              onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") setExploreSearch(""); }}
              className={"w-full bg-[#121212] border border-gray-800 rounded-full pl-12 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition shadow-inner text-base sm:text-sm " + (voiceOk ? "pr-24" : "pr-12")}
            />
            {exploreSearch && (
              <button onClick={() => { setExploreSearch(""); try { exploreInputRef.current && exploreInputRef.current.focus(); } catch (e) {} }} aria-label="Borrar búsqueda" className={"absolute top-1.5 w-9 h-9 rounded-full text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 " + (voiceOk ? "right-12" : "right-2")}>✕</button>
            )}
            {voiceOk && (
              <button onClick={startVoice} aria-label={listening ? "Detener búsqueda por voz" : "Buscar por voz"} className={"absolute right-2 top-1.5 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 " + (listening ? "bg-red-600 text-white animate-pulse" : "text-gray-300 hover:text-white hover:bg-white/10")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /></svg>
              </button>
            )}
            {searchFocus && searchSuggest.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden" role="listbox">
                {searchSuggest.map((m) => {
                  const h = searchHits.get(String(m.id));
                  return (
                    <button key={"sg-" + m.id} role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { setSearchFocus(false); setSelectedMovie(m); }} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 focus:bg-white/10 focus:outline-none cursor-pointer">
                      <img decoding="async" loading="lazy" src={posterSrc(m)} alt="" className="w-9 h-12 rounded object-cover bg-gray-900 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-white truncate">{m.title}</span>
                        <span className="block text-[11px] text-gray-400 truncate">{[m.year, m.tag].filter(Boolean).join(" · ")}{h && h.why ? " · " + h.why : ""}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {searchPeople.length > 0 && (
            <div className="flex flex-wrap gap-2 -mt-2">
              {searchPeople.map((p) => (
                <button key={"sp-" + p.name} onClick={() => setExploreSearch(p.name)} className="text-xs font-bold px-3 py-2 rounded-full bg-white/5 border border-white/10 text-gray-200 hover:border-green-500 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">{p.role} {p.name} <span className="text-gray-500">· {p.n} título{p.n === 1 ? "" : "s"}</span></button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="flex items-center bg-[#121212] border border-gray-800 rounded-full p-1">
              <button 
                onClick={() => setExploreTypeFilter("pelicula")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-green-500 ${exploreTypeFilter === "pelicula" ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}
              >
                Películas
              </button>
              <button 
                onClick={() => setExploreTypeFilter("serie")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-green-500 ${exploreTypeFilter === "serie" ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}
              >
                Series
              </button>
            </div>

            <select 
              value={exploreYearFilter}
              onChange={(e) => setExploreYearFilter(e.target.value)}
              className="bg-[#121212] border border-gray-800 px-4 py-1.5 rounded-full text-xs font-semibold text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer"
            >
              <option value="Cualquier año">Cualquier año</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2008">2008</option>
            </select>

            <button 
              onClick={() => {
                setExploreSearch("");
                setExploreTypeFilter("todos");
                setExploreGenreFilter("Todos");
                setExploreYearFilter("Cualquier año");
              }}
              className="text-xs text-gray-500 hover:text-white px-2 py-1.5 font-medium transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded"
            >
              Limpiar
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1 scrollbar-none border-b border-gray-900 w-full">
            <button
              onClick={() => setExploreGenreFilter("Todos")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 ${exploreGenreFilter === "Todos" ? "bg-white text-black font-bold" : "bg-[#121212] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-800"}`}
            >
              Todos
            </button>
            <button
              onClick={() => setExploreGenreFilter("Novedades")}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 ${exploreGenreFilter === "Novedades" ? "bg-red-600 text-white" : "bg-[#121212] text-red-400 hover:bg-gray-800 border border-red-900/60"}`}
            >
              🆕 Novedades
            </button>
            {genresList.map((genre) => (
              <button
                key={genre}
                onClick={() => setExploreGenreFilter(genre)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 ${exploreGenreFilter.toLowerCase() === genre.toLowerCase() ? "bg-white text-black font-bold" : "bg-[#121212] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-800"}`}
              >
                {genre}
              </button>
            ))}
          </div>

          <h2 className="text-xl font-black text-white pt-2">
            {searchQ ? (filteredExploreMovies.length ? "Resultados para «" + exploreSearch.trim() + "»" : "") : exploreGenreFilter === "Todos" ? "Todas las películas y series" : exploreGenreFilter === "Novedades" ? "🆕 Novedades (últimos 30 días)" : exploreGenreFilter}
          </h2>

          {filteredExploreMovies.length === 0 ? (
            <div className="py-20 text-center text-gray-500 space-y-2">
              <p className="text-base font-semibold">{searchQ ? "No encontramos «" + exploreSearch.trim() + "»" : "No se encontraron títulos en esta categoría."}</p>
              <p className="text-xs">{searchQ ? "Prueba con otra palabra, el nombre de un actor o pídela en Cuenta → Pedir una película." : "Prueba seleccionando otro género o limpia los filtros."}</p>
              {searchQ && (exploreGenreFilter !== "Todos" || exploreTypeFilter !== "todos" || exploreYearFilter !== "Cualquier año") && (
                <button onClick={() => { setExploreGenreFilter("Todos"); setExploreTypeFilter("todos"); setExploreYearFilter("Cualquier año"); }} className="mt-3 text-xs font-bold text-green-400 hover:underline cursor-pointer">Buscar en todo el catálogo</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredExploreMovies.map((movie) => (
                <div 
                  key={movie.id}
                  onClick={() => setSelectedMovie(movie)}
                  tabIndex={0}
                  className="group relative cursor-pointer flex flex-col space-y-2 focus:outline-none focus:ring-4 focus:ring-green-500 rounded-2xl p-1"
                >
                  <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-900 group-hover:border-green-500 group-hover:scale-105 transition duration-300 shadow-xl relative">
                    <img decoding="async" loading="lazy" src={posterSrc(movie)} alt={movie.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 text-black fill-black ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-gray-200 group-hover:text-green-400 transition truncate">{movie.title}</h4>
                  {searchQ && searchHits.get(String(movie.id)) && (searchHits.get(String(movie.id)) as any).why && <p className="text-[10px] text-green-400 font-bold truncate -mt-1">{(searchHits.get(String(movie.id)) as any).why}</p>}
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>{movie.year}</span>
                    <span className="bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded text-gray-400 font-medium">{movie.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VISTA TV EN VIVO - reproductor fijo, solo la guia hace scroll */}
      {activeTab === "tv" && (
        <div className="fixed left-0 right-0 top-14 lg:top-16 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-0 bg-[#050505] flex flex-col lg:flex-row overflow-hidden">

          {/* REPRODUCTOR */}
          <div className="w-full lg:flex-1 lg:h-full relative bg-black flex flex-col shrink-0">
            <div className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 relative bg-black overflow-hidden">
              {activeChannel.embedUrl ? (
                <iframe
                  key={activeChannel.id}
                  src={`${activeChannel.embedUrl}${activeChannel.embedUrl.includes('?') ? '&' : '?'}autoplay=1&mute=0&rel=0&iv_load_policy=3`}
                  title={activeChannel.name}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  ref={videoRef}
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload"
                  className="w-full h-full object-contain"
                  key={activeChannel.id}
                >
                  Tu navegador no soporta video en vivo.
                </video>
              )}
            </div>

            {/* INFO DEL CANAL (con EN VIVO al lado del nombre) */}
            <div className="px-3 py-2.5 sm:p-4 bg-[#0a0a0a] border-t border-gray-900 flex items-center justify-between z-20 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-900 border border-gray-800 shrink-0 flex items-center justify-center text-[10px] font-black text-gray-200 overflow-hidden">
                  {activeChannel.shortCode || activeChannel.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-white truncate">{activeChannel.name}</h3>
                    <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      EN VIVO
                    </span>
                    <span className="hidden sm:inline-block text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">{activeChannel.country}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate">Emitiendo: <span className="text-gray-200 font-medium">{activeChannel.currentShow}</span></p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs bg-[#181818] px-3 py-1 rounded-lg text-gray-300 border border-gray-800 font-bold shrink-0 ml-2">{activeChannel.category}</span>
            </div>
          </div>

          {/* GUIA DE CANALES: todo el panel hace scroll */}
          <div className="w-full lg:w-80 flex-1 min-h-0 lg:flex-none lg:h-full bg-[#0d0d0d] border-t lg:border-t-0 lg:border-l border-gray-900 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
            <div className="p-3 sm:p-4 border-b border-gray-900 space-y-2 sm:space-y-3 bg-[#0a0a0a]">
              <h3 className="text-sm font-bold text-white flex items-center justify-between">
                <span>Guía de Canales</span>
                <Radio className="w-4 h-4 text-green-400 animate-pulse" />
              </h3>

              <div className="relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar canal o sigla..."
                  value={searchGuide}
                  onChange={(e) => setSearchGuide(e.target.value)}
                  className="w-full bg-[#161616] border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 scrollbar-none text-[11px]">
                {["Todos", "Perú", "Chile", "Argentina", "Bolivia", "Italia", "España", "Ecuador", "Deportes"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSelectedCountryFilter(filter)}
                    className={`px-3 py-1.5 rounded-md font-semibold transition whitespace-nowrap cursor-pointer touch-manipulation focus:outline-none focus:ring-2 focus:ring-green-500 ${selectedCountryFilter === filter ? "bg-green-500 text-black font-bold" : "bg-[#161616] text-gray-400 hover:text-white border border-gray-800"}`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 pb-6 space-y-4">
              {Object.entries(channelsGroupedByCountry).map(([countryName, channels]) => (
                <div key={countryName} className="space-y-2">
                  <div className="sticky top-0 -mx-3 px-4 bg-[#0d0d0d] py-2 z-10 border-b border-gray-800/60 flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-green-400">{countryName}</h4>
                    <span className="text-[10px] bg-gray-900 text-gray-400 px-2 py-0.5 rounded-full font-bold">{channels.length}</span>
                  </div>

                  <div className="space-y-1.5">
                    {channels.map((ch) => (
                      <div
                        key={ch.id}
                        onClick={() => setActiveChannel(ch)}
                        tabIndex={0}
                        className={`p-2.5 rounded-xl flex items-center gap-3 cursor-pointer select-none touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-[#222] transition border focus:outline-none focus:ring-2 focus:ring-green-500 ${activeChannel.id === ch.id ? "bg-[#1c1c1c] border-green-500/80 shadow-md shadow-green-950/30" : "hover:bg-[#151515] border-transparent"}`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center font-black text-xs text-gray-200 border border-gray-800 shrink-0 overflow-hidden">
                          <span>{ch.shortCode || ch.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-gray-200 truncate">{ch.name}</h5>
                          <span className="text-[10px] text-gray-500 block truncate">{ch.currentShow}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VISTA MI LISTA */}
      {activeTab === "milista" && (
        <div className="max-w-6xl mx-auto pt-28 px-4 sm:px-6 pb-24 space-y-6 overflow-x-hidden">
          <h2 className="text-3xl font-black text-white">Mi Lista {accountUser ? "(" + myList.length + ")" : ""}</h2>
          {accountUser && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-white">📂 Mis listas y las que sigo</h3>
                <button onClick={() => setListEdit({ name: "", desc: "", movieIds: [] })} className="text-xs font-bold bg-white text-black px-3 py-2 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">+ Nueva lista</button>
              </div>
              {myLists.length === 0 ? (
                <p className="text-xs text-gray-500">Crea listas temáticas (ej. “Para llorar”, “Terror de los 80”) y compártelas con la comunidad, o sigue las de otros desde Inicio.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {myLists.map((l) => (
                    <div key={"myl-" + l.id} onClick={() => setViewList(l)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setViewList(l); }} className="shrink-0 w-[200px] cursor-pointer rounded-2xl bg-[#111] border border-gray-800 hover:border-green-500 overflow-hidden focus:outline-none focus:ring-4 focus:ring-green-500">
                      <div className="grid grid-cols-4 h-[72px] bg-gray-900">{listCover(l).map((m) => <img decoding="async" key={"mlc-" + l.id + m.id} src={posterSrc(m)} alt="" loading="lazy" className="w-full h-full object-cover" />)}</div>
                      <div className="p-2.5">
                        <p className="text-sm font-bold text-white truncate">{l.name}</p>
                        <p className="text-[11px] text-gray-400">{l.mine ? "Tuya" : "de " + l.owner} · {l.movieIds.length} títulos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!accountUser ? (
            <div className="bg-[#0f0f0f] border border-gray-800 rounded-2xl p-6 max-w-xl">
              <p className="text-base font-bold text-white mb-1">Inicia sesión para usar Mi Lista</p>
              <p className="text-sm text-gray-400 mb-4">Con tu cuenta, tus películas guardadas aparecen en todos tus dispositivos: TV, celular y PC.</p>
              <button onClick={goToLogin} className="bg-white text-black font-bold px-5 py-2.5 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                Iniciar sesión o crear cuenta
              </button>
            </div>
          ) : myList.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no agregaste nada. Pulsa <b className="text-gray-300">+</b> en cualquier película para guardarla aquí.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {myList.map((title) => {
                const m = catalog.find((x) => x.title === title);
                if (!m) return null;
                return (
                  <div key={"ml-" + title} className="relative" style={{ width: 160 }}>
                    <div
                      onClick={() => setSelectedMovie(m)}
                      tabIndex={0}
                      className="group cursor-pointer rounded-xl focus:outline-none focus:ring-4 focus:ring-green-500"
                    >
                      <div className="relative overflow-hidden rounded-xl bg-gray-900 border border-gray-800 group-hover:border-green-500" style={{ width: 160, height: 240 }}>
                        <img decoding="async" src={posterSrc(m)} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
                      </div>
                      <h4 className="text-xs sm:text-sm font-semibold mt-2 text-gray-200 truncate">{m.title}</h4>
                    </div>
                    <button
                      onClick={() => toggleMyList(m)}
                      aria-label={"Quitar " + m.title}
                      className="absolute top-2 right-2 bg-black/80 hover:bg-red-600 text-white rounded-full p-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PANEL DE ADMINISTRACIÓN */}
      {activeTab === "admin" && isAdmin && (
        <div className="max-w-4xl mx-auto pt-28 px-4 sm:px-6 pb-24 space-y-10 overflow-x-hidden">
          {/* ESTRENOS QUE YA LLEGARON */}
          {(() => {
            const due = customMovies.filter((m) => m.comingSoon && m.releaseDate && todayStr && m.releaseDate <= todayStr);
            if (!due.length) return null;
            return (
              <div className="bg-green-500/10 border border-green-500/40 p-4 rounded-2xl space-y-2">
                <p className="text-sm font-bold text-white">🎬 Ya llegó la fecha de estreno</p>
                {due.map((m) => (
                  <div key={"due-" + m.id} className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-gray-200 flex-1 min-w-[160px]">{m.title} · {fmtRelease(m.releaseDate)}{!m.videoUrl ? " (falta el enlace del video)" : ""}</span>
                    <button onClick={() => releaseNow(m)} className="bg-green-500 hover:bg-green-400 text-black px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                      Estrenar y avisar
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-gray-400">Si ya tienen video, en la página ya aparecen con las demás películas; con este botón además se avisa a todos.</p>
              </div>
            );
          })()}

          {/* REVISIÓN DE ENLACES */}
          <div className={"p-4 sm:p-5 rounded-2xl border space-y-3 " + (linkIssues.length ? "bg-red-500/10 border-red-500/40" : "bg-[#0f0f0f] border-gray-800")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">
                  {linkCheck.running ? "🔎 Revisando enlaces de video… " + linkCheck.done + " de " + linkCheck.total
                    : linkIssues.length ? "⚠️ " + linkIssues.length + " video" + (linkIssues.length === 1 ? "" : "s") + " no funciona" + (linkIssues.length === 1 ? "" : "n")
                    : linkCheck.at ? "✅ Todos los videos responden bien (" + linkCheck.total + " revisados)" : "🔎 Revisión de enlaces de video"}
                </p>
                {linkCheck.at > 0 && !linkCheck.running && <p className="text-[11px] text-gray-400">Última revisión: {new Date(linkCheck.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}. Se revisa sola al abrir el panel.</p>}
              </div>
              <button onClick={() => runLinkCheck(true)} disabled={linkCheck.running} className="bg-[#181818] hover:bg-gray-800 text-white px-3 py-2 rounded-xl text-xs font-bold border border-gray-700 cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500">
                {linkCheck.running ? "Revisando…" : "Revisar ahora"}
              </button>
            </div>
            {linkIssues.length > 0 && (
              <div className="space-y-2">
                {linkIssues.map((it, i) => {
                  const mv = catalogAll.find((x) => String(x.id) === it.id);
                  return (
                    <div key={"li-" + i} className="flex items-center gap-2 flex-wrap bg-black/30 rounded-xl px-3 py-2">
                      <span className="text-xs text-white font-bold flex-1 min-w-[140px]">{it.title} <span className="text-gray-400 font-normal">· {it.where}</span></span>
                      <span className="text-[11px] text-red-300">{it.reason}</span>
                      {mv && <button onClick={() => { handleEditClick(mv); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {} }} className="text-xs font-bold text-emerald-400 hover:underline cursor-pointer px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-green-500">Corregir</button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AVISOS PROGRAMADOS */}
          <div className="bg-[#0f0f0f] border border-gray-800 p-4 sm:p-6 rounded-3xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">⏰ Avisos programados</h3>
              <p className="text-xs text-gray-400">Deja listo un aviso para que llegue a todos los que tienen la campanita 🔔 un día y hora exactos.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={schedMovieId} onChange={(e) => setSchedMovieId(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Película (opcional)</option>
                {catalogAll.map((x) => <option key={"so-" + x.id} value={String(x.id)}>{x.title}{x.comingSoon ? " (próximo estreno)" : ""}</option>)}
              </select>
              <input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" style={{ colorScheme: "dark" }} />
              <input type="text" maxLength={80} placeholder="Título (ej. ¡Hoy se estrena! 🍿)" value={schedTitle} onChange={(e) => setSchedTitle(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              <input type="text" maxLength={200} placeholder="Mensaje (si eliges película, se escribe solo)" value={schedBody} onChange={(e) => setSchedBody(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <button onClick={addSched} className="w-full sm:w-auto bg-white hover:bg-gray-200 text-black px-5 py-3 rounded-xl text-sm font-bold cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Programar aviso</button>
            {schedList.length > 0 && (
              <div className="space-y-2 pt-1">
                {schedList.slice().sort((a, b) => a.at - b.at).map((it) => (
                  <div key={it.id} className="flex items-center gap-3 bg-[#050505] border border-gray-900 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{it.title} <span className="text-gray-400 font-normal">— {it.body}</span></p>
                      <p className="text-[11px] text-green-400">{new Date(it.at).toLocaleString("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <button onClick={() => removeSched(it.id)} className="text-xs text-red-400 hover:underline cursor-pointer px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-green-500">Quitar</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SEGURIDAD */}
          <div className="bg-[#0f0f0f] border border-blue-900/50 p-4 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-bold text-white">🛡️ Seguridad y copias de seguridad</h3>
                <p className="text-xs text-gray-500">Cada día se guarda sola una copia del catálogo (se conservan los últimos 7 días). Si algo se borra o alguien lo daña, lo restauras con un toque.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={loadBackups} className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-400">🗂️ Ver copias</button>
                <button onClick={loadAdminLog} className="text-xs font-bold text-white bg-[#181818] border border-gray-800 px-4 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">📋 Ver entradas</button>
                <button onClick={revokeAllAdmins} className="text-xs font-bold text-white bg-red-600 hover:bg-red-500 px-4 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-red-400">🚨 Cerrar sesión en todos los demás</button>
                <button onClick={adminLogoutDevice} className="text-xs font-bold text-gray-300 hover:text-white bg-[#181818] border border-gray-800 px-4 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">🔒 Cerrar sesión aquí</button>
              </div>
            </div>
            {adminLog && (() => {
              const mine = myLoginId();
              const week = Date.now() - 7 * 86400000;
              const locks = adminLog.filter((x) => x.kind === "lock" && x.at > week);
              const others = adminLog.filter((x) => x.kind === "login" && x.at > week && x.id !== mine);
              return (
                <div className="space-y-2">
                  {locks.length > 0 && (
                    <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
                      🔒 <b>{locks.length} bloqueo{locks.length === 1 ? "" : "s"} por claves incorrectas</b> esta semana (último: {locks[0].device}, {new Date(locks[0].at).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}). Si no fuiste tú, alguien intentó adivinar tu clave: el bloqueo lo frenó.
                    </div>
                  )}
                  {others.length > 0 && (
                    <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-100 flex items-center gap-3 flex-wrap">
                      <span className="flex-1 min-w-[200px]">⚠️ Hubo <b>{others.length} entrada{others.length === 1 ? "" : "s"}</b> al panel desde otros dispositivos esta semana. ¿Fuiste tú? Revisa la lista de abajo.</span>
                      <button onClick={revokeAllAdmins} className="text-xs font-black text-white bg-red-600 hover:bg-red-500 px-3 py-2 rounded-lg cursor-pointer">🚨 No fui yo: cerrar todas</button>
                    </div>
                  )}
                  <div className="rounded-xl border border-gray-800 bg-[#050505] p-3">
                    <p className="text-xs font-bold text-gray-400 mb-2">📋 Últimas entradas al panel</p>
                    {adminLog.length === 0 ? <p className="text-xs text-gray-500">Todavía no hay registros. Se anotan desde esta actualización.</p> : (
                      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {adminLog.slice(0, 20).map((x, i) => (
                          <div key={"lg-" + i} className="flex items-center gap-2 text-xs">
                            <span className="w-5 text-center">{x.kind === "login" ? "🔑" : x.kind === "lock" ? "🔒" : "🚨"}</span>
                            <span className="flex-1 min-w-0 truncate text-gray-200">{x.kind === "login" ? "Entrada" : x.kind === "lock" ? "Bloqueo por claves incorrectas" : "Cerró sesión en todos"} · {x.device}{x.id && x.id === mine ? <b className="text-green-400"> · este dispositivo</b> : null}</span>
                            <span className="text-gray-500 shrink-0">{new Date(x.at).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {backups && (backups.length === 0 ? (
              <p className="text-sm text-gray-500">Todavía no hay copias. La primera se crea sola la próxima vez que guardes un cambio.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {backups.map((b) => (
                  <div key={"bk-" + b.slot} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#050505] px-3 py-2.5">
                    <span className="text-xl">🗂️</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-white truncate">{(() => { const t = new Date(b.at).toLocaleString("es-PE", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); return t.charAt(0).toUpperCase() + t.slice(1); })()}</span>
                      <span className="block text-[11px] text-gray-400">{b.count} títulos</span>
                    </span>
                    <button onClick={() => restoreBackup(b)} className="text-[11px] font-bold px-3 py-2 rounded-lg bg-[#181818] text-blue-300 border border-gray-800 cursor-pointer hover:border-blue-400">↩ Restaurar</button>
                  </div>
                ))}
              </div>
            ))}
            <ul className="text-[11px] text-gray-500 space-y-1 list-disc pl-4">
              <li>Tu clave ya no se guarda en el navegador: se usa un pase temporal que vence a los 7 días y se renueva solo.</li>
              <li>Si alguien prueba claves, se bloquea 15 minutos después de 5 intentos fallidos.</li>
              <li>No se puede guardar un catálogo vacío por accidente.</li>
              <li>Si ves una entrada que no reconoces, pulsa «🚨 Cerrar sesión en todos los demás»: cualquier otro dispositivo pierde el acceso al instante.</li>
            </ul>
          </div>

          {/* SAGAS AUTOMÁTICAS */}
          <div className="bg-[#0f0f0f] border border-green-900/50 p-4 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-bold text-white">🎞️ Ordenar mis sagas</h3>
                <p className="text-xs text-gray-500">Busca en TMDB a qué saga pertenece cada película que ya subiste y le pone su número (1, 2, 3…) según su fecha de estreno. Las nuevas se completan solas al usar «Autocompletar».</p>
              </div>
              <button onClick={scanSagas} disabled={!!(sagaScan && sagaScan.busy)} className="text-sm font-black text-black bg-green-500 hover:bg-green-400 disabled:opacity-60 px-5 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-300">{sagaScan && sagaScan.busy ? "Revisando " + sagaScan.done + " de " + sagaScan.total + "…" : "✨ Revisar todo el catálogo"}</button>
            </div>
            {sagaScan && sagaScan.busy && (
              <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-green-500" style={{ width: Math.round((sagaScan.done / Math.max(1, sagaScan.total)) * 100) + "%", transition: "width .3s" }} /></div>
            )}
            {sagaScan && sagaScan.hits.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">{sagaScan.busy ? "Encontradas hasta ahora:" : "Encontré " + sagaScan.hits.length + " película" + (sagaScan.hits.length === 1 ? "" : "s") + " para ordenar. Desmarca las que no quieras cambiar:"}</p>
                <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
                  {Array.from(new Set(sagaScan.hits.map((h) => h.saga))).map((sg) => (
                    <div key={"ss-" + sg} className="rounded-xl border border-gray-800 bg-[#050505] p-3">
                      <p className="text-sm font-black text-green-400 mb-2">🎞️ {sg}</p>
                      {sagaScan.hits.filter((h) => h.saga === sg).sort((a, b) => a.sagaOrder - b.sagaOrder).map((h) => (
                        <label key={"sh-" + h.id} className="flex items-center gap-3 py-1 text-sm cursor-pointer">
                          <input type="checkbox" checked={h.include} onChange={(e) => { const v = e.target.checked; setSagaScan((sc) => (sc ? { ...sc, hits: sc.hits.map((x) => (x.id === h.id ? { ...x, include: v } : x)) } : sc)); }} className="w-4 h-4 accent-green-500" />
                          <span className="w-14 shrink-0 text-xs font-black text-white bg-white/10 rounded px-1.5 py-0.5 text-center">Parte {h.sagaOrder || "?"}</span>
                          <span className="flex-1 min-w-0 truncate text-gray-200">{h.title} <span className="text-gray-500">({h.year})</span></span>
                          {(h.prev || h.prevOrder) ? <span className="text-[10px] text-gray-500 shrink-0">antes: {h.prev || "sin saga"}{h.prevOrder ? " #" + h.prevOrder : ""}</span> : null}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                {!sagaScan.busy && <button onClick={saveSagaScan} className="text-sm font-black text-black bg-white hover:bg-gray-200 px-5 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">💾 Guardar el orden de las sagas</button>}
              </div>
            )}
          </div>

          {/* VOTACIONES */}
          <div className="bg-[#0f0f0f] border border-purple-900/50 p-4 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-bold text-white">🗳️ Votaciones de la comunidad</h3>
                <p className="text-xs text-gray-500">La votación abierta aparece en la portada. Cada cuenta vota una vez (puede cambiar su voto). Al cerrarla, el ganador se anuncia en el chat.</p>
              </div>
              <button onClick={loadAdminPolls} className="text-xs font-bold text-gray-300 hover:text-white bg-[#181818] border border-gray-800 px-3 py-2 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">Actualizar</button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400">Pregunta</label>
                <input type="text" maxLength={120} value={pollQ} onChange={(e) => setPollQ(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
                <label className="text-xs font-bold text-gray-400 block pt-1">Opciones (una por línea, de 2 a 6)</label>
                <textarea rows={5} value={pollOpts} onChange={(e) => setPollOpts(e.target.value)} placeholder={"Opción 1\nOpción 2\nOpción 3"} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={pollFromRequests} className="text-xs font-bold text-purple-200 bg-purple-500/15 border border-purple-500/40 px-3 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400">📬 Llenar con los más pedidos</button>
                  <button onClick={createPoll} className="text-sm font-black text-white bg-purple-600 hover:bg-purple-500 px-5 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-purple-400">Publicar votación</button>
                </div>
                <p className="text-[11px] text-gray-500">Si una opción se llama igual que una película del catálogo, se muestra con su póster.</p>
              </div>
              <div className="space-y-2">
                {adminPolls.length === 0 ? (
                  <p className="text-sm text-gray-500">Todavía no hay votaciones.</p>
                ) : adminPolls.map((p) => (
                  <div key={"ap-" + p.id} className="rounded-xl border border-gray-800 bg-[#050505] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={"text-[10px] font-black px-2 py-0.5 rounded-full " + (p.open ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-300")}>{p.open ? "ABIERTA" : "CERRADA"}</span>
                      <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{p.q}</span>
                      <span className="text-[11px] text-gray-400">{p.total} votos</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 truncate">{p.opts.map((o) => (p.winner === o.id ? "🏆 " : "") + o.label + " (" + o.count + ")").join(" · ")}</p>
                    <div className="flex gap-2 mt-2">
                      {p.open && <button onClick={() => closePoll(p)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-yellow-500 text-black cursor-pointer">🏆 Cerrar y anunciar</button>}
                      <button onClick={() => deletePoll(p)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[#181818] text-red-400 border border-gray-800 cursor-pointer">Borrar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PEDIDOS DE USUARIOS */}
          <div className="bg-[#0f0f0f] border border-gray-800 p-4 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-white">📬 Pedidos de usuarios {adminReqs.filter((r) => r.status === "nueva").length > 0 && <span className="ml-1 text-xs bg-red-600 text-white px-2 py-0.5 rounded-full align-middle">{adminReqs.filter((r) => r.status === "nueva").length} nuevos</span>}</h3>
              <div className="flex gap-2">
              {adminReqs.some((r) => r.status !== "nueva") && (
                <button onClick={() => setShowDoneReqs(!showDoneReqs)} className="text-xs font-bold text-gray-300 hover:text-white bg-[#181818] border border-gray-800 px-3 py-2 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">{showDoneReqs ? "Ocultar atendidos" : "Ver atendidos (" + adminReqs.filter((r) => r.status !== "nueva").length + ")"}</button>
              )}
              <button onClick={() => adminReqCall("list")} className="text-xs font-bold text-gray-300 hover:text-white bg-[#181818] border border-gray-800 px-3 py-2 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">Actualizar</button>
              </div>
            </div>
            {adminReqs.filter((r) => showDoneReqs || r.status === "nueva").length === 0 ? (
              <p className="text-xs text-gray-500">{adminReqs.length ? "✅ No hay pedidos pendientes." : ""} Cuando subas una película que alguien pidió, el pedido se marca solo como atendido y se anuncia en el chat.</p>
            ) : false ? (
              <p className="text-xs text-gray-500">Todavía no hay pedidos. Los usuarios pueden pedir desde Cuenta → Pedir una película.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {adminReqs.filter((r) => showDoneReqs || r.status === "nueva").map((r) => (
                  <div key={r.id} className={"rounded-xl border px-3 py-2.5 " + (r.status === "nueva" ? "bg-yellow-500/5 border-yellow-700/40" : "bg-[#050505] border-gray-900")}>
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-sm font-bold text-white">{r.title}</p>
                        {r.note && <p className="text-xs text-gray-400">“{r.note}”</p>}
                        <p className="text-[10px] text-gray-500 mt-0.5">{r.profile || "—"} · {r.email} · {fmtChatTime(r.at)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => markReqDone(r)} className={"text-[11px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer " + (r.status === "agregada" ? "bg-green-500 text-black" : "bg-[#181818] text-green-400 border border-gray-800")}>✔ Agregada</button>
                        <button onClick={() => adminReqCall("status", { id: r.id, status: "rechazada", reply: "Por ahora no está disponible." })} className={"text-[11px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer " + (r.status === "rechazada" ? "bg-red-600 text-white" : "bg-[#181818] text-red-400 border border-gray-800")}>✖ No disponible</button>
                        <button onClick={() => adminReqCall("delete", { id: r.id })} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer bg-[#181818] text-gray-400 border border-gray-800">Borrar</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CHAT: MODERACIÓN */}
          <div className="bg-[#0f0f0f] border border-gray-800 p-4 sm:p-6 rounded-3xl space-y-3">
            <h3 className="text-lg font-bold text-white">💬 Chat de la comunidad</h3>
            <p className="text-xs text-gray-400">Mensaje fijado (aparece arriba del chat). En el chat puedes borrar mensajes o bloquear usuarios con los botones que aparecen debajo de cada mensaje.</p>
            <textarea maxLength={300} rows={2} placeholder={chatPinned || "Ej. Bienvenidos, pidan sus películas aquí 🍿"} value={chatPinEdit} onChange={(e) => setChatPinEdit(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => chatAdmin("pin", { text: chatPinEdit.trim() }).then((d: any) => { if (d && d.ok) { showToast("📌 Mensaje fijado actualizado."); setChatPinEdit(""); } })} className="bg-white hover:bg-gray-200 text-black px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Guardar mensaje fijado</button>
              <button onClick={() => setChatOpen(true)} className="bg-[#181818] text-white border border-gray-700 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Abrir el chat</button>
            </div>
          </div>

          {/* AGREGAR VARIAS A LA VEZ */}
          <div className="bg-[#0f0f0f] border border-gray-800 p-4 sm:p-6 rounded-3xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">⚡ Agregar varias a la vez</h3>
              <p className="text-xs text-gray-400">Pega una por línea: <b className="text-gray-200">Título | enlace del video</b>. Se completan solas con Autocompletar (póster, sinopsis, reparto, tráiler…). Máximo 40 por vez.</p>
            </div>
            <textarea rows={5} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"Mi Película | https://servidor.com/mi-pelicula.mp4\nOtra Película | https://servidor.com/otra.mp4"} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-[#050505] border border-gray-800 rounded-xl p-1">
                {(["pelicula", "serie"] as const).map((t) => (
                  <button key={t} onClick={() => setBulkType(t)} className={"px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer " + (bulkType === t ? "bg-white text-black" : "text-gray-400")}>{t === "pelicula" ? "Películas" : "Series"}</button>
                ))}
              </div>
              <button onClick={runBulk} disabled={bulkBusy} className="bg-white hover:bg-gray-200 disabled:opacity-50 text-black px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">{bulkBusy ? "Buscando datos…" : "1. Buscar datos"}</button>
            </div>
            {bulkItems.length > 0 && (
              <div className="space-y-2">
                {bulkItems.map((it, i) => (
                  <label key={"bk-" + i} className="flex items-center gap-3 bg-[#050505] border border-gray-900 rounded-xl px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={it.include} disabled={!it.movie} onChange={(e) => setBulkItems((list) => list.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} className="w-4 h-4 accent-green-500 shrink-0" />
                    {it.movie ? <img decoding="async" loading="lazy" src={posterSrc(it.movie)} alt="" className="w-9 h-12 rounded object-cover bg-gray-900 shrink-0" /> : <span className="w-9 h-12 rounded bg-gray-900 shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-white font-bold truncate">{it.movie ? it.movie.title + " (" + it.movie.year + ")" : it.title || it.line}</span>
                      <span className="block text-[11px] text-gray-500 truncate">{it.url || "Falta el enlace del video"}</span>
                    </span>
                    <span className={"text-[10px] font-black px-2 py-1 rounded-full shrink-0 " + (it.status === "listo" ? "bg-green-500/20 text-green-400" : it.status === "buscando" ? "bg-blue-500/20 text-blue-300" : it.status === "pendiente" ? "bg-gray-700 text-gray-300" : "bg-yellow-500/15 text-yellow-400")}>
                      {it.status === "listo" ? "✔ Datos listos" : it.status === "buscando" ? "Buscando…" : it.status === "pendiente" ? "En cola" : it.url ? "Sin datos de TMDB" : "Incompleta"}
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-xs text-gray-300 pt-1 cursor-pointer"><input type="checkbox" checked={bulkNotify} onChange={(e) => setBulkNotify(e.target.checked)} className="w-4 h-4 accent-green-500" /> Avisar a todos con la campanita 🔔 (un solo aviso)</label>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={saveBulk} disabled={bulkBusy || !bulkItems.some((x) => x.include && x.movie)} className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black px-5 py-3 rounded-xl text-sm font-black cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">2. Agregar {bulkItems.filter((x) => x.include && x.movie).length} al catálogo</button>
                  <button onClick={() => setBulkItems([])} className="text-xs text-gray-400 hover:text-white px-3 py-2 cursor-pointer">Cancelar</button>
                </div>
                <p className="text-[11px] text-gray-500">Las que digan “Sin datos de TMDB” se agregan solo con el título; luego puedes completarlas con Editar → Autocompletar.</p>
              </div>
            )}
          </div>

          {/* ESTADÍSTICAS */}
          <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-3xl space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white mr-auto">📊 Estadísticas</h3>
              {[7, 30, 90].map((d) => (
                <button
                  key={"sd-" + d}
                  onClick={() => setStatsDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 ${statsDays === d ? "bg-white text-black" : "bg-[#181818] text-gray-300 border border-gray-800"}`}
                >
                  {d === 7 ? "7 días" : d === 30 ? "30 días" : "90 días"}
                </button>
              ))}
              <button onClick={() => loadStats(statsDays)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#181818] text-gray-300 border border-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                {statsLoading ? "Cargando..." : "↻ Actualizar"}
              </button>
            </div>
            {statsError && <p className="text-xs text-red-400 font-bold">{statsError}</p>}
            {stats && (() => {
              const plays: Record<string, number> = stats.plays || {};
              const watch: Record<string, number> = stats.watchSecs || {};
              const comp: Record<string, number> = stats.completes || {};
              const drop: Record<string, number[]> = stats.dropoff || {};
              const titles: Record<string, string> = stats.titles || {};
              const nameOf = (id: string) => titles[id] || (customMovies.find((m) => String(m.id) === id) || { title: "Título " + id }).title;
              const totalPlays = Object.keys(plays).reduce((a, k) => a + plays[k], 0);
              const totalHours = Object.keys(watch).reduce((a, k) => a + watch[k], 0) / 3600;
              const totalComp = Object.keys(comp).reduce((a, k) => a + comp[k], 0);
              const totalEnded = totalComp + Object.keys(drop).reduce((a, k) => a + drop[k].reduce((x, y) => x + y, 0), 0);
              const devices: Record<string, number> = stats.devices || {};
              const devTotal = Math.max(1, Object.keys(devices).reduce((a, k) => a + devices[k], 0));
              const daily: { day: number; visits: number; plays: number }[] = stats.daily || [];
              const maxDaily = Math.max(1, ...daily.map((d) => d.visits));
              const top = Object.keys(plays).sort((a, b) => plays[b] - plays[a]).slice(0, 10);
              const kpis = [
                { label: "Visitas", value: stats.visits || 0 },
                { label: "Visitantes únicos", value: stats.uniqueVisitors || 0 },
                { label: "Reproducciones", value: totalPlays },
                { label: "Horas vistas", value: totalHours < 10 ? totalHours.toFixed(1) : Math.round(totalHours) },
                { label: "Terminan la película", value: totalEnded ? Math.round((totalComp / totalEnded) * 100) + "%" : "—" },
                { label: "Visitas con cuenta", value: stats.visits ? Math.round(((stats.loggedVisits || 0) / stats.visits) * 100) + "%" : "—" },
              ];
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {kpis.map((k) => (
                      <div key={k.label} className="bg-[#050505] border border-gray-900 rounded-2xl p-4">
                        <p className="text-2xl font-black text-white">{k.value}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{k.label}</p>
                      </div>
                    ))}
                  </div>

                  {daily.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-300 mb-2">Visitas por día</p>
                      <div className="flex items-end gap-1 h-28 bg-[#050505] border border-gray-900 rounded-2xl p-3">
                        {daily.map((d) => (
                          <div key={"day-" + d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={String(d.day).slice(6) + "/" + String(d.day).slice(4, 6) + ": " + d.visits + " visitas, " + d.plays + " reproducciones"}>
                            <div className="w-full bg-green-500 rounded-t" style={{ height: Math.max(3, (d.visits / maxDaily) * 100) + "%" }} />
                            {daily.length <= 14 && <span className="text-[9px] text-gray-500 mt-1">{String(d.day).slice(6)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-bold text-gray-300 mb-2">Dispositivos</p>
                    <div className="space-y-2">
                      {[["tv", "📺 Smart TV"], ["mobile", "📱 Celular / tablet"], ["desktop", "💻 Computadora"]].map(([k, label]) => {
                        const pct = Math.round(((devices[k] || 0) / devTotal) * 100);
                        return (
                          <div key={"dev-" + k} className="flex items-center gap-3">
                            <span className="text-xs text-gray-300 w-36 shrink-0">{label}</span>
                            <div className="flex-1 h-3 bg-[#1f1f1f] rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: pct + "%" }} /></div>
                            <span className="text-xs text-gray-400 w-16 text-right">{pct}% ({devices[k] || 0})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-gray-300 mb-2">Lo más visto</p>
                    {top.length === 0 ? (
                      <p className="text-xs text-gray-500">Todavía no hay reproducciones en este periodo.</p>
                    ) : (
                      <div className="space-y-2">
                        {top.map((id, i) => {
                          const ended = (comp[id] || 0) + (drop[id] || []).reduce((x, y) => x + y, 0);
                          const compPct = ended ? Math.round(((comp[id] || 0) / ended) * 100) : null;
                          return (
                            <div key={"top-" + id} className="bg-[#050505] border border-gray-900 rounded-xl p-3">
                              <div className="flex items-center gap-3">
                                <span className="text-lg font-black text-gray-500 w-6 text-center">{i + 1}</span>
                                <span className="text-sm font-bold text-white truncate flex-1">{nameOf(id)}</span>
                                <span className="text-[11px] text-gray-400 shrink-0">{plays[id]} ▶ · {((watch[id] || 0) / 3600).toFixed(1)} h{compPct !== null ? " · " + compPct + "% termina" : ""}</span>
                                {drop[id] && (
                                  <button onClick={() => setDropoffFor(dropoffFor === id ? null : id)} className="text-[11px] font-bold text-green-400 hover:underline shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-1">
                                    {dropoffFor === id ? "Ocultar" : "¿Dónde abandonan?"}
                                  </button>
                                )}
                              </div>
                              {dropoffFor === id && drop[id] && (() => {
                                const arr = drop[id];
                                const mx = Math.max(1, ...arr);
                                return (
                                  <div className="mt-3">
                                    <div className="flex items-end gap-1 h-20">
                                      {arr.map((n, j) => (
                                        <div key={"dp-" + j} className="flex-1 flex flex-col items-center justify-end h-full" title={j * 10 + "–" + (j * 10 + 10) + "%: " + n + " personas dejaron de ver"}>
                                          <div className="w-full bg-red-500/80 rounded-t" style={{ height: Math.max(2, (n / mx) * 100) + "%" }} />
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex justify-between text-[9px] text-gray-500 mt-1"><span>Inicio</span><span>Mitad</span><span>Final</span></div>
                                    <p className="text-[11px] text-gray-400 mt-1">Cada barra es un 10 % de la película: muestra en qué parte la gente dejó de ver.</p>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500">Datos anónimos: no se guarda quién vio qué. Tus propias visitas como administrador no cuentan.</p>
                </div>
              );
            })()}
          </div>

          <div className="bg-[#0f0f0f] border border-green-500/30 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-900 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/10 rounded-2xl text-green-400 border border-green-500/20">
                  <Film className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    {editingMovieId ? "Editar Contenido" : "Panel de Propietario"}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {editingMovieId ? "Modifica los campos necesarios para actualizar el título." : "Añade tus enlaces de video y películas directamente al catálogo."}
                  </p>
                  {!hasServerPass && (
                    <div className="mt-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-600/50 text-[11px] text-yellow-300">
                      Modo solo lectura: tus cambios NO se guardan en el servidor hasta que vuelvas a escribir tu clave de administrador.{" "}
                      <button
                        onClick={() => { pendingSaveRef.current = null; setServerPassError(""); setShowServerPass(true); }}
                        className="underline font-bold text-yellow-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded"
                      >
                        Activar publicación
                      </button>
                    </div>
                  )}
                  {serverCatalog ? (
                    <p className="text-[11px] text-green-400 mt-1">
                      {syncing ? "Publicando cambios..." : hasServerPass ? "Conectado al servidor: cada cambio se publica al instante en todos los dispositivos." : "Conectado al servidor (solo lectura)."}
                    </p>
                  ) : (
                    <p className="text-[11px] text-yellow-400 mt-1">
                      Servidor sin conectar: los cambios se guardan solo en este navegador. Respaldo: "Exportar catálogo" + comando de publicar en la terminal.
                    </p>
                  )}
                </div>
              </div>
              {editingMovieId && (
                <button 
                  onClick={() => {
                    setEditingMovieId(null);
                    resetMovieForm();
                  }}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Cancelar Edición
                </button>
              )}
            </div>

            <form onSubmit={handleSaveMovie} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Título de la Película o Serie</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. Toy Story 5" 
                    value={newMovieTitle}
                    onChange={(e) => setNewMovieTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newMovieTitle.trim()) { e.preventDefault(); searchTmdb(); } }}
                    className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={searchTmdb}
                    className="shrink-0 flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black font-bold px-4 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                  >
                    <Sparkles className="w-4 h-4" /> {tmdbBusy ? "Buscando..." : "Autocompletar"}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Escribe el título y pulsa Autocompletar: se llenan la sinopsis, año, duración, clasificación, director, reparto, portada y tráiler.</p>
                {tmdbResults && (
                  <div className="mt-2 bg-[#0a0a0a] border border-gray-800 rounded-xl p-2 space-y-1 max-h-80 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 pb-1">
                      <span className="text-[11px] text-gray-400 font-bold">¿Cuál es?</span>
                      <button type="button" onClick={() => setTmdbResults(null)} className="text-gray-500 hover:text-white p-1 rounded focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Cerrar"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {tmdbResults.map((r) => (
                      <button
                        type="button"
                        key={"tmdb-" + r.id}
                        onClick={() => applyTmdb(r.id)}
                        className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-[#181818] focus:outline-none focus:bg-[#181818] focus:ring-2 focus:ring-green-500 cursor-pointer"
                      >
                        {r.poster ? <img decoding="async" loading="lazy" src={r.poster} alt="" className="rounded object-cover shrink-0" style={{ width: 40, height: 60 }} /> : <span className="rounded bg-gray-800 shrink-0" style={{ width: 40, height: 60 }} />}
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-white truncate">{r.title}</span>
                          <span className="block text-[11px] text-gray-400 truncate">{r.year || "Sin año"}{r.original && r.original !== r.title ? " · " + r.original : ""}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Enlace del Vídeo (MP4 directo de Archive.org)</label>
                <input 
                  type="url" 
                  required={newMovieType !== "serie" && !newComingSoon}
                  placeholder={newMovieType === "serie" ? "Opcional en series: se usa el primer episodio" : "https://archive.org/download/..."} 
                  value={newMovieVideoUrl}
                  onChange={(e) => setNewMovieVideoUrl(e.target.value)}
                  className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Tipo</label>
                  <select 
                    value={newMovieType}
                    onChange={(e) => setNewMovieType(e.target.value as "pelicula" | "serie")}
                    className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="pelicula">Película</option>
                    <option value="serie">Serie</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Categoría / Género</label>
                  <select 
                    value={newMovieCategory}
                    onChange={(e) => setNewMovieCategory(e.target.value)}
                    className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {genresList.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Imagen de Portada (URL)</label>
                  <input 
                    type="url" 
                    placeholder="https://images.unsplash.com/..." 
                    value={newMovieImage}
                    onChange={(e) => setNewMovieImage(e.target.value)}
                    className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Año</label>
                  <input type="text" inputMode="numeric" maxLength={4} placeholder="2026" value={newMovieYear} onChange={(e) => setNewMovieYear(e.target.value.replace(/[^0-9]/g, ""))} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Duración</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="1 h 45 min" value={newMovieDuration} onChange={(e) => setNewMovieDuration(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <button type="button" onClick={detectDuration} className="shrink-0 bg-[#181818] hover:bg-gray-800 text-gray-200 px-3 rounded-xl text-xs font-bold border border-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                      {detectingDuration ? "Leyendo..." : "Detectar"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Clasificación</label>
                  <select value={newMovieAge} onChange={(e) => setNewMovieAge(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">Sin indicar</option>
                    <option value="ATP">ATP (todo público)</option>
                    <option value="+7">+7</option>
                    <option value="+13">+13</option>
                    <option value="+16">+16</option>
                    <option value="+18">+18</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Director</label>
                  <input type="text" placeholder="Nombre del director" value={newMovieDirector} onChange={(e) => setNewMovieDirector(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 block mb-1">Saga o colección (opcional)</label>
                    <input type="text" list="cv-sagas" placeholder="Ej. Aventuras del Bosque" value={newMovieSaga} onChange={(e) => setNewMovieSaga(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <datalist id="cv-sagas">
                      {Array.from(new Set(catalogAll.map((x) => x.saga).filter(Boolean) as string[])).map((sg) => <option key={sg} value={sg} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">N.º en la saga</label>
                    <input type="number" min={1} placeholder="1" value={newMovieSagaOrder} onChange={(e) => setNewMovieSagaOrder(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Reparto</label>
                  <input type="text" placeholder="Actor 1, Actor 2, Actor 3" value={newMovieCast} onChange={(e) => setNewMovieCast(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              {newMovieType === "serie" && (
                <div className="bg-[#080808] border border-green-500/20 rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-bold text-white">Episodios ({newEpisodes.length})</p>
                  {newEpisodes.length > 0 && (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {newEpisodes.map((ep) => (
                        <div key={ep.id} className="flex items-center gap-2 bg-[#111] border border-gray-900 rounded-lg px-3 py-2">
                          <span className="text-[11px] font-black text-green-400 shrink-0">T{ep.season}:E{ep.number}</span>
                          <span className="text-xs text-gray-200 truncate flex-1">{ep.title}</span>
                          <button type="button" onClick={() => setNewEpisodes((prev) => prev.filter((x) => x.id !== ep.id))} className="text-red-400 hover:text-red-300 p-1 rounded focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Quitar episodio">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-4 sm:grid-cols-12 gap-2">
                    <input className={"col-span-1 sm:col-span-1 w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"} inputMode="numeric" placeholder="T" value={epSeason} onChange={(e) => setEpSeason(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Temporada" />
                    <input className={"col-span-1 sm:col-span-1 w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"} inputMode="numeric" placeholder="E" value={epNumber} onChange={(e) => setEpNumber(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Episodio" />
                    <input className={"col-span-2 sm:col-span-3 w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"} placeholder="Título del episodio" value={epTitle} onChange={(e) => setEpTitle(e.target.value)} />
                    <input className={"col-span-4 sm:col-span-5 w-full bg-[#050505] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"} placeholder="https://.../episodio.mp4" value={epUrl} onChange={(e) => setEpUrl(e.target.value)} />
                    <button type="button" onClick={addEpisode} className="col-span-4 sm:col-span-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl text-xs py-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                      + Agregar
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">T = temporada, E = número de episodio. Si repites T y E, se reemplaza ese episodio.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center justify-between gap-3 bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 cursor-pointer">
                  <span>
                    <span className="block text-sm font-bold text-white">Próximo estreno</span>
                    <span className="block text-[11px] text-gray-400">Sale en la fila "Próximos estrenos" y aún no se puede reproducir.</span>
                  </span>
                  <input type="checkbox" checked={newComingSoon} onChange={(e) => setNewComingSoon(e.target.checked)} className="w-5 h-5 accent-green-500 cursor-pointer" />
                </label>
                {newComingSoon ? (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Fecha de estreno</label>
                    <input type="date" value={newReleaseDate} onChange={(e) => setNewReleaseDate(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" style={{ colorScheme: "dark" }} />
                  </div>
                ) : <div />}
                <label className="sm:col-span-2 flex items-center justify-between gap-3 bg-green-500/5 border border-green-500/30 rounded-xl px-4 py-3 cursor-pointer">
                  <span>
                    <span className="block text-sm font-bold text-white">📣 Avisar a todos al guardar</span>
                    <span className="block text-[11px] text-gray-400">Envía una notificación a los dispositivos que activaron los avisos (nueva película, próximo estreno o "¡Ya disponible!").</span>
                  </span>
                  <input type="checkbox" checked={notifyAll} onChange={(e) => setNotifyAll(e.target.checked)} className="w-5 h-5 accent-green-500 cursor-pointer" />
                </label>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Saltar intro y créditos (opcional, en minutos:segundos{newMovieType === "serie" ? " — igual para todos los episodios" : ""})</label>
                <div className="grid grid-cols-3 gap-3">
                  <input type="text" placeholder="Intro empieza 0:30" value={newIntroStart} onChange={(e) => setNewIntroStart(e.target.value.replace(/[^0-9:]/g, ""))} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="La intro empieza en" />
                  <input type="text" placeholder="Intro termina 1:45" value={newIntroEnd} onChange={(e) => setNewIntroEnd(e.target.value.replace(/[^0-9:]/g, ""))} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="La intro termina en" />
                  <input type="text" placeholder="Créditos 1:38:20" value={newCreditsStart} onChange={(e) => setNewCreditsStart(e.target.value.replace(/[^0-9:]/g, ""))} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Los créditos empiezan en" />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Ejemplo: intro de 0:30 a 1:45 y créditos desde 1:38:20. Déjalo vacío si no aplica.</p>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Tráiler (opcional: enlace MP4 o de YouTube) — se reproduce sin sonido en la portada</label>
                <input type="url" placeholder="https://www.youtube.com/watch?v=... o https://.../trailer.mp4" value={newMovieTrailer} onChange={(e) => setNewMovieTrailer(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Sinopsis</label>
                <textarea 
                  rows={3}
                  placeholder="Descripción breve..." 
                  value={newMovieDesc}
                  onChange={(e) => setNewMovieDesc(e.target.value)}
                  className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <button type="submit" className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-black font-black py-3.5 rounded-xl text-sm transition shadow-lg shadow-green-950/50 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                {editingMovieId ? "Guardar Cambios de la Película" : "Publicar Contenido en la Web"}
              </button>
            </form>
          </div>

          <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white w-full lg:w-auto lg:mr-auto">
                <span>Gestión del Catálogo ({customMovies.length} títulos)</span>
              </h3>
              <button
                onClick={() => {
                  if (confirm("Esto REEMPLAZA todo el catálogo del servidor por el que ves en este dispositivo. Úsalo solo si estás seguro de que esta lista es la correcta. ¿Continuar?")) {
                    let pass = "";
                    try { pass = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
                    if (!pass) {
                      pendingSaveRef.current = () => saveCatalog(customMovies, "Catálogo completo enviado.");
                      setServerPassError("");
                      setShowServerPass(true);
                    } else saveCatalog(customMovies, "Catálogo completo enviado.");
                  }
                }}
                className="whitespace-nowrap flex items-center justify-center gap-1.5 bg-white text-black hover:bg-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <Globe className="w-3.5 h-3.5" /> {syncing ? "Publicando..." : "Publicar todo ahora"}
              </button>
              <button
                onClick={handleExportCatalog}
                className="whitespace-nowrap flex items-center justify-center gap-1.5 bg-green-500 text-black hover:bg-green-400 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <Download className="w-3.5 h-3.5" /> Exportar catálogo
              </button>
              <button
                onClick={handleAdminLogout}
                className="whitespace-nowrap flex items-center justify-center gap-1.5 bg-[#181818] text-gray-300 hover:bg-gray-800 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-800 transition cursor-pointer self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <LogOut className="w-3.5 h-3.5" /> Salir de admin
              </button>
              <button 
                onClick={() => {
                  if (confirm("¿Restaurar catálogo por defecto y limpiar caché corrupta?")) {
                    localStorage.removeItem("cineverso_custom_movies");
                    alert("Catálogo restaurado. Se recargará el catálogo publicado.");
                    window.location.reload();
                  }
                }}
                className="whitespace-nowrap flex items-center justify-center gap-1.5 bg-red-950/40 text-red-400 hover:bg-red-900/40 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-900/50 transition cursor-pointer self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Forzar Restauración
              </button>
            </div>

            <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-2">
              {customMovies.map((movie) => (
                <div key={movie.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#050505] p-3.5 rounded-2xl border border-gray-900 hover:border-gray-800 transition gap-3">
                  <div className="flex items-center gap-3 truncate">
                    <img decoding="async" loading="lazy" src={posterSrc(movie)} alt={movie.title} className="w-12 h-16 object-cover rounded-xl border border-gray-800 shrink-0" />
                    <div className="truncate">
                      <h4 className="text-sm font-bold text-white truncate">{movie.title}</h4>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <span className="bg-gray-900 px-2 py-0.5 rounded text-green-400 font-semibold">{movie.tag}</span>
                        <span>{movie.year}</span>
                        <span className="uppercase text-[10px] text-gray-500 font-bold">({movie.type || 'película'})</span>
                        {movie.comingSoon && <span className="text-[10px] font-black text-black bg-yellow-400 px-1.5 py-0.5 rounded">PRÓXIMO · {fmtRelease(movie.releaseDate)}</span>}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 truncate max-w-[260px] sm:max-w-[420px]" title={movie.videoUrl}>{movie.videoUrl}</p>
                      {linkStatus[String(movie.id)] && (
                        <p className={`text-[11px] font-bold mt-0.5 ${linkStatus[String(movie.id)].indexOf("✔") === 0 ? "text-green-400" : linkStatus[String(movie.id)].indexOf("✖") === 0 ? "text-red-400" : "text-gray-400"}`}>{linkStatus[String(movie.id)]}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {movie.comingSoon && (
                      <button
                        onClick={() => releaseNow(movie)}
                        className="flex items-center gap-1 bg-green-500 hover:bg-green-400 text-black px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        🎬 Estrenar ahora
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!confirm("¿Enviar un aviso de \"" + movie.title + "\" a todos los dispositivos suscritos?")) return;
                        sendPush(movie.comingSoon
                          ? { title: "Próximo estreno 🎬", body: movie.title + " llega el " + fmtRelease(movie.releaseDate) + ".", image: movie.backdrop || movie.bgImage, url: "/ver/" + movie.id, tag: "m-" + movie.id }
                          : { title: "Te recomendamos 🍿", body: movie.title + " ya está disponible en Cineverso Mágico.", image: movie.backdrop || movie.bgImage, url: "/ver/" + movie.id, tag: "m-" + movie.id });
                      }}
                      className="flex items-center gap-1 bg-[#181818] hover:bg-gray-800 text-gray-300 px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      📣 Avisar
                    </button>
                    <button
                      onClick={() => testLink(movie)}
                      className="flex items-center gap-1 bg-[#181818] hover:bg-gray-800 text-gray-300 px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <Play className="w-3.5 h-3.5" /> Probar
                    </button>
                    <button 
                      onClick={() => handleEditClick(movie)}
                      className="flex items-center gap-1 bg-[#181818] hover:bg-emerald-950/40 text-emerald-400 px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button 
                      onClick={() => handleDeleteMovie(movie.id)}
                      className="flex items-center gap-1 bg-[#181818] hover:bg-red-950/40 text-red-400 px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VISTA CUENTA Y PERFILES */}
      {activeTab === "cuenta" && (
        <div className="max-w-3xl mx-auto pt-24 px-4 sm:px-6 pb-24 space-y-8 overflow-x-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#0f0f0f] p-6 rounded-2xl border border-gray-900 gap-4">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <img decoding="async" loading="lazy" src={activeProfile.avatar} alt={activeProfile.name} className="w-16 h-16 rounded-2xl object-cover bg-gray-900 border-2 border-green-500" />
                {canEditProfile(activeProfile) && (
                  <button onClick={() => openEditProfile(activeProfile)} aria-label="Editar perfil" className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-lg border-2 border-[#0f0f0f] hover:scale-110 transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
                )}
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold">PERFIL ACTIVO</span>
                <h2 className="text-2xl font-bold text-white truncate max-w-[200px] sm:max-w-none">{activeProfile.name}</h2>
              </div>
            </div>
            <button onClick={() => (accountUser ? (setWhoManage(false), setShowWho(true)) : setShowAddProfileModal(true))} className="flex items-center justify-center gap-2 bg-[#181818] hover:bg-gray-800 px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
              <User className="w-4 h-4" /> {accountUser ? "Cambiar perfil" : "Agregar perfil"}
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Perfiles</h3>
              <span className="text-xs text-gray-500">{profiles.length} de {isGuest ? "3 (Invitado)" : "5 (Correo)"} perfiles</span>
            </div>

            <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-gray-900 space-y-3">
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-[#050505] p-3 rounded-xl border border-gray-900">
                  <div className="flex items-center gap-3 truncate">
                    <img decoding="async" loading="lazy" src={p.avatar} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-gray-900 shrink-0" />
                    <div className="truncate">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-sm font-bold text-white truncate">{p.name}</span>
                        {p.id === activeProfile.id && <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold shrink-0">En uso</span>}
                      </div>
                      <span className="text-xs text-gray-600">{p.isKid ? "Niños" : "Estándar"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {p.id !== activeProfile.id && (
                      <button onClick={() => handleSelectProfile(p)} className="text-xs text-emerald-400 hover:underline cursor-pointer font-bold focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1">Cambiar</button>
                    )}
                    {canEditProfile(p) && (
                      <button onClick={() => openEditProfile(p)} aria-label={"Editar " + p.name} className="w-9 h-9 rounded-full bg-[#181818] hover:bg-white hover:text-black text-gray-300 border border-gray-800 flex items-center justify-center transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
                    )}
                  </div>
                </div>
              ))}

              <button 
                onClick={() => {
                  const limit = isGuest ? 3 : 5;
                  if (profiles.length >= limit) {
                    alert(`Límite alcanzado: Tienes ${profiles.length} de ${limit} perfiles permitidos.`);
                    return;
                  }
                  setShowAddProfileModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 p-3 bg-[#050505] hover:bg-[#121212] rounded-xl text-sm font-bold border border-dashed border-gray-800 transition text-gray-400 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <PlusCircle className="w-4 h-4 text-green-400" /> Agregar perfil
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Cuenta</h3>
            <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-gray-900 space-y-4">
              {accountUser ? (
                <div className="flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-xs text-green-400 font-bold">Sesión iniciada · se guarda en todos tus dispositivos</span>
                    <p className="text-sm font-bold text-white truncate">{accountUser.email}</p>
                  </div>
                  <button onClick={handleLogout} className="text-xs text-red-400 hover:underline cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1">Cerrar sesión</button>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-green-500/10 text-green-400 rounded-xl shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Estás como Invitado</h4>
                      <p className="text-xs text-gray-500 mt-0.5">En modo invitado no se guarda nada: tu lista, tu progreso y tus perfiles se borran al cerrar la página. Inicia sesión para guardarlos en todos tus dispositivos (hasta 5 perfiles).</p>
                    </div>
                  </div>

                  {registerStep === "forgot" ? (
                    <form onSubmit={handleForgotSubmit} className="space-y-3 pt-2">
                      <h4 className="text-sm font-bold text-white">Recuperar contraseña</h4>
                      <p className="text-xs text-gray-400">Escribe el correo de tu cuenta y te enviaremos un código para crear una contraseña nueva.</p>
                      <input type="email" required autoComplete="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-white" />
                      <button type="submit" className="w-full bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-sm transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                        {authBusy ? "Enviando..." : "Enviar código"}
                      </button>
                      <button type="button" onClick={() => { setRegisterStep("form"); setAuthMode("login"); setAuthError(""); }} className="w-full text-xs text-gray-400 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1">← Volver a iniciar sesión</button>
                    </form>
                  ) : registerStep === "reset" || registerStep === "resetlink" ? (
                    <form onSubmit={handleResetSubmit} className="space-y-3 pt-2">
                      <h4 className="text-sm font-bold text-white">Crea tu contraseña nueva</h4>
                      {registerStep === "reset" && (
                        <>
                          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-300">
                            Te enviamos un código a <b>{email}</b>. Revisa tu bandeja de entrada (y la carpeta de spam).
                          </div>
                          <input type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={8} placeholder="Código del correo" value={inputCode} onChange={(e) => setInputCode(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-center tracking-widest font-mono text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </>
                      )}
                      <div className="relative">
                        <input
                          type={showPass ? "text" : "password"}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          placeholder="Contraseña nueva (mínimo 6)"
                          value={newPass}
                          onChange={(e) => setNewPass(e.target.value)}
                          className="w-full bg-[#050505] border border-gray-800 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-white"
                        />
                        <button type="button" tabIndex={-1} onClick={() => setShowPass((v) => !v)} aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white cursor-pointer focus:outline-none">
                          {showPass ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          )}
                        </button>
                      </div>
                      <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-black font-bold py-3 rounded-xl text-sm transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                        {authBusy ? "Guardando..." : "Cambiar contraseña y entrar"}
                      </button>
                      <div className="flex items-center justify-between text-xs">
                        {registerStep === "reset" ? (
                          <button type="button" onClick={() => handleForgotSubmit({ preventDefault() {} } as any)} className="text-emerald-400 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1">Reenviar código</button>
                        ) : <span />}
                        <button type="button" onClick={() => { setRegisterStep("form"); setAuthMode("login"); setAuthError(""); setResetTokens(null); }} className="text-gray-400 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1">Cancelar</button>
                      </div>
                    </form>
                  ) : registerStep === "verify" ? (
                    <form onSubmit={handleVerifyCode} className="space-y-3 pt-2">
                      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-300">
                        Te enviamos un código a <b>{email}</b>. Revisa tu bandeja de entrada (y la carpeta de spam).
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={8}
                        placeholder="Código del correo"
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value)}
                        className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-center tracking-widest font-mono text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-black font-bold py-3 rounded-xl text-sm transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                        {authBusy ? "Verificando..." : "Verificar código"}
                      </button>
                      <div className="flex items-center justify-between text-xs">
                        <button type="button" onClick={handleResendCode} className="text-emerald-400 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1">Reenviar código</button>
                        <button type="button" onClick={() => { setRegisterStep("form"); setAuthError(""); }} className="text-gray-400 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1">Cambiar correo</button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleAuthSubmit} className="space-y-3 pt-2">
                      <div className="flex items-center bg-[#050505] border border-gray-800 rounded-xl p-1">
                        <button type="button" onClick={() => { setAuthMode("login"); setAuthError(""); }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 ${authMode === "login" ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}>
                          Iniciar sesión
                        </button>
                        <button type="button" onClick={() => { setAuthMode("register"); setAuthError(""); }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 ${authMode === "register" ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}>
                          Crear cuenta
                        </button>
                      </div>
                      <input
                        type="email"
                        required
                        placeholder="tu@correo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-white"
                      />
                      <div className="relative">
                        <input
                          type={showPass ? "text" : "password"}
                          required
                          minLength={6}
                          autoComplete={authMode === "login" ? "current-password" : "new-password"}
                          placeholder="Contraseña (mínimo 6)"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-[#050505] border border-gray-800 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-white"
                        />
                        <button type="button" tabIndex={-1} onClick={() => setShowPass((v) => !v)} aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white cursor-pointer focus:outline-none">
                          {showPass ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          )}
                        </button>
                      </div>
                      {authMode === "login" && (
                        <div className="text-right -mt-1">
                          <button type="button" onClick={() => { setRegisterStep("forgot"); setAuthError(""); }} className="text-xs text-emerald-400 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-1 py-1">¿Olvidaste tu contraseña?</button>
                        </div>
                      )}
                      <button type="submit" className="w-full bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-sm transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                        {authBusy ? "Un momento..." : authMode === "login" ? "Iniciar sesión" : "Crear cuenta (te enviaremos un código)"}
                      </button>
                    </form>
                  )}
                  {authError && <p className="text-xs text-red-400 font-bold">{authError}</p>}
                </>
              )}
            </div>
          </div>

          {accountUser && (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">🏅 Mis logros</h3>
                  <p className="text-xs text-gray-500">{unlocked.length} de {BADGES.length} desbloqueados{topBadge ? " · Tu insignia en las reseñas y el chat: " + topBadge.icon + " " + topBadge.name : ""}</p>
                </div>
                <button onClick={() => { setWrapStep(0); setWrapOpen(true); }} className="shrink-0 text-xs font-black text-black px-3 py-2 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/60" style={{ background: "linear-gradient(90deg,#22c55e,#a3e635)" }}>🎁 Tu año en Cineverso</button>
              </div>
              {isOwner && (
                <div className="flex items-center gap-4 rounded-2xl p-4 border border-yellow-400/50" style={{ background: "linear-gradient(120deg, rgba(250,204,21,.18), rgba(34,197,94,.10) 60%, rgba(0,0,0,0))" }}>
                  <span className="text-4xl leading-none">👑</span>
                  <div>
                    <p className="text-base font-black text-yellow-300">Fundador de Cineverso Mágico</p>
                    <p className="text-xs text-gray-300">Insignia exclusiva del creador y dueño de la web. Solo tu cuenta la tiene, y se muestra junto a tu nombre en las reseñas y en el chat.</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {BADGES.map((b) => {
                  const ok = b.have >= b.need;
                  const pct = Math.min(100, Math.round((Math.min(b.have, b.need) / b.need) * 100));
                  return (
                    <div key={b.id} className={"rounded-2xl border p-3 flex flex-col gap-2 " + (ok ? "bg-gradient-to-br from-yellow-500/15 to-green-500/10 border-yellow-500/40" : "bg-[#0f0f0f] border-gray-900")}>
                      <div className="flex items-center gap-2">
                        <span className={"text-2xl leading-none " + (ok ? "" : "grayscale opacity-40")}>{b.icon}</span>
                        <span className={"text-sm font-bold leading-tight " + (ok ? "text-white" : "text-gray-400")}>{b.name}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-snug">{b.desc}</p>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: ok ? "#facc15" : "#22c55e" }} /></div>
                      <p className="text-[10px] font-bold" style={{ color: ok ? "#facc15" : "#6b7280" }}>{ok ? "✔ Desbloqueado" : Math.min(b.have, b.need) + " / " + b.need}</p>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-2xl border border-yellow-500/20 bg-[#0f0f0f] p-4">
                <p className="text-sm font-black text-white">🏆 Insignias de temporada</p>
                <p className="text-[11px] text-gray-500 mb-3">Se ganan completando los 3 retos de cada mes. Son de colección: solo se consiguen en su mes.</p>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                  {seasonBadges.slice().sort().reverse().map((k) => (
                    <div key={"sb-" + k} className="shrink-0 w-[92px] flex flex-col items-center text-center gap-1">
                      <span className="w-16 h-16 rounded-full flex items-center justify-center text-3xl border-2 border-yellow-300" style={{ background: "radial-gradient(circle, rgba(250,204,21,.4), rgba(250,204,21,.05))", boxShadow: "0 0 24px rgba(250,204,21,.25)" }}>{seasonIcon(k)}</span>
                      <span className="text-[11px] font-bold text-yellow-200 leading-tight">{monthLabel(k)}</span>
                    </div>
                  ))}
                  {challenges && seasonBadges.indexOf(challenges.key) === -1 && (
                    <div className="shrink-0 w-[92px] flex flex-col items-center text-center gap-1">
                      <span className="w-16 h-16 rounded-full flex items-center justify-center text-3xl border-2 border-dashed border-gray-600 grayscale opacity-50">{challenges.icon}</span>
                      <span className="text-[11px] font-bold text-gray-500 leading-tight">{challenges.label}<br />{challenges.list.filter((c) => c.done).length}/3 retos</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Lo que sigues */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">🔔 Sagas y géneros que sigues</h3>
              <p className="text-xs text-gray-500">Cuando llegue algo nuevo de lo que sigues, te avisamos{pushState === "subscribed" ? " en este dispositivo" : " (activa la campanita 🔔 para recibirlo en tu celular)"} y aparece en «Novedades de lo que sigues».</p>
            </div>
            <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-2xl border border-gray-900 space-y-4">
              {allSagas.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 mb-2">🎞️ Sagas</p>
                  <div className="flex flex-wrap gap-2">
                    {allSagas.map((sg) => (
                      <button key={"fs-" + sg} onClick={() => toggleFollowTopic("saga", sg)} aria-pressed={isFollowing("saga", sg)} className={"text-xs font-bold px-3 py-2 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 " + (isFollowing("saga", sg) ? "bg-green-500 text-black border-green-500" : "bg-[#050505] text-gray-300 border-gray-800 hover:border-green-500")}>{isFollowing("saga", sg) ? "✓ " : "+ "}{sg}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-gray-400 mb-2">🎭 Géneros</p>
                <div className="flex flex-wrap gap-2">
                  {allGenres.slice(0, 24).map((g) => (
                    <button key={"fg-" + g} onClick={() => toggleFollowTopic("genre", g)} aria-pressed={isFollowing("genre", g)} className={"text-xs font-bold px-3 py-2 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 " + (isFollowing("genre", g) ? "bg-green-500 text-black border-green-500" : "bg-[#050505] text-gray-300 border-gray-800 hover:border-green-500")}>{isFollowing("genre", g) ? "✓ " : "+ "}{g}</button>
                  ))}
                </div>
              </div>
              {pushState !== "subscribed" && (follows.sagas.length > 0 || follows.genres.length > 0) && (
                <button onClick={enablePush} className="text-xs font-black text-black bg-yellow-400 hover:bg-yellow-300 px-4 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-yellow-300">🔔 Activar avisos en este dispositivo</button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">🎬 Pedir una película o serie</h3>
              <p className="text-xs text-gray-500">¿No encuentras algo? Pídelo y le llega directo al administrador.</p>
            </div>
            <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-gray-900 space-y-3">
              {accountUser ? (
                <>
                  <input type="text" maxLength={120} placeholder="Nombre de la película o serie" value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <input type="text" maxLength={300} placeholder="Comentario (opcional): año, idioma, temporada…" value={reqNote} onChange={(e) => setReqNote(e.target.value)} className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <button onClick={sendRequest} disabled={reqBusy} className="w-full sm:w-auto bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold px-6 py-3 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">{reqBusy ? "Enviando…" : "📬 Enviar pedido"}</button>
                  {myReqs.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <p className="text-xs font-bold text-gray-400">Mis pedidos</p>
                      {myReqs.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 bg-[#050505] border border-gray-900 rounded-xl px-3 py-2">
                          <span className="flex-1 min-w-0 text-sm text-white truncate">{r.title}{r.reply ? <span className="block text-[11px] text-gray-400">{r.reply}</span> : null}</span>
                          <span className={"text-[10px] font-black px-2 py-1 rounded-full shrink-0 " + (r.status === "agregada" ? "bg-green-500/20 text-green-400" : r.status === "rechazada" ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400")}>
                            {r.status === "agregada" ? "✔ Ya está" : r.status === "rechazada" ? "No disponible" : "En revisión"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">Inicia sesión arriba para pedir películas y ver el estado de tus pedidos.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">Este dispositivo</h3>
              <p className="text-xs text-gray-500">Se guarda solo aquí; no afecta a tus otros dispositivos.</p>
            </div>

            <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-gray-900 space-y-4">
              <div 
                onClick={() => setTvMode(!tvMode)}
                tabIndex={0}
                role="switch"
                aria-checked={tvMode}
                className="flex items-center justify-between cursor-pointer select-none hover:bg-[#151515] p-2 rounded-xl transition"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#181818] rounded-lg text-gray-400"><Tv className="w-4 h-4" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Modo TV</h4>
                    <p className="text-xs text-gray-500">Interfaz más grande y navegación optimizada para mando.</p>
                  </div>
                </div>
                <input 
                  type="checkbox" 
                  tabIndex={-1}
                  checked={tvMode} 
                  onChange={(e) => setTvMode(e.target.checked)} 
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 accent-green-500 cursor-pointer"
                />
              </div>

              <div 
                onClick={() => setSkipAdsNotice(!skipAdsNotice)}
                className="flex items-center justify-between cursor-pointer select-none hover:bg-[#151515] p-2 rounded-xl transition"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#181818] rounded-lg text-gray-400"><Shield className="w-4 h-4" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Omitir aviso de anuncios</h4>
                    <p className="text-xs text-gray-500">No mostrar el aviso antes de reproducir.</p>
                  </div>
                </div>
                <input 
                  type="checkbox" 
                  checked={skipAdsNotice} 
                  onChange={(e) => setSkipAdsNotice(e.target.checked)} 
                  className="w-5 h-5 accent-green-500 cursor-pointer"
                />
              </div>

              <div onClick={toggleDataSaver} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") toggleDataSaver(); }} className="flex items-center justify-between gap-3 p-2 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#181818] rounded-lg text-gray-400 shrink-0 text-sm leading-none">📶</div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Ahorro de datos</h4>
                    <p className="text-xs text-gray-500">No reproduce tráileres automáticos. Ideal con datos móviles.</p>
                  </div>
                </div>
                <input type="checkbox" checked={dataSaver} readOnly tabIndex={-1} className="w-5 h-5 accent-green-500 cursor-pointer pointer-events-none" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-900 p-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#181818] rounded-lg text-gray-400"><Trash2 className="w-4 h-4" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Borrar "Continuar viendo"</h4>
                    <p className="text-xs text-gray-500">Solo el progreso guardado en este dispositivo.</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setContinueWatchingList([]); showToast("Historial borrado."); }}
                  className="bg-[#181818] hover:bg-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg text-white border border-gray-800 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Borrar
                </button>
              </div>
            </div>
          </div>

          {accountUser && (
            <button 
              onClick={handleLogout} 
              className="w-full flex items-center justify-center gap-2 p-3.5 bg-[#121212] hover:bg-gray-800 text-red-400 font-bold rounded-2xl text-xs border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          )}
        </div>
      )}

      {/* MODAL DE INFORMACIÓN DE PELÍCULA */}
      {selectedMovie && !isPlaying && (
        <div data-tv-modal data-detail-modal className="fixed inset-0 bg-[#141414] z-50 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="bg-[#141414] w-full min-h-screen relative shadow-2xl flex flex-col overflow-x-hidden">
            {/* Cerrar (siempre visible, respeta la muesca del iPhone) */}
            <button 
              onClick={() => setSelectedMovie(null)} 
              aria-label="Cerrar"
              className="fixed right-3 sm:right-6 z-[55] bg-black/70 hover:bg-black text-white p-2.5 sm:p-3 rounded-full transition cursor-pointer border border-gray-700 shadow-2xl flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-green-500"
              style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* Imagen / tráiler (16:9 en celular, más alto en PC y TV) */}
            <div className="relative w-full bg-black overflow-hidden shrink-0" style={{ height: "min(56.25vw, 64vh)", minHeight: 200 }}>
              <img
                src={wideSrc(selectedMovie, true)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: modalTrailerReady ? 0 : 1, transition: "opacity .8s" }}
              />
              {modalTrailerOn && selectedMovie.trailerUrl && (
                youtubeId(selectedMovie.trailerUrl) ? (
                  <YtBg
                    key={"myt-" + selectedMovie.id}
                    vid={youtubeId(selectedMovie.trailerUrl)}
                    muted={modalMuted}
                    title={"Tráiler de " + selectedMovie.title}
                    onReady={setModalTrailerReady}
                    style={{ position: "absolute", top: "50%", left: "50%", width: "100%", height: "56.25vw", minHeight: "100%", transform: "translate(-50%,-50%) scale(1.36)", border: 0, pointerEvents: "none", opacity: modalTrailerReady ? 1 : 0, transition: "opacity .8s" }}
                  />
                ) : (
                  <video
                    key={"mtr-" + selectedMovie.id}
                    src={selectedMovie.trailerUrl}
                    autoPlay
                    muted={modalMuted}
                    ref={(v) => { if (v && v.muted !== modalMuted) { v.muted = modalMuted; if (!modalMuted) { v.volume = 1; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); } } }}
                    playsInline
                    loop
                    preload="auto"
                    tabIndex={-1}
                    onPlaying={() => setModalTrailerReady(true)}
                    onError={() => setModalTrailerOn(false)}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: modalTrailerReady ? 1 : 0, transition: "opacity .8s" }}
                  />
                )
              )}
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#141414] to-transparent" />
              {modalTrailerOn && modalTrailerReady && (
                <button
                  onClick={() => setModalMuted((m) => !m)}
                  aria-label={modalMuted ? "Activar sonido del tráiler" : "Silenciar tráiler"}
                  style={{ top: "calc(env(safe-area-inset-top, 0px) + 14px)" }} className="absolute right-[64px] sm:right-[92px] z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-gray-400 bg-black/60 text-white flex items-center justify-center cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                >
                  <span className="text-sm">{modalMuted ? "🔇" : "🔊"}</span>
                </button>
              )}
              {selectedMovie.comingSoon && (
                <span className="absolute left-3 sm:left-8 top-3 sm:top-6 bg-green-500 text-black text-[11px] sm:text-xs font-black px-2.5 py-1 rounded">PRÓXIMO ESTRENO · {fmtRelease(selectedMovie.releaseDate).toUpperCase()}</span>
              )}
            </div>

            {/* Título y datos: debajo de la imagen, nunca tapados */}
            <div className="relative z-10 -mt-8 sm:-mt-20">
              <div className="px-4 sm:px-14 space-y-3 sm:space-y-4 max-w-5xl w-full">
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black leading-tight text-white drop-shadow-2xl break-words pr-12 sm:pr-0">
                  {selectedMovie.title}
                  {selectedMovie.subtitle && (
                    <span className="block text-base sm:text-2xl text-orange-400 mt-1 font-extrabold">{selectedMovie.subtitle}</span>
                  )}
                </h2>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm font-semibold">
                  {selectedMovie.rating && <span className="text-green-400 font-bold">★ {selectedMovie.rating}</span>}
                  {selectedMovie.year && <span className="text-gray-300">{selectedMovie.year}</span>}
                  {selectedMovie.ageRating && <span className="border border-gray-400 text-gray-200 px-1.5 rounded text-[11px] font-bold">{selectedMovie.ageRating}</span>}
                  {selectedMovie.duration && <span className="text-gray-300">{selectedMovie.duration}</span>}
                  {selectedMovie.type === "serie" && sortedEpisodes(selectedMovie).length > 0 && (
                    <span className="text-gray-300">{sortedEpisodes(selectedMovie).map((e) => e.season).filter((v, i, a) => a.indexOf(v) === i).length} temporada(s)</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(selectedMovie.genres && selectedMovie.genres.length ? selectedMovie.genres : [selectedMovie.tag]).filter(Boolean).map((g) => (
                    <span key={"g-" + g} className="text-[11px] sm:text-xs text-gray-200 bg-white/10 border border-white/10 px-2.5 py-1 rounded-full">{g}</span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {selectedMovie.comingSoon ? (
                    <button
                      data-autofocus
                      onClick={enablePush}
                      className="w-full sm:w-auto justify-center flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold px-6 sm:px-7 py-3 rounded-xl transition shadow-xl cursor-pointer text-sm sm:text-base focus:outline-none focus:ring-4 focus:ring-green-300"
                    >
                      {pushState === "subscribed" ? "✔ Te avisaremos del estreno" : "🔔 Avísame del estreno"} · {fmtRelease(selectedMovie.releaseDate)}
                    </button>
                  ) : (
                    <button 
                      data-autofocus
                      onClick={() => startPlayback(selectedMovie)}
                      className="w-full sm:w-auto justify-center flex items-center gap-2 bg-white hover:bg-gray-200 text-black font-bold px-6 sm:px-7 py-3 rounded-xl transition shadow-xl cursor-pointer text-sm sm:text-base focus:outline-none focus:ring-4 focus:ring-green-500"
                    >
                      <Play className="w-5 h-5 fill-black" /> Reproducir
                    </button>
                  )}
                  <button 
                    onClick={() => toggleMyList(selectedMovie)}
                    aria-label="Mi Lista"
                    className="flex items-center gap-2 bg-[#262626]/90 hover:bg-[#333] text-white font-medium px-3 sm:px-6 py-3 rounded-full sm:rounded-xl border border-gray-700 transition cursor-pointer text-sm sm:text-base focus:outline-none focus:ring-4 focus:ring-green-500"
                  >
                    {inMyList(selectedMovie) ? <><Check className="w-5 h-5 text-green-400" /> <span className="hidden sm:inline">En Mi Lista</span></> : <><Plus className="w-5 h-5" /> <span className="hidden sm:inline">Mi Lista</span></>}
                  </button>
                  <button
                    onClick={() => rateMovie(selectedMovie, 1)}
                    aria-label="Me gusta"
                    className={`p-3 rounded-full border transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500 ${ratings[String(selectedMovie.id)] === 1 ? "bg-green-500 border-green-500 text-black" : "bg-[#262626]/90 border-gray-700 text-white hover:bg-[#333]"}`}
                  >
                    <ThumbsUp className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => rateMovie(selectedMovie, -1)}
                    aria-label="No me gusta"
                    className={`p-3 rounded-full border transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500 ${ratings[String(selectedMovie.id)] === -1 ? "bg-red-600 border-red-600 text-white" : "bg-[#262626]/90 border-gray-700 text-white hover:bg-[#333]"}`}
                  >
                    <ThumbsDown className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => shareMovie(selectedMovie)}
                    aria-label="Compartir"
                    className="flex items-center gap-2 bg-[#262626]/90 hover:bg-[#333] text-white font-medium px-3 sm:px-5 py-3 rounded-full sm:rounded-xl border border-gray-700 transition cursor-pointer text-sm sm:text-base focus:outline-none focus:ring-4 focus:ring-green-500"
                  >
                    <Share2 className="w-4 h-4" /> <span className="hidden sm:inline">Compartir</span>
                  </button>
                </div>

                <p className="text-gray-300 text-xs sm:text-sm leading-relaxed max-w-3xl line-clamp-3 pt-1">
                  {selectedMovie.desc}
                </p>
                {(selectedMovie.saga || selectedMovie.tag) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {([["saga", selectedMovie.saga], ["genre", selectedMovie.tag]] as ["saga" | "genre", string | undefined][]).filter((x) => !!x[1]).map(([k, n]) => {
                      const on = isFollowing(k, n as string);
                      return (
                        <button key={"mf-" + k} onClick={() => toggleFollowTopic(k, n as string)} aria-pressed={on} className={"text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 " + (on ? "bg-green-500/20 text-green-300 border-green-500/60" : "bg-black/40 text-gray-200 border-white/15 hover:border-green-400")}>
                          {on ? "✓ Sigues " : "🔔 Seguir "}{k === "saga" ? "la saga «" + n + "»" : "«" + n + "»"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-14 space-y-6 bg-[#141414] flex-1">
              {selectedMovie.type === "serie" && sortedEpisodes(selectedMovie).length > 0 && (() => {
                const eps = sortedEpisodes(selectedMovie);
                const seasons = eps.map((e) => e.season).filter((v, i, a) => a.indexOf(v) === i);
                const season = seasons.indexOf(modalSeason) !== -1 ? modalSeason : seasons[0];
                const saved = continueWatchingList.find((p) => String(p.id) === String(selectedMovie.id));
                return (
                  <div className="max-w-6xl space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-bold text-white">Episodios</h3>
                      <select
                        value={season}
                        onChange={(e) => setModalSeason(parseInt(e.target.value, 10))}
                        className="bg-[#262626] border border-gray-700 text-white text-sm font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        {seasons.map((n) => <option key={n} value={n}>Temporada {n}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      {eps.filter((e) => e.season === season).map((ep) => {
                        const isSaved = saved && saved.episodeId === ep.id;
                        return (
                          <div
                            key={ep.id}
                            onClick={() => playEpisode(selectedMovie, ep)}
                            tabIndex={0}
                            className="flex items-center gap-4 p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] border border-gray-800 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                          >
                            <span className="text-2xl font-black text-gray-500 w-8 text-center shrink-0">{ep.number}</span>
                            <div className="relative shrink-0 rounded-lg overflow-hidden bg-gray-900" style={{ width: 120, height: 68 }}>
                              <img decoding="async" loading="lazy" src={posterSrc(selectedMovie)} alt="" className="w-full h-full object-cover opacity-80" />
                              <span className="absolute inset-0 flex items-center justify-center"><Play className="w-6 h-6 text-white fill-white" /></span>
                              {isSaved && saved && (
                                <span className="absolute left-0 right-0 bottom-0 h-1 bg-gray-700"><span className="block h-full bg-green-500" style={{ width: Math.min(100, Math.round((saved.time / saved.duration) * 100)) + "%" }} /></span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-white truncate">{ep.title}</p>
                              <p className="text-[11px] text-gray-400">{"Temporada " + ep.season + " · Episodio " + ep.number}{ep.duration ? " · " + ep.duration : ""}{isSaved ? " · Continuar" : ""}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {selectedMovie.saga && catalog.filter((x) => x.saga === selectedMovie.saga).length >= 2 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-white">🎞️ Saga: {selectedMovie.saga}</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                    {catalog.filter((x) => x.saga === selectedMovie.saga).sort(sagaSort).map((x, i) => (
                      <button
                        key={"saga-m-" + x.id}
                        onClick={() => setSelectedMovie(x)}
                        className={"shrink-0 w-28 sm:w-32 text-left rounded-xl overflow-hidden border-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500 " + (String(x.id) === String(selectedMovie.id) ? "border-green-500" : "border-gray-800 hover:border-white/60")}
                      >
                        <div className="relative aspect-[2/3] bg-gray-900">
                          <img decoding="async" src={posterSrc(x)} alt={x.title} loading="lazy" className="w-full h-full object-cover" />
                          <span className="absolute top-1 left-1 bg-black/75 text-white text-[10px] font-black px-1.5 py-0.5 rounded">{i + 1}</span>
                        </div>
                        <p className="text-[11px] text-gray-300 font-semibold leading-tight mx-1.5 mt-1 mb-1.5 h-[28px] overflow-hidden" title={x.title} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as any}>{sagaShort(x, i)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!selectedMovie.comingSoon && (
                <div className="bg-white/[0.03] border border-gray-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-black text-white">⭐ Lo que dice la comunidad</p>
                      {revData && revData.count > 0 ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-2xl font-black text-white">{revData.avg.toFixed(1)}</span>
                          {starRow(revData.avg, 16)}
                          <span className="text-xs text-gray-400">({revData.count} reseña{revData.count === 1 ? "" : "s"})</span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">Aún no hay reseñas. ¡Sé el primero en opinar!</p>
                      )}
                    </div>
                    <button onClick={() => { if (!accountUser) { showToast("Inicia sesión para crear listas."); return; } setListPickFor(selectedMovie); }} className="text-xs font-bold text-white bg-[#181818] hover:bg-gray-800 border border-gray-700 px-3 py-2 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">📂 Añadir a una lista</button>
                  </div>
                  {accountUser ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1" onMouseLeave={() => setRevHover(0)}>
                        <span className="text-xs text-gray-400 mr-2">Tu nota:</span>
                        {[1, 2, 3, 4, 5].map((k) => (
                          <button key={"st-" + k} type="button" aria-label={k + " estrellas"} onMouseEnter={() => setRevHover(k)} onClick={() => setRevStars(k)} className="p-0.5 cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-yellow-400">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill={(revHover || revStars) >= k ? "#facc15" : "none"} stroke="#facc15" strokeWidth="1.6" strokeLinejoin="round"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" /></svg>
                          </button>
                        ))}
                        <span className="text-xs text-yellow-400 font-bold ml-2">{["", "Mala", "Regular", "Buena", "Muy buena", "¡Obra maestra!"][revHover || revStars]}</span>
                      </div>
                      <div className="flex gap-2">
                        <input type="text" maxLength={160} value={revText} onChange={(e) => setRevText(e.target.value)} placeholder="Tu opinión en una línea (opcional)" className="flex-1 min-w-0 bg-[#050505] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                        <button onClick={submitReview} disabled={revBusy} className="shrink-0 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-black px-4 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/60">{revBusy ? "…" : revData && revData.reviews.some((r) => r.mine) ? "Actualizar" : "Publicar"}</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setSelectedMovie(null); goToLogin(); }} className="text-xs font-bold text-green-400 hover:underline cursor-pointer">Inicia sesión para dejar tu reseña con estrellas</button>
                  )}
                  {revData && revData.reviews.length > 0 && (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {revData.reviews.map((r, i) => (
                        <div key={"rv-" + i} className="flex gap-3 bg-black/30 rounded-xl p-3">
                          {r.avatar ? <img decoding="async" loading="lazy" src={r.avatar} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-900 shrink-0" /> : <span className="w-9 h-9 rounded-lg bg-gray-700 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white">{r.name}</span>
                              {r.badge === "👑" ? <span className="text-[10px] font-black bg-yellow-400 text-black px-1.5 py-0.5 rounded">👑 FUNDADOR</span> : r.badge && <span className="text-sm" title="Logro">{r.badge}</span>}
                              {starRow(r.stars, 12)}
                              <span className="text-[10px] text-gray-500 ml-auto">{new Date(r.at).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span>
                            </div>
                            {r.text && <p className="text-sm text-gray-300 mt-0.5 break-words">{r.text}</p>}
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {REACTS.map((em) => {
                                const n = (r.reacts && r.reacts[em]) || 0;
                                const on = r.myReact === em;
                                if (r.mine && !n) return null;
                                return (
                                  <button key={em} disabled={r.mine} onClick={() => reactReview(r.at, em)} aria-pressed={on} aria-label={"Reaccionar " + em} className={"flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border transition " + (r.mine ? "border-white/10 bg-white/5 text-gray-300 cursor-default" : on ? "border-green-400 bg-green-500/20 text-white cursor-pointer" : "border-white/10 bg-white/5 text-gray-300 hover:border-white/30 cursor-pointer") + " focus:outline-none focus:ring-2 focus:ring-green-500"} style={on ? { animation: "cvPick .35s ease-out" } : undefined}>
                                    <span className="text-sm leading-none">{em}</span>{n > 0 && <span>{n}</span>}
                                  </button>
                                );
                              })}
                              {r.mine && <button onClick={deleteMyReview} className="text-[11px] text-red-400 hover:underline cursor-pointer ml-1">Borrar mi reseña</button>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-6 sm:gap-8 border-b border-gray-800 text-sm font-bold overflow-x-auto scrollbar-none">
                <button 
                  onClick={() => setMovieModalTab("detalles")}
                  className={`pb-3 relative cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-green-500 ${movieModalTab === "detalles" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white"}`}
                >
                  Detalles
                </button>
                <button 
                  onClick={() => setMovieModalTab("reparto")}
                  className={`pb-3 relative cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-green-500 ${movieModalTab === "reparto" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white"}`}
                >
                  Reparto
                </button>
                <button 
                  onClick={() => setMovieModalTab("similares")}
                  className={`pb-3 relative cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-green-500 ${movieModalTab === "similares" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white"}`}
                >
                  Más como esto
                </button>
              </div>

              {movieModalTab === "detalles" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-sm max-w-6xl">
                  <div className="md:col-span-2 space-y-4">
                    <p className="text-gray-300 leading-relaxed text-base sm:text-lg">
                      {selectedMovie.desc}
                    </p>
                  </div>

                  <div className="space-y-4 text-xs sm:text-sm text-gray-400 border-l border-gray-800/80 pl-6">
                    <div>
                      <span className="text-gray-500 block mb-1">Géneros</span>
                      <span className="text-gray-200 font-medium">{selectedMovie.genres && selectedMovie.genres.length ? selectedMovie.genres.join(", ") : selectedMovie.tag}</span>
                    </div>
                    {selectedMovie.director && (
                      <div>
                        <span className="text-gray-500 block mb-1">Dirección</span>
                        <span className="text-gray-200 font-medium">{selectedMovie.director}</span>
                      </div>
                    )}
                    {selectedMovie.cast && (
                      <div>
                        <span className="text-gray-500 block mb-1">Reparto</span>
                        <span className="text-gray-200 font-medium">{selectedMovie.cast}</span>
                      </div>
                    )}
                    {selectedMovie.ageRating && (
                      <div>
                        <span className="text-gray-500 block mb-1">Clasificación</span>
                        <span className="text-gray-200 font-medium">{selectedMovie.ageRating === "ATP" ? "Apta para todo público" : "Mayores de " + selectedMovie.ageRating.replace("+", "") + " años"}</span>
                      </div>
                    )}
                    {selectedMovie.duration && (
                      <div>
                        <span className="text-gray-500 block mb-1">Duración</span>
                        <span className="text-gray-200 font-medium">{selectedMovie.duration}</span>
                      </div>
                    )}
                    {selectedMovie.production && (
                      <div>
                        <span className="text-gray-500 block mb-1">Productora</span>
                        <span className="text-gray-200 font-medium">{selectedMovie.production}</span>
                      </div>
                    )}
                    {selectedMovie.originalLanguage && (
                      <div>
                        <span className="text-gray-500 block mb-1">Idioma original</span>
                        <span className="text-gray-200 font-medium uppercase">{selectedMovie.originalLanguage}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {movieModalTab === "reparto" && (
                <div className="text-sm text-gray-300 py-4 space-y-2 max-w-6xl">
                  <p className="font-bold text-white text-base">Elenco principal:</p>
                  <p className="text-gray-400 text-sm">{selectedMovie.cast || "Todavía no hay información del reparto."}</p>
                  {selectedMovie.director && <p className="text-gray-400 text-sm pt-2"><b className="text-white">Dirección:</b> {selectedMovie.director}</p>}
                </div>
              )}

              {movieModalTab === "similares" && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 max-w-6xl">
                  {(() => {
                    const g = (x: Movie) => (x.genres && x.genres.length ? x.genres : [x.tag]);
                    const mine = g(selectedMovie);
                    const others = catalog.filter((m) => m.id !== selectedMovie.id);
                    const score = (m: Movie) => g(m).filter((t) => mine.indexOf(t) !== -1).length + (m.tag === selectedMovie.tag ? 2 : 0);
                    return others.map((m) => ({ m, sc: score(m) })).sort((a, b) => b.sc - a.sc).slice(0, 8).map((x) => x.m);
                  })().map(sim => (
                    <div key={sim.id} onClick={() => setSelectedMovie(sim)} tabIndex={0} className="cursor-pointer group focus:outline-none focus:ring-4 focus:ring-green-500 rounded-xl">
                      <img decoding="async" loading="lazy" src={posterSrc(sim)} alt={sim.title} className="w-full h-44 object-cover rounded-xl group-hover:border border-green-500 transition shadow-lg" />
                      <h5 className="text-xs font-bold mt-2 text-gray-200 truncate">{sim.title}</h5>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REPRODUCTOR FLOTANTE */}
      {selectedMovie && isPlaying && (
        <div
          data-tv-modal
          ref={playerShellRef}
          className={"cv-player fixed inset-0 bg-[#070707] z-50 overflow-hidden flex flex-col justify-center" + (touchUi ? " cv-touch" : "")}
          style={{ cursor: playerUi ? "default" : "none", paddingTop: "env(safe-area-inset-top, 0px)" }}
          onMouseMove={wakePlayerUi}
          onTouchStart={wakePlayerUi}
          onKeyDown={wakePlayerUi}
        >
          <div className="flex-1 min-h-0 flex items-center justify-center sm:px-4 sm:pt-4 lg:px-6 lg:pt-6 cv-pstage">
          <div className="relative w-full h-full bg-black overflow-hidden sm:rounded-2xl sm:border sm:border-white/5 shadow-2xl">
            <video 
              ref={playerRef}
              x-webkit-airplay="allow"
              data-autofocus
              tabIndex={0}
              controls={!touchUi}
              autoPlay
              playsInline
              preload="auto"
              controlsList="nodownload"
              className="w-full h-full focus:outline-none"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: videoFit }}
              onLoadStart={() => setVideoLoading(true)}
              onWaiting={() => setVideoLoading(true)}
              onCanPlay={() => setVideoLoading(false)}
              onPlaying={() => { setVideoLoading(false); trackPlaying(selectedMovie); }}
              onTimeUpdate={(e) => { recordProgress(e.currentTarget, selectedMovie, false); updateSkip(e.currentTarget.currentTime, selectedMovie); trackTime(e.currentTarget, selectedMovie); }}
              onPause={(e) => recordProgress(e.currentTarget, selectedMovie, true)}
              onEnded={(e) => {
                recordProgress(e.currentTarget, selectedMovie, true);
                const nx = nextEpisodeOf(selectedMovie, currentEpisode);
                if (nx) setNextUp({ ep: nx, secs: 8 });
                else if (!nextSaga) offerNextSaga(10);
              }}
              onError={(e) => {
                const err = e.currentTarget.error;
                const code = err ? err.code : 0;
                const isSample = (selectedMovie.backupVideoUrl || "").indexOf("gtv-videos-bucket") !== -1;
                if (!usingBackup && selectedMovie.backupVideoUrl && !isSample) {
                  setUsingBackup(true);
                  return;
                }
                setVideoLoading(false);
                if (code === 3) {
                  setPlayerError("Este dispositivo no puede decodificar este video (H.265/HEVC, 10 bits o audio Dolby). Necesita una versión MP4 H.264 + AAC.");
                  return;
                }
                setPlayerError("Comprobando el enlace del video...");
                diagnoseVideo(selectedMovie.videoUrl || "", code);
              }}
            >
              Tu navegador no soporta el reproductor.
            </video>
            {touchUi && !playerError && (
              <TouchControls
                videoRef={playerRef}
                title={selectedMovie.title + (currentEpisode ? " · T" + currentEpisode.season + ":E" + currentEpisode.number : "")}
                onBack={() => setIsPlaying(false)}
                onCast={handleCast}
                onFullscreen={toggleTouchFullscreen}
                isFull={isFull}
                fit={videoFit}
                onFit={toggleVideoFit}
                rate={playRate}
                onRate={setPlayRate}
                nextLabel="Siguiente episodio"
                onNext={nextEpisodeOf(selectedMovie, currentEpisode) ? () => { const nx = nextEpisodeOf(selectedMovie, currentEpisode); if (nx) playEpisode(selectedMovie, nx); } : null}
                loading={videoLoading}
              />
            )}
            {nextSaga && !playerError && (
              <div style={{ position: "absolute", right: 20, bottom: touchUi ? 118 : 70, zIndex: 35 }} className="bg-[#141414]/95 border border-gray-700 rounded-2xl p-3 shadow-2xl flex gap-3 items-center max-w-[340px]" data-tv-modal>
                <img src={posterSrc(nextSaga.m)} alt="" className="w-14 h-20 rounded-lg object-cover bg-gray-900 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-green-400 uppercase font-black">🎞️ Sigue la saga · en {nextSaga.secs} s</p>
                  <p className="text-sm font-bold text-white mt-0.5 truncate">{nextSaga.m.sagaOrder ? "Parte " + nextSaga.m.sagaOrder + " · " : ""}{nextSaga.m.title}</p>
                  <div className="flex gap-2 mt-2">
                    <button data-autofocus onClick={() => { const m = nextSaga.m; setNextSaga(null); startPlayback(m); }} className="bg-white text-black font-bold text-xs px-3 py-2 rounded-lg cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">▶ Ver ahora</button>
                    <button data-close-on-back onClick={() => { if (selectedMovie) nextSagaDismissed.current = String(selectedMovie.id); setNextSaga(null); }} className="bg-[#262626] text-white font-bold text-xs px-3 py-2 rounded-lg border border-gray-700 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Cancelar</button>
                  </div>
                </div>
              </div>
            )}
            {skipMode && !nextUp && !nextSaga && !playerError && (
              <button
                data-skip-btn
                onClick={() => {
                  const v = playerRef.current;
                  if (!v || !selectedMovie) return;
                  if (skipMode === "intro" && selectedMovie.introEnd) {
                    try { v.currentTime = selectedMovie.introEnd; } catch (err) {}
                    updateSkip(selectedMovie.introEnd, selectedMovie);
                    try { v.focus(); } catch (err) {}
                    return;
                  }
                  const nx = nextEpisodeOf(selectedMovie, currentEpisode);
                  if (nx) { playEpisode(selectedMovie, nx); return; }
                  // película: termina y vuelve a la ficha
                  recordProgress(v, selectedMovie, true);
                  setContinueWatchingList((prev) => prev.filter((p) => String(p.id) !== String(selectedMovie.id)));
                  setIsPlaying(false);
                }}
                style={{ position: "absolute", right: 20, bottom: touchUi ? 118 : 70, zIndex: 34 }}
                className="flex items-center gap-2 bg-white/95 hover:bg-white text-black font-bold text-sm px-5 py-3 rounded-lg shadow-2xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
              >
                <SkipForward className="w-4 h-4" />
                {skipMode === "intro" ? "Saltar intro" : nextEpisodeOf(selectedMovie, currentEpisode) ? "Siguiente episodio" : "Saltar créditos"}
              </button>
            )}
            {nextUp && (
              <div style={{ position: "absolute", right: 20, bottom: touchUi ? 118 : 70, zIndex: 35 }} className="bg-[#141414]/95 border border-gray-700 rounded-2xl p-4 shadow-2xl" data-tv-modal>
                <p className="text-[11px] text-gray-400 uppercase font-bold">Siguiente episodio en {nextUp.secs} s</p>
                <p className="text-sm font-bold text-white mt-1 max-w-[260px] truncate">T{nextUp.ep.season}:E{nextUp.ep.number} · {nextUp.ep.title}</p>
                <div className="flex gap-2 mt-3">
                  <button data-autofocus onClick={() => selectedMovie && playEpisode(selectedMovie, nextUp.ep)} className="bg-white text-black font-bold text-xs px-4 py-2 rounded-lg cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">▶ Ver ahora</button>
                  <button data-close-on-back onClick={() => setNextUp(null)} className="bg-[#262626] text-white font-bold text-xs px-4 py-2 rounded-lg border border-gray-700 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Cancelar</button>
                </div>
              </div>
            )}
            {videoLoading && !playerError && !touchUi && (
              <div style={{ position: "absolute", top: "50%", left: 0, right: 0, marginTop: -40, textAlign: "center", pointerEvents: "none" }}>
                <div className="inline-block w-12 h-12 rounded-full border-4 border-gray-700 border-t-green-500 animate-spin" />
                <p className="text-sm text-gray-300 mt-3">Cargando película...</p>
              </div>
            )}
            {playerError && (
              <div
                data-tv-modal
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
              >
                <div className="bg-[#141414] border border-red-900 rounded-2xl p-6 text-center" style={{ maxWidth: 640, width: "100%" }}>
                  <p className="text-red-300 font-bold text-base mb-2">No se pudo reproducir «{selectedMovie.title}»</p>
                  <p className="text-gray-200 text-sm leading-relaxed mb-5">{playerError}</p>
                  <button
                    data-autofocus
                    onClick={() => {
                      setPlayerError("");
                      setUsingBackup(false);
                      setVideoLoading(true);
                      const v = playerRef.current;
                      if (v) {
                        try { v.load(); const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (err) {}
                        setTimeout(() => { try { v.focus(); } catch (err) {} }, 50);
                      }
                    }}
                    className="inline-block bg-white text-black font-bold text-sm px-6 py-3 rounded-xl cursor-pointer mr-3 focus:outline-none focus:ring-4 focus:ring-green-500"
                  >
                    Reintentar
                  </button>
                  <button
                    onClick={() => { setPlayerError(""); setIsPlaying(false); }}
                    className="inline-block bg-[#262626] text-white font-bold text-sm px-6 py-3 rounded-xl border border-gray-700 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                  >
                    Volver
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Barra inferior: título y botones (no tapa la película) */}
          <div className="cv-ppanel shrink-0 px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
            <button 
              onClick={() => setIsPlaying(false)}
              className="flex items-center gap-2 text-white font-black text-base sm:text-xl hover:text-green-400 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded-lg p-1 min-w-0 max-w-full"
            >
              <ArrowLeft className="w-5 h-5" /> <span className="truncate">{selectedMovie.title}{currentEpisode ? " · T" + currentEpisode.season + ":E" + currentEpisode.number + " " + currentEpisode.title : ""}</span>
            </button>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none max-w-full pb-0.5" style={{ scrollbarWidth: "none" }}>
              <button 
                onClick={touchUi ? toggleTouchFullscreen : requestFullscreenSafe}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold border border-white/10 whitespace-nowrap shrink-0 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <Maximize2 className="w-4 h-4 text-green-400" /> Pantalla completa
              </button>
              <div className="relative">
                <button
                  onClick={() => setRateOpen((o) => !o)}
                  aria-label="Velocidad de reproducción"
                  className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold border border-white/10 whitespace-nowrap shrink-0 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <span className="text-green-400">⏩</span> {playRate === 1 ? "Velocidad" : playRate + "x"}
                </button>
                {rateOpen && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#141414] border border-gray-700 rounded-xl p-1.5 flex flex-col min-w-[110px] shadow-2xl z-30">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                      <button key={"rate-" + r} onClick={() => { setPlayRate(r); setRateOpen(false); }} className={"text-xs font-bold px-3 py-2 rounded-lg text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 " + (playRate === r ? "bg-green-500 text-black" : "text-gray-200 hover:bg-white/10")}>
                        {r === 1 ? "Normal" : r + "x"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {pipSupported && (
                <button
                  onClick={togglePip}
                  className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold border border-white/10 whitespace-nowrap shrink-0 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="11" width="8" height="6" rx="1" fill="#4ade80" /></svg> Imagen flotante
                </button>
              )}
              {nextEpisodeOf(selectedMovie, currentEpisode) && (
                <button
                  onClick={() => { const nx = nextEpisodeOf(selectedMovie, currentEpisode); if (nx) playEpisode(selectedMovie, nx); }}
                  className="flex items-center gap-1.5 bg-white text-black px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <SkipForward className="w-4 h-4" /> Siguiente episodio
                </button>
              )}
              <button 
                onClick={toggleVideoFit}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold border border-white/10 whitespace-nowrap shrink-0 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <Tv className="w-4 h-4 text-green-400" /> {videoFit === "cover" ? "Ver completa" : "Llenar pantalla"}
              </button>
              <button 
                onClick={handleCast}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold border border-white/10 whitespace-nowrap shrink-0 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <Cast className="w-4 h-4 text-green-400" /> Transmitir
              </button>
              <button 
                onClick={() => toggleMyList(selectedMovie)}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold border border-white/10 whitespace-nowrap shrink-0 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {inMyList(selectedMovie) ? <><Check className="w-4 h-4 text-green-400" /> En Mi Lista</> : <><Plus className="w-4 h-4 text-green-400" /> Mi Lista</>}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* PIE DE PÁGINA + ATRIBUCIÓN TMDB */}
      {(activeTab === "inicio" || activeTab === "explorar") && (
        <footer className="px-4 sm:px-6 md:px-12 pb-28 lg:pb-10 pt-4 border-t border-gray-900 text-[11px] text-gray-500 space-y-1">
          <p className="flex items-center gap-2 flex-wrap">
            <img decoding="async" loading="lazy" src="/icons/icon-192.png" alt="" className="w-5 h-5 rounded" />
            <span className="font-bold text-gray-400">Cineverso Mágico</span>
          </p>
          <p>
            Datos e imágenes de películas proporcionados por{" "}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-[#01b4e4] font-bold hover:underline">TMDB</a>.
            Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.
          </p>
        </footer>
      )}

      {/* BARRA DE NAVEGACIÓN INFERIOR (MÓVIL) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-2xl border-t border-white/10"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around px-2 pt-3 pb-3">
          {[
            { id: "inicio", label: "Inicio", Icon: HomeIcon },
            { id: "explorar", label: "Explorar", Icon: Search },
            { id: "tv", label: "TV", Icon: Tv },
            { id: "milista", label: "Mi Lista", Icon: Bookmark },
          ].filter((x) => !(kidsMode && x.id === "tv")).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id as typeof activeTab)}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="flex flex-1 flex-col items-center gap-1.5 cursor-pointer select-none active:scale-95 transition focus:outline-none"
              >
                <Icon
                  className={`w-6 h-6 transition-colors ${active ? "text-green-400" : "text-gray-400"}`}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className={`text-[12px] leading-none transition-colors ${active ? "text-green-400 font-bold" : "text-gray-400 font-medium"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* BANNER FLOTANTE DE INSTALACIÓN PWA */}
      {deferredPrompt && (
        <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 bg-[#141414] border border-gray-800 p-4 rounded-2xl shadow-2xl flex items-center gap-4 text-white max-w-sm animate-bounce">
          <div className="p-3 bg-green-500/10 text-green-400 rounded-xl shrink-0">
            <Download className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Instala Cineverso Mágico</h4>
            <p className="text-xs text-gray-400">Acceso directo, pantalla completa y arranque rápido.</p>
          </div>
          <button 
            onClick={handleInstallClick}
            className="bg-white text-black font-bold px-4 py-2 rounded-xl text-xs hover:bg-gray-200 transition cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Instalar
          </button>
        </div>
      )}

      {/* TOAST DE NOTIFICACIÓN */}
      {toastMessage && (
        <div className="fixed bottom-24 md:bottom-6 left-4 md:left-6 z-50 bg-[#0f0f0f] border border-green-500/50 text-white p-4 rounded-2xl shadow-2xl max-w-xs flex items-center gap-3">
          <Sparkle className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-xs text-gray-200">{toastMessage}</p>
        </div>
      )}

      {/* MODAL LOGIN ADMINISTRADOR (se abre con ?admin en la URL) */}
      {showAdminLogin && !isAdmin && (
        <div data-tv-modal className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAdminLogin} className="bg-[#0c0c0c] border border-green-500/30 w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-white">
              <Lock className="w-5 h-5 text-green-400" />
              <h3 className="text-lg font-bold">Acceso de administrador</h3>
            </div>
            <input
              type="password"
              autoFocus
              placeholder="Clave"
              value={adminPassInput}
              onChange={(e) => { setAdminPassInput(e.target.value); if (adminPassError) setAdminPassError(""); }}
              className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {adminPassError && <p className="text-xs text-red-500 font-bold">{adminPassError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdminLogin(false)} className="flex-1 bg-[#1a1a1a] hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-xs border border-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                Cancelar
              </button>
              <button type="submit" className="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                {adminChecking ? "Verificando..." : "Entrar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CLAVE DEL SERVIDOR (ADMIN_PASSWORD) */}
      {showServerPass && (
        <div data-tv-modal className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <form onSubmit={submitServerPass} className="bg-[#0c0c0c] border border-green-500/30 w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-white">
              <Lock className="w-5 h-5 text-green-400" />
              <h3 className="text-lg font-bold">Confirma tu clave</h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Escribe tu <b className="text-gray-200">clave de administrador</b> (la misma que usas con ?admin) para guardar los cambios para todos los dispositivos.
            </p>
            <input
              type="password"
              autoFocus
              placeholder="Clave de administrador"
              value={serverPassInput}
              onChange={(e) => { setServerPassInput(e.target.value); if (serverPassError) setServerPassError(""); }}
              className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {serverPassError && <p className="text-xs text-red-400 font-bold leading-relaxed">{serverPassError}</p>}
            <div className="flex gap-3">
              <button type="button" data-close-on-back onClick={() => { setShowServerPass(false); pendingSaveRef.current = null; }} className="flex-1 bg-[#1a1a1a] hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-xs border border-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                Cancelar
              </button>
              <button type="submit" className="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                {serverPassBusy ? "Verificando..." : "Guardar y publicar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* BIENVENIDA */}
      {onboard && (() => {
        const slides = [
          {
            kicker: "Bienvenido", accent: "#22c55e", glow: "rgba(34,197,94,.35)",
            title: <>Tu cine, en <span className="cv-ob-grad">todas tus pantallas</span></>,
            text: "Películas, series y TV en vivo, listas para ver donde estés.",
            bullets: ["Estrenos y clásicos en un solo lugar", "Celular, computadora y Smart TV", "Sin instalar nada: entra y mira"],
            badge: <div className="cv-ob-card"><span className="text-2xl">🎬</span><div><p className="text-[11px] text-gray-400 leading-none mb-1">Cineverso</p><p className="text-sm font-bold text-white leading-none">Nuevos títulos cada semana</p></div></div>,
          },
          {
            kicker: "Tu cuenta", accent: "#38bdf8", glow: "rgba(56,189,248,.32)",
            title: <>Tu progreso, <span className="cv-ob-grad">siempre a salvo</span></>,
            text: "Crea tu cuenta gratis y todo se guarda solo, en todos tus dispositivos.",
            bullets: ["Mi Lista siempre contigo", "Sigue justo donde te quedaste", "Como invitado no se guarda nada al cerrar"],
            badge: <div className="cv-ob-card"><span className="text-2xl">☁️</span><div className="min-w-[150px]"><p className="text-[11px] text-gray-400 leading-none mb-1.5">Seguir viendo · 1:12:30</p><div className="h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full w-2/3 rounded-full" style={{ background: "#38bdf8" }} /></div></div></div>,
          },
          {
            kicker: "Perfiles", accent: "#f472b6", glow: "rgba(244,114,182,.30)",
            title: <>Un perfil para <span className="cv-ob-grad">cada quien</span></>,
            text: "Cada persona con su lista, sus recomendaciones y su avatar.",
            bullets: ["Hasta 5 perfiles por cuenta", "Avatares originales de Cineverso", "Perfil Niños protegido con PIN"],
            badge: <div className="cv-ob-card"><div className="flex -space-x-3">{["zorro", "gato3d", "robot", "unicornio"].map((a) => <img decoding="async" loading="lazy" key={a} src={"/avatares/cv/" + a + ".svg"} alt="" className="w-9 h-9 rounded-xl border-2 border-[#111]" />)}</div><p className="text-sm font-bold text-white">¿Quién está viendo?</p></div>,
          },
          {
            kicker: "Comunidad", accent: "#facc15", glow: "rgba(250,204,21,.28)",
            title: <>Que no se te <span className="cv-ob-grad">escape nada</span></>,
            text: "Activa la campanita y entérate primero de cada estreno.",
            bullets: ["Avisos de estrenos con la 🔔", "Pide la película que falta", "Conversa en el chat de la comunidad"],
            badge: <div className="cv-ob-card"><span className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center text-black font-black text-sm">CV</span><div><p className="text-[11px] text-gray-400 leading-none mb-1">ahora · Cineverso Mágico</p><p className="text-sm font-bold text-white leading-none">¡Ya disponible! 🍿</p></div></div>,
          },
        ];
        const last = slides.length - 1;
        const sl = slides[onboardStep];
        const next = () => setOnboardStep((n) => Math.min(last, n + 1));
        const prev = () => setOnboardStep((n) => Math.max(0, n - 1));
        const pics = catalogAll.filter((m) => m.bgImage && !/unsplash/.test(m.bgImage)).map((m) => m.bgImage);
        const pool = pics.length >= 6 ? pics : pics.concat(myAvatars.filter((a) => a.cv).map((a) => a.file));
        const cols = [0, 1, 2, 3].map((c) => {
          const col = pool.filter((_, k) => k % 4 === c);
          const base = col.length ? col : pool;
          const list = base.concat(base, base).slice(0, 8);
          return list.concat(list);
        });
        return (
          <div
            data-tv-modal
            data-onboard
            className="fixed inset-0 z-[90] bg-[#050505] flex flex-col lg:flex-row overflow-hidden select-none overscroll-none"
            style={{ ["--ob" as any]: sl.accent, ["--obg" as any]: sl.glow, paddingTop: "env(safe-area-inset-top, 0px)", height: "100dvh", minHeight: "100%", touchAction: "pan-x" }}
            onTouchStart={(e) => { onboardTouch.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - onboardTouch.current; if (dx < -50) next(); else if (dx > 50) prev(); }}
            onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); next(); } else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); } }}
          >
            {/* Muro de pósters del catálogo */}
            <div className="relative h-[38vh] sm:h-[44vh] lg:h-full lg:w-[54%] overflow-hidden shrink-0">
              <div className="absolute inset-[-20%] flex gap-3 sm:gap-4 justify-center" style={{ transform: "rotate(-9deg)" }}>
                {cols.map((col, c) => (
                  <div key={"obc-" + c} className="flex flex-col gap-3 sm:gap-4 w-[26%] lg:w-[22%]" style={{ animation: "cvWall " + (38 + c * 7) + "s linear infinite", animationDirection: c % 2 ? "reverse" : "normal" }}>
                    {col.map((src, k) => <img decoding="async" key={"obp-" + c + "-" + k} src={src} alt="" loading="lazy" className="w-full aspect-[2/3] object-cover rounded-xl sm:rounded-2xl bg-gray-900 opacity-80" />)}
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-b lg:bg-gradient-to-r from-transparent via-[#050505]/40 to-[#050505]" />
              <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-b from-[#050505]/0 via-transparent to-[#050505]/70" />
              <div className="absolute inset-0 transition-all duration-700" style={{ background: "radial-gradient(circle at 50% 60%, var(--obg) 0%, transparent 55%)", mixBlendMode: "screen" }} />
              <div className="absolute inset-x-0 bottom-5 lg:bottom-0 lg:top-0 flex justify-center items-end lg:items-center px-4 pointer-events-none">
                <div key={"obb-" + onboardStep} className="max-w-full" style={{ animation: "cvObPop .5s cubic-bezier(.2,1.4,.4,1) both" }}>{sl.badge}</div>
              </div>
            </div>

            {/* Texto */}
            <div className="relative flex-1 flex flex-col px-6 sm:px-12 lg:px-16 xl:px-24 pb-6 lg:py-10 min-h-0 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
              <div className="hidden lg:flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="w-9 h-9 rounded-xl bg-green-500 text-black font-black text-sm flex items-center justify-center">CV</span><span className="font-black text-white tracking-tight">Cineverso Mágico</span></div>
                {onboardStep < last && <button onClick={() => closeOnboard(false)} className="text-sm font-bold text-gray-400 hover:text-white px-3 py-2 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">Saltar</button>}
              </div>
              {onboardStep < last && <button onClick={() => closeOnboard(false)} className="lg:hidden absolute right-4 -top-[calc(38vh-14px)] sm:-top-[calc(44vh-14px)] text-xs font-bold text-white bg-black/50 backdrop-blur px-3 py-1.5 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">Saltar</button>}

              <div key={"obt-" + onboardStep} className="flex-1 flex flex-col justify-center max-w-xl py-4" style={{ animation: "cvFade .45s ease-out both" }}>
                <p className="text-xs sm:text-sm font-black tracking-[0.25em] uppercase mb-3" style={{ color: "var(--ob)" }}>
                  <span className="font-mono">{String(onboardStep + 1).padStart(2, "0")}</span><span className="text-gray-600"> / {String(slides.length).padStart(2, "0")}</span> · {sl.kicker}
                </p>
                <h2 className="text-[2rem] leading-[1.05] sm:text-5xl xl:text-6xl font-black text-white tracking-tight mb-4">{sl.title}</h2>
                <p className="text-sm sm:text-lg text-gray-400 mb-5 sm:mb-7">{sl.text}</p>
                <ul className="space-y-2.5 sm:space-y-3">
                  {sl.bullets.map((t, k) => (
                    <li key={k} className="flex items-center gap-3 text-sm sm:text-base text-gray-200" style={{ animation: "cvFade .4s ease-out both", animationDelay: 0.12 + k * 0.08 + "s" }}>
                      <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--ob) 18%, transparent)", color: "var(--ob)" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="max-w-xl w-full space-y-4">
                <div className="flex gap-1.5">
                  {slides.map((_, k) => (
                    <button key={"seg-" + k} tabIndex={-1} aria-label={"Paso " + (k + 1)} onClick={() => setOnboardStep(k)} className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden cursor-pointer">
                      <span className="block h-full rounded-full transition-all duration-500" style={{ width: k <= onboardStep ? "100%" : "0%", background: "var(--ob)" }} />
                    </button>
                  ))}
                </div>
                {onboardStep < last ? (
                  <div className="flex gap-3">
                    {onboardStep > 0 && <button onClick={prev} aria-label="Atrás" className="w-14 shrink-0 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-xl font-bold cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">‹</button>}
                    <button data-autofocus onClick={next} className="flex-1 py-4 rounded-2xl text-black font-black text-base cursor-pointer transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-white/70" style={{ background: "var(--ob)", boxShadow: "0 10px 40px -10px var(--obg)" }}>Continuar</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button data-autofocus onClick={() => closeOnboard(true)} className="w-full py-4 rounded-2xl text-black font-black text-base cursor-pointer transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-white/70" style={{ background: "linear-gradient(90deg,#22c55e,#a3e635)", boxShadow: "0 10px 40px -10px rgba(34,197,94,.6)" }}>Crear mi cuenta gratis</button>
                    <div className="flex gap-3">
                      <button onClick={() => { closeOnboard(true); setAuthMode("login"); }} className="flex-1 py-3.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] text-white font-bold text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Ya tengo cuenta</button>
                      <button onClick={() => closeOnboard(false)} className="flex-1 py-3.5 rounded-2xl border border-white/10 hover:border-white/30 text-gray-300 font-bold text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Solo mirar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* CHAT DE LA COMUNIDAD */}
      {!tvMode && !isPlaying && !selectedMovie && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          aria-label="Abrir chat"
          className="fixed z-40 right-4 lg:right-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6 flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-black pl-4 pr-5 py-3 rounded-full shadow-2xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/60"
        >
          <span className="text-lg leading-none">💬</span>
          <span className="text-sm hidden sm:inline">Chat</span>
          {chatUnread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center border-2 border-[#050505]">{chatUnread > 9 ? "9+" : chatUnread}</span>}
        </button>
      )}
      {chatOpen && !tvMode && (
        <div data-tv-modal className="cv-chat z-[80] bg-[#0e0e0e] lg:rounded-2xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-500 text-black shrink-0">
            <span className="text-xl leading-none">💬</span>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm leading-tight">Chat Cineverso</p>
              <p className="text-[11px] font-bold opacity-80 leading-tight">● {chatOnline || 1} en línea</p>
            </div>
            <button data-close-on-back onClick={() => setChatOpen(false)} aria-label="Cerrar chat" className="w-9 h-9 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/70"><X className="w-5 h-5" /></button>
          </div>
          {chatPinned && (
            <div className="px-4 py-2.5 bg-[#16251b] border-b border-green-900/60 text-[12px] text-green-100 leading-snug shrink-0">📌 {chatPinned}</div>
          )}
          <div ref={chatListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1 overscroll-contain">
            {chatMsgs.length === 0 && <p className="text-center text-xs text-gray-500 py-10">Todavía no hay mensajes. ¡Sé el primero en saludar! 👋</p>}
            {chatMsgs.map((m) => (
              <div key={m.id} className="group flex gap-2.5 px-1.5 py-2 rounded-xl hover:bg-white/[0.03]">
                {m.avatar ? <img decoding="async" loading="lazy" src={m.avatar} alt="" className="w-8 h-8 rounded-lg object-cover bg-gray-900 shrink-0 mt-0.5" /> : <span className="w-8 h-8 rounded-lg shrink-0 mt-0.5 flex items-center justify-center text-sm font-black text-black" style={{ background: nameColor(m.name) }}>{(m.name || "?").charAt(0).toUpperCase()}</span>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-bold truncate" style={{ color: m.admin ? "#22c55e" : nameColor(m.name) }}>{m.name}</span>
                    {(m as any).owner && <span className="text-[9px] font-black bg-yellow-400 text-black px-1.5 rounded">👑 FUNDADOR</span>}
                    {m.admin && !(m as any).owner && <span className="text-[9px] font-black bg-green-500 text-black px-1.5 rounded">ADMIN</span>}
                    <span className="ml-auto text-[10px] text-gray-500 shrink-0">{fmtChatTime(m.at)}</span>
                  </div>
                  {(() => {
                    const mm = /https?:\/\/\S+\/ver\/(\d+)/.exec(m.text);
                    const mv = mm ? catalogAll.find((x) => String(x.id) === mm[1]) : undefined;
                    return (
                      <>
                        <p className="text-[13px] text-gray-200 leading-snug break-words whitespace-pre-wrap">{mm ? m.text.replace(mm[0], "").replace(/Míralo aquí:\s*$/, "").trim() : m.text}</p>
                        {mv && (
                          <button onClick={() => { setChatOpen(false); setSelectedMovie(mv); }} className="mt-1.5 flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-gray-800 rounded-xl p-1.5 pr-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                            <img decoding="async" loading="lazy" src={posterSrc(mv)} alt="" className="w-8 h-11 rounded object-cover bg-gray-900" />
                            <span className="text-xs font-bold text-white">▶ Ver ahora</span>
                          </button>
                        )}
                      </>
                    );
                  })()}
                  {isAdmin && (
                    <div className="flex gap-3 mt-1 opacity-60 group-hover:opacity-100">
                      <button onClick={() => chatAdmin("delete", { id: m.id })} className="text-[10px] text-red-400 hover:underline cursor-pointer">Borrar</button>
                      {!m.admin && <button onClick={() => { if (window.confirm("¿Bloquear a " + m.name + "? Se borrarán sus mensajes y ya no podrá escribir.")) chatAdmin("ban", { uid: m.uid }); }} className="text-[10px] text-red-400 hover:underline cursor-pointer">Bloquear</button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 p-3 shrink-0 bg-[#111]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
            {accountUser || isAdmin ? (
              <>
                {chatErr && <p className="text-[11px] text-red-400 font-bold mb-2">{chatErr}</p>}
                <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={300}
                    value={chatInput}
                    onChange={(e) => { setChatInput(e.target.value); if (chatErr) setChatErr(""); }}
                    placeholder={"Escribe como " + activeProfile.name + "…"}
                    className="flex-1 min-w-0 bg-[#050505] border border-gray-800 rounded-full px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button type="submit" disabled={chatBusy || !chatInput.trim()} aria-label="Enviar" className="w-11 h-11 rounded-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black flex items-center justify-center cursor-pointer shrink-0 focus:outline-none focus:ring-4 focus:ring-white/60">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" /></svg>
                  </button>
                </form>
                <p className="text-[10px] text-gray-500 mt-1.5 px-1">No se permiten enlaces. Para pedir películas usa también Cuenta → Pedir una película.</p>
              </>
            ) : (
              <button onClick={() => { setChatOpen(false); setActiveTab("cuenta"); try { window.scrollTo(0, 0); } catch (e) {} }} className="w-full bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Inicia sesión para escribir</button>
            )}
          </div>
        </div>
      )}

      {/* SORPRÉNDEME: ruleta según tus gustos */}
      {surprise && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85" style={{ backdropFilter: "blur(6px)" }} onClick={() => setSurprise(null)} role="dialog" aria-modal="true" aria-label="Sorpréndeme">
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-sm rounded-3xl border border-white/10 p-5 text-center overflow-hidden" style={{ background: "linear-gradient(160deg,#151515 0%,#0a0a0a 60%,#0d1f14 100%)", animation: "cvStory .3s ease-out" }}>
            <button onClick={() => setSurprise(null)} aria-label="Cerrar" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">✕</button>
            <p className="text-[11px] font-black tracking-widest text-green-400 uppercase">🎲 Sorpréndeme</p>
            <p className="text-lg font-black text-white mt-1">{surprise.phase === "spin" ? "Buscando algo para ti…" : "¡Esta es para ti, " + activeProfile.name + "!"}</p>
            <div className="relative mx-auto mt-4 rounded-2xl overflow-hidden bg-gray-900" style={{ width: 190, height: 285, boxShadow: surprise.phase === "done" ? "0 0 0 3px #22c55e, 0 0 60px rgba(34,197,94,.45)" : "0 0 0 2px rgba(255,255,255,.12)", transition: "box-shadow .4s" }}>
              {surprise.reel[surprise.idx] && <img key={"sr-" + surprise.idx} src={posterSrc(surprise.reel[surprise.idx])} alt={surprise.phase === "done" ? surprise.pick.title : ""} className="w-full h-full object-cover" style={{ animation: surprise.phase === "spin" ? "cvSpin .14s ease-out" : "cvPick .55s cubic-bezier(.2,.9,.3,1.3)" }} />}
            </div>
            {surprise.phase === "done" && (
              <div style={{ animation: "cvRise .4s ease-out both" }}>
                <p className="mt-4 text-xl font-black text-white leading-tight">{surprise.pick.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{[surprise.pick.year, surprise.pick.tag, surprise.pick.duration].filter(Boolean).join(" · ")}</p>
                <p className="mt-3 text-sm text-green-300 font-bold bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2">{surprise.why}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button autoFocus onClick={() => { const m = surprise.pick; setSurprise(null); if (m.type === "serie") setSelectedMovie(m); else startPlayback(m); }} className="bg-white hover:bg-gray-200 text-black font-black text-sm px-4 py-3 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">▶ Ver ahora</button>
                  <button onClick={() => { const m = surprise.pick; setSurprise(null); setSelectedMovie(m); }} className="bg-white/10 hover:bg-white/20 text-white font-bold text-sm px-4 py-3 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Ver ficha</button>
                </div>
                <button onClick={() => startSurprise(String(surprise.pick.id))} className="mt-2 w-full bg-green-500 hover:bg-green-400 text-black font-black text-sm px-4 py-3 rounded-xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/60">🎲 Otra</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFETI DE RETOS CUMPLIDOS */}
      {celebrate > 0 && (
        <div aria-hidden className="fixed inset-0 pointer-events-none z-[95] overflow-hidden">
          {Array.from({ length: 40 }).map((_, i) => (
            <span key={"rc-" + celebrate + "-" + i} className="cv-conf" style={{ left: ((i * 41) % 100) + "%", background: ["#facc15", "#22c55e", "#a855f7", "#f472b6", "#60a5fa"][i % 5], animationDuration: 2.6 + (i % 7) * 0.3 + "s", animationDelay: (i % 9) * 0.12 + "s" }} />
          ))}
        </div>
      )}

      {/* CONFETI DE CUMPLEAÑOS */}
      {isBirthday && !greetHidden && activeTab === "inicio" && nowTs > 0 && (
        <div aria-hidden className="fixed inset-0 pointer-events-none z-[95] overflow-hidden">
          {Array.from({ length: 36 }).map((_, i) => (
            <span key={"cf-" + i} className="cv-conf" style={{ left: ((i * 37) % 100) + "%", background: ["#22c55e", "#facc15", "#f472b6", "#60a5fa", "#fb923c"][i % 5], animationDuration: 2.8 + (i % 7) * 0.35 + "s", animationDelay: (i % 9) * 0.18 + "s" }} />
          ))}
        </div>
      )}

      {/* TU AÑO EN CINEVERSO */}
      {wrapOpen && (() => {
        const st = wrapStats;
        const slides = [
          { bg: "linear-gradient(160deg,#0b2a17,#050505 60%,#1d1236)", body: (
            <>
              <p className="text-sm font-black tracking-[0.3em] text-green-400 uppercase mb-4">Tu año en Cineverso {wrapYear}</p>
              <p className="text-4xl sm:text-6xl font-black text-white leading-tight">¡Hola, {activeProfile.name}!</p>
              <p className="text-lg text-gray-300 mt-4">Preparamos un resumen de todo lo que viviste este año en Cineverso. 🍿</p>
            </>) },
          { bg: "linear-gradient(160deg,#0c2440,#050505 60%,#0b2a17)", body: (
            <>
              <p className="text-lg text-gray-300">Este año viste</p>
              <p className="text-7xl sm:text-8xl font-black text-white my-2">{st.titles}</p>
              <p className="text-2xl font-black text-sky-300">título{st.titles === 1 ? "" : "s"}</p>
              <p className="text-lg text-gray-300 mt-6">y pasaste <b className="text-white">{st.hours} horas</b> frente a la pantalla.</p>
            </>) },
          { bg: "linear-gradient(160deg,#3b0d2e,#050505 60%,#2a1748)", body: (
            <>
              <p className="text-lg text-gray-300 mb-4">Tus géneros favoritos</p>
              {(st.topGenres.length ? st.topGenres : ["¡Aún por descubrir!"]).map((gn, i) => (
                <p key={"wg-" + i} className={"font-black " + (i === 0 ? "text-5xl sm:text-6xl text-pink-300" : "text-3xl text-white/80")} style={{ animation: "cvRise .5s ease-out both", animationDelay: i * 0.15 + "s" }}>{i + 1}. {gn}</p>
              ))}
            </>) },
          { bg: "linear-gradient(160deg,#2b1a05,#050505 60%,#0b2a17)", body: st.top ? (
            <>
              <p className="text-lg text-gray-300 mb-4">Lo que más viste</p>
              <img decoding="async" loading="lazy" src={posterSrc(st.top)} alt="" className="w-40 sm:w-48 aspect-[2/3] object-cover rounded-2xl mx-auto shadow-2xl border border-white/10" />
              <p className="text-2xl sm:text-3xl font-black text-white mt-5">{st.top.title}</p>
            </>) : (<><p className="text-3xl font-black text-white">Aún no viste ninguna película completa</p><p className="text-gray-300 mt-3">¡Empieza hoy y tu resumen se llenará solo!</p></>) },
          { bg: "linear-gradient(160deg,#3a2a05,#050505 55%,#2a1748)", body: (
            <>
              <p className="text-lg text-gray-300">Tu personalidad cinéfila es…</p>
              <p className="text-4xl sm:text-5xl font-black text-yellow-300 my-4 leading-tight">{st.pers.t}</p>
              <p className="text-lg text-gray-200">{st.pers.d}</p>
              <p className="text-sm text-gray-400 mt-6">🏅 {st.badges} logro{st.badges === 1 ? "" : "s"} desbloqueado{st.badges === 1 ? "" : "s"}{isOwner ? " · 👑 Fundador" : ""}</p>
            </>) },
          { bg: "linear-gradient(160deg,#0b2a17,#050505 60%,#1d1236)", body: (
            <>
              <p className="text-3xl sm:text-4xl font-black text-white">¡Compártelo!</p>
              <p className="text-gray-300 mt-2 mb-6">Tu tarjeta se comparte como imagen en Instagram, TikTok, Facebook y WhatsApp.</p>
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                <button data-autofocus onClick={() => shareWrap("share")} disabled={wrapBusy} className="col-span-2 bg-gradient-to-r from-green-500 to-lime-400 text-black font-black py-4 rounded-2xl cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-white/70">{wrapBusy ? "Creando tu tarjeta…" : "📸 Compartir mi tarjeta"}</button>
                <button onClick={() => shareWrap("whatsapp")} className="bg-[#25D366] text-white font-bold py-3 rounded-2xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/70">WhatsApp<span className="block text-[10px] font-semibold opacity-90">con tu tarjeta</span></button>
                <button onClick={() => shareWrap("facebook")} className="bg-[#1877F2] text-white font-bold py-3 rounded-2xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/70">Facebook<span className="block text-[10px] font-semibold opacity-90">con tu tarjeta</span></button>
                <button onClick={() => shareWrap("download")} disabled={wrapBusy} className="col-span-2 bg-white/10 text-white font-bold py-3 rounded-2xl cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-white/70">📥 Descargar imagen (para Instagram y TikTok)</button>
              </div>
            </>) },
        ];
        const last = slides.length - 1;
        const sl = slides[Math.min(wrapStep, last)];
        return (
          <div data-tv-modal className="fixed inset-0 z-[92] flex items-center justify-center bg-black/90 select-none" onKeyDown={(e) => { if (e.key === "ArrowRight") setWrapStep((n) => Math.min(last, n + 1)); if (e.key === "ArrowLeft") setWrapStep((n) => Math.max(0, n - 1)); }}>
            <div className="relative w-full h-full sm:w-[440px] sm:h-[min(820px,94vh)] sm:rounded-[32px] overflow-hidden flex flex-col" style={{ background: sl.bg, transition: "background .6s" }}>
              <div className="flex gap-1.5 px-4 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}>
                {slides.map((_, i) => <span key={"wb-" + i} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden"><span className="block h-full bg-white transition-all duration-500" style={{ width: i <= wrapStep ? "100%" : "0%" }} /></span>)}
              </div>
              <div className="flex items-center justify-between px-4 pt-3">
                <span className="text-xs font-black text-white/80">Cineverso Mágico</span>
                <button data-close-on-back onClick={() => setWrapOpen(false)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/70"><X className="w-4 h-4" /></button>
              </div>
              <div key={"ws-" + wrapStep} className="flex-1 flex flex-col items-center justify-center text-center px-7" style={{ animation: "cvStory .45s ease-out both" }}>{sl.body}</div>
              {wrapStep < last && (
                <>
                  <button aria-label="Anterior" onClick={() => setWrapStep((n) => Math.max(0, n - 1))} className="absolute left-0 top-20 bottom-24 w-1/3 cursor-pointer focus:outline-none" tabIndex={-1} />
                  <button aria-label="Siguiente" onClick={() => setWrapStep((n) => Math.min(last, n + 1))} className="absolute right-0 top-20 bottom-24 w-2/3 cursor-pointer focus:outline-none" tabIndex={-1} />
                  <div className="px-6 pb-6 relative z-10" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
                    <button data-autofocus onClick={() => setWrapStep((n) => Math.min(last, n + 1))} className="w-full bg-white text-black font-black py-3.5 rounded-2xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Siguiente ›</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* COMPARTIR */}
      {shareTarget && (() => {
        const url = shareUrlOf(shareTarget);
        const text = "Mira " + shareTarget.title + " en Cineverso Mágico 🍿";
        const e = encodeURIComponent;
        const open = (u: string) => { try { window.open(u, "_blank", "noopener,noreferrer"); } catch (err) { window.location.href = u; } setShareTarget(null); };
        const copy = () => {
          const nav: any = navigator;
          const ok = () => { showToast("¡Enlace copiado! 🔗"); setShareTarget(null); };
          try { if (nav.clipboard && nav.clipboard.writeText) { nav.clipboard.writeText(url).then(ok).catch(() => showToast(url, 8000)); return; } } catch (err) {}
          showToast(url, 8000);
        };
        const opts: { key: string; label: string; bg: string; icon: any; go: () => void }[] = [
          { key: "wa", label: "WhatsApp", bg: "#25D366", icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 0 1 12 4Zm-3.2 4c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3l-1.7-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5Z"/></svg>, go: () => open("https://wa.me/?text=" + e(text + " " + url)) },
          { key: "fb", label: "Facebook", bg: "#1877F2", icon: <span className="text-white font-black text-2xl leading-none" style={{ fontFamily: "Arial, sans-serif" }}>f</span>, go: () => open("https://www.facebook.com/sharer/sharer.php?u=" + e(url)) },
          { key: "tg", label: "Telegram", bg: "#229ED9", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M21.5 3.6 2.9 10.8c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.8.8s.6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5ZM9.4 13.4l8.9-5.6c.4-.3.8-.1.5.2l-7.4 6.7-.3 3.2-1.7-4.5Z"/></svg>, go: () => open("https://t.me/share/url?url=" + e(url) + "&text=" + e(text)) },
          { key: "x", label: "X (Twitter)", bg: "#000000", icon: <span className="text-white font-black text-xl leading-none" style={{ fontFamily: "Arial, sans-serif" }}>𝕏</span>, go: () => open("https://twitter.com/intent/tweet?text=" + e(text) + "&url=" + e(url)) },
          { key: "mail", label: "Correo", bg: "#6B7280", icon: <span className="text-white text-xl leading-none">✉️</span>, go: () => open("mailto:?subject=" + e(shareTarget.title + " | Cineverso Mágico") + "&body=" + e(text + "\n" + url)) },
        ];
        return (
          <div data-tv-modal className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={(ev) => { if (ev.target === ev.currentTarget) setShareTarget(null); }}>
            <div className="w-full sm:max-w-md bg-[#141414] border border-gray-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)", animation: "cvFade .2s ease-out both" }}>
              <div className="flex items-center gap-3">
                <img decoding="async" loading="lazy" src={posterSrc(shareTarget)} alt="" className="w-12 h-16 rounded-lg object-cover bg-gray-900 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">Compartir</p>
                  <p className="text-base font-bold text-white truncate">{shareTarget.title}</p>
                </div>
                <button data-close-on-back onClick={() => setShareTarget(null)} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-[#222] text-gray-300 hover:text-white flex items-center justify-center cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                {opts.map((o, i) => (
                  <button key={o.key} data-autofocus={i === 0 ? true : undefined} onClick={o.go} className="flex flex-col items-center gap-2 rounded-2xl py-2 cursor-pointer hover:bg-white/5 focus:outline-none focus:ring-4 focus:ring-green-500">
                    <span className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg" style={{ background: o.bg }}>{o.icon}</span>
                    <span className="text-[11px] sm:text-xs text-gray-300 font-semibold">{o.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 bg-[#0a0a0a] border border-gray-800 rounded-xl p-1.5 pl-3">
                <span className="flex-1 min-w-0 text-xs text-gray-400 truncate">{url}</span>
                <button onClick={copy} className="shrink-0 bg-white hover:bg-gray-200 text-black px-4 py-2 rounded-lg text-xs font-bold cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">🔗 Copiar enlace</button>
              </div>
              {typeof navigator !== "undefined" && (navigator as any).share && (
                <button onClick={() => { shareNative(shareTarget); setShareTarget(null); }} className="w-full text-sm font-bold text-gray-300 hover:text-white py-2 rounded-xl border border-gray-800 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Más opciones…</button>
              )}
            </div>
          </div>
        );
      })()}

      {/* VER UNA LISTA */}
      {viewList && (
        <div data-tv-modal className="fixed inset-0 z-[72] bg-black/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setViewList(null); }}>
          <div className="w-full max-w-3xl bg-[#0e0e0e] border border-gray-800 rounded-3xl p-5 sm:p-7 space-y-5 my-4" style={{ animation: "cvFade .25s ease-out both" }}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black tracking-widest text-green-400 uppercase">Lista de la comunidad</p>
                <h3 className="text-2xl sm:text-3xl font-black text-white break-words">{viewList.name}</h3>
                {viewList.desc && <p className="text-sm text-gray-400 mt-1">{viewList.desc}</p>}
                <div className="flex items-center gap-2 mt-2">
                  {viewList.avatar && <img decoding="async" loading="lazy" src={viewList.avatar} alt="" className="w-6 h-6 rounded-md object-cover" />}
                  <span className="text-xs text-gray-400">de <b className="text-gray-200">{viewList.owner}</b> · {viewList.movieIds.length} títulos · {viewList.followers} seguidor{viewList.followers === 1 ? "" : "es"}</span>
                </div>
              </div>
              <button data-close-on-back onClick={() => setViewList(null)} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-[#181818] text-gray-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {viewList.mine ? (
                <>
                  <button data-autofocus onClick={() => { setListEdit({ id: viewList.id, name: viewList.name, desc: viewList.desc, movieIds: viewList.movieIds.slice() }); setViewList(null); }} className="bg-white text-black font-bold px-4 py-2.5 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">✏️ Editar lista</button>
                  <button onClick={() => { if (window.confirm("¿Borrar la lista «" + viewList.name + "»?")) commPost({ action: "listDelete", id: viewList.id }).then(() => { showToast("Lista borrada."); setViewList(null); loadLists(); loadMeCounts(); }); }} className="border border-red-900 text-red-400 font-bold px-4 py-2.5 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Borrar</button>
                </>
              ) : (
                <button data-autofocus onClick={() => toggleFollow(viewList)} className={"font-bold px-4 py-2.5 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500 " + (viewList.following ? "bg-[#181818] text-white border border-gray-700" : "bg-green-500 text-black")}>{viewList.following ? "✔ Siguiendo" : "+ Seguir lista"}</button>
              )}
              <button onClick={() => {
                const url = window.location.origin + "/?lista=" + encodeURIComponent(viewList.id);
                const nav: any = navigator;
                const text = "Mira mi lista «" + viewList.name + "» en Cineverso Mágico 🍿";
                if (nav.share) { nav.share({ title: viewList.name, text, url }).catch(() => {}); return; }
                try { nav.clipboard.writeText(url).then(() => showToast("🔗 Enlace de la lista copiado")); } catch (e) { showToast(url, 8000); }
              }} className="bg-[#181818] text-white border border-gray-700 font-bold px-4 py-2.5 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Compartir</button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {viewList.movieIds.map((id) => catalogAll.find((x) => String(x.id) === id)).filter(Boolean).map((m) => (
                <div key={"vl-" + (m as Movie).id} onClick={() => { setViewList(null); setSelectedMovie(m as Movie); }} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") { setViewList(null); setSelectedMovie(m as Movie); } }} className="cursor-pointer rounded-xl focus:outline-none focus:ring-4 focus:ring-green-500">
                  <img decoding="async" src={posterSrc(m as Movie)} alt={(m as Movie).title} loading="lazy" className="w-full aspect-[2/3] object-cover rounded-xl bg-gray-900 border border-gray-800 hover:border-green-500" />
                  <p className="text-[11px] text-gray-300 font-semibold truncate mt-1">{(m as Movie).title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AÑADIR A UNA LISTA */}
      {listPickFor && (
        <div data-tv-modal className="fixed inset-0 z-[74] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setListPickFor(null); }}>
          <div className="w-full sm:max-w-md bg-[#141414] border border-gray-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)", animation: "cvFade .2s ease-out both" }}>
            <div className="flex items-center gap-3">
              <img decoding="async" loading="lazy" src={posterSrc(listPickFor)} alt="" className="w-10 h-14 rounded-lg object-cover bg-gray-900" />
              <div className="flex-1 min-w-0"><p className="text-xs text-gray-400">Añadir a una lista</p><p className="text-sm font-bold text-white truncate">{listPickFor.title}</p></div>
              <button data-close-on-back onClick={() => setListPickFor(null)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-[#222] text-gray-300 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {myLists.filter((l) => l.mine).map((l, i) => (
                <button key={"pick-" + l.id} data-autofocus={i === 0 ? true : undefined} onClick={() => addMovieToList(l, listPickFor)} className="w-full flex items-center justify-between gap-3 bg-[#0a0a0a] hover:bg-white/5 border border-gray-800 rounded-xl px-4 py-3 text-left cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                  <span className="text-sm font-bold text-white truncate">📂 {l.name}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{l.movieIds.indexOf(String(listPickFor.id)) !== -1 ? "✔ Ya está" : l.movieIds.length + " títulos"}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setListEdit({ name: "", desc: "", movieIds: [String(listPickFor.id)] }); setListPickFor(null); }} className="w-full bg-white text-black font-bold py-3 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">+ Crear lista nueva con esta película</button>
          </div>
        </div>
      )}

      {/* CREAR / EDITAR LISTA */}
      {listEdit && (
        <div data-tv-modal className="fixed inset-0 z-[76] bg-black/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setListEdit(null); }}>
          <div className="w-full max-w-lg bg-[#0e0e0e] border border-gray-800 rounded-3xl p-5 sm:p-7 space-y-4 my-4" style={{ animation: "cvFade .25s ease-out both" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">{listEdit.id ? "Editar lista" : "Nueva lista"}</h3>
              <button data-close-on-back onClick={() => setListEdit(null)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-[#181818] text-gray-300 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"><X className="w-4 h-4" /></button>
            </div>
            <input type="text" maxLength={50} value={listEdit.name} onChange={(e) => setListEdit({ ...listEdit, name: e.target.value })} placeholder="Nombre (ej. Para ver en familia 🍿)" className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-base font-bold text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input type="text" maxLength={140} value={listEdit.desc} onChange={(e) => setListEdit({ ...listEdit, desc: e.target.value })} placeholder="Descripción corta (opcional)" className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div>
              <p className="text-xs text-gray-400 mb-2">Títulos en la lista ({listEdit.movieIds.length}). Toca para quitar; agrega más desde cualquier ficha con “📂 Añadir a una lista”.</p>
              <div className="flex flex-wrap gap-2">
                {listEdit.movieIds.map((id) => { const m = catalogAll.find((x) => String(x.id) === id); return m ? (
                  <button key={"le-" + id} onClick={() => setListEdit({ ...listEdit, movieIds: listEdit.movieIds.filter((x) => x !== id) })} className="flex items-center gap-2 bg-[#181818] border border-gray-800 rounded-lg pl-1 pr-2 py-1 text-xs text-gray-200 cursor-pointer hover:border-red-700">
                    <img decoding="async" loading="lazy" src={posterSrc(m)} alt="" className="w-6 h-9 rounded object-cover" /> <span className="max-w-[120px] truncate">{m.title}</span> <span className="text-red-400">✕</span>
                  </button>
                ) : null; })}
                {myList.length > 0 && listEdit.movieIds.length === 0 && (
                  <button onClick={() => setListEdit({ ...listEdit, movieIds: myList.map((t) => catalogAll.find((x) => x.title === t)).filter(Boolean).map((m) => String((m as Movie).id)).slice(0, 30) })} className="text-xs font-bold text-green-400 hover:underline cursor-pointer">Empezar con los títulos de Mi Lista</button>
                )}
              </div>
            </div>
            <button data-autofocus onClick={() => { const le = listEdit; saveList(le, le.id ? "📂 Lista actualizada" : "📂 ¡Lista creada! Ya la puede ver la comunidad.").then((l) => { if (l) setListEdit(null); }); }} className="w-full bg-green-500 hover:bg-green-400 text-black font-black py-3.5 rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/60">{listEdit.id ? "Guardar cambios" : "Crear lista"}</button>
            <p className="text-[11px] text-gray-500">Las listas con al menos un título aparecen en “Listas de la comunidad” en Inicio.</p>
          </div>
        </div>
      )}

      {/* EDITAR PERFIL */}
      {editProfile && (
        <div data-tv-modal className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setEditProfile(null); }}>
          <div className="bg-[#0c0c0c] border border-gray-800 w-full max-w-2xl rounded-2xl p-5 sm:p-8 my-4 space-y-6 shadow-2xl" style={{ animation: "cvFade .25s ease-out both" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl sm:text-3xl font-black text-white">Editar perfil</h3>
              <button data-close-on-back onClick={() => setEditProfile(null)} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-[#181818] text-gray-300 hover:text-white flex items-center justify-center cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <div className="relative shrink-0">
                <img decoding="async" loading="lazy" src={editAvatar} alt="" className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl object-cover bg-gray-900 border-4 border-white/10" />
                {editIsKid && <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-black text-black bg-yellow-400 rounded">NIÑOS</span>}
              </div>
              <div className="flex-1 w-full space-y-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5">Nombre del perfil</label>
                  <input
                    type="text"
                    maxLength={20}
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setEditError(""); }}
                    className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-base font-bold text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="block text-right text-[10px] text-gray-600 mt-1">{editName.length}/20</span>
                </div>
                <div className="bg-[#121212] border border-gray-800 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                  <span>
                    <span className="block text-sm font-bold text-white">🎂 Cumpleaños</span>
                    <span className="block text-[11px] text-gray-400">Ese día te saludamos con una sorpresa.</span>
                  </span>
                  <span className="flex gap-2">
                    <select value={editBirthday.slice(3)} onChange={(e) => setEditBirthday((editBirthday.slice(0, 2) || "01") + "-" + e.target.value)} className="bg-[#050505] border border-gray-800 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Día">
                      <option value="">Día</option>
                      {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => <option key={"bd-" + d} value={d}>{Number(d)}</option>)}
                    </select>
                    <select value={editBirthday.slice(0, 2)} onChange={(e) => setEditBirthday(e.target.value + "-" + (editBirthday.slice(3) || "01"))} className="bg-[#050505] border border-gray-800 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Mes">
                      <option value="">Mes</option>
                      {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map((m, i) => <option key={"bm-" + i} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
                    </select>
                    {editBirthday && <button type="button" onClick={() => setEditBirthday("")} className="text-xs text-gray-400 hover:text-white px-1 cursor-pointer">✕</button>}
                  </span>
                </div>
                <div className="bg-[#121212] border border-gray-800 rounded-xl p-3 space-y-3">
                  <label className="flex items-center justify-between cursor-pointer gap-3">
                    <span>
                      <span className="block text-sm font-bold text-white">Perfil Niños</span>
                      <span className="block text-[11px] text-gray-400">Solo muestra la categoría Animación.</span>
                    </span>
                    <input type="checkbox" checked={editIsKid} onChange={(e) => { setEditIsKid(e.target.checked); setEditError(""); }} className="w-5 h-5 accent-green-500 cursor-pointer shrink-0" />
                  </label>
                  {editIsKid && (
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">{editProfile.pinHash ? "PIN nuevo (déjalo vacío para no cambiarlo)" : "PIN de 4 números (se pedirá para salir del perfil Niños)"}</label>
                      <input type="password" inputMode="numeric" maxLength={4} placeholder="••••" value={editPin} onChange={(e) => { setEditPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)); setEditError(""); }} className="w-40 bg-[#050505] border border-gray-800 rounded-xl px-4 py-2.5 text-lg tracking-[0.5em] text-center text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-bold text-white">Elige una imagen</label>
                <input type="text" placeholder="Buscar..." value={editSearch} onChange={(e) => setEditSearch(e.target.value)} className="w-36 sm:w-48 bg-[#121212] border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {[
                { title: "Cineverso", items: myAvatars.filter((a) => a.cv) },
                { title: "Más avatares", items: myAvatars.filter((a) => !a.cv) },
              ].map((sec) => {
                const items = sec.items.filter((a) => a.name.toLowerCase().includes(editSearch.toLowerCase()));
                if (!items.length) return null;
                return (
                  <div key={sec.title}>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">{sec.title}</p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
                      {items.map((a) => (
                        <button
                          key={a.file}
                          type="button"
                          onClick={() => setEditAvatar(a.file)}
                          aria-label={a.name}
                          title={a.name}
                          className={"relative aspect-square rounded-xl overflow-hidden border-4 transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500 " + (editAvatar === a.file ? "border-green-500 scale-105" : "border-transparent hover:border-white/60")}
                        >
                          <img decoding="async" src={a.file} alt="" loading="lazy" className="w-full h-full object-cover bg-gray-900" />
                          {editAvatar === a.file && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 text-black text-[11px] font-black flex items-center justify-center">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {editError && <p className="text-xs text-red-400 font-bold">{editError}</p>}

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              {editProfile.id !== activeProfile.id && (
                <button onClick={deleteEditProfile} className={"sm:mr-auto px-5 py-3 rounded-xl text-sm font-bold border transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500 " + (editConfirmDelete ? "bg-red-600 border-red-600 text-white" : "border-red-900 text-red-400 hover:bg-red-950/40")}>
                  {editConfirmDelete ? "¿Seguro? Toca otra vez para borrar" : "Borrar perfil"}
                </button>
              )}
              <button onClick={() => setEditProfile(null)} className="px-6 py-3 rounded-xl text-sm font-bold border border-gray-700 text-gray-300 hover:text-white cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Cancelar</button>
              <button data-autofocus onClick={saveEditProfile} className="px-8 py-3 rounded-xl text-sm font-black bg-white text-black hover:bg-gray-200 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ¿QUIÉN ESTÁ VIENDO? */}
      {showWho && accountUser && (
        <div data-tv-modal className="fixed inset-0 z-[65] bg-[#050505] flex flex-col items-center justify-center p-6 overflow-y-auto">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-10 text-center">{whoManage ? "Administrar perfiles" : "¿Quién está viendo?"}</h2>
          <div className="flex flex-wrap justify-center gap-6 sm:gap-10 max-w-4xl">
            {profiles.filter((p) => p.id !== "invitado").map((p) => (
              <div
                key={"who-" + p.id}
                onClick={() => (whoManage ? openEditProfile(p) : requestProfileSwitch(p))}
                tabIndex={0}
                data-autofocus={p.id === activeProfile.id ? true : undefined}
                className="group flex flex-col items-center cursor-pointer rounded-2xl p-2 focus:outline-none focus:ring-4 focus:ring-green-500"
                style={{ width: 140 }}
              >
                <div className="relative rounded-2xl overflow-hidden border-4 border-transparent group-hover:border-white bg-gray-900" style={{ width: 120, height: 120 }}>
                  <img decoding="async" loading="lazy" src={p.avatar} alt={p.name} className="w-full h-full object-cover object-top" />
                  {p.isKid && <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-black text-black bg-yellow-400 rounded">NIÑOS</span>}
                  {whoManage && canEditProfile(p) && (
                    <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                      <span className="w-12 h-12 rounded-full border-2 border-white text-white flex items-center justify-center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></span>
                    </div>
                  )}
                </div>
                <span className="mt-3 text-sm sm:text-base text-gray-300 group-hover:text-white font-semibold truncate max-w-full">{p.name}</span>
                {p.isKid && p.pinHash && <Lock className="w-3.5 h-3.5 text-gray-500 mt-1" />}
              </div>
            ))}
            {!kidsMode && profiles.filter((p) => p.id !== "admin-rey" && p.id !== "invitado").length < 5 && (
              <div
                onClick={() => { setShowWho(false); setShowAddProfileModal(true); }}
                tabIndex={0}
                className="group flex flex-col items-center cursor-pointer rounded-2xl p-2 focus:outline-none focus:ring-4 focus:ring-green-500"
                style={{ width: 140 }}
              >
                <div className="rounded-2xl border-2 border-dashed border-gray-600 group-hover:border-white flex items-center justify-center" style={{ width: 120, height: 120 }}>
                  <PlusCircle className="w-10 h-10 text-gray-500 group-hover:text-white" />
                </div>
                <span className="mt-3 text-sm sm:text-base text-gray-400 group-hover:text-white font-semibold">Agregar perfil</span>
              </div>
            )}
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                if (!whoManage && activeProfile.isKid && activeProfile.pinHash) { openAccountSafe(); return; }
                setWhoManage(!whoManage);
              }}
              className={"px-6 py-2.5 border text-sm font-bold tracking-wider uppercase rounded-lg cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500 " + (whoManage ? "bg-white text-black border-white" : "border-gray-600 text-gray-300 hover:text-white hover:border-white")}
            >
              {whoManage ? "Listo" : "✏️ Administrar perfiles"}
            </button>
            {!whoManage && (
              <button
                onClick={openAccountSafe}
                className="px-6 py-2.5 text-gray-400 hover:text-white text-sm font-bold rounded-lg cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
              >
                Cuenta y ajustes
              </button>
            )}
          </div>
        </div>
      )}

      {/* PIN DEL PERFIL NIÑOS */}
      {pinTarget && (
        <div data-tv-modal className="fixed inset-0 bg-black/90 z-[75] flex items-center justify-center p-4">
          <form onSubmit={submitPin} className="bg-[#0c0c0c] border border-yellow-500/40 w-full max-w-xs rounded-2xl p-6 space-y-4 text-center shadow-2xl">
            <Lock className="w-8 h-8 text-yellow-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">{pinAction === "account" ? "PIN para administrar" : "PIN para salir del perfil Niños"}</h3>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={4}
              placeholder="••••"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)); if (pinError) setPinError(""); }}
              className="w-40 mx-auto block bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-2xl tracking-[0.5em] text-center text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            {pinError && <p className="text-xs text-red-400 font-bold">{pinError}</p>}
            <div className="flex gap-3">
              <button type="button" data-close-on-back onClick={() => setPinTarget(null)} className="flex-1 bg-[#1a1a1a] hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-xs border border-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                Cancelar
              </button>
              <button type="submit" className="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AVISO: MI LISTA REQUIERE CUENTA */}
      {showLoginPrompt && (
        <div data-tv-modal className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#0c0c0c] border border-green-500/30 w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl text-center">
            <Bookmark className="w-8 h-8 text-green-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">Guarda tus favoritas</h3>
            <p className="text-sm text-gray-400">Para usar Mi Lista inicia sesión con tu correo. Así tu lista aparece en todos tus dispositivos.</p>
            <div className="flex gap-3">
              <button data-close-on-back onClick={() => setShowLoginPrompt(false)} className="flex-1 bg-[#1a1a1a] hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-xs border border-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                Ahora no
              </button>
              <button data-autofocus onClick={goToLogin} className="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                Iniciar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR PERFIL */}
      {showAddProfileModal && (
        <div data-tv-modal className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0c0c0c] border border-emerald-500/30 w-full max-w-lg rounded-2xl p-6 relative space-y-6 shadow-2xl">
            <button onClick={() => { setShowAddProfileModal(false); setUsernameError(""); }} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded p-1">
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Nuevo perfil</h3>
              <p className="text-xs text-gray-400 mt-1">Personaliza tu espacio en Cineverso Mágico con tus avatares favoritos.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Nombre</label>
                <input 
                  type="text" 
                  placeholder="Ej. Invitado" 
                  value={newProfileName} 
                  onChange={(e) => {
                    setNewProfileName(e.target.value);
                    if (usernameError) setUsernameError("");
                  }}
                  className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                />
                {usernameError && (
                  <p className="text-xs text-red-500 font-bold mt-1.5">{usernameError}</p>
                )}
              </div>

              <div className="bg-[#121212] border border-gray-800 rounded-xl p-3 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span>
                    <span className="block text-sm font-bold text-white">Perfil Niños</span>
                    <span className="block text-[11px] text-gray-400">Solo muestra la categoría Animación.</span>
                  </span>
                  <input type="checkbox" checked={newProfileIsKid} onChange={(e) => { setNewProfileIsKid(e.target.checked); if (usernameError) setUsernameError(""); }} className="w-5 h-5 accent-green-500 cursor-pointer" />
                </label>
                {newProfileIsKid && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">PIN de 4 números (se pedirá para salir del perfil Niños)</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      value={newProfilePin}
                      onChange={(e) => setNewProfilePin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                      className="w-40 bg-[#050505] border border-gray-800 rounded-xl px-4 py-2.5 text-lg tracking-[0.5em] text-center text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Avatar ({myAvatars.length} disponibles)</label>
                </div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                  <input 
                    type="text"
                    placeholder="Busca un personaje..."
                    value={avatarSearch}
                    onChange={(e) => setAvatarSearch(e.target.value)}
                    className="w-full bg-[#121212] border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-h-48 overflow-y-auto p-2 scrollbar-none bg-[#080808] rounded-xl border border-gray-900">
                  {filteredAvatars.map((item, i) => (
                    <div 
                      key={i} 
                      onClick={() => setNewProfileAvatar(item.file)}
                      tabIndex={0}
                      className={`flex flex-col items-center p-2 rounded-xl cursor-pointer border-2 transition focus:outline-none focus:ring-2 focus:ring-green-500 ${newProfileAvatar === item.file ? "border-emerald-400 bg-emerald-500/10 scale-105" : "border-transparent hover:bg-gray-900"}`}
                    >
                      <div className="w-14 h-14 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center border border-gray-800 shadow-md">
                        <img decoding="async" loading="lazy" src={item.file} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                      </div>
                      <span className="text-[10px] text-gray-300 mt-1.5 text-center font-medium truncate w-full">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowAddProfileModal(false); setUsernameError(""); }} className="flex-1 bg-[#1a1a1a] hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-xs border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
                Cancelar
              </button>
              <button onClick={handleCreateProfile} className="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-xs transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">
                Crear perfil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}