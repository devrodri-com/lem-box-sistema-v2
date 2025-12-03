// src/components/auth/AccessNavbarMobile.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Instagram } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { createPortal } from "react-dom";

export default function AccessNavbarMobile() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="md:hidden fixed inset-x-0 top-0 z-[100] h-16 bg-[#005f40]/10 backdrop-blur-xl backdrop-saturate-150 border-b border-white/10">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="https://lem-box.com" aria-label="Ir a LEM-BOX" className="inline-flex items-center">
          <img src="/logo.png" alt="LEM-BOX" className="h-9 w-auto" />
        </Link>

        {/* Trigger */}
        <button
          type="button"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center justify-center size-10 rounded-lg bg-white/10 text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#eb6618]/40"
        >
          <span className="sr-only">Menú</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {open ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Panel */}
      {open && mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-[#0f1a17] text-white flex flex-col" role="dialog" aria-modal="true">
            <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
              <Link href="https://lem-box.com" aria-label="Ir a LEM-BOX" className="inline-flex items-center" onClick={() => setOpen(false)}>
                <img src="/logo.png" alt="LEM-BOX" className="h-9 w-auto" />
              </Link>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center size-10 rounded-lg bg-white/15 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#eb6618]/40"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav aria-label="Navegación móvil" className="flex-1 overflow-y-auto">
              <ul className="flex flex-col p-4 gap-0.5">
                <li>
                  <a
                    href="https://lem-box.com.uy"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="block w-full px-3 py-3 rounded-xl text-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618]"
                  >
                    Uruguay
                  </a>
                </li>
                <li>
                  <a
                    href="https://lem-box.com.ar"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="block w-full px-3 py-3 rounded-xl text-white hover:bg_white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618]"
                  >
                    Argentina
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.instagram.com/lem_box/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-3 rounded-xl text-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618]"
                  >
                    <Instagram className="w-5 h-5" />
                    Instagram
                  </a>
                </li>
                <li>
                  <a
                    href="https://wa.me/17544653318"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-3 rounded-xl text-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618]"
                  >
                    <FaWhatsapp className="w-5 h-5" />
                    WhatsApp
                  </a>
                </li>
              </ul>
            </nav>
          </div>,
          document.body
        )
      }
    </header>
  );
}