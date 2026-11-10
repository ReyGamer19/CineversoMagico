#!/usr/bin/env node
// Aplica los arreglos de Cineverso Magico a tu page.tsx (hace copia de seguridad antes).
// Uso:  node aplicar-arreglos.mjs            (busca el archivo solo)
//       node aplicar-arreglos.mjs ruta/a/page.tsx
import fs from "node:fs";
import path from "node:path";

const candidatos = [
  process.argv[2],
  "app/page.tsx",
  "src/app/page.tsx",
  "pages/index.tsx",
  "src/pages/index.tsx",
].filter(Boolean);

const archivo = candidatos.find((p) => fs.existsSync(p));
if (!archivo) {
  console.error("No encontré page.tsx. Ejecuta esto dentro de la carpeta del proyecto o pasa la ruta:\n  node aplicar-arreglos.mjs ruta/a/page.tsx");
  process.exit(1);
}

let code = fs.readFileSync(archivo, "utf8");
if (!code.includes("Cineverso Magico")) {
  console.error(`El archivo ${archivo} no parece ser el de Cineverso Magico. No toqué nada.`);
  process.exit(1);
}

const TV_BLOCK = `{activeTab === "tv" && (
        <div className="fixed left-0 right-0 top-14 md:top-20 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-0 bg-[#050505] flex flex-col lg:flex-row overflow-hidden">

          {/* REPRODUCTOR */}
          <div className="w-full lg:flex-1 lg:h-full relative bg-black flex flex-col shrink-0">
            <div className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 relative bg-black overflow-hidden">
              {activeChannel.embedUrl ? (
                <iframe
                  key={activeChannel.id}
                  src={\`\${activeChannel.embedUrl}\${activeChannel.embedUrl.includes('?') ? '&' : '?'}autoplay=1&mute=0&rel=0&iv_load_policy=3\`}
                  title={activeChannel.name}
                  className="w-full h-full border-0"
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

            {/* INFO DEL CANAL (con EN VIVO al lado del nombre) */}
            <div className="px-3 py-2.5 sm:p-4 bg-[#0a0a0a] border-t border-gray-900 flex items-center justify-between z-20 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-900 border border-gray-800 shrink-0 flex items-center justify-center text-[10px] font-black text-gray-200 overflow-hidden">
                  {activeChannel.shortCode || activeChannel.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-white truncate">{activeChannel.name}</h3>
                    <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      EN VIVO
                    </span>
                    <span className="hidden sm:inline-block text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">{activeChannel.country}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate">Emitiendo: <span className="text-gray-200 font-medium">{activeChannel.currentShow}</span></p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs bg-[#181818] px-3 py-1 rounded-lg text-gray-300 border border-gray-800 font-bold shrink-0 ml-2">{activeChannel.category}</span>
            </div>
          </div>

          {/* GUIA DE CANALES: todo el panel hace scroll */}
          <div className="w-full lg:w-80 flex-1 min-h-0 lg:flex-none lg:h-full bg-[#0d0d0d] border-t lg:border-t-0 lg:border-l border-gray-900 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
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
                  className="w-full bg-[#161616] border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 scrollbar-none text-[11px]">
                {["Todos", "Perú", "Chile", "Argentina", "Bolivia", "Italia", "España", "Ecuador", "Deportes"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSelectedCountryFilter(filter)}
                    className={\`px-3 py-1.5 rounded-md font-semibold transition whitespace-nowrap cursor-pointer touch-manipulation focus:outline-none focus:ring-2 focus:ring-green-500 \${selectedCountryFilter === filter ? "bg-green-500 text-black font-bold" : "bg-[#161616] text-gray-400 hover:text-white border border-gray-800"}\`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 pb-6 space-y-4">
              {Object.entries(channelsGroupedByCountry).map(([countryName, channels]) => (
                <div key={countryName} className="space-y-2">
                  <div className="sticky top-0 -mx-3 px-4 bg-[#0d0d0d] py-2 z-10 border-b border-gray-800/60 flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-green-400">{countryName}</h4>
                    <span className="text-[10px] bg-gray-900 text-gray-400 px-2 py-0.5 rounded-full font-bold">{channels.length}</span>
                  </div>

                  <div className="space-y-1.5">
                    {channels.map((ch) => (
                      <div
                        key={ch.id}
                        onClick={() => setActiveChannel(ch)}
                        tabIndex={0}
                        className={\`p-2.5 rounded-xl flex items-center gap-3 cursor-pointer select-none touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-[#222] transition border focus:outline-none focus:ring-2 focus:ring-green-500 \${activeChannel.id === ch.id ? "bg-[#1c1c1c] border-green-500/80 shadow-md shadow-green-950/30" : "hover:bg-[#151515] border-transparent"}\`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center font-black text-xs text-gray-200 border border-gray-800 shrink-0 overflow-hidden">
                          <span>{ch.shortCode || ch.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
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
      )}`;
