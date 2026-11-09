"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Info, Plus, Search, Bell, Sparkles, Check, 
  Tv, Shield, User, PlusCircle, Trash2, ChevronRight, X, AlertCircle, FileText, LogOut, Lock, Sparkle, Settings, Film, Radio, Globe, ChevronDown, Edit3, Share2, Cast, Maximize2, RefreshCw, ArrowLeft, SkipForward, SkipBack, Download, Home as HomeIcon, Bookmark
} from "lucide-react";
import Hls from "hls.js";

interface Profile {
  id: string;
  name: string;
  avatar: string;
  isKid: boolean;
  pin?: string;
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

interface ContinueItem {
  id: number | string;
  title: string;
  img: string;
  t: number; // segundo donde se quedó
  d: number; // duración total
  updatedAt: number;
}

function formatRemaining(sec: number) {
  const totalMin = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `Quedan ${h} h ${m} min` : `Quedan ${m} min`;
}

// ===== GUÍA DE PROGRAMACIÓN (Ahora / Después) =====
interface EpgItem {
  t: string; // hora de inicio "HH:MM" (hora local del canal)
  title: string;
}
type EpgMap = Record<string, EpgItem[]>;

interface NowNext {
  current: EpgItem;
  next: EpgItem | null;
  progress: number; // 0 a 100
}

const COUNTRY_TZ: Record<string, string> = {
  "Perú": "America/Lima",
  "Chile": "America/Santiago",
  "Argentina": "America/Argentina/Buenos_Aires",
  "España": "Europe/Madrid",
  "Ecuador": "America/Guayaquil",
  "Bolivia": "America/La_Paz",
  "Italia": "Europe/Rome",
};

function tzCountryKey(c: Channel): string | undefined {
  return Object.keys(COUNTRY_TZ).find((k) => c.country.startsWith(k));
}

function tzForChannel(c: Channel): string {
  const k = tzCountryKey(c);
  return k ? COUNTRY_TZ[k] : "America/Lima";
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesNow(tz: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value) % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    return h * 60 + m;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

function parseSchedule(text: string): { items: EpgItem[]; invalid: string[] } {
  const items: EpgItem[] = [];
  const invalid: string[] = [];
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
    if (!m) { invalid.push(line); return; }
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) { invalid.push(line); return; }
    items.push({ t: `${String(h).padStart(2, "0")}:${m[2]}`, title: m[3].trim().slice(0, 80) });
  });
  items.sort((a, b) => toMin(a.t) - toMin(b.t));
  return { items, invalid };
}

// Calcula qué se transmite ahora y qué sigue, según la hora actual del canal (se repite cada día)
function getNowNext(items: EpgItem[] | undefined, tz: string, now: Date): NowNext | null {
  if (!items || items.length === 0) return null;
  const nowMin = minutesNow(tz, now);
  let idx = -1;
  for (let i = 0; i < items.length; i++) {
    if (toMin(items[i].t) <= nowMin) idx = i;
  }
  if (idx === -1) idx = items.length - 1; // todavía no empieza el primero de hoy: sigue el último de ayer
  const current = items[idx];
  const next = items.length > 1 ? items[(idx + 1) % items.length] : null;
  const start = toMin(current.t);
  const end = next ? toMin(next.t) : start + 1440;
  const duration = ((end - start + 1440) % 1440) || 1440;
  const elapsed = (nowMin - start + 1440) % 1440;
  return { current, next, progress: Math.min(100, Math.max(0, (elapsed / duration) * 100)) };
}

