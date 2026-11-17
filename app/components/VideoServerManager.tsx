
"use client";

import { useState } from "react";
import type { VideoServer, VideoServerType } from "../lib/types";

interface VideoServerManagerProps {
  servers: VideoServer[];
  onChange: (servers: VideoServer[]) => void;
}

const SERVER_TYPES: {
  value: VideoServerType;
  label: string;
}[] = [
  { value: "auto", label: "Automático" },
  { value: "mp4", label: "MP4 directo" },
  { value: "hls", label: "HLS (.m3u8)" },
  { value: "dash", label: "DASH (.mpd)" },
  { value: "iframe", label: "Iframe / Embed" },
];

export default function VideoServerManager({
  servers,
  onChange,
}: VideoServerManagerProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<VideoServerType>("auto");

  const addServer = () => {
    const cleanUrl = url.trim();

    if (!cleanUrl) {
      alert("Ingresa el enlace del servidor.");
      return;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      alert("El enlace ingresado no es válido.");
      return;
    }

    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.protocol !== "http:"
    ) {
      alert("Solo se permiten enlaces HTTP o HTTPS.");
      return;
    }

    const duplicate = servers.some(
      (server) => server.url.trim() === cleanUrl
    );

    if (duplicate) {
      alert("Este servidor ya está agregado.");
      return;
    }

    const newServer: VideoServer = {
      id:
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `server-${Date.now()}`,
      name: name.trim() || `Servidor ${servers.length + 1}`,
      url: cleanUrl,
      type,
    };

    onChange([...servers, newServer]);

    setName("");
    setUrl("");
    setType("auto");
  };

  const removeServer = (id: string) => {
    if (!confirm("¿Eliminar este servidor de reproducción?")) {
      return;
    }

    onChange(servers.filter((server) => server.id !== id));
  };

  const moveServer = (index: number, direction: -1 | 1) => {
    const target = index + direction;

    if (target < 0 || target >= servers.length) {
      return;
    }

    const updated = [...servers];

    [updated[index], updated[target]] = [
      updated[target],
      updated[index],
    ];

    onChange(updated);
  };

  return (
    <section className="mt-5 rounded-2xl border border-gray-800 bg-[#090909] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">
            SERVIDORES DE REPRODUCCIÓN
          </h3>

          <p className="mt-1 text-xs text-gray-500">
            Agrega diferentes fuentes para este contenido.
          </p>
        </div>

        <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400">
          {servers.length} servidores
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-gray-400">
            Nombre del servidor
          </label>

          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ejemplo: Servidor HD"
            maxLength={50}
            className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-green-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-400">
            Enlace de reproducción
          </label>

          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-green-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-400">
            Tipo de reproducción
          </label>

          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as VideoServerType)
            }
            className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-green-500"
          >
            {SERVER_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={addServer}
          className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-500"
        >
          + AGREGAR SERVIDOR
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {servers.map((server, index) => (
          <div
            key={server.id}
            className="rounded-xl border border-gray-800 bg-black p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  {server.name || `Servidor ${index + 1}`}
                </p>

                <p className="mt-1 break-all text-xs text-gray-500">
                  {server.url}
                </p>

                <span className="mt-2 inline-block rounded-md bg-green-500/10 px-2 py-1 text-[10px] font-bold uppercase text-green-400">
                  {server.type || "auto"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => removeServer(server.id)}
                className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20"
              >
                Eliminar
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveServer(index, -1)}
                className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-white disabled:opacity-30"
              >
                ↑ Subir
              </button>

              <button
                type="button"
                disabled={index === servers.length - 1}
                onClick={() => moveServer(index, 1)}
                className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-white disabled:opacity-30"
              >
                ↓ Bajar
              </button>
            </div>
          </div>
        ))}

        {servers.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-800 p-5 text-center">
            <p className="text-sm text-gray-500">
              Todavía no hay servidores agregados.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
