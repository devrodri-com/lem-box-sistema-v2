// src/lib/searchTokens.ts

/**
 * Normaliza texto: uppercase, trim, remueve espacios
 */
export function normalizeText(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Genera n-gramas únicos de un string
 * @param s - String de entrada
 * @param min - Longitud mínima del n-grama (default: 3)
 * @param max - Longitud máxima del n-grama (default: 8)
 * @returns Array de n-gramas únicos
 */
export function ngrams(s: string, min: number = 3, max: number = 8): string[] {
  const normalized = normalizeText(s);
  if (!normalized) return [];

  const tokens = new Set<string>();
  const len = normalized.length;

  // Generar n-gramas de longitud min a max
  for (let n = min; n <= max && n <= len; n++) {
    for (let i = 0; i <= len - n; i++) {
      const token = normalized.slice(i, i + n);
      if (token.length >= min) {
        tokens.add(token);
      }
    }
  }

  return Array.from(tokens);
}

/**
 * Construye tokens para un tracking number
 * @param tracking - Número de tracking
 * @returns Objeto con tracking normalizado y tokens
 */
export function buildTrackingTokens(tracking: string): {
  trackingNorm: string;
  trackingTokens: string[];
} {
  const trackingNorm = normalizeText(tracking);
  const trackingTokens = ngrams(trackingNorm, 3, 8);
  return {
    trackingNorm,
    trackingTokens,
  };
}

/**
 * Construye tokens para un cliente (name, code, email)
 * Genera tokens por palabras + prefijos 3..8
 * @param name - Nombre del cliente
 * @param code - Código del cliente
 * @param email - Email del cliente
 * @returns Array de tokens únicos
 */
export function buildClientTokens(
  name?: string,
  code?: string,
  email?: string
): string[] {
  const tokens = new Set<string>();

  // Procesar name
  if (name) {
    const nameNorm = normalizeText(name);
    if (nameNorm) {
      // Tokens por palabras completas
      const words = nameNorm.split(/\s+/).filter((w) => w.length > 0);
      words.forEach((word) => {
        if (word.length >= 3) {
          tokens.add(word);
          // Prefijos 3..8 de cada palabra
          for (let n = 3; n <= 8 && n <= word.length; n++) {
            tokens.add(word.slice(0, n));
          }
        }
      });
      // N-gramas del nombre completo
      ngrams(nameNorm, 3, 8).forEach((token) => tokens.add(token));
    }
  }

  // Procesar code
  if (code) {
    const codeNorm = normalizeText(code);
    if (codeNorm) {
      tokens.add(codeNorm);
      // Prefijos 3..8 del código
      for (let n = 3; n <= 8 && n <= codeNorm.length; n++) {
        tokens.add(codeNorm.slice(0, n));
      }
      // N-gramas del código
      ngrams(codeNorm, 3, 8).forEach((token) => tokens.add(token));
    }
  }

  // Procesar email (solo la parte antes del @)
  if (email) {
    const emailNorm = normalizeText(email);
    if (emailNorm) {
      const emailLocal = emailNorm.split("@")[0];
      if (emailLocal) {
        tokens.add(emailLocal);
        // Prefijos 3..8 del email local
        for (let n = 3; n <= 8 && n <= emailLocal.length; n++) {
          tokens.add(emailLocal.slice(0, n));
        }
        // N-gramas del email local
        ngrams(emailLocal, 3, 8).forEach((token) => tokens.add(token));
      }
    }
  }

  return Array.from(tokens);
}

