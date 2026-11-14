import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TvSupport from "./TvSupport";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // cv-meta-v2: datos para Google, Facebook, WhatsApp y X
  metadataBase: new URL("https://www.cineversomagico.com"),
  title: "Cineverso Mágico",
  description: "Películas, series y TV en vivo gratis 🍿 Estrenos, sagas completas, reseñas y una comunidad para pedir lo que quieras ver.",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    url: "https://www.cineversomagico.com",
    siteName: "Cineverso Mágico",
    locale: "es_PE",
    title: "Cineverso Mágico · Películas, series y TV en vivo",
    description: "Estrenos, sagas completas, reseñas y una comunidad para pedir lo que quieras ver. ¡Entra gratis! 🍿",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cineverso Mágico · Películas, series y TV en vivo",
    description: "Estrenos, sagas completas, reseñas y una comunidad para pedir lo que quieras ver. ¡Entra gratis! 🍿",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ background: "#050505" }}
    >
      <body className="min-h-full flex flex-col bg-[#050505] text-white w-full">
        <TvSupport />
        {children}
      </body>
    </html>
  );
}