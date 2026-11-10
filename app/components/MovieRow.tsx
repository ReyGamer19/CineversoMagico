"use client";

import React from "react";
import type { Movie } from "../lib/types";

interface MovieRowProps {
  title: string;
  movies: Movie[];
  onSelect: (movie: Movie) => void;
}

// Fila horizontal de pósters
export default function MovieRow({ title, movies, onSelect }: MovieRowProps) {
  if (movies.length === 0) return null;

  return (
      <div>
        <h2 className="text-lg font-bold mb-4 text-white">{title}</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none w-full">
          {movies.map((item) => (
            <div key={item.id} onClick={() => onSelect(item)} className="min-w-[150px] sm:min-w-[180px] group cursor-pointer shrink-0">
              <img src={item.bgImage} alt={item.title} className="w-full h-40 sm:h-48 object-cover rounded-xl border border-gray-900 group-hover:border-green-500 transition shadow-lg" />
              <h4 className="text-xs font-semibold mt-2 text-gray-300 truncate">{item.title}</h4>
              <span className="text-[10px] text-green-400 font-medium">{item.tag}</span>
            </div>
          ))}
        </div>
      </div>
  );
}
