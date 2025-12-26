// src/components/inbounds/PhotoGalleryModal.tsx
// Modal para ver fotos de inbounds (compatibilidad legacy photoUrl + nuevo photoUrls)
"use client";
import { useEffect, useState } from "react";

type PhotoGalleryModalProps = {
  photoUrls: string[];
  initialIndex?: number;
  tracking?: string;
  onClose: () => void;
};

export function PhotoGalleryModal({
  photoUrls,
  initialIndex = 0,
  tracking,
  onClose,
}: PhotoGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Sincronizar currentIndex cuando cambia initialIndex
  useEffect(() => {
    setCurrentIndex(Math.max(0, Math.min(initialIndex, photoUrls.length - 1)));
  }, [initialIndex, photoUrls.length]);

  // Navegación con teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((prev) => Math.min(photoUrls.length - 1, prev + 1));
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [onClose, photoUrls.length]);

  const currentPhoto = photoUrls[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < photoUrls.length - 1;

  const handlePrevious = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(photoUrls.length - 1, prev + 1));
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!currentPhoto) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div className="w-[95vw] max-w-4xl rounded-xl bg-[#071f19] border border-[#1f3f36] ring-1 ring-white/10 shadow-xl p-4 md:p-6 text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            {tracking && (
              <h3 className="text-xl font-semibold text-white">TRACKING: {tracking}</h3>
            )}
            <p className="text-sm text-white/60 mt-1">
              Foto {currentIndex + 1} de {photoUrls.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#005f40] transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Imagen central */}
        <div className="relative">
          <img
            src={currentPhoto}
            alt={`Foto ${currentIndex + 1} del tracking ${tracking || ""}`}
            className="w-full max-h-[80vh] object-contain rounded-md border border-[#1f3f36] bg-[#0f2a22] ring-1 ring-white/10"
          />

          {/* Botón anterior */}
          {hasPrevious && (
            <button
              onClick={handlePrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full border border-[#1f3f36] bg-black/60 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-[#005f40] transition-colors"
              aria-label="Foto anterior"
            >
              ←
            </button>
          )}

          {/* Botón siguiente */}
          {hasNext && (
            <button
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full border border-[#1f3f36] bg-black/60 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-[#005f40] transition-colors"
              aria-label="Foto siguiente"
            >
              →
            </button>
          )}
        </div>

        {/* Footer con botón abrir en nueva pestaña */}
        <div className="mt-4 flex justify-center">
          <a
            href={currentPhoto}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] transition-colors"
          >
            Abrir en nueva pestaña
          </a>
        </div>
      </div>
    </div>
  );
}

