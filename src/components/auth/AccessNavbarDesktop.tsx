// src/components/auth/AccessNavbarDesktop.tsx
"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { Instagram } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

export default function AccessNavbarDesktop() {
  const navStyle: CSSProperties & { ["--nav-h"]?: string } = {
    ["--nav-h"]: "80px",
  };

  return (
    <header
      role="banner"
      className={[
        "fixed inset-x-0 top-0 z-[100]",
        "bg-[#02120f]",
        "h-20 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] border-b border-white/10",
      ].join(" ")}
      style={navStyle}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link
          href="https://lem-box.com"
          aria-label="Ir a LEM-BOX"
          className="inline-flex items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618]"
        >
          <img
            src="/logo.png"
            alt="LEM-BOX"
            className="transition-all duration-200 h-10 md:h-12 w-auto"
          />
        </Link>

        {/* Links UY / AR */}
        <nav aria-label="Accesos país" className="hidden md:block">
          <ul className="flex items-center gap-4 lg:gap-6">
            <li>
              <a
                href="https://lem-box.com.uy"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-2 rounded-lg text-[15px] font-medium text-white/90 no-underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618]"
              >
                Uruguay
              </a>
            </li>
            <li>
              <a
                href="https://lem-box.com.ar"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-2 rounded-lg text-[15px] font-medium text-white/90 no-underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618]"
              >
                Argentina
              </a>
            </li>
          </ul>
        </nav>

        {/* IG + WhatsApp */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="https://www.instagram.com/lem_box/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram de LEM-BOX"
            className="inline-flex items-center justify-center p-2 rounded-md text-white/90 no-underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#005f40]/40 transition"
            title="Instagram"
          >
            <Instagram className="w-5 h-5" />
          </a>
          <a
            href="https://wa.me/17544653318"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp de LEM-BOX"
            className="inline-flex items-center justify-center p-2 rounded-md text-white/90 no-underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#005f40]/40 transition"
            title="WhatsApp"
          >
            <FaWhatsapp className="w-5 h-5" />
          </a>
        </div>
      </div>
    </header>
  );
}