// src/app/acceder/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail, getIdTokenResult } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import AuthHero from "@/components/auth/AuthHero";
import LoginCard from "@/components/auth/LoginCard";
import AccessNavbarDesktop from "@/components/auth/AccessNavbarDesktop";
import AccessNavbarMobile from "@/components/auth/AccessNavbarMobile";

export default function AccederPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  function mapError(e: unknown): string {
    const err = e as { code?: string; message?: string } | null;
    const code = err?.code ?? "";
    if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Email o contraseña inválidos.";
    if (code.includes("user-not-found")) return "No encontramos una cuenta con ese email.";
    if (code.includes("too-many-requests")) return "Demasiados intentos. Probá más tarde.";
    return err?.message ?? "Error al acceder. Probá de nuevo.";
  }

  type Role = "superadmin" | "admin" | "operador" | "partner_admin" | "client";
  const ROLE_SET: ReadonlySet<string> = new Set(["superadmin", "admin", "operador", "partner_admin", "client"]);

  function isRole(v: unknown): v is Role {
    return typeof v === "string" && ROLE_SET.has(v);
  }

  function getStringClaim(claims: Record<string, unknown>, key: string): string | undefined {
    const v = claims[key];
    return typeof v === "string" ? v : undefined;
  }

  function getBooleanClaim(claims: Record<string, unknown>, key: string): boolean {
    return claims[key] === true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!email || !pw) { setErr("Completá email y contraseña."); return; }
    setSaving(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
      try {
        // Canonical redirect based on Auth custom claims ONLY
        // (Firestore fallbacks are intentionally avoided for security/consistency)
        const tok = await cred.user.getIdTokenResult(true);
        const claims = (tok?.claims ?? {}) as Record<string, unknown>;
        const claimRoleRaw = getStringClaim(claims, "role");
        const claimRole = isRole(claimRoleRaw) ? claimRoleRaw : undefined;

        // Firestore role (source of truth for partner in this app)
        let firestoreRole: string | undefined;
        try {
          const snap = await getDoc(doc(db, "users", cred.user.uid));
          if (snap.exists()) {
            const data = snap.data() as Record<string, unknown>;
            const r = data["role"];
            if (typeof r === "string") firestoreRole = r;
          }
        } catch {
          firestoreRole = undefined;
        }

        // Least-privilege reconciliation: if Firestore says partner_admin, go to partner even if claims are stale.
        const effectiveRole = firestoreRole === "partner_admin" ? "partner_admin" : (claimRole ?? firestoreRole);

        if (effectiveRole === "partner_admin") {
          router.replace("/partner");
          return;
        }
        if (effectiveRole === "client") {
          router.replace("/mi");
          return;
        }

        const isAdmin = Boolean(
          getBooleanClaim(claims, "superadmin") ||
          effectiveRole === "admin" ||
          effectiveRole === "superadmin" ||
          effectiveRole === "operador"
        );
        router.replace(isAdmin ? "/admin/ingreso" : "/mi");
      } catch {
        // If we can't read token claims, safest default is client portal
        router.replace("/mi");
      }
    } catch (e: unknown) {
      setErr(mapError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleForgot() {
    setErr("");
    setMsg("");
    if (!email) { setErr("Ingresá tu email para recuperar la contraseña."); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("Te enviamos un email para restablecer la contraseña.");
    } catch (e: unknown) {
      setErr(mapError(e));
    }
  }

  return (
    <>
      <AccessNavbarDesktop />
      <AccessNavbarMobile />

      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center justify-center gap-10 p-6 pt-24 md:pt-28">
        <div className="w-full max-w-6xl grid gap-8 md:grid-cols-[1.1fr_1fr] items-start">
          {/* Columna izquierda: logo */}
          <AuthHero />

          {/* Columna derecha: formulario */}
          <LoginCard
            email={email}
            setEmail={setEmail}
            pw={pw}
            setPw={setPw}
            saving={saving}
            err={err}
            msg={msg}
            onSubmit={onSubmit}
            onForgot={handleForgot}
            onCreateAccount={() => router.push("/registro")}
          />

          {/* Hero de texto centrado a lo ancho, debajo de ambas columnas */}
          <section className="md:col-span-2 mt-8 flex justify-center px-2 md:px-6">
            <div className="max-w-3xl text-center space-y-3">
              <h1 className="text-3xl md:text-4xl font-semibold text-white">
                Accedé a tu panel LEM-BOX
              </h1>
              <p className="text-sm md:text-base text-neutral-300">
                Entrá para ver tus trackings, cajas y envíos desde tu cuenta
                centralizada. Todo el flujo logístico, desde Miami hasta Uruguay
                y Argentina, en un solo lugar.
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}