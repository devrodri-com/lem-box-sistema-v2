import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Desbloquea el build en Vercel aunque haya warnings/errores de ESLint
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
