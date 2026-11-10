"use client";

import React, { useState, useEffect, useRef } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import Hls from "hls.js";
import type { Movie } from "../lib/types";

// ===== REPRODUCTOR ROBUSTO (MP4 / HLS, con respaldo y manejo de errores) =====
export default function MoviePlayer({ movie, fallbackUrl, startAt, onProgress }: { movie: Movie; fallbackUrl?: string; startAt?: number; onProgress?: (t: number, d: number) => void }) {
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
