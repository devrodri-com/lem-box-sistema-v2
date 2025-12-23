import { btnPrimary } from "./styles";

const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;

const inputClsDark =
  "h-11 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]";

const btnSecondaryDark =
  "inline-flex items-center justify-center h-11 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";

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
    <div className="w-full rounded-xl bg-[#071f19] border border-[#1f3f36] ring-1 ring-white/10 shadow-sm p-6 text-white">
      <h2 className="text-lg font-semibold text-white">Iniciar sesión</h2>
      <p className="text-xs text-white/70">
        Usá las credenciales que recibiste de LEM-BOX o creá tu cuenta.
      </p>

      {err ? (
        <div className="mt-4 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div className="mt-4 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {msg}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-5 grid gap-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-white/70">Email</span>
          <input
            className={inputClsDark}
            style={INPUT_BG_STYLE}
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
            <span className="text-xs font-medium text-white/70">
              Contraseña
            </span>
            <button
              type="button"
              onClick={onForgot}
              className={btnSecondaryDark}
            >
              Olvidé mi contraseña
            </button>
          </div>
          <input
            className={inputClsDark}
            style={INPUT_BG_STYLE}
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
            className={btnSecondaryDark}
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

