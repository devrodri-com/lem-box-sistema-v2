// src/components/Footer.tsx
export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#02120f] text-white/50 text-xs">
      <div className="container mx-auto px-4 py-4 text-center">
        {/* Línea 1 */}
        <div className="block sm:inline">
          © {new Date().getFullYear()} LEM-BOX. Todos los derechos reservados.
        </div>

        {/* Separador solo en desktop */}
        <span className="hidden sm:inline"> · </span>

        {/* Línea 2 */}
        <div className="block sm:inline">
          Made with Next.js by{" "}
          <a
            href="https://www.devrodri.com"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-white/80 hover:text-white hover:brightness-110 transition-colors"
          >
            Rodrigo Opalo
          </a>
        </div>
      </div>
    </footer>
  );
}