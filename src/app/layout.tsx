// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConditionalNav } from "@/components/ConditionalNav";
import { Footer } from "@/components/Footer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LEM-BOX Sistema V2",
  description: "Ingreso de paquetes, armado de cajas y portal de clientes",
  icons: {
    icon: "/icons/favicon.ico",
    shortcut: "/icons/favicon.ico",
    apple: "/icons/apple-icon-180x180.png",
  },
  manifest: "/icons/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-neutral-900`}>
        {/* Barra fija superior - condicional según ruta */}
        <ConditionalNav />
        {/* Contenido con padding para no quedar bajo la barra */}
        <div className="pt-16">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
