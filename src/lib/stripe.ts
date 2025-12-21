// src/lib/stripe.ts
import Stripe from "stripe";

// No lanzar error aquí - validar en el handler del endpoint
// Esto evita que Next.js devuelva HTML de error al importar el módulo
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
    }
    stripeInstance = new Stripe(secretKey, {
      typescript: true,
    });
  }
  return stripeInstance;
}

// Exportar getter lazy para compatibilidad con código existente
// Solo se inicializa cuando se llama, no al importar el módulo
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripe()[prop as keyof Stripe];
  },
});
export default stripe;

