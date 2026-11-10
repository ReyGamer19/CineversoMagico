"use client";

import React from "react";
import { Sparkle, Settings, Search, Sparkles, Bell } from "lucide-react";
import type { Profile, Tab } from "../lib/types";

interface NavbarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  myListCount: number;
  isAdmin: boolean;
  activeProfile: Profile;
}

// Barra de navegación superior
export default function Navbar({ activeTab, setActiveTab, myListCount, isAdmin, activeProfile }: NavbarProps) {
  return (
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
          <button onClick={() => setActiveTab("milista")} className={`${activeTab === "milista" ? "text-white font-bold" : "hover:text-green-400"}`}>Mi Lista ({myListCount})</button>

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
  );
}
