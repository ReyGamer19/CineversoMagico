// Uso (desde la carpeta del proyecto):  node arreglar-tv.js
// Arregla: menu duplicado en celular, barra superior en 3 lineas y vista de TV (reproductor fijo + lista con scroll)
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "page.tsx");
if (!fs.existsSync(file)) {
  console.error("No encuentro app/page.tsx. Ejecuta este script dentro de la carpeta mi-streaming-app.");
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
const usesCRLF = original.includes("\r\n");
let src = original.replace(/\r\n/g, "\n");

if (src.includes("top-14 md:top-20")) {
  console.log("Parece que los cambios ya estaban aplicados. No hago nada.");
  process.exit(0);
}

fs.writeFileSync(file + ".backup", original);
console.log("Copia de seguridad creada: app/page.tsx.backup");

let fallos = 0;
function reemplazar(nombre, viejo, nuevo) {
  if (!src.includes(viejo)) {
    console.log("  [FALLO] " + nombre + " (no encontrado)");
    fallos++;
    return;
  }
  src = src.replace(viejo, () => nuevo);
  console.log("  [OK]    " + nombre);
}

// 1. Barra superior
reemplazar(
  "Barra superior de una sola linea",
  '<nav className="fixed top-0 left-0 right-0 z-40 flex flex-wrap items-center justify-between px-4 sm:px-6 md:px-12 py-3 bg-black/90 backdrop-blur-md border-b border-gray-900/80 gap-3">',
  '<nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-6 md:px-12 h-14 md:h-auto md:py-3 bg-black/90 backdrop-blur-md border-b border-gray-900/80 gap-3">'
);

reemplazar(
  "Contenedor del logo",
  '<div className="flex items-center gap-4 sm:gap-6 flex-wrap">',
  '<div className="flex items-center gap-4 sm:gap-6 min-w-0">'
);

// 2. Ocultar pestanas en celular
reemplazar(
  "Ocultar menu duplicado en celular",
  '<div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm font-medium text-gray-300">',
  '<div className="hidden md:flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm font-medium text-gray-300">'
);

// 3. Boton admin para celular
const contDer = '<div className="flex items-center gap-3 text-gray-300 ml-auto">';
reemplazar(
  "Boton de administracion en celular",
  contDer,
  contDer +
    '\n          {isAdmin && (\n            <button onClick={() => setActiveTab("admin")} className="md:hidden p-2 rounded-full text-green-400 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Panel de administración">\n              <Settings className="w-5 h-5" />\n            </button>\n          )}'
);

// 4. Nombre del perfil
reemplazar(
  "Nombre de perfil oculto en pantallas muy chicas",
  '<span className="text-xs font-bold text-white max-w-[100px] truncate">{activeProfile.name}</span>',
  '<span className="hidden sm:inline text-xs font-bold text-white max-w-[100px] truncate">{activeProfile.name}</span>'
);

// 5. Vista de TV completa
const NUEVO_TV = `{/* VISTA TV EN VIVO - reproductor fijo, solo la guia hace scroll */}
      {activeTab === "tv" && (
        <div className="fixed left-0 right-0 top-14 md:top-20 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-0 bg-[#050505] flex flex-col lg:flex-row overflow-hidden">

          {/* REPRODUCTOR: fijo, no se mueve */}
          <div className="w-full lg:flex-1 lg:h-full relative bg-black flex flex-col shrink-0">
            <div key={activeChannel.id} className="absolute top-3 left-4 z-20 flex items-center gap-2 sm:gap-3 bg-black/80 px-3 py-1.5 rounded-md backdrop-blur-md text-xs border border-gray-800 max-w-[90%] truncate shadow-lg">
              <span className="bg-red-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded animate-pulse shrink-0">EN VIVO</span>
              <span className="text-gray-200 font-bold truncate">{activeChannel.name} — {activeChannel.country}</span>
            </div>

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

            <div className="p-3 sm:p-4 bg-[#0a0a0a] border-t border-gray-900 flex items-center justify-between z-20 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-900 border border-gray-800 shrink-0 flex items-center justify-center text-[10px] font-black text-gray-200 overflow-hidden">
                  {activeChannel.shortCode || activeChannel.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-white truncate">{activeChannel.name}</h3>
                    <span className="hidden sm:inline-block text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">{activeChannel.country}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate">Emitiendo: <span className="text-gray-200 font-medium">{activeChannel.currentShow}</span></p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs bg-[#181818] px-3 py-1 rounded-lg text-gray-300 border border-gray-800 font-bold shrink-0 ml-2">{activeChannel.category}</span>
            </div>
          </div>

          {/* GUIA DE CANALES: solo esto hace scroll */}
          <div className="w-full lg:w-80 flex-1 min-h-0 lg:flex-none lg:h-full bg-[#0d0d0d] border-t lg:border-t-0 lg:border-l border-gray-900 flex flex-col">
            <div className="p-3 sm:p-4 border-b border-gray-900 space-y-2 sm:space-y-3 bg-[#0a0a0a] shrink-0">
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

              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                {["Todos", "Perú", "Chile", "Argentina", "Bolivia", "Italia", "España", "Ecuador", "Deportes"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSelectedCountryFilter(filter)}
                    className={\`px-2.5 py-1 rounded-md font-semibold transition whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 \${selectedCountryFilter === filter ? "bg-green-500 text-black font-bold" : "bg-[#161616] text-gray-400 hover:text-white border border-gray-800"}\`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-4 scrollbar-thin">
              {Object.entries(channelsGroupedByCountry).map(([countryName, channels]) => (
                <div key={countryName} className="space-y-2">
                  <div className="sticky top-0 bg-[#0d0d0d] py-1.5 px-1 z-10 border-b border-gray-800/60 flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-green-400">{countryName}</h4>
                    <span className="text-[10px] bg-gray-900 text-gray-400 px-2 py-0.5 rounded-full font-bold">{channels.length}</span>
                  </div>

                  <div className="space-y-1.5">
                    {channels.map((ch) => (
                      <div
                        key={ch.id}
                        onClick={() => setActiveChannel(ch)}
                        tabIndex={0}
                        className={\`p-2.5 rounded-xl flex items-center gap-3 cursor-pointer transition border focus:outline-none focus:ring-2 focus:ring-green-500 \${activeChannel.id === ch.id ? "bg-[#1c1c1c] border-green-500/80 shadow-md shadow-green-950/30" : "hover:bg-[#151515] border-transparent"}\`}
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
      )}

      `;

const ini = src.indexOf("{/* VISTA TV EN VIVO");
const fin = src.indexOf("{/* VISTA MI LISTA */}");
if (ini === -1 || fin === -1 || fin < ini) {
  console.log("  [FALLO] Vista de TV (no encontre los marcadores)");
  fallos++;
} else {
  src = src.slice(0, ini) + NUEVO_TV + src.slice(fin);
  console.log("  [OK]    Vista de TV (reproductor fijo + lista con scroll)");
}

if (fallos > 0) {
  console.log("\nHubo " + fallos + " cambio(s) que no se pudieron aplicar. NO se modifico tu archivo.");
  console.log("Tu codigo original sigue intacto. Mandame este mensaje y lo reviso.");
  process.exit(1);
}

if (usesCRLF) src = src.replace(/\n/g, "\r\n");
fs.writeFileSync(file, src);
console.log("\nListo. Ahora ejecuta: npm run dev");
console.log("Si algo sale mal, restaura con:  copy app\\page.tsx.backup app\\page.tsx");
