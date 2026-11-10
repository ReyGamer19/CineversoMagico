// Tipos compartidos de Cineverso Mágico

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  isKid: boolean;
  pin?: string;
}

export interface Movie {
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

export interface Channel {
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

export interface ContinueItem {
  id: number | string;
  title: string;
  img: string;
  t: number; // segundo donde se quedó
  d: number; // duración total
  updatedAt: number;
}

// ===== GUÍA DE PROGRAMACIÓN (Ahora / Después) =====
export interface EpgItem {
  t: string; // hora de inicio "HH:MM" (hora local del canal)
  title: string;
}
export type EpgMap = Record<string, EpgItem[]>;

export interface NowNext {
  current: EpgItem;
  next: EpgItem | null;
  progress: number; // 0 a 100
}

// Pestañas principales de la app
export type Tab = "inicio" | "explorar" | "tv" | "milista" | "cuenta" | "admin";
