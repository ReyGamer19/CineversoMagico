"use client";

import React from "react";
import type { Movie, ContinueItem } from "../lib/types";
import { formatRemaining } from "../lib/format";

interface ContinueRowProps {
  items: ContinueItem[];
  movies: Movie[];
  onResume: (movie: Movie) => void;
}

// Fila "Continuar viendo" con barra de progreso
export default function ContinueRow({ items, movies, onResume }: ContinueRowProps) {
  if (items.length === 0) return null;

  return (
      <div>
        <h2 className="text-lg font-bold mb-4 text-white">Continuar viendo</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none w-full">
          {items.map((item) => {
            const pct = Math.min(100, Math.max(0, Math.round((item.t / item.d) * 100)));
            return (
              <div
                key={String(item.id)}
                onClick={() => {
                  const m = movies.find((x) => String(x.id) === String(item.id));
                  if (m) onResume(m);
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
  );
}
