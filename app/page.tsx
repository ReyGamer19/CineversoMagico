"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Info, Plus, Search, Bell, Sparkles, Check, 
  Tv, Shield, User, PlusCircle, Trash2, ChevronRight, X, AlertCircle, FileText, LogOut, Lock, Sparkle, Settings, Film, Radio, Globe, ChevronDown, Edit3, Share2, Cast, Maximize2, RefreshCw, ArrowLeft, SkipForward, SkipBack, Download, Home as HomeIcon, Bookmark, Shuffle, ThumbsUp, ThumbsDown
} from "lucide-react";
import Hls from "hls.js";

interface Profile {
  id: string;
  name: string;
  avatar: string;
  isKid: boolean;
  pin?: string;
  pinHash?: string;
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
const LEGACY_CSS = LEGACY_RULES + "@supports not (aspect-ratio: 1 / 1) {" + LEGACY_RULES.replace(/html\.tv-legacy/g, "html") + "}";

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
  useEffect(() => {
    let timer: any = null;
    let last = -9;
    const set = (st: number) => {
      if (st === last) return;
      last = st;
      if (st === 1) {
        if (!timer) timer = setTimeout(() => { timer = null; cb.current(true); }, 2600);
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
  }, [vid, muted]);
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
      src={"https://www.youtube.com/embed/" + vid + "?autoplay=1&mute=" + (muted ? 1 : 0) + "&controls=0&disablekb=1&fs=0&loop=1&playlist=" + vid + "&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&enablejsapi=1&origin=" + origin}
      title={title}
      allow="autoplay; encrypted-media"
      tabIndex={-1}
      onLoad={() => { ping(); setTimeout(ping, 400); setTimeout(ping, 1500); }}
      style={style}
    />
  );
}

export default function Home() {
  const myAvatars = [
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
  const [registerStep, setRegisterStep] = useState<"form" | "verify" | "success">("form");
  const [verificationCode, setVerificationCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [isGuest, setIsGuest] = useState(true);

  // Perfiles
  const guestProfile: Profile = { id: "invitado", name: "Invitado", avatar: "/avatares/bojack1.png", isKid: false };
  const reyProfile: Profile = { id: "admin-rey", name: "Rey", avatar: "/avatares/bojack1.png", isKid: false };
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
  const [newIntroStart, setNewIntroStart] = useState("");
  const [newIntroEnd, setNewIntroEnd] = useState("");
  const [newCreditsStart, setNewCreditsStart] = useState("");
  const [tmdbExtra, setTmdbExtra] = useState<{ genres?: string[]; rating?: string; production?: string; originalLanguage?: string; backdrop?: string } | null>(null);
  const [tmdbResults, setTmdbResults] = useState<{ id: number; title: string; original: string; year: string; poster: string }[] | null>(null);
  const [tmdbBusy, setTmdbBusy] = useState(false);
  const [epSeason, setEpSeason] = useState("1");
  const [epNumber, setEpNumber] = useState("1");
  const [epTitle, setEpTitle] = useState("");
  const [epUrl, setEpUrl] = useState("");
  const [editingMovieId, setEditingMovieId] = useState<number | string | null>(null);

  // Catálogo Base por defecto
  const defaultMovies: Movie[] = [
    {
      id: "def-1",
      title: "El Caballero Oscuro",
      rating: "9.0",
      year: "2008",
      tag: "Acción",
      type: "pelicula",
      desc: "Batman se enfrenta al Caos encarnado por el Joker en una de las mejores adaptaciones cinematográficas de superhéroes de la historia.",
      bgImage: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=800&auto=format&fit=crop",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      duration: "2 h 32 min",
      genres: ["Acción", "Crimen", "Drama"],
      cast: "Christian Bale, Heath Ledger, Aaron Eckhart",
      director: "Christopher Nolan",
      production: "Warner Bros. Pictures",
      originalLanguage: "EN"
    },
    {
      id: "def-2",
      title: "Wildwood",
      rating: "8.4",
      year: "2025",
      tag: "Aventura",
      type: "pelicula",
      desc: "Una joven se adentra en un bosque secreto repleto de magia, criaturas místicas y peligros inimaginables para rescatar a su hermano menor.",
      bgImage: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      duration: "1 h 58 min",
      genres: ["Aventura", "Fantasía", "Animación"],
      cast: "Carey Mulligan, Mahershala Ali, Peyton Elizabeth Lee",
      director: "Travis Knight",
      production: "Laika Studios",
      originalLanguage: "EN"
    },
    {
      id: "def-3",
      title: "HOPE",
      subtitle: "EL PRIMER IMPACTO",
      rating: "8.8",
      year: "2026",
      tag: "Ciencia ficción",
      type: "pelicula",
      desc: "Los refuerzos se han desviado para combatir los incendios forestales y se han cortado todas las comunicaciones. El jefe del puesto policial de Hope, Bum-seok, y la agente Sung-ae luchan por defender un pueblo de ancianos, mientras que en las montañas, Sung-ki y los lugareños que se han lanzado a la búsqueda de la bestia se ven, por el contrario, acosados por ella. Lo que comienza como ignorancia siembra la semilla del desastre, que se intensifica a través del conflicto humano hasta convertirse en una tragedia de proporciones cósmicas.",
      bgImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=800&auto=format&fit=crop",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      duration: "2 h 37 min",
      genres: ["Ciencia ficción", "Misterio", "Acción"],
      cast: "황정민, 조인성, 정호연, Alicia Vikander",
      director: "Na Hong-jin",
      production: "Forged Films",
      originalLanguage: "KO"
    },
    {
      id: "def-4",
      title: "Toy Story 5",
      rating: "9.1",
      year: "2026",
      tag: "Animación",
      type: "pelicula",
      desc: "Woody, Buzz y el resto de la pandilla enfrentan los nuevos desafíos de la tecnología moderna y los dispositivos electrónicos en las manos de los niños.",
      bgImage: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
      videoUrl: "https://archive.org/download/toy-story-5-2026-pelisde-rey/Toy%20Story%205%20%282026%25",
      duration: "1 h 45 min",
      genres: ["Animación", "Comedia", "Familia"],
      cast: "Tom Hanks, Tim Allen, Joan Cusack",
      director: "Andrew Stanton",
      production: "Pixar Animation Studios",
      originalLanguage: "EN"
    }
  ];

  const [customMovies, setCustomMovies] = useState<Movie[]>(defaultMovies);
  const [isMounted, setIsMounted] = useState(false);

  // Perfil Niños: solo contenido infantil (ATP / +7, o Animación y Familia sin clasificación)
  // Perfil Niños: SOLO la categoría Animación (y nunca algo marcado +13, +16 o +18)
  const isKidFriendly = (m: Movie) => {
    if (m.ageRating && m.ageRating !== "ATP" && m.ageRating !== "+7") return false;
    const g = [m.tag].concat(m.genres || []).map((x) => String(x || "").toLowerCase());
    return g.some((x) => x.indexOf("anim") !== -1);
  };
  const kidsMode = !!activeProfile.isKid;
  const catalogAll: Movie[] = kidsMode ? customMovies.filter(isKidFriendly) : customMovies;
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

    const finish = (list: Movie[] | null, fromServer: boolean) => {
      if (cancelled) return;
      if (list && list.length > 0) setCustomMovies(list);
      setServerCatalog(fromServer);
      setIsMounted(true);
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

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminChecking) return;
    const pass = adminPassInput;
    setAdminChecking(true);
    setAdminPassError("");
    // El servidor comprueba la clave sin modificar nada (movies:null a propósito):
    // clave correcta -> 400 "Catálogo inválido"; incorrecta -> 401.
    fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass, movies: null }),
    })
      .then((r) => r.status)
      .catch(() => 0)
      .then((status) => {
        setAdminChecking(false);
        if (status === 400) {
          try {
            localStorage.setItem("cineverso_admin_key", "server");
            localStorage.setItem("cineverso_admin_pass", pass);
          } catch (err) {}
          setIsAdmin(true);
          setShowAdminLogin(false);
          setAdminPassInput("");
          setActiveTab("admin");
          showToast("Sesión de administrador iniciada. Los cambios se publicarán para todos.");
        } else if (status === 401) setAdminPassError("Clave incorrecta.");
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
    if (isAdmin) {
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
    fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: serverPassInput, movies: null }),
    })
      .then((r) => r.status)
      .catch(() => 0)
      .then((status) => {
        setServerPassBusy(false);
        if (status === 400) {
          try { localStorage.setItem("cineverso_admin_pass", serverPassInput); } catch (err) {}
          setHasServerPass(true);
          setShowServerPass(false);
          setServerPassInput("");
          const next = pendingSaveRef.current;
          pendingSaveRef.current = null;
          if (next) next();
          else showToast("Listo: ahora tus cambios se publican para todos.");
        } else if (status === 401) {
          setServerPassError("Clave incorrecta.");
        } else if (status === 503) {
          setServerPassError("El servidor no tiene la clave configurada todavía. Vuelve a ejecutar el actualizador con tu clave.");
        } else {
          setServerPassError("No se pudo conectar con el servidor (código " + status + "). Inténtalo de nuevo.");
        }
      });
  };

  type CatalogOp = { type: "upsert"; movie: Movie } | { type: "delete"; id: number | string };
  const applyOp = (list: Movie[], op: CatalogOp): Movie[] => {
    if (op.type === "delete") return list.filter((m) => String(m.id) !== String(op.id));
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
              try { localStorage.removeItem("cineverso_admin_pass"); } catch (e) {}
              showToast("Tu clave guardada ya no es válida. Vuelve a entrar con ?admin.", 7000);
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
    if (avisar) sendPush({ title: "¡Ya disponible! 🍿", body: m.title + " ya se puede ver en Cineverso Mágico.", image: m.backdrop || m.bgImage, url: "/ver/" + m.id, tag: "m-" + m.id });
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
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("cv_splash") === "1"; sessionStorage.setItem("cv_splash", "1"); } catch (e) {}
    const wait = seen ? 0 : 1300;
    const t1 = setTimeout(() => setSplashFade(true), wait);
    const t2 = setTimeout(() => setShowSplash(false), wait + 450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

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
  const shareMovie = (m: Movie) => {
    const url = window.location.origin + "/ver/" + encodeURIComponent(String(m.id));
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
    if (!heroMovie.trailerUrl || activeTab !== "inicio" || selectedMovie) return;
    if (document.documentElement.classList.contains("tv-legacy")) return;
    const t = setTimeout(() => setHeroTrailerOn(true), 2000);
    // YouTube no avisa cuando termina: pasamos a la siguiente a los 45 s
    const t2 = youtubeId(heroMovie.trailerUrl) ? setTimeout(() => { setHeroTrailerOn(false); setHeroIndex((i) => i + 1); }, 47000) : null;
    return () => { clearTimeout(t); if (t2) clearTimeout(t2); };
  }, [heroMovie.id, heroMovie.trailerUrl, activeTab, selectedMovie]);

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
    if (!selectedMovie || isPlaying || !selectedMovie.trailerUrl) return;
    if (document.documentElement.classList.contains("tv-legacy")) return;
    const t = setTimeout(() => setModalTrailerOn(true), 1200);
    return () => clearTimeout(t);
  }, [selectedMovie && selectedMovie.id, isPlaying]);

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
          } : {}),
          genres: tmdbExtra && tmdbExtra.genres && tmdbExtra.genres.length
            ? [newMovieCategory].concat(tmdbExtra.genres.filter((g) => g !== newMovieCategory))
            : m.genres && m.genres.length ? (m.genres.indexOf(newMovieCategory) === -1 ? [newMovieCategory].concat(m.genres.filter((g) => g !== m.tag)) : m.genres) : [newMovieCategory]
        };
        saveChange({ type: "upsert", movie: updated }, m.comingSoon && !comingFinal ? "¡Estrenada! Ya aparece con las demás películas." : "¡Contenido actualizado!");
        if (notifyAll) {
          if (m.comingSoon && !comingFinal) sendPush({ title: "¡Ya disponible! 🍿", body: updated.title + " ya se puede ver en Cineverso Mágico.", image: updated.backdrop || updated.bgImage, url: "/ver/" + updated.id, tag: "m-" + updated.id });
          else if (!m.comingSoon && comingFinal) sendPush({ title: "Próximo estreno 🎬", body: updated.title + " llega el " + fmtRelease(updated.releaseDate) + ".", image: updated.backdrop || updated.bgImage, url: "/ver/" + updated.id, tag: "m-" + updated.id });
        }
      }
      setEditingMovieId(null);
    } else {
      const createdMovie: Movie = {
        id: Date.now(),
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
        ...(tmdbExtra ? { rating: tmdbExtra.rating || "8.0", production: tmdbExtra.production, backdrop: tmdbExtra.backdrop } : {}),
      };

      saveChange({ type: "upsert", movie: createdMovie }, "¡Película agregada!");
      if (notifyAll) {
        const img = createdMovie.backdrop || createdMovie.bgImage;
        if (createdMovie.comingSoon) sendPush({ title: "Próximo estreno 🎬", body: createdMovie.title + " llega el " + fmtRelease(createdMovie.releaseDate) + ".", image: img, url: "/ver/" + createdMovie.id, tag: "m-" + createdMovie.id });
        else sendPush({ title: createdMovie.type === "serie" ? "Nueva serie 🍿" : "Nueva película 🍿", body: createdMovie.title + " ya está disponible en Cineverso Mágico.", image: img, url: "/ver/" + createdMovie.id, tag: "m-" + createdMovie.id });
      }
    }

    resetMovieForm();
  };

  const resetMovieForm = () => {
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
        setTmdbExtra({ genres: gs, rating: d.rating, production: d.production, originalLanguage: d.originalLanguage, backdrop: d.backdrop });
        showToast("✔ Ficha completada. Revisa los datos y pulsa Guardar.", 5000);
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
              p.id !== "admin-rey" && p.id !== "invitado" && p.name.trim().toLowerCase() !== "rey"
          )
        : [];
    if (!loaded.length) {
      const base = (userEmail.split("@")[0] || "Perfil").replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "");
      let name = base ? base.charAt(0).toUpperCase() + base.slice(1, 20) : "Perfil 1";
      if (name.trim().toLowerCase() === "rey") name = "Perfil 1";
      loaded = [{ id: "p-" + Date.now(), name, avatar: myAvatars[7].file, isKid: false }];
    }
    const active = loaded.find((p) => data && p.id === data.activeProfileId) || loaded[0];
    if (isAdminRef.current) {
      setProfiles([reyProfile].concat(loaded));
    } else {
      setProfiles(loaded);
      setActiveProfile(active);
    }
    setMyList(data && Array.isArray(data.myList) ? data.myList : []);
    setRatings(data && data.ratings && typeof data.ratings === "object" ? data.ratings : {});
    setNotifSeen(data && typeof data.notifSeen === "number" ? data.notifSeen : 0);
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
      };
      fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ data }),
      })
        .then((r) => {
          if (r.status === 401) {
            setAccountUser(null);
            setIsGuest(true);
            setAccountLoaded(false);
            showToast("Tu sesión venció. Vuelve a iniciar sesión para seguir guardando.", 6000);
          }
        })
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [profiles, activeProfile, myList, continueWatchingList, ratings, notifSeen, accountUser, accountLoaded]);

  const onLoggedIn = (d: any) => {
    setAccountUser(d.user);
    setIsGuest(false);
    setRegisterStep("form");
    setPassword("");
    setInputCode("");
    setAuthError("");
    applyAccountData(d.data, d.user.email || email);
    setAccountLoaded(true);
    showToast("¡Sesión iniciada! Tus datos se guardarán en todos tus dispositivos.");
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
        if (ok && d.user) onLoggedIn(d);
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

  const handleLogout = () => {
    const reset = () => {
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
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => { if (sub) setPushState("subscribed"); })
        .catch(() => {});
    } catch (e) { setPushState("unsupported"); }
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
  // Administrador: enviar un aviso a todos los dispositivos suscritos
  const sendPush = (msg: { title: string; body: string; image?: string; url?: string; tag?: string }) => {
    let pass = "";
    try { pass = localStorage.getItem("cineverso_admin_pass") || ""; } catch (e) {}
    if (!pass) { showToast("Para enviar avisos vuelve a entrar con ?admin.", 6000); return; }
    fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", password: pass, ...msg }) })
      .then((r) => r.json().catch(() => ({})).then((d: any) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) showToast("📣 Aviso enviado a " + (d.sent || 0) + " dispositivo" + (d.sent === 1 ? "" : "s") + ".", 5000);
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
      if (t > limit) out.push({ key: "m-" + m.id, title: m.title, text: m.comingSoon ? "Próximo estreno: " + fmtRelease(m.releaseDate) : m.type === "serie" ? "Nueva serie disponible" : "Nueva película disponible", time: t, movie: m });
      (m.episodes || []).forEach((ep) => {
        if (ep.addedAt && ep.addedAt > limit && ep.addedAt - t > 60000) {
          out.push({ key: "e-" + m.id + "-" + ep.id, title: m.title, text: "Nuevo episodio: T" + ep.season + ":E" + ep.number + " · " + ep.title, time: ep.addedAt, movie: m });
        }
      });
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
    if (!seen && profiles.filter((p) => p.id !== "admin-rey").length >= 1 && !isAdminRef.current) setShowWho(true);
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
      .filter((m) => myList.indexOf(m.title) === -1 && ratings[String(m.id)] !== -1)
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
    const m = catalog[Math.floor(Math.random() * catalog.length)];
    setSelectedMovie(m);
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

    if (newProfileName.trim().toLowerCase() === "rey") {
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

  const handleSelectProfile = (p: Profile) => {
    requestProfileSwitch(p);
  };

  const filteredExploreMovies = catalog.filter((movie) => {
    const matchesSearch = exploreSearch === "" || movie.title.toLowerCase().includes(exploreSearch.toLowerCase());
    const matchesType = exploreTypeFilter === "todos" || movie.type === exploreTypeFilter;
    const matchesGenre = exploreGenreFilter === "Todos" || (movie.tag && movie.tag.toLowerCase() === exploreGenreFilter.toLowerCase());
    const matchesYear = exploreYearFilter === "Cualquier año" || movie.year === exploreYearFilter;
    
    return matchesSearch && matchesType && matchesGenre && matchesYear;
  });

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
            <img src={preview.m.backdrop || preview.m.bgImage} alt={preview.m.title} className="w-full h-full object-cover" />
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
              Explorador
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
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            aria-label="Sorpréndeme"
          >
            <Shuffle className="w-4 h-4" /> Sorpréndeme
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
                          <img src={n.movie.backdrop || n.movie.bgImage} alt="" loading="lazy" className="shrink-0 rounded-lg object-cover bg-gray-900" style={{ width: 96, height: 54 }} />
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
      {activeTab === "inicio" && (() => {
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
              <img src={m.bgImage} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
              {m.tag && <span className="absolute top-2 left-2 text-[10px] text-green-400 font-bold uppercase bg-black/70 px-2 py-0.5 rounded">{m.tag}</span>}
              {inMyList(m) && <span className="absolute top-2 right-2 bg-green-500 text-black rounded-full p-0.5"><Check className="w-3 h-3" /></span>}
            </div>
            <h4 className="text-xs sm:text-sm font-semibold mt-2 text-gray-200 truncate group-hover:text-green-400">{m.title}</h4>
          </div>
        );
        const row = (title: string, items: Movie[], keyPrefix: string, icon?: any) =>
          items.length ? (
            <section key={keyPrefix}>
              <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white flex items-center gap-2">{icon}{title}</h2>
              <div className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                {items.map((m) => posterCard(m, keyPrefix + "-" + m.id))}
              </div>
            </section>
          ) : null;
        const groups: Record<string, Movie[]> = {};
        const groupOrder: string[] = [];
        catalog.forEach((m) => {
          const g = m.tag || "Otros";
          if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
          groups[g].push(m);
        });
        const continueItems = continueWatchingList
          .map((p) => ({ p, m: catalog.find((x) => String(x.id) === String(p.id)) }))
          .filter((x) => !!x.m) as { p: ProgressItem; m: Movie }[];
        return (
          <div className="pt-14 lg:pt-16">
            {/* Portada */}
            <div
              className="relative w-full bg-cover bg-center flex items-end overflow-hidden"
              style={{ backgroundImage: `url(${heroMovie.backdrop || heroMovie.bgImage})`, minHeight: "68vh" }}
              onMouseEnter={() => setHeroPaused(true)}
              onMouseLeave={() => { if (!heroTrailerOn) setHeroPaused(false); }}
            >
              {heroTrailerOn && heroMovie.trailerUrl && (
                youtubeId(heroMovie.trailerUrl) ? (
                  <YtBg
                    key={"yt-" + heroMovie.id}
                    vid={youtubeId(heroMovie.trailerUrl)}
                    muted={true}
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
                <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight uppercase leading-tight text-white drop-shadow-lg">
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
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    data-autofocus-home
                    onClick={() => startPlayback(heroMovie)}
                    onFocus={() => setHeroPaused(true)}
                    onBlur={() => setHeroPaused(false)}
                    className="flex items-center gap-2 bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-gray-200 focus:outline-none focus:ring-4 focus:ring-green-500 transition cursor-pointer text-sm sm:text-base shadow-lg"
                  >
                    <Play className="w-5 h-5 fill-black" /> Reproducir
                  </button>
                  <button
                    onClick={() => setSelectedMovie(heroMovie)}
                    onFocus={() => setHeroPaused(true)}
                    onBlur={() => setHeroPaused(false)}
                    className="flex items-center gap-2 bg-[#121212]/90 text-white font-medium px-5 py-3 rounded-xl border border-gray-800 hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-green-500 transition cursor-pointer text-sm sm:text-base"
                  >
                    <Info className="w-5 h-5" /> <span className="hidden sm:inline">Más información</span><span className="sm:hidden">Info</span>
                  </button>
                  <button
                    onClick={() => toggleMyList(heroMovie)}
                    onFocus={() => setHeroPaused(true)}
                    onBlur={() => setHeroPaused(false)}
                    className="p-3 rounded-full bg-[#121212]/90 border border-gray-600 hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-green-500 transition cursor-pointer"
                    aria-label={inMyList(heroMovie) ? "Quitar de Mi Lista" : "Agregar a Mi Lista"}
                  >
                    {inMyList(heroMovie) ? <Check className="w-5 h-5 text-green-400" /> : <Plus className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              {heroTrailerOn && heroTrailerReady && heroMovie.trailerUrl && !youtubeId(heroMovie.trailerUrl) && (
                <button
                  onClick={() => setHeroMuted((m) => !m)}
                  aria-label={heroMuted ? "Activar sonido del tráiler" : "Silenciar tráiler"}
                  className="absolute z-10 right-6 md:right-12 bottom-14 p-2.5 rounded-full border border-gray-400 bg-black/40 text-white cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                >
                  {heroMuted ? <span className="text-xs font-bold px-1">🔇</span> : <span className="text-xs font-bold px-1">🔊</span>}
                </button>
              )}
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

            <div className="px-4 sm:px-6 md:px-12 space-y-8 relative z-20 pb-20 w-full overflow-x-hidden mt-2">
              {/* Continuar viendo (tarjetas horizontales con progreso) */}
              {continueItems.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">Continuar viendo</h2>
                  <div className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
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
                          <img src={m.backdrop || m.bgImage} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
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
                  </div>
                </section>
              )}

              {/* Próximos estrenos */}
              {upcoming.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">Próximos estrenos</h2>
                  <div className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {upcoming.map((m) => (
                      <div key={"up-" + m.id} className="shrink-0" style={{ width: 300 }}>
                        <div
                          onClick={() => setSelectedMovie(m)}
                          tabIndex={0}
                          className="relative overflow-hidden rounded-xl bg-gray-900 border border-gray-800 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
                          style={{ width: 300, height: 168 }}
                        >
                          <img src={m.backdrop || m.bgImage} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
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
                  </div>
                </section>
              )}

              {/* Top 10 de hoy */}
              {catalog.length >= 3 && (
                <section>
                  <h2 className="text-lg sm:text-2xl font-bold mb-3 text-white">Top 10 de hoy</h2>
                  <div className="flex overflow-x-auto pb-4 pt-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                    {catalog.slice(0, 10).map((m, i) => (
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
                          <img src={m.bgImage} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {row("Recomendado para ti", recommended, "rec", <Sparkle className="w-5 h-5 text-green-400" />)}
              {row(isAdmin ? "Tus Películas Subidas" : "Recién agregadas", catalog, "new")}
              {groupOrder.filter((g) => groups[g].length >= 2).map((g) => row(g, groups[g], "g-" + g))}
            </div>
          </div>
        );
      })()}

      {/* VISTA EXPLORAR */}
      {activeTab === "explorar" && (
        <div className="pt-24 px-4 sm:px-6 md:px-12 pb-24 max-w-7xl mx-auto space-y-6 w-full overflow-x-hidden">
          <div className="relative max-w-xl">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-500" />
            <input 
              type="text"
              placeholder="Buscar películas, series o personas..."
              value={exploreSearch}
              onChange={(e) => setExploreSearch(e.target.value)}
              className="w-full bg-[#121212] border border-gray-800 rounded-full pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition shadow-inner"
            />
          </div>

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

          <h2 className="text-xl font-black text-white pt-2 capitalize">
            {exploreGenreFilter === "Todos" ? "Todas las Películas y Series" : exploreGenreFilter}
          </h2>

          {filteredExploreMovies.length === 0 ? (
            <div className="py-20 text-center text-gray-500 space-y-2">
              <p className="text-base font-semibold">No se encontraron títulos en esta categoría.</p>
              <p className="text-xs">Prueba seleccionando otro género o limpia los filtros.</p>
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
                    <img src={movie.bgImage} alt={movie.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 text-black fill-black ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-gray-200 group-hover:text-green-400 transition truncate">{movie.title}</h4>
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
                        <img src={m.bgImage} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
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
                        {r.poster ? <img src={r.poster} alt="" className="rounded object-cover shrink-0" style={{ width: 40, height: 60 }} /> : <span className="rounded bg-gray-800 shrink-0" style={{ width: 40, height: 60 }} />}
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
                    <img src={movie.bgImage} alt={movie.title} className="w-12 h-16 object-cover rounded-xl border border-gray-800 shrink-0" />
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
              <img src={activeProfile.avatar} alt={activeProfile.name} className="w-16 h-16 rounded-2xl object-cover bg-gray-900 border-2 border-green-500 shrink-0" />
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold">PERFIL ACTIVO</span>
                <h2 className="text-2xl font-bold text-white truncate max-w-[200px] sm:max-w-none">{activeProfile.name}</h2>
              </div>
            </div>
            <button onClick={() => setShowAddProfileModal(true)} className="flex items-center justify-center gap-2 bg-[#181818] hover:bg-gray-800 px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500">
              <User className="w-4 h-4" /> Cambiar perfil
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
                    <img src={p.avatar} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-gray-900 shrink-0" />
                    <div className="truncate">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-sm font-bold text-white truncate">{p.name}</span>
                        {p.id === activeProfile.id && <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold shrink-0">En uso</span>}
                      </div>
                      <span className="text-xs text-gray-600">Estándar</span>
                    </div>
                  </div>
                  {p.id !== activeProfile.id && (
                    <button onClick={() => handleSelectProfile(p)} className="text-xs text-emerald-400 hover:underline cursor-pointer font-bold shrink-0 ml-2 focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1">Cambiar</button>
                  )}
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

                  {registerStep === "verify" ? (
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
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Contraseña (mínimo 6)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-white"
                      />
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
                src={selectedMovie.backdrop || selectedMovie.bgImage}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: modalTrailerReady ? 0 : 1, transition: "opacity .8s" }}
              />
              {modalTrailerOn && selectedMovie.trailerUrl && (
                youtubeId(selectedMovie.trailerUrl) ? (
                  <YtBg
                    key={"myt-" + selectedMovie.id + "-" + (modalMuted ? "m" : "s")}
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
                              <img src={selectedMovie.bgImage} alt="" className="w-full h-full object-cover opacity-80" />
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
                      <img src={sim.bgImage} alt={sim.title} className="w-full h-44 object-cover rounded-xl group-hover:border border-green-500 transition shadow-lg" />
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
          className="fixed inset-0 bg-black z-50 overflow-hidden"
          style={{ cursor: playerUi ? "default" : "none" }}
          onMouseMove={wakePlayerUi}
          onTouchStart={wakePlayerUi}
          onKeyDown={wakePlayerUi}
        >
          <div
            className="p-4 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent"
            style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, transition: "opacity .4s", opacity: playerUi && !playerError ? 1 : 0, visibility: playerUi && !playerError ? "visible" : "hidden" }}
          >
            <button 
              onClick={() => setIsPlaying(false)}
              className="flex items-center gap-2 text-white font-bold hover:text-green-400 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 rounded-lg p-1"
            >
              <ArrowLeft className="w-5 h-5" /> <span className="truncate max-w-[250px] sm:max-w-none">{selectedMovie.title}{currentEpisode ? " · T" + currentEpisode.season + ":E" + currentEpisode.number + " " + currentEpisode.title : ""}</span>
            </button>
          </div>

          <div className="bg-black overflow-hidden" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
            <video 
              ref={playerRef}
              x-webkit-airplay="allow"
              data-autofocus
              tabIndex={0}
              controls 
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
            {skipMode && !nextUp && !playerError && (
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
                style={{ position: "absolute", right: 24, bottom: playerUi ? 110 : 40, zIndex: 34 }}
                className="flex items-center gap-2 bg-white/95 hover:bg-white text-black font-bold text-sm px-5 py-3 rounded-lg shadow-2xl cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
              >
                <SkipForward className="w-4 h-4" />
                {skipMode === "intro" ? "Saltar intro" : nextEpisodeOf(selectedMovie, currentEpisode) ? "Siguiente episodio" : "Saltar créditos"}
              </button>
            )}
            {nextUp && (
              <div style={{ position: "absolute", right: 24, bottom: 96, zIndex: 35 }} className="bg-[#141414]/95 border border-gray-700 rounded-2xl p-4 shadow-2xl" data-tv-modal>
                <p className="text-[11px] text-gray-400 uppercase font-bold">Siguiente episodio en {nextUp.secs} s</p>
                <p className="text-sm font-bold text-white mt-1 max-w-[260px] truncate">T{nextUp.ep.season}:E{nextUp.ep.number} · {nextUp.ep.title}</p>
                <div className="flex gap-2 mt-3">
                  <button data-autofocus onClick={() => selectedMovie && playEpisode(selectedMovie, nextUp.ep)} className="bg-white text-black font-bold text-xs px-4 py-2 rounded-lg cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">▶ Ver ahora</button>
                  <button data-close-on-back onClick={() => setNextUp(null)} className="bg-[#262626] text-white font-bold text-xs px-4 py-2 rounded-lg border border-gray-700 cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500">Cancelar</button>
                </div>
              </div>
            )}
            {videoLoading && !playerError && (
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

          <div
            className="p-3 sm:p-4 bg-gradient-to-t from-black/95 to-transparent flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20, transition: "opacity .4s", opacity: playerUi && !playerError ? 1 : 0, visibility: playerUi && !playerError ? "visible" : "hidden" }}
          >
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button 
                onClick={() => setIsPlaying(false)}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <ArrowLeft className="w-4 h-4 text-green-400" /> Anterior
              </button>
              <button 
                onClick={requestFullscreenSafe}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <Maximize2 className="w-4 h-4 text-green-400" /> Pantalla completa
              </button>
              {nextEpisodeOf(selectedMovie, currentEpisode) && (
                <button
                  onClick={() => { const nx = nextEpisodeOf(selectedMovie, currentEpisode); if (nx) playEpisode(selectedMovie, nx); }}
                  className="flex items-center gap-1.5 bg-white text-black px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <SkipForward className="w-4 h-4" /> Siguiente episodio
                </button>
              )}
              <button 
                onClick={toggleVideoFit}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <Tv className="w-4 h-4 text-green-400" /> {videoFit === "cover" ? "Ver completa" : "Llenar pantalla"}
              </button>
              <button 
                onClick={handleCast}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <Cast className="w-4 h-4 text-green-400" /> Transmitir
              </button>
              <button 
                onClick={() => toggleMyList(selectedMovie)}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {inMyList(selectedMovie) ? <><Check className="w-4 h-4 text-green-400" /> En Mi Lista</> : <><Plus className="w-4 h-4 text-green-400" /> Mi Lista</>}
              </button>
            </div>

            <div className="flex items-center gap-3 bg-[#121212] px-4 py-2 rounded-xl border border-gray-800 shrink-0">
              <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-xs font-bold">ES</div>
              <div>
                <h5 className="text-xs font-bold text-white">Servidor Sol</h5>
                <span className="text-[10px] text-gray-400">Español · Sin anuncios</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIE DE PÁGINA + ATRIBUCIÓN TMDB */}
      {(activeTab === "inicio" || activeTab === "explorar") && (
        <footer className="px-4 sm:px-6 md:px-12 pb-28 lg:pb-10 pt-4 border-t border-gray-900 text-[11px] text-gray-500 space-y-1">
          <p className="flex items-center gap-2 flex-wrap">
            <img src="/icons/icon-192.png" alt="" className="w-5 h-5 rounded" />
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

      {/* ¿QUIÉN ESTÁ VIENDO? */}
      {showWho && accountUser && (
        <div data-tv-modal className="fixed inset-0 z-[65] bg-[#050505] flex flex-col items-center justify-center p-6 overflow-y-auto">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-10 text-center">¿Quién está viendo?</h2>
          <div className="flex flex-wrap justify-center gap-6 sm:gap-10 max-w-4xl">
            {profiles.filter((p) => p.id !== "invitado").map((p) => (
              <div
                key={"who-" + p.id}
                onClick={() => requestProfileSwitch(p)}
                tabIndex={0}
                data-autofocus={p.id === activeProfile.id ? true : undefined}
                className="group flex flex-col items-center cursor-pointer rounded-2xl p-2 focus:outline-none focus:ring-4 focus:ring-green-500"
                style={{ width: 140 }}
              >
                <div className="relative rounded-2xl overflow-hidden border-4 border-transparent group-hover:border-white bg-gray-900" style={{ width: 120, height: 120 }}>
                  <img src={p.avatar} alt={p.name} className="w-full h-full object-cover object-top" />
                  {p.isKid && <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-black text-black bg-yellow-400 rounded">NIÑOS</span>}
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
          <button
            onClick={openAccountSafe}
            className="mt-12 px-6 py-2.5 border border-gray-600 text-gray-300 hover:text-white hover:border-white text-sm font-bold tracking-wider uppercase rounded-lg cursor-pointer focus:outline-none focus:ring-4 focus:ring-green-500"
          >
            Administrar perfiles
          </button>
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
                        <img src={item.file} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
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