"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Info, Plus, Search, Bell, Sparkles, Check, 
  Tv, Shield, User, PlusCircle, Trash2, ChevronRight, X, AlertCircle, FileText, LogOut, Lock, Sparkle, Settings, Film, Radio, Globe, ChevronDown, Edit3, Share2, Cast, Maximize2, RefreshCw, ArrowLeft, SkipForward, SkipBack, Download, Home as HomeIcon, Bookmark
} from "lucide-react";
import Hls from "hls.js";
import type { Profile, Movie, Channel, ContinueItem, EpgItem, EpgMap, NowNext } from "./lib/types";
import { liveChannels as liveChannelsData } from "./data/channels";
import { genresList as genresListData } from "./data/genres";
import { myAvatars as myAvatarsData } from "./data/avatars";


function formatRemaining(sec: number) {
  const totalMin = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `Quedan ${h} h ${m} min` : `Quedan ${m} min`;
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

// Un sitio HTTPS no puede reproducir enlaces http:// (contenido mixto). Esos canales se sirven
// a través de /api/stream, que los descarga en el servidor y los devuelve por HTTPS.
const proxyUrl = (u: string) => `/api/stream?url=${encodeURIComponent(u)}`;
const needsProxy = (u: string) =>
  typeof window !== "undefined" && window.location.protocol === "https:" && /^http:\/\//i.test(u);

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
  const myAvatars = myAvatarsData;

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

  const genresList = genresListData;

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
  const liveChannels = liveChannelsData;

  const [activeChannel, setActiveChannel] = useState<Channel>(liveChannels[0]);
  const nowNext = nowTick > 0 ? getNowNext(epg[activeChannel.id], tzForChannel(activeChannel), new Date(nowTick)) : null;
  const [selectedCountryFilter, setSelectedCountryFilter] = useState<string>("Todos");
  const [searchGuide, setSearchGuide] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [tvPlaybackError, setTvPlaybackError] = useState<string>("");
  const [tvRetryKey, setTvRetryKey] = useState(0);

  useEffect(() => {
    // No iniciar descargas de TV mientras el usuario está en otra sección.
    if (activeTab !== "tv") return;

    const video = videoRef.current;
    if (!video || activeChannel.embedUrl || !activeChannel.videoUrl) return;

    let hls: Hls | null = null;
    let disposed = false;
    let networkRetries = 0;
    let mediaRecoveries = 0;
    let nativeMode = false;
    const source = activeChannel.videoUrl;
    // Los enlaces http:// van por el proxy. Si un enlace https:// falla por CORS o porque el
    // servidor rechaza la conexión directa, se reintenta una vez a través del proxy.
    let proxied = needsProxy(source);
    const currentSource = () => (proxied ? proxyUrl(source) : source);
    setTvPlaybackError("");

    const showError = (message: string) => {
      if (!disposed) setTvPlaybackError(message);
    };
    const playWhenReady = () => {
      if (disposed) return;
      setTvPlaybackError("");
      // iOS/Android pueden bloquear autoplay con sonido. Los controles nativos
      // siguen disponibles para iniciar manualmente la señal.
      video.play().catch(() => {});
    };

    const attachNative = () => {
      if (disposed) return;
      nativeMode = true;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.removeAttribute("src");
      video.src = currentSource();
      video.load();
      video.addEventListener("loadedmetadata", playWhenReady, { once: true });
      video.addEventListener("canplay", playWhenReady, { once: true });
    };

    const onVideoError = () => {
      if (disposed) return;
      // En modo nativo, si falló la conexión directa, probar a través del proxy
      if (nativeMode && !proxied) {
        proxied = true;
        attachNative();
        return;
      }
      // Con hls.js activo, un error de decodificación se intenta recuperar antes de mostrarlo
      // (el segundo intento cambia el códec de audio, que arregla muchas señales con AC-3/MP2)
      if (hls && !nativeMode && mediaRecoveries < 2) {
        mediaRecoveries += 1;
        if (mediaRecoveries === 2) hls.swapAudioCodec();
        hls.recoverMediaError();
        return;
      }
      const code = video.error?.code;
      const messages: Record<number, string> = {
        1: "La reproducción fue interrumpida. Pulsa Reintentar.",
        2: "Problema de conexión con el servidor del canal.",
        3: "Este dispositivo no puede reproducir el formato de audio o video de este canal. Prueba en otro dispositivo o navegador.",
        4: "El enlace no es compatible o el servidor no permite reproducirlo aquí.",
      };
      showError((messages[code || 0] || "No se pudo iniciar esta señal. Comprueba el enlace del canal.") + ` [video:${code ?? 0}]`);
    };

    const startHls = () => {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
        // Empieza asumiendo ~3 Mbps (antes ~0,5): arranca en mejor calidad y sube antes a la máxima
        abrEwmaDefaultEstimate: 3_000_000,
        // No limitar la calidad al tamaño del reproductor (se ve más nítido en pantallas pequeñas)
        capLevelToPlayerSize: false,
        // Pide el primer fragmento mientras todavía carga la lista de calidades
        startFragPrefetch: true,
        maxBufferLength: 20,
        maxMaxBufferLength: 40,
        backBufferLength: 15,
        // Tiempos más cortos: un canal caído falla rápido en vez de quedarse cargando
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 800,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 3,
        fragLoadingRetryDelay: 800,
      });
      hls.on(Hls.Events.MANIFEST_PARSED, playWhenReady);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (disposed || !hls || !data.fatal) return;
        // Conexión directa bloqueada (CORS, servidor que la rechaza): reintentar con el proxy
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !proxied) {
          proxied = true;
          networkRetries = 0;
          hls.destroy();
          hls = null;
          startHls();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 3) {
          networkRetries += 1;
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
          mediaRecoveries += 1;
          if (mediaRecoveries === 2) hls.swapAudioCodec();
          hls.recoverMediaError();
          return;
        }
        // Si el navegador también ofrece HLS nativo, intentar esa ruta como respaldo.
        if (nativeHls && !nativeMode) {
          attachNative();
          return;
        }
        showError((data.type === Hls.ErrorTypes.NETWORK_ERROR
          ? "El canal no responde en este momento (puede estar caído o fuera de línea)."
          : "Este dispositivo no puede reproducir el formato de audio o video de este canal. Prueba en otro dispositivo o navegador.") + ` [${data.details}]`);
        hls.destroy();
        hls = null;
      });
      hls.loadSource(currentSource());
      hls.attachMedia(video);
    };

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const useNativeHls = Boolean(nativeHls) && (isAppleMobile || !Hls.isSupported());
    const isMp4 = /\.mp4(\?|$)/i.test(source);

    video.addEventListener("error", onVideoError);

    if (isMp4 || useNativeHls) {
      attachNative();
    } else if (Hls.isSupported()) {
      startHls();
    } else if (nativeHls) {
      attachNative();
    } else {
      showError("Este navegador no admite HLS para este canal. Se necesita una fuente MP4/HLS compatible.");
    }

    return () => {
      disposed = true;
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("loadedmetadata", playWhenReady);
      video.removeEventListener("canplay", playWhenReady);
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [activeChannel, activeTab, tvRetryKey]);

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
                {!activeChannel.embedUrl && tvPlaybackError && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/90 p-5 text-center">
                    <AlertCircle className="h-10 w-10 text-amber-400" />
                    <p className="max-w-md text-sm font-semibold text-white">No se pudo reproducir {activeChannel.name}</p>
                    <p className="max-w-md text-xs leading-relaxed text-gray-300">{tvPlaybackError}</p>
                    <button
                      type="button"
                      onClick={() => { setTvPlaybackError(""); setTvRetryKey((key) => key + 1); }}
                      className="rounded-xl bg-green-500 px-5 py-2.5 text-sm font-bold text-black"
                    >
                      Reintentar señal
                    </button>
                  </div>
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
                          style={{ contentVisibility: "auto", containIntrinsicSize: "56px" }}
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
