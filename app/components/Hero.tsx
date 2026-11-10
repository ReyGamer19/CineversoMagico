"use client";

import React, { useRef } from "react";
import { Play, Info, Plus } from "lucide-react";
import type { Movie } from "../lib/types";

interface HeroProps {
  slides: Movie[];
  safeIndex: number;
  setHeroIndex: React.Dispatch<React.SetStateAction<number>>;
  setHeroPaused: (paused: boolean) => void;
  setMyList: React.Dispatch<React.SetStateAction<string[]>>;
  onPlay: (movie: Movie) => void;
  onInfo: (movie: Movie) => void;
}

// Banner principal con carrusel
export default function Hero({ slides, safeIndex, setHeroIndex, setHeroPaused, setMyList, onPlay, onInfo }: HeroProps) {
  const heroTouchX = useRef(0);
  const heroMovie: Movie = slides[safeIndex];

  return (
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
            onClick={() => onPlay(heroMovie)}
            className="flex items-center gap-2 bg-white text-black font-bold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition cursor-pointer text-sm"
          >
            <Play className="w-5 h-5 fill-black" /> Reproducir
          </button>
          <button 
            onClick={() => onInfo(heroMovie)}
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
  );
}
