// Un sitio HTTPS no puede reproducir enlaces http:// (contenido mixto). Esos canales se sirven
// a través de /api/stream, que los descarga en el servidor y los devuelve por HTTPS.
export const proxyUrl = (u: string) => `/api/stream?url=${encodeURIComponent(u)}`;
export const needsProxy = (u: string) =>
  typeof window !== "undefined" && window.location.protocol === "https:" && /^http:\/\//i.test(u);
