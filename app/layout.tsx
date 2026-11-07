import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cineverso Mágico",
  description: "Tu plataforma de streaming en vivo, películas y series",
  manifest: "/manifest.json",
};

// themeColor y viewport deben ir aquí (no dentro de metadata) en Next.js moderno.
// viewportFit "cover" permite que la barra inferior respete el área segura del iPhone.
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
    >
      <body className="min-h-full flex flex-col bg-[#050505] text-white w-full">
        {children}
      </body>
    </html>
  );
}
