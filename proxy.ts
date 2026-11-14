import { NextResponse } from "next/server";

// cv-security-headers: protecciones del navegador para Cineverso Mágico
// - Nadie puede meter tu página dentro de otra web para engañar a la gente (clickjacking)
// - El navegador no "adivina" tipos de archivo peligrosos
// - No se filtra la dirección completa a otras webs
// - Cámara, ubicación y pagos bloqueados (el micrófono solo para la búsqueda por voz)
export function proxy() {
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|avatares/).*)"],
};