// ===== REPRODUCTOR ROBUSTO (MP4 / HLS, con respaldo y manejo de errores) =====
function MoviePlayer({ movie, fallbackUrl, startAt, onProgress }: { movie: Movie; fallbackUrl?: string; startAt?: number; onProgress?: (t: number, d: number) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sources = [movie.videoUrl, movie.backupVideoUrl, fallbackUrl].filter(
    (u, i, arr): u is string => !!u && arr.indexOf(u) === i
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const currentUrl = sources[sourceIndex];

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentUrl || failed) return;

    let hls: Hls | null = null;
    const isHls = /\.m3u8(\?|$)/i.test(currentUrl);

    const goNext = () => {
      if (sourceIndex < sources.length - 1) {
        setSourceIndex((i) => i + 1);
      } else {
        setFailed(true);
      }
    };

    const tryPlay = () => {
      video.play().catch(() => {
        // Si el navegador bloquea el autoplay con sonido, el usuario puede tocar play.
      });
    };

    if (isHls && !video.canPlayType("application/vnd.apple.mpegurl") && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(currentUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) goNext();
      });
    } else {
      video.src = currentUrl;
      video.load();
      tryPlay();
    }

    video.addEventListener("error", goNext);
    return () => {
      video.removeEventListener("error", goNext);
      if (hls) hls.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl, failed, retryKey]);

  // Reanudar donde se quedó y guardar el progreso (solo videos con duración finita)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || failed) return;
    let last = 0;
    let resumed = false;

    const onMeta = () => {
      if (resumed) return;
      resumed = true;
      if (startAt && isFinite(v.duration) && startAt > 5 && startAt < v.duration - 20) {
        v.currentTime = startAt;
      }
    };
    const report = () => {
      if (!onProgress || !isFinite(v.duration) || v.duration <= 0) return;
      onProgress(v.currentTime, v.duration);
    };
    const onTime = () => {
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      report();
    };

    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", report);
    v.addEventListener("ended", report);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", report);
      v.removeEventListener("ended", report);
      report();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl, failed, retryKey]);

  if (failed || !currentUrl) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 p-6 max-w-sm">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h4 className="text-lg font-bold text-white">No se pudo reproducir este video</h4>
        <p className="text-xs text-gray-400">
          El enlace del video no responde, está roto o tiene un formato que tu navegador no soporta (usa MP4 con H.264 o HLS .m3u8).
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => { setFailed(false); setSourceIndex(0); setRetryKey((k) => k + 1); }}
            className="flex items-center gap-2 bg-white text-black font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Reintentar
          </button>
          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-[#181818] border border-gray-800 text-white font-bold px-4 py-2 rounded-xl text-xs"
            >
              Abrir enlace
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      playsInline
      preload="auto"
      controlsList="nodownload"
      disableRemotePlayback={false}
      {...({ "x-webkit-airplay": "allow" } as Record<string, string>)}
      className="w-full h-full object-contain bg-black"
    >
      Tu navegador no soporta el reproductor.
    </video>
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

  // Configuración del dispositivo (se guarda solo en este dispositivo)
  const [tvMode, setTvMode] = useState(false);
  const [skipAdsNotice, setSkipAdsNotice] = useState(true);
  const [showAdNotice, setShowAdNotice] = useState(false);
  const [continueWatchingList, setContinueWatchingList] = useState<ContinueItem[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Carrusel del banner principal
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const heroTouchX = useRef(0);

  // Guía de programación de TV (Ahora / Después)
  const [epg, setEpg] = useState<EpgMap>({});
  const [nowTick, setNowTick] = useState(0); // se llena al montar (Next no permite Date.now() al renderizar)
  const [epgChannelId, setEpgChannelId] = useState("");
  const [epgText, setEpgText] = useState("");

  useEffect(() => {
    const loadEpg = async () => {
      try {
        const res = await fetch("/api/epg", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.schedule && typeof data.schedule === "object") setEpg(data.schedule);
      } catch {
        // sin conexión: se queda con lo que ya hay
      }
    };
    loadEpg();
    const id = setInterval(loadEpg, 300000);
    return () => clearInterval(id);
  }, []);

  // Reloj para actualizar "Ahora / Después" mientras se ve la pestaña TV
  useEffect(() => {
    if (activeTab !== "tv") return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, [activeTab]);

  // Cargar ajustes guardados
  useEffect(() => {
    try {
      const tv = localStorage.getItem("cineverso_tv_mode");
      if (tv !== null) {
        setTvMode(tv === "1");
      } else if (/SmartTV|SMART-TV|Tizen|Web0S|webOS|HbbTV|Android TV|AFTM|AFTT|AFTS|BRAVIA|CrKey|Roku/i.test(navigator.userAgent)) {
        setTvMode(true); // Smart TV detectada: activa el Modo TV por defecto
      }
      const ads = localStorage.getItem("cineverso_skip_ads");
      if (ads !== null) setSkipAdsNotice(ads === "1");
      const ml = localStorage.getItem("cineverso_mylist");
      if (ml) {
        const parsedList = JSON.parse(ml);
        if (Array.isArray(parsedList)) setMyList(parsedList);
      }
      const prog = localStorage.getItem("cineverso_progress");
      if (prog) {
        const parsed = JSON.parse(prog);
        if (Array.isArray(parsed)) setContinueWatchingList(parsed);
      }
    } catch {
      // ignorar errores de lectura
    }
    setSettingsLoaded(true);
  }, []);

  // Guardar ajustes cuando cambian
  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem("cineverso_tv_mode", tvMode ? "1" : "0");
      localStorage.setItem("cineverso_skip_ads", skipAdsNotice ? "1" : "0");
      localStorage.setItem("cineverso_progress", JSON.stringify(continueWatchingList));
      localStorage.setItem("cineverso_mylist", JSON.stringify(myList));
    } catch {
      // ignorar errores de escritura
    }
  }, [tvMode, skipAdsNotice, continueWatchingList, myList, settingsLoaded]);

  // Guarda el progreso de reproducción de una película ("Continuar viendo")
  const saveProgress = (movie: Movie, t: number, d: number) => {
    if (!isFinite(t) || !isFinite(d) || d <= 0) return;
    setContinueWatchingList((prev) => {
      const rest = prev.filter((x) => String(x.id) !== String(movie.id));
      if (t < 15 || t / d > 0.95) return rest; // recién empezada o ya terminada
      return [
        { id: movie.id, title: movie.title, img: movie.bgImage || movie.img || "", t, d, updatedAt: Date.now() },
        ...rest,
      ].slice(0, 12);
    });
  };

  // Iniciar reproducción (muestra el aviso de anuncios si no está omitido)
  const startPlayback = () => {
    if (skipAdsNotice) setIsPlaying(true);
    else setShowAdNotice(true);
  };

  const flashToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // ===== TRANSMITIR A TV / PC / SMART TV (Chromecast, Android TV, AirPlay) =====
  const [castState, setCastState] = useState<"idle" | "connecting" | "connected">("idle");

  const handleCast = async () => {
    const v = document.querySelector("video") as any;
    if (!v) {
      flashToast("Inicia la reproducción para poder transmitir");
      return;
    }
    try {
      // Chrome / Edge / Android: selector nativo con los dispositivos cercanos (Chromecast, Android TV, TVs compatibles)
      if (v.remote && typeof v.remote.prompt === "function") {
        if (typeof v.currentSrc === "string" && v.currentSrc.startsWith("blob:")) {
          alert(
            "Este video usa transmisión HLS y este navegador no permite enviarlo con este botón. " +
            "Usa el menú de Chrome (⋮) → \"Transmitir...\" y elige tu TV, o prueba con un video en formato MP4."
          );
          return;
        }
        v.remote.onconnecting = () => setCastState("connecting");
        v.remote.onconnect = () => {
          setCastState("connected");
          flashToast("Transmitiendo a tu dispositivo");
        };
        v.remote.ondisconnect = () => {
          setCastState("idle");
          flashToast("Transmisión finalizada");
        };
        await v.remote.prompt();
        return;
      }

      // Safari (iPhone, iPad, Mac): AirPlay
      if (typeof v.webkitShowPlaybackTargetPicker === "function") {
        if (!v.__airplayBound) {
          v.__airplayBound = true;
          v.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", () => {
            setCastState(v.webkitCurrentPlaybackTargetIsWireless ? "connected" : "idle");
          });
        }
        v.webkitShowPlaybackTargetPicker();
        return;
      }

      alert(
        "Tu navegador no permite transmitir desde la página. Usa Chrome o Edge (Chromecast / Smart TV) " +
        "o Safari (AirPlay). También puedes abrir cineversomagico.com directamente en el navegador de tu Smart TV."
      );
    } catch (err: any) {
      const name = err?.name;
      if (name === "NotAllowedError" || name === "AbortError") return; // cerraste el selector
      if (name === "NotFoundError") {
        alert(
          "No se encontraron dispositivos cercanos. Revisa que tu TV o Chromecast esté encendido y conectado " +
          "a la misma red Wi-Fi que este dispositivo."
        );
        return;
      }
      if (name === "NotSupportedError" || name === "InvalidStateError") {
        alert(
          "Este video no se puede transmitir con este botón. Prueba con un video MP4 con enlace público (https), " +
          "o usa el menú de Chrome (⋮) → \"Transmitir...\"."
        );
        return;
      }
      alert("No se pudo iniciar la transmisión. Inténtalo de nuevo.");
    }
  };

  // ===== MODO TV: interfaz grande + navegación con control remoto / teclado =====
  const tvStateRef = useRef({ isPlaying, selectedMovie, showAdNotice, activeTab });
  tvStateRef.current = { isPlaying, selectedMovie, showAdNotice, activeTab };

  useEffect(() => {
    const root = document.documentElement;
    if (!tvMode) {
      root.classList.remove("tv-mode");
      root.style.fontSize = "";
      return;
    }
    root.classList.add("tv-mode");
    root.style.fontSize = "125%";
    return () => {
      root.classList.remove("tv-mode");
      root.style.fontSize = "";
    };
  }, [tvMode]);

  useEffect(() => {
    if (!tvMode) return;

    const FOCUSABLE =
      'button, a[href], input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])';

    // Hace enfocables los elementos clicables que no son botones (tarjetas, canales, etc.)
    const makeClickablesFocusable = () => {
      document.querySelectorAll<HTMLElement>(".cursor-pointer").forEach((el) => {
        if (/^(button|a|input|select|textarea)$/i.test(el.tagName)) return;
        if (!el.hasAttribute("tabindex")) {
          el.setAttribute("tabindex", "0");
          el.setAttribute("role", "button");
        }
      });
    };
    makeClickablesFocusable();
    let raf = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(makeClickablesFocusable);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const getCandidates = () => {
      const overlays = document.querySelectorAll(".fixed.inset-0");
      const overlay = overlays.length ? overlays[overlays.length - 1] : null;
      return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
        if (el.hasAttribute("disabled")) return false;
        if (overlay && !overlay.contains(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const st = getComputedStyle(el);
        return st.visibility !== "hidden" && st.display !== "none";
      });
    };

    const focusEl = (el: HTMLElement) => {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    };

    const move = (dir: "up" | "down" | "left" | "right") => {
      const cands = getCandidates();
      if (!cands.length) return;
      const cur = document.activeElement as HTMLElement | null;

      if (!cur || !cands.includes(cur)) {
        const inView = cands.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > 0 && r.top < window.innerHeight;
        });
        const pool = inView.length ? inView : cands;
        pool.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return ra.top - rb.top || ra.left - rb.left;
        });
        focusEl(pool[0]);
        return;
      }

      const cr = cur.getBoundingClientRect();
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const el of cands) {
        if (el === cur) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx;
        const dy = r.top + r.height / 2 - cy;
        let primary = 0;
        let secondary = 0;
        if (dir === "right") { if (dx <= 4) continue; primary = dx; secondary = Math.abs(dy); }
        else if (dir === "left") { if (dx >= -4) continue; primary = -dx; secondary = Math.abs(dy); }
        else if (dir === "down") { if (dy <= 4) continue; primary = dy; secondary = Math.abs(dx); }
        else { if (dy >= -4) continue; primary = -dy; secondary = Math.abs(dx); }
        const score = primary + secondary * 2.5;
        if (score < bestScore) { bestScore = score; best = el; }
      }

      if (best) {
        focusEl(best);
      } else if (dir === "up" || dir === "down") {
        window.scrollBy({ top: dir === "down" ? 320 : -320, behavior: "smooth" });
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName || "";
      const inputType = tag === "INPUT" ? (t as HTMLInputElement).type : "";
      const typing =
        tag === "TEXTAREA" || (tag === "INPUT" && !["checkbox", "radio", "button", "submit"].includes(inputType));
      const key = e.key;
      const code = e.keyCode;

      // Botón "Atrás" del control (Escape, Backspace, Tizen 10009, webOS 461)
      if (key === "Escape" || key === "BrowserBack" || code === 10009 || code === 461 || (key === "Backspace" && !typing)) {
        const st = tvStateRef.current;
        if (st.showAdNotice) { e.preventDefault(); setShowAdNotice(false); return; }
        if (st.isPlaying) { e.preventDefault(); setIsPlaying(false); return; }
        if (st.selectedMovie) { e.preventDefault(); setSelectedMovie(null); return; }
        if (st.activeTab !== "inicio") { e.preventDefault(); setActiveTab("inicio"); return; }
        return;
      }

      // Play / pausa con teclas multimedia
      if (key === "MediaPlayPause" || key === "MediaPlay" || key === "MediaPause") {
        const v = document.querySelector("video");
        if (v) { e.preventDefault(); if (v.paused) v.play().catch(() => {}); else v.pause(); }
        return;
      }

      // Con el video enfocado: izquierda/derecha adelanta o retrocede 10 s
      if (tag === "VIDEO") {
        const v = t as HTMLVideoElement;
        if ((key === "ArrowLeft" || key === "ArrowRight") && isFinite(v.duration)) {
          e.preventDefault();
          v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + (key === "ArrowRight" ? 10 : -10)));
          return;
        }
        if (key === "Enter" || key === " ") {
          e.preventDefault();
          if (v.paused) v.play().catch(() => {}); else v.pause();
          return;
        }
      }

      if (tag === "SELECT") return;

      const dirMap: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      };
      const dir = dirMap[key];
      if (dir) {
        if (typing && (dir === "left" || dir === "right")) return; // permite mover el cursor al escribir
        e.preventDefault();
        move(dir);
        return;
      }

      // Enter / espacio sobre tarjetas y canales (elementos que no son botones nativos)
      if ((key === "Enter" || key === " ") && t && t.getAttribute("role") === "button" && !/^(BUTTON|A|INPUT)$/.test(tag)) {
        e.preventDefault();
        t.click();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [tvMode]);

  // CANALES DE TV EN VIVO COMPLETO
  const [liveChannels] = useState<Channel[]>([
    {
      id: "chile-1-13c",
      name: "13C",
      shortCode: "13C",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E13C%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 13C",
      videoUrl: "https://origin.dpsgo.com/ssai/event/GI-9cp_bT8KcerLpZwkuhw/master.m3u8"
    },
    {
      id: "chile-2-13-festival",
      name: "13 Festival",
      shortCode: "13F",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E13F%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 13 Festival",
      videoUrl: "https://origin.dpsgo.com/ssai/event/Nftd0fM2SXasfDlRphvUsg/master.m3u8"
    },
    {
      id: "chile-3-13-kids",
      name: "13 Kids",
      shortCode: "13K",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E13K%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 13 Kids",
      videoUrl: "https://origin.dpsgo.com/ssai/event/LhHrVtyeQkKZ-Ye_xEU75g/master.m3u8"
    },
    {
      id: "chile-4-13-realities",
      name: "13 Realities",
      shortCode: "13R",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E13R%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 13 Realities",
      videoUrl: "https://origin.dpsgo.com/ssai/event/g7_JOM0ORki9SR5RKHe-Kw/master.m3u8"
    },
    {
      id: "chile-5-13t",
      name: "13T",
      shortCode: "13T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E13T%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 13T",
      videoUrl: "https://origin.dpsgo.com/ssai/event/f4TrySe8SoiGF8Lu3EIq1g/master.m3u8"
    },
    {
      id: "chile-6-15-1-bpb",
      name: "15.1 BPB",
      shortCode: "151",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E151%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 15.1 BPB",
      videoUrl: "https://v2.tustreaming.cl/enlacebpbtv/index.m3u8"
    },
    {
      id: "chile-7-ada-tv",
      name: "ADA TV",
      shortCode: "AT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ADA TV",
      videoUrl: "https://live-evg10.tv360.bitel.com.pe/bitel/alasdeaguilaSRT/playlist.m3u8"
    },
    {
      id: "chile-8-ae-radio-tv",
      name: "AE Radio TV",
      shortCode: "ART",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EART%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AE Radio TV",
      videoUrl: "https://tls-cl.cdnz.cl/aeradio/live/playlist.m3u8"
    },
    {
      id: "chile-9-agricultura-tv",
      name: "Agricultura TV",
      shortCode: "AT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Agricultura TV",
      videoUrl: "https://redirector.rudo.video/hls-video/ey6283je82983je9823je8jowowiekldk9838274/921tv/921tv.smil/playlist.m3u8"
    },
    {
      id: "chile-10-am-canal",
      name: "AM Canal",
      shortCode: "AC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AM Canal",
      videoUrl: "https://streaming.bitsur.cl:3534/live/vdo1102live.m3u8"
    },
    {
      id: "chile-11-atacama-noticias",
      name: "Atacama Noticias",
      shortCode: "AN",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Atacama Noticias",
      videoUrl: "https://v2.tustreaming.cl/atacamanoticias/index.m3u8"
    },
    {
      id: "chile-12-caldera-vision",
      name: "Caldera Vision",
      shortCode: "CV",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECV%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Caldera Vision",
      videoUrl: "https://tv.arkeo.cl:1936/kymczwbrge/kymczwbrge/playlist.m3u8"
    },
    {
      id: "chile-13-campustv",
      name: "CampusTV",
      shortCode: "C",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de CampusTV",
      videoUrl: "https://pantera1-100gb-cl-movistar.dps.live/campustv/campustv.smil/playlist.m3u8"
    },
    {
      id: "chile-14-canal-2-quellon",
      name: "Canal 2 Quellon",
      shortCode: "C2Q",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2Q%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 2 Quellon",
      videoUrl: "https://pantera1-100gb-cl-movistar.dps.live/tvquellon/tvquellon.smil/playlist.m3u8"
    },
    {
      id: "chile-15-canal-5-puerto-montt",
      name: "Canal 5 Puerto Montt",
      shortCode: "C5PM",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC5PM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 5 Puerto Montt",
      videoUrl: "https://5ff3d9babae13.streamlock.net/aufymdjpjf/aufymdjpjf/playlist.m3u8"
    },
    {
      id: "chile-16-canal-9-bio-bio-television",
      name: "Canal 9 Bio-Bio Television",
      shortCode: "C9BB",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC9BB%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 9 Bio-Bio Television",
      videoUrl: "https://unlimited6-cl.dps.live/c9/c9.smil/playlist.m3u8"
    },
    {
      id: "chile-17-canal-13",
      name: "Canal 13",
      shortCode: "C1",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC1%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 13",
      videoUrl: "http://15.204.246.24:8080/Canal13HD/index.m3u8"
    },
    {
      id: "chile-18-canal-30-loncomilla",
      name: "Canal 30 Loncomilla",
      shortCode: "C3L",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC3L%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 30 Loncomilla",
      videoUrl: "https://v1.tustreaming.cl/canal30loncomilla/index.m3u8"
    },
    {
      id: "chile-19-canal-chilote",
      name: "Canal Chilote",
      shortCode: "CC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Chilote",
      videoUrl: "https://videostream.chileservidores.com:8081/chiloe2/index.m3u8"
    },
    {
      id: "chile-20-canal-claro",
      name: "Canal Claro",
      shortCode: "CC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Claro",
      videoUrl: "https://jmp2.uk/plu-68224482c5d53e1351aaf2f2.m3u8"
    },
    {
      id: "chile-21-canal-isb",
      name: "Canal ISB",
      shortCode: "CI",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal ISB",
      videoUrl: "https://unlimited1-us.dps.live/isb/isb.smil/playlist.m3u8"
    },
    {
      id: "chile-22-canal-latino-54",
      name: "Canal Latino 54",
      shortCode: "CL5",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECL5%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Latino 54",
      videoUrl: "https://videostream.chileservidores.com:8081/latina/index.m3u8"
    },
    {
      id: "chile-23-canal-local",
      name: "Canal Local",
      shortCode: "CL",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Local",
      videoUrl: "https://v2.tustreaming.cl/canallocalcl/index.m3u8"
    },
    {
      id: "chile-24-canal-survision-alerce",
      name: "Canal Survision Alerce",
      shortCode: "CSA",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECSA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Survision Alerce",
      videoUrl: "https://s1.tvdatta.com:3384/live/canal20tvlive.m3u8"
    },
    {
      id: "chile-25-caracola-tv",
      name: "Caracola TV",
      shortCode: "CT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Caracola TV",
      videoUrl: "https://wifispeed.trapemn.tv:1936/comunales/caracola-tv/chunks.m3u8"
    },
    {
      id: "chile-26-cartoon-network",
      name: "Cartoon Network",
      shortCode: "CN",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cartoon Network",
      videoUrl: "http://45.167.1.138:8000/play/a00w"
    },
    {
      id: "chile-27-central-tv",
      name: "Central TV",
      shortCode: "CT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Central TV",
      videoUrl: "https://freya.mivideo.pro/centraltv/video.m3u8"
    },
    {
      id: "chile-28-chile-channel",
      name: "Chile Channel",
      shortCode: "CC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Chile Channel",
      videoUrl: "https://v2.tustreaming.cl/chilechannel/index.m3u8"
    },
    {
      id: "chile-29-chilevision",
      name: "ChileVision",
      shortCode: "C",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ChileVision",
      videoUrl: "http://15.204.246.24:8080/CHVHD/index.m3u8"
    },
    {
      id: "chile-30-china-channel",
      name: "China Channel",
      shortCode: "CC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de China Channel",
      videoUrl: "https://v2.tustreaming.cl/chinachannel/index.m3u8"
    },
    {
      id: "chile-31-cinecanal-pacific",
      name: "Cinecanal Pacific",
      shortCode: "CP",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cinecanal Pacific",
      videoUrl: "http://138.121.15.230:9002/CINECANAL/index.m3u8"
    },
    {
      id: "chile-32-club-tv",
      name: "Club TV",
      shortCode: "CT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Club TV",
      videoUrl: "https://tv.arkeo.cl:1936/clubtv/clubtv/playlist.m3u8"
    },
    {
      id: "chile-33-concepcion-tv",
      name: "Concepcion TV",
      shortCode: "CT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Concepcion TV",
      videoUrl: "https://stream.blserver.cl/hls/ctv/index.m3u8"
    },
    {
      id: "chile-34-contivision",
      name: "Contivision",
      shortCode: "C",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Contivision",
      videoUrl: "https://unlimited6-cl.dps.live/cm/cm.smil/playlist.m3u8"
    },
    {
      id: "chile-35-cooperativa",
      name: "Cooperativa",
      shortCode: "C",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cooperativa",
      videoUrl: "https://unlimited1-cl-isp.dps.live/coopetv/coopetv.smil/playlist.m3u8"
    },
    {
      id: "chile-36-coyhaique-tv",
      name: "Coyhaique TV",
      shortCode: "CT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Coyhaique TV",
      videoUrl: "https://v2.tustreaming.cl/coyhaiquetv/index.m3u8"
    },
    {
      id: "chile-37-crtv-chile",
      name: "CRTV (Chile)",
      shortCode: "CC",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de CRTV (Chile)",
      videoUrl: "https://stmv2.voxtvhd.com.br/crtvchile/crtvchile/playlist.m3u8"
    },
    {
      id: "chile-38-dance-fm",
      name: "Dance FM",
      shortCode: "DF",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Dance FM",
      videoUrl: "https://5eaccbab48461.streamlock.net:1936/dancefm_1/dancefm_1/playlist.m3u8"
    },
    {
      id: "chile-39-dch-tv",
      name: "DCH TV",
      shortCode: "DT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de DCH TV",
      videoUrl: "https://v2.tustreaming.cl/dchtv/index.m3u8"
    },
    {
      id: "chile-40-decima-tv",
      name: "Decima TV",
      shortCode: "DT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Decima TV",
      videoUrl: "https://unlimited2-cl-isp.dps.live/decimatv/decimatv.smil/playlist.m3u8"
    },
    {
      id: "chile-41-discovery-kids",
      name: "Discovery Kids",
      shortCode: "DK",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDK%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Discovery Kids",
      videoUrl: "http://38.224.231.176:8000/play/a01j/index.m3u8"
    },
    {
      id: "chile-42-disney-channel",
      name: "Disney Channel",
      shortCode: "DC",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Disney Channel",
      videoUrl: "http://15.204.246.24:8080/DisneyHD/index.m3u8"
    },
    {
      id: "chile-43-disney-jr",
      name: "Disney Jr.",
      shortCode: "DJ",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDJ%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Disney Jr.",
      videoUrl: "http://45.185.163.75:8000/play/a016/index.m3u8"
    },
    {
      id: "chile-44-el-3-de-conce",
      name: "El 3 de Conce",
      shortCode: "E3DC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE3DC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de El 3 de Conce",
      videoUrl: "https://5ff3d9babae13.streamlock.net/xedkektnqj/xedkektnqj/playlist.m3u8"
    },
    {
      id: "chile-45-el-canal-feliz",
      name: "El Canal Feliz",
      shortCode: "ECF",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EECF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de El Canal Feliz",
      videoUrl: "http://streaming.multicontenidos.cl:8081/live/canalfeliz/playlist.m3u8"
    },
    {
      id: "chile-46-el-centro",
      name: "El Centro",
      shortCode: "EC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EEC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de El Centro",
      videoUrl: "https://v1.tustreaming.cl/diarioelcentrotv/index.m3u8"
    },
    {
      id: "chile-47-el-pinguino-tv",
      name: "El Pinguino TV",
      shortCode: "EPT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EEPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de El Pinguino TV",
      videoUrl: "https://redirector.dps.live/hls/pinguinotv/playlist.m3u8"
    },
    {
      id: "chile-48-el-radar",
      name: "El Radar",
      shortCode: "ER",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EER%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de El Radar",
      videoUrl: "https://video.ipstream.cl:3459/hybrid/play.m3u8"
    },
    {
      id: "chile-49-en-linea-maule",
      name: "En Linea Maule",
      shortCode: "ELM",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EELM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de En Linea Maule",
      videoUrl: "https://v2.tustreaming.cl/enlineamauletv/index.m3u8"
    },
    {
      id: "chile-50-enfoque-digital",
      name: "Enfoque Digital",
      shortCode: "ED",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EED%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Enfoque Digital",
      videoUrl: "https://5eaccbab48461.streamlock.net:1936/8074/8074/playlist.m3u8"
    },
    {
      id: "chile-51-espn-3",
      name: "ESPN 3",
      shortCode: "E3",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE3%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN 3",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_3/ESPN_3.isml/ESPN_3.m3u8"
    },
    {
      id: "chile-52-estacion-limache",
      name: "Estacion Limache",
      shortCode: "EL",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EEL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Estacion Limache",
      videoUrl: "https://v4.tustreaming.cl/limachemovil/index.m3u8"
    },
    {
      id: "chile-53-estacion-tv",
      name: "Estacion TV",
      shortCode: "ET",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Estacion TV",
      videoUrl: "https://unlimited1-cl-isp.dps.live/supersonikatv/supersonikatv.smil/playlist.m3u8"
    },
    {
      id: "chile-54-fm-plus-tv",
      name: "FM Plus TV",
      shortCode: "FPT",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de FM Plus TV",
      videoUrl: "https://v2.tustreaming.cl/fmplus/index.m3u8"
    },
    {
      id: "chile-55-fortaleza-tv",
      name: "Fortaleza TV",
      shortCode: "FT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Fortaleza TV",
      videoUrl: "https://multimedia.fortalezatv.cl/video/video.m3u8"
    },
    {
      id: "chile-56-frecuencia-7",
      name: "Frecuencia 7",
      shortCode: "F7",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EF7%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Frecuencia 7",
      videoUrl: "https://v2.tustreaming.cl/frecuencia7/index.m3u8"
    },
    {
      id: "chile-57-genial-tv",
      name: "Genial TV",
      shortCode: "GT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EGT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Genial TV",
      videoUrl: "https://v1.tustreaming.cl/genialtv/index.m3u8"
    },
    {
      id: "chile-58-islita-tv",
      name: "Islita TV",
      shortCode: "IT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EIT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Islita TV",
      videoUrl: "https://tv.arkeo.cl:1936/unetev/unetev/playlist.m3u8"
    },
    {
      id: "chile-59-itv-patagonia",
      name: "ITV Patagonia",
      shortCode: "IP",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EIP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ITV Patagonia",
      videoUrl: "https://redirector.dps.live/hls/itv/playlist.m3u8"
    },
    {
      id: "chile-60-juntos-tv",
      name: "Juntos TV",
      shortCode: "JT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EJT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Juntos TV",
      videoUrl: "https://video.juntostvchile.cl:8879/hls/web-jntv.m3u8"
    },
    {
      id: "chile-61-la-chilena-tv",
      name: "La Chilena TV",
      shortCode: "LCT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELCT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Chilena TV",
      videoUrl: "https://vdochile.com:3134/stream/play.m3u8"
    },
    {
      id: "chile-62-la-clave",
      name: "La Clave",
      shortCode: "LC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Clave",
      videoUrl: "https://unlimited1-cl-isp.dps.live/laclavetv/laclavetv.smil/playlist.m3u8"
    },
    {
      id: "chile-63-la-comarca-tv",
      name: "La Comarca TV",
      shortCode: "LCT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELCT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Comarca TV",
      videoUrl: "https://v2.tustreaming.cl/lcomarcatv/index.m3u8"
    },
    {
      id: "chile-64-la-melinkana-tv",
      name: "La Melinkana TV",
      shortCode: "LMT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Melinkana TV",
      videoUrl: "https://v1.tustreaming.cl/melinkana/index.m3u8"
    },
    {
      id: "chile-65-la-metro",
      name: "La Metro",
      shortCode: "LM",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Metro",
      videoUrl: "https://jireh-8-hls-video-us-isp.dps.live/hls-video/931b584451fa6dd1313ee66efbfd5802e3f3bcea/metropolitanatv/metropolitanatv.smil/playlist.m3u8"
    },
    {
      id: "chile-66-la-nuestra",
      name: "La Nuestra",
      shortCode: "LN",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Nuestra",
      videoUrl: "https://redirector.rudo.video/hls-video/339f69c6122f6d8f4574732c235f09b7683e31a5/ln/ln.smil/playlist.m3u8"
    },
    {
      id: "chile-67-la-popular",
      name: "La Popular",
      shortCode: "LP",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Popular",
      videoUrl: "https://tv.arkeo.cl:1936/enlacetv1/enlacetv1/playlist.m3u8"
    },
    {
      id: "chile-68-lila-tv-pencahue",
      name: "Lila TV Pencahue",
      shortCode: "LTP",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELTP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Lila TV Pencahue",
      videoUrl: "https://tv.arkeo.cl:1936/radiolila/radiolila/playlist.m3u8"
    },
    {
      id: "chile-69-maray-tv",
      name: "Maray TV",
      shortCode: "MT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Maray TV",
      videoUrl: "https://5eaccbab48461.streamlock.net:1936/8242/ngrp:8242_all/playlist.m3u8"
    },
    {
      id: "chile-70-marga-marga-tv",
      name: "Marga Marga TV",
      shortCode: "MMT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Marga Marga TV",
      videoUrl: "https://v1.tustreaming.cl/margamargatv/index.m3u8"
    },
    {
      id: "chile-71-mega-2",
      name: "Mega 2",
      shortCode: "M2",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EM2%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Mega 2",
      videoUrl: "http://15.204.196.147:22880/MEGA2-MEGAMEDIA-EE.UU-PROVEEDOR/index.m3u8"
    },
    {
      id: "chile-72-mega",
      name: "Mega",
      shortCode: "M",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Mega",
      videoUrl: "http://tr.live.clarovtrcdn.vtrplay.com/megahdchi/vxfmt=dp/playlist.m3u8?device_profile=STB_HLS_VCAS_LIVE_HD"
    },
    {
      id: "chile-73-mega-ficcion",
      name: "Mega Ficcion",
      shortCode: "MF",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Mega Ficcion",
      videoUrl: "http://15.204.196.147:22880/MEGAFICCION-MEGAMEDIA-EE.UU-PROVEEDOR/index.m3u8"
    },
    {
      id: "chile-74-meganoticias",
      name: "MegaNoticias",
      shortCode: "M",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de MegaNoticias",
      videoUrl: "http://15.204.196.147:22880/MEGANOTICIA-MEGAMEDIA-EE.UU-PROVEEDOR/video.m3u8"
    },
    {
      id: "chile-75-mi-radio-tv",
      name: "Mi Radio TV",
      shortCode: "MRT",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMRT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Mi Radio TV",
      videoUrl: "https://scl.edge.grupoz.cl/miradio2/live/playlist.m3u8"
    },
    {
      id: "chile-76-mtna-tv",
      name: "MTNA TV",
      shortCode: "MT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de MTNA TV",
      videoUrl: "https://live.mtna.tv/hls/mtna/mtna.m3u8"
    },
    {
      id: "chile-77-mtv",
      name: "MTV",
      shortCode: "M",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de MTV",
      videoUrl: "http://15.204.246.24:8080/MTVHD/index.m3u8"
    },
    {
      id: "chile-78-mundos-lacustres",
      name: "Mundos Lacustres",
      shortCode: "ML",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EML%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Mundos Lacustres",
      videoUrl: "https://video.ipstream.cl:3710/hybrid/play.m3u8"
    },
    {
      id: "chile-79-nada-es-imposible",
      name: "Nada Es Imposible",
      shortCode: "NEI",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENEI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Nada Es Imposible",
      videoUrl: "https://vdochile.com:3194/live/mvqutymylive.m3u8"
    },
    {
      id: "chile-80-nctv",
      name: "NCTV",
      shortCode: "N",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de NCTV",
      videoUrl: "https://pantera1-100gb-cl-movistar.dps.live/nctv/nctv.smil/playlist.m3u8"
    },
    {
      id: "chile-81-nick-jr",
      name: "NICK JR",
      shortCode: "NJ",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENJ%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de NICK JR",
      videoUrl: "https://streaming.onnethn.com/NICK_JR/playlist.m3u8"
    },
    {
      id: "chile-82-nickelodeon",
      name: "Nickelodeon",
      shortCode: "N",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Nickelodeon",
      videoUrl: "http://181.78.79.131:8000/play/a0qm"
    },
    {
      id: "chile-83-nina-tv",
      name: "Nina TV",
      shortCode: "NT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Nina TV",
      videoUrl: "https://tv1.ninatv.cl/hls/stream.m3u8"
    },
    {
      id: "chile-84-nuevo-tiempo-tv",
      name: "Nuevo Tiempo TV",
      shortCode: "NTT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENTT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Nuevo Tiempo TV",
      videoUrl: "https://streamtv.novotempo.com/CDN-TV-ES/smil:tvnuevotiempo.smil/playlist.m3u8"
    },
    {
      id: "chile-85-odisea-tv",
      name: "Odisea TV",
      shortCode: "OT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EOT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Odisea TV",
      videoUrl: "https://v2.tustreaming.cl/odiseatv/index.m3u8"
    },
    {
      id: "chile-86-oli-tv",
      name: "Oli TV",
      shortCode: "OT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EOT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Oli TV",
      videoUrl: "https://v4.tustreaming.cl/retroplaytv/index.m3u8"
    },
    {
      id: "chile-87-patagonia-radio",
      name: "Patagonia Radio",
      shortCode: "PR",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPR%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Patagonia Radio",
      videoUrl: "https://video01.logicahost.com.br/grupomedia/grupomedia/playlist.m3u8"
    },
    {
      id: "chile-88-pauta",
      name: "Pauta",
      shortCode: "P",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Pauta",
      videoUrl: "https://redirector.rudo.video/hls-video/ey6283je82983je9823je8jowowiekldk9838274/pautatv/pautatv.smil/playlist.m3u8"
    },
    {
      id: "chile-89-polar-tv",
      name: "Polar TV",
      shortCode: "PT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Polar TV",
      videoUrl: "https://polartv.webredirect.org/memfs/319ac83c-e602-4e91-8104-2b5501380b5e.m3u8"
    },
    {
      id: "chile-90-pucon-tv",
      name: "Pucon TV",
      shortCode: "PT",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Pucon TV",
      videoUrl: "https://redirector.dps.live/hls/pucontv/playlist.m3u8"
    },
    {
      id: "chile-91-puranoticia",
      name: "Puranoticia",
      shortCode: "P",
      country: "Chile 🇨🇱",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Puranoticia",
      videoUrl: "https://pnt.janusmedia.tv/hls/pnt.m3u8"
    },
    {
      id: "chile-92-radio-america-tv",
      name: "Radio America TV",
      shortCode: "RAT",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio America TV",
      videoUrl: "https://v2.tustreaming.cl/americamovil/index.m3u8"
    },
    {
      id: "chile-93-radio-ancoa",
      name: "Radio Ancoa",
      shortCode: "RA",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Ancoa",
      videoUrl: "https://v2.tustreaming.cl/radioancoatv/index.m3u8"
    },
    {
      id: "chile-94-radio-armonia",
      name: "Radio Armonia",
      shortCode: "RA",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Armonia",
      videoUrl: "https://v2.tustreaming.cl/armoniamovil/index.m3u8"
    },
    {
      id: "chile-95-radio-duna",
      name: "Radio Duna",
      shortCode: "RD",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Duna",
      videoUrl: "https://mdstrm.com/live-stream-playlist/67ed8a8d6db4af9a0188555c.m3u8"
    },
    {
      id: "chile-96-radio-el-sembrador",
      name: "Radio El Sembrador",
      shortCode: "RES",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERES%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio El Sembrador",
      videoUrl: "https://tv.arkeo.cl:1936/elsembrador/elsembrador/playlist.m3u8"
    },
    {
      id: "chile-97-radio-fantasia-tv",
      name: "Radio Fantasia TV",
      shortCode: "RFT",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERFT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Fantasia TV",
      videoUrl: "https://v2.tustreaming.cl/fantasiatv/index.m3u8"
    },
    {
      id: "chile-98-radio-la-serena-tv",
      name: "Radio La Serena TV",
      shortCode: "RLST",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERLST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio La Serena TV",
      videoUrl: "https://5ff3d9babae13.streamlock.net/chrgkqgkyb/chrgkqgkyb/playlist.m3u8"
    },
    {
      id: "chile-99-radio-nuble",
      name: "Radio Nuble",
      shortCode: "RN",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Nuble",
      videoUrl: "https://tv.telselec.cl:3376/live/nublefmlive.m3u8"
    },
    {
      id: "chile-100-radio-panoramica",
      name: "Radio Panoramica",
      shortCode: "RP",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Panoramica",
      videoUrl: "https://v2.tustreaming.cl/alingeproducciones/index.m3u8"
    },
    {
      id: "chile-101-radio-pudahuel",
      name: "Radio Pudahuel",
      shortCode: "RP",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Pudahuel",
      videoUrl: "https://unlimited2-cl-isp.dps.live/pudahueltv/pudahueltv.smil/playlist.m3u8"
    },
    {
      id: "chile-102-rtc-television",
      name: "RTC Television",
      shortCode: "RT",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de RTC Television",
      videoUrl: "https://scl.edge.grupoz.cl/rtcstreaming/live/playlist.m3u8"
    },
    {
      id: "chile-103-rtv-nuble",
      name: "RTV Nuble",
      shortCode: "RN",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de RTV Nuble",
      videoUrl: "https://tv.arkeo.cl:1936/canalrtv/canalrtv/playlist.m3u8"
    },
    {
      id: "chile-104-sabor-tv",
      name: "Sabor TV",
      shortCode: "ST",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Sabor TV",
      videoUrl: "https://v1.tustreaming.cl/sabortv/index.m3u8"
    },
    {
      id: "chile-105-san-nicolas-tv",
      name: "San Nicolas TV",
      shortCode: "SNT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESNT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de San Nicolas TV",
      videoUrl: "https://v4.tustreaming.cl/sannicolastv/index.m3u8"
    },
    {
      id: "chile-106-santa-maria-television",
      name: "Santa Maria Television",
      shortCode: "SMT",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Santa Maria Television",
      videoUrl: "https://pantera1-100gb-cl-movistar.dps.live/smtv/smtv.smil/playlist.m3u8"
    },
    {
      id: "chile-107-solo-tv",
      name: "Solo TV",
      shortCode: "ST",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Solo TV",
      videoUrl: "https://sproxy.solotv.cl/hls/live/fhd.m3u8"
    },
    {
      id: "chile-108-star-channel",
      name: "Star Channel",
      shortCode: "SC",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Star Channel",
      videoUrl: "http://138.121.15.230:9002/STAR-CHANNEL/index.m3u8"
    },
    {
      id: "chile-109-sur-tv",
      name: "SUR TV",
      shortCode: "ST",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de SUR TV",
      videoUrl: "https://surtv-2.mddsoluciones.cl/play/ZZZ-WEB-001:ULpj2JxXM9/live/surtvweb/playlist.m3u8"
    },
    {
      id: "chile-110-surena-tv",
      name: "Surena TV",
      shortCode: "ST",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Surena TV",
      videoUrl: "https://vs20.live.opencaster.com/surenatv_187f915a/index.m3u8"
    },
    {
      id: "chile-111-t-vinet",
      name: "T-Vinet",
      shortCode: "TV",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETV%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de T-Vinet",
      videoUrl: "https://unlimited1-us.dps.live/inet2/inet2.smil/playlist.m3u8"
    },
    {
      id: "chile-112-tcm",
      name: "TCM",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TCM",
      videoUrl: "https://streaming.onnethn.com/TCM_HD/playlist.m3u8"
    },
    {
      id: "chile-113-teleangol-radio",
      name: "Teleangol Radio",
      shortCode: "TR",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETR%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Teleangol Radio",
      videoUrl: "https://pantera1-100gb-cl-movistar.dps.live/teleangolradio/teleangolradio.smil/playlist.m3u8"
    },
    {
      id: "chile-114-telemundo-internacional",
      name: "Telemundo Internacional",
      shortCode: "TI",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Telemundo Internacional",
      videoUrl: "http://45.173.231.22:8000/play/a01h/index.m3u8"
    },
    {
      id: "chile-115-televida",
      name: "Televida",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Televida",
      videoUrl: "https://tls-cl.cdnz.cl/televida/live/playlist.m3u8"
    },
    {
      id: "chile-116-tendencias-prime",
      name: "Tendencias Prime",
      shortCode: "TP",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Tendencias Prime",
      videoUrl: "https://v4.tustreaming.cl/tendenciastv/index.m3u8"
    },
    {
      id: "chile-117-tevex",
      name: "Tevex",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Tevex",
      videoUrl: "https://v2.tustreaming.cl/tevex/index.m3u8"
    },
    {
      id: "chile-118-thema-television",
      name: "Thema Television",
      shortCode: "TT",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Thema Television",
      videoUrl: "https://unlimited1-us.dps.live/thema/thema.smil/playlist.m3u8"
    },
    {
      id: "chile-119-tlc",
      name: "TLC",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TLC",
      videoUrl: "http://38.134.250.110:8000/play/a00n/index.m3u8"
    },
    {
      id: "chile-120-tne",
      name: "TNE",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TNE",
      videoUrl: "https://v2.tustreaming.cl/tnetv/index.m3u8"
    },
    {
      id: "chile-121-tnt-sports",
      name: "TNT Sports",
      shortCode: "TS",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TNT Sports",
      videoUrl: "http://209.45.101.130:8040/play/a03s/index.m3u8"
    },
    {
      id: "chile-122-tooncast",
      name: "Tooncast",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Tooncast",
      videoUrl: "http://190.61.42.218:9000/play/a06i/index.m3u8"
    },
    {
      id: "chile-123-turf-movil",
      name: "Turf Movil",
      shortCode: "TM",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Turf Movil",
      videoUrl: "https://tvturf4.janus.cl/playlist/stream.m3u8?d=w&id="
    },
    {
      id: "chile-124-turismo-travel-tv",
      name: "Turismo Travel TV",
      shortCode: "TTT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETTT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Turismo Travel TV",
      videoUrl: "https://stmv3.voxtvhd.com.br/turismotraveltv/turismotraveltv/playlist.m3u8"
    },
    {
      id: "chile-125-turno",
      name: "Turno",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Turno",
      videoUrl: "https://redirector.dps.live/hls/turno/playlist.m3u8"
    },
    {
      id: "chile-126-tv5-linares",
      name: "TV5 Linares",
      shortCode: "TL",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV5 Linares",
      videoUrl: "https://v1.tustreaming.cl/tv5linares/index.m3u8"
    },
    {
      id: "chile-127-tv-senado",
      name: "TV Senado",
      shortCode: "TS",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Senado",
      videoUrl: "https://janus-tv-ply.senado.cl/playlist/playlist.m3u8"
    },
    {
      id: "chile-128-tv-usach",
      name: "TV Usach",
      shortCode: "TU",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Usach",
      videoUrl: "https://stv4.janus.cl/playlist/stream.m3u8"
    },
    {
      id: "chile-129-tvn3",
      name: "TVN3",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TVN3",
      videoUrl: "https://mdstrm.com/live-stream-playlist/5653641561b4eba30a7e4929.m3u8"
    },
    {
      id: "chile-130-tvn",
      name: "TVN",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TVN",
      videoUrl: "http://15.204.246.24:8080/TVNHD/index.m3u8"
    },
    {
      id: "chile-131-tvr",
      name: "TVR",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TVR",
      videoUrl: "https://unlimited1-us.dps.live/tvr/tvr.smil/playlist.m3u8"
    },
    {
      id: "chile-132-tvu",
      name: "TVU",
      shortCode: "T",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TVU",
      videoUrl: "https://unlimited1-cl-isp.dps.live/tvu/tvu.smil/playlist.m3u8"
    },
    {
      id: "chile-133-u-los-lagos-tv",
      name: "U Los Lagos TV",
      shortCode: "ULLT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EULLT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de U Los Lagos TV",
      videoUrl: "http://tv.ulagos.cl/web/live.m3u8"
    },
    {
      id: "chile-134-ucv-tv",
      name: "UCV TV",
      shortCode: "UT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de UCV TV",
      videoUrl: "https://unlimited2-cl-isp.dps.live/ucvtv2/ucvtv2.smil/playlist.m3u8"
    },
    {
      id: "chile-135-uniregion-tv",
      name: "Uniregion TV",
      shortCode: "UT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Uniregion TV",
      videoUrl: "https://5ff3d9babae13.streamlock.net/ubyecbxnfd/ubyecbxnfd/playlist.m3u8"
    },
    {
      id: "chile-136-utalca",
      name: "UTalca",
      shortCode: "U",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de UTalca",
      videoUrl: "https://unlimited1-us.dps.live/campustv/campustv.smil/campustv/livestream1/chunks.m3u8"
    },
    {
      id: "chile-137-utv",
      name: "UTV",
      shortCode: "U",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de UTV",
      videoUrl: "https://v2.tustreaming.cl/utv/index.m3u8"
    },
    {
      id: "chile-138-v-classic-tv",
      name: "V Classic TV",
      shortCode: "VCT",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVCT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de V Classic TV",
      videoUrl: "http://186.148.196.100:8000/play/a02z"
    },
    {
      id: "chile-139-via-x",
      name: "Via X",
      shortCode: "VX",
      country: "Chile 🇨🇱",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVX%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Via X",
      videoUrl: "http://45.170.130.224:8000/play/a025/index.m3u8"
    },
    {
      id: "chile-140-vision-plus",
      name: "Vision Plus",
      shortCode: "VP",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Vision Plus",
      videoUrl: "https://5ff3d9babae13.streamlock.net/jwagpqxehu/jwagpqxehu/playlist.m3u8"
    },
    {
      id: "chile-141-vtv-valle-de-aconcagua",
      name: "VTV Valle de Aconcagua",
      shortCode: "VVDA",
      country: "Chile 🇨🇱",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVVDA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de VTV Valle de Aconcagua",
      videoUrl: "https://unlimited1-us.dps.live/vtv/vtv.smil/playlist.m3u8"
    },
    {
      id: "perú-142-36-tv-huacho",
      name: "36 TV Huacho",
      shortCode: "36T",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E36T%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 36 TV Huacho",
      videoUrl: "https://live-evg10.tv360.bitel.com.pe/bitel/36tvSRT/playlist.m3u8"
    },
    {
      id: "perú-143-a-e",
      name: "A&E",
      shortCode: "AE",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAE%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de A&E",
      videoUrl: "http://138.121.15.230:9002/A&E/index.m3u8"
    },
    {
      id: "perú-144-abtelevision",
      name: "ABTelevision",
      shortCode: "A",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ABTelevision",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/abctelevisionSRT/playlist.m3u8"
    },
    {
      id: "perú-145-agro-tv",
      name: "Agro TV",
      shortCode: "AT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Agro TV",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/agroSRT/playlist.m3u8"
    },
    {
      id: "perú-146-amazonica-tv",
      name: "Amazonica TV",
      shortCode: "AT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Amazonica TV",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/amazonicatvSRT/playlist.m3u8"
    },
    {
      id: "perú-147-america-tv",
      name: "AMERICA TV",
      shortCode: "AT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AMERICA TV",
      videoUrl: "http://190.93.224.42/AMERICA-TV/index.m3u8"
    },
    {
      id: "perú-148-andes-television",
      name: "Andes Television",
      shortCode: "AT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Andes Television",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/andestvSRT/playlist.m3u8"
    },
    {
      id: "perú-149-antena-sur",
      name: "Antena SUR",
      shortCode: "AS",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Antena SUR",
      videoUrl: "https://cloudpro.servidoresdestream.com:8081/8010/index.m3u8"
    },
    {
      id: "perú-150-asiritv",
      name: "AsiriTV",
      shortCode: "A",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AsiriTV",
      videoUrl: "https://video2.lhdserver.es/asiritv/live.m3u8"
    },
    {
      id: "perú-151-atv",
      name: "ATV",
      shortCode: "A",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ATV",
      videoUrl: "http://190.93.224.42/ATV/index.m3u8"
    },
    {
      id: "perú-152-atv-sur",
      name: "ATV SUR",
      shortCode: "AS",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ATV SUR",
      videoUrl: "http://190.93.224.42/ATV-SUR/index.m3u8"
    },
    {
      id: "perú-153-atv",
      name: "ATV+",
      shortCode: "A",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ATV+",
      videoUrl: "http://45.171.108.253:8888/ATV/index.m3u8"
    },
    {
      id: "perú-154-autentica",
      name: "Autentica",
      shortCode: "A",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Autentica",
      videoUrl: "https://live.obslivestream.com/autenticatvmux/index.m3u8"
    },
    {
      id: "perú-155-axn",
      name: "AXN",
      shortCode: "A",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AXN",
      videoUrl: "http://181.78.8.199:8000/play/a0cu/index.m3u8"
    },
    {
      id: "perú-156-bella-abanquina",
      name: "Bella Abanquina",
      shortCode: "BA",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Bella Abanquina",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/bellaabanquinaSRT/playlist.m3u8"
    },
    {
      id: "perú-157-bethel",
      name: "Bethel",
      shortCode: "B",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EB%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Bethel",
      videoUrl: "https://alfa.betheltv.tv/srt/3_abr/playlist.m3u8"
    },
    {
      id: "perú-158-bicolor-premium",
      name: "Bicolor+ Premium",
      shortCode: "BP",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Bicolor+ Premium",
      videoUrl: "https://live-evg10.tv360.bitel.com.pe/bitel/bicolorpremium_abr/bitel/bicolorpremium_720p/chunks.m3u8"
    },
    {
      id: "perú-159-bnb-digital",
      name: "BNB Digital",
      shortCode: "BD",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de BNB Digital",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/bnbSRT/playlist.m3u8"
    },
    {
      id: "perú-160-cadena-tv",
      name: "Cadena TV",
      shortCode: "CT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cadena TV",
      videoUrl: "https://tv.bitstreaming.net:3789/live/cdntvlive.m3u8"
    },
    {
      id: "perú-161-cajamarca-tv",
      name: "Cajamarca TV",
      shortCode: "CT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cajamarca TV",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/cajamarcatvSRT/playlist.m3u8"
    },
    {
      id: "perú-162-canal-8-catacaos",
      name: "Canal 8 Catacaos",
      shortCode: "C8C",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC8C%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 8 Catacaos",
      videoUrl: "https://live.obslivestream.com/canal8/index.m3u8"
    },
    {
      id: "perú-163-canal-21-huancayo",
      name: "Canal 21 Huancayo",
      shortCode: "C2H",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2H%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 21 Huancayo",
      videoUrl: "https://play.agenciastreaming.com:8081/tvwanka/tracks-v1/index.fmp4.m3u8"
    },
    {
      id: "perú-164-canal-25-ayacucho",
      name: "Canal 25 Ayacucho",
      shortCode: "C2A",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2A%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 25 Ayacucho",
      videoUrl: "https://live-evg10.tv360.bitel.com.pe/bitel/canal25ayacucho/playlist.m3u8"
    },
    {
      id: "perú-165-canal-ipe",
      name: "Canal IPe",
      shortCode: "CI",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal IPe",
      videoUrl: "http://187.102.210.46/IPE/index.m3u8"
    },
    {
      id: "perú-166-canal-m-television",
      name: "CANAL M Television",
      shortCode: "CMT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de CANAL M Television",
      videoUrl: "https://live-evg10.tv360.bitel.com.pe/bitel/anqaratv/playlist.m3u8"
    },
    {
      id: "perú-167-casma-tv",
      name: "Casma TV",
      shortCode: "CT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Casma TV",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/casmatvSRT-TRA/playlist.m3u8"
    },
    {
      id: "perú-168-cinecanal-pacific",
      name: "Cinecanal Pacific",
      shortCode: "CP",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cinecanal Pacific",
      videoUrl: "http://138.121.15.230:9002/CINECANAL/index.m3u8"
    },
    {
      id: "perú-169-conecta2tv",
      name: "Conecta2TV",
      shortCode: "C",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Conecta2TV",
      videoUrl: "https://live.obslivestream.com/conecta2/index.m3u8"
    },
    {
      id: "perú-170-controversia-tv",
      name: "Controversia TV",
      shortCode: "CT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Controversia TV",
      videoUrl: "https://live.obslivestream.com/controversiatv/index.m3u8"
    },
    {
      id: "perú-171-cr-television",
      name: "CR Television",
      shortCode: "CT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de CR Television",
      videoUrl: "https://live.obslivestream.com/crtvmux/index.m3u8"
    },
    {
      id: "perú-172-dac-tv",
      name: "Dac TV",
      shortCode: "DT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Dac TV",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/dactvSRT/playlist.m3u8"
    },
    {
      id: "perú-173-deltatv",
      name: "DeltaTV",
      shortCode: "D",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ED%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de DeltaTV",
      videoUrl: "https://tv2.bitstreaming.net:3539/live/deltanetlive.m3u8"
    },
    {
      id: "perú-174-espn-2",
      name: "ESPN 2",
      shortCode: "E2",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE2%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN 2",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_2/ESPN_2.isml/ESPN_2.m3u8"
    },
    {
      id: "perú-175-espn-4",
      name: "ESPN 4",
      shortCode: "E4",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE4%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN 4",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_4/ESPN_4.isml/ESPN_4.m3u8"
    },
    {
      id: "perú-176-espn-5",
      name: "ESPN 5",
      shortCode: "E5",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE5%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN 5",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_5/ESPN_5.isml/ESPN_5.m3u8"
    },
    {
      id: "perú-177-espn-6",
      name: "ESPN 6",
      shortCode: "E6",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE6%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN 6",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_6/ESPN_6.isml/ESPN_6.m3u8"
    },
    {
      id: "perú-178-espn-7",
      name: "ESPN 7",
      shortCode: "E7",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE7%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN 7",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN_7/ESPN_7.isml/ESPN_7.m3u8"
    },
    {
      id: "perú-179-espn",
      name: "ESPN",
      shortCode: "E",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN/ESPN.isml/ESPN.m3u8"
    },
    {
      id: "perú-180-folklore-tv",
      name: "Folklore TV",
      shortCode: "FT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Folklore TV",
      videoUrl: "https://play.folkloretv.pe/StreamSD/index.m3u8"
    },
    {
      id: "perú-181-foro-tv",
      name: "Foro TV",
      shortCode: "FT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Foro TV",
      videoUrl: "https://mc.servidor.stream:19360/8274/8274.m3u8"
    },
    {
      id: "perú-182-fx",
      name: "FX",
      shortCode: "F",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de FX",
      videoUrl: "http://15.204.246.24:8080/FXHD/index.m3u8"
    },
    {
      id: "perú-183-genios-tv",
      name: "Genios TV",
      shortCode: "GT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EGT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Genios TV",
      videoUrl: "https://sc3.wasidata.com/Genios2_1902/video.m3u8"
    },
    {
      id: "perú-184-global-tv",
      name: "Global TV",
      shortCode: "GT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EGT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Global TV",
      videoUrl: "http://190.93.224.42/GLOBAL/index.m3u8"
    },
    {
      id: "perú-185-history",
      name: "History",
      shortCode: "H",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EH%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de History",
      videoUrl: "http://15.204.246.24:8080/HistoryHD/index.m3u8"
    },
    {
      id: "perú-186-huacho-peru-tv",
      name: "Huacho Peru TV",
      shortCode: "HPT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EHPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Huacho Peru TV",
      videoUrl: "https://tv.huachotv.com/stream.m3u8"
    },
    {
      id: "perú-187-impacto-television",
      name: "Impacto Television",
      shortCode: "IT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EIT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Impacto Television",
      videoUrl: "https://cloudvideo.servers10.com:8081/impactotv/index.m3u8"
    },
    {
      id: "perú-188-imperial-television",
      name: "Imperial Television",
      shortCode: "IT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EIT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Imperial Television",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/imperialSRT/playlist.m3u8"
    },
    {
      id: "perú-189-intuitiva-tv",
      name: "Intuitiva TV",
      shortCode: "IT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EIT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Intuitiva TV",
      videoUrl: "https://video2.lhdserver.es/cableperu/live.m3u8"
    },
    {
      id: "perú-190-justicia-tv",
      name: "JUSTICIA TV",
      shortCode: "JT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EJT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de JUSTICIA TV",
      videoUrl: "http://190.93.224.42/JUSTICIA-TV/index.m3u8"
    },
    {
      id: "perú-191-karibena",
      name: "Karibena",
      shortCode: "K",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EK%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Karibena",
      videoUrl: "http://187.102.210.46/KARIBENA/index.m3u8"
    },
    {
      id: "perú-192-l1-max",
      name: "L1 Max",
      shortCode: "LM",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de L1 Max",
      videoUrl: "http://190.93.224.42/LIGA-1-MAX/index.m3u8"
    },
    {
      id: "perú-193-la-fabulosa-tv",
      name: "La Fabulosa TV",
      shortCode: "LFT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELFT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Fabulosa TV",
      videoUrl: "https://eu1.servers10.com:8081/8004/index.m3u8"
    },
    {
      id: "perú-194-la-tele",
      name: "La Tele",
      shortCode: "LT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La Tele",
      videoUrl: "http://190.93.224.42/LA-TELE/index.m3u8"
    },
    {
      id: "perú-195-latina",
      name: "Latina",
      shortCode: "L",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Latina",
      videoUrl: "http://190.93.224.42/LATINA/index.m3u8"
    },
    {
      id: "perú-196-master-tv",
      name: "Master TV",
      shortCode: "MT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Master TV",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/mastertvSRT/playlist.m3u8"
    },
    {
      id: "perú-197-metropolitana-del-cuzco",
      name: "Metropolitana del Cuzco",
      shortCode: "MDC",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMDC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Metropolitana del Cuzco",
      videoUrl: "https://video1.earthcam.com/myearthcam/075ff02f78c35af55564cf3af3b3f750.flv/playlist.m3u8"
    },
    {
      id: "perú-198-milenial-tv",
      name: "Milenial TV",
      shortCode: "MT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Milenial TV",
      videoUrl: "https://www.milenial.news/salida/milenial.m3u8"
    },
    {
      id: "perú-199-millenium-109-fm",
      name: "Millenium 109 FM",
      shortCode: "M1F",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EM1F%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Millenium 109 FM",
      videoUrl: "https://videoserver.tmcreativos.com:19360/nqvnhujhrx/nqvnhujhrx.m3u8"
    },
    {
      id: "perú-200-monterrico-tv",
      name: "Monterrico TV",
      shortCode: "MT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Monterrico TV",
      videoUrl: "https://h.jcp.live.opencaster.com/play_src/index.m3u8"
    },
    {
      id: "perú-201-nativa-tv",
      name: "NATIVA TV",
      shortCode: "NT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de NATIVA TV",
      videoUrl: "http://187.102.210.46/NATIVATV/index.m3u8"
    },
    {
      id: "perú-202-nzk-television",
      name: "NZK Television",
      shortCode: "NT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de NZK Television",
      videoUrl: "https://eu1.servers10.com:8081/8258/index.m3u8"
    },
    {
      id: "perú-203-onda-digital",
      name: "ONDA DIGITAL",
      shortCode: "OD",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EOD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ONDA DIGITAL",
      videoUrl: "https://tv.ondadigital.pe/ondadigital/index.m3u8"
    },
    {
      id: "perú-204-onda-tv-peru",
      name: "Onda TV (Peru)",
      shortCode: "OTP",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EOTP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Onda TV (Peru)",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/onda/playlist.m3u8"
    },
    {
      id: "perú-205-ovacion-tv",
      name: "Ovacion TV",
      shortCode: "OT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EOT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Ovacion TV",
      videoUrl: "http://cdn2.ujjina.com:1935/iptvovacion1/liveovacion1tv/playlist.m3u8"
    },
    {
      id: "perú-206-ozono-tv",
      name: "Ozono TV",
      shortCode: "OT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EOT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Ozono TV",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/ozonotv/playlist.m3u8"
    },
    {
      id: "perú-207-pakapaka",
      name: "Pakapaka",
      shortCode: "P",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Pakapaka",
      videoUrl: "http://138.59.227.20:8000/play/a05t/index.m3u8"
    },
    {
      id: "perú-208-panamericana-tv",
      name: "Panamericana TV",
      shortCode: "PT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Panamericana TV",
      videoUrl: "http://45.171.108.253:8888/PANAMERICANA/index.m3u8"
    },
    {
      id: "perú-209-pbo",
      name: "PBO",
      shortCode: "P",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de PBO",
      videoUrl: "http://190.93.224.42/PBO/index.m3u8"
    },
    {
      id: "perú-210-peques-tv",
      name: "Peques TV",
      shortCode: "PT",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Peques TV",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/pequestv/playlist.m3u8"
    },
    {
      id: "perú-211-piuratv",
      name: "PiuraTV",
      shortCode: "P",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de PiuraTV",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/piuratvSRT/playlist.m3u8"
    },
    {
      id: "perú-212-planea-tv",
      name: "Planea TV",
      shortCode: "PT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Planea TV",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/planeatvSRT/playlist.m3u8"
    },
    {
      id: "perú-213-primavera-15",
      name: "Primavera 15",
      shortCode: "P1",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EP1%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Primavera 15",
      videoUrl: "https://mc.servidor.stream:19360/8244/8244.m3u8"
    },
    {
      id: "perú-214-qollasuyo-tv",
      name: "Qollasuyo TV",
      shortCode: "QT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EQT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Qollasuyo TV",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/qollasuyotv/playlist.m3u8"
    },
    {
      id: "perú-215-qosqo-times",
      name: "Qosqo Times",
      shortCode: "QT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EQT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Qosqo Times",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/qosqo/playlist.m3u8"
    },
    {
      id: "perú-216-radio-master",
      name: "Radio Master",
      shortCode: "RM",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Master",
      videoUrl: "https://videoserver.tmcreativos.com:19360/radiomaster/radiomaster.m3u8"
    },
    {
      id: "perú-217-radio-onda-digital",
      name: "Radio Onda Digital",
      shortCode: "ROD",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EROD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Onda Digital",
      videoUrl: "https://live.ondadigitaltv.com/RADIOODTV/index.m3u8"
    },
    {
      id: "perú-218-radio-tropical",
      name: "Radio Tropical",
      shortCode: "RT",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Tropical",
      videoUrl: "https://videoserver.tmcreativos.com:19360/raditropical/raditropical.m3u8"
    },
    {
      id: "perú-219-radio-uno-tacna",
      name: "Radio Uno Tacna",
      shortCode: "RUT",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Uno Tacna",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/radiounotv/playlist.m3u8"
    },
    {
      id: "perú-220-radiotv-oriente",
      name: "RadioTV Oriente",
      shortCode: "RO",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERO%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de RadioTV Oriente",
      videoUrl: "https://live.obslivestream.com/tvoriente/index.m3u8"
    },
    {
      id: "perú-221-real-television",
      name: "Real Television",
      shortCode: "RT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Real Television",
      videoUrl: "https://live-evg10.tv360.bitel.com.pe/bitel/realtv/playlist.m3u8"
    },
    {
      id: "perú-222-region-tv-callao",
      name: "Region TV Callao",
      shortCode: "RTC",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERTC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Region TV Callao",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/regiontvSRT/playlist.m3u8"
    },
    {
      id: "perú-223-rn-television",
      name: "RN Television",
      shortCode: "RT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de RN Television",
      videoUrl: "https://videoserver.tmcreativos.com:19360/rnyurimaguas/rnyurimaguas.m3u8"
    },
    {
      id: "perú-224-rpp-tv",
      name: "RPP TV",
      shortCode: "RT",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de RPP TV",
      videoUrl: "http://190.93.224.42/RPP/index.m3u8"
    },
    {
      id: "perú-225-rselvatv",
      name: "RSelvaTV",
      shortCode: "R",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ER%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de RSelvaTV",
      videoUrl: "https://live-evg11.tv360.bitel.com.pe/bitel/selvaticaSRT/playlist.m3u8"
    },
    {
      id: "perú-226-rtp",
      name: "RTP",
      shortCode: "R",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ER%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de RTP",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/rtp/playlist.m3u8"
    },
    {
      id: "perú-227-rumbamix",
      name: "RumbaMix",
      shortCode: "R",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ER%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de RumbaMix",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/mixtvSRT/playlist.m3u8"
    },
    {
      id: "perú-228-rumbo-minero",
      name: "Rumbo Minero",
      shortCode: "RM",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Rumbo Minero",
      videoUrl: "http://45.70.201.81:8000/play/a018/index.m3u8"
    },
    {
      id: "perú-229-senal-peru-tv",
      name: "Senal Peru TV",
      shortCode: "SPT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Senal Peru TV",
      videoUrl: "https://livestream.perucast.com/hls/stream.m3u8"
    },
    {
      id: "perú-230-siscom-tv",
      name: "Siscom TV",
      shortCode: "ST",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Siscom TV",
      videoUrl: "https://video2.lhdserver.es/siscomtv/live.m3u8"
    },
    {
      id: "perú-231-soltv",
      name: "SolTV",
      shortCode: "S",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ES%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de SolTV",
      videoUrl: "https://5790d294af2dc.streamlock.net/streamtv/streamtv/playlist.m3u8"
    },
    {
      id: "perú-232-space",
      name: "Space",
      shortCode: "S",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ES%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Space",
      videoUrl: "http://45.171.64.30:6060/play/a04n/index.m3u8"
    },
    {
      id: "perú-233-sqala-tv",
      name: "Sqala TV",
      shortCode: "ST",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Sqala TV",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/studiotvhuanta/playlist.m3u8"
    },
    {
      id: "perú-234-star",
      name: "Star",
      shortCode: "S",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ES%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Star",
      videoUrl: "http://15.204.246.24:8080/STARCHANNELHD/index.m3u8"
    },
    {
      id: "perú-235-studio-pasco",
      name: "Studio Pasco",
      shortCode: "SP",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Studio Pasco",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/studiopasco/playlist.m3u8"
    },
    {
      id: "perú-236-studio-universal",
      name: "Studio Universal",
      shortCode: "SU",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Studio Universal",
      videoUrl: "http://15.204.246.24:8080/StudioUniversalHD/index.m3u8"
    },
    {
      id: "perú-237-super-canal",
      name: "Super Canal",
      shortCode: "SC",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Super Canal",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/supercanalSRT/playlist.m3u8"
    },
    {
      id: "perú-238-telesystem-tv",
      name: "Telesystem TV",
      shortCode: "TT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Telesystem TV",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/telesystemSRT/playlist.m3u8"
    },
    {
      id: "perú-239-television-tarapoto",
      name: "Television Tarapoto",
      shortCode: "TT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Television Tarapoto",
      videoUrl: "http://45.5.57.58:8000/play/a038/index.m3u8"
    },
    {
      id: "perú-240-teve-empresa",
      name: "Teve Empresa",
      shortCode: "TE",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETE%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Teve Empresa",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/tvempresaSRT/playlist.m3u8"
    },
    {
      id: "perú-241-top-latino",
      name: "TOP LATINO",
      shortCode: "TL",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TOP LATINO",
      videoUrl: "http://38.87.224.20:2220/play/a02b/index.m3u8"
    },
    {
      id: "perú-242-trivunoticias",
      name: "TrivuNoticias",
      shortCode: "T",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TrivuNoticias",
      videoUrl: "http://190.93.224.42/TRIVU-TV/index.m3u8"
    },
    {
      id: "perú-243-turbo-mix-radio-tv",
      name: "Turbo Mix Radio TV",
      shortCode: "TMRT",
      country: "Perú 🇵🇪",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETMRT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Turbo Mix Radio TV",
      videoUrl: "https://live-evg11.tv360.bitel.com.pe/bitel/turbomixSRT/playlist.m3u8"
    },
    {
      id: "perú-244-tv-bella-asuncion",
      name: "TV Bella Asuncion",
      shortCode: "TBA",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETBA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Bella Asuncion",
      videoUrl: "https://s2.tvdatta.com:3687/hybrid/play.m3u8"
    },
    {
      id: "perú-245-tv-cosmos",
      name: "TV Cosmos",
      shortCode: "TC",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Cosmos",
      videoUrl: "https://videoserver.tmcreativos.com:19360/tvcosmos/tvcosmos.m3u8"
    },
    {
      id: "perú-246-tv-mar",
      name: "TV MAR",
      shortCode: "TM",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV MAR",
      videoUrl: "https://live-evg11.tv360.bitel.com.pe/bitel/tvmarSRT/playlist.m3u8"
    },
    {
      id: "perú-247-tv-norte-chiclayo",
      name: "TV Norte Chiclayo",
      shortCode: "TNC",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETNC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Norte Chiclayo",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/tvnorte/playlist.m3u8"
    },
    {
      id: "perú-248-tv-peru",
      name: "TV Peru",
      shortCode: "TP",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Peru",
      videoUrl: "http://181.224.200.5:2277/play/a0dx/index.m3u8"
    },
    {
      id: "perú-249-tv-peru-noticias",
      name: "TV PERU NOTICIAS",
      shortCode: "TPN",
      country: "Perú 🇵🇪",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETPN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV PERU NOTICIAS",
      videoUrl: "http://190.93.224.42/TV-PERU-NOTICIAS/index.m3u8"
    },
    {
      id: "perú-250-tv-peruanisima",
      name: "TV Peruanisima",
      shortCode: "TP",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Peruanisima",
      videoUrl: "https://k20.usastreams.com:8081/tvperuanisima/index.m3u8"
    },
    {
      id: "perú-251-tv-chincha",
      name: "TV+ Chincha",
      shortCode: "TC",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV+ Chincha",
      videoUrl: "https://live-evg11.tv360.bitel.com.pe/bitel/tvchincha/playlist.m3u8"
    },
    {
      id: "perú-252-tvenlinea",
      name: "TVenLinea",
      shortCode: "T",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TVenLinea",
      videoUrl: "https://srt.tvdatta.com/tvenlinea/index.m3u8"
    },
    {
      id: "perú-253-karibtv",
      name: "karibtv",
      shortCode: "K",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EK%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de karibtv",
      videoUrl: "https://streamtv.onliv3.online:1936/karibtv/karibtv/playlist.m3u8"
    },
    {
      id: "perú-254-ucayalina-de-television",
      name: "Ucayalina de Television",
      shortCode: "UDT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUDT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Ucayalina de Television",
      videoUrl: "https://live-evg11.tv360.bitel.com.pe/bitel/utv/playlist.m3u8"
    },
    {
      id: "perú-255-unicentro-tv",
      name: "Unicentro TV",
      shortCode: "UT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Unicentro TV",
      videoUrl: "https://live-evg11.tv360.bitel.com.pe/bitel/unicentroSRT/playlist.m3u8"
    },
    {
      id: "perú-256-unitel-peru",
      name: "Unitel (Peru)",
      shortCode: "UP",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Unitel (Peru)",
      videoUrl: "https://play.agenciastreaming.com:8081/uniteltv/index.m3u8"
    },
    {
      id: "perú-257-universal-tv",
      name: "Universal TV",
      shortCode: "UT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Universal TV",
      videoUrl: "http://15.204.246.24:8080/UniversalHD/index.m3u8"
    },
    {
      id: "perú-258-uranio-tv",
      name: "Uranio TV",
      shortCode: "UT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Uranio TV",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/uranioyurimaguasSRT/playlist.m3u8"
    },
    {
      id: "perú-259-usmptv",
      name: "USMPTV",
      shortCode: "U",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de USMPTV",
      videoUrl: "http://187.102.210.46/USMP/index.m3u8"
    },
    {
      id: "perú-260-via-altomayo",
      name: "Via Altomayo",
      shortCode: "VA",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Via Altomayo",
      videoUrl: "https://live.obslivestream.com/viaaltomayomux/index.m3u8"
    },
    {
      id: "perú-261-via-television",
      name: "Via Television",
      shortCode: "VT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Via Television",
      videoUrl: "https://videoserver.tmcreativos.com:19360/cablerasvia/cablerasvia.m3u8"
    },
    {
      id: "perú-262-vision-sur",
      name: "Vision Sur",
      shortCode: "VS",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Vision Sur",
      videoUrl: "https://live-evg8.tv360.bitel.com.pe/bitel/visionsur/playlist.m3u8"
    },
    {
      id: "perú-263-viva-tv-yurimaguas",
      name: "Viva TV Yurimaguas",
      shortCode: "VTY",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVTY%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Viva TV Yurimaguas",
      videoUrl: "https://live.obslivestream.com/vivatv/index.m3u8"
    },
    {
      id: "perú-264-vnp",
      name: "VNP",
      shortCode: "V",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EV%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de VNP",
      videoUrl: "https://videoserver.tmcreativos.com:19360/visionnoticias/visionnoticias.m3u8"
    },
    {
      id: "perú-265-vr-canal-21-nasca",
      name: "VR Canal 21 Nasca",
      shortCode: "VC2N",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EVC2N%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de VR Canal 21 Nasca",
      videoUrl: "https://live-evg10.tv360.bitel.com.pe/bitel/nasca/playlist.m3u8"
    },
    {
      id: "perú-266-wayra-tv",
      name: "Wayra TV",
      shortCode: "WT",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EWT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Wayra TV",
      videoUrl: "https://live-evg11.tv360.bitel.com.pe/bitel/wayratv/playlist.m3u8"
    },
    {
      id: "perú-267-west",
      name: "WEST",
      shortCode: "W",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EW%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de WEST",
      videoUrl: "https://cablered.iptvperu.tv:1936/cablered/west/playlist.m3u8"
    },
    {
      id: "perú-268-wtv",
      name: "Wtv",
      shortCode: "W",
      country: "Perú 🇵🇪",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EW%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Wtv",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/ncanalSRT/playlist.m3u8"
    },
    {
      id: "perú-269-yurimaguas-tv",
      name: "Yurimaguas TV",
      shortCode: "YT",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EYT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Yurimaguas TV",
      videoUrl: "https://live-evg7.tv360.bitel.com.pe/bitel/yurimaguastvSRT/playlist.m3u8"
    },
    {
      id: "perú-270-yurivision",
      name: "Yurivision",
      shortCode: "Y",
      country: "Perú 🇵🇪",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EY%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Yurivision",
      videoUrl: "https://live-evg5.tv360.bitel.com.pe/bitel/yurivisionSRT/playlist.m3u8"
    },
    {
      id: "argentina-271-5tv",
      name: "5tv",
      shortCode: "5TV",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E5TV%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 5tv",
      videoUrl: "https://617c5175c970b.streamlock.net:4444/tvcinco/live1/playlist.m3u8"
    },
    {
      id: "argentina-272-24-7",
      name: "24/7",
      shortCode: "247",
      country: "Argentina 🇦🇷",
      category: "Noticias",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E247%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 24/7",
      videoUrl: "https://panel.host-live.com:19360/cn247tv/cn247tv.m3u8"
    },
    {
      id: "argentina-273-a24",
      name: "A24",
      shortCode: "A",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de A24",
      videoUrl: "http://138.59.227.20:8000/play/a05u/index.m3u8"
    },
    {
      id: "argentina-274-abtv-bariloche",
      name: "ABTV Bariloche",
      shortCode: "AB",
      country: "Argentina 🇦🇷",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAB%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ABTV Bariloche",
      videoUrl: "https://videostream.shockmedia.com.ar/hls/abtvbariloche/abtvbariloche.m3u8"
    },
    {
      id: "argentina-275-aire-de-santa-fe",
      name: "Aire de Santa Fe",
      shortCode: "ADSF",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EADSF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Aire de Santa Fe",
      videoUrl: "https://mdstrm.com/live-stream-playlist/6931a0eb06778645348008e0.m3u8"
    },
    {
      id: "argentina-276-allegro-hd",
      name: "Allegro HD",
      shortCode: "AH",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAH%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Allegro HD",
      videoUrl: "http://158.172.155.130:8000/play/a0dn/index.m3u8"
    },
    {
      id: "argentina-277-alternatv",
      name: "AlternaTV",
      shortCode: "A",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AlternaTV",
      videoUrl: "https://tv.alterna.ar/stream/hls/live.m3u8"
    },
    {
      id: "argentina-278-amc",
      name: "AMC",
      shortCode: "A",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AMC",
      videoUrl: "http://15.204.246.24:8080/AMCHD/index.m3u8"
    },
    {
      id: "argentina-279-amc-series",
      name: "AMC Series",
      shortCode: "AS",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AMC Series",
      videoUrl: "http://45.171.64.30:6060/play/a005/index.m3u8"
    },
    {
      id: "argentina-280-america-tv",
      name: "America TV",
      shortCode: "AT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de America TV",
      videoUrl: "https://prepublish.f.qaotic.net/a07/americahls-100056/playlist_720p.m3u8"
    },
    {
      id: "argentina-281-argentinisima-satelital",
      name: "Argentinisima Satelital",
      shortCode: "AS",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Argentinisima Satelital",
      videoUrl: "https://stream1.sersat.com/hls/argentinisima.m3u8"
    },
    {
      id: "argentina-282-bayres-tv",
      name: "Bayres TV",
      shortCode: "BT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Bayres TV",
      videoUrl: "https://streaming01.mikrolive.tv/bayrestv/live/playlist.m3u8"
    },
    {
      id: "argentina-283-beats-radio",
      name: "Beats Radio",
      shortCode: "BR",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBR%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Beats Radio",
      videoUrl: "https://videostream.shockmedia.com.ar:19360/beatsradio/beatsradio.m3u8"
    },
    {
      id: "argentina-284-bvc",
      name: "BVC",
      shortCode: "B",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EB%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de BVC",
      videoUrl: "https://vivo.solumedia.com:19360/bvnet/bvnet.m3u8"
    },
    {
      id: "argentina-285-cable-imagen-armstrong",
      name: "Cable Imagen Armstrong",
      shortCode: "CIA",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECIA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cable Imagen Armstrong",
      videoUrl: "https://stream.arcast.com.ar/casse/casse/playlist.m3u8"
    },
    {
      id: "argentina-286-cadena103-tv",
      name: "Cadena103.TV",
      shortCode: "CT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cadena103.TV",
      videoUrl: "https://streamlov.alsolnet.com/cadena103/live/playlist.m3u8"
    },
    {
      id: "argentina-287-canal-2-gualeguay",
      name: "Canal 2 Gualeguay",
      shortCode: "C2G",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2G%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 2 Gualeguay",
      videoUrl: "https://stream.arcast.net:4443/gualeguay/gualeguay/playlist.m3u8"
    },
    {
      id: "argentina-288-canal-2-mar-del-plata",
      name: "Canal 2 Mar del Plata",
      shortCode: "C2MD",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2MD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 2 Mar del Plata",
      videoUrl: "https://tv.streamcasthd.com:3641/live/canal2mdplive.m3u8"
    },
    {
      id: "argentina-289-canal-2-misiones",
      name: "Canal 2 Misiones",
      shortCode: "C2M",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2M%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 2 Misiones",
      videoUrl: "https://nd106.republicaservers.com:4433/hls/canal2misioness/index.m3u8"
    },
    {
      id: "argentina-290-canal-3-la-pampa",
      name: "Canal 3 La Pampa",
      shortCode: "C3LP",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC3LP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 3 La Pampa",
      videoUrl: "https://stream.arcast.com.ar/c3lapampa/ngrp:c3lapampa_all/playlist.m3u8"
    },
    {
      id: "argentina-291-las-heras",
      name: "Las Heras",
      shortCode: "LH",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELH%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Las Heras",
      videoUrl: "https://stream.arcast.com.ar/canal3/canal3/playlist.m3u8"
    },
    {
      id: "argentina-292-canal-4-posadas",
      name: "Canal 4 Posadas",
      shortCode: "C4P",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC4P%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 4 Posadas",
      videoUrl: "http://190.128.214.97:64333/play/a06l/index.m3u8"
    },
    {
      id: "argentina-293-canal-4-san-juan",
      name: "Canal 4 San Juan",
      shortCode: "C4SJ",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC4SJ%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 4 San Juan",
      videoUrl: "https://streamlov.alsolnet.com/canal4sanjuan/live/playlist.m3u8"
    },
    {
      id: "argentina-294-canal-4-villa-dolores",
      name: "Canal 4 Villa Dolores",
      shortCode: "C4VD",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC4VD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 4 Villa Dolores",
      videoUrl: "https://stmvideo3.livecastv.com/canal4vd/canal4vd/playlist.m3u8"
    },
    {
      id: "argentina-295-canal-5-santa-fe",
      name: "Canal 5 Santa Fe",
      shortCode: "C5SF",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC5SF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 5 Santa Fe",
      videoUrl: "https://stream.arcast.com.ar/c5sf/c5sf/playlist.m3u8"
    },
    {
      id: "argentina-296-canal-5-tv-chepes",
      name: "Canal 5 TV Chepes",
      shortCode: "C5TC",
      country: "Argentina 🇦🇷",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC5TC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 5 TV Chepes",
      videoUrl: "https://videostream.shockmedia.com.ar:19360/canal5alfatvchepes/canal5alfatvchepes.m3u8"
    },
    {
      id: "argentina-297-canal-6",
      name: "Canal 6",
      shortCode: "C6",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC6%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 6",
      videoUrl: "https://iptv.ixfo.com.ar:30443/live/c6digital/playlist.m3u8"
    },
    {
      id: "argentina-298-canal-7-jujuy",
      name: "Canal 7 Jujuy",
      shortCode: "C7J",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7J%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 7 Jujuy",
      videoUrl: "https://stream.arcast.live/canal7jujuy/ngrp:canal7jujuy_all/playlist.m3u8"
    },
    {
      id: "argentina-299-canal-7-neuquen",
      name: "Canal 7 Neuquen",
      shortCode: "C7N",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7N%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 7 Neuquen",
      videoUrl: "https://stream.arcast.com.ar/c7nq/ngrp:c7nq_all/playlist.m3u8"
    },
    {
      id: "argentina-300-canal-7-salta",
      name: "Canal 7 Salta",
      shortCode: "C7S",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7S%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 7 Salta",
      videoUrl: "https://vivo.solumedia.com:19360/cooperativa/cooperativa.m3u8"
    },
    {
      id: "argentina-301-canal-7-tv",
      name: "Canal 7 TV",
      shortCode: "C7T",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7T%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 7 TV",
      videoUrl: "https://stream.arcast.com.ar/envivo/castv/playlist.m3u8"
    },
    {
      id: "argentina-302-canal-8-mar-del-plata",
      name: "Canal 8 Mar del Plata",
      shortCode: "C8MD",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC8MD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 8 Mar del Plata",
      videoUrl: "https://canal8mdq.unpocodeawita.workers.dev"
    },
    {
      id: "argentina-303-canal-9",
      name: "Canal 9",
      shortCode: "C9",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC9%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 9",
      videoUrl: "https://617c5175c970b.streamlock.net:4444/9linklivert/smil:9linkmultibr.smil/playlist.m3u8"
    },
    {
      id: "argentina-304-canal-12-web",
      name: "Canal 12 Web",
      shortCode: "C1W",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC1W%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 12 Web",
      videoUrl: "https://nd106.republicaservers.com:4433/c7827.mp4"
    },
    {
      id: "argentina-305-canal-13-jujuy",
      name: "Canal 13 Jujuy",
      shortCode: "C1J",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC1J%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 13 Jujuy",
      videoUrl: "https://genexservicios.com:19360/canal13jujuy/canal13jujuy.m3u8"
    },
    {
      id: "argentina-306-canal-13-la-rioja",
      name: "Canal 13 La Rioja",
      shortCode: "C1LR",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC1LR%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 13 La Rioja",
      videoUrl: "http://arcast.net:1935/mp/mp/playlist.m3u8"
    },
    {
      id: "argentina-307-canal-21-tv",
      name: "Canal 21 TV",
      shortCode: "C2T",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2T%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 21 TV",
      videoUrl: "https://iptv.ixfo.com.ar:30443/c21tv/hd/c21tv/playlist.m3u8"
    },
    {
      id: "argentina-308-canal-26",
      name: "Canal 26",
      shortCode: "C2",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 26",
      videoUrl: "https://stream-gtlc.telecentro.net.ar/hls/canal26hls/main.m3u8"
    },
    {
      id: "argentina-309-canal-79-la-costa",
      name: "Canal 79 La Costa",
      shortCode: "C7LC",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7LC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 79 La Costa",
      videoUrl: "https://streamconex.com:19360/lacosta/lacosta.m3u8"
    },
    {
      id: "argentina-310-canal-79-mar-del-plata",
      name: "Canal 79 Mar del Plata",
      shortCode: "C7MD",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7MD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 79 Mar del Plata",
      videoUrl: "https://streamconex.com:19360/mardelplata/mardelplata.m3u8"
    },
    {
      id: "argentina-311-canal-79-puan",
      name: "Canal 79 Puan",
      shortCode: "C7P",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7P%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 79 Puan",
      videoUrl: "https://streamconex.com:19360/puan/puan.m3u8"
    },
    {
      id: "argentina-312-canal-79-santa-clara-del-mar",
      name: "Canal 79 Santa Clara del Mar",
      shortCode: "C7SC",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7SC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 79 Santa Clara del Mar",
      videoUrl: "https://streamconex.com:19360/santaclara-1/santaclara-1.m3u8"
    },
    {
      id: "argentina-313-canal-orbe-21",
      name: "Canal Orbe 21",
      shortCode: "CO2",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECO2%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Orbe 21",
      videoUrl: "https://stream.arcast.net:4443/canal21/ngrp:canal21_all/playlist.m3u8"
    },
    {
      id: "argentina-314-canal-provincial",
      name: "Canal Provincial",
      shortCode: "CP",
      country: "Argentina 🇦🇷",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Provincial",
      videoUrl: "https://streaming.telered.com.ar/provincial/streaming/mystream.m3u8"
    },
    {
      id: "argentina-315-canal-pulpo-tv",
      name: "Canal Pulpo TV",
      shortCode: "CPT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Pulpo TV",
      videoUrl: "https://vs20.live.opencaster.com/canalpulpotv_bdeee6e2/index.m3u8"
    },
    {
      id: "argentina-316-santa-maria",
      name: "Santa Maria",
      shortCode: "SM",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Santa Maria",
      videoUrl: "https://streaming.telered.com.ar/santa-maria/streaming/mystream.m3u8"
    },
    {
      id: "argentina-317-showsport",
      name: "Showsport",
      shortCode: "S",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ES%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Showsport",
      videoUrl: "https://livestream.lumpentv.com.ar/hls/lumpen.m3u8"
    },
    {
      id: "argentina-318-tdc",
      name: "TDC",
      shortCode: "T",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TDC",
      videoUrl: "https://tdcserver.com:19360/tdconlione-2/tdconlione-2.m3u8"
    },
    {
      id: "argentina-319-canal-universidad",
      name: "Canal Universidad",
      shortCode: "CU",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal Universidad",
      videoUrl: "https://videostream.shockmedia.com.ar/hls/canaluniversidadmdp/canaluniversidadmdp.m3u8"
    },
    {
      id: "argentina-320-caras-tv",
      name: "Caras TV",
      shortCode: "CT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Caras TV",
      videoUrl: "https://unlimited1-us.dps.live/carastv/carastv.smil/playlist.m3u8"
    },
    {
      id: "argentina-321-catamarca-tv",
      name: "Catamarca TV",
      shortCode: "CT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Catamarca TV",
      videoUrl: "https://stream.arcast.com.ar/canal7catamarca/ngrp:canal7catamarca_all/playlist.m3u8?DVR="
    },
    {
      id: "argentina-322-celta-tv",
      name: "Celta TV",
      shortCode: "CT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Celta TV",
      videoUrl: "https://vivo.solumedia.com:19360/celta/celta.m3u8"
    },
    {
      id: "argentina-323-chamame-tv",
      name: "Chamame TV",
      shortCode: "CT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Chamame TV",
      videoUrl: "https://srv4.zcast.com.br/chamametv/chamametv/playlist.m3u8"
    },
    {
      id: "argentina-324-ciudad-tv-resistencia",
      name: "Ciudad TV Resistencia",
      shortCode: "CTR",
      country: "Argentina 🇦🇷",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECTR%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Ciudad TV Resistencia",
      videoUrl: "https://617c5175c970b.streamlock.net:4444/chacodxdtv/livenew/playlist.m3u8"
    },
    {
      id: "argentina-325-corrientes-tv",
      name: "Corrientes TV",
      shortCode: "CT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Corrientes TV",
      videoUrl: "https://617c5175c970b.streamlock.net:4444/13max2/live13maxtv2026/playlist.m3u8"
    },
    {
      id: "argentina-326-cosmos-tv",
      name: "Cosmos Tv",
      shortCode: "CT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cosmos Tv",
      videoUrl: "https://tv.mediacp.eu:19360/cosmos/cosmos.m3u8"
    },
    {
      id: "argentina-327-deportv",
      name: "DeporTV",
      shortCode: "D",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ED%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de DeporTV",
      videoUrl: "http://158.172.155.130:8000/play/a09y/index.m3u8"
    },
    {
      id: "argentina-328-discovery-channel",
      name: "Discovery Channel",
      shortCode: "DC",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Discovery Channel",
      videoUrl: "http://45.184.109.10/live/69393EAE6ADBC65A68F942022362A202/20.m3u8"
    },
    {
      id: "argentina-329-eco-tv",
      name: "Eco TV",
      shortCode: "ET",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Eco TV",
      videoUrl: "https://stream.arcast.com.ar/ecotv/ngrp:ecotv_all/playlist.m3u8"
    },
    {
      id: "argentina-330-el-gourmet-south",
      name: "El Gourmet South",
      shortCode: "EGS",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EEGS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de El Gourmet South",
      videoUrl: "https://iptv.bitred.cl/ELGOURMET_HD/index.m3u8"
    },
    {
      id: "argentina-331-el-nueve",
      name: "El Nueve",
      shortCode: "EN",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EEN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de El Nueve",
      videoUrl: "http://15.204.246.24:8080/elnueveHD/index.m3u8"
    },
    {
      id: "argentina-332-el-trece",
      name: "El Trece",
      shortCode: "ET",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de El Trece",
      videoUrl: "https://livetrx01.vodgc.net/eltrecetv/index.m3u8"
    },
    {
      id: "argentina-333-encuentro",
      name: "Encuentro",
      shortCode: "E",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EE%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Encuentro",
      videoUrl: "http://138.59.227.20:8000/play/a05s/index.m3u8"
    },
    {
      id: "argentina-334-espn-extra",
      name: "ESPN Extra",
      shortCode: "EE",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EEE%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN Extra",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN/ESPN.isml/ESPN.mpd"
    },
    {
      id: "argentina-335-espn-premiun",
      name: "ESPN PREMIUN",
      shortCode: "EP",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EEP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN PREMIUN",
      videoUrl: "http://158.172.155.130:8000/play/a0ao/index.m3u8"
    },
    {
      id: "argentina-336-fifa",
      name: "FIFA+",
      shortCode: "F",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de FIFA+",
      videoUrl: "https://6c849fb3.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctbXhfRklGQVBsdXNTcGFuaXNoLTFfSExT/playlist.m3u8"
    },
    {
      id: "argentina-337-fox-sports",
      name: "Fox Sports",
      shortCode: "FS",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Fox Sports",
      videoUrl: "http://138.59.227.20:8000/play/a085/index.m3u8"
    },
    {
      id: "argentina-338-iteltv",
      name: "ITELTV",
      shortCode: "I",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ITELTV",
      videoUrl: "https://proxystream.iteltv.com.ar/output/iteltv/playlist.m3u8"
    },
    {
      id: "argentina-339-kpop-mix",
      name: "Kpop Mix",
      shortCode: "KM",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EKM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Kpop Mix",
      videoUrl: "https://cloud.tvomix.com/KPOPMIX/index.m3u8"
    },
    {
      id: "argentina-340-la-100",
      name: "La 100",
      shortCode: "L1",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EL1%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La 100",
      videoUrl: "https://mdstrm.com/live-stream-playlist/68b74fd1d6512526f1f7c75a.m3u8"
    },
    {
      id: "argentina-341-lamil35",
      name: "LAMIL35",
      shortCode: "L",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de LAMIL35",
      videoUrl: "https://vtm2.msinteractiva.com/lamil35/lamil35/playlist.m3u8"
    },
    {
      id: "argentina-342-litus",
      name: "Litus",
      shortCode: "L",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Litus",
      videoUrl: "https://edge.enhdtv.com/litustv/index.m3u8"
    },
    {
      id: "argentina-343-mas-fm",
      name: "Mas FM",
      shortCode: "MF",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Mas FM",
      videoUrl: "https://vivo.solumedia.com:19360/masfm/masfm.m3u8"
    },
    {
      id: "argentina-344-mercurio",
      name: "Mercurio",
      shortCode: "M",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Mercurio",
      videoUrl: "https://videostream.shockmedia.com.ar/hls/mercuriotv/mercuriotv.m3u8"
    },
    {
      id: "argentina-345-metro-tv",
      name: "Metro TV",
      shortCode: "MT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Metro TV",
      videoUrl: "https://streamtv12.ddns.net:5443/LiveApp/streams/193945633734205616732920.m3u8"
    },
    {
      id: "argentina-346-misiones-cuatro",
      name: "Misiones Cuatro",
      shortCode: "MC",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Misiones Cuatro",
      videoUrl: "https://iptv.ixfo.com.ar:30443/live-HD/MISIONES4/playlist.m3u8"
    },
    {
      id: "argentina-347-multivision-federal",
      name: "Multivision Federal",
      shortCode: "MF",
      country: "Argentina 🇦🇷",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Multivision Federal",
      videoUrl: "https://videostream.shockmedia.com.ar/hls/multivisionfederal/multivisionfederal.m3u8"
    },
    {
      id: "argentina-348-musictop",
      name: "MusicTop",
      shortCode: "M",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de MusicTop",
      videoUrl: "http://190.128.214.97:64333/play/a06o/index.m3u8"
    },
    {
      id: "argentina-349-neo-tv",
      name: "Neo TV",
      shortCode: "NT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Neo TV",
      videoUrl: "https://videostream.shockmedia.com.ar:19360/neotvdigital/neotvdigital.m3u8"
    },
    {
      id: "argentina-350-neox-tv",
      name: "Neox TV",
      shortCode: "NT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Neox TV",
      videoUrl: "https://tv.streamcasthd.com:3031/live/neoxtvlive.m3u8"
    },
    {
      id: "argentina-351-net",
      name: "Net",
      shortCode: "N",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Net",
      videoUrl: "http://45.226.205.96:48000/play/a09p/index.m3u8"
    },
    {
      id: "argentina-352-ng-federal",
      name: "NG Federal",
      shortCode: "NF",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de NG Federal",
      videoUrl: "http://www.coninfo.net:1935/tvlink/live/playlist.m3u8"
    },
    {
      id: "argentina-353-plim-plim",
      name: "Plim Plim",
      shortCode: "PP",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Plim Plim",
      videoUrl: "http://45.70.168.162:1503/play/a02a/index.m3u8"
    },
    {
      id: "argentina-354-power-max",
      name: "Power Max",
      shortCode: "PM",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Power Max",
      videoUrl: "https://videostream.shockmedia.com.ar:19360/radio1045/radio1045.m3u8"
    },
    {
      id: "argentina-355-powerhd",
      name: "PowerHD",
      shortCode: "P",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de PowerHD",
      videoUrl: "https://live2.tensila.com/1-1-1.power-tv/hls/master.m3u8"
    },
    {
      id: "argentina-356-mas-musica",
      name: "MAS MUSICA",
      shortCode: "MM",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de MAS MUSICA",
      videoUrl: "http://158.172.155.130:8000/play/a00a/index.m3u8"
    },
    {
      id: "argentina-357-san-pedro-tv",
      name: "San Pedro TV",
      shortCode: "SPT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESPT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de San Pedro TV",
      videoUrl: "https://iptv.ixfo.com.ar:30443/live/sanpedrotv/playlist.m3u8"
    },
    {
      id: "argentina-358-santa-fe",
      name: "Santa Fe",
      shortCode: "SF",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Santa Fe",
      videoUrl: "https://canalsantaferts.argtelemax.workers.dev"
    },
    {
      id: "argentina-359-senillosa-tv",
      name: "Senillosa TV",
      shortCode: "ST",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Senillosa TV",
      videoUrl: "https://player.videohost.click/senillosatv/senillosatv/playlist.m3u8"
    },
    {
      id: "argentina-360-sicardi-tv",
      name: "Sicardi TV",
      shortCode: "ST",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EST%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Sicardi TV",
      videoUrl: "https://vivo.solumedia.com:19360/sicarditv/sicarditv.m3u8"
    },
    {
      id: "argentina-361-sony-channel",
      name: "Sony Channel",
      shortCode: "SC",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Sony Channel",
      videoUrl: "http://138.121.15.230:9002/SONY/index.m3u8"
    },
    {
      id: "argentina-362-studio-universal",
      name: "Studio Universal",
      shortCode: "SU",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ESU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Studio Universal",
      videoUrl: "http://45.184.109.10/live/69393EAE6ADBC65A68F942022362A202/53.m3u8"
    },
    {
      id: "argentina-363-t5",
      name: "T5",
      shortCode: "T",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de T5",
      videoUrl: "https://stream.t5satelital.blog/hls/t5satelitalweb.m3u8"
    },
    {
      id: "argentina-364-telefe",
      name: "Telefe",
      shortCode: "T",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Telefe",
      videoUrl: "http://45.173.231.22:8000/play/a053/index.m3u8"
    },
    {
      id: "argentina-365-telemax",
      name: "Telemax",
      shortCode: "T",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Telemax",
      videoUrl: "https://stream-gtlc.telecentro.net.ar/hls/telemaxhls/main.m3u8"
    },
    {
      id: "argentina-366-telemundo-internacional",
      name: "Telemundo Internacional",
      shortCode: "TI",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Telemundo Internacional",
      videoUrl: "http://45.173.231.22:8000/play/a01h/index.m3u8"
    },
    {
      id: "argentina-367-telesol",
      name: "Telesol",
      shortCode: "T",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Telesol",
      videoUrl: "https://cdn1.tvlin.net/open/telesol/playlist.m3u8"
    },
    {
      id: "argentina-368-tnt",
      name: "TNT",
      shortCode: "T",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TNT",
      videoUrl: "http://45.134.141.161:2200/ARG/TNT/index.m3u8"
    },
    {
      id: "argentina-369-tnt-novelas",
      name: "TNT NOVELAS",
      shortCode: "TN",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TNT NOVELAS",
      videoUrl: "http://158.172.155.130:8000/play/a0at/index.m3u8"
    },
    {
      id: "argentina-370-tnt-sports",
      name: "TNT Sports",
      shortCode: "TS",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TNT Sports",
      videoUrl: "http://45.184.109.10/live/69393EAE6ADBC65A68F942022362A202/86.m3u8"
    },
    {
      id: "argentina-371-tnt-sports",
      name: "TNT Sports",
      shortCode: "TS",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TNT Sports",
      videoUrl: "http://181.78.79.131:8000/play/a0mo"
    },
    {
      id: "argentina-372-tnt-sports-premium",
      name: "TNT Sports Premium",
      shortCode: "TSP",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETSP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TNT Sports Premium",
      videoUrl: "http://181.78.79.131:8000/play/a0q9"
    },
    {
      id: "argentina-373-tv-canal-72",
      name: "TV Canal 72",
      shortCode: "TC7",
      country: "Argentina 🇦🇷",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETC7%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Canal 72",
      videoUrl: "https://stmv1.voxtvhd.com.br/canal72tv2/canal72tv2/playlist.m3u8"
    },
    {
      id: "argentina-374-tv-mana",
      name: "TV Mana",
      shortCode: "TM",
      country: "Argentina 🇦🇷",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Mana",
      videoUrl: "https://w2.manasat.com/tvmana-ar/smil:tvmana-ar.smil/playlist.m3u8"
    },
    {
      id: "argentina-375-fueguina",
      name: "Fueguina",
      shortCode: "F",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Fueguina",
      videoUrl: "https://nd106.republicaservers.com/hls/c8094/index.m3u8"
    },
    {
      id: "argentina-376-tyc-sports",
      name: "TyC Sports",
      shortCode: "TS",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TyC Sports",
      videoUrl: "https://amg26268-amg26268c14-freelivesports-emea-10267.playouts.now.amagi.tv/ts-us-e2-n2/playlist/amg26268-sportsstudio-tycsports-freelivesportsemea/playlist.m3u8"
    },
    {
      id: "argentina-377-unife-tv",
      name: "Unife TV",
      shortCode: "UT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Unife TV",
      videoUrl: "https://cdn.mycloudstream.io/hls/live/broadcast/xundwjvp/index.m3u8"
    },
    {
      id: "argentina-378-urban-mix",
      name: "Urban Mix",
      shortCode: "UM",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Urban Mix",
      videoUrl: "https://cloud.tvomix.com/URBANMIX/index.m3u8"
    },
    {
      id: "argentina-379-xtrema-accion",
      name: "Xtrema Accion",
      shortCode: "XA",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EXA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Xtrema Accion",
      videoUrl: "https://stmv6.voxtvhd.com.br/cineaccion/cineaccion/playlist.m3u8"
    },
    {
      id: "argentina-380-xtrema-cartoons",
      name: "Xtrema Cartoons",
      shortCode: "XC",
      country: "Argentina 🇦🇷",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EXC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Xtrema Cartoons",
      videoUrl: "https://stmv6.voxtvhd.com.br/xtremacartoons/xtremacartoons/playlist.m3u8"
    },
    {
      id: "argentina-381-xtrema-cine-clasico",
      name: "Xtrema Cine Clasico",
      shortCode: "XCC",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EXCC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Xtrema Cine Clasico",
      videoUrl: "https://stmv6.voxtvhd.com.br/cineclasico/cineclasico/playlist.m3u8"
    },
    {
      id: "argentina-382-xtrema-terror",
      name: "Xtrema Terror",
      shortCode: "XT",
      country: "Argentina 🇦🇷",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EXT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Xtrema Terror",
      videoUrl: "https://stmv6.voxtvhd.com.br/cineterror/cineterror/playlist.m3u8"
    },
    {
      id: "bolivia-383-amitel-tv",
      name: "Amitel TV",
      shortCode: "AT",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Amitel TV",
      videoUrl: "https://stv2.boliviaplay.com.bo/hls/stream.m3u8"
    },
    {
      id: "bolivia-384-as-contenidos",
      name: "As Contenidos",
      shortCode: "AC",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de As Contenidos",
      videoUrl: "https://master.tucableip.com/ascontenido/index.m3u8"
    },
    {
      id: "bolivia-385-audiokiss",
      name: "Audiokiss",
      shortCode: "A",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Audiokiss",
      videoUrl: "https://master.tucableip.com/audiokisstv/index.m3u8"
    },
    {
      id: "bolivia-386-bolivia-tv",
      name: "Bolivia Tv",
      shortCode: "BT",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Bolivia Tv",
      videoUrl: "http://190.181.61.93:8000/play/a001/index.m3u8"
    },
    {
      id: "bolivia-387-canal-56",
      name: "Canal 56",
      shortCode: "C5",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC5%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canal 56",
      videoUrl: "http://45.5.118.152:8000/play/a08z/index.m3u8"
    },
    {
      id: "bolivia-388-ceacom",
      name: "CEACOM",
      shortCode: "C",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de CEACOM",
      videoUrl: "https://eu1.servers10.com:8081/ceacom/index.m3u8"
    },
    {
      id: "bolivia-389-cinecanal-pacific",
      name: "Cinecanal Pacific",
      shortCode: "CP",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECP%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cinecanal Pacific",
      videoUrl: "http://138.121.15.230:9002/CINECANAL/index.m3u8"
    },
    {
      id: "bolivia-390-coral-tv",
      name: "Coral TV",
      shortCode: "CT",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Coral TV",
      videoUrl: "https://tv.mediacp.eu:8081/coraltv/index.m3u8"
    },
    {
      id: "bolivia-391-delta-tv",
      name: "Delta TV",
      shortCode: "DT",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Delta TV",
      videoUrl: "https://st.deltaboliviainstitucion.org:3778/hybrid/play.m3u8"
    },
    {
      id: "bolivia-392-dmoda-channe",
      name: "Dmoda Channe",
      shortCode: "DC",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Dmoda Channe",
      videoUrl: "https://master.tucableip.com/dmoda/index.m3u8"
    },
    {
      id: "bolivia-393-el-deber",
      name: "EL DEBER",
      shortCode: "ED",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EED%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de EL DEBER",
      videoUrl: "https://master.tucableip.com/eldebertv/index.m3u8"
    },
    {
      id: "bolivia-394-fap-tv",
      name: "FAP TV",
      shortCode: "FT",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de FAP TV",
      videoUrl: "https://edge.enhdtv.com/faptv/index.m3u8"
    },
    {
      id: "bolivia-395-ftv",
      name: "FTV",
      shortCode: "F",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de FTV",
      videoUrl: "https://master.tucableip.com/ftvhd/index.m3u8"
    },
    {
      id: "bolivia-396-gigavision",
      name: "Gigavision",
      shortCode: "G",
      country: "Bolivia 🇧🇴",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EG%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Gigavision",
      videoUrl: "http://158.172.155.130:8000/play/a0e7/index.m3u8"
    },
    {
      id: "bolivia-397-radio-centro",
      name: "Radio Centro",
      shortCode: "RC",
      country: "Bolivia 🇧🇴",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Centro",
      videoUrl: "https://streamlov.alsolnet.com/grupocentrobo/live/playlist.m3u8"
    },
    {
      id: "bolivia-398-radio-clasica-tv",
      name: "Radio Clasica TV",
      shortCode: "RCT",
      country: "Bolivia 🇧🇴",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERCT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Radio Clasica TV",
      videoUrl: "https://ares.disfrutaenlared.com:1936/clasica/clasica/playlist.m3u8"
    },
    {
      id: "bolivia-399-mega-tv-amazonia",
      name: "Mega TV Amazonia",
      shortCode: "MTA",
      country: "Bolivia 🇧🇴",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EMTA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Mega TV Amazonia",
      videoUrl: "https://ares.disfrutaenlared.com:1936/megatv/megatv/playlist.m3u8"
    },
    {
      id: "bolivia-400-universitaria-san-andres",
      name: "Universitaria San Andres",
      shortCode: "USA",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUSA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Universitaria San Andres",
      videoUrl: "https://edge.enhdtv.com/8054/index.m3u8"
    },
    {
      id: "bolivia-401-red-america",
      name: "Red America",
      shortCode: "RA",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Red America",
      videoUrl: "https://edge.enhdtv.com/redamerica/index.m3u8"
    },
    {
      id: "bolivia-402-red-rubi",
      name: "Red Rubi",
      shortCode: "RR",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERR%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Red Rubi",
      videoUrl: "https://59d39900ebfb8.streamlock.net/asiesmipueblo/asiesmipueblo/playlist.m3u8"
    },
    {
      id: "bolivia-403-red-tv-shop",
      name: "Red TV Shop",
      shortCode: "RTS",
      country: "Bolivia 🇧🇴",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERTS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Red TV Shop",
      videoUrl: "https://master.tucableip.com/redtvshop/index.m3u8"
    },
    {
      id: "bolivia-404-red-uno",
      name: "Red Uno",
      shortCode: "RU",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Red Uno",
      videoUrl: "http://190.181.61.93:8000/play/a002/index.m3u8"
    },
    {
      id: "bolivia-405-red-uno-lpz",
      name: "Red Uno LPZ",
      shortCode: "RUL",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERUL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Red Uno LPZ",
      videoUrl: "http://190.181.61.93:8000/play/a003/index.m3u8"
    },
    {
      id: "bolivia-406-tdt-multimedia",
      name: "TDT Multimedia",
      shortCode: "TM",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETM%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TDT Multimedia",
      videoUrl: "https://video01.brascast.com/juan6318/juan6318/playlist.m3u8"
    },
    {
      id: "bolivia-407-tl-estrella",
      name: "TL Estrella",
      shortCode: "TE",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETE%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TL Estrella",
      videoUrl: "https://59d39900ebfb8.streamlock.net/teleestrella/teleestrella/playlist.m3u8"
    },
    {
      id: "bolivia-408-tv-latina",
      name: "TV Latina",
      shortCode: "TL",
      country: "Bolivia 🇧🇴",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Latina",
      videoUrl: "https://castv10.plugstreaming.com:19360/redtv/redtv.m3u8"
    },
    {
      id: "bolivia-409-tv-off",
      name: "TV OFF",
      shortCode: "TO",
      country: "Bolivia 🇧🇴",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETO%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV OFF",
      videoUrl: "https://edge.enhdtv.com/tvoff/index.m3u8"
    },
    {
      id: "bolivia-410-tvu-sucre",
      name: "TVU Sucre",
      shortCode: "TS",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TVU Sucre",
      videoUrl: "https://edge.enhdtv.com/8214/index.m3u8"
    },
    {
      id: "bolivia-411-umsa-tvu-internacional",
      name: "UMSA TVU Internacional",
      shortCode: "UTI",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUTI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de UMSA TVU Internacional",
      videoUrl: "https://edge.enhdtv.com/8026/index.m3u8"
    },
    {
      id: "bolivia-412-umsa-tvu",
      name: "UMSA TVU",
      shortCode: "UT",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de UMSA TVU",
      videoUrl: "https://edge.enhdtv.com/8190/index.m3u8"
    },
    {
      id: "bolivia-413-unitel",
      name: "Unitel",
      shortCode: "U",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EU%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Unitel",
      videoUrl: "http://190.181.61.93:8000/play/1909/index.m3u8"
    },
    {
      id: "bolivia-414-upea-tv",
      name: "UPEA TV",
      shortCode: "UT",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EUT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de UPEA TV",
      videoUrl: "https://tvstream.upea.bo/hls/oSs0jSWumTFIIVY97559.m3u8"
    },
    {
      id: "bolivia-415-xtotv",
      name: "XTOTV",
      shortCode: "X",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EX%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de XTOTV",
      videoUrl: "https://www.sccbolivia.com/dash/720p.mpd"
    },
    {
      id: "bolivia-416-zuraca-tv",
      name: "Zuraca TV",
      shortCode: "ZT",
      country: "Bolivia 🇧🇴",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EZT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Zuraca TV",
      videoUrl: "https://tv3.bitstreaming.net:3680/live/zuracatvlive.m3u8"
    },
    {
      id: "italia-417-7-gold",
      name: "7 Gold",
      shortCode: "7G",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E7G%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 7 Gold",
      videoUrl: "https://streamcdnr6-dddfac816632463dac50b21109dc1bb3.msvdn.net/live/S58803518/OOZape6Nxp4H/playlist.m3u8"
    },
    {
      id: "italia-418-12-tv-parma",
      name: "12 TV Parma",
      shortCode: "12T",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E12T%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 12 TV Parma",
      videoUrl: "https://5929b138b139d.streamlock.net/12TVParma/livestream/playlist.m3u8"
    },
    {
      id: "italia-419-16-anni-e-incinta",
      name: "16 Anni e Incinta",
      shortCode: "16A",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E16A%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 16 Anni e Incinta",
      videoUrl: "https://jmp2.uk/plu-60940a07d88ba90007b9cb71.m3u8"
    },
    {
      id: "italia-420-50-canale",
      name: "50 Canale",
      shortCode: "50C",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E50C%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 50 Canale",
      videoUrl: "https://load-balancer.azotosolutions.com/cdnedge37/canale50/playlist.m3u8"
    },
    {
      id: "italia-421-51-radio-tv",
      name: "51 Radio TV",
      shortCode: "51R",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E51R%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 51 Radio TV",
      videoUrl: "http://wms.shared.streamshow.it/canale51/canale51/playlist.m3u8"
    },
    {
      id: "italia-422-70-80-tv",
      name: "70-80 TV",
      shortCode: "708",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E708%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 70-80 TV",
      videoUrl: "https://585b674743bbb.streamlock.net/9050/9050/playlist.m3u8"
    },
    {
      id: "italia-423-111-tv",
      name: "111 TV",
      shortCode: "111T",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3E111T%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de 111 TV",
      videoUrl: "https://5db313b643fd8.streamlock.net/111/111/playlist.m3u8"
    },
    {
      id: "italia-424-a2i-tv",
      name: "A2i TV",
      shortCode: "AT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de A2i TV",
      videoUrl: "https://stream.sen-gt.com/A2itv/myStream/playlist.m3u8"
    },
    {
      id: "italia-425-altoadige-tv",
      name: "AltoAdige TV",
      shortCode: "AT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de AltoAdige TV",
      videoUrl: "https://5f204aff97bee.streamlock.net/AltoAdigeTV/livestream/playlist.m3u8"
    },
    {
      id: "italia-426-andromeda-italy",
      name: "Andromeda Italy",
      shortCode: "AI",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Andromeda Italy",
      videoUrl: "https://jmp2.uk/plu-60802d37ee238e0007c94e64.m3u8"
    },
    {
      id: "italia-427-antenna-2-tv",
      name: "Antenna 2 TV",
      shortCode: "A2T",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EA2T%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Antenna 2 TV",
      videoUrl: "https://58f12ffd2447a.streamlock.net/Antenna2/livestream/playlist.m3u8"
    },
    {
      id: "italia-428-aurora-arte",
      name: "Aurora Arte",
      shortCode: "AA",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Aurora Arte",
      videoUrl: "https://59d7d6f47d7fc.streamlock.net/auroraarte/auroraarte/playlist.m3u8"
    },
    {
      id: "italia-429-azzurra-tv",
      name: "Azzurra TV",
      shortCode: "AT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EAT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Azzurra TV",
      videoUrl: "https://ed05.top-ix.org/avtvlive/azzurra/streaming/playlist.m3u8"
    },
    {
      id: "italia-430-bejoy-kids",
      name: "BeJoy.kids",
      shortCode: "BK",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBK%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de BeJoy.kids",
      videoUrl: "https://stream.paroledivita.org/bejoy.m3u8"
    },
    {
      id: "italia-431-bergamo-tv",
      name: "Bergamo TV",
      shortCode: "BT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Bergamo TV",
      videoUrl: "https://db142859fd5541b09de25d6507f1f2d3.msvdn.net/live/S17501676/oIxAsgEEA46M/playlist_dvr.m3u8"
    },
    {
      id: "italia-432-boing",
      name: "Boing",
      shortCode: "B",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EB%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Boing",
      videoUrl: "https://boing.akamaized.net/6380392800112/eu-central-1/6284318116001/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJob3N0Ijoib3dwbnN1LmVncmVzcy5haGc3NmwiLCJhY2NvdW50X2lkIjoiNjI4NDMxODExNjAwMSIsImVobiI6ImJvaW5nLmFrYW1haXplZC5uZXQiLCJpc3MiOiJibGl2ZS1wbGF5YmFjay1zb3VyY2UtYXBpIiwic3ViIjoicGF0aG1hcHRva2VuIiwiYXVkIjpbIjYyODQzMTgxMTYwMDEiXSwianRpIjoiNjM4MDM5MjgwMDExMiJ9.0RWQ0yZrauU0cHSnbpBYhgyRPeq1Lyw6nOn_fo7_cg0/playlist-hls.m3u8"
    },
    {
      id: "italia-433-bom-channel",
      name: "Bom Channel",
      shortCode: "BC",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Bom Channel",
      videoUrl: "https://5f22d76e220e1.streamlock.net/canale6/canale6/playlist.m3u8"
    },
    {
      id: "italia-434-btl-tv",
      name: "BTL TV",
      shortCode: "BT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EBT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de BTL TV",
      videoUrl: "https://cdn.liveplustv.com/v1/live/btl-tv/master.m3u8"
    },
    {
      id: "italia-435-cafetv24",
      name: "CafeTV24",
      shortCode: "C",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de CafeTV24",
      videoUrl: "https://srvx1.selftv.video/cafe/live/playlist.m3u8"
    },
    {
      id: "italia-436-calabria-tv",
      name: "Calabria TV",
      shortCode: "CT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Calabria TV",
      videoUrl: "https://64b16f23efbee.streamlock.net/calabriatv/calabriatv/playlist.m3u8"
    },
    {
      id: "italia-437-camera-dei-deputati",
      name: "Camera dei Deputati",
      shortCode: "CDD",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECDD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Camera dei Deputati",
      videoUrl: "https://video-ar.radioradicale.it/diretta/camera2/playlist.m3u8"
    },
    {
      id: "italia-438-canale-2-altamura",
      name: "Canale 2 Altamura",
      shortCode: "C2A",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC2A%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canale 2 Altamura",
      videoUrl: "https://59d7d6f47d7fc.streamlock.net/canale2/canale2/playlist.m3u8"
    },
    {
      id: "italia-439-canale-7",
      name: "Canale 7",
      shortCode: "C7",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC7%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canale 7",
      videoUrl: "http://wms.shared.streamshow.it/canale7/canale7/playlist.m3u8"
    },
    {
      id: "italia-440-canale-8",
      name: "Canale 8",
      shortCode: "C8",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC8%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Canale 8",
      videoUrl: "http://wms.shared.streamshow.it/canale8/canale8/playlist.m3u8"
    },
    {
      id: "italia-441-cartoon-network",
      name: "Cartoon Network",
      shortCode: "CN",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cartoon Network",
      videoUrl: "http://185.227.34.104/stream/122/index.m3u8"
    },
    {
      id: "italia-442-cartoonito",
      name: "Cartoonito",
      shortCode: "C",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cartoonito",
      videoUrl: "https://boing.akamaized.net/6380673432112/eu-central-1/6284318116001/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJob3N0Ijoib3dwbnN1LmVncmVzcy5haGc3NmwiLCJhY2NvdW50X2lkIjoiNjI4NDMxODExNjAwMSIsImVobiI6ImJvaW5nLmFrYW1haXplZC5uZXQiLCJpc3MiOiJibGl2ZS1wbGF5YmFjay1zb3VyY2UtYXBpIiwic3ViIjoicGF0aG1hcHRva2VuIiwiYXVkIjpbIjYyODQzMTgxMTYwMDEiXSwianRpIjoiNjM4MDY3MzQzMjExMiJ9.WACYETOZxZYmZHRpxwRrATxVZQBdSoeaWdfhtLKx1kI/playlist-hls.m3u8"
    },
    {
      id: "italia-443-cg-entertainment",
      name: "CG Entertainment",
      shortCode: "CE",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECE%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de CG Entertainment",
      videoUrl: "https://cgentertainment-cgtv-1-it.samsung.wurl.tv/playlist.m3u8"
    },
    {
      id: "italia-444-cin-cin",
      name: "Cin Cin",
      shortCode: "CC",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cin Cin",
      videoUrl: "https://jmp2.uk/plu-65cb78b83a116800079e2e35.m3u8"
    },
    {
      id: "italia-445-class-cnbc",
      name: "Class CNBC",
      shortCode: "CC",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Class CNBC",
      videoUrl: "https://www.dailymotion.com/cdn/live/video/x91c8ww.m3u8?sec=D9OwEfHs-e7O6pQ-qlnROg"
    },
    {
      id: "italia-446-comedy-central",
      name: "Comedy Central",
      shortCode: "CC",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Comedy Central",
      videoUrl: "http://team-tv.co:81/comedy/index.m3u8"
    },
    {
      id: "italia-447-company-tv",
      name: "Company TV",
      shortCode: "CT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Company TV",
      videoUrl: "https://5929b138b139d.streamlock.net/CompanyTV/smil:CompanyTV.smil/master.m3u8"
    },
    {
      id: "italia-448-discovery-channel",
      name: "Discovery Channel",
      shortCode: "DC",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Discovery Channel",
      videoUrl: "https://streaming.aurora.enhanced.live/live/mpc/enl0eG1mLmVncmVzcy5mZDJ2eHI=/out/v1/IT_SIMULCAST/DISCOVERYCHANNEL/CMAF/index.m3u8"
    },
    {
      id: "italia-449-discovery-turbo",
      name: "Discovery Turbo",
      shortCode: "DT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Discovery Turbo",
      videoUrl: "https://streaming.aurora.enhanced.live/live/mpc/enl0eG1mLmVncmVzcy5mZDJ2eHI=/out/v1/IT_SIMULCAST/TURBO/CMAF/index.m3u8"
    },
    {
      id: "italia-450-disney-channel",
      name: "Disney Channel",
      shortCode: "DC",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EDC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Disney Channel",
      videoUrl: "https://s6.hopslan.com/disneyX/index.m3u8"
    },
    {
      id: "italia-451-dmax",
      name: "DMAX",
      shortCode: "D",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ED%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de DMAX",
      videoUrl: "https://streaming.aurora.enhanced.live/live/mpc/enl0eG1mLmVncmVzcy5mZDJ2eHI=/out/v1/IT_SIMULCAST/DMAX/CMAF/index.m3u8"
    },
    {
      id: "italia-452-elive-tv-brescia",
      name: "Elive TV Brescia",
      shortCode: "ETB",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EETB%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Elive TV Brescia",
      videoUrl: "https://59d7d6f47d7fc.streamlock.net/elivebresciatv/elivebresciatv/playlist.m3u8"
    },
    {
      id: "italia-453-fifa",
      name: "FIFA+",
      shortCode: "F",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de FIFA+",
      videoUrl: "https://5d95f7d7.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWl0X0ZJRkFQbHVzSXRhbGlhbl9ITFM/playlist.m3u8"
    },
    {
      id: "italia-454-food-network",
      name: "Food Network",
      shortCode: "FN",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Food Network",
      videoUrl: "https://streaming.aurora.enhanced.live/live/mpc/enl0eG1mLmVncmVzcy5mZDJ2eHI=/out/v1/IT_SIMULCAST/FOODNETWORK/CMAF/index.m3u8"
    },
    {
      id: "italia-455-italia-2",
      name: "Italia 2",
      shortCode: "I2",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EI2%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Italia 2",
      videoUrl: "https://59d7d6f47d7fc.streamlock.net/italia2/italia2/playlist.m3u8"
    },
    {
      id: "italia-456-kiss-kiss-napoli-tv",
      name: "Kiss Kiss Napoli TV",
      shortCode: "KKNT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EKKNT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Kiss Kiss Napoli TV",
      videoUrl: "https://58f12ffd2447a.streamlock.net/KKTVNapoli/livestream/playlist.m3u8"
    },
    {
      id: "italia-457-kiss-kiss-tv",
      name: "Kiss Kiss TV",
      shortCode: "KKT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EKKT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Kiss Kiss TV",
      videoUrl: "https://58f12ffd2447a.streamlock.net/KKMulti/livestream/playlist.m3u8"
    },
    {
      id: "italia-458-la7-cinema",
      name: "La7 Cinema",
      shortCode: "LC",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de La7 Cinema",
      videoUrl: "http://102.129.186.182:81/la7d/index.m3u8"
    },
    {
      id: "italia-459-nickelodeon",
      name: "Nickelodeon",
      shortCode: "N",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Nickelodeon",
      videoUrl: "http://185.227.34.104/stream/117/index.m3u8"
    },
    {
      id: "italia-460-nick-jr",
      name: "Nick Jr.",
      shortCode: "NJ",
      country: "Italia 🇮🇹",
      category: "Entretenimiento",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ENJ%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Nick Jr.",
      videoUrl: "http://102.129.186.182:81/nick/index.m3u8"
    },
    {
      id: "italia-461-ntn",
      name: "NTN",
      shortCode: "N",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de NTN",
      videoUrl: "https://stream4.xdevel.com/video0s975955-782/stream/playlist.m3u8"
    },
    {
      id: "italia-462-pesca-e-caccia",
      name: "Pesca e Caccia",
      shortCode: "PEC",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EPEC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Pesca e Caccia",
      videoUrl: "http://102.129.186.182:81/pescacaccia/index.m3u8"
    },
    {
      id: "italia-463-tv-alberto-sordi",
      name: "TV Alberto Sordi",
      shortCode: "TAS",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETAS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Alberto Sordi",
      videoUrl: "https://jmp2.uk/plu-661f8f01801af800083d9d81.m3u8"
    },
    {
      id: "italia-464-tv-christmas-tutto-l-anno",
      name: "TV Christmas tutto l'anno",
      shortCode: "TCTL",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETCTL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Christmas tutto l'anno",
      videoUrl: "https://jmp2.uk/plu-612e05b885183d0007958101.m3u8"
    },
    {
      id: "italia-465-cinema-italiano",
      name: "Cinema Italiano",
      shortCode: "CI",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECI%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cinema Italiano",
      videoUrl: "https://jmp2.uk/plu-608aa7d8359b270007861489.m3u8"
    },
    {
      id: "italia-466-cinema-orientale",
      name: "Cinema Orientale",
      shortCode: "CO",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ECO%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Cinema Orientale",
      videoUrl: "https://jmp2.uk/plu-6786235bd648bf0008c2780a.m3u8"
    },
    {
      id: "italia-467-tv-cucina",
      name: "TV Cucina",
      shortCode: "TC",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Cucina",
      videoUrl: "https://jmp2.uk/plu-608aa718a8ec810007d87fee.m3u8"
    },
    {
      id: "italia-468-documentari",
      name: "Documentari",
      shortCode: "D",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ED%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Documentari",
      videoUrl: "https://jmp2.uk/plu-608aa8a5709d6b0007b132fe.m3u8"
    },
    {
      id: "italia-469-tv-film",
      name: "TV Film",
      shortCode: "TF",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETF%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Film",
      videoUrl: "https://jmp2.uk/plu-608aa17fb9f4490007e6419a.m3u8"
    },
    {
      id: "italia-470-tv-film-azione",
      name: "TV Film Azione",
      shortCode: "TFA",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETFA%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Film Azione",
      videoUrl: "https://jmp2.uk/plu-608aa20a2e7f270007c4878d.m3u8"
    },
    {
      id: "italia-471-tv-film-commedia",
      name: "TV Film Commedia",
      shortCode: "TFC",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETFC%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Film Commedia",
      videoUrl: "https://jmp2.uk/plu-608aa512d67fd900072323db.m3u8"
    },
    {
      id: "italia-472-tv-film-romantici",
      name: "TV Film Romantici",
      shortCode: "TFR",
      country: "Italia 🇮🇹",
      category: "Regional",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETFR%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Film Romantici",
      videoUrl: "https://jmp2.uk/plu-608aa4a4cc92820007b663af.m3u8"
    },
    {
      id: "italia-473-film-storici",
      name: "Film Storici",
      shortCode: "FS",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Film Storici",
      videoUrl: "https://jmp2.uk/plu-68750875759366af05a151ce.m3u8"
    },
    {
      id: "italia-474-film-thriller",
      name: "Film Thriller",
      shortCode: "FT",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EFT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Film Thriller",
      videoUrl: "https://jmp2.uk/plu-608aa5e995132a00075f7005.m3u8"
    },
    {
      id: "italia-475-legami-letali",
      name: "Legami Letali",
      shortCode: "LL",
      country: "Italia 🇮🇹",
      category: "Señal Abierta",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ELL%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Legami Letali",
      videoUrl: "https://jmp2.uk/plu-64808a8c536e0c0008a276d1.m3u8"
    },
    {
      id: "deportes-476-espn-extra",
      name: "ESPN Extra",
      shortCode: "EE",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EEE%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de ESPN Extra",
      videoUrl: "https://barinaslive1.boldmss.com/ESPN/ESPN.isml/ESPN.mpd"
    },
    {
      id: "deportes-477-tv-deportes",
      name: "TV Deportes",
      shortCode: "TD",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETD%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV Deportes",
      videoUrl: "https://jmp2.uk/plu-5dcde07af1c85b0009b18651.m3u8"
    },
    {
      id: "deportes-478-tv-e-sports",
      name: "TV E-Sports",
      shortCode: "TES",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ETES%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de TV E-Sports",
      videoUrl: "https://jmp2.uk/plu-5ff3934600d4c7000733ff49.m3u8"
    },
    {
      id: "deportes-479-realmadrid-tv",
      name: "Realmadrid TV",
      shortCode: "RT",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3ERT%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Realmadrid TV",
      videoUrl: "http://90.163.85.113:8093/stream/26/index.m3u8"
    },
    {
      id: "deportes-480-nobtop",
      name: "NOBTOP",
      shortCode: "N",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EN%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de NOBTOP",
      videoUrl: "https://fonbet.mediacdn.ru/live/volleyball/playlist.m3u8"
    },
    {
      id: "deportes-481-win-sports",
      name: "Win Sports",
      shortCode: "WS",
      country: "Deportes ⚽",
      category: "Deportes",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2218%22%20fill%3D%22%23111827%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2234%22%20font-weight%3D%22700%22%20fill%3D%22%23f9fafb%22%3EWS%3C%2Ftext%3E%3C%2Fsvg%3E",
      currentShow: "Señal en vivo de Win Sports",
      videoUrl: "http://138.121.15.230:9002/WIN-SPORT/index.m3u8"
    }
  ]);

  const [activeChannel, setActiveChannel] = useState<Channel>(liveChannels[0]);
  const nowNext = nowTick > 0 ? getNowNext(epg[activeChannel.id], tzForChannel(activeChannel), new Date(nowTick)) : null;
  const [selectedCountryFilter, setSelectedCountryFilter] = useState<string>("Todos");
  const [searchGuide, setSearchGuide] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeChannel.embedUrl || !activeChannel.videoUrl) return;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(activeChannel.videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = activeChannel.videoUrl;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
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
  const [isGuest, setIsGuest] = useState(true);

  // Perfiles
  const [profiles, setProfiles] = useState<Profile[]>([
    { id: "1", name: "Rey", avatar: "/avatares/bojack1.png", isKid: false }
  ]);
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

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem("cineverso_custom_movies");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Las películas por defecto SIEMPRE usan la versión del código (así los enlaces
          // corregidos llegan a todos los dispositivos). Solo se conservan las agregadas
          // por el admin que no son de las películas por defecto.
          const defaultIds = new Set(defaultMovies.map((m) => String(m.id)));
          const extras = parsed.filter((m: Movie) => !defaultIds.has(String(m.id)));
          setCustomMovies([...defaultMovies, ...extras]);
        }
      }
    } catch (e) {
      console.error("Error cargando localStorage:", e);
    }

    // Catálogo compartido: se carga del servidor para que todos los dispositivos vean lo mismo
    const loadFromServer = async () => {
      try {
        const res = await fetch("/api/catalog", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.movies) && data.movies.length > 0) {
          setCustomMovies(data.movies);
        }
      } catch {
        // Sin conexión al servidor: se queda con el catálogo local
      }
    };
    loadFromServer();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadFromServer();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(loadFromServer, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  // Guarda el catálogo completo en el servidor (requiere clave de administrador)
  const saveCatalog = async (list: Movie[]): Promise<boolean> => {
    try {
      let key = sessionStorage.getItem("cineverso_admin_key") || "";
      if (!key) key = window.prompt("Clave de administrador:") || "";
      if (!key) {
        alert("Se necesita la clave de administrador para guardar.");
        return false;
      }
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: key, movies: list }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem("cineverso_admin_key");
        alert("Clave de administrador incorrecta.");
        return false;
      }
      if (!res.ok) {
        alert("No se pudo guardar en el servidor. Revisa la configuración de Supabase.");
        return false;
      }
      sessionStorage.setItem("cineverso_admin_key", key);
      return true;
    } catch {
      alert("Error de conexión al guardar. Intenta de nuevo.");
      return false;
    }
  };

  // Guarda la programación de TV en el servidor (requiere clave de administrador)
  const saveEpg = async (next: EpgMap): Promise<boolean> => {
    try {
      let key = sessionStorage.getItem("cineverso_admin_key") || "";
      if (!key) key = window.prompt("Clave de administrador:") || "";
      if (!key) {
        alert("Se necesita la clave de administrador para guardar.");
        return false;
      }
      const res = await fetch("/api/epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: key, schedule: next }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem("cineverso_admin_key");
        alert("Clave de administrador incorrecta.");
        return false;
      }
      if (!res.ok) {
        alert("No se pudo guardar la programación en el servidor.");
        return false;
      }
      sessionStorage.setItem("cineverso_admin_key", key);
      return true;
    } catch {
      alert("Error de conexión al guardar. Intenta de nuevo.");
      return false;
    }
  };

  const handleSaveEpg = async () => {
    if (!epgChannelId) {
      alert("Elige primero un canal.");
      return;
    }
    const { items, invalid } = parseSchedule(epgText);
    if (invalid.length > 0) {
      alert('Hay líneas con formato incorrecto (usa "HH:MM Título"):\n\n' + invalid.slice(0, 5).join("\n"));
      return;
    }
    const next: EpgMap = { ...epg };
    if (items.length === 0) delete next[epgChannelId];
    else next[epgChannelId] = items;
    if (!(await saveEpg(next))) return;
    setEpg(next);
    flashToast(items.length ? "Programación guardada" : "Programación eliminada");
  };

  useEffect(() => {
    if (!isMounted) return;
    try {
      if (customMovies.length > 0) {
        localStorage.setItem("cineverso_custom_movies", JSON.stringify(customMovies));
      }
    } catch (e) {
      console.error("Error guardando en localStorage:", e);
    }
  }, [customMovies, isMounted]);

  useEffect(() => {
    try {
      const savedProfiles = localStorage.getItem("cineverso_profiles");
      if (savedProfiles) {
        const parsedProfiles = JSON.parse(savedProfiles);
        if (Array.isArray(parsedProfiles) && parsedProfiles.length > 0) {
          setProfiles(parsedProfiles);
          setActiveProfile(parsedProfiles[0]);
        }
      }
    } catch (e) {
      console.error("Error cargando perfiles:", e);
    }
  }, []);

  // ===== CUENTAS REALES (correo + contraseña) y sincronización en la nube =====
  const [accountUser, setAccountUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);

  // Aplica los datos guardados en la nube de la cuenta
  const applyCloudData = (data: any) => {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data.profiles) && data.profiles.length > 0) {
      setProfiles(data.profiles);
      const active = data.profiles.find((p: Profile) => p.id === data.activeProfileId) || data.profiles[0];
      setActiveProfile(active);
    }
    if (Array.isArray(data.myList)) setMyList(data.myList);
    if (Array.isArray(data.progress)) setContinueWatchingList(data.progress);
  };

  // Al abrir la página: ¿ya hay una sesión iniciada?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.user) {
            setAccountUser(json.user);
            setIsGuest(false);
            applyCloudData(json.data);
          }
        }
      } catch {
        // sin conexión: se queda como invitado
      }
      if (!cancelled) setCloudReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al volver a la pestaña, trae lo último de la nube (por ejemplo, lo que viste en otro dispositivo)
  useEffect(() => {
    if (!accountUser) return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/account", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (json.user) applyCloudData(json.data);
      } catch {
        // ignorar
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUser]);

  // Guarda en la nube cada cambio de perfiles, Mi Lista y Continuar viendo
  useEffect(() => {
    if (!cloudReady || !accountUser) return;
    const id = setTimeout(() => {
      fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: { v: 1, profiles, activeProfileId: activeProfile.id, myList, progress: continueWatchingList },
        }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [profiles, activeProfile.id, myList, continueWatchingList, cloudReady, accountUser]);

  // Pasos de verificación por correo (código de 6 dígitos)
  const [authStep, setAuthStep] = useState<"form" | "verify">("form");
  const [otpCode, setOtpCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const postAccount = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  };

  // Entra a la cuenta después de iniciar sesión o de verificar el código
  const finishLogin = (json: any, mail: string, isNew: boolean) => {
    setAccountUser(json.user);
    setIsGuest(false);
    setPassword("");
    setOtpCode("");
    setPendingEmail("");
    setAuthStep("form");
    if (json.data) {
      applyCloudData(json.data);
    } else if (!json.user.isAdmin && profiles.length === 1 && profiles[0].name === "Rey") {
      // Cuenta nueva: el primer perfil lleva el nombre del correo
      const base = mail.split("@")[0];
      const renamed: Profile = { ...profiles[0], name: base.charAt(0).toUpperCase() + base.slice(1, 20) };
      setProfiles([renamed]);
      setActiveProfile(renamed);
    }
    flashToast(isNew ? "¡Cuenta verificada! Ya se sincroniza en todos tus dispositivos" : "Sesión iniciada");
  };

  const goToVerify = (mail: string) => {
    setPendingEmail(mail);
    setOtpCode("");
    setAuthStep("verify");
    setResendCooldown(60);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading) return;
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      alert("Ingresa un correo válido.");
      return;
    }
    if (password.length < 6) {
      alert("La contraseña debe tener mínimo 6 caracteres.");
      return;
    }
    setAuthLoading(true);
    try {
      const { res, json } = await postAccount({ action: authMode, email: mail, password });
      if (res.status === 403 && json.needsVerification) {
        goToVerify(mail);
        flashToast("Te enviamos un código a tu correo");
        return;
      }
      if (!res.ok) {
        alert(json.error || "No se pudo completar la acción. Inténtalo de nuevo.");
        return;
      }
      if (json.pending) {
        goToVerify(mail);
        flashToast("Te enviamos un código de 6 dígitos a tu correo");
        return;
      }
      finishLogin(json, mail, authMode === "register");
    } catch {
      alert("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading) return;
    const code = otpCode.replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(code)) {
      alert("Escribe el código de 6 dígitos que llegó a tu correo.");
      return;
    }
    setAuthLoading(true);
    try {
      const { res, json } = await postAccount({ action: "verify", email: pendingEmail, code });
      if (!res.ok) {
        alert(json.error || "Código incorrecto o vencido.");
        return;
      }
      finishLogin(json, pendingEmail, true);
    } catch {
      alert("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || authLoading) return;
    setAuthLoading(true);
    try {
      const { res, json } = await postAccount({ action: "resend", email: pendingEmail });
      if (!res.ok) {
        alert(json.error || "No se pudo reenviar el código.");
        return;
      }
      setResendCooldown(60);
      flashToast("Te enviamos un código nuevo");
    } catch {
      alert("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      // ignorar
    }
    setAccountUser(null);
    setIsGuest(true);
    const guest: Profile = { id: "1", name: "Rey", avatar: "/avatares/bojack1.png", isKid: false };
    setProfiles([guest]);
    setActiveProfile(guest);
    setMyList([]);
    setContinueWatchingList([]);
    try {
      ["cineverso_profiles", "cineverso_mylist", "cineverso_progress"].forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignorar
    }
    setEmail("");
    setPassword("");
    setAuthStep("form");
    setOtpCode("");
    setActiveTab("inicio");
    flashToast("Sesión cerrada");
  };

  // Administrador: con cuenta, lo decide el servidor (ADMIN_EMAIL); como invitado se mantiene el perfil "Rey"
  const isAdmin = accountUser ? accountUser.isAdmin : activeProfile.name.toLowerCase() === "rey";

  const fallbackHero: Movie = {
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

  // Hasta 5 películas del catálogo rotan en el banner principal
  const heroSlides: Movie[] = customMovies.filter((m) => m.bgImage).slice(0, 5);
  const slides: Movie[] = heroSlides.length > 0 ? heroSlides : [fallbackHero];
  const safeIndex = heroIndex % slides.length;
  const heroMovie: Movie = slides[safeIndex];

  // Cambio automático cada 7 segundos (se pausa con el mouse encima, al abrir una película o en otra pestaña)
  useEffect(() => {
    if (slides.length < 2 || heroPaused || activeTab !== "inicio" || selectedMovie) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => setHeroIndex((i) => (i + 1) % slides.length), 7000);
    return () => clearTimeout(id);
  }, [heroIndex, heroPaused, slides.length, activeTab, selectedMovie]);

  const handleSaveMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert("Acceso denegado. Solo el administrador puede gestionar películas.");
      return;
    }
    if (!newMovieTitle || !newMovieVideoUrl) {
      alert("Por favor ingresa al menos el título y el enlace del vídeo.");
      return;
    }

    if (editingMovieId) {
      const updatedList = customMovies.map(m => m.id === editingMovieId ? {
        ...m,
        title: newMovieTitle,
        tag: newMovieCategory,
        type: newMovieType,
        desc: newMovieDesc || m.desc,
        bgImage: newMovieImage || m.bgImage,
        img: newMovieImage || m.img,
        videoUrl: newMovieVideoUrl
      } : m);

      if (!(await saveCatalog(updatedList))) return;
      setCustomMovies(updatedList);
      setToastMessage("¡Contenido actualizado y guardado correctamente!");
      setEditingMovieId(null);
    } else {
      const createdMovie: Movie = {
        id: Date.now(),
        title: newMovieTitle,
        rating: "8.5",
        year: "2026",
        tag: newMovieCategory,
        type: newMovieType,
        desc: newMovieDesc || "Contenido añadido desde el panel de administración.",
        bgImage: newMovieImage || "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
        img: newMovieImage || "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
        videoUrl: newMovieVideoUrl,
        backupVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        duration: "1 h 50 min",
        genres: [newMovieCategory],
        cast: "Elenco Estelar",
        director: "Director Principal",
        production: "Cineverso Studio",
        originalLanguage: "ES"
      };

      const newList = [createdMovie, ...customMovies];
      if (!(await saveCatalog(newList))) return;
      setCustomMovies(newList);
      setToastMessage("¡Película publicada y respaldada con éxito!");
    }

    setNewMovieTitle("");
    setNewMovieDesc("");
    setNewMovieImage("");
    setNewMovieVideoUrl("");
    setTimeout(() => setToastMessage(""), 4000);
  };

  const handleEditClick = (movie: Movie) => {
    setEditingMovieId(movie.id);
    setNewMovieTitle(movie.title);
    setNewMovieDesc(movie.desc);
    setNewMovieCategory(movie.tag || "Acción");
    setNewMovieType(movie.type || "pelicula");
    setNewMovieImage(movie.bgImage || "");
    setNewMovieVideoUrl(movie.videoUrl || "");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteMovie = async (id: number | string) => {
    if (confirm("¿Estás seguro de eliminar este contenido del catálogo?")) {
      const filtered = customMovies.filter(m => m.id !== id);
      if (!(await saveCatalog(filtered))) return;
      setCustomMovies(filtered);
      if (editingMovieId === id) {
        setEditingMovieId(null);
        setNewMovieTitle("");
        setNewMovieDesc("");
        setNewMovieImage("");
        setNewMovieVideoUrl("");
      }
      setToastMessage("Contenido eliminado correctamente.");
      setTimeout(() => setToastMessage(""), 4000);
    }
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

    const newP: Profile = {
      id: Date.now().toString(),
      name: newProfileName,
      avatar: newProfileAvatar,
      isKid: newProfileIsKid,
      pin: newProfilePin || undefined
    };

    const updatedProfiles = [...profiles, newP];
    setProfiles(updatedProfiles);
    localStorage.setItem("cineverso_profiles", JSON.stringify(updatedProfiles));
    setShowAddProfileModal(false);
    setNewProfileName("");
    setNewProfilePin("");
    setNewProfileIsKid(false);
    setUsernameError("");
  };

  const handleSelectProfile = (p: Profile) => {
    setActiveProfile(p);
    setActiveTab("inicio");
  };

  const filteredExploreMovies = customMovies.filter((movie) => {
    const matchesSearch = exploreSearch === "" || movie.title.toLowerCase().includes(exploreSearch.toLowerCase());
    const matchesType = exploreTypeFilter === "todos" || movie.type === exploreTypeFilter;
    const matchesGenre = exploreGenreFilter === "Todos" || (movie.tag && movie.tag.toLowerCase() === exploreGenreFilter.toLowerCase());
    const matchesYear = exploreYearFilter === "Cualquier año" || movie.year === exploreYearFilter;
    
    return matchesSearch && matchesType && matchesGenre && matchesYear;
  });

  const tzKey = tzCountryKey(activeChannel);
  const tzNote = tzKey && tzKey !== "Perú" ? ` · hora de ${tzKey}` : "";
  const nowNextCard = nowNext ? (
    <div className="space-y-2">
      <div className="rounded-xl bg-[#111] border border-gray-900 p-3">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide">
          <span className="text-green-400">Ahora</span>
          <span className="text-gray-500">Desde las {nowNext.current.t}{tzNote}</span>
        </div>
        <p className="text-sm font-bold text-white mt-1 truncate">{nowNext.current.title}</p>
        <div className="h-1 bg-gray-800 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-green-500 transition-all duration-1000" style={{ width: `${nowNext.progress}%` }} />
        </div>
      </div>
      {nowNext.next && (
        <div className="rounded-xl bg-[#0d0d0d] border border-gray-900 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Después · {nowNext.next.t}</span>
          <p className="text-sm font-semibold text-gray-200 mt-1 truncate">{nowNext.next.title}</p>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-green-500 selection:text-black overflow-x-clip pb-24 md:pb-0">
      {tvMode && (
        <style>{`
          html.tv-mode *:focus { outline: none; }
          html.tv-mode *:focus-visible {
            outline: 4px solid #22c55e !important;
            outline-offset: 4px;
            border-radius: 14px;
            box-shadow: 0 0 0 10px rgba(34, 197, 94, 0.22);
          }
          html.tv-mode button:focus-visible,
          html.tv-mode [role="button"]:focus-visible {
            transform: scale(1.05);
            transition: transform 0.15s ease;
          }
        `}</style>
      )}
      {/* Navegación Superior */}
      <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 bg-gradient-to-b from-black via-black/80 to-transparent backdrop-blur-md">
        <div className="flex items-center gap-6 sm:gap-8 min-w-0">
          <div onClick={() => setActiveTab("inicio")} className="flex items-center gap-2 cursor-pointer group">
            <span className="bg-green-500 text-black font-black px-2 py-0.5 rounded text-lg sm:text-xl shadow-lg shadow-green-500/20">H</span>
            <span className="text-base sm:text-2xl whitespace-nowrap font-black tracking-wide bg-gradient-to-r from-green-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent flex items-center gap-1.5">
              Cineverso Magico <Sparkle className="hidden sm:block w-4 h-4 text-emerald-400 animate-pulse" />
            </span>
          </div>
          <div className="hidden md:flex gap-6 text-sm font-medium text-gray-300">
            <button onClick={() => setActiveTab("inicio")} className={`${activeTab === "inicio" ? "text-white font-bold" : "hover:text-green-400"}`}>Inicio</button>
            <button onClick={() => setActiveTab("explorar")} className={`${activeTab === "explorar" ? "text-white font-bold" : "hover:text-green-400"}`}>Explorador</button>
            <button onClick={() => setActiveTab("tv")} className={`${activeTab === "tv" ? "text-white font-bold" : "hover:text-green-400"}`}>TV en vivo</button>
            <button onClick={() => setActiveTab("milista")} className={`${activeTab === "milista" ? "text-white font-bold" : "hover:text-green-400"}`}>Mi Lista ({myList.length})</button>
            
            {isAdmin && (
              <button onClick={() => setActiveTab("admin")} className={`flex items-center gap-1 text-green-400 font-bold ${activeTab === "admin" ? "underline" : "hover:text-green-300"}`}>
                <Settings className="w-4 h-4" /> Panel de administración
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-gray-300">
          <Search onClick={() => setActiveTab("explorar")} className="w-5 h-5 cursor-pointer hover:text-white" />
          <button className="hidden sm:flex items-center gap-1.5 text-xs bg-[#121212] px-3 py-1.5 rounded-full border border-gray-800 hover:bg-gray-800">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" /> Sorpréndeme
          </button>
          <Bell className="w-5 h-5 cursor-pointer hover:text-white" />
          
          <div 
            onClick={() => setActiveTab("cuenta")} 
            className="flex items-center gap-2 cursor-pointer bg-[#121212] p-1 pr-3 rounded-full border border-gray-800 hover:border-green-500 transition"
          >
            <img src={activeProfile.avatar} alt={activeProfile.name} className="w-7 h-7 rounded-full object-cover bg-gray-900" />
            <span className="text-xs font-bold text-white max-w-[80px] sm:max-w-none truncate">{activeProfile.name}</span>
          </div>
        </div>
      </nav>

      {/* VISTA INICIO */}
      {activeTab === "inicio" && (
        <>
          <div
            className="relative h-[80vh] sm:h-[85vh] w-full flex items-center overflow-hidden bg-[#050505]"
            onPointerEnter={(e) => { if (e.pointerType === "mouse") setHeroPaused(true); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setHeroPaused(false); }}
            onTouchStart={(e) => { heroTouchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const dx = e.changedTouches[0].clientX - heroTouchX.current;
              if (Math.abs(dx) > 50 && slides.length > 1) {
                setHeroIndex((i) => (dx < 0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length));
              }
            }}
          >
            <style>{`
              @keyframes heroFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
              .hero-fade { animation: heroFade 0.7s ease both; }
              @media (prefers-reduced-motion: reduce) { .hero-fade { animation: none; } }
            `}</style>

            {slides.map((m, i) => (
              <div
                key={String(m.id)}
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
                style={{ backgroundImage: `url(${m.bgImage})`, opacity: i === safeIndex ? 1 : 0 }}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-black/70" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/50 to-transparent" />
            
            <div key={String(heroMovie.id)} className="hero-fade relative z-10 px-4 sm:px-6 md:px-12 max-w-2xl mt-12 w-full">
              <h1 className="text-3xl sm:text-6xl font-black tracking-tight uppercase leading-none text-white">
                {heroMovie.title}
                {heroMovie.subtitle && <span className="block text-xl sm:text-4xl text-orange-500 mt-1 font-extrabold">{heroMovie.subtitle}</span>}
              </h1>
              
              <div className="flex items-center gap-3 my-3 sm:my-4 text-xs font-semibold">
                <span className="text-green-400">★ {heroMovie.rating}</span>
                <span className="text-gray-400">{heroMovie.year}</span>
                <span className="text-gray-400">{heroMovie.duration}</span>
                <span className="bg-[#121212] border border-gray-800 text-gray-200 px-2 py-0.5 rounded">{heroMovie.tag}</span>
              </div>

              <p className="text-gray-300 text-xs sm:text-sm leading-relaxed mb-6 line-clamp-3">
                {heroMovie.desc}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => { setSelectedMovie(heroMovie); startPlayback(); }}
                  className="flex items-center gap-2 bg-white text-black font-bold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition cursor-pointer text-sm"
                >
                  <Play className="w-5 h-5 fill-black" /> Reproducir
                </button>
                <button 
                  onClick={() => setSelectedMovie(heroMovie)}
                  className="flex items-center gap-2 bg-[#121212]/90 text-white font-medium px-5 py-2.5 rounded-lg border border-gray-800 hover:bg-gray-800 transition cursor-pointer text-sm"
                >
                  <Info className="w-5 h-5" /> Más información
                </button>
                <button 
                  onClick={() => setMyList(prev => (prev.includes(heroMovie.title) ? prev : [...prev, heroMovie.title]))}
                  className="p-2.5 rounded-full bg-[#121212]/90 border border-gray-800 hover:bg-gray-800 transition cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {slides.length > 1 && (
              <div className="absolute bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
                {slides.map((m, i) => (
                  <button
                    key={String(m.id)}
                    type="button"
                    aria-label={`Ver ${m.title}`}
                    aria-current={i === safeIndex}
                    onClick={() => setHeroIndex(i)}
                    className="group py-3 px-0.5 cursor-pointer"
                  >
                    <span
                      className={`block h-1.5 rounded-full transition-all duration-500 ${
                        i === safeIndex ? "w-7 bg-white" : "w-1.5 bg-white/40 group-hover:bg-white/70"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 sm:px-6 md:px-12 space-y-10 -mt-20 relative z-20 pb-20 w-full overflow-x-hidden">
            {continueWatchingList.length > 0 && (
              <div>
                <h2 className="text-lg font-bold mb-4 text-white">Continuar viendo</h2>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none w-full">
                  {continueWatchingList.map((item) => {
                    const pct = Math.min(100, Math.max(0, Math.round((item.t / item.d) * 100)));
                    return (
                      <div
                        key={String(item.id)}
                        onClick={() => {
                          const m = customMovies.find((x) => String(x.id) === String(item.id));
                          if (m) { setSelectedMovie(m); startPlayback(); }
                        }}
                        className="min-w-[200px] sm:min-w-[240px] group cursor-pointer shrink-0"
                      >
                        <div className="relative">
                          <img src={item.img} alt={item.title} className="w-full h-28 sm:h-32 object-cover rounded-xl border border-gray-900 group-hover:border-green-500 transition shadow-lg" />
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-800/80 rounded-b-xl overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <h4 className="text-xs font-semibold mt-2 text-gray-300 truncate">{item.title}</h4>
                        <span className="text-[10px] text-gray-500">{formatRemaining(item.d - item.t)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {customMovies.length > 0 && (
              <div>
                <h2 className="text-lg font-bold mb-4 text-white">Tus Películas Subidas</h2>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none w-full">
                  {customMovies.map((item) => (
                    <div key={item.id} onClick={() => setSelectedMovie(item)} className="min-w-[150px] sm:min-w-[180px] group cursor-pointer shrink-0">
                      <img src={item.bgImage} alt={item.title} className="w-full h-40 sm:h-48 object-cover rounded-xl border border-gray-900 group-hover:border-green-500 transition shadow-lg" />
                      <h4 className="text-xs font-semibold mt-2 text-gray-300 truncate">{item.title}</h4>
                      <span className="text-[10px] text-green-400 font-medium">{item.tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* VISTA EXPLORAR */}
      {activeTab === "explorar" && (
        <div className="pt-24 px-4 sm:px-6 md:px-12 pb-24 max-w-7xl mx-auto space-y-6 w-full overflow-x-hidden">
          <div className="relative max-w-xl">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-500" />
            <input 
              type="text"
              placeholder="Buscar películas, series o personas"
              value={exploreSearch}
              onChange={(e) => setExploreSearch(e.target.value)}
              className="w-full bg-[#121212] border border-gray-800 rounded-full pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-green-500 transition shadow-inner"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="flex items-center bg-[#121212] border border-gray-800 rounded-full p-1">
              <button 
                onClick={() => setExploreTypeFilter("pelicula")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${exploreTypeFilter === "pelicula" ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}
              >
                Películas
              </button>
              <button 
                onClick={() => setExploreTypeFilter("serie")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${exploreTypeFilter === "serie" ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}
              >
                Series
              </button>
            </div>

            <select 
              value={exploreYearFilter}
              onChange={(e) => setExploreYearFilter(e.target.value)}
              className="bg-[#121212] border border-gray-800 px-4 py-1.5 rounded-full text-xs font-semibold text-gray-300 focus:outline-none cursor-pointer"
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
              className="text-xs text-gray-500 hover:text-white px-2 py-1.5 font-medium transition cursor-pointer"
            >
              Limpiar
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1 scrollbar-none border-b border-gray-900 w-full">
            <button
              onClick={() => setExploreGenreFilter("Todos")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer ${exploreGenreFilter === "Todos" ? "bg-white text-black font-bold" : "bg-[#121212] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-800"}`}
            >
              Todos
            </button>
            {genresList.map((genre) => (
              <button
                key={genre}
                onClick={() => setExploreGenreFilter(genre)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer ${exploreGenreFilter.toLowerCase() === genre.toLowerCase() ? "bg-white text-black font-bold" : "bg-[#121212] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-800"}`}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {filteredExploreMovies.map((movie) => (
                <div 
                  key={movie.id}
                  onClick={() => setSelectedMovie(movie)}
                  className="group relative cursor-pointer flex flex-col space-y-2"
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

      {/* VISTA TV EN VIVO - OPTIMIZADA PARA MÓVILES Y PANTALLAS COMPLETAS */}
      {activeTab === "tv" && (
        <div className="pt-16 sm:pt-20 min-h-screen bg-[#050505] overflow-x-clip">
          <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-5rem)] bg-[#050505]">
            <div className="w-full lg:flex-1 sticky top-[4.5rem] z-30 lg:relative lg:top-auto lg:z-auto bg-black flex flex-col justify-between lg:overflow-y-auto">
              {/* Contenedor estricto w-full aspect-video para evitar desbordes */}
              <div className="w-full aspect-video lg:h-full flex items-center justify-center relative bg-black shrink-0 overflow-hidden">
                {activeChannel.embedUrl ? (
                  <iframe
                    key={activeChannel.id}
                    src={`${activeChannel.embedUrl}${activeChannel.embedUrl.includes('?') ? '&' : '?'}autoplay=1&mute=0&rel=0&iv_load_policy=3`}
                    title={activeChannel.name}
                    className="w-full h-full border-0 object-cover"
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

              <div className="p-3 sm:p-4 bg-[#0a0a0a] border-t border-gray-900 flex items-center justify-between z-20 shrink-0">
                <div className="flex items-center gap-3 truncate">
                  <img src={activeChannel.logo} alt={activeChannel.name} className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover border border-gray-800 shrink-0" />
                  <div className="truncate">
                    <div className="flex items-center gap-2 truncate">
                      <h3 className="text-xs sm:text-sm font-bold text-white truncate">{activeChannel.name}</h3>
                      <span className="flex items-center gap-1 text-[10px] font-extrabold text-red-500 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> EN VIVO
                      </span>
                      <span className="hidden sm:inline-block text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">{activeChannel.country}</span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate">
                      {nowNext ? "Ahora: " : "Emitiendo: "}
                      <span className="text-gray-200 font-medium">{nowNext ? nowNext.current.title : activeChannel.currentShow}</span>
                    </p>
                  </div>
                </div>
                <span className="text-[10px] sm:text-xs bg-[#181818] px-3 py-1 rounded-lg text-gray-300 border border-gray-800 font-bold shrink-0">{activeChannel.category}</span>
              </div>
              {nowNextCard && <div className="hidden lg:block px-4 pb-4 bg-[#0a0a0a] shrink-0">{nowNextCard}</div>}
            </div>

            <div className="w-full lg:w-80 bg-[#0d0d0d] border-t lg:border-t-0 lg:border-l border-gray-900 flex flex-col lg:h-full shrink-0">
              {nowNextCard && <div className="lg:hidden p-3 border-b border-gray-900 bg-[#0a0a0a]">{nowNextCard}</div>}
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
                    className="w-full bg-[#161616] border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-green-500 transition"
                  />
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                  {["Todos", "Perú", "Chile", "Argentina", "Bolivia", "Italia", "España", "Ecuador", "Deportes"].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setSelectedCountryFilter(filter)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition whitespace-nowrap cursor-pointer ${selectedCountryFilter === filter ? "bg-green-500 text-black font-bold" : "bg-[#161616] text-gray-400 hover:text-white border border-gray-800"}`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 lg:overflow-y-auto p-3 pb-6 space-y-4 scrollbar-thin">
                {Object.entries(channelsGroupedByCountry).map(([countryName, channels]) => (
                  <div key={countryName} className="space-y-2">
                    <div className="lg:sticky lg:top-0 bg-[#0d0d0d]/95 backdrop-blur py-1.5 px-1 z-10 border-b border-gray-800/60 flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-green-400 flex items-center gap-1.5">
                        {countryName}
                      </h4>
                      <span className="text-[10px] bg-gray-900 text-gray-400 px-2 py-0.5 rounded-full font-bold">
                        {channels.length}
                      </span>
                    </div>

                    <div className="space-y-1.5 pl-0.5">
                      {channels.map((ch) => (
                        <div 
                          key={ch.id}
                          onClick={() => setActiveChannel(ch)}
                          className={`p-2.5 rounded-xl flex items-center gap-3 cursor-pointer transition border ${activeChannel.id === ch.id ? "bg-[#1c1c1c] border-green-500/80 shadow-md shadow-green-950/30" : "hover:bg-[#151515] border-transparent"}`}
                        >
                          <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center font-black text-xs text-gray-200 border border-gray-800 shrink-0 overflow-hidden">
                            <span>{ch.shortCode || ch.name.slice(0, 2).toUpperCase()}</span>
                          </div>
                          
                          <div className="flex-1 overflow-hidden">
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
        </div>
      )}

      {/* VISTA MI LISTA */}
      {activeTab === "milista" && (
        <div className="max-w-6xl mx-auto pt-28 px-4 sm:px-6 pb-24 space-y-6 overflow-x-hidden">
          <h2 className="text-3xl font-black text-white">Mi Lista ({myList.length})</h2>
          {myList.length === 0 ? (
            <p className="text-sm text-gray-500">No tienes películas añadidas a tu lista todavía.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {myList.map((title, i) => (
                <div key={i} className="bg-[#0f0f0f] p-4 rounded-xl border border-gray-900">
                  <h4 className="text-sm font-bold text-white">{title}</h4>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PANEL DE ADMINISTRACIÓN */}
      {activeTab === "admin" && isAdmin && (
        <div className="max-w-4xl mx-auto pt-28 px-4 sm:px-6 pb-24 space-y-10 overflow-x-hidden">
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
                </div>
              </div>
              {editingMovieId && (
                <button 
                  onClick={() => {
                    setEditingMovieId(null);
                    setNewMovieTitle("");
                    setNewMovieDesc("");
                    setNewMovieImage("");
                    setNewMovieVideoUrl("");
                  }}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition self-start sm:self-auto"
                >
                  Cancelar Edición
                </button>
              )}
            </div>

            <form onSubmit={handleSaveMovie} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Título de la Película o Serie</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Toy Story 5" 
                  value={newMovieTitle}
                  onChange={(e) => setNewMovieTitle(e.target.value)}
                  className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Enlace del Vídeo (MP4 directo de Archive.org)</label>
                <input 
                  type="url" 
                  required
                  placeholder="https://archive.org/download/..." 
                  value={newMovieVideoUrl}
                  onChange={(e) => setNewMovieVideoUrl(e.target.value)}
                  className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Tipo</label>
                  <select 
                    value={newMovieType}
                    onChange={(e) => setNewMovieType(e.target.value as "pelicula" | "serie")}
                    className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green-500"
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
                    className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green-500"
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
                    className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Sinopsis</label>
                <textarea 
                  rows={3}
                  placeholder="Descripción breve..." 
                  value={newMovieDesc}
                  onChange={(e) => setNewMovieDesc(e.target.value)}
                  className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green-500"
                />
              </div>

              <button type="submit" className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-black font-black py-3.5 rounded-xl text-sm transition shadow-lg shadow-green-950/50 cursor-pointer">
                {editingMovieId ? "Guardar Cambios de la Película" : "Publicar Contenido en la Web"}
              </button>
            </form>
          </div>

          <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-3xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">Programación de TV (Ahora / Después)</h3>
              <p className="text-xs text-gray-500 mt-1">
                Una línea por programa con el formato <span className="text-gray-300 font-mono">HH:MM Título</span>. Se repite todos los días y usa la hora local del canal (Perú = hora de Lima).
              </p>
            </div>
            <select
              value={epgChannelId}
              onChange={(e) => {
                const id = e.target.value;
                setEpgChannelId(id);
                setEpgText((epg[id] || []).map((i) => `${i.t} ${i.title}`).join("\n"));
              }}
              className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green-500"
            >
              <option value="">Elige un canal...</option>
              {liveChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.country}{epg[c.id] && epg[c.id].length > 0 ? " ✓" : ""}
                </option>
              ))}
            </select>
            <textarea
              rows={8}
              value={epgText}
              disabled={!epgChannelId}
              onChange={(e) => setEpgText(e.target.value)}
              placeholder={"06:00 Buenos Días Perú\n09:30 Noticias de la Mañana\n12:00 Almuerzo Show\n20:00 Noticiero Central"}
              className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-green-500 disabled:opacity-50"
            />
            <button
              onClick={handleSaveEpg}
              className="w-full bg-[#181818] hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-sm border border-gray-800 transition cursor-pointer"
            >
              Guardar programación del canal
            </button>
          </div>

          <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-3xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-white">
                <span>Gestión del Catálogo ({customMovies.length} títulos)</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <button 
                  onClick={async () => {
                    if (await saveCatalog(customMovies)) {
                      setToastMessage("¡Catálogo sincronizado con todos los dispositivos!");
                      setTimeout(() => setToastMessage(""), 4000);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 bg-green-950/40 text-green-400 hover:bg-green-900/40 px-3 py-1.5 rounded-lg text-xs font-bold border border-green-900/50 transition cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" /> Sincronizar con todos
                </button>
                <button 
                  onClick={async () => {
                    if (confirm("¿Restaurar catálogo por defecto en TODOS los dispositivos?")) {
                      if (!(await saveCatalog(defaultMovies))) return;
                      localStorage.removeItem("cineverso_custom_movies");
                      setCustomMovies(defaultMovies);
                      alert("Catálogo restaurado correctamente.");
                      window.location.reload();
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 bg-red-950/40 text-red-400 hover:bg-red-900/40 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-900/50 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Forzar Restauración
                </button>
              </div>
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
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button 
                      onClick={() => handleEditClick(movie)}
                      className="flex items-center gap-1 bg-[#181818] hover:bg-emerald-950/40 text-emerald-400 px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button 
                      onClick={() => handleDeleteMovie(movie.id)}
                      className="flex items-center gap-1 bg-[#181818] hover:bg-red-950/40 text-red-400 px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer"
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
            <button onClick={() => setShowAddProfileModal(true)} className="flex items-center justify-center gap-2 bg-[#181818] hover:bg-gray-800 px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer">
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
                    <button onClick={() => handleSelectProfile(p)} className="text-xs text-emerald-400 hover:underline cursor-pointer font-bold shrink-0 ml-2">Cambiar</button>
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
                className="w-full flex items-center justify-center gap-2 p-3 bg-[#050505] hover:bg-[#121212] rounded-xl text-sm font-bold border border-dashed border-gray-800 transition text-gray-400 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-green-400" /> Agregar perfil
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Cuenta</h3>
            <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-gray-900 space-y-4">
              {!accountUser ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-green-500/10 text-green-400 rounded-xl shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Estás como Invitado (Máximo 3 perfiles)</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Inicia sesión o crea tu cuenta para sincronizar tus perfiles, Mi Lista y Continuar viendo en todos tus dispositivos (hasta 5 perfiles).</p>
                    </div>
                  </div>

                  {authStep === "verify" ? (
                    <form onSubmit={handleVerify} className="space-y-3">
                      <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-gray-300 leading-relaxed">
                        Te enviamos un código de 6 dígitos a <span className="font-bold text-white">{pendingEmail}</span>. Escríbelo aquí para activar tu cuenta. Si no lo ves, revisa la carpeta de spam.
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={8}
                        placeholder="Código"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, ""))}
                        className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-2xl text-center tracking-[0.4em] font-bold focus:outline-none focus:border-green-500 text-white"
                      />
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-60 text-black font-bold py-3 rounded-xl text-sm transition cursor-pointer"
                      >
                        {authLoading ? "Verificando..." : "Verificar y entrar"}
                      </button>
                      <div className="flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={resendCooldown > 0 || authLoading}
                          className="text-green-400 hover:underline disabled:text-gray-600 disabled:no-underline cursor-pointer"
                        >
                          {resendCooldown > 0 ? `Reenviar código en ${resendCooldown}s` : "Reenviar código"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAuthStep("form"); setOtpCode(""); }}
                          className="text-gray-400 hover:underline cursor-pointer"
                        >
                          Cambiar correo
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                  <div className="flex gap-1 p-1 bg-[#050505] rounded-xl border border-gray-900">
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${authMode === "login" ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}
                    >
                      Iniciar sesión
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("register")}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${authMode === "register" ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}
                    >
                      Crear cuenta
                    </button>
                  </div>

                  <form onSubmit={handleAuth} className="space-y-3">
                    <input 
                      type="email" 
                      required
                      autoComplete="email"
                      placeholder="tu@correo.com" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 text-white"
                    />
                    <input 
                      type="password" 
                      required
                      autoComplete={authMode === "login" ? "current-password" : "new-password"}
                      placeholder="Contraseña (mínimo 6)" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 text-white"
                    />
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-60 text-black font-bold py-3 rounded-xl text-sm transition cursor-pointer"
                    >
                      {authLoading ? "Un momento..." : authMode === "login" ? "Entrar" : "Crear mi cuenta"}
                    </button>
                  </form>
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate pr-2">
                    <span className="text-xs text-green-400 font-bold">
                      Cuenta sincronizada (hasta 5 perfiles){accountUser.isAdmin ? " · Administrador" : ""}
                    </span>
                    <p className="text-sm font-bold text-white truncate">{accountUser.email}</p>
                  </div>
                  <button onClick={handleLogout} className="text-xs text-red-400 hover:underline cursor-pointer shrink-0">Cerrar sesión</button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">Este dispositivo</h3>
              <p className="text-xs text-gray-500">Se guarda solo aquí; no afecta a tus otros dispositivos.</p>
            </div>

            <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-gray-900 space-y-4">
              <div className="flex items-center justify-between gap-3 p-2 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#181818] rounded-lg text-gray-400"><Tv className="w-4 h-4" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Modo TV</h4>
                    <p className="text-xs text-gray-500">Interfaz más grande y navegación con mando o control remoto.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={tvMode}
                  aria-label="Modo TV"
                  onClick={() => { setTvMode(!tvMode); flashToast(!tvMode ? "Modo TV activado" : "Modo TV desactivado"); }}
                  className={`relative w-12 h-7 rounded-full transition shrink-0 cursor-pointer ${tvMode ? "bg-green-500" : "bg-gray-700"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${tvMode ? "translate-x-5" : ""}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 p-2 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#181818] rounded-lg text-gray-400"><Shield className="w-4 h-4" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Omitir aviso de anuncios</h4>
                    <p className="text-xs text-gray-500">No mostrar el aviso antes de reproducir.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={skipAdsNotice}
                  aria-label="Omitir aviso de anuncios"
                  onClick={() => { setSkipAdsNotice(!skipAdsNotice); flashToast(!skipAdsNotice ? "El aviso de anuncios ya no se mostrará" : "Se mostrará el aviso antes de reproducir"); }}
                  className={`relative w-12 h-7 rounded-full transition shrink-0 cursor-pointer ${skipAdsNotice ? "bg-green-500" : "bg-gray-700"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${skipAdsNotice ? "translate-x-5" : ""}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-900 p-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#181818] rounded-lg text-gray-400"><Trash2 className="w-4 h-4" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Borrar "Continuar viendo"</h4>
                    <p className="text-xs text-gray-500">Solo el progreso guardado en este dispositivo ({continueWatchingList.length} {continueWatchingList.length === 1 ? "título" : "títulos"}).</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (continueWatchingList.length === 0) { flashToast("No hay nada que borrar"); return; }
                    if (confirm("¿Borrar todo tu historial de Continuar viendo en este dispositivo?")) {
                      setContinueWatchingList([]);
                      flashToast("Historial de Continuar viendo borrado");
                    }
                  }}
                  className="bg-[#181818] hover:bg-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg text-white border border-gray-800 cursor-pointer transition shrink-0"
                >
                  Borrar
                </button>
              </div>
            </div>
          </div>

          {accountUser && (
            <button 
              onClick={handleLogout} 
              className="w-full flex items-center justify-center gap-2 p-3.5 bg-[#121212] hover:bg-gray-800 text-red-400 font-bold rounded-2xl text-xs border border-gray-800 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          )}
        </div>
      )}

      {/* MODAL DE INFORMACIÓN DE PELÍCULA (CON BOTONES FIJOS DE RETROCESO) */}
      {selectedMovie && !isPlaying && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center overflow-y-auto">
          <div className="bg-[#141414] w-full min-h-screen relative shadow-2xl flex flex-col overflow-x-hidden">
            {/* Botón de Retroceso Fijo Superior Izquierdo */}
            <button 
              onClick={() => setSelectedMovie(null)} 
              className="fixed top-4 left-4 sm:top-6 sm:left-6 z-50 bg-black/80 hover:bg-black text-white p-3 rounded-full transition cursor-pointer border border-gray-700 shadow-2xl flex items-center justify-center"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>

            {/* Botón Cerrar Fijo Superior Derecho */}
            <button 
              onClick={() => setSelectedMovie(null)} 
              className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50 bg-black/80 hover:bg-black text-white p-3 rounded-full transition cursor-pointer border border-gray-700 shadow-2xl flex items-center justify-center"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="relative h-[55vh] sm:h-[65vh] w-full bg-cover bg-center flex items-end overflow-hidden" style={{ backgroundImage: `url(${selectedMovie.bgImage})` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/60 to-black/70" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#141414]/90 via-transparent to-transparent" />
              
              <div className="relative z-10 p-4 sm:p-14 space-y-4 max-w-4xl w-full">
                <h2 className="text-3xl sm:text-7xl font-black tracking-wider uppercase leading-none text-red-600 drop-shadow-2xl">
                  {selectedMovie.title}
                  {selectedMovie.subtitle && (
                    <span className="block text-lg sm:text-3xl text-white tracking-widest mt-2 font-extrabold">{selectedMovie.subtitle}</span>
                  )}
                </h2>

                <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold pt-1">
                  <span className="text-green-400 font-bold">★ {selectedMovie.rating}</span>
                  <span className="text-gray-300">{selectedMovie.year}</span>
                  <span className="text-gray-300">{selectedMovie.duration || "2 h 37 min"}</span>
                  <span className="text-gray-300 text-xs bg-gray-800/80 px-2.5 py-0.5 rounded">{selectedMovie.genres ? selectedMovie.genres.join(", ") : selectedMovie.tag}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button 
                    onClick={() => startPlayback()}
                    className="flex items-center gap-2 bg-white hover:bg-gray-200 text-black font-bold px-6 sm:px-7 py-3 rounded-xl transition shadow-xl cursor-pointer text-sm sm:text-base"
                  >
                    <Play className="w-5 h-5 fill-black" /> Reproducir
                  </button>
                  <button 
                    onClick={() => {
                      if (!myList.includes(selectedMovie.title)) {
                        setMyList([...myList, selectedMovie.title]);
                        setToastMessage("¡Añadido a Mi Lista!");
                        setTimeout(() => setToastMessage(""), 3000);
                      } else {
                        setToastMessage("Ya está en tu lista.");
                        setTimeout(() => setToastMessage(""), 3000);
                      }
                    }}
                    className="flex items-center gap-2 bg-[#262626]/90 hover:bg-[#333] text-white font-medium px-5 sm:px-6 py-3 rounded-xl border border-gray-700 transition cursor-pointer text-sm sm:text-base"
                  >
                    <Plus className="w-5 h-5" /> Mi Lista
                  </button>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      setToastMessage("¡Enlace copiado al portapapeles!");
                      setTimeout(() => setToastMessage(""), 3000);
                    }}
                    className="flex items-center gap-2 bg-[#262626]/90 hover:bg-[#333] text-white font-medium px-4 sm:px-5 py-3 rounded-xl border border-gray-700 transition cursor-pointer text-sm sm:text-base"
                  >
                    <Share2 className="w-4 h-4" /> Compartir
                  </button>
                </div>

                <p className="text-gray-300 text-xs sm:text-sm leading-relaxed max-w-3xl line-clamp-2 pt-1">
                  {selectedMovie.desc}
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-14 space-y-6 bg-[#141414] flex-1">
              <div className="flex items-center gap-6 sm:gap-8 border-b border-gray-800 text-sm font-bold overflow-x-auto scrollbar-none">
                <button 
                  onClick={() => setMovieModalTab("detalles")}
                  className={`pb-3 relative cursor-pointer whitespace-nowrap ${movieModalTab === "detalles" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white"}`}
                >
                  Detalles
                </button>
                <button 
                  onClick={() => setMovieModalTab("reparto")}
                  className={`pb-3 relative cursor-pointer whitespace-nowrap ${movieModalTab === "reparto" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white"}`}
                >
                  Reparto
                </button>
                <button 
                  onClick={() => setMovieModalTab("similares")}
                  className={`pb-3 relative cursor-pointer whitespace-nowrap ${movieModalTab === "similares" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white"}`}
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
                      <span className="text-gray-200 font-medium">{selectedMovie.genres ? selectedMovie.genres.join(", ") : selectedMovie.tag}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Reparto</span>
                      <span className="text-gray-200 font-medium">{selectedMovie.cast || "Hwang Jung-min, Jo In-sung, Jung Ho-yeon"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Productora</span>
                      <span className="text-gray-200 font-medium">{selectedMovie.production || "Forged Films"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Estado</span>
                      <span className="text-gray-200 font-medium">Estrenada</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Idioma original</span>
                      <span className="text-gray-200 font-medium uppercase">{selectedMovie.originalLanguage || "KO"}</span>
                    </div>
                  </div>
                </div>
              )}

              {movieModalTab === "reparto" && (
                <div className="text-sm text-gray-300 py-4 space-y-2 max-w-6xl">
                  <p className="font-bold text-white text-base">Elenco principal:</p>
                  <p className="text-gray-400 text-sm">{selectedMovie.cast || "Hwang Jung-min, Jo In-sung, Jung Ho-yeon, Alicia Vikander"}</p>
                </div>
              )}

              {movieModalTab === "similares" && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 max-w-6xl">
                  {customMovies.filter(m => m.id !== selectedMovie.id).slice(0, 4).map(sim => (
                    <div key={sim.id} onClick={() => setSelectedMovie(sim)} className="cursor-pointer group">
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

      {/* REPRODUCTOR FLOTANTE MODERNO - ADAPTADO A MÓVILES */}
      {selectedMovie && isPlaying && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col justify-between overflow-x-hidden">
          <div className="p-4 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent z-20">
            <button 
              onClick={() => setIsPlaying(false)}
              className="flex items-center gap-2 text-white font-bold hover:text-green-400 transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" /> <span className="truncate max-w-[250px] sm:max-w-none">{selectedMovie.title}</span>
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center relative bg-black overflow-hidden">
            <MoviePlayer
              key={String(selectedMovie.id)}
              movie={selectedMovie}
              fallbackUrl={heroMovie.videoUrl}
              startAt={continueWatchingList.find((x) => String(x.id) === String(selectedMovie.id))?.t}
              onProgress={(t, d) => saveProgress(selectedMovie, t, d)}
            />
          </div>

          <div className="p-3 sm:p-4 bg-[#0a0a0a] border-t border-gray-900 flex flex-col sm:flex-row items-center justify-between gap-4 z-20">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button 
                onClick={() => setIsPlaying(false)}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer text-gray-300"
              >
                <ArrowLeft className="w-4 h-4 text-green-400" /> Anterior
              </button>
              <button 
                onClick={() => {
                  const v = document.querySelector("video") as any;
                  if (!v) return;
                  if (v.webkitEnterFullscreen) {
                    v.webkitEnterFullscreen(); // iPhone / iPad
                  } else if (v.requestFullscreen) {
                    v.requestFullscreen().catch(() => {});
                  } else if (v.webkitRequestFullscreen) {
                    v.webkitRequestFullscreen();
                  }
                }}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer"
              >
                <Maximize2 className="w-4 h-4 text-green-400" /> Pantalla completa
              </button>
              <button 
                onClick={handleCast}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  castState === "idle"
                    ? "bg-[#181818] hover:bg-gray-800 border-gray-800"
                    : "bg-green-500/15 border-green-500/60 text-green-300"
                }`}
              >
                <Cast className={`w-4 h-4 text-green-400 ${castState === "connecting" ? "animate-pulse" : ""}`} />
                {castState === "idle" ? "Transmitir" : castState === "connecting" ? "Conectando..." : "Transmitiendo"}
              </button>
              <button 
                onClick={() => {
                  if (!myList.includes(selectedMovie.title)) {
                    setMyList([...myList, selectedMovie.title]);
                    setToastMessage("¡Añadido a Mi Lista!");
                    setTimeout(() => setToastMessage(""), 3000);
                  }
                }}
                className="flex items-center gap-1.5 bg-[#181818] hover:bg-gray-800 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold border border-gray-800 transition cursor-pointer"
              >
                <Plus className="w-4 h-4 text-green-400" /> Mi Lista
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

      {/* BARRA DE NAVEGACIÓN INFERIOR (SOLO MÓVIL) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 transform-gpu bg-black/60 backdrop-blur-2xl border-t border-white/10"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around px-2 pt-3 pb-3">
          {[
            { id: "inicio", label: "Inicio", Icon: HomeIcon },
            { id: "explorar", label: "Explorar", Icon: Search },
            { id: "tv", label: "TV", Icon: Tv },
            { id: "milista", label: "Mi Lista", Icon: Bookmark },
          ].map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id as typeof activeTab)}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="flex flex-1 flex-col items-center gap-1.5 cursor-pointer select-none active:scale-95 transition"
              >
                <Icon
                  className={`w-7 h-7 transition-colors ${active ? "text-white" : "text-gray-400"}`}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className={`text-[13px] leading-none transition-colors ${active ? "text-white font-semibold" : "text-gray-400 font-medium"}`}>
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
            className="bg-white text-black font-bold px-4 py-2 rounded-xl text-xs hover:bg-gray-200 transition cursor-pointer shrink-0"
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

      {/* MODAL CREAR PERFIL */}
      {showAddProfileModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0c0c0c] border border-emerald-500/30 w-full max-w-lg rounded-2xl p-6 relative space-y-6 shadow-2xl">
            <button onClick={() => { setShowAddProfileModal(false); setUsernameError(""); }} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer">
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
                  className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white"
                />
                {usernameError && (
                  <p className="text-xs text-red-500 font-bold mt-1.5">{usernameError}</p>
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
                    className="w-full bg-[#121212] border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-h-48 overflow-y-auto p-2 scrollbar-none bg-[#080808] rounded-xl border border-gray-900">
                  {filteredAvatars.map((item, i) => (
                    <div 
                      key={i} 
                      onClick={() => setNewProfileAvatar(item.file)}
                      className={`flex flex-col items-center p-2 rounded-xl cursor-pointer border-2 transition ${newProfileAvatar === item.file ? "border-emerald-400 bg-emerald-500/10 scale-105" : "border-transparent hover:bg-gray-900"}`}
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
              <button onClick={() => { setShowAddProfileModal(false); setUsernameError(""); }} className="flex-1 bg-[#1a1a1a] hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-xs border border-gray-800 transition cursor-pointer">
                Cancelar
              </button>
              <button onClick={handleCreateProfile} className="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-xs transition cursor-pointer">
                Crear perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AVISO DE ANUNCIOS ANTES DE REPRODUCIR */}
      {showAdNotice && selectedMovie && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f0f0f] border border-green-500/30 w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/10 text-green-400 rounded-xl shrink-0"><Shield className="w-6 h-6" /></div>
              <h3 className="text-lg font-bold text-white">Aviso antes de reproducir</h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              Vas a ver <span className="font-bold text-white">{selectedMovie.title}</span>. Algunos servidores externos pueden mostrar anuncios o ventanas emergentes que Cineverso Mágico no controla. Si aparece alguno, ciérralo y sigue viendo.
            </p>
            <label className="flex items-center gap-3 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipAdsNotice}
                onChange={(e) => setSkipAdsNotice(e.target.checked)}
                className="w-5 h-5 accent-green-500 cursor-pointer"
              />
              No volver a mostrar este aviso
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAdNotice(false)}
                className="flex-1 bg-[#1a1a1a] hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-sm border border-gray-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowAdNotice(false); setIsPlaying(true); }}
                className="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl text-sm transition cursor-pointer"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