const EFFECT_BLOCK = `useEffect(() => {
    const video = videoRef.current;
    if (!video || activeChannel.embedUrl || !activeChannel.videoUrl) return;

    let hls: Hls | null = null;

    // Intenta con sonido; si el celular lo bloquea, arranca en silencio
    const tryPlay = () => {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    };

    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(activeChannel.videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = activeChannel.videoUrl;
      video.addEventListener("loadedmetadata", tryPlay, { once: true });
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [activeChannel]);`;

const ok = [];
const fallos = [];
const reemplazar = (nombre, viejo, nuevo) => {
  if (code.includes(nuevo)) { ok.push(nombre + " (ya estaba aplicado)"); return; }
  if (!code.includes(viejo)) { fallos.push(nombre); return; }
  code = code.replace(viejo, () => nuevo);
  ok.push(nombre);
};

// 1) Encabezado: logo H, título en una línea, estrella solo en pantallas grandes
reemplazar(
  "Logo H",
  'className="bg-green-500 text-black font-black px-2 py-0.5 rounded text-lg sm:text-xl shadow-lg shadow-green-500/20"',
  'className="shrink-0 bg-green-500 text-black font-black px-2 py-0.5 rounded text-lg sm:text-xl shadow-lg shadow-green-500/20"'
);
reemplazar(
  "Título en una línea",
  'className="text-lg sm:text-2xl font-black tracking-wide bg-gradient-to-r',
  'className="whitespace-nowrap text-base sm:text-2xl font-black tracking-wide bg-gradient-to-r'
);
reemplazar(
  "Estrella del título",
  'Cineverso Magico <Sparkle className="w-4 h-4 text-emerald-400 animate-pulse" />',
  'Cineverso Magico <Sparkle className="hidden sm:block w-4 h-4 text-emerald-400 animate-pulse" />'
);

// 2) Avatar sin deformar
reemplazar(
  "Contenedor del avatar",
  'className="flex items-center gap-2 cursor-pointer bg-[#121212] p-1 pr-3 rounded-full border border-gray-800 hover:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition"',
  'className="shrink-0 flex items-center gap-2 cursor-pointer bg-[#121212] p-0.5 sm:p-1 sm:pr-3 rounded-xl border border-gray-800 hover:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition touch-manipulation"'
);
reemplazar(
  "Imagen del avatar",
  'className="w-7 h-7 rounded-full object-cover bg-gray-900"',
  'className="w-8 h-8 sm:w-7 sm:h-7 shrink-0 rounded-lg object-cover object-top bg-gray-900"'
);

// 3) Reproducción automática (con respaldo en silencio)
if (code.includes("const tryPlay = () =>")) {
  ok.push("Reproducción automática (ya estaba aplicado)");
} else {
  const reEffect = /useEffect\(\(\) => \{\s*const video = videoRef\.current;[\s\S]*?\}, \[activeChannel\]\);/;
  if (reEffect.test(code)) {
    code = code.replace(reEffect, () => EFFECT_BLOCK);
    ok.push("Reproducción automática");
  } else {
    fallos.push("Reproducción automática");
  }
}

// 4) Vista de TV completa
if (code.includes("inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-extrabold")) {
  ok.push("Vista de TV (ya estaba aplicado)");
} else {
  const inicio = code.indexOf('{activeTab === "tv" && (');
  const finMarca = code.indexOf("{/* VISTA MI LISTA */}");
  if (inicio !== -1 && finMarca !== -1 && finMarca > inicio) {
    code = code.slice(0, inicio) + TV_BLOCK + "\n\n      " + code.slice(finMarca);
    ok.push("Vista de TV");
  } else {
    fallos.push("Vista de TV");
  }
}

if (fallos.length) {
  console.log("\nNo pude aplicar estos cambios (el código es distinto al que me pasaste):");
  fallos.forEach((f) => console.log("  ✗ " + f));
}

const aplicados = ok.filter((o) => !o.includes("ya estaba"));
if (aplicados.length) {
  const copia = archivo + ".bak";
  fs.copyFileSync(archivo, copia);
  fs.writeFileSync(archivo, code, "utf8");
  console.log("\nAplicado en " + path.resolve(archivo));
  console.log("Copia de seguridad: " + path.resolve(copia));
}
ok.forEach((o) => console.log("  ✓ " + o));
if (!aplicados.length && !fallos.length) console.log("\nTodo ya estaba aplicado. No hubo cambios.");
process.exit(fallos.length ? 2 : 0);
