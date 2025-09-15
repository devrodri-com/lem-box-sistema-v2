// src/app/login/page.tsx
"use client";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      location.href = "/admin/ingreso";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">Ingresar</h1>
        <input
          className="w-full border rounded p-3"
          placeholder="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full border rounded p-3"
          type="password"
          placeholder="contraseña"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        {err ? <p className="text-red-600 text-sm">{err}</p> : null}
        <button
          disabled={loading}
          className="w-full bg-black text-white rounded p-3 disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}