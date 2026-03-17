"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page"><section className="card">Cargando...</section></div>}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });
  const [openReset, setOpenReset] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function onSubmit(values: FormData) {
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Credenciales inválidas");
      return;
    }

    const from = params.get("from") || "/panel";
    router.push(from);
  }

  return (
    <div className="page">
      <section className="card" style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <form onSubmit={handleSubmit(onSubmit)} className="form">
          <div className="page-header">
            <h1 className="page-title">Iniciar sesión</h1>
            <p className="page-subtitle">Acceso con usuario y contraseña.</p>
          </div>
          <label className="field">
            <span className="label">Usuario</span>
            <input className="input" {...register("username")} />
            {errors.username && <span className="error">{errors.username.message}</span>}
          </label>
          <label className="field">
            <span className="label">Contraseña</span>
            <input
              className="input"
              type="password"
              {...register("password")}
            />
            {errors.password && <span className="error">{errors.password.message}</span>}
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading} className="button">
            {loading ? "Validando..." : "Entrar"}
          </button>
          <button type="button" className="nav-link" onClick={() => setOpenReset(true)}>
            ¿Olvidaste tu contraseña?
          </button>
        </form>
      </section>

      {openReset && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 className="page-title" style={{ fontSize: "1.4rem" }}>Restablecer contraseña</h2>
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                setResetMessage(null);
                const res = await fetch("/api/auth/reset", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ identifier: resetIdentifier }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setResetMessage(data?.error || "No se pudo restablecer");
                  return;
                }
                setResetMessage(data?.message || "Contraseña enviada al correo.");
                setResetIdentifier("");
              }}
            >
              <label className="field">
                <span className="label">Usuario o correo</span>
                <input className="input" value={resetIdentifier} onChange={(e) => setResetIdentifier(e.target.value)} required />
              </label>
              {resetMessage && <p className="muted">{resetMessage}</p>}
              <div style={{ display: "flex", gap: 12 }}>
                <button className="button" type="submit">Enviar contraseña</button>
                <button className="nav-link" type="button" onClick={() => setOpenReset(false)}>Cerrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
