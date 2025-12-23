// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AdminNav from "@/components/AdminNav";
import { Footer } from "@/components/Footer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LEM-BOX Sistema V2",
  description: "Ingreso de paquetes, armado de cajas y portal de clientes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-neutral-900`}>
        {/* Barra fija superior */}
        <AdminNav />
        {/* Contenido con padding para no quedar bajo la barra */}
        <div className="pt-16">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
