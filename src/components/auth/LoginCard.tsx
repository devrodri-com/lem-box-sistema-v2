import { btnPrimary, btnSecondary, inputCls } from "./styles";

interface LoginCardProps {
  email: string;
  setEmail: (value: string) => void;
  pw: string;
  setPw: (value: string) => void;
  saving: boolean;
  err: string;
  msg: string;
  onSubmit: (e: React.FormEvent) => void;
  onForgot: () => void;
  onCreateAccount: () => void;
}

export default function LoginCard({
  email,
  setEmail,
  pw,
  setPw,
  saving,
  err,
  msg,
  onSubmit,
  onForgot,
  onCreateAccount,
}: LoginCardProps) {
  return (
    <div className="w-full max-w-[520px] rounded-2xl bg-white text-neutral-900 p-6 md:p-8 shadow-xl ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">Iniciar sesión</h2>
      <p className="text-xs text-neutral-500">
        Usá las credenciales que recibiste de LEM-BOX o creá tu cuenta.
      </p>

      {err ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {msg}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-5 grid gap-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-neutral-600">Email</span>
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
          />
        </label>

        <label className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">
              Contraseña
            </span>
            <button
              type="button"
              onClick={onForgot}
              className="text-xs underline text-sky-700 hover:text-sky-800"
            >
              Olvidé mi contraseña
            </button>
          </div>
          <input
            className={inputCls}
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCreateAccount}
            className={btnSecondary}
          >
            Crear cuenta
          </button>
          <button
            type="submit"
            disabled={saving}
            className={btnPrimary}
          >
            {saving ? "Ingresando…" : "Ingresar"}
          </button>
        </div>
      </form>
    </div>
  );
}

