// src/app/acceder/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const btnPrimary =
  "inline-flex items-center justify-center h-11 px-5 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnSecondary =
  "inline-flex items-center justify-center h-11 px-5 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "h-11 w-full rounded-md border border-slate-300 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40]";

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!email || !pw) { setErr("Completá email y contraseña."); return; }
    setSaving(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
      try {
        const tok = await cred.user.getIdTokenResult(true);
        const claims = (tok?.claims ?? {}) as Record<string, unknown>;
        const claimRole = typeof claims["role"] === "string" ? (claims["role"] as string) : undefined;
        const isAdmin = Boolean(claims["superadmin"] === true || claimRole === "admin" || claimRole === "superadmin");
        if (isAdmin) { router.replace("/admin/ingreso"); return; }
        const snap = await getDoc(doc(db, "users", cred.user.uid));
        const role = snap.exists() ? ((snap.data() as { role?: string }).role) : undefined;
        router.replace(role === "admin" || role === "superadmin" ? "/admin/ingreso" : "/mi");
      } catch {
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
    <main className="min-h-[100dvh] flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-md ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold">Acceder</h1>
        <p className="text-sm text-neutral-600">Entrá para ver tus trackings, cajas y envíos.</p>

        {err ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
        ) : null}
        {msg ? (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-neutral-600">Email</span>
            <input className={inputCls} type="email" value={email} onChange={(e)=>setEmail(e.target.value)} autoFocus autoComplete="email" />
          </label>
          <label className="grid gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-600">Contraseña</span>
              <button type="button" onClick={handleForgot} className="text-xs underline text-sky-700 hover:text-sky-800">Olvidé mi contraseña</button>
            </div>
            <input className={inputCls} type="password" value={pw} onChange={(e)=>setPw(e.target.value)} autoComplete="current-password" />
          </label>

          <div className="mt-2 flex gap-2">
            <button type="button" onClick={()=>router.push("/registro")} className={btnSecondary}>Crear cuenta</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "Ingresando…" : "Ingresar"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}