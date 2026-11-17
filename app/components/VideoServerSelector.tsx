
"use client";

import type { VideoServer } from "../lib/types";

interface VideoServerSelectorProps {
  servers: VideoServer[];
  selectedServerId: string;
  onSelect: (server: VideoServer) => void;
}

export default function VideoServerSelector({
  servers,
  selectedServerId,
  onSelect,
}: VideoServerSelectorProps) {
  if (!servers || servers.length === 0) return null;

  return (
    <div className="w-full border-t border-white/10 bg-[#090909] px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold tracking-wider text-gray-300">
          SERVIDORES DISPONIBLES
        </span>

        <span className="text-xs text-gray-500">
          {servers.length} opciones
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {servers.map((server, index) => {
          const active = selectedServerId === server.id;

          return (
            <button
              key={server.id}
              type="button"
              onClick={() => onSelect(server)}
              aria-pressed={active}
              className={`rounded-lg border px-4 py-2 text-xs font-bold transition ${
                active
                  ? "border-green-500 bg-green-600 text-white"
                  : "border-gray-700 bg-[#151515] text-gray-300 hover:border-green-500 hover:text-white"
              }`}
            >
              {server.name || `Servidor ${index + 1}`}
              {active ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        Si un servidor no funciona, prueba seleccionando otro.
      </p>
    </div>
  );
}
